package com.theologicus.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;
import android.widget.Toast;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * v65 — « Enregistrer sous » natif, par morceaux.
 *
 * v52 (avant) faisait passer TOUT le backup en base64 dans un seul `String`
 * gardé en mémoire pendant que le sélecteur SAF était affiché. Un backup
 * courant fait ~35 Mo : ~96 Mo de String (UTF-16) + ~36 Mo de byte[] au
 * décodage, par-dessus ce que le WebView détient déjà → OutOfMemoryError, et
 * l'application se fermait net au moment où l'utilisateur choisissait le
 * dossier. Le manifest n'a pas `largeHeap`, donc le plafond est celui par
 * défaut de l'appareil.
 *
 * Désormais :
 *   1. `saveAs({name})` ouvre le sélecteur SANS transporter de données.
 *   2. `pickDir` crée le document, ouvre le flux, rend un jeton.
 *   3. `writeChunk({token, data64})` écrit ~256 Ko à la fois.
 *   4. `finish({token})` ferme, affiche le Toast, rend le résultat.
 *
 * La table des sessions est STATIQUE pour survivre à une recréation
 * d'activité : le sélecteur SAF passe l'app en arrière-plan, Android peut
 * détruire l'activity pendant ce temps (le champ d'instance `pendingData`
 * de la v52 était alors perdu, ce qui écrivait un fichier vide).
 *
 * Si le sélecteur est annulé ou indisponible, on rend un jeton pointant vers
 * Download public : le repli reste possible sans nouvel aller-retour JS.
 */
@CapacitorPlugin(name = "SavePicker")
public class SavePickerPlugin extends Plugin {

    private static final class Session {
        final OutputStream os;
        final Uri doc;
        final String display;
        Session(OutputStream os, Uri doc, String display) {
            this.os = os; this.doc = doc; this.display = display;
        }
    }

    /* statique : survit à la recréation de l'activity (voir commentaire de classe) */
    private static final Map<String, Session> SESSIONS = new ConcurrentHashMap<>();
    private static final AtomicInteger SEQ = new AtomicInteger(0);
    /* statique : `saveAs` et `pickDir` peuvent s'exécuter sur deux instances
       distinctes du plugin si l'activity a été recréée entre-temps */
    private static String pendingName = "theologicus-backup.json";

    private static final String DOWNLOAD_URI =
            "content://com.android.externalstorage.documents/document/primary%3ADownload";

    @PluginMethod
    public void saveAs(PluginCall call) {
        pendingName = call.getString("name", pendingName);
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        try {
            startActivityForResult(call, intent, "pickDir");
        } catch (Exception e) {
            // pas de sélecteur disponible : on part directement sur Download
            openSession(call, null);
        }
    }

    @ActivityCallback
    private void pickDir(PluginCall call, ActivityResult result) {
        if (call == null) return;   // activité détruite, rien à rendre
        Uri tree = (result != null && result.getData() != null) ? result.getData().getData() : null;
        openSession(call, tree);
    }

    /**
     * Crée le document et ouvre le flux. `tree == null` → Download public.
     * Rend toujours soit `{token}` soit une erreur : jamais de promesse JS
     * laissée en suspens (bug silencieux de la v52).
     */
    private void openSession(PluginCall call, Uri tree) {
        Activity act = getActivity();
        if (act == null) { call.reject("activity indisponible"); return; }
        try {
            Uri target = tree;
            if (target != null) {
                // l'URI renvoyée par le sélecteur est un TREE : la convertir
                // en DOCUMENT racine (écrire dans l'URI tree échoue)
                target = DocumentsContract.buildDocumentUriUsingTree(
                        tree, DocumentsContract.getTreeDocumentId(tree));
            } else {
                target = Uri.parse(DOWNLOAD_URI);
            }

            Uri doc = DocumentsContract.createDocument(
                    act.getContentResolver(), target, "application/json", pendingName);
            if (doc == null) throw new IllegalStateException("createDocument a échoué");

            OutputStream os = act.getContentResolver().openOutputStream(doc);
            if (os == null) throw new IllegalStateException("openOutputStream null");

            String token = "s" + SEQ.incrementAndGet() + "_" + System.currentTimeMillis();
            SESSIONS.put(token, new Session(os, doc, tree == null ? "Download" : "dossier choisi"));

            JSObject ret = new JSObject();
            ret.put("token", token);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("open failed: " + e.getMessage(), e);
        }
    }

    /** Écrit un morceau (~256 Ko). Aucune allocation massive. */
    @PluginMethod
    public void writeChunk(PluginCall call) {
        String token = call.getString("token", "");
        String data64 = call.getString("data64", "");
        Session s = SESSIONS.get(token);
        if (s == null) { call.reject("session inconnue ou expirée"); return; }
        try {
            byte[] bytes = Base64.decode(data64, Base64.DEFAULT);
            s.os.write(bytes);
            JSObject ret = new JSObject();
            ret.put("ok", true);
            ret.put("written", bytes.length);
            call.resolve(ret);
        } catch (Exception e) {
            try { s.os.close(); } catch (Exception ignored) {}
            SESSIONS.remove(token);
            call.reject("write failed: " + e.getMessage(), e);
        }
    }

    /** Ferme le flux, confirme, nettoie la session. */
    @PluginMethod
    public void finish(PluginCall call) {
        String token = call.getString("token", "");
        Session s = SESSIONS.remove(token);
        if (s == null) { call.reject("session inconnue ou expirée"); return; }
        try {
            s.os.flush();
            s.os.close();
            toast("Backup enregistré : " + s.display);
            JSObject ret = new JSObject();
            ret.put("ok", true);
            ret.put("uri", s.doc.toString());
            ret.put("display", s.display);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("finish failed: " + e.getMessage(), e);
        }
    }

    /** Abandon : ferme et supprime le document créé. */
    @PluginMethod
    public void abort(PluginCall call) {
        String token = call.getString("token", "");
        Session s = SESSIONS.remove(token);
        if (s == null) { call.resolve(new JSObject()); return; }
        try { s.os.close(); } catch (Exception ignored) {}
        try {
            Activity act = getActivity();
            if (act != null) DocumentsContract.deleteDocument(act.getContentResolver(), s.doc);
        } catch (Exception ignored) {}
        call.resolve(new JSObject());
    }

    private void toast(final String msg) {
        Activity act = getActivity();
        if (act == null) return;
        act.runOnUiThread(new Runnable() {
            @Override public void run() {
                Toast.makeText(act, msg, Toast.LENGTH_LONG).show();
            }
        });
    }
}
