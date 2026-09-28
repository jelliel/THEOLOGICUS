# -*- coding: utf-8 -*-
"""Mesure la VRAIE WebView2 de THEOLOGICUS (moteur de rendu, calques, Hz).

Appele par diag_webview2.py avec l'URL WebSocket du point de debogage.
Utilise le client CDP maison (cdp_ws.py) : Node ne peut pas se connecter
directement a un port local dans ce bac a sable, Python si.
"""
import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cdp_ws import CDP  # noqa: E402

JS_GPU = r"""
(function () {
  var out = { dpr: window.devicePixelRatio, cores: navigator.hardwareConcurrency || 0,
              url: location.href, titre: document.title };
  try {
    var c = document.createElement('canvas');
    var gl2 = c.getContext('webgl2');
    var gl = gl2 || c.getContext('webgl');
    out.webgl2 = !!gl2;
    if (gl) {
      var ext = gl.getExtension('WEBGL_debug_renderer_info');
      out.vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
      out.renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      out.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    } else { out.erreur = 'aucun contexte WebGL'; }
  } catch (e) { out.erreur = String(e); }
  return JSON.stringify(out);
})()
"""

JS_APP = r"""
(function () {
  var c = document.getElementById('chat-container');
  var m = document.querySelector('#chat-container .message');
  var cs = m ? getComputedStyle(m) : null;
  return JSON.stringify({
    messages: document.querySelectorAll('#chat-container .message').length,
    willChange: cs ? cs.willChange : null,
    animation: cs ? cs.animationName : null,
    scrollBehavior: c ? getComputedStyle(c).scrollBehavior : null,
    calques_dom: document.querySelectorAll('[style*="will-change"]').length,
    canvas: document.querySelectorAll('canvas').length,
    noeuds: document.getElementsByTagName('*').length
  });
})()
"""

JS_HZ = r"""
new Promise(function (res) {
  var d = [], last = performance.now(), n = 0;
  function step() {
    var t = performance.now(); d.push(t - last); last = t; n++;
    if (n < 90) requestAnimationFrame(step);
    else { var s = d.slice(1).sort(function (a, b) { return a - b; });
           res(JSON.stringify({ mediane: s[Math.floor(s.length / 2)],
                                min: s[0], max: s[s.length - 1], n: s.length })); }
  }
  requestAnimationFrame(step);
})
"""


def main_ws(ws, attente_app=0.0):
    """Mesure en appel DIRECT (dans le processus appelant).

    On ne passe PAS par un sous-processus : le bac a sable autorise le
    processus parent a se connecter a 127.0.0.1:9222 mais refuse la meme
    connexion depuis un sous-processus (`WinError 10061`).

    Et on se connecte DES QUE le port repond : il cesse ensuite d'accepter de
    nouvelles connexions. C'est donc la session ouverte qui attend que
    l'application soit prete (`attente_app`), au lieu d'attendre avant de se
    connecter.
    """
    c = CDP(ws, timeout=30.0)
    c.connecter()
    c.appeler("Runtime.enable")

    # Ce que voit VRAIMENT la cible a laquelle on est attache.
    for expr, nom in (("location.href", "location.href"),
                      ("document.title", "titre"),
                      ("document.readyState", "readyState")):
        try:
            print("[cible] %-14s %s" % (nom, c.evaluer(expr)), flush=True)
        except Exception as e:
            print("[cible] %-14s [%s]" % (nom, str(e)[:90]), flush=True)

    # Attente de l'application PAR LA SESSION OUVERTE.
    fin = time.time() + max(attente_app, 0.0) + 45.0
    pret = False
    while time.time() < fin:
        try:
            etat = c.evaluer(
                "JSON.stringify({rs:document.readyState,"
                "app:typeof window.renderMessages==='function',"
                "chat:!!document.getElementById('chat-container')})")
            d = json.loads(etat)
            print("[attente] %s" % etat, flush=True)
            if d.get("chat") and d.get("app"):
                pret = True
                break
        except Exception as e:
            print("[attente] erreur %s" % str(e)[:110], flush=True)
        time.sleep(1.0)
    print("[info] application prete : %s" % pret, flush=True)
    if attente_app:
        time.sleep(attente_app)

    gpu = json.loads(c.evaluer(JS_GPU))
    print("\n-- Moteur de rendu de la WebView2 --")
    for k in ("vendor", "renderer", "webgl2", "maxTexture", "dpr", "cores", "erreur"):
        if k in gpu:
            print("  %-12s %s" % (k, gpu[k]))
    s = ((gpu.get("renderer") or "") + " " + (gpu.get("vendor") or "")).lower()
    logiciel = any(x in s for x in ("swiftshader", "software", "llvmpipe", "basic render"))
    verdict = ("RENDU LOGICIEL (pas de GPU)" if logiciel
               else ("GPU UTILISE" if gpu.get("renderer") else "indetermine"))
    print("  %-12s %s" % ("verdict", verdict))

    try:
        app = json.loads(c.evaluer(JS_APP))
    except Exception as e:
        app = {"erreur": str(e)}
    print("\n-- Etat de l'application --")
    for k in app:
        print("  %-16s %s" % (k, app[k]))

    hz = None
    try:
        hz = json.loads(c.evaluer(JS_HZ, attendre_promesse=True, timeout=30.0))
        print("  %-16s %.1f ms  -> ~%.0f Hz   (min %.1f / max %.1f sur %d images)"
              % ("ecart median", hz["mediane"], 1000.0 / hz["mediane"],
                 hz["min"], hz["max"], hz["n"]))
    except Exception as e:
        print("  [sonde Hz indisponible] " + str(e)[:120])

    calques = None
    try:
        c.appeler("LayerTree.enable")
        evs = c.collecter(1.6)
        couches = []
        for e in evs:
            if e.get("method") == "LayerTree.layerTreeDidChange":
                p = e.get("params") or {}
                if p.get("layers"):
                    couches = p["layers"]
        raisons = {}
        for l in couches[:400]:
            try:
                r = c.appeler("LayerTree.compositingReasons", {"layerId": l["layerId"]}, timeout=10)
                for x in (r.get("compositingReasons") or []):
                    raisons[x] = raisons.get(x, 0) + 1
            except Exception:
                pass
        calques = {"total": len(couches), "raisons": raisons}
        print("\n-- Calques de composition (WebView2) --")
        print("  total %d" % len(couches))
        for k, v in sorted(raisons.items(), key=lambda kv: -kv[1])[:7]:
            print("    %4d  %s" % (v, k))
    except Exception as e:
        print("\n[!] LayerTree indisponible : " + str(e)[:150])

    c.fermer()
    res = {"gpu": gpu, "app": app, "hz": hz, "calques": calques, "logiciel": logiciel}
    print("\nJSON " + json.dumps(res))
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("ws")
    a = ap.parse_args()
    main_ws(a.ws)
    return 0


if __name__ == "__main__":
    sys.exit(main())
