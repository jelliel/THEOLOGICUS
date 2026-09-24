# -*- coding: utf-8 -*-
"""Verifie que l'exe Windows construit expose bien les routes du service local.

Pourquoi ce banc existe
-----------------------
`proxy_server.py` est compile DANS l'exe PyInstaller. Un correctif sur les
routes n'est donc visible qu'apres reconstruction : lire le source ne prouve
rien. Ce banc lance l'exe REEL en mode serveur seul (THEOLOGICUS_NO_WINDOW=1)
et interroge les routes par HTTP.

Deux pieges mesures le 2026-09-24, tous deux evites ici :

1. Un port ferme de cette machine repond HTTP 502, pas une erreur de
   connexion. `curl ... && echo OK` est donc un faux positif. On utilise
   urllib, qui leve, et on valide le CORPS JSON.
2. Chaque invocation d'outil shell a son propre espace reseau : un exe lance
   dans une invocation n'est pas joignable depuis la suivante. Lancement et
   sondage doivent donc tenir dans UN SEUL processus — c'est tout l'objet de
   ce script.

Usage : py -3.12 .workbuddy-ai/artifacts/_tts/verifie_exe.py
"""
import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = r"C:\Theologicus"
EXE = os.path.join(ROOT, "dist", "THEOLOGICUS", "THEOLOGICUS.exe")
PORT = 8902

echecs = []
verifications = 0


def ok(condition, libelle, detail=""):
    global verifications
    verifications += 1
    if condition:
        print("  [OK]   %s%s" % (libelle, (" — " + detail) if detail else ""))
    else:
        print("  [ECHEC] %s%s" % (libelle, (" — " + detail) if detail else ""))
        echecs.append(libelle)


def port_ouvert(port, timeout=1.0):
    try:
        s = socket.create_connection(("127.0.0.1", port), timeout=timeout)
        s.close()
        return True
    except OSError:
        return False


def sonde(chemin, methode="GET", port=PORT, timeout=15):
    """Rend (status, corps). status None si la connexion echoue."""
    url = "http://127.0.0.1:%d%s" % (port, chemin)
    try:
        req = urllib.request.Request(url, method=methode)
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        return None, "%s: %s" % (type(e).__name__, e)


def main():
    print("Banc — routes du service local dans l'exe construit")
    print("exe : %s" % EXE)
    print("")

    if not os.path.isfile(EXE):
        print("[X] exe absent : construire d'abord (tools/build_windows.py)")
        return 1

    env = dict(os.environ)
    env["THEOLOGICUS_NO_WINDOW"] = "1"
    proc = subprocess.Popen([EXE, "--port", str(PORT)], cwd=os.path.dirname(EXE),
                            env=env,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print("exe lance (pid %d), attente du port %d..." % (proc.pid, PORT))

    try:
        demarre = False
        limite = time.time() + 40
        while time.time() < limite:
            if proc.poll() is not None:
                print("[X] l'exe s'est arrete de lui-meme (code %s)" % proc.returncode)
                return 1
            if port_ouvert(PORT):
                demarre = True
                break
            time.sleep(0.4)
        ok(demarre, "le serveur integre repond sur le port %d" % PORT)
        if not demarre:
            return 1

        # --- /supertonic/status : LA route nouvelle de la v110 -------------
        print("")
        print("1. /supertonic/status")
        code, corps = sonde("/supertonic/status")
        ok(code == 200, "HTTP 200", "recu %s" % code)
        etat = None
        try:
            etat = json.loads(corps)
            ok(True, "corps JSON valide")
        except Exception as e:
            ok(False, "corps JSON valide", "%s — brut: %s" % (e, corps[:200]))

        if isinstance(etat, dict):
            for cle in ("running", "ready", "external", "deps", "python", "script", "port", "url"):
                ok(cle in etat, "champ '%s' present" % cle, repr(etat.get(cle)))
            # `script` est un BOOLEEN, pas un chemin : st_status() rend
            # os.path.isfile(...). C'est le contrat attendu par le JS, qui
            # teste `!etat.script` pour afficher « Service absent (dossier
            # tools) ». Ne pas le transformer en chemin sans verifier le
            # consommateur.
            ok(isinstance(etat.get("script"), bool),
               "'script' est bien un booleen (contrat du JS)",
               repr(etat.get("script")))
            ok(etat.get("script") is True,
               "le service est trouve A COTE DE L'EXE (tools/ livre par l'installeur)")
            # Verite terrain, independante du rapport du service.
            attendu = os.path.join(os.path.dirname(EXE), "tools", "start_supertonic.py")
            ok(os.path.isfile(attendu),
               "le fichier du service existe vraiment sur le disque",
               attendu)
            ok(isinstance(etat.get("deps"), bool),
               "'deps' est bien un booleen", repr(etat.get("deps")))
            ok(etat.get("port") == 8091, "port du service", repr(etat.get("port")))

        # --- non-regression : la route LibreTranslate deja livree ----------
        print("")
        print("2. /libretranslate/status (non-regression)")
        code, corps = sonde("/libretranslate/status")
        ok(code == 200, "HTTP 200", "recu %s" % code)
        try:
            d = json.loads(corps)
            ok(isinstance(d, dict), "corps JSON valide")
        except Exception as e:
            ok(False, "corps JSON valide", str(e))

        # --- la route de pilotage repond (POST) ----------------------------
        print("")
        print("3. POST /supertonic/stop (route de pilotage)")
        code, corps = sonde("/supertonic/stop", methode="POST")
        ok(code == 200, "HTTP 200", "recu %s" % code)
        try:
            d = json.loads(corps)
            ok("running" in d, "le corps rend l'etat", json.dumps(d)[:160])
        except Exception as e:
            ok(False, "corps JSON valide", "%s — brut: %s" % (e, corps[:160]))

        # --- l'application elle-meme est servie ----------------------------
        print("")
        print("4. l'application est servie")
        code, corps = sonde("/THEOLOGICUS.html")
        ok(code == 200, "HTTP 200", "recu %s" % code)
        ok("THEOLOGICUS" in corps[:4000], "le HTML servi est bien l'application",
           "%d octets" % len(corps))
        ok("__THEO_VERSION__" not in corps, "la version a ete tamponnee")

    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()

    print("")
    print("=" * 50)
    print("VERDICT : %d echec(s) sur %d verifications" % (len(echecs), verifications))
    for e in echecs:
        print("   - %s" % e)
    print("=" * 50)
    return 1 if echecs else 0


if __name__ == "__main__":
    sys.exit(main())
