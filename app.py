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


def pick_port(preferred: int) -> int:
    """Port préféré, sinon un port libre au hasard."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("127.0.0.1", preferred))
            return preferred
        except OSError:
            pass
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


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

    port = pick_port(proxy_server.PORT)
    proxy_server.SERVE_DIR = base  # les fichiers statiques sont à côté de l'exe
    handler = partial(proxy_server.CORSProxyHandler, directory=base)
    httpd = ThreadingHTTPServer(("127.0.0.1", port), handler)
    httpd.daemon_threads = True

    server_thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    server_thread.start()

    url = f"http://127.0.0.1:{port}/THEOLOGICUS.html"
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
            httpd.shutdown()
        return 0

    try:
        import webview  # pywebview
    except ImportError:
        print("[X] pywebview manquant : pip install pywebview", file=sys.stderr)
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
    httpd.shutdown()
    return 0


if __name__ == "__main__":
    if "--port" in sys.argv:
        try:
            proxy_server.PORT = int(sys.argv[sys.argv.index("--port") + 1])
        except (IndexError, ValueError):
            pass
    sys.exit(main())
