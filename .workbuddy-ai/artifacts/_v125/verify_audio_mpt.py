#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Banc v125 — section AUDIO du STUDIO VIDEO : parite avec MoneyPrinterTurbo.

Ce banc MESURE, il ne relit pas le code :

  1. le relais expose bien les routes de la section Audio ;
  2. /mpt/tts/engines rend les 11 moteurs de MPT et ses 3 modes ;
  3. /mpt/voices?moteur= filtre COMME MPT (V1 sans V2, V2 sans V1) et la somme
     des deux filtres egale le catalogue complet — la preuve que rien n'est
     perdu en route ;
  4. les cles audio sont dans la liste blanche de config.toml, et `float` y est
     serialise SANS guillemets (une chaine ferait echouer la generation) ;
  5. l'ecoute rend un son REELLEMENT produit par le service, servi par le
     relais avec un type MIME audio et un `Content-Disposition: inline`.

Le point 5 exige MPT demarre. S'il ne l'est pas, le banc le DIT et echoue sur
ces points-la — il ne les saute pas : un banc qui saute ce qu'il ne peut pas
prouver donne un faux sentiment de securite.

Usage : python verify_audio_mpt.py [--port 8765]
"""
import json
import os
import re
import sys
import time
import urllib.request
import urllib.parse
import urllib.error

PORT = 8765
for i, a in enumerate(sys.argv):
    if a == "--port" and i + 1 < len(sys.argv):
        PORT = int(sys.argv[i + 1])
BASE = "http://127.0.0.1:%d" % PORT

# http_proxy est defini dans l'environnement et urllib l'honore AUSSI pour
# 127.0.0.1 : sans ce desarmement, chaque appel rend un 502 du proxy qui
# ressemble a une reponse du relais.
_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))

resultats = []


def ok(nom, condition, detail=""):
    resultats.append((bool(condition), nom, detail))
    print("  %s %s%s" % ("[OK]  " if condition else "[ECHEC]", nom,
                         ("  -- " + str(detail)) if detail else ""))
    return bool(condition)


def get(chemin, timeout=60):
    with _OPENER.open(BASE + chemin, timeout=timeout) as r:
        return r.status, r.read()


def get_json(chemin, timeout=60):
    try:
        st, brut = get(chemin, timeout)
        return st, json.loads(brut.decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        return e.code, None
    except Exception as e:
        return 0, {"_erreur": str(e)}


def post_json(chemin, corps, timeout=90):
    data = json.dumps(corps).encode("utf-8")
    req = urllib.request.Request(BASE + chemin, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    try:
        with _OPENER.open(req, timeout=timeout) as r:
            return r.status, json.loads(r.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        return e.code, None
    except Exception as e:
        return 0, {"_erreur": str(e)}


print("=" * 72)
print("BANC v125 — SECTION AUDIO DU STUDIO VIDEO")
print("relais : %s" % BASE)
print("=" * 72)

# ── 0. Le relais repond ─────────────────────────────────────────────────
print("\n0. Relais")
st, j = get_json("/mpt/status", timeout=20)
ok("le relais repond sur /mpt/status", st == 200 and isinstance(j, dict), "HTTP %s" % st)
if st != 200:
    print("\nRelais injoignable : lancez proxy_server.py avant ce banc.")
    sys.exit(2)
service_actif = bool(j.get("running"))

# ── 1. Le catalogue des moteurs ─────────────────────────────────────────
print("\n1. Moteurs TTS (/mpt/tts/engines)")
st, eng = get_json("/mpt/tts/engines")
moteurs = (eng or {}).get("engines") or []
ok("route joignable", st == 200, "HTTP %s" % st)
ok("11 moteurs rendus (ceux de MPT)", len(moteurs) == 11, "%d" % len(moteurs))
ids = [m.get("id") for m in moteurs]
attendu = ["azure-tts-v1", "azure-tts-v2", "siliconflow", "gemini-tts", "mimo-tts",
           "minimax-tts", "elevenlabs", "chatterbox", "kokoro", "fish_audio", "voxcpm"]
ok("les identifiants sont ceux de MPT", ids == attendu, ids[:3] + ["..."] if len(ids) > 3 else ids)
ok("le defaut annonce est azure-tts-v1", (eng or {}).get("default") == "azure-tts-v1",
   (eng or {}).get("default"))
ok("seul Azure porte le drapeau enumerable",
   sorted(m.get("id") for m in moteurs if m.get("azure")) == ["azure-tts-v1", "azure-tts-v2"],
   [m.get("id") for m in moteurs if m.get("azure")])
modes = (eng or {}).get("modes") or []
ok("3 modes de narration", len(modes) == 3, [m.get("id") for m in modes])

# ── 2. Filtrage des voix, comme MPT ─────────────────────────────────────
print("\n2. Voix par moteur (/mpt/voices?moteur=)")
st, v1 = get_json("/mpt/voices?moteur=azure-tts-v1")
st2, v2 = get_json("/mpt/voices?moteur=azure-tts-v2")
st3, vk = get_json("/mpt/voices?moteur=kokoro")
l1 = (v1 or {}).get("voices") or []
l2 = (v2 or {}).get("voices") or []
ok("azure-tts-v1 rend des voix", len(l1) > 0, "%d" % len(l1))
ok("azure-tts-v2 rend des voix", len(l2) > 0, "%d" % len(l2))
ok("aucune voix V2 dans la liste V1",
   not [v for v in l1 if "V2" in v], [v for v in l1 if "V2" in v][:3])
ok("TOUTES les voix V2 sont dans la liste V2",
   all("V2" in v for v in l2), "%d/%d" % (len([v for v in l2 if "V2" in v]), len(l2)))
# La preuve que le filtre ne perd rien : on somme. Un filtre ecrit a la main
# peut sembler juste et avaler silencieusement des entrees.
st4, vt = get_json("/mpt/voices")
lt = (vt or {}).get("voices") or []
ok("les deux filtres couvrent exactement le catalogue complet",
   len(l1) + len(l2) == len(lt), "%d + %d = %d (complet %d)" % (len(l1), len(l2), len(l1) + len(l2), len(lt)))
ok("aucun recouvrement V1/V2", not (set(l1) & set(l2)), len(set(l1) & set(l2)))
ok("un moteur distant est marque `externe`, pas « vide »",
   (vk or {}).get("externe") is True and (vk or {}).get("ok") is True,
   "externe=%s ok=%s" % ((vk or {}).get("externe"), (vk or {}).get("ok")))
ok("le moteur distant ne fabrique pas de liste Azure", len((vk or {}).get("voices") or []) == 0,
   "%d voix" % len((vk or {}).get("voices") or []))
ok("le format est <Nom>-<Genre> comme MPT",
   all(re.match(r"^[a-z]{2,3}-[A-Z]{2}-[A-Za-z0-9]+-(Female|Male)$", v) for v in l1[:40]),
   l1[0] if l1 else "(vide)")
ok("le catalogue couvre bien des langues variees (pas un filtre trop etroit)",
   len(set(v.split("-")[0] for v in l1)) > 20,
   "%d langues" % len(set(v.split("-")[0] for v in l1)))
ok("il y a des voix FRANCAISES (le selecteur les groupe en tete)",
   len([v for v in l1 if v.startswith("fr-")]) > 0,
   [v for v in l1 if v.startswith("fr-")][:3])

# ── 3. Liste blanche et serialisation ───────────────────────────────────
print("\n3. config.toml : liste blanche et type float")
st, reg = get_json("/mpt/settings")
cles = (reg or {}).get("keys") or []
for k in ("voice_mode", "tts_server", "voice_name", "voice_volume", "voice_rate"):
    ok("« %s » est modifiable par l'interface" % k, k in cles, "hors liste blanche" if k not in cles else "")
valeurs = (reg or {}).get("values") or {}
if "voice_volume" in valeurs:
    ok("voice_volume est relu comme un NOMBRE, pas une chaine",
       isinstance(valeurs["voice_volume"], (int, float)) and not isinstance(valeurs["voice_volume"], bool),
       "%r (%s)" % (valeurs["voice_volume"], type(valeurs["voice_volume"]).__name__))
# On reecrit le volume a l'identique : c'est une ecriture sur le fichier d'un
# AUTRE programme, donc on ne teste que l'aller-retour d'une valeur deja la.
if "voice_volume" in valeurs:
    vol = valeurs["voice_volume"]
    st, r = post_json("/mpt/settings", {"voice_volume": vol})
    ok("l'ecriture d'un float est acceptee", st == 200 and (r or {}).get("ok") is not False,
       "HTTP %s %s" % (st, r))
    st, reg2 = get_json("/mpt/settings")
    v2 = (reg2 or {}).get("values", {}).get("voice_volume")
    ok("le float survit a l'aller-retour SANS guillemets", v2 == vol, "%r -> %r" % (vol, v2))

# ── 4. L'ecoute produit un vrai son ─────────────────────────────────────
print("\n4. Ecoute de la voix (le point qui compte)")
if not service_actif:
    ok("le service MPT est demarre (prerequis de l'ecoute)", False,
       "service ARRETE : les points suivants ne peuvent pas etre prouves")
else:
    st, voix = get_json("/mpt/voices?moteur=azure-tts-v1")
    une_voix = ((voix or {}).get("voices") or ["fr-FR-DeniseNeural-Female"])[0]
    # Le lecteur d'apercu est teste sur une voix FRANCAISE : c'est la langue de
    # cette application, et une voix anglaise lirait le texte francais avec un
    # accent qui ferait croire a un probleme de moteur.
    voix_fr = [v for v in ((voix or {}).get("voices") or []) if v.startswith("fr-")]
    cible = voix_fr[0] if voix_fr else une_voix
    phrase = "Ceci est un exemple de texte pour tester la synthèse vocale"
    t0 = time.time()
    st, cr = post_json("/mpt/voice/preview",
                       {"texte": phrase, "voix": cible, "moteur": "azure-tts-v1",
                        "volume": 1.0, "vitesse": 1.0})
    ok("la synthese est acceptee", st == 200 and (cr or {}).get("ok") is True,
       "HTTP %s %s" % (st, cr))
    tid = (cr or {}).get("task_id", "")
    ok("un identifiant de tache est rendu", bool(tid), tid)
    if tid:
        pret, url, dernier = False, "", {}
        for _ in range(60):
            time.sleep(0.7)
            st, e = get_json("/mpt/voice/preview?task_id=" + urllib.parse.quote(tid))
            if not e or not e.get("ok"):
                break
            dernier = e
            if e.get("echec"):
                break
            if e.get("pret"):
                pret, url = True, e.get("url", "")
                break
        duree = time.time() - t0
        ok("le service a produit l'audio", pret,
           "en %.1fs ; dernier etat %s" % (duree, dernier))
        ok("l'URL d'ecoute est locale (servie par le relais)",
           url.startswith("/mpt/voice/audio?task_id="), url)
        if url:
            try:
                with _OPENER.open(BASE + url, timeout=30) as r:
                    ctype = r.headers.get("Content-Type", "")
                    cdisp = r.headers.get("Content-Disposition", "")
                    octets = r.read()
                ok("le relais sert des OCTETS audio", len(octets) > 2000, "%d octets" % len(octets))
                # Un MP3 commence par « ID3 » ou par une trame 0xFF 0xEx/0xFx.
                entete = octets[:3]
                ok("le contenu est bien un MP3 (entete reconnue)",
                   entete == b"ID3" or (len(octets) > 1 and octets[0] == 0xFF and (octets[1] & 0xE0) == 0xE0),
                   repr(octets[:4]))
                # Le service annonce `video/mp3` sur sa route de telechargement :
                # un navigateur refuse de le lire comme un son. On verifie donc
                # que le relais corrige le type, sinon le lecteur de l'interface
                # resterait muet alors que le fichier est parfait.
                ok("le type MIME est un type AUDIO", ctype.startswith("audio/"), ctype)
                ok("le type n'est PAS `video/mp3` (le piege du service)",
                   "video/" not in ctype, ctype)
                ok("la lecture est en ligne, pas forcee en telechargement",
                   "inline" in cdisp.lower(), cdisp)
            except Exception as e:
                ok("le relais sert l'audio", False, e)

    # Un texte vide doit etre refuse PROPREMENT, pas par un 500 du service.
    st, cr = post_json("/mpt/voice/preview", {"texte": "   "})
    ok("un texte vide est refuse avec une raison claire",
       st == 200 and (cr or {}).get("ok") is False and (cr or {}).get("reason") == "no-text",
       "%s" % cr)

    # Un identifiant de tache hostile ne doit pas composer une URL.
    st, r = get_json("/mpt/voice/preview?task_id=../../config")
    ok("un task_id hors motif est refuse",
       r is None or r.get("ok") is False, r)
    st, r2 = get_json("/mpt/voice/audio?task_id=..%2F..%2Fconfig.toml")
    ok("le telechargement d'audio refuse un chemin traverse",
       st == 404, "HTTP %s" % st)

# ── Bilan ───────────────────────────────────────────────────────────────
total = len(resultats)
reussis = len([r for r in resultats if r[0]])
print("\n" + "=" * 72)
print("RESULTAT : %d/%d" % (reussis, total))
if reussis != total:
    print("\nEchecs :")
    for bon, nom, detail in resultats:
        if not bon:
            print("  - %s  (%s)" % (nom, detail))
print("=" * 72)
sys.exit(0 if reussis == total else 1)
