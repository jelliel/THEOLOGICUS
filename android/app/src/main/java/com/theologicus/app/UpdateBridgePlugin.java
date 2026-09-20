package com.theologicus.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * v74 — UpdateBridge : telecharge une mise a jour et ouvre l'installateur.
 *
 * Le JavaScript ne peut pas installer d'APK lui-meme : le WebView n'a pas de
 * gestionnaire de telechargement et aucun navigateur externe n'est garanti.
 * On telecharge donc dans le cache de l'application, puis on passe la main au
 * programme d'installation du systeme via un intent ACTION_VIEW sur une URI
 * FileProvider (le fournisseur existe deja dans le manifeste).
 *
 * Android 8+ demande l'autorisation « installer des applications inconnues »
 * pour cette source : si elle n'est pas encore accordee, le systeme affiche
 * lui-meme l'ecran de demande. Elle reste valable pour les mises a jour
 * suivantes.
 */
@CapacitorPlugin(name = "UpdateBridge")
public class UpdateBridgePlugin extends Plugin {

    @PluginMethod
    public void install(PluginCall call) {
        final String url = call.getString("url");
        final String name = call.getString("name", "THEOLOGICUS-update.apk");
        if (url == null || url.isEmpty()) {
            call.reject("URL de mise a jour manquante");
            return;
        }

        new Thread(new Runnable() {
            @Override
            public void run() {
                HttpURLConnection conn = null;
                try {
                    File dir = new File(getContext().getCacheDir(), "update");
                    if (!dir.exists() && !dir.mkdirs()) {
                        throw new IOException("cache indisponible");
                    }
                    File out = new File(dir, name);
                    if (out.exists()) {
                        out.delete();
                    }

                    conn = (HttpURLConnection) new URL(url).openConnection();
                    conn.setInstanceFollowRedirects(true);
                    conn.setConnectTimeout(20000);
                    conn.setReadTimeout(120000);
                    conn.connect();
                    int code = conn.getResponseCode();
                    if (code < 200 || code >= 300) {
                        throw new IOException("HTTP " + code);
                    }

                    InputStream in = conn.getInputStream();
                    FileOutputStream fos = new FileOutputStream(out);
                    byte[] buf = new byte[65536];
                    int n;
                    long total = 0;
                    try {
                        while ((n = in.read(buf)) > 0) {
                            fos.write(buf, 0, n);
                            total += n;
                        }
                    } finally {
                        fos.close();
                        in.close();
                    }
                    /* Un APK pese des dizaines de Mo : un fichier plus petit
                       est une erreur ou une page d'erreur, pas une mise a jour. */
                    if (total < 1000000L) {
                        throw new IOException("fichier trop petit : " + total + " octets");
                    }

                    Intent intent = new Intent(Intent.ACTION_VIEW);
                    Uri uri = FileProvider.getUriForFile(
                            getContext(), getContext().getPackageName() + ".fileprovider", out);
                    intent.setDataAndType(uri, "application/vnd.android.package-archive");
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    getContext().startActivity(intent);

                    JSObject r = new JSObject();
                    r.put("ok", true);
                    r.put("bytes", total);
                    call.resolve(r);
                } catch (Exception e) {
                    call.reject("telechargement impossible : " + e.getMessage(), e);
                } finally {
                    if (conn != null) {
                        conn.disconnect();
                    }
                }
            }
        }).start();
    }

    /* Laisse l'interface expliquer pourquoi l'installation peut demander une
       autorisation, au lieu de laisser l'utilisateur devant un ecran inconnu. */
    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject o = new JSObject();
        boolean allowed = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                allowed = getContext().getPackageManager().canRequestPackageInstalls();
            } catch (Exception e) {
                allowed = false;
            }
        }
        o.put("allowed", allowed);
        call.resolve(o);
    }
}
