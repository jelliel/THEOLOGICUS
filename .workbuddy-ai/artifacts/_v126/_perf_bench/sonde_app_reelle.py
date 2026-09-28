# -*- coding: utf-8 -*-
"""Sonde du moteur de rendu de l'APPLICATION REELLE.

IMPASSE VERIFIEE — CE SCRIPT NE MESURE RIEN. Il est conserve comme trace de la
limite, pas comme outil. Le pont evaluate_js de pywebview 6.2.1 est decore par
_shown_call, qui attend 20 s `events.shown` puis leve « Main window failed to
start ». Or la plateforme edgechromium ne pose JAMAIS events.shown (grep sur
tout le paquet webview : aucun `shown` dans platforms/edgechromium.py ; seuls
winforms.py, qt.py, gtk.py, cocoa.py, cef.py le posent). Tout evaluate_js sur
cette plateforme echoue donc, depuis n'importe quel fil. Verifie sur
pywebview 6.2.1, WebView2 153.0.4234.48.

Ce qui a effectivement mesure le moteur : sonde_processus_gpu.py (arbre de
processus) et, cote page, la fiche GPU de la v129 dans THEOLOGICUS.html.

Le reste du fichier garde son interet : il montre comment recuperer la fenetre
que app.py cree lui-meme (remplacement de webview.create_window) sans modifier
app.py.

Usage :
    python sonde_app_reelle.py                  # avec les drapeaux GPU
    python sonde_app_reelle.py --sans-drapeaux   # tel que livre aujourd'hui
"""
import argparse
import json
import os
import sys
import threading
import time

RACINE_DEPOT = os.path.abspath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "..")
)

ARGS_GPU = (
    "--ignore-gpu-blocklist "
    "--enable-gpu-rasterization "
    "--enable-zero-copy "
    "--enable-accelerated-2d-canvas"
)

# Le moteur de rendu se lit par l'extension WEBGL_debug_renderer_info. Sans
# elle, gl.RENDERER renvoie une chaine masquee du type "WebKit WebGL".
JS = r"""
(function () {
  var out = {
    ua: navigator.userAgent,
    coeurs: navigator.hardwareConcurrency,
    dpr: window.devicePixelRatio,
    page: location.href
  };
  var c = document.createElement('canvas');
  var gl = c.getContext('webgl2') || c.getContext('webgl');
  if (!gl) { out.webgl = false; return JSON.stringify(out); }
  out.webgl = true;
  out.webgl2 = !!c.getContext('webgl2');
  var d = gl.getExtension('WEBGL_debug_renderer_info');
  if (d) {
    out.constructeur = gl.getParameter(d.UNMASKED_VENDOR_WEBGL);
    out.moteur = gl.getParameter(d.UNMASKED_RENDERER_WEBGL);
  }
  out.renduMasque = gl.getParameter(gl.RENDERER);
  out.vendeurMasque = gl.getParameter(gl.VENDOR);
  out.versionGL = gl.getParameter(gl.VERSION);
  out.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  var m = String(out.moteur || '') + ' ' + String(out.renduMasque || '');
  out.logiciel = /swiftshader|software|llvmpipe|basic render/i.test(m);
  out.gpuNomme = /ANGLE|Direct3D|D3D11|NVIDIA|AMD|Radeon|Intel|Adreno|Mali|Apple/i.test(m);
  return JSON.stringify(out);
})()
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sans-drapeaux", action="store_true")
    ap.add_argument("--sortie", default=None)
    ap.add_argument("--delai", type=float, default=90.0)
    a = ap.parse_args()

    sys.path.insert(0, RACINE_DEPOT)

    import webview

    if not a.sans_drapeaux:
        import webview.platforms.edgechromium as ec

        Base = ec.CoreWebView2CreationProperties

        class _PropsGPU(Base):
            def __setattr__(self, nom, valeur):
                if nom == "AdditionalBrowserArguments" and isinstance(valeur, str):
                    if "ignore-gpu-blocklist" not in valeur:
                        valeur = (valeur + " " + ARGS_GPU).strip()
                return super().__setattr__(nom, valeur)

        ec.CoreWebView2CreationProperties = _PropsGPU
        print("[info] drapeaux GPU :", ARGS_GPU, flush=True)
    else:
        print("[info] drapeaux GPU : aucun", flush=True)

    # Interception : on recupere la fenetre que app.py cree lui-meme.
    boite = {}
    _create_window = webview.create_window

    def create_window(*args, **kwargs):
        fen = _create_window(*args, **kwargs)
        boite["fen"] = fen
        return fen

    webview.create_window = create_window

    resultat = {}

    def mesurer():
        fen = None
        for _ in range(240):
            fen = boite.get("fen")
            if fen is not None:
                break
            time.sleep(0.25)
        if fen is None:
            print("[X] app.py n'a pas cree de fenetre", flush=True)
            os._exit(3)

        # On ne s'appuie PAS sur events.loaded : verifie sur piece, cet
        # evenement ne se declenche pas de facon fiable quand on l'attend
        # depuis un fil de travail (attente de 90 s sans jamais se lever alors
        # que la page se charge). On interroge la page directement : des que
        # evaluate_js renvoie quelque chose, le document est la.
        # evaluate_js depuis ce fil est le mode prevu par pywebview : la requete
        # est renvoyee au fil GUI et la reponse arrive par un semaphore.
        fin = time.time() + a.delai
        essai = 0
        while time.time() < fin and not resultat:
            essai += 1
            try:
                brut = fen.evaluate_js(JS)
                if brut:
                    resultat.update(json.loads(brut))
                    break
            except Exception as e:
                if essai in (1, 5, 15):
                    print("[!] essai", essai, "->", e, flush=True)
            time.sleep(1.0)

        if not resultat:
            print("[X] aucune reponse de la page", flush=True)
            os._exit(5)

        print("=" * 68, flush=True)
        print("MOTEUR DE RENDU DE L'APPLICATION REELLE (app.py + WebView2)", flush=True)
        print("=" * 68, flush=True)
        print("  page              :", resultat.get("page"), flush=True)
        print("  constructeur      :", resultat.get("constructeur"), flush=True)
        print("  moteur (renderer) :", resultat.get("moteur"), flush=True)
        print("  rendu masque      :", resultat.get("renduMasque"), flush=True)
        print("  version WebGL     :", resultat.get("versionGL"), flush=True)
        print("  WebGL2            :", resultat.get("webgl2"), flush=True)
        print("  logiciel ?        :", resultat.get("logiciel"), flush=True)
        print("  GPU identifie ?   :", resultat.get("gpuNomme"), flush=True)
        print("  coeurs CPU        :", resultat.get("coeurs"), flush=True)
        verdict = ("GPU MATERIEL" if (resultat.get("gpuNomme") and not resultat.get("logiciel"))
                   else "RENDU LOGICIEL (CPU)")
        print("-" * 68, flush=True)
        print("  VERDICT :", verdict, flush=True)
        print("=" * 68, flush=True)

        if a.sortie:
            with open(a.sortie, "w", encoding="utf-8") as f:
                json.dump({"drapeaux": "aucun" if a.sans_drapeaux else ARGS_GPU,
                           "rapport": resultat}, f, ensure_ascii=False, indent=2)
            print("[ok] rapport ->", a.sortie, flush=True)

        time.sleep(0.3)
        os._exit(0)

    threading.Thread(target=mesurer, daemon=True).start()

    import app
    return app.main()


if __name__ == "__main__":
    sys.exit(main())
