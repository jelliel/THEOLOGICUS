# -*- coding: utf-8 -*-
"""Lance THEOLOGICUS dans sa vraie WebView2, avec debogage distant ouvert,
puis laisse mesure_webview2.py (client CDP maison) interroger la page.

Deux choses a comprendre :

1. pywebview ECRIT props.AdditionalBrowserArguments (affectation), donc la
   variable d'environnement WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS est ecrasee.
   On remplace la classe de proprietes par une sous-classe dont le setter
   CONCATENE nos drapeaux — mecanisme verifie par test_args_gpu_webview2.py.

2. pywebview expose `REMOTE_DEBUGGING_PORT` dans ses settings, et l'ajoute aux
   arguments. C'est un canal independant de `evaluate_js` (dont l'evenement
   `loaded` ne se declenche pas quand on l'appelle depuis un autre fil).

La fenetre s'ouvre pour de vrai : c'est inevitable, WebView2 n'existe pas sans
fenetre. Le script la ferme a la fin.

Usage :
  <venv>\\Scripts\\python.exe diag_webview2.py [--dossier ...] [--port 9222]
                                              [--sans-gpu-args]
"""
import argparse
import os
import subprocess
import sys
import threading
import time
import urllib.request

DOSSIER_DEFAUT = r"C:\Theologicus\.workbuddy-ai\artifacts\_v123\_pub\installe"
# QUATRE « .. » : ce script est dans .workbuddy-ai/artifacts/_v126/_perf_bench/.
RACINE_DEPOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
NODE = os.environ.get(
    "BENCH_NODE", r"C:\Users\toshr\.workbuddy-ai\binaries\node\versions\22.22.2-3\node.exe")
NODE_PATH = r"C:\Users\toshr\.workbuddy-ai\binaries\node\workspace\node_modules"

ARGS_GPU = ("--ignore-gpu-blocklist --enable-gpu-rasterization "
            "--enable-zero-copy --enable-accelerated-2d-canvas")


def attendre_cdp(port, timeout=90.0):
    """Attend le point de debogage et rend l'URL WebSocket de la PAGE.

    Deux pieges mesures :
      * Playwright ajoute une barre oblique finale (`/json/version/`) et le
        point d'entree de WebView2 repond alors 502 — d'ou un client maison.
      * l'URL de `/json/version` est celle du NAVIGATEUR, qui ne connait pas
        `Runtime.enable` (erreur -32601). Il faut la cible PAGE, donnee par
        `/json/list`.
    """
    import json as _json
    fin = time.time() + timeout
    while time.time() < fin:
        try:
            with urllib.request.urlopen("http://127.0.0.1:%d/json/list" % port,
                                        timeout=1.5) as r:
                if r.status == 200:
                    cibles = _json.loads(r.read().decode("utf-8", "replace"))
                    # On EXIGE la page de l'application. La premiere cible
                    # « page » de WebView2 est `about:blank`, creee avant la
                    # navigation : s'y attacher donne un document vide, et la
                    # connexion tombe (10054) des que la navigation remplace
                    # la cible. Il faut attendre celle qui porte THEOLOGICUS.
                    for c in cibles:
                        if (c.get("type") == "page"
                                and "THEOLOGICUS" in (c.get("url") or "")
                                and c.get("webSocketDebuggerUrl")):
                            return c["webSocketDebuggerUrl"]
        except Exception:
            pass
        time.sleep(0.5)
    return None


def sonde_locale(port):
    """Connexion TCP DIRECTE (sans proxy) au port de debogage.

    Sert a trancher : si l'HTTP marche via le proxy mais qu'une connexion
    directe est refusee, le probleme est dans l'environnement (proxy du bac a
    sable), pas dans WebView2 — et aucune mesure par WebSocket n'est possible
    depuis cette session.
    """
    import socket as sk
    try:
        s = sk.create_connection(("127.0.0.1", port), timeout=3)
    except OSError as e:
        return "refusee (%s)" % e
    try:
        s.sendall(b"GET /json/version HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        d = s.recv(400)
        return "OK — " + d.split(b"\r\n")[0].decode("latin-1")
    except OSError as e:
        return "connectee mais echec d'echange (%s)" % e
    finally:
        s.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dossier", default=DOSSIER_DEFAUT)
    ap.add_argument("--port", type=int, default=9222)
    ap.add_argument("--sans-gpu-args", action="store_true")
    ap.add_argument("--attente-page", type=float, default=10.0)
    a = ap.parse_args()

    dossier = os.path.abspath(a.dossier)
    if not os.path.isfile(os.path.join(dossier, "THEOLOGICUS.html")):
        print("[X] THEOLOGICUS.html introuvable dans", dossier)
        return 1

    sys.path.insert(0, RACINE_DEPOT)
    import webview
    import webview.platforms.edgechromium as ec

    if a.sans_gpu_args:
        print("[info] mode CONTROLE : aucun drapeau GPU ajoute")
    else:
        Base = ec.CoreWebView2CreationProperties

        class _PropsGPU(Base):
            def __setattr__(self, nom, valeur):
                if (nom == "AdditionalBrowserArguments" and isinstance(valeur, str)
                        and "ignore-gpu-blocklist" not in valeur):
                    valeur = (valeur + " " + ARGS_GPU).strip()
                return super().__setattr__(nom, valeur)

        ec.CoreWebView2CreationProperties = _PropsGPU
        print("[info] drapeaux GPU ajoutes :", ARGS_GPU)

    webview.settings["REMOTE_DEBUGGING_PORT"] = a.port
    print("[info] debogage distant sur le port", a.port)

    import app as theo
    theo.app_dir = lambda: dossier
    os.environ.pop("THEOLOGICUS_NO_WINDOW", None)

    def mesurer():
        """Tourne sur un fil d'ARRIERE-PLAN : webview.start() doit occuper le
        fil principal (sinon « pywebview must be run on a main thread »)."""
        ws = attendre_cdp(a.port)
        if not ws:
            print("[X] le port de debogage n'a jamais repondu", flush=True)
            os._exit(2)
        print("[ok] WebView2 joignable — ws " + ws[:70] + "…", flush=True)
        print("[sonde] connexion directe (sans proxy) : " + sonde_locale(a.port), flush=True)
        # POURQUOI ON SE CONNECTE TOUT DE SUITE : le point de debogage repond
        # au debut puis REFUSE les nouvelles connexions (mesure : HTTP 200 a
        # t~8 s, WinError 10061 a t~20 s). Attendre sagement le chargement de
        # la page avant de se connecter rate donc la fenetre utile. On ouvre
        # la WebSocket des que le port repond, et c'est la session ouverte qui
        # sert ensuite a attendre que l'application soit prete.
        script = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                              "mesure_webview2.py")
        try:
            import importlib.util
            spec = importlib.util.spec_from_file_location("mesure_webview2", script)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            mod.main_ws(ws, attente_app=a.attente_page)
        except Exception as e:
            import traceback
            print("[X] mesure :", type(e).__name__, e, flush=True)
            traceback.print_exc()
        # On quitte franchement : la fenetre et les processus WebView2 partent
        # avec le processus, et l'appel a destroy() depuis un autre fil est
        # precisement ce qui ne marchait pas.
        os._exit(0)

    threading.Thread(target=mesurer, daemon=True).start()
    theo.main()          # fil principal : ouvre la fenetre et bloque
    return 0


if __name__ == "__main__":
    sys.exit(main())
