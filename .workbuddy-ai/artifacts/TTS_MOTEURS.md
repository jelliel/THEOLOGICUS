# THEOLOGICUS — moteurs de lecture vocale (v109)

Trois moteurs, réglables dans **Paramètres → 🔊 LECTURE VOCALE → Moteur de lecture**.

## Pourquoi trois moteurs

Le moteur « voix du système » n'utilise que les voix **installées sur l'appareil**.
Mesuré sur ce poste (23/09/2026, dans la vraie application WebView2) :

```
voices total = 4        locales = 4
défaut = Microsoft George - English (United Kingdom)
voix françaises = 0     <-- AUCUNE
```

Langues Windows installées : `en-MU, en-GB, en-US, ar-SA, he, el, syr-Syrc`.
Quand aucune voix n'existe pour la langue demandée, le moteur **applique sa voix
par défaut** — il ne cherche pas « la plus proche » du tag. D'où un français lu
avec un accent anglais. **Aucun correctif côté application ne peut y remédier** :
il n'y a pas de voix française à utiliser. Les deux moteurs ci-dessous comblent
ce trou.

## Comparaison

| | Langues | Hors ligne | Coût | Ce qu'il couvre ici |
|---|---|---|---|---|
| **Voix du système** | celles installées | oui | gratuit | en, ar (+ fr si pack installé) |
| **ElevenLabs** | 29 (multilingual v2) à 32 (v3) | non | facturé au caractère | tout, **hébreu inclus avec v3** |
| **Supertonic 3** | 31 | **oui** | gratuit | **fr, el, ar**, en, de, es, it, ru… |

**Ni l'un ni l'autre ne couvre le latin.** C'est une décision déjà arrêtée : le
latin n'est pas dans `SCRIPT_RANGES`, il est donc lu par une voix française
(même alphabet, convention légitime). Vérifié en septembre 2026.

**Aucun des deux ne couvre l'hébreu, sauf ElevenLabs v3** — attention, c'est
`eleven_v3` et **pas** `eleven_multilingual_v2`, que beaucoup croient plus
complet. Pour l'hébreu sans ElevenLabs, l'app garde son repli phonétique
(`transliterateForSpeech()` → « yehochoua », « logos »), qui est déjà en place.

## ElevenLabs (cloud)

Réglages : **clé API** (`xi-api-key`), **Voice ID**, **modèle**.

- Clé : compte ElevenLabs → *Profile → API Keys*. Elle reste dans le
  `localStorage` de l'appareil et n'est envoyée qu'à `api.elevenlabs.io`.
- Voice ID : la bibliothèque de voix en donne l'identifiant ; le bouton
  **📋 Lister les voix du compte** interroge `/v1/voices` et affiche les
  identifiants dans la console (F12).
- Modèles : `eleven_multilingual_v2` (stable), `eleven_v3` (le plus expressif,
  seul à couvrir l'hébreu), `eleven_flash_v2_5` (le plus rapide et le moins cher).
- Ordre de grandeur relevé en septembre 2026 : ~0,30 $ / 1000 caractères en v3,
  ~0,08 $ / 1000 en Flash v2.5. À vérifier sur votre compte — les tarifs bougent.
- Le son est un MP3, joué par un `<audio>` : pas de voix à installer, aucune
  dépendance au système.

## Supertonic 3 (local, hors ligne)

Modèle ONNX sous **licence MIT**, 31 langues, tourne sur le CPU. Le modèle est
déjà présent dans `~/.cache/supertonic3` (385 Mo) : **rien n'est retéléchargé**.

```bash
python tools/start_supertonic.py                 # port 8091, charge le modèle
python tools/start_supertonic.py --lazy          # ne charge qu'à la 1re demande
python tools/start_supertonic.py --port 8091 --steps 6   # plus rapide, un peu moins net
```

Le service affiche au démarrage l'URL locale **et** les adresses réseau, à
utiliser depuis l'APK sur le même Wi-Fi (même principe que LibreTranslate) :

```
a l'ecoute sur http://127.0.0.1:8091  (Ctrl+C pour arreter)
  depuis un autre appareil : http://192.168.100.71:8091
  depuis un autre appareil : http://100.74.55.70:8091
```

Points d'entrée : `GET /health`, `GET /voices`, `GET|POST /tts` (WAV),
`GET /` (page de test dans un navigateur).

### Performances mesurées (CPU, ce poste)

| | audio produit | temps de calcul | RTF |
|---|---|---|---|
| français, F1 | 5,58 s | 1,70 s | 0,30 |
| grec, M2 | 3,84 s | 1,10 s | 0,29 |
| arabe, F2 | 2,46 s | 0,80 s | 0,33 |

Chargement du modèle : **1,0 s**. Préechauffage : 0,6 s. Deuxième appel du même
texte : **8,7 ms** (cache disque dans `tools/.supertonic_cache/`, gitignoré).
Seule la toute première inférence est lente (allocation des tenseurs) : le
service la fait au démarrage, sinon c'est l'utilisateur qui l'attendrait.

Le WAV est normalisé à **−1 dBFS** : la sortie brute du modèle plafonne à
9839/32767 (−10 dBFS), donc nettement plus faible que les voix du système, et il
fallait monter le volume à chaque bascule.

### Limites à connaître

- **Pas d'hébreu ni de latin** dans les 31 langues. La langue inconnue part en
  `na` (traitement sans hypothèse de langue), jamais en `en` : mieux vaut aucune
  hypothèse qu'une bouche fausse.
- 385 Mo de modèle, ~1,5 Go de RAM au chargement.
- Un seul service sert un texte à la fois (les requêtes sont sérialisées) ; c'est
  sans effet à l'usage, les segments étant lus l'un après l'autre.

## Ce qui a été ajouté au code

- `THEOLOGICUS.html` : `ttsCfg`/`ttsCfgSet`/`ttsMoteur`/`ttsLangIso`,
  `ttsParleDistant` (fetch → Blob → `Audio`), `ttsEmission` (**point de sortie
  unique** des quatre files de lecture), `ttsStop` (coupe local **et** distant),
  `ttsErreurFatale`, `ttsTester`, `ttsSupertonicVerifier`, `ttsElevenLabsVoix`,
  `ttsCablerParametres`. Réglages persistés sous `theologicus-tts-moteurs`.
- `tools/start_supertonic.py` : le service local.
- `tools/supertonic/helper.py` + `LICENSE` : helper d'inférence du dépôt
  `supertone-oss-archive/supertonic`, licence MIT.
- `.workbuddy-ai/artifacts/_tts/bench_v109_moteurs.js` : banc de vérification.

### Deux invariants à ne pas casser

1. **`window.speechSynthesis.speak(utt)` ne doit apparaître que 2 fois** (le
   point de sortie et le bouton Tester) et `window.speechSynthesis.cancel() une
   seule fois (dans `ttsStop`). Un site direct qui réapparaîtrait ignorerait le
   moteur choisi. Le banc le vérifie sur le fichier.
2. **Une panne de moteur doit arrêter la file**, pas la faire avancer : sinon
   chaque segment émet une requête vouée à l'échec. C'est le rôle de
   `ttsErreurFatale()`.

## Vérification — ce qui a été mesuré, pas supposé

`bench_v109_moteurs.js` a été exécuté **deux fois de suite, verdict `0 échec`
les deux fois**, code de sortie 0. Il couvre 44 contrôles en quatre étages :

| Étage | Ce qu'il prouve | Résultat mesuré |
|---|---|---|
| 1. Statique, sur le fichier | un seul point de sortie | `speak(utt)` = **2 sites**, `cancel()` = **1 site**, **6** appels à `ttsEmission` |
| 2. Configuration | le moteur se persiste, la langue se traduit | bascule system → supertonic → elevenlabs **persistée** ; `ttsLangIso` juste sur **12/12** langues |
| 3. Pannes | une panne arrête la file | `ttsErreurFatale` : **4/4** fatales, **3/3** non fatales |
| 4. Bout en bout | un vrai WAV du service local | `ttsParleDistant(...)` → `onEnd` en **2 952 ms**, `_ttsAudio` **libéré** ensuite |

Le contrôle qui compte le plus est le quatrième : il ne vérifie pas que la
configuration s'écrit, mais que **l'audio sort réellement** par le chemin de
code de l'application, service local compris.

Le latin est un cas piège vérifié nommément : `latin` n'est pas dans
`SCRIPT_RANGES`, il doit donc partir en **`fr`** et non en `na` — sans quoi il
serait lu sans hypothèse de langue.

## En cas de problème

| Symptôme | Cause | Remède |
|---|---|---|
| « Supertonic injoignable » | service non lancé | `python tools/start_supertonic.py` |
| Pastille rouge « Injoignable — HTTP 502 » | le service n'écoute pas. **Un port fermé renvoie 502 ici, pas une erreur de connexion** — donc 502 veut bien dire « rien ne tourne », pas « mauvais port » | lancer le service, puis **Vérifier le service** |
| « numpy est requis » | le service tourne avec un Python où numpy manque | le message donne maintenant **l'interpréteur exact** ; lancer `"<ce python>" -m pip install numpy onnxruntime` |
| « ElevenLabs : renseignez la clé » | clé vide | Paramètres → bloc ElevenLabs |
| Le français reste anglais | moteur = « voix du système » sans voix fr | passer à Supertonic ou ElevenLabs, ou installer le pack fr-FR |
| Voix trop lente | `--steps 8` | `--steps 6`, ou baisser la vitesse |
| Rien ne sort, aucune erreur | file arrêtée par une panne précédente | relancer la lecture ; le message d'erreur est affiché une seule fois |
| L'hébreu ou le latin sort en français | Supertonic ne couvre ni l'un ni l'autre | c'est une limite du modèle, pas un défaut de réglage ; ElevenLabs `eleven_v3` couvre l'hébreu |
