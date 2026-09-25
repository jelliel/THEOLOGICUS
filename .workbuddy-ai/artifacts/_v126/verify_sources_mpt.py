#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Banc v126 — liens d'obtention de cles et sources de videos (backend).

Ce banc MESURE trois choses, et refuse de les supposer :

  1. chaque fournisseur annonce un lien d'obtention NON VIDE, et ce lien est
     une URL http(s) bien formee vers le BON domaine ;
  2. la cle de config de chaque fournisseur est dans la liste blanche — sans
     quoi `data-cle` serait ignore a l'enregistrement, en silence ;
  3. ces cles sont RELUES depuis le vrai config.toml du service, et leur type
     correspond a ce que la liste blanche declare (une liste lue comme une
     chaine ferait echouer l'enregistrement suivant).

Le domaine est verifie : un lien vers le mauvais site ne casse rien
visiblement, il envoie l'utilisateur creer une cle au mauvais endroit — et il
la collera dans le champ sans jamais comprendre pourquoi ca ne marche pas.

Usage : python verify_sources_mpt.py [--port 8765]
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

PORT = 8765
for i, a in enumerate(sys.argv):
    if a == "--port" and i + 1 < len(sys.argv):
        PORT = int(sys.argv[i + 1])
BASE = "http://127.0.0.1:%d" % PORT

# Le relais ne survit pas d'un appel a l'autre dans cet environnement : un
# processus de fond est reappe des que l'invocation qui l'a lance se termine.
# Le banc ne doit donc JAMAIS supposer qu'un relais tourne deja — il lance le
# sien, attend qu'il reponde reellement, et le referme en sortant. C'est la
# seule facon que ce banc soit reexecutable sans intervention.
RACINE = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                      "..", "..", ".."))
_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))

_RELAIS = None

resultats = []


def ok(nom, condition, detail=""):
    resultats.append((bool(condition), nom, detail))
    print("  %s %s%s" % ("[OK]  " if condition else "[ECHEC]", nom,
                         ("  -- " + str(detail)) if detail else ""))
    return bool(condition)


def get_json(chemin, timeout=30):
    try:
        with _OPENER.open(BASE + chemin, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        return e.code, None
    except Exception as e:
        return 0, {"_erreur": str(e)}


def relais_vivant():
    """Le relais repond-il ? On sonde sans jamais rien lui demander d'autre."""
    try:
        with _OPENER.open(BASE + "/__theologicus_ping", timeout=3) as r:
            return r.status == 200
    except Exception:
        return False


def assurer_relais():
    """Lance le relais s'il n'est pas deja la. Rend True s'il repond.

    L'attente est une CONDITION, pas un delai : on interroge jusqu'a ce que
    la sonde reussisse, parce que le temps de demarrage depend de la machine.
    """
    global _RELAIS
    if relais_vivant():
        return True
    print("  … le relais ne repond pas : lancement de proxy_server.py")
    try:
        _RELAIS = subprocess.Popen([sys.executable, "-u", "proxy_server.py"],
                                   cwd=RACINE,
                                   stdout=subprocess.DEVNULL,
                                   stderr=subprocess.DEVNULL)
    except Exception as e:
        print("  [ECHEC] impossible de lancer le relais : %s" % e)
        return False
    for _ in range(60):          # 60 x 0,5 s = 30 s au plus
        time.sleep(0.5)
        if relais_vivant():
            return True
        if _RELAIS.poll() is not None:
            print("  [ECHEC] le relais s'est arrete (code %s)" % _RELAIS.returncode)
            return False
    return False


print("=" * 74)
print("BANC v126 — LIENS DE CLES ET SOURCES DE VIDEOS")
print("relais : %s" % BASE)
print("=" * 74)

if not assurer_relais():
    print("\nRelais injoignable.")
    sys.exit(2)

# ── 0. Le relais repond ─────────────────────────────────────────────────
print("\n0. Relais")
st, src = get_json("/mpt/sources")
ok("le relais repond sur /mpt/sources", st == 200 and isinstance(src, dict),
   "HTTP %s" % st)
if st != 200:
    print("\nRelais injoignable : lancez proxy_server.py avant ce banc.")
    sys.exit(2)

sources = (src or {}).get("sources") or []
ia = (src or {}).get("ia") or []
groupes = [g.get("id") for g in ((src or {}).get("groupes") or [])]

# ── 1. Le catalogue des sources ─────────────────────────────────────────
print("\n1. Catalogue des sources")
ok("les 11 sources du service sont annoncees", len(sources) == 11, "%d" % len(sources))
ok("les 4 groupes sont annonces (ordre de MPT)",
   groupes == ["stock", "ia", "image", "local"], groupes)
nStock = len([s for s in sources if s.get("groupe") == "stock"])
nIA = len([s for s in sources if s.get("groupe") == "ia"])
ok("3 banques de videos (gratuites)", nStock == 3, "%d" % nStock)
ok("6 generateurs par IA (payants)", nIA == 6, "%d" % nIA)
ok("« local » est present (aucun telechargement)", any(s.get("id") == "local" for s in sources))
# L'ordre compte : les sources gratuites doivent etre en tete. Un menu qui
# ouvre sur un service facture fait payer par accident.
ok("les banques gratuites viennent AVANT les generateurs payants",
   [s.get("id") for s in sources][:3] == ["pexels", "pixabay", "coverr"],
   [s.get("id") for s in sources][:4])

# ── 2. Chaque source porte un lien utilisable ───────────────────────────
print("\n2. Liens d'obtention (chaque source, hors « local »)")
DOMAINES = {
    "pexels": "pexels.com", "pixabay": "pixabay.com", "coverr": "coverr.co",
    "metaso_minimax": "metaso.cn", "ofox": "ofox.ai",
    "loomloom": "shengsuanyun.com", "volcengine_seedance": "volcengine.com",
    "wavespeed": "wavespeed.ai", "muapi": "muapi.ai",
    "openai_image": "openai.com",
}
for s in sources:
    sid = s.get("id")
    if sid == "local":
        ok("« local » n'a pas de lien (il n'y a rien a demander)",
           not s.get("lien"), s.get("lien"))
        continue
    lien = s.get("lien") or ""
    ok("%s : un lien est annonce" % sid, bool(lien), lien or "(AUCUN)")
    if not lien:
        continue
    ok("%s : le lien est une URL http(s) absolue" % sid,
       bool(re.match(r"^https?://[^/\s]+\.[^/\s]+", lien)), lien)
    attendu = DOMAINES.get(sid)
    if attendu:
        hote = urllib.parse.urlparse(lien).netloc.lower()
        # Le domaine doit correspondre : un lien vers le mauvais site envoie
        # creer une cle au mauvais endroit, et l'utilisateur colle ensuite une
        # cle qui ne peut pas fonctionner — sans jamais comprendre pourquoi.
        ok("%s : le lien pointe vers %s" % (sid, attendu),
           hote == attendu or hote.endswith("." + attendu), hote)

# ── 3. Les fiches des fournisseurs par IA ───────────────────────────────
print("\n3. Fiches des generateurs par IA")
ok("6 fiches annoncees", len(ia) == 6, "%d" % len(ia))
for f in ia:
    fid = f.get("id")
    ok("%s : une cle de config est declaree" % fid, bool(f.get("cle")), f.get("cle"))
    ok("%s : un libelle lisible" % fid, bool(f.get("label")), f.get("label"))
    ok("%s : un lien d'obtention" % fid, bool(f.get("lien")), f.get("lien") or "(AUCUN)")
    ok("%s : le libelle du lien est explicite" % fid, bool(f.get("lien_titre")),
       f.get("lien_titre"))
    ok("%s : une phrase d'aide (le service en fournit une)" % fid, bool(f.get("aide")),
       (f.get("aide") or "")[:40])
    # Le prefixe sert a composer les cles des champs : s'il est faux, tous les
    # reglages du fournisseur partent dans des cles qui n'existent pas.
    ok("%s : le prefixe des champs est coherent" % fid,
       f.get("prefixe") == fid, f.get("prefixe"))
    for c in (f.get("champs") or []):
        nom, lib, defaut, choix = (list(c) + [None, None, None])[:4]
        ok("%s.%s : un libelle" % (fid, nom), bool(lib), lib)
        if choix:
            ok("%s.%s : le defaut fait partie des choix proposes" % (fid, nom),
               defaut in choix, "defaut=%r choix=%r" % (defaut, choix))

# ── 4. Liste blanche : les cles sont-elles vraiment ecrivables ? ────────
print("\n4. Liste blanche du config.toml")
st, reg = get_json("/mpt/settings")
cles = set((reg or {}).get("keys") or [])
valeurs = (reg or {}).get("values") or {}
ok("les reglages du service sont lisibles", (reg or {}).get("ok") is True,
   (reg or {}).get("reason"))
if not cles:
    ok("la liste blanche est lisible (prerequis des points suivants)", False,
       "config.toml introuvable : le service n'est pas installe")
else:
    aVerifier = [(s.get("cle"), s.get("id")) for s in sources if s.get("cle")]
    aVerifier += [(f.get("cle"), f.get("id")) for f in ia if f.get("cle")]
    for cle, sid in aVerifier:
        ok("« %s » (%s) est modifiable par l'interface" % (cle, sid), cle in cles,
           "ABSENTE de la liste blanche" if cle not in cles else "")
    # Les champs composes : <prefixe>_<champ>.
    for f in ia:
        for c in (f.get("champs") or []):
            cle = f.get("prefixe") + "_" + c[0]
            ok("« %s » est modifiable par l'interface" % cle, cle in cles,
               "ABSENTE de la liste blanche" if cle not in cles else "")

# ── 5. Type reel des valeurs lues ───────────────────────────────────────
print("\n5. Type des valeurs relues depuis le config.toml")
# Une liste lue comme une chaine casserait l'enregistrement suivant, et une
# duree lue comme une chaine ferait refuser le champ par le service.
for cle, type_attendu in (("pexels_api_keys", list), ("pixabay_api_keys", list),
                          ("coverr_api_keys", list), ("wavespeed_api_keys", list),
                          ("openai_image_api_keys", list),
                          ("twelvelabs_api_keys", list)):
    if cle in valeurs:
        v = valeurs[cle]
        ok("« %s » est bien une liste" % cle, isinstance(v, type_attendu),
           "%r (%s)" % (v, type(v).__name__))
for cle in ("metaso_minimax_poll_interval", "ofox_max_duration",
            "volcengine_seedance_watermark", "match_materials_to_script"):
    if cle in valeurs:
        v = valeurs[cle]
        if cle == "volcengine_seedance_watermark" or cle == "match_materials_to_script":
            ok("« %s » est bien un booleen" % cle, isinstance(v, bool), "%r" % (v,))
        else:
            ok("« %s » est bien un nombre entier" % cle,
               isinstance(v, int) and not isinstance(v, bool), "%r" % (v,))

# ── 6. Non-regression : les sources deja en place ───────────────────────
print("\n6. Les reglages precedents ne sont pas perdus")
for cle in ("video_source", "voice_mode", "tts_server", "voice_name",
            "upload_post_platforms", "llm_provider"):
    ok("« %s » est toujours modifiable" % cle, cle in cles, cle)

if _RELAIS is not None:
    try:
        _RELAIS.terminate()
        _RELAIS.wait(timeout=5)
    except Exception:
        _RELAIS.kill()

total = len(resultats)
reussis = len([r for r in resultats if r[0]])
print("\n" + "=" * 74)
print("RESULTAT : %d/%d" % (reussis, total))
if reussis != total:
    print("\nEchecs :")
    for bon, nom, detail in resultats:
        if not bon:
            print("  - %s  (%s)" % (nom, detail))
print("=" * 74)
sys.exit(0 if reussis == total else 1)
