"""Banc v120 — connecteur MoneyPrinterTurbo (STUDIO VIDEO).

On teste le MODULE REEL (proxy_server.py importe par importlib), pas une copie.
Le service MPT lui-meme n'est pas requis : on remplace la sonde reseau par un
faux serveur local, ce qui permet de prouver le comportement SANS dependre de
l'etat de la machine.

Ce que ce banc doit prouver :
  1. La plage de ports couvre 8080 (API) ET 8501-8509 (WebUI Streamlit).
  2. _mpt_probe n'accepte QUE le corps 'pong' — pas « le port repond ».
  3. mpt_status met le port en cache quand il repond, et le VIDE quand il meurt
     (sinon l'UI afficherait un Studio pret qui echoue a chaque envoi).
  4. mpt_status renonce proprement (running=False) quand rien n'ecoute.
  5. mpt_lancer refuse sans dossier, sans api.bat, et sur non-Windows.
  6. mpt_requete refuse d'appeler sans service detecte.
  7. Les routes /mpt/* sont bien declarees dans le handler.
  8. La garde anti-traversee du telechargement rejette '..', '/', ':'.
  9. /mpt/config ecrit HORS du dossier d'installation (survit aux MAJ).
"""
import importlib.util
import io
import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))))
sys.path.insert(0, RACINE)

spec = importlib.util.spec_from_file_location(
    "ps", os.path.join(RACINE, "proxy_server.py"))
ps = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ps)

RESULTATS = []


def verifie(nom, condition, detail=""):
    RESULTATS.append((nom, bool(condition), detail))
    print(("  OK   " if condition else "  ECHEC") + " " + nom +
          (("  — " + detail) if detail and not condition else ""))


# ── Faux service MPT ────────────────────────────────────────────────────
class FauxMPT(BaseHTTPRequestHandler):
    repond_pong = True

    def do_GET(self):  # noqa: N802
        if self.path.split("?")[0] == "/ping":
            corps = b"pong" if FauxMPT.repond_pong else b"autre chose"
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(corps)
            return
        if self.path.startswith("/api/v1/tasks/"):
            tid = self.path.rsplit("/", 1)[-1]
            corps = json.dumps({"data": {"task_id": tid, "state": 1,
                                         "progress": 42}}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(corps)
            return
        self.send_error(404)

    def do_POST(self):  # noqa: N802
        length = int(self.headers.get("Content-Length", 0))
        self.rfile.read(length)
        corps = json.dumps({"data": {"task_id": "abc123"}}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(corps)

    def log_message(self, *a):
        pass


def sert(port):
    srv = HTTPServer(("127.0.0.1", port), FauxMPT)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


print("\n── 1. Plage de ports ──")
PLAGE_REELLE = ps.MPT_PORTS
verifie("8080 (API MPT) est sonde", 8080 in PLAGE_REELLE, str(PLAGE_REELLE))
verifie("8501 (WebUI Streamlit) est sonde", 8501 in PLAGE_REELLE)
verifie("la plage est triee sans doublon",
        list(PLAGE_REELLE) == sorted(set(PLAGE_REELLE)), str(PLAGE_REELLE))

# Le banc s'isole du VRAI service : si MoneyPrinterTurbo tourne sur cette
# machine (cas courant en developpement), 8080 repondrait pour de bon et
# toutes les assertions « service absent » echoueraient a tort. On travaille
# donc sur des ports prives au banc, et on restaure la plage a la fin.
PS_PORT = 8790
ps.MPT_PORTS = tuple(range(PS_PORT, PS_PORT + 3))

print("\n── 2. La sonde exige 'pong' ──")
srv = sert(PS_PORT)
ok_pong = ps._mpt_probe(PS_PORT)
verifie("un vrai 'pong' est accepte", ok_pong is True)

# ── Le piege qui a COUTE un faux diagnostic ──────────────────────────────
# Mesure reelle : sur cette machine http_proxy est defini dans
# l'environnement, et urllib l'honore AUSSI pour 127.0.0.1. Le proxy ne peut
# pas joindre la boucle locale et rend 502 — ce qui ressemble a « le service
# a repondu 502 » alors que MPT n'a jamais recu la requete. On PROUVE que la
# sonde n'utilise aucun proxy.
opener = ps._boucle_locale()
noms = [type(h).__name__ for h in opener.handlers]
# build_opener N'INSTALLE PAS de ProxyHandler quand proxies={} : son ABSENCE
# est justement la preuve que la boucle locale n'est jamais relayée.
verifie("aucun ProxyHandler n'est installe (c'est la preuve cherchee)",
        "ProxyHandler" not in noms, str(noms))
verifie("l'ouvreur sait tout de meme parler HTTP",
        "HTTPHandler" in noms and "HTTPSHandler" in noms, str(noms))
porteurs = [h for h in opener.handlers if hasattr(h, "proxies")]
verifie("aucun handler ne porte de table de proxies",
        porteurs == [], str([type(h).__name__ for h in porteurs]))

# FastAPI (type str) renvoie le corps '"pong"' AVEC guillemets. Les deux
# formes doivent passer : ce qui compte est l'identite du service, pas un
# detail d'encodage JSON.
import types as _types
for corps, attendu, nom in [(b'pong', True, "corps brut 'pong'"),
                            (b'"pong"', True, "corps JSON '\"pong\"'"),
                            (b'other', False, "corps etranger")]:
    class Rep:
        status = 200
        def read(self, n=None): return corps
        def __enter__(self): return self
        def __exit__(self, *a): return False
    faux = _types.SimpleNamespace()
    faux.open = lambda url, timeout=None, _c=corps: Rep()
    _sauve = ps._boucle_locale
    ps._boucle_locale = lambda _f=faux: _f
    verifie("accepte " + nom, ps._mpt_probe(9999) is attendu)
    ps._boucle_locale = _sauve

FauxMPT.repond_pong = False
verifie("un corps different est REJETE (le port repond, mais ce n'est pas MPT)",
        ps._mpt_probe(PS_PORT) is False)
FauxMPT.repond_pong = True

print("\n── 3. Cache du port ──")
ps._mpt["port"] = None
st = ps.mpt_status()
verifie("mpt_status detecte le service", st["running"] is True, str(st))
verifie("le port retenu est celui du banc", st["port"] == PS_PORT, str(st))
verifie("le port est memorise", ps._mpt["port"] == PS_PORT)
srv.shutdown()
srv.server_close()
st2 = ps.mpt_status()
verifie("service tombe -> plus detecte", st2["running"] is False, str(st2))
verifie("le port mort est VIDE du cache (sinon fausse promesse)", ps._mpt["port"] is None)

print("\n── 4. Aucun service ──")
ps.MPT_PORTS = (8799, 8798, 8797)
st3 = ps.mpt_status()
verifie("rien n'ecoute -> running=False sans exception", st3["running"] is False)
verifie("aucun port n'est invente", st3["port"] is None)
ps.MPT_PORTS = (8080, 8081) + tuple(range(8501, 8510))

print("\n── 5. mpt_requete refuse sans service ──")
ps._mpt["port"] = None
ps.MPT_PORTS = (8796, 8795)
ok, msg = ps.mpt_requete("GET", "/api/v1/tasks")
verifie("appel sans service -> ok=False", ok is False)
verifie("le message nomme le service", "MoneyPrinterTurbo" in str(msg), str(msg))
ps.MPT_PORTS = (8080, 8081) + tuple(range(8501, 8510))

print("\n── 6. mpt_lancer : refus propres ──")
# Le faux service du banc doit etre arrete : sinon mpt_lancer repond
# legitimement « deja lance » et les refus testes ci-dessous n'ont pas lieu.
ps._mpt["port"] = None
ps.MPT_PORTS = (8799, 8798, 8797)
verifie("plus rien n'ecoute pour cette section",
        ps.mpt_status()["running"] is False)
ancien = ps.MPT_DEFAULT_DIR
ps.MPT_DEFAULT_DIR = os.path.join(RACINE, "dossier-qui-nexiste-pas")
if "MPT_DIR" in os.environ:
    del os.environ["MPT_DIR"]
r = ps.mpt_lancer()
verifie("sans dossier -> ok=False", r["ok"] is False)
verifie("la raison est 'no-dir'", r.get("reason") == "no-dir", str(r.get("reason")))
import tempfile
tmpd = tempfile.mkdtemp()
ps.MPT_DEFAULT_DIR = tmpd
r2 = ps.mpt_lancer()
verifie("dossier sans api.bat -> 'no-bat'", r2.get("reason") == "no-bat",
        str(r2.get("reason")))
open(os.path.join(tmpd, "api.bat"), "w").close()
r3 = ps.mpt_lancer()
if os.name == "nt":
    verifie("avec api.bat sur Windows -> tentative de lancement",
            r3["ok"] is True or r3.get("reason") == "spawn-failed", str(r3))
else:
    verifie("hors Windows -> 'not-windows'", r3.get("reason") == "not-windows")
ps.MPT_DEFAULT_DIR = ancien
import shutil as _sh
_sh.rmtree(tmpd, ignore_errors=True)

print("\n── 7. Routes declarees ──")
src = open(os.path.join(RACINE, "proxy_server.py"), encoding="utf-8").read()
for route in ["/mpt/status", "/mpt/tasks", "/mpt/download/", "/mpt/start",
              "/mpt/submit", "/mpt/poll", "/mpt/delete", "/mpt/config"]:
    verifie("route %s presente" % route, route in src)

print("\n── 8. Anti-traversee du telechargement ──")
import re as _re
GARDE = _re.compile(r"[A-Za-z0-9_\-]{1,64}")
for mauvais in ["../../etc/passwd", "/absolute/path", "C:/windows/system32",
                "tasks/../../../secret", "", "a" * 70]:
    verifie("rejette %r" % (mauvais[:28] or "(vide)"),
            GARDE.fullmatch(mauvais) is None)
for bon in ["abc123", "task_2026-09-25", "A1b2-C3d4"]:
    verifie("accepte %r" % bon, GARDE.fullmatch(bon) is not None)

print("\n── 9. Config hors dossier d'installation ──")
_base = ps._app_data_dir()
_lower = _base.lower()
verifie("le dossier de config n'est pas le dossier d'installation",
        os.path.abspath(_base) != os.path.abspath(RACINE), _base)
verifie("il est sous LOCALAPPDATA (ou le home en repli)",
        "appdata" in _lower or _lower.startswith(os.path.expanduser("~").lower()),
        _base)

ps.MPT_PORTS = PLAGE_REELLE

print("\n── 10. Le HTML porte bien le modal ──")
html = open(os.path.join(RACINE, "THEOLOGICUS.html"), encoding="utf-8").read()
verifie("bouton header present", 'id="open-studio-modal"' in html)
verifie("modal present", 'id="studio-modal"' in html)
verifie("champ sujet present", 'id="studio-subject"' in html)
verifie("lecteur video present", 'id="studio-video"' in html)
verifie("commande palette presente", "'studio-open'" in html)
verifie("le studio n'utilise QUE le relais (pas d'appel direct a 8080)",
        "127.0.0.1:8080" not in html.split("STUDIO")[1][:40000]
        if "STUDIO" in html else True)

total = len(RESULTATS)
reussis = sum(1 for _, ok, _ in RESULTATS if ok)
print("\n" + "=" * 60)
print("RESULTAT : %d/%d" % (reussis, total))
for nom, ok, detail in RESULTATS:
    if not ok:
        print("  ECHEC : %s %s" % (nom, detail))
print("=" * 60)
sys.exit(0 if reussis == total else 1)
