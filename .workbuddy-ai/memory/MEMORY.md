# THEOLOGICUS — notes long terme

Détail procédural — **ne pas reconstruire de mémoire** :
`theologicus-apk-build` (build, signature, CI, hygiène du dépôt, packaging Windows),
`theologicus-zindex-guard` (échelle, mot à mot, infobulles v105, pièges du banc),
`theologicus-tts-diagnostic` (voix, prononciation),
`theologicus-code-fragilities` (pièges du code, règles de banc).
Journaux `.workbuddy-ai/memory/AAAA-MM-JJ.md` ; bancs `.workbuddy-ai/artifacts/`.

## Application

- `THEOLOGICUS.html` ~1,42 Mo, **59 blocs `<script>`**, **LF** (jamais CRLF :
  `s.count('\r\n') == 0`) + **16 corpus** à la volée : `bible/`, `quran/`,
  `tafsir/`, `libs/`, `summa/` 611 q., `summafr/` 613 q. (id `1001` = Ia q.1,
  **hors `THEO_CORPORA`**), `fathers/` 118, `reformed/` 91, `orthodox/` 43,
  `islamic/` 93, `denzinger/` 128, `quranwbw/`, `quranroots/`, `biblehb/` 39,
  `biblegr/` 27 (+`strongs.js` chacun), `latin/`.
- **`THEO_CORPORA` pilote tout** : `{dir,pfx,idx,wrk,nms,label,tab,root,web}`.
  Précédence chrétienne : **fathers → reformed → orthodox → islamic → denzinger** ;
  un titre présent dans deux corpus renvoie le premier.
- Capacitor 8, `com.theologicus.app`, webDir `mobile/www`, minSdk 24 → targetSdk 36,
  AGP 8.13.0, Gradle 8.14.3. Clés API en `localStorage['__serverKeys']` (shim v34),
  **jamais embarquées**.
- Licences : WLC, MorphGNT/SBLGNT (`biblegr/` **CC BY-SA 3.0**), Whitaker's Words
  (latin, MIT — **`Parser(frequency='X')` : le défaut `'C'` supprime « suus »,
  « sacramentum », « omnino »**), Strong's OS **GPL 3.0**, OSHB **CC BY 4.0**,
  Quranic Arabic Corpus **GPL sans modification**, Denzinger 1911.
- **`python tools/sync_html.py` après CHAQUE correctif** : recopie vers
  `mobile/www/index.html`, `dist/THEOLOGICUS/`, `_inst_v102/`, md5-vérifie, refuse
  d'écraser une cible plus grosse. **Un correctif non synchronisé est invisible.**

## z-index — une seule échelle, nommée

`:root`, **ordonnées**. Pièges 1 à 9 : skill `theologicus-zindex-guard`.

```
--z-content:1  --z-sticky-sub:10  --z-subnav:99  --z-sticky:100
--z-panel:199  --z-fab:200  --z-sidebar:999  --z-overlay:1000
--z-modal-lg:2000  --z-modal:3000  --z-popup:5000
--z-panneau:9000   <- panneaux de verset (Bible, Coran, Tafsir, mini)
--z-carte:9800     <- carte laterale : translitteration #v37-tip
--z-mot:9900       <- fiches de mot : LA PLUS HAUTE des trois
--z-toast:10000    --z-bulle:100000 ; --z-au-dessus:100002
```

- **`--z-panneau` < `--z-carte` < `--z-mot`** — invariant `_v97/exhaustif.js` :
  « toute fiche domine tout panneau ». **Un fallback `var(--x,N)` faux ne se
  déclenche jamais tant que la variable existe** — le tenir à jour quand même.
- **CINQ panneaux, pas trois** : 3 verse-tip en **inline JS** (`style.cssText`) +
  `#verse-mini-tip` et `#v37-tip` en feuille. Un grep des feuilles n'en voit que
  deux : c'est l'erreur qui produit un correctif partiel.
- Panneaux et fiches sont enfants de premier niveau de `body` → z-index comparés
  *directement* ; `tip.contains(fiche)` est **toujours faux**. **Un enfant DOM ne
  peint jamais au-dessus de son parent par z-index.** **Aucun
  `transform`/`filter`/`opacity < 1` sur un ancêtre.** Le duel se conclut par
  `elementFromPoint`, jamais par des nombres. **À z-index égal, l'ORDRE DU DOM
  tranche** (`#v37-tip` = 93, `#bible-verse-tip` = 122).
- **Un contenu non modal ne doit pas porter de littéral numérique.**

## Mot à mot et infobulles — le mot vit DANS le panneau

**Racine de cinq défauts** (v93, v96, v100, v101–v104). Détail : skill zindex.

- `.hb`/`.gr`/`.lat` dans `#hb-slot`, **à l'intérieur** de `#bible-verse-tip` ;
  `.qw` dans `#quran-verse-tip` ; le panneau passe alors `pointer-events:auto`.
  `#hb-slot` n'est rempli que pour les livres 1..39 (le NT est grec). **Tafsir n'a
  légitimement aucun mot.**
- **Ne jamais fermer un panneau sur le seul `relatedTarget`** (le panneau est
  au-dessus du lien) : **armer + annuler**, juger sur la **position réelle du
  pointeur**. **Un placement qui ne connaît que sa cible est aveugle** : il doit
  connaître les **obstacles** (4 candidats hors panneau, plafonner les **deux**
  dimensions, plancher **150×120 px**). **Un garde-fou conditionné à une détection
  parfaite s'efface sur les cas limites — le fallback doit avoir son propre
  critère.** `window.__placerFiche()` : **réutiliser, jamais replacer à la main** ;
  tester un mot de **1 px**, un mot large ne teste rien.
- **v105, infobulles déplaçables** (`#v105-cartes-deplacables`) : 9 cibles, poignée
  ⠿, ✕ de remise en place, clé `v105-pos-<nom>`, interrupteur dans `#v6-more-menu`.
  **`window.__v105Ancre(el,nom)` doit être consulté aux CINQ sites de placement**
  (bible ×2, quran, tafsir, `v37`), sinon `showTip`/`place()` écrasent la position
  choisie. Cinq pièges : `setPointerCapture()` **refusé en silence** sur un hôte
  `pointer-events:none` (doubler par des écouteurs *document*) ; les panneaux
  réécrivent `innerHTML`, donc **aucun cache « poignée déjà posée » ne tient** ; un
  minuteur de fermeture doit être annulé pendant un drag **et rejugé à l'échéance** ;
  un bouton enfant d'une zone glissable est avalé par elle
  (`e.target.closest('.v105-x')`) ; la fermeture se juge sur la **position réelle du
  pointeur** (`#v105c-pointeur`, boîte gonflée de 48 px, gouttière mesurée 33 px).

## TTS — la voix ne doit jamais venir d'une autre langue

`cleanMd` → `prosodyPreprocess` → `splitByLanguage` → `splitMixedSegments` →
`chunkText(180)` → `makeUtterance` → file `speakNextSegment` (avance sur `onend`).
`readLangMode` (`'fr'` par défaut = français forcé, sauf écritures non-latines).
**Aucun TTS en ligne intégré** (0 occurrence d'ElevenLabs) : tout passe par le
`speechSynthesis` du WebView. Diagnostic : skill `theologicus-tts-diagnostic`.

- **`getVoiceForLang(lang)` doit rendre `null`, jamais la voix française, quand
  `lang` n'est pas le français** ; sinon `makeUtterance` testant `if (v)`, le repli
  phonétique `transliterateForSpeech()` reste du code mort. Garde
  `if (prefix !== 'fr') return null;` + `!_langMatches(v, prefix)`.
  `יְהוֹשֻׁעַ` → « yehochoua », `λόγος` → « logos ».
- **Le `:` d'une référence n'est pas une fin de phrase** : protéger
  `(\d)\s*:\s*(\d)` par un marqueur avant le split (`Exode 24:12` était coupé en
  deux). Un `:` ailleurs sépare toujours.
- **Latin : pas dans `SCRIPT_RANGES`, donc lu en français. C'est voulu** (même
  alphabet, convention légitime). **Aucun TTS ne couvre le latin** — ni ElevenLabs
  ni Supertonic. **Question close, ne pas rouvrir.**

### v107 / v108 — les deux causes de « le français est lu en anglais »

**1. `\b` est ASCII : un accent fabrique une frontière.** `\w` vaut
`[A-Za-z0-9_]` **même avec le flag `u`** : `\bs\b` matche dans `très`, `\bme\b`
dans `poème`, `\bthe\b` dans `thèse` **une fois en NFD** (U+0300 non-`\w`). Vécu :
16/30 phrases françaises reçoivent la voix **anglaise**. **Toute liste de mots
bornée par `\b` est fausse en français** — correctif
`(?<![\p{L}\p{N}])…(?![\p{L}\p{N}])` **et** `NFC` avant tout test (les deux
nécessaires). **Deuxième site : `speakBibleRefs()`**, où `\b` ratait **3 noms de
livres accentués sur 7** (`Ésaïe`, `Ézéchiel`, `Éphésiens`), masqué par les
initiales ASCII et par le repli générique qui produit le même libellé. Verdict
anglais exigeant (≥ 2 mots-outils) ; **exclure `on`, `son`, `sont`, `mais`, `pas`,
`plus`, `pour`, `dans`, `sur`** — anglais ET français, c'est le piège.
Contre-épreuve `_tts/bench_v107_langue.js` (6 → 0 ; test 7b : 3/7 → 7/7).

**2. Le moteur applique sa voix PAR DÉFAUT** — il ne choisit pas « la plus proche »
du tag. Mesuré dans la vraie app WebView2 : `voices total=4`, **0 voix française**,
défaut `Microsoft George (en-GB)` ; `detectScriptLang` rend `francais`,
`getVoiceForLang('francais')` rend `null`, l'énoncé part en `lang='fr-FR'` — **et
c'est George qui lit**. D'où le fait que **le correctif de code ne change rien à
l'oreille** : avant comme après, le repli est la même voix anglaise.

- **WebView2 n'expose QUE les voix OneCore locales** de la machine. Les 325 voix
  d'Edge dont 13 françaises « Online (Natural) » sont une **fonction du
  navigateur**, inatteignables depuis l'app : ne jamais compter avec elles.
- Langues installées sur ce poste : `en-MU, en-GB, en-US, ar-SA, he, el, syr-Syrc`
  — **aucun pack français**. Pack :
  `Add-WindowsCapability -Online -Name Language.Speech~~~fr-FR~0.0.1.0`
  (élévation, ~90 Mo), puis **fermer et relancer** l'app.
- v108 (`signalerVoixManquante()`, `_NOMS_LANGUE_TTS`, bandeau
  `#v108-voix-manquante`, clé `theo_voix_manquante_ignoree`) **nomme le problème au
  lieu de lire fautivement en silence**. Un silence fautif vaut moins qu'un aveu.

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
- **L'exe Windows lit le HTML SUR LE DISQUE** : aucun rebuild, 4 copies à
  synchroniser, et WebView2 garde le HTML chargé au démarrage → **redémarrage requis**.

## Dépôt / CI

`jelliel/THEOLOGICUS`, `main`. **L'utilisateur veut un commit + push à CHAQUE
correctif** (message en anglais, `git commit -F`). Version = `git rev-list --count
HEAD` (2.0.N), **lue dans l'API, jamais annoncée d'avance**. Le workflow filtre sur
`paths:` — un push hors de ces chemins ne déclenche **rien** ; après un push, prouver
qu'un run CI existe par l'API Actions (`head_sha`). **Jamais `git stash` ici** (il a
déjà détruit `.git/refs` et le `.pack`). **Tout ce qui doit rester hors du dépôt
s'écrit dans `.gitignore`**, et se contrôle par `git ls-files | git check-ignore
--stdin` → **vide**. Détail : skill `theologicus-apk-build`, « Repo hygiene ».

## Décisions produit arrêtées

- Gestes : appui long → bulle « Add to chat » ; double-tap → encadrement ; tap sur
  passage annoté → son commentaire (400 ms).
- Verrou : aucune pénalité au changement de fenêtre (chrono en pause), difficulté
  montante plafonnée à 3, question ratée qui revient, « souvenir de moi » 7 jours.
- Références : lien local d'abord, web en secours.
- Le panneau ☷ RÉFÉRENCES n'a AUCUNE citation de verset : 35 documents, 0 citation.
  Les nombres entre parenthèses sont des **dates de publication** ((1964), (251),
  (380)). Un résolveur de citations y serait du code mort.
- Traduction embarquée = « BJ 1998 » → sous droits : conditionne l'export et le
  comparateur de traductions.
- LibreTranslate : voir `artifacts/LIBRETRANSLATE.md`. L'**IP du PC change (DHCP)** →
  relancer `tools/start_libretranslate.py`. WiFi `192.168.100.71`, Tailscale
  `100.74.55.70`.
