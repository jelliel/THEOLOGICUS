# -*- coding: utf-8 -*-
"""Diagnostic GPU de la VRAIE WebView2 de l'application.

Pourquoi ce script existe : on ne peut pas savoir si l'application utilise le
GPU en lisant le code. pywebview ne pose aucun drapeau qui le desactive, mais
Chromium peut basculer en rendu logiciel (SwiftShader) si le pilote figure sur
sa liste noire. La seule preuve est de demander a la page son moteur de rendu.

Le script :
  1. installe la sous-classe de proprietes qui AJOUTE les drapeaux GPU ;
  2. lance la fenetre reelle de THEOLOGICUS (pywebview + WebView2) ;
  3. interroge la page en WebGL (`WEBGL_debug_renderer_info`) ;
  4. mesure la frequence de rafraichissement reelle via requestAnimationFrame ;
  5. ferme la fenetre.

Une fenetre s'ouvre donc brievement : c'est inevitable, WebView2 n'existe pas
sans fenetre.

Usage :
  <venv>\\Scripts\\python.exe diag_gpu.py [--dossier C:\\chemin\\vers\\l\\app]
"""
import argparse
import json
import os
import sys
import threading
import time

DOSSIER_DEFAUT = r"C:\Theologicus\.workbuddy-ai\artifacts\_v123\_pub\installe"
# QUATRE « .. » : ce script vit dans .workbuddy-ai/artifacts/_v126/_perf_bench/.
# Avec trois, on remonte a .workbuddy-ai et `import app` echoue
# (ModuleNotFoundError) — deja rencontre sur les bancs de ce dossier.
RACINE_DEPOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))

sys.path.insert(0, RACINE_DEPOT)

JS = r"""
(function () {
  var out = { ua: navigator.userAgent, dpr: window.devicePixelRatio,
              cores: navigator.hardwareConcurrency || 0,
              w: window.innerWidth, h: window.innerHeight };
  try {
    var c = document.createElement('canvas');
    var gl2 = c.getContext('webgl2');
    var gl = gl2 || c.getContext('webgl') || c.getContext('experimental-webgl');
    out.webgl2 = !!gl2;
    if (!gl) { out.erreur = 'aucun contexte WebGL'; }
    else {
      var ext = gl.getExtension('WEBGL_debug_renderer_info');
      out.vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
      out.renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      out.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      out.maxRenderbuffer = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
    }
  } catch (e) { out.erreur = String(e); }
  return JSON.stringify(out);
})()
"""

JS_HZ = r"""
new Promise(function (resolve) {
  var d = [], last = performance.now(), n = 0;
  function step() {
    var now = performance.now(); d.push(now - last); last = now; n++;
    if (n < 90) requestAnimationFrame(step);
    else {
      d = d.slice(1).sort(function (a, b) { return a - b; });
      resolve(JSON.stringify({ mediane: d[Math.floor(d.length / 2)],
                               min: d[0], max: d[d.length - 1], n: d.length }));
    }
  }
  requestAnimationFrame(step);
});
"""

resultats = {}
erreurs = []


def mesurer(secondes_attente=8.0):
    import webview
    time.sleep(secondes_attente)
    try:
        w = webview.windows[0]
        try:
            resultats["webgl"] = json.loads(w.evaluate_js(JS))
        except Exception as e:
            erreurs.append("webgl: %s" % e)
        try:
            resultats["hz"] = json.loads(w.evaluate_js(JS_HZ))
        except Exception as e:
            erreurs.append("hz: %s" % e)
        try:
            resultats["drapeaux"] = w.evaluate_js(
                "navigator.userAgentData ? JSON.stringify(navigator.userAgentData.brands) : '[]'")
        except Exception:
            pass
    finally:
        try:
            webview.windows[0].destroy()
        except Exception:
            pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dossier", default=DOSSIER_DEFAUT)
    ap.add_argument("--attente", type=float, default=8.0)
    ap.add_argument("--sans-gpu-args", action="store_true",
                    help="ne pas ajouter les drapeaux GPU (mesure de controle)")
    a = ap.parse_args()

    dossier = os.path.abspath(a.dossier)
    if not os.path.isfile(os.path.join(dossier, "THEOLOGICUS.html")):
        print("[X] THEOLOGICUS.html introuvable dans", dossier)
        return 1

    import webview
    import webview.platforms.edgechromium as ec

    # 1. Ajout des drapeaux GPU (le mecanisme verifie par
    #    test_args_gpu_webview2.py : on CONCATENE, on n'ecrase pas).
    ARGS_GPU = ("--ignore-gpu-blocklist --enable-gpu-rasterization "
                "--enable-zero-copy --enable-accelerated-2d-canvas")
    Base = ec.CoreWebView2CreationProperties

    class _PropsGPU(Base):
        def __setattr__(self, nom, valeur):
            if (nom == "AdditionalBrowserArguments" and isinstance(valeur, str)
                    and "ignore-gpu-blocklist" not in valeur):
                valeur = (valeur + " " + ARGS_GPU).strip()
            return super().__setattr__(nom, valeur)

    if a.sans_gpu_args:
        print("[info] mode CONTROLE : aucun drapeau GPU ajoute")
    else:
        ec.CoreWebView2CreationProperties = _PropsGPU
        print("[info] drapeaux GPU ajoutes :", ARGS_GPU)

    # 2. Faire servir le dossier demande par app.py, et mesurer apres le demarrage.
    import app as theo

    theo.app_dir = lambda: dossier

    _start = webview.start

    def start_patche(func=None, *args, **kw):
        t = threading.Thread(target=mesurer, args=(a.attente,), daemon=True)
        t.start()
        return _start(func, *args, **kw)

    webview.start = start_patche

    # 3. Lancer. THEOLOGICUS_NO_WINDOW ne doit PAS etre pose : on veut la fenetre.
    os.environ.pop("THEOLOGICUS_NO_WINDOW", None)
    try:
        theo.main()
    except Exception as e:
        print("[X] lancement impossible :", type(e).__name__, e)
        return 1

    print("\n" + "=" * 68)
    print("DIAGNOSTIC GPU — WebView2 reelle de THEOLOGICUS")
    print("=" * 68)
    g = resultats.get("webgl") or {}
    hz = resultats.get("hz") or {}
    for k in ("vendor", "renderer", "webgl2", "maxTexture", "dpr", "cores", "w", "h", "erreur"):
        if k in g:
            print("  %-16s %s" % (k, g[k]))
    if hz:
        print("  %-16s %s ms  (min %s / max %s sur %s images)"
              % ("ecart median", hz.get("mediane"), hz.get("min"), hz.get("max"), hz.get("n")))
        m = hz.get("mediane") or 0
        if m:
            print("  %-16s ~%.0f Hz" % ("frequence", 1000.0 / m))
    for e in erreurs:
        print("  [!]", e)

    r = (g.get("renderer") or "") + " " + (g.get("vendor") or "")
    logiciel = any(x in r.lower() for x in ("swiftshader", "software", "llvmpipe", "basic render"))
    print("\n  VERDICT :", "RENDU LOGICIEL (pas de GPU)" if logiciel
          else ("GPU UTILISE" if g.get("renderer") else "indetermine"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
