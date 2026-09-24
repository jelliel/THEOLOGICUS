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
PORT_SPAN = 16          # 8765 .. 8780
PING_TIMEOUT = 0.4


def port_range(preferred: int) -> list[int]:
    """Plage de ports candidate, déterministe et stable dans le temps."""
    return [preferred + i for i in range(PORT_SPAN)]


def _est_notre_serveur(port: int) -> bool:
    """Vrai si un serveur THEOLOGICUS écoute déjà sur ce port.

    Deux tests : la sonde dédiée (exécutable récent), et à défaut le contenu de
    THEOLOGICUS.html — un serveur étranger répond 404 ou sert autre chose. Le
    second test couvre une instance lancée par une ancienne version du exe.
    """
    try:
        with urllib.request.urlopen(
            f"http://127.0.0.1:{port}/__theologicus_ping", timeout=PING_TIMEOUT
        ) as r:
            if r.status == 200 and b"theologicus" in r.read(64):
                return True
    except Exception:
        pass
    try:
        with urllib.request.urlopen(
            f"http://127.0.0.1:{port}/THEOLOGICUS.html", timeout=PING_TIMEOUT
        ) as r:
            if r.status == 200 and b"THEOLOGICUS" in r.read(4096):
                return True
    except Exception:
        pass
    return False


def trouver_instance_existante(ports: list[int]):
    """Port d'un serveur THEOLOGICUS déjà lancé, ou None."""
    for p in ports:
        if _est_notre_serveur(p):
            return p
    return None


def choisir_port(ports: list[int]):
    """Premier port libre de la plage — déterministe, jamais aléatoire."""
    for p in ports:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", p))
                return p
            except OSError:
                continue
    return None


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
    port = trouver_instance_existante(ports)
    if port is not None:
        print(f"[OK] Instance THEOLOGICUS déjà en écoute sur le port {port} "
              f"— réutilisée (même origine, même configuration).")
        url = f"http://127.0.0.1:{port}/THEOLOGICUS.html"
    else:
        port = choisir_port(ports)
        if port is None:
            print(f"[X] Aucun port libre entre {ports[0]} et {ports[-1]}. "
                  f"Fermez l'application ou libérez un port.", file=sys.stderr)
            return 1
        proxy_server.SERVE_DIR = base  # les fichiers statiques sont à côté de l'exe
        handler = partial(proxy_server.CORSProxyHandler, directory=base)
        httpd = ThreadingHTTPServer(("127.0.0.1", port), handler)
        httpd.daemon_threads = True

        server_thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        server_thread.start()

        url = f"http://127.0.0.1:{port}/THEOLOGICUS.html"
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
