---
name: theologicus-tts-diagnostic
description: Diagnostiquer et corriger la lecture vocale (TTS) de THEOLOGICUS — prononciation fautive, mot étranger sauté ou lu avec le mauvais accent, référence coupée en deux, langue non prononcée. Utiliser dès que l'utilisateur parle de « prononciation », « lecture vocale », « voix », « accent », « mot hébreu/grec/arabe/latin mal lu », ou d'un moteur TTS tiers (ElevenLabs, Supertonic). Fournit des sondes qui instrumentent speechSynthesis.speak et un banc à contre-épreuve.
agent_created: true
---

# THEOLOGICUS — diagnostic de la lecture vocale (TTS)

## Pourquoi ce skill existe

v106 : l'utilisateur signalait une mauvaise prononciation. Le réflexe naturel —
« installer un meilleur moteur » (ElevenLabs, Supertonic) — était **le mauvais
réflexe**. Le moteur n'était pas en cause : un défaut dans notre propre chaîne
rendait **inatteignable** un dictionnaire phonétique déjà écrit dans le fichier.
`_HE_PHON`, `_HE_VOWEL`, `_EL_PHON` et `transliterateForSpeech()` étaient du
**code mort** depuis leur écriture, parce que `getVoiceForLang()` rendait la voix
**française** quand aucune voix hébraïque n'existait — et `makeUtterance` testait
`if (v)` pour décider d'appeler le repli.

**Règle qui en découle : avant de changer de moteur, instrumenter sa propre
chaîne et mesurer.** Un moteur tiers ne corrige pas un bug de logique locale.

## La chaîne (dans `THEOLOGICUS.html`)

```
cleanMd → prosodyPreprocess → splitByLanguage
        → splitMixedSegments          (isole les plages d'écriture étrangère)
        → chunkText(180)              (anti-troncature moteur)
        → makeUtterance(texte, lang)  (résout la voix, choisit le repli)
        → file speakNextSegment()      (avance sur utt.onend)
```

Points d'entrée : `speakText(text)`, `speakSection(btn)`, `readLangMode`
(`'fr'` par défaut = français forcé, **sauf** écritures non-latines).

## Les causes, par fréquence observée

1. **`detectScriptLang()` DIT « anglais » d'un texte français — à cause de
   `\b`.** C'est la cause la plus fréquente et la plus trompeuse, parce qu'elle
   ne ressemble pas à un défaut de TTS : la voix choisie est « correcte » pour
   la langue qu'on lui a **dite**. `\b` s'appuie sur `\w`, qui vaut
   `[A-Za-z0-9_]` **même avec le flag `u`** : une voyelle accentuée n'est pas un
   caractère de mot, elle **crée une frontière**. Donc `\bs\b` matche dans
   `très`, `\bme\b` dans `poème`, `\bt\b` dans `société`, et `\bthe\b` dans
   `thèse` **dès que la chaîne est en NFD** (U+0300 n'est pas `\w`).
   Mesuré : **16/30 phrases françaises** partaient en `anglais` et recevaient
   `Google US English (en-US)`. Correctif : délimiteurs Unicode
   `(?<![\p{L}\p{N}])…(?![\p{L}\p{N}])` **et** `NFC` avant tout test (les deux
   sont nécessaires). Contre-épreuve `_tts/bench_v107_langue.js` (6 → 0).
   **Ne jamais revenir à `\b` dans une liste de mots.**
2. **Une voix d'une AUTRE langue est servie.** `getVoiceForLang()` cherche la
   langue demandée, ne trouve rien, puis **tombe dans les paliers fr-FR** et
   retourne la voix française. `makeUtterance` testant `if (v)`, le repli
   phonétique ne se déclenche jamais. Garde nécessaire :
   `if (prefix !== 'fr') return null;` **et** un second verrou dans
   `makeUtterance` (`!_langMatches(v, prefix)` → `v = null`).
3. **Les diacritiques / tashkeel / cantillation** embrouillent le moteur.
   `normalizeArabicSpeech()` les retire avant l'envoi (l'affichage reste intact).
4. **Une référence coupée en deux.** Le `:` de `Exode 24:12` était pris pour une
   fin de phrase → `["Exode 24:", "12"]`. Protéger `(\d)\s*:\s*(\d)` par un
   marqueur temporaire autour du split, restaurer après.
5. **Aucune voix installée pour la langue.** Voir l'inventaire ci-dessous :
   c'est le cas normal pour l'hébreu, le grec et le latin. La réponse est le
   **repli phonétique**, pas un moteur tiers.
6. **`_langMatches` et l'alias `iw`.** Windows déclare parfois l'hébreu sous
   l'ancien code ISO `iw` au lieu de `he` : sans cet alias, la voix installée
   reste introuvable.
7. **Aucune voix pour la langue → le moteur applique sa voix PAR DÉFAUT, qui est
   une voix d'une AUTRE langue.** C'est la cause de la plainte la plus récente
   (v108), et elle **ne se voit pas dans le code** : `detectScriptLang` rend
   `francais`, `getVoiceForLang('francais')` rend `null`, l'énoncé part avec
   `lang='fr-FR'` — et le moteur lit quand même avec `Microsoft George (en-GB)`.
   **Le moteur ne cherche pas « la voix la plus proche » du tag** : il substitue
   sa voix par défaut. Conséquence pratique : après avoir corrigé la cause 1, le
   symptôme peut **rester identique à l'oreille**, parce que le repli est la même
   voix anglaise qu'avant. Le remède n'est pas du code, c'est un **pack de
   langue** — voir l'inventaire ci-dessous. Depuis la v108, l'app le **dit** au
   lieu de lire fautivement en silence : `signalerVoixManquante(lang)`,
   `_voixManquanteSignalee`, `_NOMS_LANGUE_TTS`, bandeau `#v108-voix-manquante`,
   clé `theo_voix_manquante_ignoree`.

**Le symptôme oriente le diagnostic, mais il ne suffit pas : il faut mesurer
DANS WebView2.**

- « Le français est lu en anglais » → cause 1 **et/ou** cause 7. Tester la cause 1
  par `detectScriptLang` (isolé, en console), puis **compter les voix `fr`** :
  s'il y en a zéro, la cause 7 est là et le code n'y peut rien.
- « L'hébreu est lu en français » → cause 2.
- « Un mot isolé est mal prononcé » → cause 3 ou 4, pas une langue entière.

## Inventaire réel des voix — DEUX moteurs, DEUX inventaires

**Erreur à ne pas refaire** : mesurer les voix dans Chrome ou Edge et en conclure
ce que l'app packagée peut faire. Ce sont deux moteurs différents.

| Mesuré dans | Voix exposées | Voix françaises |
|---|---|---|
| **Edge / Chrome** (headless ou non) | **325**, dont 13 « Online (Natural) » | oui, plusieurs |
| **WebView2** (l'app packagée, Windows) | **4** = les OneCore **locales** | **0** sur ce poste |

Sur la machine de l'utilisateur (mesuré le 2026-09-23, dans la vraie app) :
`Microsoft George - English (United Kingdom)` **[voix par défaut]**, `Hazel`
(en-GB), `Susan` (en-GB), `Naayf` (ar-SA). Langues Windows installées :
`en-MU, en-GB, en-US, ar-SA, he, el, syr-Syrc` — **aucun pack français**.

**Les voix « Online (Natural) » d'Edge sont une fonction du NAVIGATEUR**, pas du
système : WebView2 ne peut pas les atteindre. Ne jamais les compter.

| Langue | Voix disponible (WebView2) | Traitement correct |
|---|---|---|
| français | **aucune** tant que le pack fr-FR n'est pas installé | voix FR, sinon **signaler** |
| arabe | Microsoft Naayf (ar-SA) | voix arabe |
| **hébreu** | **aucune** | **repli phonétique** → « yehochoua » |
| **grec** | **aucune** | **repli phonétique** → « logos » |
| **latin** | **aucune** | voix FR, **délibérément** (voir plus bas) |

Installer la voix française (PowerShell **élevé**, ~90 Mo) :

```powershell
Add-WindowsCapability -Online -Name Language.Speech~~~fr-FR~0.0.1.0
```

Ou : Paramètres → Heure et langue → Parole → Voix → Ajouter des voix → Français.
**Puis fermer et relancer l'app** (WebView2 garde ses voix en cache au démarrage).
Vérifier ensuite que `voices` en contient bien une en `fr-FR`.

**Latin : ne pas rouvrir le sujet.** Le latin n'est pas dans `SCRIPT_RANGES`, donc
détecté `francais` et lu par la voix française. C'est **volontaire** : même
alphabet, et la prononciation française du latin est une convention légitime.
**Aucun TTS commercial ne couvre le latin** — ni ElevenLabs, ni Supertonic.
Vérifié en septembre 2026.

## Comparaison des moteurs — INTÉGRÉS depuis v109

| | hébreu | arabe | latin | Statut |
|---|---|---|---|---|
| **Supertonic 3** | NON | oui | NON | **intégré** — local, MIT, 31 langues ; **dépôt amont archivé** (plus de correctifs : `helper.py` est vendu dans `tools/supertonic/`) |
| **ElevenLabs v3** | **OUI** | oui | NON | intégré (propriétaire, ~0,30 $/1000 car.) |
| ElevenLabs multilingual v2 | NON | oui | NON | intégré (défaut) |
| ElevenLabs Flash v2.5 | NON | oui | NON | intégré (~0,08 $/1000 car.) |

**Piège commercial** : seul **v3** couvre l'hébreu — **pas** multilingual v2, que
beaucoup croient plus complet. Et Supertonic est souvent cité comme « meilleur »,
mais **ne couvre ni l'hébreu ni le latin**, c'est-à-dire précisément les deux
langues en défaut. Vérifier la table des langues **avant** de recommander.

### v109 — l'architecture à connaître avant de toucher au TTS

Les trois moteurs sont **dans les Paramètres** (`#tts-engine-select`). Réglages
sous `localStorage['theologicus-tts-moteurs']`. Doc :
`.workbuddy-ai/artifacts/TTS_MOTEURS.md`.

- **`ttsEmission(texte, lang, onEnd, onErr, opts)` est LE point de sortie unique**
  des quatre files (`speakText`, `speakSection`, `speakBibleRef`,
  `speakConversation`). Ne jamais rappeler `speechSynthesis.speak` ailleurs : le
  moteur choisi serait ignoré. Le banc compte les sites (`speak` = 2, `cancel` = 1).
- **Tout arrêt passe par `ttsStop()`** — il coupe la synthèse locale **et** l'audio
  distant. `speechSynthesis.cancel()` appelé directement laisse jouer un MP3/WAV
  en cours.
- **`ttsLangIso(lang)`** traduit le nom de langue de l'app en code ISO pour le
  service. Cas piège : **`latin` → `fr`**, jamais `na` (`latin` n'est pas dans
  `SCRIPT_RANGES`).
- **`ttsErreurFatale(err)`** décide si la file **s'arrête** ou passe au segment
  suivant. Non reconnu comme fatal = une requête vouée à l'échec par segment.
- Le service local est **le nôtre** (`tools/start_supertonic.py`, stdlib + `wave`) :
  le dépôt Supertonic n'en fournit aucun. `pret()` doit tenir un **`RLock`**, un
  `Lock` simple s'auto-bloque.

Le reste (infrastructure générique `PROVIDERS` + `state.keys` +
`localStorage['__serverKeys']`) concerne les fournisseurs **de texte**, pas la voix.

### v110 — diagnostiquer ElevenLabs, et piloter le service local

**ElevenLabs dit maintenant sa cause.** Avant, l'échec s'affichait
« échec (moteur-erreur) » et rien de plus : le message réel était jeté. Pour
diagnostiquer, dans l'ordre :

1. **🔑 Vérifier la clé** → `GET {base}/user`. Mesuré : **401** +
   `{"detail":{"message":"Invalid API key"}}` sur clé invalide, 200 sur clé
   valide. Séparer « clé refusée » de « Voice ID inconnu » évite un aller-retour.
2. **📋 Lister les voix du compte** → `GET {base}/voices` : le `voice_id` par
   défaut `21m00Tcm4TlvDq8ikWAM` est une voix prémium disponible partout, mais un
   Voice ID recopié à la main peut ne pas exister sur le compte (404).
3. **Tester** vérifie la clé **avant** de synthétiser.

Traduction des statuts (`ttsCauseHttp`) : 401 clé refusée · 402 quota épuisé ·
403 voix non autorisée · 404 Voice ID inconnu · 422 paramètres refusés (essayer
un autre modèle) · 429 trop de requêtes. **CORS n'est pas en cause** : l'API
répond `access-control-allow-origin: *` et `access-control-allow-headers: *`

### v116 / v116b — réglage du débit et du ton chez ElevenLabs

**Le débit se règle par `voice_settings.speed`, PAS par du SSML.** Mesuré sur le
compte réel (155 caractères, 2 échantillons) : `eleven_multilingual_v2` speed 0.7
→ **+43 %** de durée, 1.2 → −19 % ; `eleven_flash_v2_5` 0.7 → **+51 %** ;
**`eleven_v3` : aucun effet**, et `<prosody rate="-80%">` y rend un audio
**identique** au texte brut. Plage documentée **0.7 – 1.2**. Garde
`ttsElAppliqueVitesse(modele)` : faux pour `eleven_v3*`.

**`eleven_v3` est piloté par le TEXTE**, pas par les réglages. Le ton théologique
y passe par une **balise audio** en tête (`ttsElBaliseTon`) : solennel
`[slows down]`, rassurant `[quietly]`, explicatif `[deliberate]`, neutre aucune.
**Une seule balise par énoncé**, toujours suivie de texte (l'empilement est
imprévisible). Balises **réservées à v3** : v2/flash gardent `speed` et ne
doivent jamais en voir une dans le texte. Stability bas (0,22–0,35) renforce les
balises — le mode narrateur est déjà à 0,35.

**`[slowly]` et `[softly]` sont PROSCRITS.** Ils sont mesurablement actifs (+16,5 %
sur 3 échantillons, min 12,70 s contre un max de 11,84 s en brut : distributions
disjointes) mais **absents de la liste officielle v3** (109 tags ; le rythme
documenté est `[slows down]`, `[deliberate]`, `[pause]`, `[quietly]`,
`[fast-paced]`, `[rushed]`). Une balise non reconnue n'est pas consommée, elle est
**prononcée** : le gain de durée était le mot lu en anglais dans une lecture
française. **Sur un modèle piloté par le texte, une hausse de durée n'est pas une
preuve d'effet** — toujours croiser avec la liste fermée des balises.

Dégradation sûre par construction : balise non reconnue = pas de ton, jamais un
mot lu.

**Méthode de mesure — obligatoire.** La génération ElevenLabs est **non
déterministe** : le même texte a donné 63991 puis 70261 octets (~±15 %). Un seul
échantillon ne prouve rien. Prendre **2–3 appels**, la moyenne **et** les valeurs
extrêmes ; l'effet est établi quand les **distributions sont disjointes** (min de
la condition > max du témoin). Vérifier le quota avant de sonder
(`GET {base}/user/subscription` → `character_count` / `character_limit`) : une
série de mesures épuise un compte free (10 000 car.) en une séance.

Garde associée : `verify_el_speed.js` interdit `[slowly]`/`[softly]` **dans le
code** (commentaires ôtés avant le scan, sinon le commentaire qui relate la
mesure déclenche le garde).
(mesuré au préflight OPTIONS).

**Le service local se pilote depuis l'app** (Windows) : routes
`/supertonic/status|start|stop|log` dans `proxy_server.py`, appelées en
same-origin, case de démarrage automatique, journal lisible. Deux pièges :

- **`ready` ≠ `running`** : `/health` peut répondre avant que le modèle ONNX soit
  chargé. Annoncer « en ligne » sur un port ouvert fait échouer la première
  lecture. `ready` exige `loaded: true`.
- **`proxy_server.py` est compilé DANS l'exe** : une route ajoutée là n'existe
  qu'après reconstruction de l'exécutable, pas après un simple HTML à jour.

## Android — ce qui change

Contrairement à ce PC Windows, **Android lit le français nativement**.

- Le WebView n'a pas `speechSynthesis` : le shim **v53** le reconstruit au-dessus
  du plugin natif `SpeechBridge` (moteur Google du téléphone), et fournit aussi
  `SpeechSynthesisUtterance` — sans quoi `makeUtterance` planterait. `getVoices()`
  rend **une voix synthétique `fr-FR`**, ce qui suffit à `getVoiceForLang`.
- Donc : si rien ne sort en français sur Android, chercher d'abord **les données
  vocales du moteur Google** (Paramètres → Système → Langues et saisie → Sortie de
  synthèse vocale → Google), pas le code.
- **Joindre le service du PC en LAN est déjà permis** :
  `android:usesCleartextTraffic="true"` dans le manifeste et `allowMixedContent`
  dans `capacitor.config.json`. Le piège est l'URL par défaut
  `http://127.0.0.1:8091` — sur le téléphone, elle désigne **le téléphone**. Il
  faut l'IP du PC, que le service affiche à son démarrage.
- **Ne pas promettre Supertonic embarqué** : le helper navigateur existe
  (`web/helper.js`, ONNX Runtime Web) mais demande **385 Mo** de modèle servi, et
  WebGPU n'est pas garanti dans un WebView Android.

## Méthode de diagnostic — dans cet ordre

1. **Vérifier que la vidéo/audio a du son.** `ffmpeg ... -af volumedetect`.
   Mesuré : la 1re vidéo de v106 était à **-91 dB** (silence numérique) ; la 2e à
   -24,7 dB. **Ne pas diagnostiquer à l'oreille un fichier muet** — regarder les
   images, et le dire.
2. **Énumérer les voix réellement exposées.** Sonde
   `.workbuddy-ai/artifacts/_tts/probe_voices.js`.
3. **Instrumenter `speechSynthesis.speak`** pour capturer texte / langue / voix
   de chaque utterance. Sonde `_tts/sonde_speak.js`. **C'est la preuve.**
4. **Tester chaque étage isolément** (`_tts/sonde_etapes.js`) — utile pour
   *disculper* un étage, mais **insuffisant pour conclure**.
5. **Banc à contre-épreuve** : `_tts/bench_v106_tts.js`. Le rejouer sur la
   baseline (`git show HEAD:THEOLOGICUS.html`) doit **échouer**.

## Pièges de la sonde

- **Tester les étages un par un ne prouve rien.** En v106, `normalizeArabicSpeech`,
  `chunkText`, `cleanMd`, `prosodyPreprocess`, `detectScriptLang` et
  `makeUtterance` étaient **tous corrects isolément** — le défaut vivait dans la
  **file réelle**. C'est `speak()` instrumenté qui a parlé.
- **En headless, les utterances échouent en `not-allowed`** (pas de périphérique
  audio, pas de geste). **C'est normal** et ça n'invalide pas la sonde : le
  journal `SPEAK` / `ONERROR` reste probant, et l'on voit que **tous** les
  segments partent. Ne pas prendre `not-allowed` pour un bug de l'app.
- **`getVoices()` est asynchrone** : liste vide ou partielle au premier appel.
  Attendre `voiceschanged` ou une condition, jamais un `sleep` fixe.
- Écrire les fichiers de travail **dans le projet**, pas dans `/tmp`
  (`node --check /tmp/x.js` → `C://tmp//x.js` introuvable).
- **Un `heredoc` bash mange les `${…}`** : `cat > x.js <<'EOF'` puis un gabarit
  JS contenant `${JSON.stringify(...)}` échoue en « Bad substitution:
  JSON.stringify ». Écrire les bancs avec l'outil d'écriture de fichiers,
  **jamais** par heredoc.
- Un **backtick dans un commentaire** à l'intérieur d'un gabarit JS casse le
  fichier (`missing ) after argument list`). Piégé cinq fois.
- **Ne pas mesurer un faux positif avec des phrases contenant le mot anglais
  isolé.** Premier jet du banc v107 : 131 phrases dont beaucoup étaient
  littéralement « Your est un possessif anglais » → 76 « faux positifs », un
  chiffre qui ne dit rien. Sur 108 phrases **françaises naturelles** le taux
  réel est 2 %, et sur 30 phrases du corpus 53 %. **Le choix des phrases est
  la mesure** ; les prendre dans le contenu réel de l'app.

## Contre-épreuve (obligatoire)

Un banc qui passe ne prouve rien s'il ne peut pas échouer.

```bash
cd /c/Theologicus
# La copie de référence DOIT vivre dans la RACINE du projet : l'app déduit ses
# chemins de corpus de location.pathname, et servie depuis un sous-dossier elle
# ne s'initialise pas (detectScriptLang undefined, 0 script) — l'échec ressemble
# alors à un bug du banc. NE PAS utiliser /tmp (node le résout en C:\tmp).
git show HEAD:THEOLOGICUS.html > AVANT_v106.html
node .workbuddy-ai/artifacts/_tts/bench_v107_langue.js avant    # -> doit ECHOUER
node .workbuddy-ai/artifacts/_tts/bench_v107_langue.js courant  # -> ECHECS = 0
rm -f AVANT_v106.html
```

Mesuré v107 sur la baseline : `ECHEC 6` — dont **16 phrases françaises recevant
`Google US English (en-US)`**, 21 mots accentués sur 104 en `anglais`, 25 en
NFD. Après correctif : **ECHECS = 0**, les 30 phrases en `Google français
(fr-FR)`.

Mesuré v106 sur la baseline : `hebreu -> "Google français (fr-FR)"` avec le
texte hébreu **brut** (donc jamais translittéré), et
`["Exode 24:", "12 dit ceci."]`. Après correctif : **ECHECS = 0**.

**Un banc doit aussi vérifier ce qu'il ne doit PAS casser** : les phrases
réellement anglaises doivent rester `anglais` (sinon on a remplacé un faux
positif par un faux négatif), et les écritures non latines doivent garder leur
langue ou leur repli déclaré (`VOICE_FALLBACK` : `copte → grec`,
`syriaque → francais`, `georgien → francais` — c'est le contrat existant, pas
une tolérance).

## Après toute retouche TTS

1. `node tools/check_syntax.js` (59 blocs, 0 erreur) — un backtick suffit à tuer
   un bloc entier.
2. `_tts/bench_v106_tts.js` → **0 échec**, **et** la contre-épreuve sur baseline
   échoue bien.
3. `_tts/bench_v107_langue.js` → **0 échec** (détection de langue : français
   jamais pris pour de l'anglais, anglais toujours reconnu, scripts non latins
   intacts), **et** contre-épreuve `avant` → 6 échecs.
4. Non-régression : `_v105/bench_v105.js` (24/24), `_v97/exhaustif.js` (0),
   `_v96/exhaustif.js` (0), `_v104/bench_overlap.js` (5/5),
   `garde_z.js` navigateur (**ECHECS = 0**).
5. Vérifier qu'un `:` **hors** référence sépare toujours
   (« Attention : voici la suite. » → 2 segments).
6. **Chercher les autres `\b` du fichier** — `grep -c '\\b('` en trouve une
   poignée ; toute liste de mots en français y est suspecte. Il en reste dans
   des heuristiques non-TTS : les vérifier si un symptôme voisin apparaît.
