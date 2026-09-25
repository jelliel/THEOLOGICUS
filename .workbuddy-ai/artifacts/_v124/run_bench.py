# Lanceur du banc v124 — TOUT dans la MEME invocation.
#
# Pourquoi ce script existe : un service voisin lance dans une invocation ne
# survit PAS a cette invocation, et un process detache disparait avec son
# shell. Enchaines ici, dans l'ordre :
#
#   1. MPT demarre, puis on le TUE  -> le banc part d'un service ARRET ;
#   2. le relais demarre             -> il doit survivre au banc ;
#   3. le banc s'execute             -> il ouvre le Studio, qui relance MPT.
#
# Lancer depuis C:\Theologicus :
#   "C:/Users/toshr/.workbuddy-ai/binaries/python/versions/3.13.12/python.exe" \
#       .workbuddy-ai/artifacts/_v124/run_bench.py

import os
import subprocess
import sys
import time
import urllib.request

RACINE = r"C:\Theologicus"
MPT_DIR = r"C:\Users\toshr\Desktop\MoneyPrinterTurbo-Portable-Windows-1.3.7"
PY = r"C:\Users\toshr\.workbuddy-ai\binaries\python\versions\3.13.12\python.exe"
NODE = r"C:\Users\toshr\.workbuddy-ai\binaries\node\versions\22.22.2-3\node.exe"
NODE_MODULES = r"C:\Users\toshr\.workbuddy-ai\binaries\node\workspace\node_modules"
BANC = os.path.join(RACINE, ".workbuddy-ai", "artifacts", "_v124",
                    "verify_studio_autostart.js")


def opener():
    """Sonde locale SANS proxy : `http_proxy` est honore meme pour 127.0.0.1
    et rendrait un 502 qui ressemble a une reponse du service."""
    return urllib.request.build_opener(urllib.request.ProxyHandler({}))


def ping(port, attente=1.0):
    try:
        with opener().open("http://127.0.0.1:%d/ping" % port, timeout=attente) as r:
            return r.read(16).decode("utf-8", "replace").strip() in ('pong', '"pong"')
    except Exception:
        return False


def relais_vivant():
    try:
        with opener().open("http://127.0.0.1:8765/mpt/status", timeout=2) as r:
            return r.status == 200
    except Exception:
        return False


def tuer_mpt():
    """Tue le processus qui ECOUTE sur 8080 — jamais « python.exe » en bloc,
    sinon on tue aussi le relais et le banc."""
    try:
        out = subprocess.run(["netstat", "-ano", "-p", "TCP"],
                             capture_output=True, text=True).stdout
        for ligne in out.splitlines():
            if ":8080" in ligne and "LISTENING" in ligne:
                pid = ligne.split()[-1]
                subprocess.run(["taskkill", "/F", "/PID", pid],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                print("[runner] MPT (pid %s) arrete" % pid)
                return True
    except Exception as e:
        print("[runner] arret MPT best-effort : %s" % e)
    return False


print("[runner] 1. MPT doit etre ARRETE au depart du banc")
tuer_mpt()
time.sleep(2)
print("[runner]    ping 8080 -> %s (attendu : False)" % ping(8080))

print("[runner] 2. Relais")
if relais_vivant():
    print("[runner]    deja en cours sur 8765")
else:
    subprocess.Popen([PY, "proxy_server.py"], cwd=RACINE,
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(20):
        time.sleep(1)
        if relais_vivant():
            break
    print("[runner]    relais vivant : %s" % relais_vivant())

if not relais_vivant():
    print("[runner] ECHEC : le relais ne repond pas sur 8765")
    sys.exit(2)

print("[runner] 3. Banc")
env = dict(os.environ)
env["NODE_PATH"] = NODE_MODULES
p = subprocess.run([NODE, BANC], cwd=RACINE, env=env)
print("\n[runner] code de sortie du banc : %d" % p.returncode)
sys.exit(p.returncode)
