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
from urllib.parse import urlparse, parse_qs

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

# v117 — sonde d'identité, consommée par app.py AVANT de démarrer un serveur.
# Pourquoi : l'ORIGINE d'une page web est scheme://hote:port. Deux ports
# différents = deux origines = deux stockages navigateur distincts
# (localStorage, IndexedDB). Tant que le port variait d'un lancement à l'autre,
# la clé API et toute la configuration semblaient effacées à chaque ouverture.
# Cette sonde permet au lanceur de RECONNAÎTRE un serveur THEOLOGICUS déjà en
# écoute et de le réutiliser, au lieu d'en démarrer un second ailleurs.
PING_TOKEN = b'{"app":"theologicus"}'


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


# ════════════════════════════════════════════════════════════════════
# MoneyPrinterTurbo — STUDIO VIDEO de THEOLOGICUS.
#
# Ce n'est PAS un modele : c'est un SERVICE VOISIN, comme Supertonic et
# LibreTranslate ci-dessus. MPT tourne de son cote (portfolio Windows,
# api.bat) et expose une vraie API REST documentee sur /docs.
#
# Pourquoi un relais ici plutot qu'un appel direct depuis le HTML :
#   1. La page est servie en http://127.0.0.1:8765 ; appeler directement
#      http://127.0.0.1:8080 ferait une requete CROSS-ORIGIN. MPT ne
#      repond aux autres origines que si l'utilisateur a configure
#      CORS_ALLOWED_ORIGINS — frotter le relais evite d'imposer cela.
#   2. Le POLLING et le DOWNLOAD d'un MP4 passent par un meme point, donc
#      une seule logique de port a maintenir.
#   3. Aucune cle API MPT n'a besoin d'entrer dans localStorage.
#
# PORT : le piege v117 s'applique exactement ici. api.bat ecoute 8080 par
# defaut (config.toml: listen_port = 8080), MAIS start.bat lance le WebUI
# Streamlit qui choisit le premier port libre de 8501 a 8599. On sonde donc
# une PLAGE, on s'arrete des qu'un service repond, et on JOURNALISE le port
# retenu : un port qui change en silence fait croire que la config est perdue.
#
# Sondage volontairement LECTURE SEULE (/ping) : « est-ce MPT ? » se prouve
# par le corps 'pong', pas par le fait que le port repond — n'importe quel
# programme peut occuper 8080.
# ════════════════════════════════════════════════════════════════════
MPT_PORTS = (8080, 8081) + tuple(range(8501, 8510))
# Dossier d'installation par defaut sur CETTE machine (dossier Bureau).
MPT_DEFAULT_DIR = os.path.join(
    os.path.expanduser("~"), "Desktop", "MoneyPrinterTurbo-Portable-Windows-1.3.7")
_mpt = {"port": None, "last_error": "", "probed": 0}


def _boucle_locale():
    """Ouvreur urllib qui N'UTILISE AUCUN proxy.

    Mesuré sur cette machine : ``http_proxy``/``HTTP_PROXY`` sont définis dans
    l'environnement et urllib les honore AUSSI pour 127.0.0.1. Le proxy ne peut
    pas joindre la boucle locale et rend **502 Bad Gateway** — un message qui
    ressemble à « le service a répondu 502 » alors que MPT n'a jamais reçu la
    requête. Sans ce désarmement, la sonde concluait « service absent » alors
    que le service tournait.
    """
    import urllib.request
    return urllib.request.build_opener(urllib.request.ProxyHandler({}))


def _mpt_probe(port, timeout=0.6):
    """Interroge /ping sur un port. Rend True UNIQUEMENT si le corps est
    'pong' : c'est MPT qui repond, pas un inconnu sur le meme port."""
    try:
        with _boucle_locale().open(
                "http://127.0.0.1:%d/ping" % port, timeout=timeout) as r:
            if r.status != 200:
                return False
            # MPT (FastAPI, type str) renvoie le corps JSON '"pong"' AVEC les
            # guillemets. On accepte les deux formes plutot que d'imposer un
            # detail d'encodage : ce qui compte est que ce soit bien MPT.
            corps = r.read(32).decode("utf-8", "replace").strip()
            return corps in ('pong', '"pong"')
    except Exception:
        return False


def _mpt_dir():
    """Dossier du portatif MPT, surchargeable par variable d'environnement.
    Priorite a MPT_DIR (l'utilisateur peut avoir range le dossier ailleurs),
    puis au chemin par defaut du Bureau."""
    cand = os.environ.get("MPT_DIR") or MPT_DEFAULT_DIR
    return cand if os.path.isdir(cand) else None


def _mpt_installation():
    """Où en est l'INSTALLATION, indépendamment de l'état du service.

    Motif : « non détecté » recouvrait deux situations opposées — « installé
    mais arrêté » (un clic suffit) et « dossier introuvable » (aucun clic ne
    peut aboutir). Un message unique pour les deux envoyait l'utilisateur
    chercher une panne là où il n'y avait qu'un service à démarrer.

    On ne renseigne QUE ce qu'on a vérifié sur le disque : `api_bat` est le
    script que `mpt_lancer()` exécutera réellement, pas une supposition.
    """
    dossier = _mpt_dir()
    if not dossier:
        return {"installe": False, "dossier": None, "api_bat": False,
                "peut_lancer": False, "raison": "no-dir"}
    bat = os.path.join(dossier, "api.bat")
    if not os.path.isfile(bat):
        return {"installe": True, "dossier": dossier, "api_bat": False,
                "peut_lancer": False, "raison": "no-bat"}
    return {"installe": True, "dossier": dossier, "api_bat": True,
            "peut_lancer": True, "raison": ""}


def mpt_status():
    """Etat du service. Ne conserve un port QUE s'il repond encore : un
    service arrete entre-temps doit redevenir 'non detecte', sinon l'UI
    afficherait un Studio pret a l'emploi qui echoue a chaque envoi.

    Les cles `installe`/`api_bat`/`peut_lancer`/`dossier` sont TOUJOURS
    presentes, y compris service en marche : l'UI peut ainsi distinguer
    « arrêté » de « absent » sans second appel.
    """
    inst = _mpt_installation()
    if _mpt["port"] is not None and _mpt_probe(_mpt["port"]):
        return {"running": True, "port": _mpt["port"],
                "dir": _mpt_dir(), **inst, "last_error": ""}
    _mpt["port"] = None
    # Decouverte : on sonde la plage jusqu'au PREMIER service qui se nomme.
    for port in MPT_PORTS:
        if _mpt_probe(port):
            _mpt["port"] = port
            print("[MPT] service detecte sur le port %d" % port, flush=True)
            return {"running": True, "port": port,
                    "dir": _mpt_dir(), **inst, "last_error": ""}
    return {"running": False, "port": None, "dir": _mpt_dir(), **inst,
            "last_error": _mpt["last_error"]}


def mpt_requete(methode, chemin, corps=None, timeout=30):
    """Appel JSON a l'API MPT. Rend (ok, donnees_ou_message)."""
    st = mpt_status()
    if not st["running"]:
        return False, "Service MoneyPrinterTurbo non detecte (aucun 'pong' sur les ports sondes)."
    url = "http://127.0.0.1:%d%s" % (st["port"], chemin)
    try:
        import urllib.request
        data = json.dumps(corps).encode("utf-8") if corps is not None else None
        req = urllib.request.Request(url, data=data, method=methode)
        if data is not None:
            req.add_header("Content-Type", "application/json")
        # _boucle_locale() et NON urlopen directement : http_proxy est defini
        # dans l'environnement et urllib l'honore AUSSI pour 127.0.0.1. Le
        # proxy ne joint pas la boucle locale et rend 502 — la sonde _mpt_probe
        # desarmait deja ce piege, pas cet appel-ci. Resultat : le service
        # etait detecte (status running) mais CHAQUE requete echouait en 502,
        # ce qui ressemblait a une erreur de MPT.
        with _boucle_locale().open(req, timeout=timeout) as r:
            brut = r.read().decode("utf-8", "replace")
            try:
                return True, json.loads(brut)
            except Exception:
                return True, {"raw": brut}
    except Exception as e:
        # HTTPError porte un corps JSON utile (400 de validation Pydantic) :
        # le perdre transformerait un message precis en « erreur reseau ».
        try:
            from urllib.error import HTTPError
            if isinstance(e, HTTPError):
                brut = e.read().decode("utf-8", "replace")
                try:
                    return False, json.loads(brut)
                except Exception:
                    return False, brut[:800]
        except Exception:
            pass
        return False, str(e)


# Le portatif Windows imbrique l'application : la racine porte les .bat et
# `lib/`, le code Python et `resource/fonts` vivent dans `MoneyPrinterTurbo/`.
# _mpt_dir() rend la RACINE : chercher `resource/fonts` directement dessous
# ne trouve rien. On essaie donc la racine PUIS le sous-dossier applicatif.
_MPT_FONT_DIRS = ("resource/fonts", "resource", "fonts")
_MPT_SOUS_DOSSIER = "MoneyPrinterTurbo"


def _mpt_racines():
    """Racines ou chercher les ressources de MPT, de la plus precise a la plus
    large. La premiere qui existe gagne, sans jamais sortir de l'installation."""
    base = _mpt_dir()
    if not base:
        return []
    cands = [base]
    sub = os.path.join(base, _MPT_SOUS_DOSSIER)
    if os.path.isdir(sub):
        # Le sous-dossier d'abord : c'est la ou vit reellement le code.
        cands.insert(0, sub)
    return cands


# ════════════════════════════════════════════════════════════════════
# REGLAGES MPT ECRITS DEPUIS THEOLOGICUS (config.toml)
#
# L'API HTTP de MPT n'expose AUCUNE route de configuration : ses reglages
# (cles Pexels/Pixabay/Coverr, Upload-Post, fournisseur LLM) ne sont ecrits
# que par son WebUI Streamlit, dans le meme processus que le service. Or ce
# sont bien CES cles que la generation de video utilise : les afficher sans
# les ecrire serait un formulaire decoratif.
#
# On edite donc config.toml NOUS-MEMES, avec deux garde-fous :
#   1. edition LIGNE A LIGNE, jamais une reecriture du fichier : les
#      commentaires et les cles que nous ne connaissons pas survivent (MPT en
#      ajoute a chaque version, et l'utilisateur peut y avoir mis les siens) ;
#   2. liste blanche de cles : le formulaire ne peut PAS ecrire n'importe ou.
#      Une cle hors liste est ignoree en silence cote serveur, jamais ecrite.
#
# La section visee est [app] : c'est celle ou MPT range toutes ces cles.
# ════════════════════════════════════════════════════════════════════
_MPT_CFG_SECTION = "app"

# Cles modifiables depuis l'interface, avec leur type. `list` = tableau TOML
# (les cles de banques de medias sont des LISTES de cles chez MPT, pas des
# chaines : ecrire une chaine la ou il attend une liste casse la recherche de
# videos). `bool` = booleen TOML ecret en minuscules (true/false).
_MPT_CFG_WHITELIST = {
    # --- Fournisseur LLM (« LLM Settings ») ---
    "llm_provider": "str",
    "moonshot_api_key": "str", "moonshot_base_url": "str", "moonshot_model_name": "str",
    "openai_api_key": "str", "openai_base_url": "str", "openai_model_name": "str",
    "anthropic_api_key": "str", "anthropic_base_url": "str", "anthropic_model_name": "str",
    "gemini_api_key": "str", "gemini_base_url": "str", "gemini_model_name": "str",
    "deepseek_api_key": "str", "deepseek_base_url": "str", "deepseek_model_name": "str",
    "qwen_api_key": "str", "qwen_base_url": "str", "qwen_model_name": "str",
    "minimax_api_key": "str", "minimax_base_url": "str", "minimax_model_name": "str",
    "grok_api_key": "str", "grok_base_url": "str", "grok_model_name": "str",
    "ollama_base_url": "str", "ollama_model_name": "str",
    # --- Sources de medias (« Material Source Settings ») ---
    "video_source": "str",
    "pexels_api_keys": "list", "pixabay_api_keys": "list", "coverr_api_keys": "list",
    "twelvelabs_api_keys": "list", "twelvelabs_rerank_terms": "bool",
    # --- Generation de videos par IA (« AI Video Generation APIs ») ---
    # Six fournisseurs, chacun avec sa cle, son adresse et ses reglages. Ces
    # cles sont PAYANTES a l'usage (facturation a la seconde produite) : les
    # rendre modifiables ici est ce qui permet a l'utilisateur de les voir et
    # de les corriger sans ouvrir le config.toml d'un autre programme a la main.
    "metaso_minimax_api_key": "str", "metaso_minimax_base_url": "str",
    "metaso_minimax_resolution": "str", "metaso_minimax_poll_interval": "int",
    "metaso_minimax_run_timeout": "int",
    "ofox_api_key": "str", "ofox_base_url": "str",
    "ofox_text_to_video_model": "str", "ofox_resolution": "str",
    "ofox_provider": "str", "ofox_min_duration": "int", "ofox_max_duration": "int",
    "ofox_poll_interval": "int", "ofox_run_timeout": "int",
    # ShengSuan (LoomLoom) : un seul jeton pour le script ET la video. Son
    # adresse est en tete du fichier, hors de la section [app] : on la rend
    # lisible en lecture seule, jamais ecrite ici.
    "loomloom_base_url": "str",
    "loomloom_api_token": "str",
    "loomloom_request_timeout_seconds": "int",
    "loomloom_poll_interval_seconds": "int",
    "loomloom_run_timeout_seconds": "int",
    "loomloom_video_run_timeout_seconds": "int",
    "volcengine_seedance_api_key": "str", "volcengine_seedance_base_url": "str",
    "volcengine_seedance_model": "str", "volcengine_seedance_resolution": "str",
    "volcengine_seedance_min_duration": "int", "volcengine_seedance_max_duration": "int",
    "volcengine_seedance_poll_interval": "int", "volcengine_seedance_run_timeout": "int",
    "volcengine_seedance_watermark": "bool",
    "wavespeed_api_keys": "list",
    "muapi_api_key": "str", "muapi_base_url": "str", "muapi_video_endpoint": "str",
    "muapi_resolution": "str", "muapi_min_duration": "int", "muapi_max_duration": "int",
    "muapi_poll_interval": "int", "muapi_run_timeout": "int",
    # --- Image par IA (une seule source pour l'instant) ---
    "openai_image_base_url": "str", "openai_image_api_keys": "list",
    "openai_image_model": "str", "openai_image_size": "str",
    "openai_image_prompt_template": "str",
    # --- Musique de fond generee (Sonilo) ---
    "sonilo_api_key": "str", "sonilo_base_url": "str", "sonilo_timeout": "int",
    # --- Correspondance des plans avec le script ---
    "match_materials_to_script": "bool",
    # --- Publication automatique (« Auto-Publish Settings ») ---
    "upload_post_enabled": "bool",
    "upload_post_auto_upload": "bool",
    "upload_post_api_key": "str",
    "upload_post_username": "str",
    "upload_post_platforms": "list",
    "upload_post_youtube_privacy_status": "str",
    "upload_post_youtube_made_for_kids": "bool",
    "upload_post_max_pending_tasks": "int",
    # --- Audio (« Audio Settings ») ---
    # `voice_mode` et `tts_server` ne sont PAS des champs de VideoParams : ce
    # sont des etats de config.ui, et c'est MPT lui-meme qui les lit a la
    # generation. Les omettre de cette liste ne cassait rien visiblement —
    # `data-cle="tts_server"` etait simplement ignore en silence a
    # l'enregistrement, et le moteur choisi revenait a sa valeur par defaut.
    "voice_mode": "str",
    "tts_server": "str",
    "voice_name": "str",
    "voice_volume": "float",
    "voice_rate": "float",
    # --- Interface (« Interface Settings ») ---
    "hide_config": "bool",
}


def _mpt_config_path():
    """Chemin de config.toml, dans le sous-dossier applicatif s'il existe.

    Meme logique que pour les polices : une installation portative imbrique son
    application. Chercher au mauvais niveau ne rend pas d'erreur — juste un
    fichier introuvable et des reglages qui ne s'enregistrent nulle part."""
    for base in _mpt_racines():
        cand = os.path.join(base, "config.toml")
        if os.path.isfile(cand):
            return cand
    return None


def _toml_ligne_cle(ligne):
    """Nom de cle d'une ligne `cle = valeur`, ou None.

    Volontairement strict : on ne veut PAS reecrire une ligne qui ressemble a
    une cle sans en etre une (un commentaire, une valeur multiligne, une
    section). Le nom doit etre en debut de ligne, precede d'un identifiant
    simple, puis d'un `=`."""
    m = re.match(r'^([A-Za-z_][A-Za-z0-9_-]*)[ \t]*=', ligne)
    return m.group(1) if m else None


def _toml_valeur(valeur, type_attendu):
    """Serialise une valeur Python en litteral TOML, selon le type declare.

    Les LISTES sont ecrites sur une seule ligne (`[ "a", "b",]`) comme le fait
    MPT : un tableau TOML multiligne reste lisible pour `tomllib`, mais une
    reecriture sur une ligne evite d'avoir a gerer l'indentation et garde le
    diff d'une sauvegarde minimal."""
    if type_attendu == "bool":
        return "true" if valeur else "false"
    if type_attendu == "int":
        try:
            return str(int(valeur))
        except Exception:
            return "0"
    # `float` : sans cette branche, la valeur tombait dans la branche chaine et
    # `voice_volume = "1.0"` etait ecrit AVEC des guillemets. MPT attend un
    # nombre et refuse une chaine — le reglage le plus anodin (le volume) aurait
    # fait echouer la generation entiere, avec un message parlant de type.
    if type_attendu == "float":
        try:
            return repr(float(valeur))
        except Exception:
            return "1.0"
    if type_attendu == "list":
        if isinstance(valeur, str):
            # Le formulaire envoie une chaine « a, b, c » : on la decoupe, on
            # retire les vides (une virgule traînante ne doit pas fabriquer une
            # cle vide, qui ferait echouer l'appel Pexels).
            items = [x.strip() for x in valeur.replace(" ", "").split(",") if x.strip()]
        elif isinstance(valeur, (list, tuple)):
            items = [str(x).strip() for x in valeur if str(x).strip()]
        else:
            items = []
        return "[ " + ", ".join('"' + i.replace('"', '\\"') + '"' for i in items) + ",]"
    # Chaine : on echappe les guillemets et les antislashs, jamais les accents
    # (le fichier est en UTF-8, MPT le relit tel quel).
    s = "" if valeur is None else str(valeur)
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _toml_valeur_python(texte):
    """Convertit le cote droit d'une ligne TOML en valeur Python.

    `tomllib` (3.11+) est prefere : il connait les echappements et les tableaux.
    Repli sur une lecture minimale si la bibliotheque manque, pour que la route
    reste utilisable sur un Python plus ancien."""
    t = texte.strip()
    try:
        import tomllib
        return tomllib.loads("v = " + t)["v"]
    except Exception:
        pass
    if t in ("true", "false"):
        return t == "true"
    if t.startswith('"') and t.endswith('"') and len(t) >= 2:
        return t[1:-1].replace('\\"', '"').replace("\\\\", "\\")
    if t.startswith("[") and t.endswith("]"):
        return [x.strip().strip('"') for x in t[1:-1].split(",") if x.strip()]
    try:
        return int(t)
    except Exception:
        return t


def mpt_lire_reglages():
    """Reglages MPT lisibles par l'interface, plus la liste des chemins.

    Rend TOUJOURS un objet : un config.toml absent donne `ok:false` avec la
    raison, jamais une exception. L'interface doit pouvoir dire « service non
    installe » au lieu de rester sur un chargement infini."""
    chemin = _mpt_config_path()
    if not chemin:
        return {"ok": False, "reason": "no-config",
                "dir": _mpt_dir(), "values": {}}
    try:
        with open(chemin, "r", encoding="utf-8", errors="replace") as f:
            lignes = f.read().splitlines()
    except Exception as e:
        return {"ok": False, "reason": "read-failed", "error": str(e),
                "dir": _mpt_dir(), "values": {}}
    section, valeurs = None, {}
    for ligne in lignes:
        st = ligne.strip()
        if st.startswith("[") and st.endswith("]"):
            section = st[1:-1].strip()
            continue
        if section != _MPT_CFG_SECTION:
            continue
        cle = _toml_ligne_cle(ligne)
        if cle and cle in _MPT_CFG_WHITELIST:
            _, _, droite = ligne.partition("=")
            valeurs[cle] = _toml_valeur_python(droite)
    return {"ok": True, "path": chemin, "section": _MPT_CFG_SECTION,
            "values": valeurs, "keys": sorted(_MPT_CFG_WHITELIST.keys())}


def mpt_ecrire_reglages(nouvelles):
    """Ecrit les reglages dans config.toml, en ne touchant QUE les lignes visees.

    Rend `{ok, ecrites, ignorees, reason?}`. Les cles hors liste blanche sont
    rapportees dans `ignorees` — l'interface peut le dire, et une faute de
    frappe ne se transforme jamais en ecriture silencieuse dans le fichier d'un
    autre programme.

    Ecriture ATOMIQUE (tmp + os.replace) : MPT relit ce fichier a chaque
    generation ; un fichier tronque par une coupure ferait echouer sa
    configuration entiere, pas seulement le reglage en cours."""
    if not isinstance(nouvelles, dict) or not nouvelles:
        return {"ok": False, "reason": "empty"}
    chemin = _mpt_config_path()
    if not chemin:
        return {"ok": False, "reason": "no-config"}

    acceptees = {k: v for k, v in nouvelles.items() if k in _MPT_CFG_WHITELIST}
    ignorees = sorted(k for k in nouvelles if k not in _MPT_CFG_WHITELIST)
    if not acceptees:
        return {"ok": False, "reason": "nothing-allowed", "ignorees": ignorees}

    try:
        with open(chemin, "r", encoding="utf-8", errors="replace") as f:
            contenu = f.read()
    except Exception as e:
        return {"ok": False, "reason": "read-failed", "error": str(e)}

    fin_de_ligne = "\r\n" if "\r\n" in contenu else "\n"
    lignes = contenu.split(fin_de_ligne)
    section, ecrites = None, []
    for i, ligne in enumerate(lignes):
        st = ligne.strip()
        if st.startswith("[") and st.endswith("]"):
            section = st[1:-1].strip()
            continue
        if section != _MPT_CFG_SECTION:
            continue
        cle = _toml_ligne_cle(ligne)
        if cle in acceptees:
            lignes[i] = cle + " = " + _toml_valeur(acceptees[cle], _MPT_CFG_WHITELIST[cle])
            ecrites.append(cle)

    # Une cle absente du fichier est AJOUTEE a la fin de la section [app].
    # On s'arrete a la section suivante ; si [app] est la derniere, on va au
    # bout. Jamais a la fin du fichier : une cle LLM atterrie dans [app] d'une
    # autre section serait ignoree par MPT sans le moindre message.
    manquantes = [k for k in acceptees if k not in ecrites]
    if manquantes:
        debut, fin = None, len(lignes)
        for i, ligne in enumerate(lignes):
            st = ligne.strip()
            if st.startswith("[") and st.endswith("]"):
                if debut is not None:
                    fin = i
                    break
                if st[1:-1].strip() == _MPT_CFG_SECTION:
                    debut = i
        if debut is None:
            # Section [app] absente : on la cree en fin de fichier.
            if lignes and lignes[-1].strip():
                lignes.append("")
            lignes.append("[%s]" % _MPT_CFG_SECTION)
            fin = len(lignes)
        bloc = [k + " = " + _toml_valeur(acceptees[k], _MPT_CFG_WHITELIST[k])
                for k in manquantes]
        # On insere AVANT la section suivante : a `fin`, ou fin vaut len(lignes)
        # si [app] est la derniere section.
        while fin > 0 and not lignes[fin - 1].strip():
            fin -= 1
        lignes[fin:fin] = bloc
        ecrites.extend(manquantes)

    nouveau = fin_de_ligne.join(lignes)
    tmp = chemin + ".theologicus.tmp"
    try:
        # Sauvegarde une fois par ecriture : c'est le fichier d'un AUTRE
        # programme. Sans filet, une edition fautive se decouvre apres coup.
        try:
            import shutil
            shutil.copy2(chemin, chemin + ".theologicus.bak")
        except Exception:
            pass
        with open(tmp, "w", encoding="utf-8", newline="") as f:
            f.write(nouveau)
        os.replace(tmp, chemin)
    except Exception as e:
        try:
            if os.path.isfile(tmp):
                os.remove(tmp)
        except Exception:
            pass
        return {"ok": False, "reason": "write-failed", "error": str(e)}
    return {"ok": True, "path": chemin, "ecrites": sorted(ecrites),
            "ignorees": ignorees}


def mpt_llm_tester():
    """Teste la configuration LLM ECRITE dans config.toml, depuis le relais.

    MPT n'expose AUCUNE route de test : `llm.test_connection()` n'existe que
    dans son processus. On ne peut donc pas lui demander de tester — mais on
    peut tester LA MEME CONFIGURATION, puisque c'est nous qui venons de
    l'ecrire. C'est le point important : ce qui est verifie est bien ce que la
    generation utilisera (meme base URL, meme cle, meme modele), pas une valeur
    saisie a l'ecran.

    Requete minimale (« Reply with exactly: OK »), comme le fait MPT : assez
    pour valider cle + URL + modele, sans consommer de quota inutilement."""
    reg = mpt_lire_reglages()
    if not reg.get("ok"):
        return {"ok": False, "connected": False,
                "error": "config illisible (%s)" % reg.get("reason")}
    v = reg.get("values", {})
    fournisseur = (v.get("llm_provider") or "").strip()
    if not fournisseur:
        return {"ok": False, "connected": False,
                "error": "aucun fournisseur LLM enregistre"}
    cle = str(v.get(fournisseur + "_api_key", "") or "").strip()
    base = str(v.get(fournisseur + "_base_url", "") or "").strip()
    modele = str(v.get(fournisseur + "_model_name", "") or "").strip()
    # Modele vide = on prend celui du registre, comme le fait MPT.
    if not modele:
        for p in mpt_llm_registre().get("providers", []):
            if p.get("id") == fournisseur:
                modele = p.get("default_model") or ""
                break
    if not base:
        for p in mpt_llm_registre().get("providers", []):
            if p.get("id") == fournisseur:
                eps = p.get("endpoints") or []
                if eps:
                    base = eps[0].get("base_url") or ""
                break
    if not cle:
        return {"ok": True, "connected": False, "fournisseur": fournisseur,
                "modele": modele, "base": base,
                "error": "aucune cle enregistree pour « %s »" % fournisseur}
    if not modele:
        return {"ok": True, "connected": False, "fournisseur": fournisseur,
                "base": base, "error": "aucun nom de modele enregistre"}
    if not base:
        return {"ok": True, "connected": False, "fournisseur": fournisseur,
                "modele": modele, "error": "aucune Base URL enregistree"}

    import json as _json
    import time as _t
    import urllib.request
    import urllib.error
    url = base.rstrip("/") + "/chat/completions"
    corps = _json.dumps({
        "model": modele,
        "messages": [{"role": "user", "content": "Reply with exactly: OK"}],
        "max_tokens": 8,
        "temperature": 0,
    }).encode("utf-8")
    entetes = {"Content-Type": "application/json", "Authorization": "Bearer " + cle}
    # Anthropic a son propre schema d'authentification et refuse un corps
    # OpenAI : on adapte, sinon le test echouerait sur une configuration
    # pourtant valide (et enverrait l'utilisateur chercher une faute de cle).
    if fournisseur == "anthropic":
        url = base.rstrip("/") + "/messages"
        corps = _json.dumps({
            "model": modele, "max_tokens": 8,
            "messages": [{"role": "user", "content": "Reply with exactly: OK"}],
        }).encode("utf-8")
        entetes = {"Content-Type": "application/json", "x-api-key": cle,
                   "anthropic-version": "2023-06-01"}
    t0 = _t.perf_counter()
    try:
        req = urllib.request.Request(url, data=corps, headers=entetes, method="POST")
        with _boucle_locale().open(req, timeout=30) as r:
            brut = r.read(4096)
        ecoule = _t.perf_counter() - t0
        try:
            rep = _json.loads(brut.decode("utf-8", "replace"))
        except Exception:
            rep = {}
        contenu = ""
        if isinstance(rep, dict):
            if rep.get("choices"):
                contenu = str((rep["choices"][0].get("message") or {}).get("content") or "")
            elif rep.get("content"):
                blocs = rep["content"]
                if isinstance(blocs, list) and blocs:
                    contenu = str(blocs[0].get("text") or "")
        return {"ok": True, "connected": True, "fournisseur": fournisseur,
                "modele": modele, "base": base, "elapsed": round(ecoule, 3),
                "reponse": contenu[:120]}
    except urllib.error.HTTPError as e:
        ecoule = _t.perf_counter() - t0
        try:
            detail = e.read(700).decode("utf-8", "replace")
        except Exception:
            detail = ""
        # On REMONTE le corps d'erreur tel quel : « 401 » seul ferait chercher
        # une faute d'authentification la ou le service dit « model not found ».
        return {"ok": True, "connected": False, "fournisseur": fournisseur,
                "modele": modele, "base": base, "elapsed": round(ecoule, 3),
                "http": e.code,
                "error": "HTTP %s — %s" % (e.code, detail.strip()[:400] or "sans corps")}
    except Exception as e:
        return {"ok": True, "connected": False, "fournisseur": fournisseur,
                "modele": modele, "base": base,
                "error": "%s: %s" % (type(e).__name__, e)}


def mpt_cache_stats(max_age_days=None):
    """Statistiques du cache video de MPT, mesurees directement sur le disque.

    On lit le dossier NOUS-MEMES plutot que d'appeler le service : le cache
    doit pouvoir etre mesure meme MPT arrete, et cela evite d'ajouter une route
    a un service qu'on ne maitrise pas. Le chemin reproduit celui de
    `cache_manager.video_cache_dir()` : `storage/cache_videos`.

    `max_age_days=None` compte TOUT ; un entier ne compte que les fichiers
    plus vieux que ce nombre de jours (c'est l'aperçu avant nettoyage)."""
    racines = _mpt_racines()
    if not racines:
        return {"ok": False, "reason": "no-dir"}
    racine = None
    for base in racines:
        cand = os.path.join(base, "storage", "cache_videos")
        if os.path.isdir(cand):
            racine = cand
            break
    if not racine:
        # Le dossier n'existe pas encore : ce n'est PAS une erreur, c'est un
        # cache vide. Rendre 0 plutot qu'un echec — sinon l'interface affiche
        # « indisponible » pour un service parfaitement sain.
        return {"ok": True, "dir": os.path.join(racines[0], "storage", "cache_videos"),
                "count": 0, "size": 0, "oldest": None, "newest": None}
    import time as _t
    maintenant = _t.time()
    nb, taille = 0, 0
    plus_vieux, plus_recent = None, None
    try:
        for entree in os.scandir(racine):
            try:
                if not entree.is_file():
                    continue
                st = entree.stat()
            except Exception:
                continue
            if max_age_days:
                if st.st_mtime >= maintenant - max_age_days * 86400:
                    continue
            nb += 1
            taille += st.st_size
            plus_vieux = st.st_mtime if plus_vieux is None else min(plus_vieux, st.st_mtime)
            plus_recent = st.st_mtime if plus_recent is None else max(plus_recent, st.st_mtime)
    except Exception as e:
        return {"ok": False, "reason": "scan-failed", "error": str(e)}
    fmt = lambda ts: _t.strftime("%Y-%m-%d", _t.localtime(ts)) if ts else None
    return {"ok": True, "dir": racine, "count": nb, "size": taille,
            "oldest": fmt(plus_vieux), "newest": fmt(plus_recent)}


def mpt_cache_nettoyer(max_age_days=None, confirme=False):
    """Supprime les fichiers du cache video.

    `confirme` doit valoir True : c'est une SUPPRESSION DE FICHIERS, et une
    requete construite a la main ne doit pas pouvoir la declencher par
    inadvertance. L'interface coche une case explicite avant d'activer le
    bouton, et ce garde-fou est repete ici — cote serveur, pas seulement cote
    interface, qui peut etre contournee.

    On ne supprime QUE des fichiers, jamais un sous-dossier : une suppression
    recursive dans un dossier de cache peut partir trop loin."""
    if not confirme:
        return {"ok": False, "reason": "not-confirmed"}
    st = mpt_cache_stats(max_age_days)
    if not st.get("ok"):
        return {"ok": False, "reason": st.get("reason", "scan-failed")}
    racine = st.get("dir")
    if not racine or not os.path.isdir(racine):
        return {"ok": True, "deleted": 0, "freed": 0, "failed": 0}
    # Garde-fou de chemin : on ne supprime que dans un dossier nomme
    # `cache_videos`, et jamais a la racine du service.
    if os.path.basename(os.path.normpath(racine)) != "cache_videos":
        return {"ok": False, "reason": "unsafe-dir"}
    import time as _t
    maintenant = _t.time()
    supprimes, liberes, echecs = 0, 0, 0
    try:
        for entree in os.scandir(racine):
            try:
                if not entree.is_file():
                    continue
                stf = entree.stat()
            except Exception:
                echecs += 1
                continue
            if max_age_days:
                if stf.st_mtime >= maintenant - max_age_days * 86400:
                    continue
            try:
                taille = stf.st_size
                os.remove(entree.path)
                supprimes += 1
                liberes += taille
            except Exception:
                echecs += 1
    except Exception as e:
        return {"ok": False, "reason": "clean-failed", "error": str(e),
                "deleted": supprimes, "freed": liberes, "failed": echecs}
    return {"ok": True, "deleted": supprimes, "freed": liberes, "failed": echecs}


def mpt_llm_registre():
    """Fournisseurs LLM tels que MPT les connait, lus depuis SON registre.

    Lire `app/models/llm_provider.py` plutot que recopier la liste : MPT en
    ajoute a chaque version, et une liste figee ici proposerait des
    fournisseurs qu'il ne sait pas router, ou en cacherait de nouveaux. Le
    fichier est du Python, pas un format de donnees — on en extrait ce qui est
    sur : l'identifiant, le libelle, le modele par defaut et les zones.

    En cas d'echec, on rend une liste VIDE avec la raison : l'interface le dit,
    au lieu d'afficher un sélecteur vide sans explication."""
    chemin = None
    for base in _mpt_racines():
        cand = os.path.join(base, "app", "models", "llm_provider.py")
        if os.path.isfile(cand):
            chemin = cand
            break
    if not chemin:
        return {"ok": False, "reason": "no-registry", "providers": []}
    try:
        with open(chemin, "r", encoding="utf-8", errors="replace") as f:
            src = f.read()
    except Exception as e:
        return {"ok": False, "reason": "read-failed", "error": str(e),
                "providers": []}

    fournisseurs, courant, profondeur, dans_entree = [], None, 0, False
    for ligne in src.splitlines():
        # On ne compte PAS les lignes de continuation (chaines concatenation
        # implicite `api_key_url=( "a" "b" )`) ni les commentaires : sinon la
        # profondeur derive et la fin d'entree tombe au mauvais endroit.
        code = ligne.split("#")[0]
        if not courant:
            if re.match(r'^\s*LLMProviderSpec\(\s*$', code):
                courant = {"id": None, "label": None, "default_model": "",
                           "endpoints": []}
                profondeur = code.count("(") - code.count(")")
                dans_entree = True
            continue
        # Dans une entree : lire les champs AVANT de mettre a jour la profondeur,
        # pour ne pas attribuer a la ligne suivante ce qui est sur celle-ci.
        # LLMProviderSpec("moonshot", "Kimi / Moonshot AI", … : les deux
        # premieres chaines nues sont l'identifiant puis le libelle, DANS CET
        # ORDRE. Les deux motifs sont donc identiques : c'est l'etat de
        # `courant` qui decide a qui l'on attribue la chaine, jamais le motif.
        m = re.match(r'^\s*"([^"]+)",?\s*$', code)
        if m:
            if courant["id"] is None:
                courant["id"] = m.group(1)
            elif courant["label"] is None:
                courant["label"] = m.group(1)
        m = re.search(r'default_model\s*=\s*"([^"]*)"', code)
        if m and not courant["default_model"]:
            courant["default_model"] = m.group(1)
        m = re.search(r'endpoint_id\s*=\s*"([^"]+)"', code)
        if m and not any(e["id"] == m.group(1) for e in courant["endpoints"]):
            courant["endpoints"].append({"id": m.group(1), "label": m.group(1),
                                         "base_url": ""})
        m = re.search(r'base_url\s*=\s*"([^"]+)"', code)
        if m and courant["endpoints"] and not courant["endpoints"][-1]["base_url"]:
            courant["endpoints"][-1]["base_url"] = m.group(1)
        m = re.search(r'default_label\s*=\s*"([^"]+)"', code)
        if m and courant["endpoints"]:
            courant["endpoints"][-1]["label"] = m.group(1)
        profondeur += code.count("(") - code.count(")")
        if profondeur <= 0 and dans_entree:
            if courant["id"]:
                fournisseurs.append(courant)
            courant, dans_entree = None, False
    if courant is not None and courant.get("id"):
        fournisseurs.append(courant)
    return {"ok": True, "count": len(fournisseurs), "providers": fournisseurs}


def mpt_fonts():
    """Polices de sous-titres REELLEMENT presentes dans l'installation MPT.

    Lire le dossier plutot que coder une liste : une police ajoutee par
    l'utilisateur doit apparaitre, et une police absente ne doit pas etre
    proposee (choisir une police manquante fait echouer le rendu des
    sous-titres, souvent a la toute fin de la production)."""
    racines = _mpt_racines()
    if not racines:
        return {"ok": False, "reason": "no-dir", "fonts": []}
    vues, polices = set(), []
    for base in racines:
        for rel in _MPT_FONT_DIRS:
            racine = os.path.join(base, *rel.split("/"))
            if not os.path.isdir(racine):
                continue
            try:
                for nom in sorted(os.listdir(racine)):
                    if not nom.lower().endswith((".ttf", ".ttc", ".otf")):
                        continue
                    if nom in vues:
                        continue
                    vues.add(nom)
                    polices.append(nom)
            except Exception:
                continue
    return {"ok": True, "fonts": polices, "count": len(polices)}


def mpt_voices(moteur=None):
    """Catalogue des voix, lu depuis le fichier de donnees de MPT.

    `data/azure_voices.json` est la source de verite du service. On reproduit
    la meme mise en forme que `get_all_azure_voices` (`<Nom>-<Genre>`) : c'est
    exactement ce que MPT attend dans `voice_name`. Si le fichier manque, on
    rend une liste VIDE et `ok:false` — surtout pas une liste inventee, qui
    ferait echouer la synthese avec une voix inexistante.

    `moteur` filtre la liste comme le fait MPT lui-meme (webui/Main.py) :
    Azure V1 EXCLUT les voix dont le nom contient « V2 », V2 ne garde QUE
    celles-la. Servir la liste complete pour V1 ferait choisir une voix que
    V1 ne sait pas lire — la synthese echouerait a la fin de la production.

    Les moteurs autres qu'Azure ne sont PAS listes ici : leurs voix viennent
    d'un service distant ou d'une configuration locale que MPT interroge
    lui-meme, et nous n'avons aucun moyen de les enumerer sans lui. On le dit
    (`externe: true`) plutot que de rendre la liste Azure, qui serait fausse.
    """
    if not _mpt_dir():
        return {"ok": False, "reason": "no-dir", "voices": []}
    rel = os.path.join("app", "services", "data", "azure_voices.json")
    chemin = next((os.path.join(r, rel) for r in _mpt_racines()
                   if os.path.isfile(os.path.join(r, rel))), None)
    if not chemin:
        return {"ok": False, "reason": "no-catalog", "voices": []}
    try:
        import json as _json
        with open(chemin, encoding="utf-8") as f:
            entrees = _json.load(f)
    except Exception as e:
        return {"ok": False, "reason": "bad-catalog", "voices": [], "error": str(e)}
    voix = []
    for item in entrees:
        try:
            nom, genre = item["name"], item["gender"]
        except Exception:
            continue
        if nom and genre:
            voix.append("%s-%s" % (nom, genre))
    # Azure seul a un catalogue enumerable ici. Les autres moteurs sont
    # signales comme externes AVANT le filtrage : melanger les deux ferait
    # croire a un catalogue complet.
    if moteur and moteur not in ("azure-tts-v1", "azure-tts-v2"):
        return {"ok": True, "voices": [], "count": 0, "moteur": moteur,
                "externe": True,
                "note": "Ce moteur est interroge par MoneyPrinterTurbo lui-meme ; "
                        "sa liste de voix n'est pas enumerable depuis ici."}
    if moteur == "azure-tts-v2":
        voix = [v for v in voix if "V2" in v]
    elif moteur == "azure-tts-v1":
        voix = [v for v in voix if "V2" not in v]
    voix.sort()
    return {"ok": True, "voices": voix, "count": len(voix), "moteur": moteur or ""}


# ── Moteurs de synthese vocale proposes par MPT ─────────────────────────────
# Recopie EXACTE de la liste de `webui/Main.py` (`tts_servers`). On ne
# l'invente pas : c'est le contrat entre l'interface et le service. Un moteur
# absent d'ici serait inchoisissable ; un moteur ajoute la-bas doit etre
# ajoute ici, sinon le choix reste fige sur Azure sans que rien ne le signale.
_MPT_TTS_SERVEURS = (
    ("azure-tts-v1", "Azure TTS V1 (Edge TTS)", True),
    ("azure-tts-v2", "Azure TTS V2", True),
    ("siliconflow", "SiliconFlow TTS", False),
    ("gemini-tts", "Google Gemini TTS", False),
    ("mimo-tts", "Xiaomi MiMo TTS", False),
    ("minimax-tts", "MiniMax TTS", False),
    ("elevenlabs", "ElevenLabs TTS", False),
    ("chatterbox", "Chatterbox TTS", False),
    ("kokoro", "Kokoro TTS", False),
    ("fish_audio", "Fish Audio TTS", False),
    ("voxcpm", "VoxCPM TTS", False),
)
# Modes de narration de MPT (`webui/Main.py` : VOICE_MODE_*).
_MPT_VOICE_MODES = (
    ("tts", "Auto — synthese vocale"),
    ("upload", "Audio fourni (upload)"),
    ("none", "Aucune — video muette"),
)

# ══════════════════════════════════════════════════════════════════════════
# Sources de videos et fournisseurs qui les alimentent
# ══════════════════════════════════════════════════════════════════════════
# Recopie de `webui/Main.py` : VIDEO_SOURCE_GROUPS donne les identifiants, et
# `video_source_labels` leur libelle. On ne fusionne PAS les deux dans une
# seule liste parce que le GROUPEMENT porte du sens : les banques de videos
# sont gratuites, les generateurs par IA sont PAYANTS a la seconde produite.
# Les melanger dans un seul menu deroulant ferait choisir un service facture
# en croyant choisir un stock d'images.
#
# `cle` = la cle de config.toml qui porte l'identifiant d'acces du fournisseur,
# `lien` = la page ou l'obtenir, recopiee de sa traduction anglaise (donc la
# page officielle que le service lui-meme indique, pas une page devinee).
_MPT_SOURCES_VIDEO = (
    # (id, libelle, groupe, cle de config, lien pour obtenir l'acces)
    ("pexels", "Pexels", "stock", "pexels_api_keys", "https://www.pexels.com/api/"),
    ("pixabay", "Pixabay", "stock", "pixabay_api_keys",
     "https://pixabay.com/api/docs/#api_search_videos"),
    ("coverr", "Coverr", "stock", "coverr_api_keys",
     "https://coverr.co/developers?ctx=header_navigation"),
    ("metaso_minimax", "Metaso · MiniMax H3", "ia", "metaso_minimax_api_key",
     "https://metaso.cn/minimax-h3/?s=MPT"),
    ("ofox", "OFox AI Video", "ia", "ofox_api_key",
     "https://ofox.ai/?utm_source=github&utm_medium=sponsorship&utm_content=moneyprinterturbo"),
    ("loomloom", "ShengSuan Cloud AI Video", "ia", "loomloom_api_token",
     "https://console.shengsuanyun.com/user/keys"),
    ("volcengine_seedance", "Volcano Engine Ark · Seedance", "ia",
     "volcengine_seedance_api_key",
     "https://console.volcengine.com/ark/region:ark+cn-beijing/apikey"),
    ("wavespeed", "WaveSpeed AI Video", "ia", "wavespeed_api_keys",
     "https://wavespeed.ai"),
    ("muapi", "MuAPI AI Video", "ia", "muapi_api_key", "https://muapi.ai"),
    ("openai_image", "OpenAI Compatible Text-to-Image", "image",
     "openai_image_api_keys", "https://api.openai.com/v1"),
    ("local", "Fichiers locaux", "local", "", ""),
)

# Fournisseurs de generation par IA : leur fiche complete (adresse, modele,
# resolution). Recopie des constantes DEFAULT_* de chaque `app/services/*.py`
# du service. Coder ces valeurs a la main dans l'interface les figeraient :
# une mise a jour du service changerait son defaut sans que l'interface le
# sache, et l'utilisateur enverrait un modele qui n'existe plus.
_MPT_FOURNISSEURS_IA = (
    {
        "id": "metaso_minimax", "label": "Metaso · MiniMax H3",
        "aide": "Genere de nouveaux plans via le proxy MiniMax H3 de Metaso. "
                "Chaque plan cree une tache asynchrone PAYANTE.",
        "cle": "metaso_minimax_api_key", "lien": "https://metaso.cn/minimax-h3/?s=MPT",
        "lien_titre": "Get one",
        "prefixe": "metaso_minimax",
        "champs": [
            ("base_url", "Base URL", "https://metaso.cn/api/minimax", None),
            ("resolution", "Resolution", "2K", ["768P", "2K"]),
        ],
    },
    {
        "id": "ofox", "label": "OFox AI Video",
        "aide": "Une seule cle pour plusieurs modeles de video, avec acces "
                "direct aux fournisseurs officiels. Paiement a l'usage.",
        "cle": "ofox_api_key", "lien": "https://ofox.ai/?utm_source=github",
        "lien_titre": "Get API Key",
        "prefixe": "ofox",
        "champs": [
            ("base_url", "Base URL", "https://api.ofox.ai/v1", None),
            ("text_to_video_model", "Modele texte-vers-video", "bytedance/seedance-2.0-fast", None),
            ("resolution", "Resolution", "720p", None),
            ("provider", "Fournisseur amont", "byteplus", ["byteplus", "volcengine", ""]),
        ],
    },
    {
        "id": "loomloom", "label": "ShengSuan Cloud AI Video",
        "aide": "Generation via ShengSuan Cloud. Le jeton est PARTAGE avec la "
                "generation de script : un seul acces sert aux deux.",
        "cle": "loomloom_api_token", "lien": "https://console.shengsuanyun.com/user/keys",
        "lien_titre": "Get an API Key",
        "prefixe": "loomloom",
        "champs": [
            ("base_url", "Base URL", "https://loomloom.shengsuanyun.com/loom/v1", None),
        ],
    },
    {
        "id": "volcengine_seedance", "label": "Volcano Engine Ark · Seedance",
        "aide": "Genere de nouveaux plans via l'API officielle Volcano Engine "
                "Ark Seedance. Chaque plan soumis est une tache Ark PAYANTE.",
        "cle": "volcengine_seedance_api_key",
        "lien": "https://console.volcengine.com/ark/region:ark+cn-beijing/apikey",
        "lien_titre": "Get API Key",
        "prefixe": "volcengine_seedance",
        "champs": [
            ("base_url", "Base URL", "https://ark.cn-beijing.volces.com/api/v3", None),
            ("model", "Modele ou identifiant de point de terminaison",
             "doubao-seedance-1-0-pro-250528", None),
            ("resolution", "Resolution", "1080p", ["480p", "720p", "1080p"]),
        ],
    },
    {
        "id": "wavespeed", "label": "WaveSpeed AI Video",
        "aide": "Genere de nouveaux plans avec les modeles texte-vers-video de "
                "WaveSpeed au lieu de chercher des images d'illustration. "
                "Facture par plan genere.",
        "cle": "wavespeed_api_keys", "lien": "https://wavespeed.ai",
        "lien_titre": "Get API Key",
        "prefixe": "wavespeed",
        "champs": [],
    },
    {
        "id": "muapi", "label": "MuAPI AI Video",
        "aide": "Generation de plans via MuAPI. Facture par plan genere.",
        "cle": "muapi_api_key", "lien": "https://muapi.ai",
        "lien_titre": "Get API Key",
        "prefixe": "muapi",
        "champs": [
            ("base_url", "Base URL", "https://api.muapi.ai/api/v1", None),
            ("video_endpoint", "Point de terminaison video", "seedance-lite-t2v", None),
            ("resolution", "Resolution", "480p", None),
        ],
    },
)


def mpt_sources_video():
    """Sources de videos : banques gratuites ET generateurs par IA.

    Rend `{ok, sources, groupes, ia:[fiches completes]}`. L'interface s'en
    sert pour remplir le menu « Video Source » ET pour construire les fiches de
    chaque fournisseur : une seule source de verite, donc un libelle ne peut
    pas diverger entre les deux endroits."""
    sources = [{"id": i, "label": lib, "groupe": g, "cle": cle, "lien": lien}
               for i, lib, g, cle, lien in _MPT_SOURCES_VIDEO]
    return {
        "ok": bool(_mpt_dir()),
        "reason": "" if _mpt_dir() else "no-dir",
        "sources": sources,
        "count": len(sources),
        "groupes": [
            {"id": "stock", "label": "Banques de videos"},
            {"id": "ia", "label": "Generation par IA (payant)"},
            {"id": "image", "label": "Image par IA"},
            {"id": "local", "label": "Fichiers locaux"},
        ],
        "ia": [dict(f) for f in _MPT_FOURNISSEURS_IA],
    }


def mpt_tts_moteurs():
    """Liste des moteurs TTS, leur libelle et s'ils sont enumerables ici."""
    moteurs = [{"id": i, "label": lib, "azure": az}
               for i, lib, az in _MPT_TTS_SERVEURS]
    return {
        "ok": bool(_mpt_dir()),
        "reason": "" if _mpt_dir() else "no-dir",
        "engines": moteurs,
        "count": len(moteurs),
        "modes": [{"id": i, "label": lib} for i, lib in _MPT_VOICE_MODES],
        "default": "azure-tts-v1",
    }


# Phrase d'ecoute. Recopiee VERBATIM de la traduction francaise livree avec le
# service (`webui/i18n/fr.json`, cle « Voice Example ») : l'utilisateur entend
# exactement ce qu'il a entendu dans MoneyPrinterTurbo, donc une difference de
# rendu ne peut pas venir du texte. Coder une phrase a nous rendrait toute
# comparaison impossible — et ferait accuser le mauvais coupable.
_MPT_PHRASE_ECOUTE = "Ceci est un exemple de texte pour tester la synthèse vocale"


def mpt_voice_preview(texte, voix=None, moteur=None, volume=None, vitesse=None):
    """Fait SYNTHETISER un court texte par MPT et rend le task_id a suivre.

    On passe par `POST /api/v1/audio`, qui appelle `create_task(..., stop_at=
    "audio")` : le service produit l'audio puis s'arrete AVANT la video. C'est
    la route la plus legere qui donne un son REELLEMENT produit par le service
    avec les reglages du moment — un apercu fabrique ailleurs ne prouverait
    rien sur ce que donnera la production.

    `tts_server` n'est PAS un champ de `AudioRequest` : le service lit le sien
    dans config.toml. On enregistre donc d'abord le moteur choisi, sinon
    l'ecoute porterait sur un moteur et la production sur un autre.
    """
    texte = (texte or "").strip()
    if not texte:
        # Le service refuse un `video_script` vide (Pydantic). Le dire ici
        # evite un aller-retour et un message d'erreur moins clair.
        return {"ok": False, "reason": "no-text"}
    if not mpt_status()["running"]:
        return {"ok": False, "reason": "not-running"}

    # On grave le moteur AVANT de synthetiser : c'est la seule facon d'etre sur
    # que l'apercu corresponde au reglage affiche. Sans cela, /api/v1/audio
    # utiliserait le moteur de config.toml et l'utilisateur ecouterait une voix
    # qu'il n'a pas choisie.
    if moteur:
        mpt_ecrire_reglages({"tts_server": moteur, "voice_mode": "tts"})

    corps = {"video_script": texte}
    if voix:
        corps["voice_name"] = voix
    if volume is not None:
        try:
            corps["voice_volume"] = float(volume)
        except Exception:
            pass
    if vitesse is not None:
        try:
            corps["voice_rate"] = float(vitesse)
        except Exception:
            pass

    ok, data = mpt_requete("POST", "/api/v1/audio", corps, timeout=60)
    if not ok:
        return {"ok": False, "reason": "service", "error": data}
    # La reponse est `{status, message, data:{task_id, request_id, params}}`.
    tid = ""
    if isinstance(data, dict):
        tid = ((data.get("data") or {}).get("task_id")
               or data.get("task_id") or "")
    if not tid:
        return {"ok": False, "reason": "no-task", "error": data}
    return {"ok": True, "task_id": tid, "texte": texte}


def mpt_voice_preview_resultat(task_id):
    """Etat d'une synthese d'ecoute, et URL locale du MP3 quand elle est prete.

    On ne renvoie PAS le chemin disque brut : l'interface doit pouvoir lire le
    son dans un lecteur. Le relais sert donc le fichier lui-meme (voir
    `mpt_voice_audio`), avec le bon type MIME — la route `/api/v1/download/`
    du service annonce `video/mp3` et force un telechargement, ce qui ne se
    lit pas dans un lecteur audio."""
    if not task_id or not re.fullmatch(r'[A-Za-z0-9_\-]{1,64}', task_id):
        return {"ok": False, "reason": "bad-id"}
    ok, data = mpt_requete("GET", "/api/v1/tasks/%s" % task_id, timeout=30)
    if not ok:
        return {"ok": False, "reason": "service", "error": data}
    t = (data or {}).get("data") or data or {}
    etat = t.get("state")
    # Etats du service : -1 echec, 1 complet, 4 en cours (const.py). On ne
    # devine pas : `audio_file` present est la preuve que le son existe.
    audio = t.get("audio_file") or ""
    if audio:
        return {"ok": True, "etat": etat, "pret": True,
                "url": "/mpt/voice/audio?task_id=" + task_id,
                "progress": t.get("progress")}
    if etat == -1:
        return {"ok": True, "etat": etat, "pret": False, "echec": True,
                "error": t.get("message") or "synthese interrompue"}
    return {"ok": True, "etat": etat, "pret": False, "progress": t.get("progress")}


def mpt_voice_audio(task_id):
    """Chemin disque du MP3 d'une tache, ou None. Borne au dossier de taches.

    `task_id` est deja valide par un motif strict, mais on revalide en chemin
    reel : c'est la seule barriere entre une URL et une lecture arbitraire."""
    if not task_id or not re.fullmatch(r'[A-Za-z0-9_\-]{1,64}', task_id):
        return None
    for base in _mpt_racines():
        d = os.path.join(base, "storage", "tasks", task_id)
        if not os.path.isdir(d):
            continue
        # Le motif ci-dessus interdit deja `/`, `\` et `..` : aucune remontee
        # n'est possible. On verifie quand meme le chemin REEL, car un lien
        # symbolique peut faire sortir du dossier sans que le nom y paraisse.
        racine = os.path.realpath(d)
        for nom in ("audio.mp3", "audio.wav", "audio.m4a", "audio.aac"):
            f = os.path.join(d, nom)
            if not os.path.isfile(f):
                continue
            reel = os.path.realpath(f)
            if reel == racine or reel.startswith(racine + os.sep):
                return f
    return None


def mpt_lancer():
    """Tente de demarrer le portatif MPT (api.bat) si l'utilisateur l'a
    installe. On ne l'EMBARQUE jamais : on se contente de lancer le script
    deja present sur le disque, comme le fait le raccourci Bureau.

    ATTENTION : `lance: True` signifie « le script est parti », PAS « le
    service repond ». MPT ouvre son port au bout de ~2 s (mesure faite sur
    cette machine). L'appelant doit sonder jusqu'a la CONDITION, jamais
    conclure au retour de cette fonction.
    """
    if mpt_status()["running"]:
        return {"ok": True, "deja": True, **mpt_status()}
    dossier = _mpt_dir()
    if not dossier:
        return {"ok": False, "reason": "no-dir", **mpt_status()}
    bat = os.path.join(dossier, "api.bat")
    if not os.path.isfile(bat):
        return {"ok": False, "reason": "no-bat", **mpt_status()}
    if os.name != "nt":
        return {"ok": False, "reason": "not-windows", **mpt_status()}
    try:
        flags = getattr(subprocess, "CREATE_NEW_CONSOLE", 0)
        subprocess.Popen(["cmd", "/c", bat], cwd=dossier, creationflags=flags)
        return {"ok": True, "lance": True, **mpt_status()}
    except Exception as e:
        _mpt["last_error"] = str(e)
        return {"ok": False, "reason": "spawn-failed", **mpt_status()}


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
        # v117 — sonde d'identité (voir PING_TOKEN). Ultra-légère et sans cache :
        # elle est appelée par le lanceur au démarrage, avant toute fenêtre.
        if self.path.split('?')[0] == '/__theologicus_ping':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(PING_TOKEN)
            return
        # LibreTranslate local : état (interrogé par PARAMÈTRES)
        if self.path.split('?')[0] == '/libretranslate/status':
            self._json_response(lt_status())
            return
        # Supertonic local : état (interrogé par PARAMÈTRES)
        if self.path.split('?')[0] == '/supertonic/status':
            self._json_response(st_status())
            return
        # ── MoneyPrinterTurbo (STUDIO VIDEO) ──────────────────────────
        # État du service voisin : port découvert, dossier installé.
        if self.path.split('?')[0] == '/mpt/status':
            self._json_response(mpt_status())
            return
        # Relais LECTURE SEULE de l'API MPT : liste des tâches.
        if self.path.split('?')[0] == '/mpt/tasks':
            ok, data = mpt_requete("GET", "/api/v1/tasks")
            self._json_response(data if ok else {"ok": False, "error": data})
            return
        # Catalogue des voix et des musiques : on ne code RIEN en dur, c'est
        # le service qui est la source de verite (mise a jour, nouvelle voix,
        # fichier ajoute dans resource/songs). Le modal se remplit a l'ouverture.
        # `?moteur=` filtre la liste comme MPT le fait lui-meme : Azure V1 ne
        # voit pas les voix V2, et reciproquement. Sans ce filtre, l'interface
        # proposerait une voix que le moteur choisi ne sait pas lire.
        if self.path.split('?')[0] == '/mpt/voices':
            params = parse_qs(urlparse(self.path).query)
            self._json_response(mpt_voices(params.get('moteur', [None])[0]))
            return
        # Moteurs TTS proposes par MPT, recopies de son WebUI.
        if self.path.split('?')[0] == '/mpt/tts/engines':
            self._json_response(mpt_tts_moteurs())
            return
        # Sources de videos (banques gratuites + generateurs par IA) et fiches
        # completes des fournisseurs IA. L'interface ne code AUCUN de ces
        # libelles : elle les demande, pour rester juste quand le service en
        # ajoute un ou change une adresse par defaut.
        if self.path.split('?')[0] == '/mpt/sources':
            self._json_response(mpt_sources_video())
            return
        # Suivi d'une synthese d'ecoute (« Voice Sample » / « Full Preview »).
        # La synthese est asynchrone cote service : on interroge jusqu'a ce que
        # `audio_file` existe, jamais en supposant un delai.
        if self.path.split('?')[0] == '/mpt/voice/preview':
            params = parse_qs(urlparse(self.path).query)
            self._json_response(mpt_voice_preview_resultat(params.get('task_id', [''])[0]))
            return
        # Le son de l'apercu, servi par NOUS : la route de telechargement du
        # service annonce `video/mp3` et pose un `Content-Disposition:
        # attachment` — le navigateur le telecharge au lieu de le lire dans le
        # lecteur audio de l'interface.
        if self.path.split('?')[0] == '/mpt/voice/audio':
            params = parse_qs(urlparse(self.path).query)
            f = mpt_voice_audio(params.get('task_id', [''])[0])
            if not f:
                self.send_error(404)
                return
            try:
                with open(f, 'rb') as fh:
                    body = fh.read()
            except Exception:
                self.send_error(404)
                return
            self.send_response(200)
            ext = os.path.splitext(f)[1].lower()
            self.send_header('Content-Type', {
                '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
                '.m4a': 'audio/mp4', '.aac': 'audio/aac',
            }.get(ext, 'application/octet-stream'))
            self.send_header('Content-Length', str(len(body)))
            # `inline` et non `attachment` : c'est un apercu a ecouter ici.
            self.send_header('Content-Disposition', 'inline; filename="apercu-voix' + ext + '"')
            self.end_headers()
            try:
                self.wfile.write(body)
            except Exception:
                pass
            return
        if self.path.split('?')[0] == '/mpt/fonts':
            self._json_response(mpt_fonts())
            return
        if self.path.split('?')[0] == '/mpt/musics':
            ok, data = mpt_requete("GET", "/api/v1/musics")
            self._json_response(data if ok else {"ok": False, "error": data})
            return
        # Fournisseurs LLM connus de MPT, lus depuis son propre registre.
        # L'interface ne recopie PAS cette liste : elle la demande, pour rester
        # juste quand MPT ajoute un fournisseur ou une zone de service.
        if self.path.split('?')[0] == '/mpt/llm/providers':
            self._json_response(mpt_llm_registre())
            return
        # Réglages de MPT (config.toml), en LECTURE. C'est ce que l'API HTTP du
        # service ne sait pas rendre : ses propres réglages ne sont écrits que
        # par son WebUI, dans le même processus que lui.
        if self.path.split('?')[0] == '/mpt/settings':
            self._json_response(mpt_lire_reglages())
            return
        # Statistiques du cache vidéo. `?jours=N` compte les fichiers plus
        # vieux que N jours (aperçu avant nettoyage) ; sans paramètre, tout.
        if self.path.split('?')[0] == '/mpt/cache':
            params = parse_qs(urlparse(self.path).query)
            jours = params.get('jours', [None])[0]
            try:
                jours = int(jours) if jours not in (None, '', '0') else None
            except Exception:
                jours = None
            self._json_response(mpt_cache_stats(jours))
            return
        # Config du Studio : formulaire (sujet, format, voix, sous-titres…).
        # Même emplacement hors-install que les clés et la config TTS, pour
        # que le formulaire SURVIVE à une mise à jour de l'exe.
        if self.path.split('?')[0] == '/mpt/config':
            chemin = os.path.join(_app_data_dir(), 'theologicus_studio.json')
            try:
                with open(chemin, 'rb') as f:
                    body = f.read()
            except Exception:
                body = b'{}'
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(body)
            return
        # Relais du téléchargement : le MP4 est renvoyé tel quel (pas de JSON).
        # Séparé de /download de MPT pour que le <video> du modal puisse
        # pointer directement dessus sans traverser une couche JSON.
        if self.path.startswith('/mpt/download/'):
            rel = self.path[len('/mpt/download/'):].split('?')[0]
            # Anti-traversée : MPT sert des fichiers sous storage/tasks, on
            # refuse tout chemin qui remonte ou sort de cette arborescence.
            if not rel or '..' in rel or rel.startswith('/') or ':' in rel:
                self.send_error(400, 'Invalid path')
                return
            st = mpt_status()
            if not st["running"]:
                self.send_error(503, 'MoneyPrinterTurbo not detected')
                return
            try:
                import urllib.request
                url = "http://127.0.0.1:%d/api/v1/download/%s" % (st["port"], rel)
                with urllib.request.urlopen(url, timeout=600) as r:
                    self.send_response(200)
                    self.send_header('Content-Type', r.headers.get('Content-Type', 'video/mp4'))
                    self.send_header('Cache-Control', 'no-store')
                    self.end_headers()
                    while True:
                        bloc = r.read(65536)
                        if not bloc:
                            break
                        self.wfile.write(bloc)
            except Exception as e:
                self.send_error(502, 'MPT download failed: %s' % e)
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
        # ── MoneyPrinterTurbo (STUDIO VIDEO) ──────────────────────────
        elif self.path.split('?')[0] == '/mpt/start':
            self._json_response(mpt_lancer())
        elif self.path.split('?')[0] == '/mpt/voice/preview':
            # Corps : {texte, voix?, moteur?, volume?, vitesse?}. Le texte est
            # borne : une « Full Preview » du script entier reste raisonnable,
            # mais on ne laisse pas un corps arbitraire partir vers le service.
            corps = self._lire_corps_json() or {}
            texte = corps.get('texte') or ''
            if len(texte) > 8000:
                texte = texte[:8000]
            self._json_response(mpt_voice_preview(
                texte, corps.get('voix'), corps.get('moteur'),
                corps.get('volume'), corps.get('vitesse')))
        elif self.path.split('?')[0] == '/mpt/submit':
            # Relais de création de tâche. Le corps du modal est transmis
            # TEL QUEL à /api/v1/videos : c'est MPT (Pydantic) qui valide,
            # donc aucune divergence de contrat possible entre nous deux.
            corps = self._lire_corps_json()
            if corps is None:
                self._json_response({"ok": False, "error": "Corps JSON invalide"})
                return
            ok, data = mpt_requete("POST", "/api/v1/videos", corps, timeout=60)
            self._json_response(data if ok else {"ok": False, "error": data})
        elif self.path.split('?')[0] == '/mpt/poll':
            corps = self._lire_corps_json() or {}
            tid = corps.get("task_id", "")
            # On ne laisse pas un identifiant arbitraire composer l'URL.
            if not tid or not re.fullmatch(r'[A-Za-z0-9_\-]{1,64}', tid):
                self._json_response({"ok": False, "error": "task_id invalide"})
                return
            ok, data = mpt_requete("GET", "/api/v1/tasks/%s" % tid, timeout=30)
            self._json_response(data if ok else {"ok": False, "error": data})
        elif self.path.split('?')[0] == '/mpt/delete':
            corps = self._lire_corps_json() or {}
            tid = corps.get("task_id", "")
            if not tid or not re.fullmatch(r'[A-Za-z0-9_\-]{1,64}', tid):
                self._json_response({"ok": False, "error": "task_id invalide"})
                return
            ok, data = mpt_requete("DELETE", "/api/v1/tasks/%s" % tid, timeout=30)
            self._json_response(data if ok else {"ok": False, "error": data})
        # ── GENERATION PAR IA (boutons « Generer avec l'IA ») ─────────
        # Trois relais vers l'API MPT. Le corps est transmis tel quel : MPT
        # valide (Pydantic), donc pas de divergence de contrat.
        # Timeout LARGE : ce sont des appels LLM, plusieurs dizaines de
        # secondes sont normales ; un delai court ferait croire a une panne.
        elif self.path.split('?')[0] in ('/mpt/script', '/mpt/terms', '/mpt/social'):
            cible = {'/mpt/script': '/api/v1/scripts',
                     '/mpt/terms': '/api/v1/terms',
                     '/mpt/social': '/api/v1/social-metadata'}[self.path.split('?')[0]]
            corps = self._lire_corps_json()
            if corps is None:
                self._json_response({"ok": False, "error": "Corps JSON invalide"})
                return
            ok, data = mpt_requete("POST", cible, corps, timeout=180)
            self._json_response(data if ok else {"ok": False, "error": data})
        # Config du Studio (formulaire : sujet, format, voix, sous-titres...)
        # Stockée HORS du dossier d'installation, comme la config TTS : elle
        # doit survivre à une mise à jour du exe, sinon l'utilisateur retape tout.
        elif self.path.split('?')[0] == '/mpt/config':
            self._save_studio()
        elif self.path.split('?')[0] == '/mpt/settings':
            self._save_mpt_settings()
        elif self.path.split('?')[0] == '/mpt/llm/test':
            self._json_response(mpt_llm_tester())
        elif self.path.split('?')[0] == '/mpt/cache':
            corps = self._lire_corps_json() or {}
            jours = corps.get('jours')
            try:
                jours = int(jours) if jours not in (None, '', 0) else None
            except Exception:
                jours = None
            self._json_response(mpt_cache_nettoyer(jours, confirme=bool(corps.get('confirme'))))
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

    def _lire_corps_json(self, max_octets=262144):
        """Corps JSON de la requête, ou None si illisible ou trop gros.

        Borné volontairement : ce corps repart vers un service tiers, on ne
        laisse pas une requête arbitrairement grosse consommer la mémoire du
        relais. 256 Ko suffisent largement pour un formulaire de studio.
        """
        try:
            length = int(self.headers.get('Content-Length', 0))
            if length <= 0 or length > max_octets:
                return None
            return json.loads(self.rfile.read(length).decode('utf-8'))
        except Exception:
            return None

    def _save_mpt_settings(self):
        """Écrit des réglages dans le config.toml de MoneyPrinterTurbo.

        Corps attendu : `{"values": {"pexels_api_keys": "k1,k2", ...}}`. La
        liste blanche est appliquée côté serveur (`mpt_ecrire_reglages`) : une
        clé inconnue est IGNORÉE et rapportée, jamais écrite. Cette route ne
        peut donc pas servir à modifier arbitrairement le fichier d'un autre
        programme, même si l'interface était compromise.
        """
        corps = self._lire_corps_json()
        if not isinstance(corps, dict):
            self.send_error(400, 'Invalid JSON body')
            return
        valeurs = corps.get('values')
        if not isinstance(valeurs, dict):
            self.send_error(400, 'Missing "values" object')
            return
        res = mpt_ecrire_reglages(valeurs)
        self._json_response(res)

    def _save_studio(self):
        """Enregistre theologicus_studio.json — le formulaire du STUDIO VIDEO.

        Même emplacement hors dossier d'installation que theologicus_keys.json
        et theologicus_config.json : une mise à jour du exe ne doit JAMAIS
        faire retaper le formulaire. Écriture atomique (tmp + os.replace),
        comme _save_config, pour qu'une coupure ne laisse pas un JSON tronqué.
        """
        try:
            length = int(self.headers.get('Content-Length', 0))
            if length <= 0 or length > 262144:
                raise ValueError('taille invalide')
            body = self.rfile.read(length)
            json.loads(body.decode('utf-8'))  # validation JSON
            cfg_path = os.path.join(_app_data_dir(), 'theologicus_studio.json')
            tmp_path = cfg_path + '.tmp'
            with open(tmp_path, 'wb') as f:
                f.write(body)
            os.replace(tmp_path, cfg_path)
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"ok":true}')
        except Exception as e:
            try:
                self.send_response(400)
                self.send_header('Content-Type', 'text/plain')
                self.end_headers()
                self.wfile.write(str(e).encode('utf-8', 'replace'))
            except Exception:
                pass

    def _lire_corps_json(self, max_octets=262144):
        """Corps JSON de la requête, ou None si illisible ou trop gros.

        Borné volontairement : ce corps repart vers un service tiers, on ne
        laisse pas une requête arbitrairement grosse consommer la mémoire du
        relais. 256 Ko suffisent largement pour un formulaire de studio.
        """
        try:
            length = int(self.headers.get('Content-Length', 0))
            if length <= 0 or length > max_octets:
                return None
            return json.loads(self.rfile.read(length).decode('utf-8'))
        except Exception:
            return None

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
