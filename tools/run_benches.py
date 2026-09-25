#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Lance une serie de bancs en garantissant le relais pendant leur duree.

Pourquoi ce script existe
-------------------------
Dans cet environnement, un `proxy_server.py` lance en arriere-plan est reappe
des que l'invocation qui l'a lance se termine : il repond au premier appel,
puis meurt avant le suivant. Chaque banc qui « suppose » un relais deja vivant
echoue donc de facon intermittente — un echec qui accuse l'application alors
qu'il ne decrit que l'environnement.

La regle est : le relais appartient a une seule invocation, celle qui execute
les bancs. Ce script le lance, attend qu'il reponde REELLEMENT (par condition,
pas par delai fixe), execute chaque banc comme sous-processus, puis le referme.

Il ne modifie jamais un banc : un banc qui ment sur ses resultats est pire
qu'un banc qui echoue.

Usage
-----
    python tools/run_benches.py .workbuddy-ai/artifacts/_v126/verify_sources_mpt.py [...]

Options
-------
    --port N     port du relais (defaut 8765)
    --keep       ne pas arreter le relais a la fin (pour inspection)
"""
import os
import subprocess
import sys
import time
import urllib.request

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PORT = 8765
GARDER = False
AVEC_MPT = False
BANCS = []
args = sys.argv[1:]
i = 0
while i < len(args):
    if args[i] == "--port" and i + 1 < len(args):
        PORT = int(args[i + 1]); i += 2
    elif args[i] == "--keep":
        GARDER = True; i += 1
    elif args[i] == "--mpt":
        AVEC_MPT = True; i += 1
    else:
        BANCS.append(args[i]); i += 1

BASE = "http://127.0.0.1:%d" % PORT
_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def relais_vivant():
    try:
        with _OPENER.open(BASE + "/__theologicus_ping", timeout=3) as r:
            return r.status == 200
    except Exception:
        return False


def demarrer():
    if relais_vivant():
        print("relais deja vivant sur %s" % BASE)
        return None
    print("lancement de proxy_server.py …")
    p = subprocess.Popen([sys.executable, "-u", "proxy_server.py"],
                         cwd=RACINE,
                         stdout=subprocess.DEVNULL,
                         stderr=subprocess.DEVNULL)
    for _ in range(80):                      # 80 x 0,5 s = 40 s au plus
        time.sleep(0.5)
        if relais_vivant():
            print("relais pret sur %s (pid %d)" % (BASE, p.pid))
            return p
        if p.poll() is not None:
            print("[ECHEC] le relais s'est arrete (code %s)" % p.returncode)
            return None
    print("[ECHEC] le relais n'a pas repondu a temps")
    return None


if not BANCS:
    print("aucun banc indique.")
    print(__doc__)
    sys.exit(2)

relais = demarrer()
if relais is None and not relais_vivant():
    sys.exit(2)


def mpt_etat():
    try:
        with _OPENER.open(BASE + "/mpt/status", timeout=10) as r:
            import json
            return json.loads(r.read().decode("utf-8", "replace"))
    except Exception:
        return None


if AVEC_MPT:
    # Demarrer MPT par le RELAIS, jamais a la main : lance dans un autre
    # processus, il mourrait avec lui. Le relais est le seul proprietaire.
    print("demarrage du service MPT …")
    try:
        req = urllib.request.Request(BASE + "/mpt/start", data=b"{}",
                                     headers={"Content-Type": "application/json"},
                                     method="POST")
        with _OPENER.open(req, timeout=30) as r:
            r.read()
    except Exception as e:
        print("  [ECHEC] POST /mpt/start : %s" % e)
    pret = False
    for _ in range(120):                      # 120 x 1 s = 2 min au plus
        time.sleep(1)
        st = mpt_etat() or {}
        if st.get("running"):
            print("service MPT pret (port %s)" % st.get("port"))
            pret = True
            break
    if not pret:
        print("  [ATTENTION] le service MPT n'est pas pret : les bancs qui en "
              "dependent ne peuvent rien prouver.")

codes = []
print("=" * 74)
for b in BANCS:
    chemin = b if os.path.isabs(b) else os.path.join(RACINE, b)
    if not os.path.exists(chemin):
        print("\n[INTROUVABLE] %s" % b)
        codes.append((b, 127))
        continue
    py = sys.executable
    cmd = [py, "-u", chemin]
    if chemin.endswith(".js"):
        py = "C:/Users/toshr/.workbuddy-ai/binaries/node/versions/22.22.2-3/node.exe"
        cmd = [py, chemin]
    print("\n### %s" % os.path.basename(b))
    print("-" * 74)
    env = dict(os.environ)
    env.setdefault("NODE_PATH",
                   "C:/Users/toshr/.workbuddy-ai/binaries/node/workspace/node_modules")
    r = subprocess.run(cmd, cwd=RACINE, env=env)
    codes.append((b, r.returncode))

if relais is not None and not GARDER:
    try:
        relais.terminate()
        relais.wait(timeout=5)
    except Exception:
        relais.kill()

print("\n" + "=" * 74)
print("SYNTHESE")
print("=" * 74)
echecs = 0
for b, c in codes:
    etat = "OK    " if c == 0 else "ECHEC "
    if c != 0:
        echecs += 1
    print("  %s %-52s (code %s)" % (etat, os.path.basename(b), c))
print("=" * 74)
sys.exit(1 if echecs else 0)
