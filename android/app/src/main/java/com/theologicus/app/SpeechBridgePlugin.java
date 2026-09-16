package com.theologicus.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognizerIntent;
import android.speech.tts.TextToSpeech;
import android.widget.Toast;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.Locale;

/**
 * v53 — pont vocal natif :
 *  - speak/stop/status : TextToSpeech Android (moteur du telephone).
 *    Le WebView n'expose pas window.speechSynthesis ; le shim JS rebranche
 *    l'API standard sur ce plugin.
 *  - dictate : reconnaissance vocale via l'activity Google (RecognizerIntent),
 *    sans dependance externe ni cle API.
 */
@CapacitorPlugin(name = "SpeechBridge", permissions = {
        @Permission(strings = { android.Manifest.permission.RECORD_AUDIO }, alias = "micro")
})
public class SpeechBridgePlugin extends Plugin {

    private TextToSpeech tts;
    private volatile boolean ttsReady = false;
    private String pendingText = "";
    private float pendingRate = 1.0f;
    private float pendingPitch = 1.0f;
    private String pendingLang = "fr";

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
                    if (ttsReady) {
                        setLang(lang);
                        doSpeak();
                    }
                }
            });
        } else if (ttsReady) {
            setLang(lang);
            doSpeak();
        }
        /* reponse immediate : la synthese demarre en asynchrone (init moteur) */
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

    /** Dictee : panneau vocal Google (RecognizerIntent). */
    @PluginMethod
    public void dictate(final PluginCall call) {
        try {
            if (!hasPermission(android.Manifest.permission.RECORD_AUDIO)) {
                requestAllPermissions(call, "micResult");
                return;
            }
            launchRecognizer(call);
        } catch (Exception e) {
            call.reject("dictate failed: " + e.getMessage(), e);
        }
    }

    private void launchRecognizer(final PluginCall call) {
        Activity act = bridge.getActivity();
        try {
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                    RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "fr-FR");
            startActivityForResult(call, intent, "speechResult");
        } catch (ActivityNotFoundException e) {
            call.reject("no recognizer installed");
        }
    }

    @PermissionCallback
    private void micResult(PluginCall call) {
        if (call == null) return;
        if (hasPermission(android.Manifest.permission.RECORD_AUDIO)) {
            launchRecognizer(call);
        } else {
            call.reject("micro refuse");
        }
    }

    @ActivityCallback
    private void speechResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result == null || result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            JSObject ret = new JSObject();
            ret.put("text", "");
            ret.put("cancelled", true);
            call.resolve(ret);
            return;
        }
        ArrayList<String> res = result.getData().getStringArrayList(RecognizerIntent.EXTRA_RESULTS);
        JSObject ret = new JSObject();
        ret.put("text", res != null && !res.isEmpty() ? res.get(0) : "");
        call.resolve(ret);
    }

    @Override
    protected void handleOnDestroy() {
        if (tts != null) {
            try { tts.stop(); tts.shutdown(); } catch (Exception ignore) {}
            tts = null;
            ttsReady = false;
        }
    }
}
