package com.theologicus.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.widget.Toast;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * v51 — « Enregistrer sous » natif : ouvre le sélecteur de répertoire Android
 * (SAF), écrit le backup dans le dossier choisi par l'utilisateur et affiche
 * un Toast de confirmation. Repli : dossier Download si le picker est annulé.
 */
@CapacitorPlugin(name = "SavePicker")
public class SavePickerPlugin extends Plugin {

    private PluginCall pendingCall;
    private String pendingName = "theologicus-backup.json";
    private String pendingData = "";

    @PluginMethod
    public void saveAs(PluginCall call) {
        pendingCall = call;
        pendingName = call.getString("name", pendingName);
        pendingData = call.getString("data64", "");
        Activity act = bridge.getActivity();
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent.putExtra(Intent.EXTRA_INITIAL_URI, null);
        }
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
            byte[] bytes;
            try {
                bytes = Base64.decode(pendingData, Base64.DEFAULT);
            } catch (IllegalArgumentException e) {
                bytes = pendingData.getBytes(StandardCharsets.UTF_8);
            }

            Uri target = tree;
            if (target == null) {
                // repli : Download public (pas de permission requise)
                target = Uri.parse("content://com.android.externalstorage.documents/document/primary%3ADownload");
            }

            Uri doc = android.provider.DocumentsContract.createDocument(
                    act.getContentResolver(), target, "application/json", pendingName);
            if (doc == null) throw new IllegalStateException("createDocument a échoué");

            try (OutputStream os = act.getContentResolver().openOutputStream(doc)) {
                if (os == null) throw new IllegalStateException("openOutputStream null");
                os.write(bytes);
            }

            String where = (tree == null ? "Download" : "dossier choisi");
            JSObject ret = new JSObject();
            ret.put("ok", true);
            ret.put("uri", doc.toString());
            ret.put("display", where);
            notifyListeners("saved", ret);
            if (act != null) {
                act.runOnUiThread(() -> Toast.makeText(act,
                        "Backup enregistré : " + where, Toast.LENGTH_LONG).show());
            }
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("save failed: " + e.getMessage(), e);
        }
    }
}
