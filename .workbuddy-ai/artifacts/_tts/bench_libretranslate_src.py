# -*- coding: utf-8 -*-
"""Preuve du correctif LibreTranslate : on importe le proxy_server source
et on exerce le vrai chemin que le bouton « Démarrer » appelle
(lt_start -> lance py -m libretranslate.main -> lt_status)."""
import importlib.util
import os
import time
import urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("proxy_src", os.path.join(ROOT, "proxy_server.py"))
px = importlib.util.module_from_spec(spec)
spec.loader.exec_module(px)

print("=== _lt_python_cmd() ===")
cmd = px._lt_python_cmd()
print("  interpeteur retenu :", cmd)

print("=== lt_installed() ===")
print("  installe :", px._lt_installed())

print("=== lt_start() (bouton Debuter) ===")
r = px.lt_start()
print("  retour :", r.get("ok"), r.get("reason", ""), "| running=", r.get("running"))
assert r.get("ok") is True, "lt_start a echoue : %r" % r
proc = px._lt.get("proc")
assert proc is not None and proc.poll() is None, "processus non demarre (proc=%r)" % proc

print("=== attente demarrage modele (jusqu'a 40 s) ===")
pret = False
for _ in range(40):
    st = px.lt_status()
    if st.get("ready"):
        pret = True
        break
    time.sleep(1)
print("  pret (HTTP /languages) :", pret)
assert pret, "LibreTranslate n'a pas repondu sur /languages"

# Verification reelle par HTTP, pas seulement par le flag interne
try:
    with urllib.request.urlopen("http://127.0.0.1:%d/languages" % px.LT_PORT, timeout=5) as u:
        body = u.read()
    print("  HTTP /languages :", u.status, "octets=", len(body), "RIFF-like:", body[:2] == b"[{")
    assert u.status == 200 and body[:2] == b"[{"
except Exception as e:
    raise AssertionError("probe HTTP a echoue : %s" % e)

print("=== lt_stop() ===")
s = px.lt_stop()
print("  stop :", s.get("ok"), "| running=", s.get("running"))
assert s.get("running") is False

print("\nVERDICT : correctif LibreTranslate OK (py -m libretranslate.main fonctionne).")
