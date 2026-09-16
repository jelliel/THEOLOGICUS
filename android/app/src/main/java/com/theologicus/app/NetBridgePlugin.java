package com.theologicus.app;

import android.net.wifi.WifiManager;
import android.net.DhcpInfo;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.nio.ByteOrder;
import java.util.Enumeration;

/**
 * v58 — NetBridge : expose l'IP de la passerelle Wi-Fi et l'IP locale du
 * telephone au JavaScript, pour la decouverte automatique d'un serveur
 * LibreTranslate heberge sur le PC (outils/start_libretranslate.py,
 * ecoute sur 0.0.0.0:5000 du reseau local).
 */
@CapacitorPlugin(name = "NetBridge")
public class NetBridgePlugin extends Plugin {

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
