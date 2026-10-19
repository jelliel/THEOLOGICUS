package com.theologicus.app;

import android.net.wifi.WifiManager;
import android.net.DhcpInfo;
import android.text.TextUtils;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.URL;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.Enumeration;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * v58 — NetBridge : expose l'IP de la passerelle Wi-Fi et l'IP locale du
 * telephone au JavaScript, pour la decouverte automatique d'un serveur
 * LibreTranslate heberge sur le PC (outils/start_libretranslate.py,
 * ecoute sur 0.0.0.0:5000 du reseau local).
 *
 * v611 — httpRequest : TRANSPORT NATIF DE SECOURS pour les appels API.
 * Sur l'APK il n'y a pas de relais local : les requetes partent du WebView
 * (Origin https://localhost, User-Agent WebView, en-tetes Sec-Fetch-*), ce
 * que le WAF de certains fournisseurs refuse par 403 alors que la cle est
 * valide. Cette methode rejoue la requete en NATIF (HttpURLConnection) :
 * aucun en-tete de navigateur n'est envoye, donc plus de blocage WAF/CORS.
 * Le JS ne l'appelle QU'EN SECOURS (403 ou echec reseau) afin de ne pas
 * degrader le streaming normal.
 */
@CapacitorPlugin(name = "NetBridge")
public class NetBridgePlugin extends Plugin {

    @PluginMethod
    public void httpRequest(PluginCall call) {
        final String url = call.getString("url");
        if (url == null || url.trim().isEmpty()) {
            call.reject("url manquante");
            return;
        }
        final String method = call.getString("method", "GET") == null
                ? "GET" : call.getString("method", "GET").toUpperCase(Locale.US);
        final JSObject headersIn = call.getObject("headers", new JSObject());
        final String body = call.getString("body");
        final Integer timeoutIn = call.getInt("timeout", 30000);
        final int timeout = (timeoutIn == null || timeoutIn < 1000) ? 30000 : timeoutIn;

        getBridge().execute(() -> {
            HttpURLConnection cnx = null;
            try {
                cnx = (HttpURLConnection) new URL(url).openConnection();
                cnx.setRequestMethod(method);
                cnx.setConnectTimeout(timeout);
                cnx.setReadTimeout(timeout);
                cnx.setInstanceFollowRedirects(true);
                cnx.setUseCaches(false);
                /* identity : pas de gzip a decoder (le corps est renvoye tel quel) */
                cnx.setRequestProperty("Accept-Encoding", "identity");

                boolean uaFourni = false;
                if (headersIn != null) {
                    Iterator<String> it = headersIn.keys();
                    while (it.hasNext()) {
                        String k = it.next();
                        String v = headersIn.optString(k, null);
                        if (k == null || v == null) continue;
                        String kl = k.toLowerCase(Locale.US);
                        /* en-tetes de transport geres par la pile : ne pas les forcer */
                        if (kl.equals("host") || kl.equals("connection") || kl.equals("content-length")
                                || kl.equals("accept-encoding") || kl.equals("origin")
                                || kl.equals("referer") || kl.equals("cookie")) continue;
                        if (kl.equals("user-agent")) uaFourni = true;
                        cnx.setRequestProperty(k, v);
                    }
                }
                if (!uaFourni) cnx.setRequestProperty("User-Agent", "THEOLOGICUS/4.0 (Android)");

                if (body != null && !method.equals("GET") && !method.equals("HEAD")) {
                    byte[] octets = body.getBytes(StandardCharsets.UTF_8);
                    cnx.setDoOutput(true);
                    cnx.setFixedLengthStreamingMode(octets.length);
                    OutputStream os = cnx.getOutputStream();
                    os.write(octets);
                    os.flush();
                    os.close();
                }

                int code = cnx.getResponseCode();
                InputStream is = null;
                try {
                    is = (code >= 400) ? cnx.getErrorStream() : cnx.getInputStream();
                } catch (Exception e) {
                    is = cnx.getErrorStream();
                }
                StringBuilder sb = new StringBuilder();
                if (is != null) {
                    BufferedReader br = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
                    char[] buf = new char[8192];
                    int n;
                    while ((n = br.read(buf)) > 0) sb.append(buf, 0, n);
                    br.close();
                }

                JSObject out = new JSObject();
                out.put("status", code);
                JSObject h = new JSObject();
                Map<String, List<String>> champs = cnx.getHeaderFields();
                if (champs != null) {
                    for (Map.Entry<String, List<String>> e : champs.entrySet()) {
                        if (e.getKey() == null || e.getValue() == null) continue;
                        h.put(e.getKey().toLowerCase(Locale.US), TextUtils.join(", ", e.getValue()));
                    }
                }
                out.put("headers", h);
                out.put("body", sb.toString());
                call.resolve(out);
            } catch (Exception e) {
                call.reject("transport natif : " + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()));
            } finally {
                if (cnx != null) cnx.disconnect();
            }
        });
    }

    @PluginMethod
    public void gateway(PluginCall call) {
        JSObject out = new JSObject();
        String gw = "";
        try {
            WifiManager wm = (WifiManager) bridge.getContext().getApplicationContext()
                    .getSystemService(android.content.Context.WIFI_SERVICE);
            if (wm != null) {
                DhcpInfo dhcp = wm.getDhcpInfo();
                if (dhcp != null && dhcp.gateway != 0) {
                    gw = ipToString(dhcp.gateway);
                }
            }
        } catch (Exception e) {
            // pas de Wi-Fi / permission : on renvoie vide, le JS a ses replis
        }
        out.put("gateway", gw);
        out.put("localIp", localIpv4());
        call.resolve(out);
    }

    private static String ipToString(int addr) {
        // DhcpInfo renvoie l'IP en little-endian selon les versions :
        // on normalise avant l'assemblage.
        if (ByteOrder.nativeOrder() == ByteOrder.LITTLE_ENDIAN) {
            addr = Integer.reverseBytes(addr);
        }
        byte[] b = new byte[]{
                (byte) ((addr >> 24) & 0xFF),
                (byte) ((addr >> 16) & 0xFF),
                (byte) ((addr >> 8) & 0xFF),
                (byte) (addr & 0xFF)
        };
        try {
            return InetAddress.getByAddress(b).getHostAddress();
        } catch (Exception e) {
            return "";
        }
    }

    private static String localIpv4() {
        try {
            Enumeration<NetworkInterface> nis = NetworkInterface.getNetworkInterfaces();
            while (nis.hasMoreElements()) {
                NetworkInterface ni = nis.nextElement();
                if (!ni.isUp() || ni.isLoopback()) continue;
                Enumeration<InetAddress> addrs = ni.getInetAddresses();
                while (addrs.hasMoreElements()) {
                    InetAddress a = addrs.nextElement();
                    if (a instanceof Inet4Address && !a.isLoopbackAddress()) {
                        return a.getHostAddress();
                    }
                }
            }
        } catch (Exception e) {
            // ignore
        }
        return "";
    }
}
