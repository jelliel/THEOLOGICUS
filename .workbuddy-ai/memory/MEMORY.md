# THEOLOGICUS — notes long terme

Détail narratif : skills `theologicus-apk-build`, `theologicus-zindex-guard`,
journaux datés `.workbuddy-ai/memory/AAAA-MM-JJ.md`, bancs
`.workbuddy-ai/artifacts/`. Ici seulement ce qui survit.

## Application

- Monolithe `THEOLOGICUS.html` (~1,32 Mo, **59 blocs `<script>`**, **LF** —
  Edit fonctionne directement, jamais CRLF : `s.count('\r\n') == 0`) +
  **16 corpus** chargés à la volée. Dirs et volumes : `bible/`, `quran/`,
  `tafsir/`, `libs/`, `summa/` (EN 611 q.), `summafr/` (Drioux 613 q., id
  `1001` = Ia q.1), `fathers/` 118, `reformed/` 91, `orthodox/` 43,
  `islamic/` 93, `denzinger/` 128, `quranwbw/`, `quranroots/`, `biblehb/` 39
  (+`strongs.js`), `biblegr/` 27 (+`strongs.js`), `latin/` (`mots.js`).
  Loaders `__ensure{Bible,Quran,Tafsir,Summa,SummaFr,BibleHb,StrongsHb,
  BibleGr,StrongsGr,Latin}`. **`summafr/` n'est PAS dans `THEO_CORPORA`.**
- **`THEO_CORPORA` pilote tout** : `{dir,pfx,idx,wrk,nms,label,tab,root,web}`.
  Précédence des corpus chrétiens : **fathers → reformed → orthodox → islamic →
  denzinger**. Un titre dans deux corpus renvoie le premier.
- Capacitor 8, `com.theologicus.app`, webDir `mobile/www`, minSdk 24 →
  targetSdk 36, AGP 8.13.0, Gradle 8.14.3. Clés API en
  `localStorage['__serverKeys']` (shim v34), **jamais embarquées**.
- `.js` d'`assets/` déflatés à 0,19 dans l'APK (51,86 → 9,74 Mo) : mesurer avant
  de tailler. Caches HTTP `tools/.<nom>_cache/` gitignored.
- Licences : WLC (hb), MorphGNT/SBLGNT (`biblegr/` **CC BY-SA 3.0**), Whitaker's
  Words (latin, MIT — **`Parser(frequency='X')` : le défaut `'C'` supprime
  « suus », « sacramentum », « omnino »**), Strong's OS **GPL 3.0**, OSHB
  **CC BY 4.0**, Quranic Arabic Corpus **GPL sans modification**, Denzinger 1911
  (domaine public).

## Échelle z-index — une seule échelle, nommée

Valeurs dans `:root`, **ordonnées**. Détail, pièges (1 à 9) et suites de
régression : skill **`theologicus-zindex-guard`** — le consulter, ne pas
reconstruire de mémoire.

```
--z-content:1  --z-sticky-sub:10  --z-subnav:99  --z-sticky:100
--z-panel:199  --z-fab:200  --z-sidebar:999  --z-overlay:1000
--z-modal-lg:2000  --z-modal:3000  --z-popup:5000
--z-panneau:9000   <- panneaux de verset (Bible, Coran, Tafsir, mini)
--z-carte:9800     <- carte laterale : translitteration #v37-tip
--z-mot:9900       <- fiches de mot : LA PLUS HAUTE des trois
--z-toast:10000
--z-bulle:100000   <- bulle d'annotation ; --z-au-dessus:100002
```

**Ordre imposé : `--z-panneau` < `--z-carte` < `--z-mot`.** L'invariant testé par
`_v97/exhaustif.js` est « **toute fiche domine tout panneau** ». Insérer un rang
au mauvais endroit le casse. **Un fallback `var(--x,N)` faux ne se déclenche
jamais tant que la variable existe** — le tenir à jour quand même.

- **CINQ panneaux, pas trois** : les 3 verse-tip en **inline JS**
  (`style.cssText`) + `#verse-mini-tip` et `#v37-tip` en feuille. Un grep des
  feuilles n'en voit que deux : c'est l'erreur qui produit un correctif partiel.
- Les 4 fiches et les panneaux sont enfants de premier niveau de `body` → leurs
  z-index se comparent *directement*. `tip.contains(fiche)` est **toujours faux**.
- **Un enfant DOM ne peint jamais au-dessus de son parent par z-index.**
- **Aucun `transform`/`filter`/`opacity < 1` sur un ancêtre** (contexte
  d'empilement). Le duel se conclut par `elementFromPoint`, jamais par des nombres.
- **À z-index égal, l'ORDRE DU DOM tranche** (`#v37-tip` = 93,
  `#bible-verse-tip` = 122).
- **Un contenu non modal ne doit pas porter de littéral numérique.**

## Mot à mot dans les infobulles — le mot vit DANS le panneau

**C'est la racine de cinq défauts** (v93, v96, v100, v101–v104). Détail : skill
`theologicus-zindex-guard`.

- Ligne de mots cliquables `.hb`/`.gr`/`.lat` dans `#hb-slot` **à l'intérieur**
  de `#bible-verse-tip` ; `.qw` dans `#quran-verse-tip`. `#hb-slot` n'est rempli
  que pour les livres 1..39 (le NT est grec). Le panneau passe alors
  `pointer-events:auto`. **Tafsir n'a légitimement aucun mot.**
- **Ne jamais fermer un panneau sur le seul `relatedTarget`** : le panneau est
  **au-dessus** du lien, donc le seul `mouseout` est celui DU LIEN et
  `relatedTarget` vaut le fond de page. **Armer + annuler**, et juger sur la
  **position réelle du pointeur**.
- **Un placement qui ne connaît que sa cible est aveugle** : il doit connaître
  les **obstacles**. Quatre candidats HORS panneau d'abord, plafonner les
  **deux** dimensions, plancher **150×120 px**, **restauration** si une bande
  ne convient pas.
- **Un garde-fou conditionné à une détection parfaite s'efface sur les cas
  limites** — **le fallback doit avoir son propre critère.**
- `window.__placerFiche(fiche, mot)` : **réutiliser, jamais replacer à la main.**
- Tester un mot de **1 px** : un mot large ne teste rien.

## v105 — infobulles déplaçables (`#v105-cartes-deplacables`)

9 cibles, poignée ⠿, ✕ de remise en place, clé `v105-pos-<nom>`, interrupteur
« ◈ DÉPLACER LES INFOBULLES » dans `#v6-more-menu`. `#v37-tip` porte une poignée
**toujours visible** (`.v105-toujours`). **`window.__v105Ancre(el,nom)` doit être
consulté aux CINQ sites de placement** (bible ×2, quran, tafsir, `v37`), sinon
`showTip`/`place()` écrasent la position choisie par l'utilisateur.

Cinq règles durables :

1. **`setPointerCapture()` est REFUSÉ en silence** sur un hôte en
   `pointer-events:none` — et les quatre panneaux le sont (c'est ce qui protège
   le survol du mot à mot). Toujours doubler d'écouteurs **document**.
2. **Les panneaux réécrivent `innerHTML`** → toute poignée ajoutée est détruite
   à chaque ouverture. **Aucun cache « déjà fait » ne tient** : re-vérifier à
   chaque balayage.
3. **Un minuteur qui ferme une bulle doit être annulé pendant un drag**
   (`dataset.v105Retenu`) **et rejugé à l'échéance**, pas seulement à l'armement
   — **le verdict d'un minuteur est périmé quand il expire.**
4. **Un bouton ENFANT d'une zone glissable est avalé par elle** : le
   `pointerdown` du parent doit renvoyer tôt (`e.target.closest('.v105-x')`).
5. **La fermeture se juge sur la POSITION RÉELLE du pointeur**, jamais sur
   `relatedTarget` : `#v105c-pointeur` met à jour un point en phase de capture
   et interroge `elementFromPoint` sur une boîte gonflée de 48 px (gouttière
   mesurée : 33 px — c'est elle qui tuait la bulle en route vers sa poignée).

Détail des pièges mesurés : journal `2026-09-23.md` et skill
`theologicus-zindex-guard`.

## TTS — la voix ne doit jamais venir d'une autre langue (v106)

Chaine : `cleanMd` → `prosodyPreprocess` → `splitByLanguage` →
`splitMixedSegments` → `chunkText(180)` → `makeUtterance` → file
`speakNextSegment` (avance sur `onend`). Mode `readLangMode` (`'fr'` par
defaut = français forcé, sauf écritures non-latines).

- **`getVoiceForLang(lang)` doit rendre `null`, jamais la voix française,
  quand `lang` n'est pas le français.** Il tombait dans les paliers fr-FR
  quand aucune voix n'existait (`hebreu`, `grec`) : `makeUtterance` testant
  `if (v)`, **le repli phonétique `transliterateForSpeech()` n'était jamais
  atteint** et tout `_HE_PHON`/`_HE_VOWEL`/`_EL_PHON` était du code mort.
  Garde `if (prefix !== 'fr') return null;` + second verrou
  `!_langMatches(v, prefix)` dans `makeUtterance`. Résultat : `יְהוֹשֻׁעַ` →
  « yehochoua », `λόγος` → « logos ».
- **Le deux-points d'une référence n'est pas une fin de phrase.**
  `Exode 24:12` était scindé en `"Exode 24:"` + `"12"` → deux respirations au
  milieu de la référence. Protéger `(\d)\s*:\s*(\d)` par un marqueur avant le
  split, le restaurer après. Un `:` ailleurs sépare toujours.
- **Latin : pas dans `SCRIPT_RANGES`, donc lu en français. C'est voulu** (même
  alphabet, convention légitime). **Aucun TTS ne couvre le latin** — ni
  ElevenLabs ni Supertonic. Question close, ne pas rouvrir.
- Aucune voix hébreu/grec/latin sur la machine ; `ar-SA` (Microsoft Naayf) est
  la seule voix non-latine utile. `_langMatches` gère l'alias `iw` de Windows.
- **Tester les étages un par un ne prouve rien** : `normalizeArabicSpeech`,
  `chunkText`, `makeUtterance` étaient tous corrects isolément ; c'est la
  **file réelle** qui révélait le défaut. Instrumenter `speechSynthesis.speak`
  (sonde `_tts/sonde_speak.js`) pour voir ce qui part vraiment au moteur.
- En headless, les utterances échouent en `not-allowed` (pas de périphérique
  audio) : **c'est normal et ça n'invalide pas la sonde** — le journal
  `SPEAK`/`ONERROR` reste probant.

## Build / signature — CLÉ CRITIQUE

```
C://Users//toshr//.workbuddy-ai//keys//theologicus-release.jks   alias: theologicus
…\+ .PASSWORD.txt et .base64.txt ← CI
```
RSA 4096. **Ne jamais remplacer** : plus aucune mise à jour publiable.
SHA-256 `93d8324058f1ecd1d252d97b976854ffaf2a976605b9658983d17db6d70f5e67`,
vérifiable par `apksigner verify --print-certs`.

Le reste (les 6 étapes, `metadata.bin`, `prepare_mobile.py`, `COPY_DIRS`,
PyInstaller, `signtool`, l'installeur Inno, l'auto-update, le WebView Android)
est dans le skill **`theologicus-apk-build`** — le consulter, ne pas
reconstruire la procédure de mémoire.

Deux règles qui survivent à tout :
- **Tout dossier de corpus ajouté doit être dans les TROIS listes** (`COPY_DIRS`
  de `prepare_mobile.py`, le job `windows`, `build_installer.bat`). Une liste
  oubliée ne casse pas le build : elle donne des 404 à l'usage.
- `tools/check_syntax.js` **avant toute compilation** (incident v66). Il ne
  valide pas un script isolé.

## Dépôt / CI

- `jelliel/THEOLOGICUS`, `main`. **Commits en anglais**, `git commit -F`
  (jamais `printf` : « 100% » invalide). Pas de `gh` CLI. `GIT_TERMINAL_PROMPT=0`.
  Jamais committer : `android/local.properties`, `android/release.keystore`,
  `mobile/www/*`, `theologicus_keys.json`.
- Version = `git rev-list --count HEAD` (2.0.N). **Ne pas annoncer un numéro
  avant de l'avoir lu dans l'API.**
- **Le workflow filtre sur `paths:`** — un push ne touchant aucun chemin listé
  ne déclenche **RIEN**. Surveillés : `THEOLOGICUS.html`, `bible/**`,
  `quran/**`, `tafsir/**`, `libs/**`, `android/**`, `tools/**`, `app.py`,
  `installer.iss`, `build_installer.bat`, `THEOLOGICUS.ico`, `VERSION`,
  `package*.json`, `capacitor.config.json`, le workflow lui-même.
- **Après un push, prouver qu'un run CI existe** : interroger
  `api.github.com/repos/jelliel/THEOLOGICUS/actions/runs` et comparer
  `head_sha`. Le sandbox bloque le téléchargement des assets de Release :
  vérifier par l'API Actions, pas en récupérant le binaire.
- `git fetch` n'écrit pas de refs de suivi : `git ls-remote` pour l'état
  distant. Vérifier une publication par `curl -sL` de
  `raw.githubusercontent.com` + `cmp`.
- **NE JAMAIS lancer `git stash` ici** — un `git stash` interrompu (SIGTERM) a
  détruit `.git/refs` et le `.pack` (2026-09-22), et git répond alors « not a
  git repository ». Récupération détaillée : journal `2026-09-22.md` (et le
  distant est la sauvegarde : tout ce qui a été poussé est récupérable).
- **SECRETS À LA RACINE** : `THEOLOGICUS_signing.pfx`, `signing_key.pem`,
  `signing_cert.pem`, « mistral api key.txt ». Motifs dans `.gitignore` :
  `*.pfx` `*.p12` `*.jks` `*.keystore` `*.pem` `*.key` + `*api key*.txt`
  `*secret*` `*credential*` `*.apk` `*.aab`. **Contrôle obligatoire** :
  `git ls-files | git check-ignore --stdin` doit rendre **vide**.
- **Règle générale : ce qui doit rester hors du dépôt s'écrit dans
  `.gitignore`, cela ne se retient pas.** Vérifier par `git check-ignore` et
  `git add -An`.
- Disque C: plein (99 %). Profils Chrome des bancs CDP dans `%TEMP%\theo-*` —
  nettoyer après campagne. Les `.apk` d'`artifacts/` (~428 Mo) sont des résidus
  locaux et **l'utilisateur a décidé qu'on ne supprime rien**.

## Bancs headless (CDP) — règles durables

Les pièges détaillés (nom de fichier servi, `#theo-maj-bandeau`,
`.welcome-banner`, `display` instrumenté, `setTimeout` journalisé,
`elementFromPoint` vs trace d'événement, comptes de conditions, `NODE_PATH`…)
sont dans le skill **`theologicus-zindex-guard`**, section « Pièges du banc
lui-même ». Ci-dessous seulement ce qui se réapprend mal :

- **Contre-épreuve obligatoire** : le MÊME banc sur la baseline
  (`git show HEAD:THEOLOGICUS.html`) et sur la cible. Vert des deux côtés ne
  prouve **rien** ; le delta est la preuve. Script : `_v103/check_baseline.js`.
- **Le banc doit suivre le GESTE RÉEL.** v105 : il déplaçait la souris ailleurs
  **avant** de saisir la poignée, puis exigeait qu'elle y soit encore — un
  geste que personne ne fait, et il accusait l'app. Et **ne pas exiger le delta
  brut quand l'app borne à l'écran** : le bornage est un service.
- **Un banc trop confortable ne prouve rien** (v102 : vert à 984 px, cassé sous
  300 px). Un banc qui n'ouvre aucun panneau mesure le vide.
- **Tester les étages en isolement ne prouve rien** : v106, chaque étage du TTS
  était correct un par un, et le défaut vivait dans la file. Instrumenter le
  point d'entrée réel (`speechSynthesis.speak`) plutôt que la fonction interne.
- **Un `sleep` ne remplace pas une condition** : sinon tout `z-index` calculé
  vaut `auto` et les mots ne sont pas chargés.
- **Un backtick dans un commentaire à l'intérieur d'un gabarit JS casse le
  fichier** — piégé **cinq fois**. Le message (`missing ) after argument list`)
  ne désigne jamais la bonne ligne.
- Écrire les fichiers de travail **dans le projet**, jamais dans `/tmp`
  (`node --check /tmp/x.js` → `C://tmp//x.js` introuvable).

## Fragilités du code

Toutes vérifiées sur pièce — ne pas les redécouvrir.

- Bloc « SECURITY PROTECTION » (v66) : l'IIFE englobe
  `init(Bible|Quran|Tafsir)VerseTooltip`. Recompter les accolades avant retouche.
- **Une accolade fermante en trop dans un `<style>` fait ABANDONNER au parseur
  tout ce qui suit** : la règle est dans `textContent` mais absente de
  `document.styleSheets` → feuille tronquée. Compter les accolades **hors
  commentaires** (`re.sub(r'/\*.*?\*/','',s,flags=re.S)`).
- **DEUX feuilles de schéma** : le `<style>` principal **et** une copie dans
  `exportCss()`. Toute retouche doit être faite des deux côtés.
- **Lettres hébraïques précomposées** (U+FB1D–FB4F) : un filtre `0x05D0–0x05EA`
  les supprime silencieusement. Normaliser en NFD avant filtrage.
- Détection de rôle par `nodeType === 3` : `box.textContent` colle « Abraham »
  + « patriarche ». Descendre dans les nœuds texte individuels.
- Texte arabe : les signes d'annotation ne sont **PAS** des mots
  (U+06D6–U+06ED) — les filtrer avant de découper.
- `range` sur une frontière de nœud texte insère un `<span data-hl-id>` **vide**
  (v95) → sauter toute tranche vide, et ne pas annoncer « cliquez le passage
  surligné » avant qu'un span **non vide** existe (un toast ne doit jamais mentir).
- `sanitizeSchemaHtml()` et ALLOW : `TBODY`, `THEAD`, `A`, `SUP`, `SUB` refusés
  → un `<table>` perdait TOUTES ses lignes.
- `colorizeSchemaRefs()` filtrait sur `indexOf(':')` : un schéma en virgule
  française sortait immédiatement. Filtrer sur `indexOf('<')`.
- Ne pas dépendre d'une portée locale pour fermer un panneau :
  `closeArchivesPanel()` (const locale) → `ReferenceError` avalé par `catch(e){}`.
- `<br/>` du modèle visible : stocker en `@@BR@@` après normalisation CRLF.
- `find('=')` sur une tranche JS : le premier `=` est celui de
  `(window.__x=window.__x||{})[N]=`. Ancrer sur `find(']=')` puis `+2`.
- Un nœud texte n'a pas `.closest()` : `node.parentNode.closest()`.
- `m.ts === s.msgTs` : un id DOM donne la **CHAÎNE**, `m.ts` est un NOMBRE.
- Références FR : « Gn 5,1 » (virgule) autant que « Gn 5:1 ».
- Mesure nulle ≠ « ça tient » : une puce rendue avant stabilisation mesure 0.
- `extractSuggestionsHtml()` (v81) capturait tout le reste d'un message.
- `_m/` → racine = trois `dirname`. Regex : ne pas doubler les backslashes
  dans un littéral `/…/`.
- `AndroidManifest.xml` n'a pas `android:largeHeap`.
- `.schema-kids` n'avait pas `flex-wrap` (contrairement à `.schema-row`) : les
  libellés se comprimaient et `overflow-wrap:anywhere` hérité les tranchait en
  deux (v103). `flex-shrink:0` sur les groupes, `overflow-wrap:normal` sur
  `.schema-box`.
- Seuil désaccordé laissé tel quel : le CSS replie dès **901 px**, le JS
  n'ouvre au démarrage qu'à partir de **1024 px**. Bénin.

## Décisions produit arrêtées

- Gestes : appui long → bulle « Add to chat » ; double-tap → encadrement ;
  tap sur passage annoté → son commentaire (400 ms).
- Verrou : aucune pénalité au changement de fenêtre (chrono en pause),
  difficulté montante plafonnée à 3, question ratée qui revient, « souvenir
  de moi » 7 jours.
- Références : lien local d'abord, web en secours.
- Le panneau ☷ RÉFÉRENCES n'a AUCUNE citation de verset : 35 documents,
  0 citation. Les nombres entre parenthèses sont des **dates de publication**
  ((1964), (251), (380)). Un résolveur de citations y serait du code mort.
- Traduction embarquée = « BJ 1998 » → sous droits : conditionne l'export et
  le comparateur de traductions.
- LibreTranslate : voir `artifacts/LIBRETRANSLATE.md`. L'**IP du PC change
  (DHCP)** → relancer `tools/start_libretranslate.py`. WiFi `192.168.100.71`,
  Tailscale `100.74.55.70`.
