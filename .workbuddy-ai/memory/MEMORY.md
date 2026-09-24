# THEOLOGICUS — notes long terme

**Détail procédural : ne pas reconstruire.** Skills `theologicus-apk-build`
(build, signature, CI, hygiène), `theologicus-zindex-guard` (échelle, mot à mot,
infobulles v105, pièges du banc), `theologicus-tts-diagnostic` (voix,
prononciation), `theologicus-code-fragilities` (pièges du code). Journaux
`.workbuddy-ai/memory/AAAA-MM-JJ.md` ; bancs `.workbuddy-ai/artifacts/`.

## Application

- `THEOLOGICUS.html` ~1,45 Mo, **59 blocs `<script>`**, **LF** (`count('\r\n')==0`)
  + 16 corpus à la volée (bible, quran, tafsir, libs, summa, summafr, fathers,
  reformed, orthodox, islamic, denzinger, quranwbw, quranroots, biblehb, biblegr,
  latin). `summafr` id `1001` = Ia q.1, **hors `THEO_CORPORA`**.
- **`THEO_CORPORA` pilote tout** : `{dir,pfx,idx,wrk,nms,label,tab,root,web}`.
  Précédence chrétienne **fathers → reformed → orthodox → islamic → denzinger**.
- Capacitor 8, `com.theologicus.app`, webDir `mobile/www`, minSdk 24 → targetSdk 36.
  Clés API en `localStorage['__serverKeys']` (shim v34), **jamais embarquées**.
- Licences : WLC ; `biblegr/` **CC BY-SA 3.0** ; Whitaker's Words MIT
  (**`Parser(frequency='X')`**, sinon « suus »/« sacramentum » disparaissent) ;
  Strong's GPL 3.0 ; OSHB CC BY 4.0 ; Quranic Arabic Corpus GPL ; Denzinger 1911.
- **`python tools/sync_html.py` après CHAQUE correctif** (4 copies, md5-vérifié).
  **Un correctif non synchronisé est invisible.** L'exe lit le HTML **sur le
  disque** → redémarrage requis.

## Config : HORS dossier d'installation (v115) + PORT STABLE (v117)

**Règle 1 : toute config que l'utilisateur ne doit pas retaper après une MAJ va
dans `%LOCALAPPDATA%/THEOLOGICUS/`.** Jamais dans le dossier d'install, jamais
seulement dans `localStorage`.

**Règle 2 : le port doit être STABLE.** Une origine = `scheme://hote:port`. Deux
ports = deux origines = **deux stockages navigateur distincts** (localStorage,
IndexedDB, cookies). Le port était **pseudo-aléatoire** dès que 8765 était pris
(`bind(("127.0.0.1", 0))`) → clé API et configuration semblaient effacées à chaque
lancement, alors que `/theologicus-keys` et `/config` répondaient 200. Désormais
plage **8765–8780**, premier port libre, **réutilisation d'une instance déjà
lancée** (sonde `/__theologicus_ping`, repli sur le contenu de `THEOLOGICUS.html`).
Le port est **journalisé au démarrage**. Banc `_v117/verify_port.py` (10/10).

- `_app_data_dir()` (`proxy_server.py`). Ni `robocopy` vers `_inst_v102` ni la
  réinstallation Inno ne le touchent.
- Routes **`/config`** (config TTS : moteur, voix, clé, narration, ton) et
  **`/theologicus-keys`**. Migration one-shot depuis `SERVE_DIR`.
- `ttsCfgSet()` écrit en miroir (`ttsEcrireConfigDisque`) ; `ttsRestaurerConfig
  Disque()` au `DOMContentLoaded`, **le disque prime** sur localStorage, puis
  resynchronise l'UI via `_ttsUIRecharger` — restauration **asynchrone**.
- **Cause réelle du « j'ai dû tout reconfigurer »** : `build_windows.py` écrit
  `{"mistral":""}` dans `dist` et `robocopy /E` le recopie sur `_inst_v102`.
- Toute route ajoutée à `proxy_server.py` est **compilée dans l'exe** → rebuild.
- Le profil WebView2 **est persistant** (`%APPDATA%/pywebview`, `private_mode=False`) :
  le port était toute l'histoire, pas le profil.
- **`sync_html.py` crie « PERIMEE » à tort sur `dist`/`_inst_v102`** : le build
  **estampe** `var STAMPED = '__THEO_VERSION__'` → `'2.0.145'`, soit ~9 octets de
  moins que la source. Ne pas « corriger » cet écart : il est voulu. Le script
  reconnaît maintenant le tampon.
- `tools/build_windows.py` **refuse d'écraser une cible plus grosse** que la source.
- Bancs : `verify_config.js` (15/15), `verify_config_route.py` (9/9, port libre).
  **Ne jamais écrire dans un magasin de config vivant :** sonder en lecture seule.

## z-index — une seule échelle, nommée

`:root`, **ordonnées**. Pièges 1–9 : skill zindex.

```
--z-content:1 --z-sticky-sub:10 --z-subnav:99 --z-sticky:100 --z-panel:199
--z-fab:200 --z-sidebar:999 --z-overlay:1000 --z-modal-lg:2000 --z-modal:3000
--z-popup:5000 --z-panneau:9000 --z-carte:9800 --z-mot:9900
--z-toast:10000 --z-bulle:100000 --z-au-dessus:100002
```

- **`--z-panneau` < `--z-carte` < `--z-mot`** : « toute fiche domine tout panneau ».
- **CINQ panneaux, pas trois** : 3 verse-tip en **inline JS** (`style.cssText`) +
  `#verse-mini-tip` et `#v37-tip` en feuille. Un grep des feuilles n'en voit que
  deux — c'est l'erreur qui produit un correctif partiel.
- Panneaux et fiches sont enfants de premier niveau de `body` ; `tip.contains(fiche)`
  est **toujours faux**. **Un enfant DOM ne peint jamais au-dessus de son parent par
  z-index.** Aucun `transform`/`filter`/`opacity<1` sur un ancêtre. Le duel se conclut
  par `elementFromPoint`. **À z-index égal, l'ORDRE DU DOM tranche.**
- **Un contenu non modal ne doit pas porter de littéral numérique.**

## Mot à mot — le mot vit DANS le panneau

Racine de cinq défauts (v93–v104) ; **détail : skill zindex**. `.hb`/`.gr`/`.lat`
dans `#hb-slot` **à l'intérieur** de `#bible-verse-tip`, `.qw` dans
`#quran-verse-tip` (panneau alors en `pointer-events:auto`) ; **Tafsir n'a
légitimement aucun mot** ; **jamais fermer un panneau sur le seul `relatedTarget`** ;
un placement doit connaître les **obstacles** ; `window.__placerFiche()` :
**réutiliser**. Tester un mot de **1 px**. `window.__v105Ancre(el,nom)` doit être
consulté aux **CINQ sites** (bible ×2, quran, tafsir, `v37`).

## TTS — trois moteurs, un seul point de sortie

`cleanMd` → `prosodyPreprocess` → `splitByLanguage` → `splitMixedSegments` →
`chunkText(180)` → `makeUtterance` → file `speakNextSegment`. Trois moteurs depuis
v109 : système / ElevenLabs / Supertonic. **Sortie unique : `ttsEmission()`.**
Doc `artifacts/TTS_MOTEURS.md` ; skill `theologicus-tts-diagnostic`.

- **`getVoiceForLang(lang)` doit rendre `null`, jamais la voix française** hors
  français, sinon `transliterateForSpeech()` est du code mort.
- **Le `:` d'une référence n'est pas une fin de phrase** : protéger `(\d)\s*:\s*(\d)`.
- **`\b` est ASCII : un accent fabrique une frontière** (`\bme\b` matche dans
  `poème`). Correctif : `(?<![\p{L}\p{N}])…(?![\p{L}\p{N}])` **et** `NFC` avant tout
  test. **Deuxième site : `speakBibleRefs()`**. Verdict anglais : ≥ 2 mots-outils,
  **exclure `on`, `son`, `sont`, `mais`, `pas`, `plus`, `pour`, `dans`, `sur`**.
- **Le moteur applique sa voix PAR DÉFAUT**, pas « la plus proche » du tag. WebView2 :
  **0 voix française**, défaut `Microsoft George (en-GB)`. **WebView2 n'expose QUE
  les voix OneCore locales** (les 325 d'Edge sont inatteignables). Pack :
  `Add-WindowsCapability -Online -Name Language.Speech~~~fr-FR~0.0.1.0` + relancer.
- **Latin lu en français : voulu. Aucun TTS ne couvre le latin. Question close.**
- Invariants fichier : `speechSynthesis.speak(utt)` **2 sites**, `cancel()` **1**.
- **Supertonic 3** : MIT, ONNX local, 31 langues (fr/el/ar, **ni hébreu ni latin**),
  CPU seul, 385 Mo. **Le dépôt amont ne fournit AUCUN serveur** :
  `tools/start_supertonic.py` est le nôtre, `pret()` tient un **`RLock`**. Routes
  `/supertonic/status|start|stop` dans `proxy_server.py` ; `ready` exige
  `loaded:true` (**`ready` != `running`**) ; `script` est un **booléen**.

### ElevenLabs — débit et ton (v116 / v116b)

`POST /text-to-speech/{id}?output_format=mp3_44100_128`, en-tête `xi-api-key`.
`eleven_v3` seul couvre l'hébreu.

- **Piège de mesure : la génération est NON déterministe** (même texte → 63991 puis
  70261 octets, ~±15 %). **Un seul échantillon ne prouve rien** : moyenne sur 2–3
  appels + valeurs extrêmes (distributions disjointes = preuve).
- **v116** : le débit se règle par **`voice_settings.speed`**, **pas par du SSML**.
  Mesuré : v2 speed 0.7 → **+43 %**, 1.2 → −19 % ; flash 0.7 → **+51 %** ;
  **v3 : aucun effet**, et `<prosody rate="-80%">` rend un audio identique au brut.
  Plage API 0.7–1.2. Garde **`ttsElAppliqueVitesse()`** (faux pour `eleven_v3*`).
- **v116b** : v3 est piloté par le **texte** → le ton y passe par une **balise audio**
  en tête (`ttsElBaliseTon`) : solennel `[slows down]`, rassurant `[quietly]`,
  explicatif `[deliberate]`, neutre aucune. **Une seule balise par énoncé**, toujours
  suivie de texte (l'empilement est imprévisible). Balises **réservées à v3**.
- **`[slowly]` / `[softly]` : PROSCRITS.** Mesurés actifs (+16,5 % sur 3 échantillons,
  min 12,70 s > max brut 11,84 s) mais **absents de la liste officielle v3** → le
  supplément de durée était le **mot prononcé en anglais** dans une lecture française.
  Un garde dans `verify_el_speed.js` les interdit (scan du code, commentaires ôtés).
- Dégradation sûre par construction : balise non reconnue = absence de ton, jamais un
  mot lu. Stability bas (0,22–0,35) renforce les balises → le mode narrateur (0,35).

## Build / signature — CLÉ CRITIQUE

`~/.workbuddy-ai/keys/theologicus-release.jks`, alias `theologicus`, + `.PASSWORD.txt`
et `.base64.txt`. RSA 4096. **Ne jamais remplacer** : plus aucune MAJ publiable.
SHA-256 `93d8324058f1ecd1d252d97b976854ffaf2a976605b9658983d17db6d70f5e67`.

- **Tout dossier de corpus ajouté doit être dans les TROIS listes** (`COPY_DIRS` de
  `prepare_mobile.py`, job `windows`, `build_installer.bat`). Une liste oubliée ne
  casse pas le build : elle donne des 404 à l'usage.
- `tools/check_syntax.js` **avant toute compilation**.
- **Windows** : `tools/build_windows.py` (les `.bat` ne s'exécutent pas dans
  l'environnement de l'agent — mesuré). Le build **renomme** `build/`/`dist/THEOLOGICUS`
  au lieu de les supprimer (le garde-fou anti-suppression en masse bloque `rmtree`,
  **PyInstaller s'y fait prendre à l'étape COLLECT**).
- **Installation réelle : `C:\Theologicus\_inst_v102`** (raccourci Bureau + registre
  Inno `{7C1E2A44-…}_is1`). **Pas** `%LOCALAPPDATA%\Programs\THEOLOGICUS` (2.0.94).
- `Get-Process` peut rendre **vide** alors que l'app tourne : le vrai signal d'un exe
  en cours d'usage est **`WinError 32`** à l'écriture.

## Dépôt / CI

`jelliel/THEOLOGICUS`, `main`. **Commit + push à CHAQUE correctif** (message en
anglais, `git commit -F`). Version = `git rev-list --count HEAD` (2.0.N), **lue dans
l'API, jamais annoncée d'avance**. Le workflow filtre sur `paths:` — après un push,
prouver qu'un run CI existe par l'API Actions (`head_sha`). **Jamais `git stash`**
(a déjà détruit `.git/refs` et le `.pack`). Tout ce qui doit rester hors du dépôt
s'écrit dans `.gitignore` ; contrôle : `git ls-files | git check-ignore --stdin`
→ **vide**. Détail : skill `theologicus-apk-build`.

## Décisions produit arrêtées

- Gestes : appui long → bulle « Add to chat » ; double-tap → encadrement ; tap sur
  passage annoté → son commentaire (400 ms).
- Verrou : aucune pénalité au changement de fenêtre, difficulté plafonnée à 3,
  question ratée qui revient, « souvenir de moi » 7 jours.
- Références : lien local d'abord, web en secours. Le panneau ☷ RÉFÉRENCES n'a
  **AUCUNE citation de verset** (35 documents, 0 citation) ; les nombres entre
  parenthèses sont des **dates de publication**. Un résolveur y serait du code mort.
- Traduction embarquée = « BJ 1998 » (sous droits) → conditionne l'export et le
  comparateur. LibreTranslate : `artifacts/LIBRETRANSLATE.md` ; **l'IP du PC change
  (DHCP)** → relancer `tools/start_libretranslate.py`.
