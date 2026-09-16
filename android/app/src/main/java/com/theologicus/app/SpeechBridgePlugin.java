package com.theologicus.app;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.widget.Toast;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.Locale;

/**
 * v54 — pont vocal natif :
 *  - speak/stop/status : TextToSpeech Android (moteur du telephone).
 *  - listenStart/listenStop : SpeechRecognizer IN-APP (pas le panneau plein
 *    ecran) -> resultats PARTIELS en direct pendant l'appui, final au
 *    relachement. Pousse les evenements sur le canal "speech" :
 *      { text, final:false }  partiel        { text, final:true }  final
 *      { error:"6" }          timeout/silence (6=no-speech, 7=no match)
 */
@CapacitorPlugin(name = "SpeechBridge", permissions = {
        @Permission(strings = { android.Manifest.permission.RECORD_AUDIO }, alias = "micro")
})
public class SpeechBridgePlugin extends Plugin {

    /* ── TTS ── */
    private TextToSpeech tts;
    private volatile boolean ttsReady = false;
    private String pendingText = "";
    private float pendingRate = 1.0f;
    private float pendingPitch = 1.0f;

    private void doSpeak() {
        try {
            Bundle params = new Bundle();
            tts.setSpeechRate(pendingRate);
            tts.setPitch(pendingPitch);
            tts.speak(pendingText, TextToSpeech.QUEUE_FLUSH, params, "theo-" + System.nanoTime());
        } catch (Exception ignore) {}
    }

    private void setLang(String lang) {
        try {
            Locale loc = (lang != null && lang.toLowerCase().startsWith("en")) ? Locale.ENGLISH : Locale.FRENCH;
            tts.setLanguage(loc);
        } catch (Exception ignore) {}
    }

    @PluginMethod
    public void speak(final PluginCall call) {
        final String text = call.getString("text", "");
        if (text.trim().isEmpty()) { call.resolve(new JSObject().put("started", false)); return; }
        pendingText = text;
        Float rate = call.getFloat("rate");
        Float pitch = call.getFloat("pitch");
        pendingRate = rate != null ? rate : 1.0f;
        pendingPitch = pitch != null ? pitch : 1.0f;
        final String lang = call.getString("lang", "fr");

        if (tts == null) {
            final Activity act = bridge.getActivity();
            tts = new TextToSpeech(act.getApplicationContext(), new TextToSpeech.OnInitListener() {
                @Override
                public void onInit(int status) {
                    ttsReady = (status == TextToSpeech.SUCCESS);
                    if (ttsReady) { setLang(lang); doSpeak(); }
                }
            });
        } else if (ttsReady) {
            setLang(lang);
            doSpeak();
        }
        call.resolve(new JSObject().put("started", true));
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (tts != null) try { tts.stop(); } catch (Exception ignore) {}
        call.resolve();
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("tts", ttsReady);
        ret.put("speaking", tts != null && tts.isSpeaking());
        call.resolve(ret);
    }

    /* ── Dictée push-to-talk (SpeechRecognizer in-app) ── */
    private SpeechRecognizer recognizer;

    @PluginMethod
    public void listenStart(final PluginCall call) {
        final Activity act = bridge.getActivity();
        if (!SpeechRecognizer.isRecognitionAvailable(act.getApplicationContext())) {
            call.reject("no recognizer installed");
            return;
        }
        if (!hasPermission(android.Manifest.permission.RECORD_AUDIO)) {
            requestAllPermissions(call, "micStart");
            return;
        }
        startRecognizer(call);
    }

    @PermissionCallback
    private void micStart(PluginCall call) {
        if (call == null) return;
        if (hasPermission(android.Manifest.permission.RECORD_AUDIO)) startRecognizer(call);
        else call.reject("micro refuse");
    }

    private void startRecognizer(final PluginCall call) {
        final Activity act = bridge.getActivity();
        act.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    if (recognizer != null) { try { recognizer.destroy(); } catch (Exception ignore) {} }
                    recognizer = SpeechRecognizer.createSpeechRecognizer(act.getApplicationContext());

                    Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                    intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                    intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, call.getString("lang", "fr-FR"));
                    intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
                    intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);

                    recognizer.setRecognitionListener(new RecognitionListener() {
                        @Override public void onReadyForSpeech(Bundle params) {}
                        @Override public void onBeginningOfSpeech() {}
                        @Override public void onRmsChanged(float rmsdB) {}
                        @Override public void onBufferReceived(byte[] buffer) {}
                        @Override public void onEndOfSpeech() {}
                        @Override public void onEvent(int eventType, Bundle params) {}
                        @Override public void onPartialResults(Bundle partialResults) { emit(partialResults, false); }
                        @Override public void onResults(Bundle results) { emit(results, true); }
                        @Override public void onError(int error) {
                            JSObject r = new JSObject();
                            r.put("error", String.valueOf(error));
                            notifyListeners("speech", r);
                        }
                    });
                    lastEmitted = "";           /* v56 : reset anti-doublon par session */
                    lastWasFinal = false;
                    recognizer.startListening(intent);
                    call.resolve();
                } catch (Exception e) {
                    call.reject("listenStart failed: " + e.getMessage(), e);
                }
            }
        });
    }

    private void emit(Bundle bundle, boolean fin) {
        if (bundle == null) return;
        ArrayList<String> res = bundle.getStringArrayList(
                fin ? RecognizerIntent.EXTRA_RESULTS : RecognizerIntent.EXTRA_PARTIAL_RESULTS);
        if (res == null || res.isEmpty() || res.get(0).trim().isEmpty()) return;
        String text = res.get(0).trim();
        /* v56 — filtre anti-doublon cote natif : les moteurs reenvoient souvent
           le meme instantane (partiels repetes, final identique au dernier
           partiel, double onResults). On n'emettre que si le texte change,
           sauf passage partiel -> final. */
        if (text.equals(lastEmitted) && !(fin && !lastWasFinal)) return;
        lastEmitted = text;
        lastWasFinal = fin;
        JSObject r = new JSObject();
        r.put("text", text);
        r.put("final", fin);
        notifyListeners("speech", r);
    }

    private String lastEmitted = "";
    private boolean lastWasFinal = false;

    @PluginMethod
    public void listenStop(PluginCall call) {
        final SpeechRecognizer rec = recognizer;
        if (rec != null) {
            bridge.getActivity().runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try { rec.stopListening(); } catch (Exception ignore) {}
                }
            });
        }
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        if (tts != null) {
            try { tts.stop(); tts.shutdown(); } catch (Exception ignore) {}
            tts = null;
            ttsReady = false;
        }
        if (recognizer != null) {
            try { recognizer.destroy(); } catch (Exception ignore) {}
            recognizer = null;
        }
    }
}
