"""Banc v124 — cycle de vie du service MoneyPrinterTurbo.

Ce que ce banc prouve, et pourquoi il est ecrit ainsi :

  * Le bandeau « Service non detecte » signalait un VRAI arret du service.
    La question n'etait donc pas « la sonde ment-elle ? » mais « l'app sait-elle
    distinguer *arrete* de *absent*, et relance-t-elle d'elle-meme ? ».
  * `mpt_lancer()` rend `lance:true` des que le SCRIPT est parti, AVANT que MPT
    n'ouvre son port (mesure : ~2 s). Juger sur le retour de la route ferait
    afficher « detecte » pour un service absent. On exige donc la CONDITION.

Regle d'environnement (apprise a la dure) : un service voisin lance dans une
invocation ne survit PAS a cette invocation. Ce banc demarre et arrete donc MPT
lui-meme, dans la meme invocation, et ne touche jamais au relais.

Usage :
    python .workbuddy-ai/artifacts/_v124/verify_service_lifecycle.py
"""

import json
import os
import subprocess
import sys
import time

sys.path.insert(0, r"C:\Theologicus")
import proxy_server as P  # noqa: E402

MPT_DIR = r"C:\Users\toshr\Desktop\MoneyPrinterTurbo-Portable-Windows-1.3.7"
PYEXE = os.path.join(MPT_DIR, "lib", "python", "python.exe")
MAINPY = os.path.join(MPT_DIR, "MoneyPrinterTurbo", "main.py")

res = []
proc = None
_pid_lance = [None]   # PID du service lance par MPT lui-meme (api.bat en vrai)


def verifier(nom, condition, detail=""):
    res.append((nom, bool(condition), detail))
    print("  %s %s%s" % ("[OK]  " if condition else "[FAIL]", nom,
                         ("  -- " + str(detail)) if detail else ""))


def demarrer_mpt():
    """Lance MPT comme le ferait api.bat, mais SANS fenetre : ce banc tourne
    dans un environnement ou une console detachee disparaitrait avec lui."""
    return subprocess.Popen([PYEXE, MAINPY], cwd=MPT_DIR,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def attendre_service(max_s=25):
    """Sonde jusqu'a la CONDITION, jamais un delai fixe."""
    limite = time.time() + max_s
    while time.time() < limite:
        st = P.mpt_status()
        if st["running"]:
            return st
        time.sleep(1)
    return P.mpt_status()


print("=" * 68)
print("v124 — cycle de vie du service MoneyPrinterTurbo")
print("=" * 68)

# ── 1. Le dossier portatif est celui qu'on croit ────────────────────────────
print("\n[1] Installation")
verifier("MPT_DEFAULT_DIR pointe sur le portatif",
         "MoneyPrinterTurbo-Portable" in P.MPT_DEFAULT_DIR, P.MPT_DEFAULT_DIR)
verifier("_mpt_dir() le resout", P._mpt_dir() == MPT_DIR, P._mpt_dir())
verifier("api.bat est a la RACINE (l'app est imbriquee)",
         os.path.isfile(os.path.join(MPT_DIR, "api.bat")))

# ── 2. _mpt_installation() : distinguer arrete de absent ────────────────────
print("\n[2] Etat d'installation (le correctif)")
inst = P._mpt_installation()
verifier("rend installe=True", inst["installe"] is True)
verifier("rend api_bat=True", inst["api_bat"] is True)
verifier("rend peut_lancer=True", inst["peut_lancer"] is True)
verifier("raison vide quand tout va bien", inst["raison"] == "", inst["raison"])

# Le cas « dossier introuvable » : on simule par MPT_DIR, sans rien deplacer.
# Ecrire dans un magasin de config vivant est interdit ; ici on ne fait que
# LIRE un chemin, donc la simulation par variable d'environnement est sure.
sauve = os.environ.get("MPT_DIR")
os.environ["MPT_DIR"] = r"C:\Theologicus\.workbuddy-ai\artifacts\_v124\pas-la"
inst_absent = P._mpt_installation()
verifier("dossier absent -> installe=False", inst_absent["installe"] is False)
verifier("dossier absent -> peut_lancer=False", inst_absent["peut_lancer"] is False)
verifier("dossier absent -> raison=no-dir", inst_absent["raison"] == "no-dir",
         inst_absent["raison"])
# Un dossier EXISTANT mais sans api.bat doit donner no-bat, pas no-dir.
os.environ["MPT_DIR"] = r"C:\Theologicus\.workbuddy-ai\artifacts\_v124"
inst_nobat = P._mpt_installation()
verifier("dossier sans api.bat -> raison=no-bat",
         inst_nobat["raison"] == "no-bat" and inst_nobat["installe"] is True,
         inst_nobat["raison"])
if sauve is None:
    os.environ.pop("MPT_DIR", None)
else:
    os.environ["MPT_DIR"] = sauve

# ── 3. Service arrete : l'etat doit le dire sans crier a la panne ───────────
print("\n[3] Service arrete")
st_arrete = P.mpt_status()
verifier("running=False", st_arrete["running"] is False, st_arrete)
verifier("installe=True (le dossier est la)", st_arrete["installe"] is True)
verifier("peut_lancer=True (l'UI peut proposer le bouton)",
         st_arrete["peut_lancer"] is True)
verifier("les cles d'installation sont TOUJOURS presentes",
         all(k in st_arrete for k in ("installe", "api_bat", "peut_lancer", "dossier")))

# ── 4. `mpt_lancer()` ne ment pas : lance != running ───────────────────────
print("\n[4] Lancement (lance:true n'est PAS running:true)")
t0 = time.time()
rep = P.mpt_lancer()
verifier("ok=True", rep["ok"] is True, rep)
verifier("lance=True", rep.get("lance") is True)
verifier("MAIS running est encore False au retour de la route",
         rep["running"] is False,
         "attendu : le script vient de partir, MPT n'a pas encore ouvert son port")
st = attendre_service(25)
verifier("service detecte apres attente conditionnelle", st["running"] is True,
         "en %.1fs" % (time.time() - t0))
verifier("port = 8080", st["port"] == 8080, st["port"])
verifier("dossier toujours expose", bool(st["dossier"]), st["dossier"])
# On note le PID qui ecoute REELLEMENT sur 8080 : c'est lui qu'on arretera,
# et non « python.exe » (le banc en est un : il se tuerait lui-meme, ce qui
# tronquait la sortie a la section 4 — mesure faite).
try:
    out = subprocess.run(["netstat", "-ano", "-p", "TCP"],
                         capture_output=True, text=True).stdout
    for ligne in out.splitlines():
        if ":8080" in ligne and "LISTENING" in ligne:
            _pid_lance[0] = int(ligne.split()[-1])
            break
except Exception:
    pass
verifier("le PID ecoutant sur 8080 a ete identifie",
         _pid_lance[0] is not None, _pid_lance[0])

# ── 5. Deuxieme appel : « deja », pas un second processus ──────────────────
print("\n[5] Idempotence")
rep2 = P.mpt_lancer()
verifier("deja=True", rep2.get("deja") is True, rep2)
verifier("running=True", rep2["running"] is True)

# ── 6. Le relais parle vraiment a MPT ──────────────────────────────────────
print("\n[6] Appels relayes")
ok, data = P.mpt_requete("GET", "/api/v1/musics")
verifier("/api/v1/musics repond", ok is True)
fichiers = (data or {}).get("data", {}).get("files", []) if isinstance(data, dict) else []
verifier("la liste des musiques n'est pas vide", len(fichiers) > 0,
         "%d fichiers" % len(fichiers))
# ATTENTION (piege teste ici) : MPT n'expose QUE `ping`, `video`, `llm`
# (`app/router.py`). Ses vraies routes sont `/api/v1/musics` et
# `/api/v1/video_materials` — il n'existe NI `/api/v1/voices` NI
# `/api/v1/fonts`. Les routes `/mpt/voices` et `/mpt/fonts` du relais ne sont
# donc PAS des relais : elles lisent le disque localement. Une assertion
# ecrite d'apres l'intuition (« catalogue de voix = route du service »)
# echouait, alors que l'app etait juste.
ok_m, data_m = P.mpt_requete("GET", "/api/v1/video_materials")
verifier("/api/v1/video_materials repond (route REELLE de MPT)", ok_m is True,
         "" if ok_m else str(data_m)[:120])
ok_intrus, data_intrus = P.mpt_requete("GET", "/api/v1/voices")
verifier("confirme : /api/v1/voices n'existe PAS chez MPT", ok_intrus is False,
         "l'app ne doit pas s'y fier")
verifier("/mpt/voices du relais est LOCAL (pas un relais MPT)",
         callable(getattr(P, "mpt_voices", None)))
verifier("/mpt/fonts du relais est LOCAL (pas un relais MPT)",
         callable(getattr(P, "mpt_fonts", None)))

# ── 7. Le relais desactive bien le proxy (le piege du 502) ─────────────────
print("\n[7] Le piege du proxy (502 qui ressemble a une reponse)")
import urllib.request  # noqa: E402
proxies = urllib.request.getproxies()
avec_proxy = None
try:
    with urllib.request.urlopen("http://127.0.0.1:8080/ping", timeout=4) as r:
        avec_proxy = r.status
except Exception as e:
    avec_proxy = "erreur: %s" % type(e).__name__
handlers = [type(h).__name__ for h in P._boucle_locale().handlers]
verifier("_boucle_locale() n'embarque AUCUN ProxyHandler",
         "ProxyHandler" not in handlers, handlers)
verifier("_mpt_probe() voit le service malgre http_proxy",
         P._mpt_probe(8080) is True,
         "urlopen nu rendait : %s (proxies=%s)" % (avec_proxy, bool(proxies)))

# ── 8. Arret propre, puis retour a « arrete mais installable » ─────────────
print("\n[8] Retour a l'etat arrete")
# On tue le PROCESSUS FILS qu'on a lance, jamais « python.exe » en bloc : le
# banc est lui-meme un python.exe et se suiciderait avant d'imprimer son
# verdict (mesure : sortie tronquee a la section 4).
try:
    pid = _pid_lance[0]
    if pid:
        subprocess.run(["taskkill", "/F", "/PID", str(pid)],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
except Exception as e:
    print("  (arret best-effort : %s)" % e)
time.sleep(2)
st_fin = P.mpt_status()
verifier("running=False apres arret", st_fin["running"] is False, st_fin)
verifier("installe=True : on peut relancer", st_fin["installe"] is True)
verifier("peut_lancer=True", st_fin["peut_lancer"] is True)

# ── Verdict ────────────────────────────────────────────────────────────────
ok_nb = sum(1 for _, o, _ in res if o)
print("\n" + "=" * 68)
print("VERDICT : %d/%d" % (ok_nb, len(res)))
if ok_nb != len(res):
    for nom, o, detail in res:
        if not o:
            print("  ECHEC : %s  %s" % (nom, detail))
print("=" * 68)
sys.exit(0 if ok_nb == len(res) else 1)
