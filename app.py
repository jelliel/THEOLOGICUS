"""
THEOLOGICUS — Lanceur d'application Windows (pywebview)

Démarre le serveur local (fichiers + proxy IA de proxy_server.py)
puis ouvre THEOLOGICUS.html dans une vraie fenêtre Windows (WebView2).

Modes :
  python app.py                 -> fenêtre native (comportement normal)
  THEOLOGICUS_NO_WINDOW=1       -> serveur seul, sans fenêtre (diagnostic)
  python app.py --port 8900     -> port personnalisé (défaut : 8765)
"""

import os
import socket
import sys
import tempfile
import threading
import time
import urllib.request
from functools import partial
from http.server import ThreadingHTTPServer

import proxy_server


def app_dir() -> str:
    """Dossier contenant l'exe (mode figé) ou app.py (mode script)."""
    if getattr(sys, "frozen", False):  # PyInstaller
        return os.path.dirname(os.path.abspath(sys.executable))
    return os.path.dirname(os.path.abspath(__file__))


# v117 — POURQUOI CE BLOC EXISTE. L'origine d'une page est scheme://hote:port.
# Deux ports différents = deux origines = deux stockages navigateur distincts
# (localStorage, IndexedDB). L'ancien code faisait bind(("", 0)) : un port
# PSEUDO-ALÉATOIRE à chaque lancement dès que 8765 était occupé. La config
# (clé API, réglages, modèles, conversations) paraissait donc effacée à chaque
# ouverture — exactement le symptôme « je dois tout reconfigurer ».
# Désormais : port DÉTERMINISTE (8765, puis 8766, 8767...) et réutilisation
# d'une instance déjà lancée. Le port est enfin stable d'un lancement à l'autre.
#
# v119 — POURQUOI LE DÉMARRAGE ÉTAIT DEVENU LENT (mesuré : ~10,7 s).
# La v117 sondait CHAQUE port de la plage AVANT de démarrer, et le faisait deux
# fois par port : la sonde d'identité PUIS le contenu de THEOLOGICUS.html. Sur
# cette machine, un port de la plage qui n'est ni ouvert ni refusé (aucun RST)
# coûte le timeout ENTIER : 0,4 s. Mesure : 16 ports × (0,4 + 0,4) = 10,7 s.
# L'ancien code ne payait rien car il se contentait d'un bind (0,0 ms).
#
# Le correctif suit un principe simple : NE SONDER QUE CE QUI PEUT RÉPONDRE.
# Un bind réussi est une preuve INSTANTANÉE que le port est libre — donc on
# teste le bind d'abord et on ne sonde que les ports occupés. Et on ne sonde
# qu'UNE fois : le test HTML redondant censé couvrir « une instance d'une
# ancienne version du exe » coûtait aussi cher que le ping et ne servait que
# le temps d'une transition, désormais révolue (la v117 est publiée).
# Coût résultant : 1 bind (0 ms) + 1 sonde sur le seul port occupé (~20 ms).
PORT_SPAN = 16          # 8765 .. 8780
PING_TIMEOUT = 0.25     # la sonde ne sert qu'en local : inutile d'attendre 0,4 s


def port_range(preferred: int) -> list[int]:
    """Plage de ports candidate, déterministe et stable dans le temps."""
    return [preferred + i for i in range(PORT_SPAN)]


def _port_libre(port: int) -> bool:
    """Vrai si l'on peut s'y lier. Preuve instantanée : aucun délai réseau."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


def _est_notre_serveur(port: int) -> bool:
    """Vrai si un serveur THEOLOGICUS écoute déjà sur ce port.

    Appelée UNIQUEMENT sur un port occupé (donc un serveur répond : le coût
    est de quelques millisecondes, jamais un timeout). Un serveur étranger
    ne connaît pas la sonde et répond 404 → False.
    """
    try:
        with urllib.request.urlopen(
            f"http://127.0.0.1:{port}/__theologicus_ping", timeout=PING_TIMEOUT
        ) as r:
            return r.status == 200 and b"theologicus" in r.read(64)
    except Exception:
        return False


def resoudre_port(ports: list[int]):
    """Rend (port, instance_existante). Ne sonde QUE les ports occupés.

    Parcours de la plage dans l'ordre : au premier port libre on s'arrête
    immédiatement (0 ms). Un port occupé est sondé une seule fois — s'il est
    à nous, on réutilise l'instance (même origine, donc même configuration) ;
    sinon on continue. Coût typique : ~20 ms, contre ~10 700 ms en v117.
    """
    for p in ports:
        if _port_libre(p):
            return p, False
        if _est_notre_serveur(p):
            return p, True
    return None, False


def wait_up(port: int, timeout: float = 5.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                return True
        except OSError:
            time.sleep(0.1)
    return False


class DesktopApi:
    """API exposee au JavaScript sous `window.pywebview.api` (v74).

    Une seule methode pour l'instant : installer une mise a jour. Le
    JavaScript ne peut pas ecrire de fichier ni lancer de programme ; c'est
    donc Python qui telecharge l'installeur puis le lance, avant de fermer
    l'application pour que l'installation puisse ecraser les fichiers.
    """

    def install_update(self, url):
        """Telecharge l'installeur Windows et le lance.

        Leve une exception en cas d'echec : le JavaScript retombe alors sur
        l'ouverture de la page de telechargement dans le navigateur.
        """
        url = str(url or "").strip()
        if not url.startswith("https://"):
            raise ValueError("URL de mise a jour refusee : " + url[:80])

        name = os.path.basename(url.split("?")[0]) or "THEOLOGICUS-Setup-x64.exe"
        if not name.lower().endswith(".exe"):
            raise ValueError("Livrable inattendu : " + name)
        dest = os.path.join(tempfile.gettempdir(), name)

        with urllib.request.urlopen(url, timeout=120) as r:
            data = r.read()
        if len(data) < 1_000_000:
            raise ValueError("Fichier trop petit (%d octets)" % len(data))
        with open(dest, "wb") as f:
            f.write(data)

        # os.startfile est propre a Windows, ce qui est le cas ici.
        os.startfile(dest)  # noqa: S606 - lanceur d'installateur voulu

        # On ferme l'application juste apres : l'installeur doit pouvoir
        # ecraser les fichiers en cours d'utilisation.
        def fermer():
            try:
                import webview
                if webview.windows:
                    webview.windows[0].destroy()
            except Exception:
                pass

        threading.Timer(2.0, fermer).start()
        return {"ok": True, "bytes": len(data), "path": dest}


def main() -> int:
    base = app_dir()
    os.chdir(base)  # répertoire courant = dossier de l'exe / du script

    if getattr(sys, "frozen", False):
        # Mode exe sans console : les erreurs partent dans THEOLOGICUS.log
        try:
            logf = open(os.path.join(base, "THEOLOGICUS.log"), "a", encoding="utf-8")
            logf.reconfigure(line_buffering=True)
            sys.stdout = logf
            sys.stderr = logf
        except Exception:
            pass

    ports = port_range(proxy_server.PORT)
    httpd = None

    # v117 — réutiliser l'instance déjà lancée GARANTIT la même origine, donc
    # la même clé API et la même configuration. Deux fenêtres sur deux ports
    # donnaient deux stockages distincts : c'était le bug.
    # v119 — et le faire SANS sonder les ports libres : voir resoudre_port().
    port, deja_lancee = resoudre_port(ports)
    if port is None:
        print(f"[X] Aucun port libre entre {ports[0]} et {ports[-1]}. "
              f"Fermez l'application ou libérez un port.", file=sys.stderr)
        return 1

    url = f"http://127.0.0.1:{port}/THEOLOGICUS.html"
    if deja_lancee:
        print(f"[OK] Instance THEOLOGICUS déjà en écoute sur le port {port} "
              f"— réutilisée (même origine, même configuration).")
    else:
        proxy_server.SERVE_DIR = base  # les fichiers statiques sont à côté de l'exe
        handler = partial(proxy_server.CORSProxyHandler, directory=base)
        httpd = ThreadingHTTPServer(("127.0.0.1", port), handler)
        httpd.daemon_threads = True

        server_thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        server_thread.start()

        # v117 — tracer le port : sans lui, le symptôme était indiagnosticable.
        print(f"[OK] Serveur local démarré sur le port {port} — origine {url}")
        if port != ports[0]:
            print(f"[!] Le port {ports[0]} était occupé : repli sur {port}. "
                  f"Ce repli est déterministe, il sera le même au prochain "
                  f"lancement — mais si l'occupant change, l'origine changera "
                  f"et la configuration du navigateur (pas les clés, elles sont "
                  f"hors installation) sera perdue.", file=sys.stderr)
        if not wait_up(port):
            print("[X] Le serveur local n'a pas démarré.", file=sys.stderr)
            return 1

    if os.environ.get("THEOLOGICUS_NO_WINDOW"):
        print(f"[OK] Serveur prêt : {url}  (Ctrl+C pour arrêter)")
        try:
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            pass
        finally:
            if httpd is not None:
                httpd.shutdown()
        return 0

    try:
        import webview  # pywebview
    except ImportError:
        print("[X] pywebview manquant : pip install pywebview", file=sys.stderr)
        if httpd is not None:
            httpd.shutdown()
        return 1

    # Icône : fichier à côté du script ; en mode exe, pywebview extrait
    # automatiquement l'icône embarquée dans l'exécutable.
    icon_path = os.path.join(base, "THEOLOGICUS.ico")
    window = webview.create_window(
        "THEOLOGICUS",
        url,
        width=1400,
        height=900,
        min_size=(1100, 700),
        js_api=DesktopApi(),  # v74 : mise a jour depuis l'application
        confirm_close=False,
        text_select=True,  # indispensable : sinon pywebview injecte body{user-select:none}
                           # et la sélection de texte (bulle AddToChat, surlignage) est morte.
    )
    # private_mode=False : WebView2 persiste ses données (cache, etc.)
    webview.start(
        private_mode=False,
        icon=icon_path if os.path.isfile(icon_path) else None,
    )
    # v117 : ne rien arrêter si l'on a réutilisé une instance déjà lancée.
    if httpd is not None:
        httpd.shutdown()
    return 0


if __name__ == "__main__":
    if "--port" in sys.argv:
        try:
            proxy_server.PORT = int(sys.argv[sys.argv.index("--port") + 1])
        except (IndexError, ValueError):
            pass
    sys.exit(main())
