"""
THEOLOGICUS CORS Proxy — lance avec: python proxy_server.py
Puis ouvre http://localhost:8765/THEOLOGICUS.html
"""
import http.server
import http.client
import json
import re
import ssl
import os
import sys
import subprocess
import traceback
from urllib.parse import urlparse

# Console non-UTF8 (cp1252, exe sans console...) : evite les UnicodeEncodeError sur les logs
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

PORT = 8765
# Répertoire servi pour les fichiers statiques (surchargeable par app.py en mode exe)
SERVE_DIR = os.path.dirname(os.path.abspath(__file__))
ALLOWED_ORIGINS = ['http://localhost', 'http://127.0.0.1', 'file://']


def _app_data_dir():
    """Dossier de données utilisateur HORS du dossier d'installation, pour que
    la configuration (clés API, voix, moteur, narration, ton) SURVIVE aux mises
    à jour du HTML et du exe.

    Avant ce correctif, la config TTS ne vivait que dans localStorage (lié au
    profil WebView, effacé à chaque réinstallation du exe) et la clé API dans
    le dossier d'installation (écrasé par le déploiement) → l'utilisateur
    devait tout reconfigurer après chaque MAJ. On stocke désormais ces fichiers
    dans %LOCALAPPDATA%/THEOLOGICUS/ (ou ~/THEOLOGICUS/ en repli), emplacement
    jamais touché par la copie de l'exe vers _inst_v102 ni par la réinstallation.
    """
    base = os.environ.get('LOCALAPPDATA') or os.path.expanduser('~')
    d = os.path.join(base, 'THEOLOGICUS')
    try:
        os.makedirs(d, exist_ok=True)
    except Exception:
        pass
    return d

# ════════════════════════════════════════════════════════════════════
# LibreTranslate local — démarré/arrêté depuis PARAMÈTRES dans l'app.
# Le bouton 🌐 de la bulle Add-to-chat (et l'APK sur le même Wi-Fi)
# utilisent ce serveur. Écoute sur 0.0.0.0 pour rester joignable du
# téléphone ; aucune donnée ne sort du réseau local.
# ════════════════════════════════════════════════════════════════════
LT_PORT = 5000
_lt = {"proc": None, "installing": False, "external": False, "last_error": ""}


def _lt_log_file():
    log_dir = os.path.join(SERVE_DIR, "logs")
    try:
        os.makedirs(log_dir, exist_ok=True)
        return open(os.path.join(log_dir, "libretranslate.log"), "ab")
    except Exception:
        return subprocess.DEVNULL


def _lt_python_cmd():
    """Premier interpréteur capable de LANCER libretranslate
    (``py -m libretranslate.main``). Résultat mémorisé : le test coûte
    ~1 s. En exe gelé (PyInstaller) sys.executable n'est PAS un python :
    on cherche donc sur la machine.

    On ne se contente PAS du premier ``py``/``python`` trouvé (ce serait
    Python 3.14 ici) : on PROUVE que ``import libretranslate.main``
    réussit sur chaque candidat, et on garde le premier qui passe.
    Miroté sur ``_st_python_cmd()`` (Supertonic).

    Cause racine du bug « Démarrer » LibreTranslate : le paquet
    ``libretranslate`` n'a PAS de ``__main__.py``, donc
    ``py -m libretranslate`` échoue avec
    « No module named libretranslate.__main__ ; 'libretranslate' is a
    package and cannot be directly executed ». Il faut viser le module
    ``libretranslate.main``. Vu dans logs/libretranslate.log."""
    if _lt.get("python") is not None:
        return _lt["python"] or None
    import shutil
    cands = []
    if not getattr(sys, "frozen", False):
        cands.append([sys.executable])
    if shutil.which("py"):
        cands.append(["py", "-3"])
    if shutil.which("python"):
        cands.append(["python"])
    if shutil.which("python3"):
        cands.append(["python3"])
    for cand in cands:
        try:
            r = subprocess.run(cand + ["-c", "import libretranslate.main"],
                               capture_output=True, timeout=30)
            if r.returncode == 0:
                _lt["python"] = cand
                return cand
        except Exception:
            continue
    _lt["python"] = []
    return None


def _lt_http_reachable(timeout=0.6):
    """Vrai si un serveur répond déjà sur 127.0.0.1:LT_PORT/languages."""
    try:
        import urllib.request
        with urllib.request.urlopen(f"http://127.0.0.1:{LT_PORT}/languages", timeout=timeout) as r:
            return r.status == 200
    except Exception:
        return False


def _lt_installed():
    """libretranslate est-il lançable par l'interpréteur externe ?
    Délégué à ``_lt_python_cmd()`` qui PROUVE déjà
    ``import libretranslate.main``. Résultat mis en cache (réévalué
    après une installation via lt_install())."""
    v = _lt.get("installed")
    if v is None:
        # _lt_python_cmd() ne renvoie un cmd QUE si 'import
        # libretranslate.main' a réussi -> donc installé.
        v = bool(_lt_python_cmd())
        _lt["installed"] = v
    return v


def lt_status():
    proc = _lt.get("proc")
    running = False
    if proc is not None and proc.poll() is None:
        running = True
    if not running and _lt_http_reachable():
        # démarré hors de l'app (tools/start_libretranslate.py, docker...)
        running = True
        _lt["external"] = True
    ready = _lt_http_reachable(0.8) if running else False
    return {
        "running": running,
        "ready": ready,
        "external": _lt.get("external", False),
        "installing": _lt.get("installing", False),
        "installed": _lt_installed(),
        "port": LT_PORT,
        "url": f"http://127.0.0.1:{LT_PORT}",
        "last_error": _lt.get("last_error", ""),
    }


def lt_start():
    if _lt_http_reachable(0.8):
        _lt["external"] = True
        return {"ok": True, "already": True, **lt_status()}
    if _lt.get("proc") is not None and _lt["proc"].poll() is None:
        return {"ok": True, "already": True, **lt_status()}
    _lt["last_error"] = ""
    # installé ?
    py = _lt_python_cmd()
    if not py:
        _lt["last_error"] = "Python introuvable sur ce PC (py/python requis pour héberger le serveur)"
        return {"ok": False, "reason": "no-python", **lt_status()}
    try:
        chk = subprocess.run(py + ["-c", "import libretranslate.main"],
                             capture_output=True, timeout=30)
        if chk.returncode != 0:
            return {"ok": False, "reason": "not-installed", **lt_status()}
    except Exception as e:
        _lt["last_error"] = f"Vérification impossible: {e}"
        return {"ok": False, "reason": "check-failed", **lt_status()}
    flags = 0
    if os.name == "nt":
        flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    try:
        logf = _lt_log_file()
        proc = subprocess.Popen(
            py + ["-m", "libretranslate.main", "--host", "0.0.0.0", "--port", str(LT_PORT)],
            stdout=logf, stderr=subprocess.STDOUT,
            creationflags=flags, cwd=SERVE_DIR)
        _lt["proc"] = proc
        _lt["external"] = False
        import atexit
        atexit.register(_lt_kill)
        return {"ok": True, **lt_status()}
    except Exception as e:
        _lt["last_error"] = str(e)
        return {"ok": False, "reason": "spawn-failed", **lt_status()}


def _lt_kill():
    proc = _lt.get("proc")
    if proc is not None and proc.poll() is None:
        try:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except Exception:
                proc.kill()
        except Exception:
            pass
    _lt["proc"] = None


def lt_stop():
    _lt["external"] = False
    _lt_kill()
    return {"ok": True, **lt_status()}


def lt_install():
    """pip install --user libretranslate, en tâche de fond (plusieurs minutes)."""
    if _lt.get("installing"):
        return {"ok": True, "already": True, **lt_status()}
    py = _lt_python_cmd()
    if not py:
        _lt["last_error"] = "Python introuvable sur ce PC"
        return {"ok": False, "reason": "no-python", **lt_status()}
    _lt["installing"] = True
    _lt["last_error"] = ""

    def _run():
        try:
            flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) if os.name == "nt" else 0
            logf = _lt_log_file()
            logf.write(b"\n=== libretranslate install ===\n")
            r = subprocess.run(py + ["-m", "pip", "install", "--user", "libretranslate"],
                               stdout=logf, stderr=subprocess.STDOUT,
                               creationflags=flags, timeout=1200)
            if r.returncode != 0:
                _lt["last_error"] = f"pip a echoue (code {r.returncode}) — voir logs/libretranslate.log"
        except Exception as e:
            _lt["last_error"] = f"Installation: {e}"
        finally:
            _lt["installing"] = False
            _lt["installed"] = None      # re-évaluer au prochain status
            _lt["python"] = None         # re-sonder l'interpréteur aussi

    import threading
    threading.Thread(target=_run, daemon=True).start()
    return {"ok": True, **lt_status()}


# ════════════════════════════════════════════════════════════════════
# Supertonic 3 local — même schéma que LibreTranslate ci-dessus.
# L'app (PARAMÈTRES) demande le démarrage ; le service écoute sur
# 0.0.0.0 pour rester joignable depuis l'APK sur le même Wi-Fi.
#
# Deux différences avec LibreTranslate, toutes deux mesurées :
#   1. Supertonic n'est pas un paquet pip : c'est NOTRE script
#      tools/start_supertonic.py, qui a besoin de numpy ET onnxruntime.
#      L'interpréteur est donc choisi en le TESTANT, pas en le supposant.
#   2. Un port fermé renvoie ici un HTTP 502 d'un relais local, pas une
#      erreur de connexion : « le port répond » ne prouve rien, c'est le
#      code HTTP qui tranche. urlopen lève sur 502, ce qui suffit.
# ════════════════════════════════════════════════════════════════════
ST_PORT = 8091
_st = {"proc": None, "external": False, "last_error": "", "python": None, "deps": None}


def _st_log_file():
    log_dir = os.path.join(SERVE_DIR, "logs")
    try:
        os.makedirs(log_dir, exist_ok=True)
        return open(os.path.join(log_dir, "supertonic.log"), "ab")
    except Exception:
        return subprocess.DEVNULL


def _st_script():
    """Chemin de notre service. En mode exe il est livré dans tools/ à côté
    de l'exécutable (voir build_installer.bat)."""
    return os.path.join(SERVE_DIR, "tools", "start_supertonic.py")


def _st_candidats():
    """Interpréteurs à essayer, dans l'ordre. En exe gelé sys.executable
    n'est PAS un python : on cherche donc sur la machine."""
    import shutil
    out = []
    if not getattr(sys, "frozen", False):
        out.append([sys.executable])
    if shutil.which("py"):
        out.append(["py", "-3"])
    if shutil.which("python"):
        out.append(["python"])
    if shutil.which("python3"):
        out.append(["python3"])
    return out


def _st_python_cmd():
    """Premier interpréteur qui sait importer numpy ET onnxruntime.
    Résultat mémorisé : le test coûte ~1 s (chargement d'onnxruntime)."""
    if _st["python"] is not None:
        return _st["python"] or None
    for cand in _st_candidats():
        try:
            r = subprocess.run(cand + ["-c", "import numpy, onnxruntime"],
                               capture_output=True, timeout=60)
            if r.returncode == 0:
                _st["python"] = cand
                _st["deps"] = True
                return cand
        except Exception:
            continue
    _st["python"] = []
    _st["deps"] = False
    return None


def _st_health(timeout=0.8):
    """Corps de /health, ou None. Un relais local répond 502 quand rien
    n'écoute — urlopen lève alors, donc le code HTTP tranche vraiment."""
    try:
        import urllib.request
        with urllib.request.urlopen(f"http://127.0.0.1:{ST_PORT}/health", timeout=timeout) as r:
            if r.status != 200:
                return None
            j = json.loads(r.read().decode("utf-8"))
            return j if isinstance(j, dict) else None
    except Exception:
        return None


def _st_http_reachable(timeout=0.8):
    return _st_health(timeout) is not None


def st_status():
    proc = _st.get("proc")
    running = proc is not None and proc.poll() is None
    # Le service peut etre monte avant que le modele ONNX soit charge : on
    # distingue donc « joignable » de « pret a synthetiser ». Annoncer
    # « en ligne » sur un simple port ouvert ferait echouer la premiere lecture.
    sante = _st_health(1.2)
    if not running and sante is not None:
        running = True
        _st["external"] = True
    py = _st_python_cmd()
    return {
        "running": running,
        "ready": bool(sante and sante.get("loaded") is True),
        "external": _st.get("external", False),
        "deps": bool(_st.get("deps")),
        "python": " ".join(py) if py else "",
        "script": os.path.isfile(_st_script()),
        "model": (sante or {}).get("model", ""),
        "voices": len((sante or {}).get("voices", []) or []),
        "port": ST_PORT,
        "url": f"http://127.0.0.1:{ST_PORT}",
        "last_error": _st.get("last_error", ""),
    }


def st_start():
    if _st_http_reachable(0.8):
        _st["external"] = True
        return {"ok": True, "already": True, **st_status()}
    if _st.get("proc") is not None and _st["proc"].poll() is None:
        return {"ok": True, "already": True, **st_status()}
    _st["last_error"] = ""
    script = _st_script()
    if not os.path.isfile(script):
        _st["last_error"] = ("Service introuvable : %s. Il est livré avec "
                             "l'application (dossier tools)." % script)
        return {"ok": False, "reason": "no-script", **st_status()}
    py = _st_python_cmd()
    if not py:
        # Message volontairement complet : c'est LE point de blocage réel.
        _st["last_error"] = ("Aucun Python avec numpy et onnxruntime n'a été "
                             "trouvé sur ce PC. Installez-les, puis relancez : "
                             "python -m pip install numpy onnxruntime")
        return {"ok": False, "reason": "no-deps", **st_status()}
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0) if os.name == "nt" else 0
    try:
        logf = _st_log_file()
        logf.write(b"\n=== demarrage supertonic ===\n")
        proc = subprocess.Popen(
            py + [script, "--host", "0.0.0.0", "--port", str(ST_PORT)],
            stdout=logf, stderr=subprocess.STDOUT,
            creationflags=flags, cwd=SERVE_DIR)
        _st["proc"] = proc
        _st["external"] = False
        import atexit
        atexit.register(_st_kill)
        return {"ok": True, **st_status()}
    except Exception as e:
        _st["last_error"] = str(e)
        return {"ok": False, "reason": "spawn-failed", **st_status()}


def _st_kill():
    proc = _st.get("proc")
    if proc is not None and proc.poll() is None:
        try:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except Exception:
                proc.kill()
        except Exception:
            pass
    _st["proc"] = None


def st_stop():
    _st["external"] = False
    _st_kill()
    return {"ok": True, **st_status()}


class CORSProxyHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-api-key, anthropic-version')
        # Jamais de cache navigateur : chaque GET relit le fichier du disque
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        # LibreTranslate local : état (interrogé par PARAMÈTRES)
        if self.path.split('?')[0] == '/libretranslate/status':
            self._json_response(lt_status())
            return
        # Supertonic local : état (interrogé par PARAMÈTRES)
        if self.path.split('?')[0] == '/supertonic/status':
            self._json_response(st_status())
            return
        # Config des clés API (fichier séparé, jamais embarqué dans le HTML).
        # Stocké HORS du dossier d'installation (%LOCALAPPDATA%/THEOLOGICUS)
        # pour survivre aux mises à jour du exe/HTML — avant, la clé était
        # perdue à chaque réinstallation et l'utilisateur devait tout reconfigurer.
        if self.path.split('?')[0] == '/theologicus-keys':
            keys_path = os.path.join(_app_data_dir(), 'theologicus_keys.json')
            # Migration one-shot : si absent en données-utilisateur mais présent
            # dans l'ancien emplacement (dossier d'install), on le copie pour ne
            # rien perdre (sauvegarde aussi la clé API déjà saisie par l'utilisateur).
            if not os.path.isfile(keys_path):
                old = os.path.join(SERVE_DIR, 'theologicus_keys.json')
                if os.path.isfile(old):
                    try:
                        shutil.copy2(old, keys_path)
                    except Exception:
                        pass
            try:
                with open(keys_path, 'rb') as f:
                    body = f.read()
            except Exception:
                body = b'{}'
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(body)
            return
        # Config TTS complète (moteur, voix, clé API, narration, ton...) — même
        # emplacement hors-install que les clés, pour ne JAMAIS la perdre en MAJ.
        if self.path.split('?')[0] == '/config':
            cfg_path = os.path.join(_app_data_dir(), 'theologicus_config.json')
            try:
                with open(cfg_path, 'rb') as f:
                    body = f.read()
            except Exception:
                body = b'{}'
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(body)
            return
        # Servir les fichiers statiques du répertoire courant (THEOLOGICUS.html, CSS, JS...)
        if not self.path.startswith('/proxy/'):
            # Chemin du fichier demandé (relative au dossier du proxy)
            path = self.path.split('?')[0]
            if path == '/':
                path = '/THEOLOGICUS.html'
            file_path = os.path.join(SERVE_DIR, path.lstrip('/'))
            if os.path.isfile(file_path):
                # Déterminer le Content-Type
                ext = os.path.splitext(file_path)[1].lower()
                mime_types = {
                    '.html': 'text/html; charset=utf-8',
                    '.css': 'text/css; charset=utf-8',
                    '.js': 'application/javascript; charset=utf-8',
                    '.png': 'image/png',
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg',
                    '.gif': 'image/gif',
                    '.svg': 'image/svg+xml',
                    '.ico': 'image/x-icon',
                    '.json': 'application/json',
                    '.woff': 'font/woff',
                    '.woff2': 'font/woff2',
                    '.ttf': 'font/ttf',
                    '.otf': 'font/otf',
                }
                content_type = mime_types.get(ext, 'application/octet-stream')
                self.send_response(200)
                self.send_header('Content-Type', content_type)
                self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
                self.send_header('Pragma', 'no-cache')
                self.send_header('Expires', '0')
                self.end_headers()
                with open(file_path, 'rb') as f:
                    self.wfile.write(f.read())
            else:
                self.send_error(404, f'File not found: {path}')
            return
        self.send_error(404)

    def do_POST(self):
        if self.path.split('?')[0] == '/theologicus-keys':
            self._save_keys()
        elif self.path.split('?')[0] == '/config':
            self._save_config()
        elif self.path.split('?')[0] == '/save-data':
            self._save_data()
        elif self.path.split('?')[0] == '/libretranslate/start':
            self._json_response(lt_start())
        elif self.path.split('?')[0] == '/libretranslate/stop':
            self._json_response(lt_stop())
        elif self.path.split('?')[0] == '/libretranslate/install':
            self._json_response(lt_install())
        elif self.path.split('?')[0] == '/libretranslate/log':
            log_path = os.path.join(SERVE_DIR, 'logs', 'libretranslate.log')
            tail = ''
            try:
                with open(log_path, 'rb') as f:
                    f.seek(0, os.SEEK_END)
                    size = f.tell()
                    f.seek(max(0, size - 8192))
                    tail = f.read().decode('utf-8', errors='replace')
            except Exception:
                pass
            self._json_response({"tail": tail})
        elif self.path.split('?')[0] == '/supertonic/start':
            self._json_response(st_start())
        elif self.path.split('?')[0] == '/supertonic/stop':
            self._json_response(st_stop())
        elif self.path.split('?')[0] == '/supertonic/log':
            log_path = os.path.join(SERVE_DIR, 'logs', 'supertonic.log')
            tail = ''
            try:
                with open(log_path, 'rb') as f:
                    f.seek(0, os.SEEK_END)
                    size = f.tell()
                    f.seek(max(0, size - 8192))
                    tail = f.read().decode('utf-8', errors='replace')
            except Exception:
                pass
            self._json_response({"tail": tail})
        elif self.path.startswith('/proxy/'):
            self._proxy_request()
        else:
            self.send_error(404)

    def _json_response(self, obj):
        body = json.dumps(obj).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except Exception:
            pass

    def _save_data(self):
        """Enregistre un export de données dans le dossier de l'application.
        Body : JSON {filename: <nom>, data64: <base64>} — max ~200 Mo.
        Le fichier est écrit dans SERVE_DIR/backups/ (dossier de l'exe/app.py)."""
        try:
            import base64
            length = int(self.headers.get('Content-Length', 0))
            if length <= 0 or length > 200 * 1024 * 1024:
                raise ValueError('taille invalide')
            body = self.rfile.read(length)
            req = json.loads(body.decode('utf-8'))
            filename = req.get('filename') or ''
            # Sécurité : nom de fichier simple, pas de chemin
            filename = os.path.basename(filename).replace('\\', '_').replace('/', '_')
            if not filename or not (filename.endswith('.json') or filename.endswith('.theologicus.json')):
                raise ValueError('nom de fichier invalide')
            data = base64.b64decode(req.get('data64') or b'')
            if not data:
                raise ValueError('contenu vide')
            backup_dir = os.path.join(SERVE_DIR, 'backups')
            os.makedirs(backup_dir, exist_ok=True)
            out_path = os.path.join(backup_dir, filename)
            tmp_path = out_path + '.tmp'
            with open(tmp_path, 'wb') as f:
                f.write(data)
            os.replace(tmp_path, out_path)  # écriture atomique
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True, "path": out_path}).encode())
        except Exception as e:
            try:
                self.send_response(400)
                self.send_header('Content-Type', 'text/plain')
                self.end_headers()
                self.wfile.write(f'erreur: {e}'.encode())
            except Exception:
                pass

    def _save_keys(self):
        """Enregistre theologicus_keys.json (clés API séparées du HTML).
        Emplacement : %LOCALAPPDATA%/THEOLOGICUS (hors dossier d'install)."""
        try:
            length = int(self.headers.get('Content-Length', 0))
            if length <= 0 or length > 16384:
                raise ValueError('taille invalide')
            body = self.rfile.read(length)
            json.loads(body.decode('utf-8'))  # validation JSON
            keys_path = os.path.join(_app_data_dir(), 'theologicus_keys.json')
            tmp_path = keys_path + '.tmp'
            with open(tmp_path, 'wb') as f:
                f.write(body)
            os.replace(tmp_path, keys_path)  # ecriture atomique
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"ok":true}')
        except Exception as e:
            try:
                self.send_response(400)
                self.send_header('Content-Type', 'text/plain')
                self.end_headers()
                self.wfile.write(f'erreur: {e}'.encode())
            except Exception:
                pass

    def _save_config(self):
        """Enregistre theologicus_config.json : config TTS complète (moteur,
        voix, clé API ElevenLabs, narration, ton, réglages Supertonic...).
        Emplacement hors dossier d'installation → SURVIT aux mises à jour du
        exe et du HTML. C'est le correctif du « j'ai dû tout reconfigurer après
        la MAJ » : la config n'est plus seulement dans localStorage (profil
        WebView effacé à la réinstallation)."""
        try:
            length = int(self.headers.get('Content-Length', 0))
            if length <= 0 or length > 16384:
                raise ValueError('taille invalide')
            body = self.rfile.read(length)
            json.loads(body.decode('utf-8'))  # validation JSON
            cfg_path = os.path.join(_app_data_dir(), 'theologicus_config.json')
            tmp_path = cfg_path + '.tmp'
            with open(tmp_path, 'wb') as f:
                f.write(body)
            os.replace(tmp_path, cfg_path)  # ecriture atomique
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"ok":true}')
        except Exception as e:
            try:
                self.send_response(400)
                self.send_header('Content-Type', 'text/plain')
                self.end_headers()
                self.wfile.write(f'erreur: {e}'.encode())
            except Exception:
                pass

    def _proxy_request(self):
        try:
            # Extract target URL from path: /proxy/<encoded_url>
            target_url = self.path[7:]  # remove /proxy/
            # NB : startswith('http') suffirait mal — httpbin.org commence par 'http' !
            if not (target_url.startswith('http://') or target_url.startswith('https://')):
                target_url = 'https://' + target_url

            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length) if content_length > 0 else b''

            # Build headers
            headers = {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            }
            # Forward ALL relevant headers
            for h in ['Authorization', 'x-api-key', 'anthropic-version', 'User-Agent', 'x-stainless-arch', 'x-stainless-lang', 'x-stainless-os', 'x-stainless-runtime', 'x-stainless-runtime-version']:
                val = self.headers.get(h)
                if val:
                    headers[h] = val

            # Use http.client for better header control
            parsed = urlparse(target_url)
            is_https = parsed.scheme == 'https'
            if is_https:
                conn = http.client.HTTPSConnection(
                    parsed.hostname, parsed.port or 443,
                    context=ssl.create_default_context(), timeout=120)
            else:
                conn = http.client.HTTPConnection(
                    parsed.hostname, parsed.port or 80, timeout=120)

            # Build raw headers
            raw_headers = []
            for k, v in headers.items():
                raw_headers.append(f"{k}: {v}")
            raw_headers.append(f"Host: {parsed.hostname}")
            if parsed.port:
                raw_headers[-1] = f"Host: {parsed.hostname}:{parsed.port}"

            path = parsed.path
            if parsed.query:
                path += '?' + parsed.query

            print(f"\033[33m[PROXY] → {target_url}\033[0m")
            print(f"[PROXY] Headers: {list(headers.keys())}")

            try:
                conn.request('POST', path, body=body, headers=dict(headers))
                resp = conn.getresponse()
            except Exception as e:
                self.send_response(502)
                self.send_header('Content-Type', 'text/plain')
                self.end_headers()
                self.wfile.write(f'Proxy connection error: {str(e)}'.encode())
                return

            # Stream response back
            self.send_response(resp.status)
            ct = resp.getheader('Content-Type', 'application/json')
            self.send_header('Content-Type', ct)
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()

            # Forward chunks
            while True:
                chunk = resp.read(4096)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
            conn.close()

        except Exception as e:
            traceback.print_exc()
            try:
                self.send_response(500)
                self.send_header('Content-Type', 'text/plain')
                self.end_headers()
                self.wfile.write(f'Proxy error: {str(e)}'.encode())
            except Exception:
                pass  # la reponse a peut-etre deja ete envoyee (streaming interrompu)

    def log_message(self, format, *args):
        # Colorized log
        msg = format % args
        if 'POST /proxy/' in msg:
            print(f"\033[36m[PROXY]\033[0m {msg}")
        elif '200' in str(args):
            print(f"\033[32m[OK]\033[0m {msg}")
        else:
            print(f"[LOG] {msg}")

if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server = http.server.HTTPServer(('0.0.0.0', PORT), CORSProxyHandler)
    print(f"\033[32m╔══════════════════════════════════════════╗")
    print(f"║  THEOLOGICUS Proxy Server               ║")
    print(f"║  http://localhost:{PORT}/THEOLOGICUS.html  ║")
    print(f"║  Ctrl+C pour arrêter                    ║")
    print(f"╚══════════════════════════════════════════╝\033[0m")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n\033[33mArrêté.\033[0m")
        server.server_close()
