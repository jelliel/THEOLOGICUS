# -*- coding: utf-8 -*-
"""Preuve ExE : on lance le vrai THEOLOGICUS.exe (serveur seul) et on exerce
le bouton « Debuter » LibreTranslate via POST /libretranslate/start, puis on
sonde /languages sur le port 5000. Prouve que le correctif est dans l'artefact
livre, pas seulement dans le source."""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = r"C:\Theologicus"
EXE = os.path.join(ROOT, "dist", "THEOLOGICUS", "THEOLOGICUS.exe")
PORT = 8904
LT_PORT = 5000


def sonde(chemin, methode="GET", port=PORT, timeout=15, data=None):
    url = "http://127.0.0.1:%d%s" % (port, chemin)
    req = urllib.request.Request(url, method=methode, data=data)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        return None, "%s: %s" % (type(e).__name__, e)


def main():
    env = dict(os.environ)
    env["THEOLOGICUS_NO_WINDOW"] = "1"
    proc = subprocess.Popen([EXE, "--port", str(PORT)], cwd=os.path.dirname(EXE),
                            env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(60):
            if proc.poll() is not None:
                print("[X] exe arrete (code %s)" % proc.returncode); return 1
            code, _ = sonde("/libretranslate/status")
            if code == 200:
                break
            time.sleep(0.4)
        else:
            print("[X] exe injoignable"); return 1
        print("[OK] exe serveur repond")

        print("POST /libretranslate/start (bouton Debuter)...")
        code, corps = sonde("/libretranslate/start", methode="POST", timeout=30)
        print("  start ->", code, (corps[:160] if corps else ""))
        if code != 200:
            print("[ECHEC] start n'a pas repondu 200"); return 1

        print("attente pret (jusqu'a 45 s)...")
        pret = False
        for _ in range(45):
            code, corps = sonde("/libretranslate/status", timeout=5)
            try:
                d = json.loads(corps)
            except Exception:
                d = {}
            if d.get("ready"):
                pret = True
                break
            time.sleep(1)
        print("  pret :", pret)
        if not pret:
            print("[ECHEC] LibreTranslate non pret"); return 1

        # Verification reelle HTTP, independante du flag interne
        try:
            with urllib.request.urlopen("http://127.0.0.1:%d/languages" % LT_PORT, timeout=5) as u:
                body = u.read()
            print("  HTTP /languages ->", u.status, "octets", len(body), "OK" if body[:2] == b"[{" else "BAD")
            assert u.status == 200 and body[:2] == b"[{"
        except Exception as e:
            print("[ECHEC] probe HTTP :", e); return 1

        print("POST /libretranslate/stop...")
        code, _ = sonde("/libretranslate/stop", methode="POST", timeout=10)
        print("  stop ->", code)
        print("\nVERDICT : correctif LibreTranslate actif dans l'EXE (2.0.136).")
        return 0
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()


if __name__ == "__main__":
    sys.exit(main())
