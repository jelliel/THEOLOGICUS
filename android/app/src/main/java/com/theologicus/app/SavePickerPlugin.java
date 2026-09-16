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

/**
 * v52 — « Enregistrer sous » natif : ouvre le sélecteur de répertoire Android
 * (SAF), écrit le backup dans le dossier choisi par l'utilisateur et affiche
 * un Toast de confirmation. Repli : dossier Download si le picker est annulé.
 *
 * NB : createDocument exige une URI de type DOCUMENT — on convertit l'URI
 * "tree" renvoyée par le sélecteur via buildDocumentUriUsingTree (écrire
 * directement dans l'URI tree échoue avec SecurityException/ Illinois).
 */
@CapacitorPlugin(name = "SavePicker")
public class SavePickerPlugin extends Plugin {

    private String pendingName = "theologicus-backup.json";
    private String pendingData = "";

    @PluginMethod
    public void saveAs(PluginCall call) {
        pendingName = call.getString("name", pendingName);
        pendingData = call.getString("data64", "");
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        try {
            startActivityForResult(call, intent, "pickDir");
        } catch (Exception e) {
            // pas de sélecteur dispo : on écrit dans Download directement
            writeToTree(call, null);
        }
    }

    @ActivityCallback
    private void pickDir(PluginCall call, ActivityResult result) {
        if (call == null) return; // activité détruite
        Uri tree = (result != null && result.getData() != null) ? result.getData().getData() : null;
        writeToTree(call, tree);
    }

    private void writeToTree(PluginCall call, Uri tree) {
        Activity act = bridge.getActivity();
        try {
            byte[] bytes = Base64.decode(pendingData, Base64.DEFAULT);

            Uri target = tree;
            if (target != null) {
                // l'URI du sélecteur est un TREE : la convertir en DOCUMENT racine
                target = DocumentsContract.buildDocumentUriUsingTree(
                        tree, DocumentsContract.getTreeDocumentId(tree));
            } else {
                // repli : Download public (pas de permission requise)
                target = Uri.parse("content://com.android.externalstorage.documents/document/primary%3ADownload");
            }

            Uri doc = DocumentsContract.createDocument(
                    act.getContentResolver(), target, "application/json", pendingName);
            if (doc == null) throw new IllegalStateException("createDocument a échoué");

            OutputStream os = act.getContentResolver().openOutputStream(doc);
            if (os == null) throw new IllegalStateException("openOutputStream null");
            os.write(bytes);
            os.flush();
            os.close();

            String where = (tree == null ? "Download" : "dossier choisi");
            JSObject ret = new JSObject();
            ret.put("ok", true);
            ret.put("uri", doc.toString());
            ret.put("display", where);
            if (act != null) {
                act.runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        Toast.makeText(act, "Backup enregistré : " + where, Toast.LENGTH_LONG).show();
                    }
                });
            }
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("save failed: " + e.getMessage(), e);
        }
    }
}
