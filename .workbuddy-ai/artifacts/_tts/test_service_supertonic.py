"""Cycle de vie complet du service Supertonic, a travers proxy_server.

Ce banc repond a une seule question : quand l'application demande le demarrage
du service, est-ce que (a) elle obtient un vrai service qui ecoute, (b) elle
sait dire POURQUOI quand ce n'est pas le cas ?

Il ne teste pas le moteur TTS lui-meme (c'est bench_v109_moteurs.js) : il teste
le demarrage automatique ajoute en v110.

Usage :
    python .workbuddy-ai/artifacts/_tts/test_service_supertonic.py
"""
import http.server
import json
import os
import sys
import threading
import time
import urllib.request

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
sys.path.insert(0, RACINE)
os.chdir(RACINE)

import proxy_server as P  # noqa: E402

PORT_BANC = 8777
P.ST_PORT = 8091

srv = http.server.ThreadingHTTPServer(("127.0.0.1", PORT_BANC), P.CORSProxyHandler)
srv.daemon_threads = True
threading.Thread(target=srv.serve_forever, daemon=True).start()
time.sleep(0.5)

echecs = []


def verifier(nom, condition, detail=None):
    print(("OK    " if condition else "ECHEC ") + nom + ("" if detail is None else "  -> " + str(detail)))
    if not condition:
        echecs.append(nom)


def appel(chemin, timeout=120, methode="GET"):
    # Les routes de commande sont en POST, comme celles de LibreTranslate
    # (l'app fait fetch(path, {method:'POST'})) ; seul /status est en GET.
    req = urllib.request.Request("http://127.0.0.1:%d%s" % (PORT_BANC, chemin), method=methode)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, json.loads(r.read().decode("utf-8"))


print("--- 1. Etat avant tout demarrage ---")
st = appel("/supertonic/status")[1]
print("   ", json.dumps(st, ensure_ascii=False))
verifier("l'endpoint d'etat repond", isinstance(st, dict))
verifier("l'interpreteur retenu a bien numpy et onnxruntime", st.get("deps") is True, st.get("python"))
verifier("le script du service est present", st.get("script") is True)
verifier("le port annonce est 8091", st.get("port") == 8091, st.get("port"))
deja = st.get("running")
verifier("rien ne tourne avant le demarrage", deja is False, deja)

print("\n--- 2. Demarrage ---")
t0 = time.time()
code, rep = appel("/supertonic/start", methode="POST")
print("   ", json.dumps({k: rep.get(k) for k in ("ok", "already", "reason", "last_error")}, ensure_ascii=False))
verifier("le demarrage est accepte", rep.get("ok") is True, rep.get("last_error"))

print("\n--- 3. Le service finit par etre pret (modele ONNX charge) ---")
pret = False
for i in range(45):
    time.sleep(1)
    st = appel("/supertonic/status")[1]
    if st.get("ready"):
        pret = True
        print("    pret apres %d s" % (i + 1))
        break
verifier("le service est pret", pret, json.dumps(st, ensure_ascii=False)[:220])

print("\n--- 4. Il rend vraiment de l'audio ---")
try:
    with urllib.request.urlopen("http://127.0.0.1:8091/tts?text=Bonjour&lang=fr&voice=F1", timeout=90) as r:
        data = r.read()
    verifier("le service rend un WAV", r.status == 200 and data[:4] == b"RIFF", "%d octets, entete %s" % (len(data), data[:4]))
except Exception as e:
    verifier("le service rend un WAV", False, e)

print("\n--- 5. Arret ---")
rep = appel("/supertonic/stop", methode="POST")[1]
verifier("l'arret est accepte", rep.get("ok") is True)
time.sleep(2)
st = appel("/supertonic/status")[1]
verifier("le service ne tourne plus", st.get("running") is False, st.get("running"))

print("\n" + ("VERDICT : 0 echec" if not echecs else "VERDICT : %d echec(s) -> %s" % (len(echecs), echecs)))
srv.shutdown()
sys.exit(1 if echecs else 0)
