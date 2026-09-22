# THEOLOGICUS — notes long terme

Détail narratif : skills `theologicus-apk-build`, `theologicus-zindex-guard`,
journaux datés `.workbuddy-ai/memory/AAAA-MM-JJ.md`, bancs
`.workbuddy-ai/artifacts/`. Ici seulement ce qui survit.

## Application

- Monolithe `THEOLOGICUS.html` (~1,35 Mo) + tranches JS à la volée : `bible/`
  (66 + `versification.js`), `quran/` (114), `tafsir/` (114), `libs/`,
  `summa/` (611 q., 17 Mo, EN), `summafr/` (613 q., 20,2 Mo, Drioux,
  id `1001` = Ia q.1), `fathers/` (118, 36 Mo), `reformed/` (91, 27,8 Mo),
  `orthodox/` (43), `islamic/` (93), `denzinger/` (128), `quranwbw/`,
  `quranroots/`, `biblehb/` (39 + `strongs.js`, 12 Mo), `biblegr/` (27 +
  `strongs.js`, 6,4 Mo), `latin/` (`mots.js`).
- Loaders : `__ensureBibleBook` / `__ensureQuranSurah` / `__ensureTafsirSurah` /
  `__ensureSummaQuestion` / `__ensureSummaFrQuestion` / `__ensureBibleHb` /
  `__ensureStrongsHb` / `__ensureBibleGr` / `__ensureStrongsGr` /
  `__ensureLatin` / `theoCorpusWork`. Somme en FR par défaut, repli EN.
  `summafr/` n'est PAS dans `THEO_CORPORA` : modal et résolveur propres.
- **`THEO_CORPORA` pilote tout** : `{dir, pfx, idx, wrk, nms, label, tab, root,
  web}`. Une entrée suffit (onglets, `theoParseRef`, modal, `parseLibraryRef`).
  Résolution : **fathers → reformed → orthodox → islamic → denzinger**.
  Un titre dans deux corpus renvoie le premier : précédence, pas un bug.
- **Vider le dossier de sortie avant chaque génération**, sinon des fichiers
  d'une génération précédente partent avec du contenu **faux**.
- **Les `.js` de `assets/` sont déflatés à 0,19 dans l'APK** (51,86 → 9,74 Mo).
  Ne jamais tailler un corpus sans l'avoir mesuré.
- Licences : WLC (hb), MorphGNT/SBLGNT (gr — `biblegr/` **CC BY-SA 3.0**),
  Whitaker's Words (latin, MIT, `Parser(frequency='X')` — le défaut `'C'`
  supprime « suus », « sacramentum », « omnino »), Strong's Open Scriptures
  **GPL 3.0**, OSHB **CC BY 4.0**, Quranic Arabic Corpus **GPL sans
  modification**, Denzinger 1911 (domaine public).
- Génération : `tools/build_*.py` + `versification.js`. Caches HTTP
  `tools/.<nom>_cache/` gitignored → relance hors réseau.
- Capacitor 8, `com.theologicus.app`, webDir `mobile/www`, minSdk 24 →
  targetSdk 36, AGP 8.13.0, Gradle 8.14.3. Clés API jamais embarquées
  (`localStorage['__serverKeys']`, shim v34).
- v2.0 : références bibliques résolues **en local** au tap. Tables
  `bible/versification.js` + `quran/versification.js` **générées** — régénérer
  après tout changement du corpus.

## Échelle z-index — une seule échelle, nommée

Valeurs dans `:root`, **ordonnées**. Toute zone gelée en dur hors échelle finit
par piéger un élément qu'on croit au-dessus et qui peint dessous.
Garde-fou : skill `theologicus-zindex-guard`.

```
--z-content:1  --z-sticky-sub:10  --z-subnav:99  --z-sticky:100
--z-panel:199  --z-fab:200  --z-sidebar:999  --z-overlay:1000
--z-modal-lg:2000  --z-modal:3000  --z-popup:5000
--z-panneau:9000      ← panneaux de verset (Bible, Coran, Tafsir, mini, v37)
--z-mot:9500          ← fiches de mot : au-dessus du contenu expliqué
--z-toast:10000
--z-bulle:100000      ← bulle d'annotation ; --z-au-dessus:100002 (bannières)
```

- **CINQ panneaux de verset, pas trois** : `#bible-verse-tip`, `#quran-verse-tip`,
  `#tafsir-verse-tip` (z-index **inline via JS**) **et** `#verse-mini-tip`,
  `#v37-tip` (déclarés dans une **feuille de style**). **Un grep des feuilles
  n'en voit que deux : c'est l'erreur qui produit un correctif partiel.**
- **Les quatre fiches** (`#hb-tip`, `#gr-tip`, `#lat-tip`, `#qw-tip`) et les
  panneaux sont enfants de premier niveau de `document.body` : leurs z-index se
  comparent *directement* — c'est ce qui autorise `--z-mot > --z-panneau`.
- **Un enfant DOM ne peint jamais au-dessus de son parent par z-index.**
- **Aucun `transform`/`filter`/`opacity < 1` sur un ancêtre** : chacun crée un
  contexte d'empilement qui annule le z-index. D'où un duel conclu par
  `elementFromPoint`, jamais par comparaison de nombres.
- **Un contenu non modal ne doit pas porter de littéral numérique** : un littéral
  ne se compare à rien, il se fait oublier. Contrôle déterministe du garde-fou.

## Mot à mot dans les infobulles — le mot vit DANS le panneau

**C'est la racine de cinq défauts.** Le survol, le placement et la fermeture en
découlent tous.

- Ligne de mots cliquables sous le verset : `.hb` (hébreu, Tahoma), `.gr`,
  `.lat` dans `#hb-slot` **à l'intérieur** de `#bible-verse-tip` ; `.qw` (arabe)
  dans `#quran-verse-tip`. Le panneau passe alors en `pointer-events:auto`.
  **Tafsir n'a légitimement aucun mot** — ne pas le compter comme un défaut.
- **v93/v96 — tester `relatedTarget`, pas la classe du `target`.** Le mot n'a ni
  la classe du lien ni celle d'un `span.bible-ref`.
- **v100 — `relatedTarget` NE SUFFIT PAS.** Mesuré : en descendant du lien vers
  la ligne de mots, **UN SEUL `mouseout`**, `relatedTarget` = le fond de page. Le
  panneau est posé **au-dessus** du lien : rejoindre un mot oblige à sortir par
  un bord où le panneau n'est pas encore. **Juger sur `relatedTarget`, c'est
  juger un chemin que le curseur n'a pas fini de parcourir.** Correctif :
  **armer** la fermeture au `mouseout` (160 ms), l'**annuler** sur tout
  `mouseover` visant le panneau, un mot ou une fiche. Bible / Coran / Tafsir.
- **v101 — LE PLACEMENT NE REGARDAIT QUE LE MOT.** `__placerFiche` minimisait
  `aireRecouvrement(boite, mot)` et rien d'autre. Le mot étant *dans* le panneau,
  les quatre candidats y entrent tous : mesuré dessous 84 000 px², dessus
  47 850, droite 84 000, gauche 76 055 — « dessus » gagnait en cachant 33 % du
  panneau. **Correctif** : les panneaux deviennent des **obstacles explicites**
  (score séparé mot/panneau, le mot prime) ; **quatre candidats HORS panneau
  essayés d'abord** (`hors-droite|gauche|haut|bas`, retenus seulement s'ils
  tiennent à l'écran sans bornage) ; **à défaut, plafonner la hauteur de la fiche
  à la plus grande bande libre** (jamais sous 140 px) — `overflow-y:auto` fait le
  reste. Résultat : **0 % du panneau caché** à 984×765, 784×705, 500×665 et
  584×605 (fiche ramenée de 280 à 274 px).
- `dansPanneau(n)` teste `tip.contains(n)` **et** `n.closest('#hb-tip'|…)` : les
  fiches sont enfants de `BODY`, donc `tip.contains(f)` est **toujours faux**.
  Durcissement, pas correction d'un bug actif — ne pas le présenter autrement.
- Le `click` de v89 fait `stopPropagation()` en capture : protège les mots hb/gr.
- **v96 — `tailleFiche()` lisait `offsetHeight`, or une fiche `max-height` est
  peinte plus courte** : fiche posée sur son propre mot pendant que `data-pos`
  disait « dessus ». Repli : `hauteurPeinte()` lit la chaîne de `max-height`.
- `window.__placerFiche(fiche, mot)` : **réutiliser ce helper, jamais replacer à
  la main.**
- **Un balayage avec un mot large ne teste rien** (`dessous` gagne toujours,
  l'`ECART` de 6 px annule le recouvrement) : faux mot de **1 px**.
- **Une erreur de syntaxe dans un `<script>` tue TOUT le bloc en silence.** Vécu
  v101 : un `/* … */` inline dans mon propre commentaire fermait celui-ci
  prématurément → `__placerFiche` jamais publié → toutes les fiches à
  `left:0; top:0`. `check_syntax.js` ne l'a pas vu : **extraire et tester le bloc
  isolément** (`awk` entre balises, `node --check`) avant de conclure.

## Annotations et commentaires (Add to chat)

- **v95 — un span VIDE de 3 px tuait le clic.** Une plage commençant ou finissant
  pile sur la frontière d'un nœud texte (`startOffset === longueur du nœud`) fait
  insérer un `<span data-hl-id=X></span>` vide **avant** le vrai span, même id.
  `querySelector('[data-hl-id]')` rend le vide, donc le clic. Corrigé : sauter
  toute tranche vide, un span vide ne compte plus comme « déjà posé », et la
  branche multi-nœuds ne renvoie plus `true` inconditionnellement.
- **Symptôme asymétrique** : une phrase produit plusieurs spans larges, le vide
  se noie ; un mot n'a qu'un vrai span, le vide est collé à côté. Ne pas conclure
  « le mot marche, la phrase non » : le défaut touche les deux.
- **Un toast ne doit jamais mentir** : vérifier qu'un span non vide existe avant
  d'annoncer « cliquez le passage surligné ».
- Le module **v86** (`window._atcSel`) cohabite avec `#chat-container` ; ce n'est
  **pas** la cause du v95 (causalité testée) — ne pas repartir sur cette piste.

## Bancs de test headless (CDP) — pièges vérifiés

- **Contre-épreuve obligatoire** : lancer le MÊME banc sur la baseline
  (`git show HEAD:THEOLOGICUS.html` + tranches dans `_v96/avant/`) et sur
  `mobile/www`. Un banc vert des deux côtés ne prouve **rien** ; le delta est la
  preuve. `THEO_WWW` choisit la racine, corpus copiés à côté.
- **Servir le nom réellement présent sur disque** : `/THEOLOGICUS.html` quand le
  fichier s'appelle `index.html` rend un 404 de 3 octets.
- **Attendre une CONDITION, pas un `sleep`** : sinon tout `z-index` calculé vaut
  `auto`. Idem pour les mots de mot à mot (chargement **asynchrone**).
- **Ne jamais FABRIQUER un panneau** dans un banc : un `<div>` nu sans la feuille
  du module fait mesurer le banc lui-même.
- `#setup-wizard-overlay.active` **et** `#auth-overlay` recouvrent tout au premier
  lancement. `remove()` ; `display:none` ne suffit pas pour `#auth-overlay`.
- La délégation écoute sur `#chat-container` : injecter le `.message` **dedans**.
- `let state` (~l. 8115) est au niveau d'un `<script>` : **pas** `window.state`.
- **Un backtick dans un commentaire à l'intérieur d'un gabarit JS casse le
  fichier** — piégé trois fois.
- Viser le **centre exact** du `getBoundingClientRect()`.
- `elementFromPoint` ne départage pas deux éléments **qui ne se chevauchent
  pas** : forcer le recouvrement d'abord.
- **`offsetParent !== null` est FAUX pour tout `position:fixed`** — les quatre
  fiches le sont. Juger sur la boîte **peinte** + `display`/`visibility`. Et
  **mesurer pendant que la souris est SUR la cible**, pas après l'avoir quittée.
- Instrumenter `style.display` par `Object.defineProperty` sur l'**instance**
  casse `getComputedStyle` et ne se désinstalle pas : `delete`.
- **`node -e` mange les regex** et heredoc mange backticks/`${}` : écrire un `.js`.

## Build Android / Windows — CLÉ CRITIQUE

```
C:\Users\toshr\.workbuddy-ai\keys\theologicus-release.jks   alias: theologicus
C:\Users\toshr\.workbuddy-ai\keys\theologicus-release.PASSWORD.txt (+ .base64.txt ← CI)
```
RSA 4096. **Ne jamais remplacer ce JKS** : plus aucune mise à jour publiable.
SHA-256 `93d8324058f1ecd1d252d97b976854ffaf2a976605b9658983d17db6d70f5e67`.
Vérifier par `apksigner verify --print-certs`, **jamais** `META-INF/*.RSA`.

Chaîne hors dépôt : `C:\Users\toshr\.workbuddy-ai\binaries\android-tools\`.
Procédure complète → skill `theologicus-apk-build`.

- `./gradlew` échoue sur `metadata.bin (Access is denied)` : relancer avec
  `dangerouslyDisableSandbox`.
- **`APK_VERSION_NAME` obligatoire**, sinon repli sur `1.0.<code>`.
- **Ne pas lancer `prepare_mobile.py`** en local : son `rmtree(mobile/www)` est
  bloqué. Régénérer `mobile/www/index.html` puis `copytree(dirs_exist_ok=True)`
  par corpus. Jamais `npx cap sync`.
- **Tout dossier ajouté doit être dans `COPY_DIRS`**, sinon la CI livre une app
  sans corpus (piégé avec `summa`, `fathers`, `reformed`).
- **PyInstaller : pas de `--clean`.** **Purger `dist\THEOLOGICUS` AVANT.** Le
  supprimer après détruit le binaire et fait échouer `signtool`. `COLLECT`
  **recrée** le dossier — purger avant, copier par-dessus ensuite.
- **`cmd //c fichier.bat` ne s'exécute PAS depuis Bash** : rejouer étape par étape.
- **`signtool` renvoie `exit=0` même en échec** (`Number of errors: 1`). Lire la
  sortie. `verify /pa` échoue toujours en « root not trusted » — normal.
- **Vérifier le contenu livré, pas seulement la version** : neutraliser des DEUX
  côtés **le placeholder `__THEO_VERSION__` et la valeur tamponnée**.
- **L'installeur se teste en l'installant pour de vrai** (`/VERYSILENT`…). Banc
  `_v96/installe.js` (10/10). **`THEOLOGICUS.exe` ne se lance pas depuis le
  sandbox** : servir le dossier **installé** + Chrome headless.
- `tools/check_syntax.js` (57 blocs, 5 ignorés) **avant toute compilation**
  (incident v66). Limite : ne valide pas un script isolé (voir v101).

## Dépôt / CI

- Deux jobs : `build` (APK) et `windows` (exe + zip + installeur Inno).
  **Ajouter un corpus = TROIS listes** : `COPY_DIRS` de `prepare_mobile.py`, la
  liste du job `windows`, `build_installer.bat`. Une liste oubliée ne casse pas
  le build : elle donne des 404 à l'usage.
- **Le `dist/` local est un vestige : il ne se régénère pas tout seul.** Le purger
  avant tout rebuild.
- Version = `git rev-list --count HEAD` (2.0.N). `VERSION` racine remis à jour.
- `jelliel/THEOLOGICUS`, `main`. **Commits en anglais.** Jamais committer :
  `android/local.properties`, `android/release.keystore`, `mobile/www/*`,
  `theologicus_keys.json`. Pas de `gh` CLI. `GIT_TERMINAL_PROMPT=0`.
- **`git fetch` n'écrit pas de refs de suivi** : `git ls-remote` pour l'état
  distant. Vérifier une publication par `curl -sL` de `raw.githubusercontent.com`
  + `cmp`.
- **Le workflow filtre sur `paths:`** — un push ne touchant aucun chemin listé ne
  déclenche **RIEN** (vécu : commit `.workbuddy-ai/` seul → ni run ni Release ; de
  l'extérieur cela ressemble à « le push n'est pas arrivé »). Chemins surveillés :
  `THEOLOGICUS.html`, `bible/**`, `quran/**`, `tafsir/**`, `libs/**`, `android/**`,
  `tools/**`, `app.py`, `installer.iss`, `build_installer.bat`, `THEOLOGICUS.ico`,
  `VERSION`, `package*.json`, `capacitor.config.json`, le workflow lui-même.
- **Après un push, prouver qu'un run CI existe** : interroger
  `api.github.com/repos/jelliel/THEOLOGICUS/actions/runs` et comparer `head_sha`.
- **Toute modification du workflow doit être revalidée en YAML avant commit.**
- Le tag `apk-v2.0.N` vient de `git rev-list --count HEAD` : ne pas annoncer un
  numéro avant de l'avoir lu dans l'API.
- **Le sandbox bloque le téléchargement des assets de Release** : vérifier par
  l'API Actions, pas en récupérant le binaire.
- **Commits : jamais `printf`** (« 100% » = format invalide). `git commit -F`.
- **Disque C: plein (99 %, ~2,9 Go libres).** Les profils Chrome des bancs CDP
  s'accumulent dans `%TEMP%\theo-*` et ont déjà provoqué un `ENOSPC` bloquant Bash
  **et** PowerShell. Nettoyer après une campagne de bancs — vérifié v101 : la
  campagne laissait **724 Mo** de profils, leur suppression ne rend pas de place
  visible à `df` tant que Windows n'a pas purgé la corbeille, mais c'est bien du
  volume à récupérer.
- **Les `.apk` de `artifacts/` ne sont PAS suivis par git.** `git ls-files
  .workbuddy-ai/artifacts/` rend 25 fichiers (`.md` + `.js`). Les 23 APK
  (≈ 600 Mo, plus anciens = 15/09) sont des **résidus locaux reconstructibles**
  depuis les Releases GitHub : ~600 Mo récupérables sur accord.
  **Correction** : une version antérieure de cette note affirmait le contraire ;
  elle venait d'un `git add -A` échoué en silence (disque plein).

## Rebuild local de l'installeur Windows — l'ordre exact

`cmd //c build_installer.bat` **ne s'exécute pas depuis Bash** (`cmd.exe` est
bloqué par le sandbox). Rejouer chaque étape à la main, **dans cet ordre** :

1. `py -3.12 -m PyInstaller` — **pas de `--clean`** ; supprimer
   `build/THEOLOGICUS` à la main avant.
2. `cp -r` les 16 corpus dans `dist/THEOLOGICUS/` — **par-dessus, sans jamais
   supprimer le dossier** : `COLLECT` vient d'y écrire l'exe. Purger *avant*
   PyInstaller, jamais après (piégé : l'exe détruit, `signtool` échoue sur un
   `File not found` annoncé `exit=0`).
3. `theologicus_keys.json` remis à `{"mistral": ""}`.
4. `tools/stamp_version.py dist/THEOLOGICUS <version>` — **la version en
   argument**, jamais celle du fichier `VERSION` racine.
5. `signtool sign` sur l'exe, puis sur l'installeur.
6. `ISCC installer.iss /DMyAppVersion=<version>` → ~70 s de compression.
7. Copier `dist/THEOLOGICUS-Setup-x64.exe` + `dist/THEOLOGICUS/THEOLOGICUS.exe`
   dans `output/`.

**Vérifier le contenu livré, pas la version** : neutraliser des DEUX côtés le
placeholder `__THEO_VERSION__` **et** la valeur tamponnée, puis comparer.
**Tester l'installeur en l'installant pour de vrai**
(`/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /DIR=… /LOG=…`) et servir le dossier
**installé** — `THEOLOGICUS.exe` ne se lance pas depuis le sandbox.

Chaîne en place (vérifié 22/09) : `py -3.12` (3.12 disponible), **PyInstaller
6.22.3**, `ISCC` dans `%LOCALAPPDATA%\Programs\Inno Setup 6\`, `signtool` dans
`Program Files (x86)\Windows Kits\10\bin\10.0.26100.0\x64\`, PFX
`THEOLOGICUS_signing.pfx` à la racine. `output/` et `dist/` sont **gitignorés**.
Volume : `dist/` ≈ 275 Mo (dont 226 Mo de `THEOLOGICUS/`) + `output/` ≈ 170 Mo.

## Fragilités du code

- Bloc « SECURITY PROTECTION » (v66) : l'IIFE englobe
  `init(Bible|Quran|Tafsir)VerseTooltip`. Recompter les accolades avant retouche.
- **CRLF** : tout grep multi-ligne avec `\n` renvoie 0 alors que le code est là.
  L'outil Edit échoue pareil → patcher via un script Python écrivant `\r\n`.
- **`find('=')` sur une tranche JS** : le premier `=` est celui de
  `(window.__x=window.__x||{})[N]=`. Ancrer sur `find(']=')` puis `+2`.
- **Lettres hébraïques précomposées** (U+FB1D–FB4F) : un filtre `0x05D0–0x05EA`
  les supprime silencieusement. Normaliser en NFD avant filtrage.
- **`_m/` → racine = trois `dirname`.**
- **Regex : ne pas doubler les backslashes** dans un littéral `/…/`.
- **Mesure nulle ≠ « ça tient »** : une puce rendue avant stabilisation mesure 0.
- **`extractSuggestionsHtml()` (v81)** capturait tout le reste d'un message. Une
  extraction doit avoir un filet : si rien ne sort, ne rien retirer.
- **Références FR** : « Gn 5,1 » (virgule) autant que « Gn 5:1 ».
- **Ne pas dépendre d'une portée locale** pour fermer un panneau :
  `closeArchivesPanel()` (const locale) → `ReferenceError` avalé par `catch(e){}`.
- **`sanitizeSchemaHtml()` et ALLOW** : `TBODY`, `THEAD`, `A`, `SUP`, `SUB`
  refusés → un `<table>` perdait TOUTES ses lignes.
- **`colorizeSchemaRefs()` filtrait sur `indexOf(':')`** : un schéma en virgule
  française sortait immédiatement. Filtrer sur `indexOf('<')`.
- **`<br/>` du modèle visible** : stocker en `@@BR@@` après normalisation CRLF.
- **Détection de rôle par `nodeType === 3`** : `box.textContent` colle
  « Abraham » + « patriarche ». Descendre dans les nœuds texte individuels.
- **Texte arabe : les signes d'annotation ne sont PAS des mots**
  (U+06D6–U+06ED). Les filtrer avant de découper.
- **Un nœud texte n'a pas `.closest()`** : `node.parentNode.closest()`.
- **`range` sur une frontière de nœud texte = span vide** → section v95.
- **`m.ts === s.msgTs`** : un id DOM donne la CHAÎNE, `m.ts` est un NOMBRE.
- **`AndroidManifest.xml` n'a pas `android:largeHeap`.**

## Décisions produit arrêtées

- Gestes : **appui long** → bulle « Add to chat » ; **double-tap** → encadrement ;
  tap sur passage annoté → son commentaire (400 ms).
- Verrou : aucune pénalité au changement de fenêtre (chrono en pause), difficulté
  montante plafonnée à 3, question ratée qui revient, « souvenir de moi » 7 jours.
- Références : lien **local d'abord**, web en secours.
- **Le panneau ☷ RÉFÉRENCES n'a AUCUNE citation de verset** : 35 documents, 0
  citation. Les nombres entre parenthèses sont des **dates de publication**
  ((1964), (251), (380)). Un résolveur de citations y serait du code mort —
  vérifié, puis refusé.
- Traduction embarquée = « BJ 1998 » → **sous droits** : conditionne l'export et
  le comparateur de traductions.
- LibreTranslate : voir `artifacts/LIBRETRANSLATE.md`. L'**IP du PC change
  (DHCP)** → relancer `tools/start_libretranslate.py`. Dernier relevé : WiFi
  `192.168.100.71`, Tailscale `100.74.55.70`.
