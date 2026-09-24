# THEOLOGICUS — notes long terme

**Détail procédural : ne pas reconstruire de mémoire.** Skills
`theologicus-apk-build` (build, signature, CI, hygiène), `theologicus-zindex-guard`
(échelle, mot à mot, infobulles v105, pièges du banc), `theologicus-tts-diagnostic`
(voix, prononciation), `theologicus-code-fragilities` (pièges du code, règles de
banc). Journaux `.workbuddy-ai/memory/AAAA-MM-JJ.md` ; bancs `.workbuddy-ai/artifacts/`.

## Application

- `THEOLOGICUS.html` ~1,45 Mo, **59 blocs `<script>`**, **LF** (`s.count('\r\n')==0`)
  + 16 corpus à la volée : bible, quran, tafsir, libs, summa, summafr, fathers,
  reformed, orthodox, islamic, denzinger, quranwbw, quranroots, biblehb, biblegr,
  latin. `summafr` id `1001` = Ia q.1, **hors `THEO_CORPORA`**.
- **`THEO_CORPORA` pilote tout** : `{dir,pfx,idx,wrk,nms,label,tab,root,web}`.
  Précédence chrétienne **fathers → reformed → orthodox → islamic → denzinger**.
- Capacitor 8, `com.theologicus.app`, webDir `mobile/www`, minSdk 24 → targetSdk 36,
  AGP 8.13.0, Gradle 8.14.3. Clés API en `localStorage['__serverKeys']` (shim v34),
  **jamais embarquées**.
- Licences : WLC ; MorphGNT/SBLGNT `biblegr/` **CC BY-SA 3.0** ; Whitaker's Words MIT
  (**`Parser(frequency='X')`** — le défaut `'C'` supprime « suus », « sacramentum »,
  « omnino ») ; Strong's **GPL 3.0** ; OSHB **CC BY 4.0** ; Quranic Arabic Corpus
  **GPL sans modification** ; Denzinger 1911.
- **`python tools/sync_html.py` après CHAQUE correctif** (4 copies, md5-vérifié,
  refuse d'écraser une cible plus grosse). **Un correctif non synchronisé est
  invisible.** L'exe Windows lit le HTML **sur le disque** → redémarrage requis.

## Persistance de la configuration — HORS dossier d'installation (v115)

**Règle : toute config que l'utilisateur ne doit pas retaper après une MAJ va
dans `%LOCALAPPDATA%/THEOLOGICUS/`. Jamais dans le dossier d'install, jamais
seulement dans `localStorage`.**

- `_app_data_dir()` (`proxy_server.py`) → `%LOCALAPPDATA%/THEOLOGICUS/` (repli
  `~/THEOLOGICUS`). Ni `robocopy` vers `_inst_v102` ni la réinstallation Inno ne
  le touchent.
- Routes : **`/config`** (GET/POST — config TTS complète : moteur, voix, clé,
  narration, ton) et **`/theologicus-keys`** (GET/POST — clés API). Migration
  one-shot depuis `SERVE_DIR` si le fichier durable est absent.
- Côté HTML : `ttsCfgSet()` écrit en miroir (`ttsEcrireConfigDisque`, POST) ;
  `ttsRestaurerConfigDisque()` au `DOMContentLoaded`, **le disque prime** sur
  localStorage (vérité quand localStorage a été effacé), puis resynchronise
  l'UI via `_ttsUIRecharger` — la restauration est **asynchrone**. Repli
  silencieux si `/config` est absent (mobile/standalone).
- **Piège mesuré** : `build_windows.py` écrit `{"mistral":""}` dans `dist`, et
  `robocopy /E` le recopie sur `_inst_v102` → **la clé API était effacée à
  chaque build**. C'est la cause réelle du « j'ai dû tout reconfigurer ».
- Toute route ajoutée à `proxy_server.py` est **compilée dans l'exe** → rebuild.

Bancs : `artifacts/_tts/verify_config.js` (15/15) et `verify_config_route.py`
(9/9, vrai gestionnaire proxy sur port libre — 8765 est pris par l'app).

## z-index — une seule échelle, nommée

`:root`, **ordonnées**. Pièges 1–9 : skill zindex.

```
--z-content:1 --z-sticky-sub:10 --z-subnav:99 --z-sticky:100 --z-panel:199
--z-fab:200 --z-sidebar:999 --z-overlay:1000 --z-modal-lg:2000 --z-modal:3000
--z-popup:5000 --z-panneau:9000 --z-carte:9800 --z-mot:9900
--z-toast:10000 --z-bulle:100000 --z-au-dessus:100002
```

- **`--z-panneau` < `--z-carte` < `--z-mot`** — invariant `_v97/exhaustif.js` :
  « toute fiche domine tout panneau ». Un fallback `var(--x,N)` faux ne se déclenche
  jamais tant que la variable existe — le tenir à jour quand même.
- **CINQ panneaux, pas trois** : 3 verse-tip en **inline JS** (`style.cssText`) +
  `#verse-mini-tip` et `#v37-tip` en feuille. Un grep des feuilles n'en voit que
  deux : c'est l'erreur qui produit un correctif partiel.
- Panneaux et fiches sont enfants de premier niveau de `body` → z-index comparés
  directement ; `tip.contains(fiche)` est **toujours faux**. **Un enfant DOM ne peint
  jamais au-dessus de son parent par z-index.** Aucun `transform`/`filter`/
  `opacity<1` sur un ancêtre. Le duel se conclut par `elementFromPoint`, jamais par
  des nombres. **À z-index égal, l'ORDRE DU DOM tranche.**
- **Un contenu non modal ne doit pas porter de littéral numérique.**

## Mot à mot — le mot vit DANS le panneau

Racine de cinq défauts (v93, v96, v100, v101–v104) ; **détail : skill zindex**.
`.hb`/`.gr`/`.lat` dans `#hb-slot` **à l'intérieur** de `#bible-verse-tip`, `.qw`
dans `#quran-verse-tip` (le panneau passe alors `pointer-events:auto`) ; **Tafsir n'a
légitimement aucun mot** ; **jamais fermer un panneau sur le seul `relatedTarget`**
(armer + annuler, juger sur la position réelle du pointeur) ; un placement doit
connaître les **obstacles**, pas seulement sa cible ; `window.__placerFiche()` :
**réutiliser, jamais replacer à la main** ; tester un mot de **1 px**. v105
(`window.__v105Ancre(el,nom)`) doit être consulté aux **CINQ sites de placement**
(bible ×2, quran, tafsir, `v37`).

## TTS — trois moteurs, un seul point de sortie

`cleanMd` → `prosodyPreprocess` → `splitByLanguage` → `splitMixedSegments` →
`chunkText(180)` → `makeUtterance` → file `speakNextSegment`. `readLangMode`
(`'fr'` = français forcé sauf écritures non-latines). **Trois moteurs depuis v109**
(système / ElevenLabs / Supertonic) et **un seul point de sortie, `ttsEmission()`**.
Doc `artifacts/TTS_MOTEURS.md` ; diagnostic et pièges détaillés : skill
`theologicus-tts-diagnostic`. Les règles qui ont coûté cher :

- **`getVoiceForLang(lang)` doit rendre `null`, jamais la voix française** quand
  `lang` n'est pas le français, sinon le repli `transliterateForSpeech()` est du code
  mort. Garde `if (prefix !== 'fr') return null;` + `!_langMatches(v, prefix)`.
- **Le `:` d'une référence n'est pas une fin de phrase** : protéger
  `(\d)\s*:\s*(\d)` avant le split (`Exode 24:12` était coupé en deux).
- **`\b` est ASCII : un accent fabrique une frontière** (`\w` = `[A-Za-z0-9_]` même
  avec le flag `u` ; `\bme\b` matche dans `poème`). Vécu : 16/30 phrases françaises
  lues avec la voix **anglaise**. Correctif : `(?<![\p{L}\p{N}])…(?![\p{L}\p{N}])`
  **et** `NFC` avant tout test. **Deuxième site : `speakBibleRefs()`** (`\b` ratait
  `Ésaïe`, `Ézéchiel`, `Éphésiens`). Verdict anglais : ≥ 2 mots-outils, **exclure
  `on`, `son`, `sont`, `mais`, `pas`, `plus`, `pour`, `dans`, `sur`** — les deux
  langues, c'est le piège.
- **Le moteur applique sa voix PAR DÉFAUT**, il ne choisit pas « la plus proche » du
  tag. Mesuré dans WebView2 : 4 voix, **0 française**, défaut `Microsoft George
  (en-GB)` ; l'énoncé part en `lang='fr-FR'` **et c'est George qui lit**. **WebView2
  n'expose QUE les voix OneCore locales** (les 325 voix d'Edge sont inatteignables).
  Pack : `Add-WindowsCapability -Online -Name Language.Speech~~~fr-FR~0.0.1.0` puis
  relancer. v108 (`#v108-voix-manquante`) **nomme le problème**.
- **Latin : lu en français, c'est voulu. Aucun TTS ne couvre le latin. Question
  close, ne pas rouvrir.**
- **Invariants testés sur le fichier** : `speechSynthesis.speak(utt)` **2 sites**,
  `cancel()` **1 site** (dans `ttsStop`).
- **v109 / v110** : Supertonic 3 (MIT, ONNX local, 31 langues dont fr/el/ar, **ni
  hébreu ni latin**, 10 styles, **CPU seul**, 385 Mo, RTF 0,29–0,33) — **le dépôt
  amont ne fournit AUCUN serveur**, `tools/start_supertonic.py` est le nôtre, et
  `pret()` doit tenir un **`RLock`**. ElevenLabs :
  `POST /text-to-speech/{id}?output_format=mp3_44100_128`, en-tête `xi-api-key`,
  `eleven_v3` seul couvre l'hébreu. Clés en
  `localStorage['theologicus-tts-moteurs']`, **jamais embarquées**. Les routes
  `/supertonic/status|start|stop` vivent dans `proxy_server.py`, **compilé DANS
  l'exe** → toute route nouvelle exige un **nouvel exe** ; `ready` exige
  `loaded:true` (**`ready` != `running`**) ; le champ `script` est un **booléen**.
  **Un message d'erreur qui ne dit pas la cause est un défaut.**

## Build / signature — CLÉ CRITIQUE

`C://Users//toshr//.workbuddy-ai//keys//theologicus-release.jks`, alias
`theologicus`, + `.PASSWORD.txt` et `.base64.txt` (CI). RSA 4096. **Ne jamais
remplacer** : plus aucune mise à jour publiable. SHA-256
`93d8324058f1ecd1d252d97b976854ffaf2a976605b9658983d17db6d70f5e67`
(`apksigner verify --print-certs`).

- **Tout dossier de corpus ajouté doit être dans les TROIS listes** (`COPY_DIRS` de
  `prepare_mobile.py`, le job `windows`, `build_installer.bat`). Une liste oubliée ne
  casse pas le build : elle donne des 404 à l'usage.
- `tools/check_syntax.js` **avant toute compilation** (incident v66) ; il ne valide
  pas un script isolé.
- **Windows** : `build_installer.bat` **ou** `tools/build_windows.py` (équivalents, à
  garder en phase). **Aucun `.bat` ne s'exécute dans l'environnement de l'agent**
  (mesuré) → utiliser le `.py`. Le build **renomme** `build/THEOLOGICUS` et
  `dist/THEOLOGICUS` au lieu de les supprimer : le garde-fou de suppression en masse
  bloque `rmtree`, **et PyInstaller s'y fait prendre à l'étape COLLECT**.
- **L'installation réelle de l'utilisateur est `C:\Theologicus\_inst_v102`** — le
  raccourci du Bureau y pointe, et le registre Inno y déclare l'app
  (`{7C1E2A44-…}_is1`). **Pas** `%LOCALAPPDATA%\Programs\THEOLOGICUS` (resté 2.0.94).
- `Get-Process` peut rendre **vide** alors que l'app tourne (espaces isolés) : le vrai
  signal d'un exe en cours d'usage est **`WinError 32`** à l'écriture.

## Dépôt / CI

`jelliel/THEOLOGICUS`, `main`. **L'utilisateur veut un commit + push à CHAQUE
correctif** (message en anglais, `git commit -F`). Version = `git rev-list --count
HEAD` (2.0.N), **lue dans l'API, jamais annoncée d'avance**. Le workflow filtre sur
`paths:` — un push hors de ces chemins ne déclenche **rien** ; après un push, prouver
qu'un run CI existe par l'API Actions (`head_sha`). **Jamais `git stash` ici** (il a
déjà détruit `.git/refs` et le `.pack`). **Tout ce qui doit rester hors du dépôt
s'écrit dans `.gitignore`**, et se contrôle par `git ls-files | git check-ignore
--stdin` → **vide**. Détail : skill `theologicus-apk-build`.

## Décisions produit arrêtées

- Gestes : appui long → bulle « Add to chat » ; double-tap → encadrement ; tap sur
  passage annoté → son commentaire (400 ms).
- Verrou : aucune pénalité au changement de fenêtre (chrono en pause), difficulté
  montante plafonnée à 3, question ratée qui revient, « souvenir de moi » 7 jours.
- Références : lien local d'abord, web en secours. Le panneau ☷ RÉFÉRENCES n'a
  **AUCUNE citation de verset** : 35 documents, 0 citation. Les nombres entre
  parenthèses sont des **dates de publication** ((1964), (251), (380)). Un résolveur
  de citations y serait du code mort.
- Traduction embarquée = « BJ 1998 » → sous droits : conditionne l'export et le
  comparateur de traductions.
- LibreTranslate : voir `artifacts/LIBRETRANSLATE.md`. L'**IP du PC change (DHCP)** →
  relancer `tools/start_libretranslate.py`. WiFi `192.168.100.71`, Tailscale
  `100.74.55.70`.
