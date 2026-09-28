# -*- coding: utf-8 -*-
"""Sonde du moteur de rendu REEL de WebView2 (pas Chromium generique).

But : repondre par MESURE a « est-ce que la version Windows utilise mon GPU ? »
sur la pile exacte que l'application livree utilise : pywebview -> WebView2
(Edge Chromium) -> ANGLE/D3D11.

Pourquoi une fenetre pywebview et pas Chromium/Playwright : le moteur de rendu
depend de la pile graphique reellement installee et des drapeaux reellement
passees a WebView2. Mesurer Chromium ne prouve rien sur WebView2.

Pourquoi js_api et pas evaluate_js : un appel evaluate_js depuis un autre fil
que le fil GUI ne recoit jamais l'evenement `loaded` de pywebview
(« Main window failed to start »). Le pont js_api, lui, est fait pour ca : le
JS de la page appelle Python et le resultat arrive sur un fil de travail.

Usage :
    python sonde_gpu_webview2.py                 # avec drapeaux GPU
    python sonde_gpu_webview2.py --sans-drapeaux  # tel que pywebview par defaut
    python sonde_gpu_webview2.py --sortie rapport.json
"""
import argparse
import json
import os
import sys
import threading
import time

ARGS_GPU = (
    "--ignore-gpu-blocklist "
    "--enable-gpu-rasterization "
    "--enable-zero-copy "
    "--enable-accelerated-2d-canvas"
)

PAGE = r"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>sonde</title></head>
<body style="font:13px monospace;background:#111;color:#ddd;padding:12px">
<pre id="o">mesure en cours...</pre>
<script>
function texte(id){ return document.getElementById(id); }

function infosGPU() {
  var r = { ua: navigator.userAgent, coeurs: navigator.hardwareConcurrency,
            memoire: navigator.deviceMemory || null, dpr: window.devicePixelRatio };
  var c = document.createElement('canvas');
  var gl = c.getContext('webgl2') || c.getContext('webgl') ||
           c.getContext('experimental-webgl');
  if (!gl) { r.webgl = false; return r; }
  r.webgl = true;
  r.webgl2 = !!c.getContext('webgl2');
  var dbg = gl.getExtension('WEBGL_debug_renderer_info');
  if (dbg) {
    r.constructeur = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL);
    r.moteur = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
  }
  r.renduMasque = gl.getParameter(gl.RENDERER);
  r.version = gl.getParameter(gl.VERSION);
  r.vendeurMasque = gl.getParameter(gl.VENDOR);
  r.antialiasing = !!gl.getContextAttributes().antialias;
  r.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
  // Rendu logiciel = pas de GPU. ANGLE/D3D11/NVIDIA/AMD/Intel = GPU.
  var m = (r.moteur || '') + ' ' + (r.renduMasque || '');
  r.logiciel = /swiftshader|software|llvmpipe|basic render/i.test(m);
  r.gpuNomme = /ANGLE|Direct3D|D3D11|NVIDIA|AMD|Radeon|Intel|Adreno|Mali|Apple/i.test(m);
  return r;
}

// Mesure de debit : images de composition (degrades + rotations + alpha).
// PIEGE VERIFIE : une fenetre WebView2 non visible (occultee, hors ecran) ne
// recoit PAS de requestAnimationFrame. Le rapport ne doit donc JAMAIS dependre
// du banc : on envoie les infos GPU d'abord, le banc ensuite s'il aboutit.
function bancDeVue(images) {
  return new Promise(function (res) {
    var cv = document.createElement('canvas');
    cv.width = 900; cv.height = 600;
    cv.style.cssText = 'position:fixed;left:0;top:0;opacity:0.01;pointer-events:none';
    document.body.appendChild(cv);
    var g = cv.getContext('2d');
    var n = 0, t0 = 0, temps = [], fini = false;
    function conclure(partiel) {
      if (fini) return;
      fini = true;
      try { cv.remove(); } catch (e) {}
      if (!n) { res({ images: 0, note: 'requestAnimationFrame muet (fenetre non visible)' }); return; }
      temps.sort(function (a, b) { return a - b; });
      res({ images: n, partiel: !!partiel,
            msTotal: Math.round(performance.now() - t0),
            msMedian: +temps[Math.floor(n / 2)].toFixed(2),
            msP95: +temps[Math.floor(n * 0.95)].toFixed(2),
            msMax: +temps[n - 1].toFixed(2) });
    }
    setTimeout(function () { conclure(true); }, 5000);   // garde-fou
    function image(ts) {
      if (fini) return;
      if (!t0) t0 = ts;
      var t = performance.now();
      g.clearRect(0, 0, 900, 600);
      for (var i = 0; i < 120; i++) {
        g.save();
        g.translate((i * 37) % 900, (i * 53) % 600);
        g.rotate(n * 0.02 + i);
        g.globalAlpha = 0.5;
        var rad = g.createRadialGradient(0, 0, 0, 0, 0, 40);
        rad.addColorStop(0, 'hsl(' + ((i * 7 + n * 3) % 360) + ',70%,60%)');
        rad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = rad;
        g.beginPath(); g.arc(0, 0, 40, 0, 6.283); g.fill();
        g.restore();
      }
      temps.push(performance.now() - t);
      n++;
      if (n < images) requestAnimationFrame(image); else conclure(false);
    }
    requestAnimationFrame(image);
  });
}

window.addEventListener('pywebviewready', function () {
  var r = infosGPU();
  // 1) l'essentiel part tout de suite : le moteur de rendu.
  window.pywebview.api.rapport(JSON.stringify(r));
  // 2) le banc vient apres, en meilleur effort.
  bancDeVue(60).then(function (b) { window.pywebview.api.banc(JSON.stringify(b)); });
});
</script></body></html>
"""


class Api:
    def __init__(self, sortie):
        self.sortie = sortie
        self.rapport = None
        self.banc = None
        self.fini = threading.Event()
        self.banc_pret = threading.Event()

    def rapport(self, charge):
        """Appele par la page. Renvoie une chaine : pywebview serialise le retour."""
        try:
            self.rapport = json.loads(charge)
        except Exception as e:
            print("[X] charge illisible :", e)
        self.fini.set()
        return "recu"

    def banc(self, charge):
        try:
            self.banc = json.loads(charge)
        except Exception as e:
            print("[X] banc illisible :", e)
        self.banc_pret.set()
        return "recu"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sans-drapeaux", action="store_true")
    ap.add_argument("--sortie", default=None)
    ap.add_argument("--attente", type=float, default=45.0)
    a = ap.parse_args()

    import webview
    import webview.platforms.edgechromium as ec

    if not a.sans_drapeaux:
        Base = ec.CoreWebView2CreationProperties

        class _PropsGPU(Base):
            def __setattr__(self, nom, valeur):
                if nom == "AdditionalBrowserArguments" and isinstance(valeur, str):
                    if "ignore-gpu-blocklist" not in valeur:
                        valeur = (valeur + " " + ARGS_GPU).strip()
                return super().__setattr__(nom, valeur)

        ec.CoreWebView2CreationProperties = _PropsGPU
        print("[info] drapeaux GPU :", ARGS_GPU)
    else:
        print("[info] drapeaux GPU : aucun (pywebview par defaut)")

    api = Api(a.sortie)
    fen = webview.create_window("sonde GPU", html=PAGE, js_api=api,
                                width=640, height=420, background_color="#111111")

    def surveiller():
        if api.fini.wait(a.attente):
            api.banc_pret.wait(8.0)     # le banc est un bonus, pas un prerequis
            time.sleep(0.35)
            try:
                fen.destroy()
            except Exception:
                pass
        else:
            print("[X] la page n'a pas rendu son rapport en", a.attente, "s")
            try:
                fen.destroy()
            except Exception:
                pass

    threading.Thread(target=surveiller, daemon=True).start()
    webview.start()

    r = api.rapport
    if not r:
        return 2

    print("=" * 68)
    print("MOTEUR DE RENDU DE WEBVIEW2")
    print("=" * 68)
    print("  constructeur      :", r.get("constructeur"))
    print("  moteur (renderer) :", r.get("moteur"))
    print("  rendu masque      :", r.get("renduMasque"))
    print("  version WebGL     :", r.get("version"))
    print("  WebGL2            :", r.get("webgl2"))
    print("  logiciel ?        :", r.get("logiciel"))
    print("  GPU identifie ?   :", r.get("gpuNomme"))
    print("  coeurs CPU        :", r.get("coeurs"))
    b = api.banc or r.get("banc") or {}
    if b:
        print("  banc images       :", b.get("images"), "| median", b.get("msMedian"),
              "ms | p95", b.get("msP95"), "ms | total", b.get("msTotal"), "ms",
              ("(" + b["note"] + ")") if b.get("note") else "")
    print("-" * 68)
    verdict = ("GPU MATERIEL" if (r.get("gpuNomme") and not r.get("logiciel"))
               else "RENDU LOGICIEL (CPU)")
    print("  VERDICT :", verdict)
    print("=" * 68)

    if a.sortie:
        with open(a.sortie, "w", encoding="utf-8") as f:
            json.dump({"drapeaux": "aucun" if a.sans_drapeaux else ARGS_GPU,
                       "rapport": r, "banc": api.banc}, f,
                      ensure_ascii=False, indent=2)
        print("[ok] rapport ecrit ->", a.sortie)

    return 0 if (r.get("gpuNomme") and not r.get("logiciel")) else 1


if __name__ == "__main__":
    sys.exit(main())
