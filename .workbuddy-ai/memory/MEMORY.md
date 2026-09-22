# THEOLOGICUS — notes long terme

Détail : skills `theologicus-apk-build`, `theologicus-zindex-guard`,
`.workbuddy-ai/artifacts/`, journaux datés. Ici seulement ce qui survit.

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
  `__ensureStrongsHb` / `__ensureBibleGr` / `__ensureStrongsGr` / `__ensureLatin`
  / `theoCorpusWork`. Somme en FR par défaut, repli EN. `summafr/` n'est PAS
  dans `THEO_CORPORA` : modal et résolveur propres.
- **`THEO_CORPORA` pilote tout** : `{dir, pfx, idx, wrk, nms, label, tab, root,
  web}`. Une entrée suffit (onglets, `theoParseRef`, modal, `parseLibraryRef`).
  Résolution : **fathers → reformed → orthodox → islamic → denzinger**. Un titre
  présent dans deux corpus renvoie le premier : précédence, pas un bug.
- **Vider le dossier de sortie avant chaque génération**, sinon des fichiers
  d'une génération précédente partent avec du contenu **faux** (piégé : 165
  versés pour 131 produits).
- **Les `.js` de `assets/` sont déflatés à 0,19 dans l'APK** (51,86 → 9,74 Mo).
  Ne jamais tailler un corpus sans l'avoir mesuré.
- Licences : WLC (hb, vocalisé), MorphGNT/SBLGNT (gr — `biblegr/` publié
  **CC BY-SA 3.0**), Whitaker's Words (latin, MIT, `Parser(frequency='X')` — le
  défaut `'C'` supprime « suus », « sacramentum », « omnino »), Strong's
  Open Scriptures **GPL 3.0**, OSHB **CC BY 4.0**, Quranic Arabic Corpus
  **GPL sans modification**, Denzinger 1911 (domaine public).
- Génération : `tools/build_*.py` + `versification.js`. Caches HTTP
  `tools/.<nom>_cache/` gitignored → relance hors réseau.
- Capacitor 8, `com.theologicus.app`, webDir `mobile/www`, minSdk 24 →
  targetSdk 36, AGP 8.13.0, Gradle 8.14.3. Clés API jamais embarquées
  (`localStorage['__serverKeys']`, shim v34).
- v2.0 : références bibliques résolues **en local** au tap. Tables
  `bible/versification.js` + `quran/versification.js` **générées** —
  régénérer après tout changement du corpus.

## Échelle z-index — une seule échelle, nommée

Valeurs dans `:root`, **ordonnées**. Toute zone gelée en dur hors échelle finit
par piéger un élément qu'on croit au-dessus et qui peint dessous (v96 : fiche à
6000 sous un panneau à 99999). Garde-fou : skill `theologicus-zindex-guard`.

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
  `#tafsir-verse-tip` (z-index **inline via JS**, `style.cssText`) **et**
  `#verse-mini-tip` (l. ~1092), `#v37-tip` — ces deux derniers le déclarent dans
  une **feuille de style**. **Un grep des feuilles n'en voit que deux : c'est
  exactement l'erreur qui produit un correctif partiel.**
- **Les quatre fiches** (`#hb-tip`, `#gr-tip`, `#lat-tip`, `#qw-tip`) et les
  panneaux sont des enfants de premier niveau de `document.body` : leurs z-index
  se comparent *directement*. C'est ce qui autorise `--z-mot > --z-panneau`.
- **Un enfant DOM ne peint jamais au-dessus de son parent par z-index.**
- **Aucun `transform`/`filter`/`opacity < 1` sur un ancêtre** : chacun crée un
  contexte d'empilement qui annule le z-index. D'où un duel conclu par
  `elementFromPoint`, jamais par comparaison de nombres.
- **Un contenu non modal ne doit pas porter de littéral numérique** : un littéral
  ne se compare à rien, il se fait oublier. C'est le contrôle déterministe du
  garde-fou (le mode statique bavard à 15 faux positifs a été remplacé).

## Mot à mot dans les infobulles de verset

- Ligne de mots cliquables sous le verset : `.hb` (hébreu, Tahoma), `.gr`,
  `.lat` dans `#hb-slot` **à l'intérieur** de `#bible-verse-tip` ; `.qw` (arabe)
  dans `#quran-verse-tip`. Le panneau passe alors en `pointer-events:auto`.
  **Tafsir n'a légitimement aucun mot** — ne pas le compter comme un défaut.
- **Le mot vit DANS le panneau, pas dans le lien. Racine de trois défauts.**
  Passer du lien (`a.bible-ref`, `a.quran-ref`) au mot déclenche `mouseout` sur
  le lien avec `relatedTarget` = le mot. Le mot n'étant ni `a.bible-ref` ni
  `span.bible-ref`, un test qui ne regarde que la classe du `target` referme.
  **Règle : un conteneur ouvert au survol doit tester `relatedTarget`.**
  Corrigé Bible **v93**, Coran + Tafsir **v96**.
- `dansPanneau(n)` (Bible, Coran, Tafsir) teste `tip.contains(n)` **et**
  `n.closest('#hb-tip'|'#gr-tip'|'#lat-tip'|'#qw-tip')`. Le second terme est
  indispensable : les fiches sont des enfants de `BODY`, donc `tip.contains(f)`
  est **toujours faux**. Le banc ne mesure *aucun* `mouseout` d'un lien vers une
  fiche — la protection était **incidentelle** (le placement v94 ne recouvre
  jamais le mot). Durcissement, pas correction d'un bug actif : ne pas le
  présenter autrement.
- Le `click` de v89 fait `stopPropagation()` en capture : il protège les mots
  hb/gr du `closeTip()`. Sans lui, un clic fermerait tout.
- `window.__placerFiche(fiche, mot)` (`<script id="v94-fiche-placement">`,
  **avant** `v88`/`v89`) : dessous, dessus, droite, gauche, puis borné.
  Réutiliser ce helper, **jamais** replacer à la main.
- **v96 — `tailleFiche()` lisait `offsetHeight`, or une fiche `max-height` est
  peinte plus courte** : placement sur une boîte trop haute (483 px prédits, mot
  à y=423) → tous les candidats jugés en recouvrement → `dessus` retenu, borné
  à y=22, fiche **sur son propre mot** pendant que `data-pos` disait « dessus ».
  Repli ajouté : `hauteurPeinte()` lit la chaîne de `max-height` calculée.
- **Mesurer `data-pos` ne suffit pas** : c'est une *intention*. Comparer la boîte
  **peinte** (`getBoundingClientRect`) au mot.
- **Un balayage avec un mot large ne teste rien** : `dessous` gagne toujours
  (l'`ECART` de 6 px annule le recouvrement). Faux mot de **1 px** pour solliciter
  les quatre candidats.

## Annotations et commentaires (Add to chat)

- **v95 — un span VIDE de 3 px tuait le clic.** Une plage commençant ou finissant
  pile sur la frontière d'un nœud texte (`startOffset === longueur du nœud`) fait
  insérer un `<span data-hl-id=X></span>` vide **avant** le vrai span, même id.
  `querySelector('[data-hl-id]')` rend le vide, donc le clic. Corrigé : on saute
  toute tranche vide, un span vide ne compte plus comme « déjà posé », et la
  branche multi-nœuds ne renvoie plus `true` inconditionnellement (elle renvoyait
  vrai même si 100 % des `surroundContents` échouaient → `applyHighlights` ne
  tentait jamais le repli `wrapOnce`).
- **Symptôme asymétrique** : une phrase produit plusieurs spans larges, le vide
  se noie ; un mot n'a qu'un vrai span, le vide est collé à côté. Ne pas conclure
  « le mot marche, la phrase non » : le défaut touche les deux.
- **Un toast ne doit jamais mentir** : le succès de `runCommentLLM` vérifie qu'un
  span non vide existe avant d'annoncer « cliquez le passage surligné ».
- Le module **v86** écrit `window._atcSel` et fait `stopPropagation()` en
  résolvant un mot. Il cohabite avec `#chat-container` ; ce n'est **pas** la
  cause du v95 (test de causalité l'a écarté) — ne pas repartir sur cette piste.

## Bancs de test headless (CDP) — pièges vérifiés

- **Contre-épreuve obligatoire** : lancer le MÊME banc sur la baseline
  (`git show HEAD:THEOLOGICUS.html` + tranches dans `_v96/avant/`) et sur
  `mobile/www`. Un banc vert des deux côtés ne prouve **rien** ; le delta est la
  preuve. `THEO_WWW` choisit la racine, les corpus doivent être copiés à côté.
- **Servir le nom réellement présent sur disque** : servir `/THEOLOGICUS.html`
  quand le fichier s'appelle `index.html` rend un 404 de 3 octets — aucun JS ne
  tourne et tous les modules semblent absents.
- **Attendre l'enregistrement des modules différés** (`attendre()` sur condition),
  pas un `sleep` fixe : sinon tout `z-index` calculé vaut `auto`.
- **Ne jamais FABRIQUER un panneau** dans un banc : un `<div>` nu sans la feuille
  du module fait mesurer le banc lui-même.
- `#setup-wizard-overlay.active` (`position:fixed`) **et** `#auth-overlay`
  recouvrent tout au premier lancement : la souris n'atteint jamais le contenu.
  `remove()` avant de mesurer ; `display:none` seul ne suffit pas pour
  `#auth-overlay`, il se réinstalle.
- `let state` (~l. 8115) est au niveau d'un `<script>` : **pas** `window.state`.
  Le nom nu marche.
- La délégation écoute sur `#chat-container` : un `.message` injecté dans
  `document.body` ne reçoit rien. L'injecter **dans** le conteneur.
- **Un backtick dans un commentaire à l'intérieur d'un gabarit JS casse le
  fichier** (`missing ) after argument list`) — piégé trois fois.
- Viser le **centre exact** du `getBoundingClientRect()`. Un clic décalé mesure
  autre chose.
- **Le panneau coranique se referme au `mouseout`** : ne bouger la souris que
  vers des éléments **situés dedans**, sinon la mesure suivante tombe sur un
  panneau 0×0.
- `elementFromPoint` ne départage pas deux éléments **qui ne se chevauchent
  pas** : forcer le recouvrement avant de demander qui gagne.
- **`node -e` mange les regex** passées par le shell (`/z-index:/s*(/d{4,})/`) :
  écrire le script dans un `.js`. Idem pour les backticks/`${}` en heredoc.

## Signature release — FICHIER CRITIQUE

```
C:\Users\toshr\.workbuddy-ai\keys\theologicus-release.jks   alias: theologicus
C:\Users\toshr\.workbuddy-ai\keys\theologicus-release.PASSWORD.txt
C:\Users\toshr\.workbuddy-ai\keys\theologicus-release.jks.base64.txt  ← CI
```
RSA 4096. **Ne jamais remplacer ce JKS** : plus aucune mise à jour publiable.
SHA-256 `93d8324058f1ecd1d252d97b976854ffaf2a976605b9658983d17db6d70f5e67`.
Vérifier par `apksigner verify --print-certs`, **jamais** par `META-INF/*.RSA`
(AGP signe en v2/v3 : fausse alerte connue).

## Build Android / Windows

Chaîne hors dépôt : `C:\Users\toshr\.workbuddy-ai\binaries\android-tools\`
(`jdk21`, `android-sdk`). Procédure → skill `theologicus-apk-build`.

- `./gradlew` échoue sur `~/.gradle/.../metadata.bin (Access is denied)` :
  relancer avec `dangerouslyDisableSandbox`.
- **`APK_VERSION_NAME` obligatoire**, sinon `build.gradle` l. 48 retombe sur
  `1.0.<code>` et l'APK s'annonce autrement que le HTML.
- **Ne pas lancer `prepare_mobile.py`** en local : son `rmtree(mobile/www)` est
  bloqué. Contourner en régénérant `mobile/www/index.html` seul puis
  `shutil.copytree(..., dirs_exist_ok=True)` par corpus. Jamais `npx cap sync`.
- **Tout dossier ajouté doit être dans `COPY_DIRS`** sinon la CI livre une app
  sans corpus (piégé avec `summa`, `fathers`, `reformed`).
- **PyInstaller : pas de `--clean`** (garde-fou sur `build/THEOLOGICUS`,
  591 fichiers). Supprimer à la main puis relancer sans `--clean`.
- **ORDRE CRITIQUE : purger `dist\THEOLOGICUS` AVANT PyInstaller, jamais après.**
  PyInstaller écrit son exe dans `dist\THEOLOGICUS\` ; le supprimer ensuite
  détruit le binaire et fait échouer `signtool` (`File not found`). Note : la
  passe `COLLECT` **recrée** le dossier — purger avant, puis copier par-dessus.
- **`cmd //c fichier.bat` ne s'exécute PAS depuis Bash** (`cmd.exe` bloqué) : il
  ouvre un shell interactif et rend la main sans rien faire. Rejouer les étapes
  une par une depuis Bash.
- **`signtool` renvoie `exit=0` même en échec** et affiche `Number of errors: 1`.
  Lire la sortie, pas le code de retour. `verify /pa` échoue toujours en « root
  certificate not trusted » avec le PFX auto-signé — normal.
- **Vérifier le contenu livré, pas seulement la version.** Comparer source et
  `dist/.../THEOLOGICUS.html` après avoir neutralisé des DEUX côtés **le
  placeholder `__THEO_VERSION__` et la valeur tamponnée** — neutraliser un seul
  côté laisse un faux écart d'une dizaine d'octets.
- **L'installeur se teste en l'installant pour de vrai** :
  `THEOLOGICUS-Setup-x64.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART
  /DIR=... /LOG=...`. Un `grep` sur `dist/` ne prouve pas ce qu'Inno a déposé.
  Banc : `_v96/installe.js` (10/10, pointe sur `_inst_test`).
- **`THEOLOGICUS.exe` ne peut pas être lancé depuis le sandbox** : le processus
  meurt aussitôt et le port renvoie un 502 du proxy du sandbox, pas de l'app.
  Servir le dossier **installé** avec un serveur statique Node + Chrome headless.
- `tools/check_syntax.js` valide les blocs `<script>` inline (57 blocs, 5
  ignorés). **À lancer avant toute compilation** — un bloc cassé rend l'app
  muette (incident v66).

## Dépôt / CI

- Deux jobs : `build` (APK) et `windows` (exe PyInstaller + zip portable +
  installeur Inno). **Ajouter un corpus = mettre à jour TROIS listes** :
  `COPY_DIRS` de `prepare_mobile.py`, la liste du job `windows` dans
  `.github/workflows/build-apk.yml`, et `build_installer.bat`. Une liste oubliée
  ne casse pas le build : elle donne des 404 à l'usage.
- **Le `dist/` local est un vestige : il ne se régénère pas tout seul.** Le
  purger avant tout rebuild, sinon on mesure l'ancien contenu. Vécu : installeur
  de 6 jours ne portant que `bible quran tafsir libs`, sans `biblehb` — et un
  `dist/` portant encore `#verse-mini-tip{z-index:130000}` après le v97.
- Version affichée = `git rev-list --count HEAD` (2.0.N). Le fichier `VERSION`
  racine est **périmé (1.0.10)** : `stamp_version.py` avertit s'il s'en sert.
- `jelliel/THEOLOGICUS`, `main`. **Commits en anglais.** Jamais committer :
  `android/local.properties`, `android/release.keystore`, `mobile/www/*`,
  `theologicus_keys.json`. Pas de `gh` CLI. Toujours `GIT_TERMINAL_PROMPT=0`.
  Dépôt public → API GitHub sans auth.
- **`git fetch` n'écrit pas de refs de suivi** ici : `git ls-remote` pour l'état
  distant. Vérifier une publication par `curl -sL` de
  `raw.githubusercontent.com` + `cmp`.
- **Le workflow filtre sur `paths:` — un push qui ne touche aucun chemin listé
  ne déclenche RIEN.** Vécu : un commit ne portant que `.workbuddy-ai/` n'a
  produit ni run CI ni Release ; de l'extérieur, cela ressemble à « le push n'est
  pas arrivé ». Chemins surveillés : `THEOLOGICUS.html`, `bible/**`, `quran/**`,
  `tafsir/**`, `libs/**`, `android/**`, `tools/**`, `app.py`, `installer.iss`,
  `build_installer.bat`, `THEOLOGICUS.ico`, `VERSION`, `package*.json`,
  `capacitor.config.json`, le workflow lui-même.
- **Après un push, prouver qu'un run CI existe**, pas seulement que le commit est
  arrivé : `git ls-remote` ne dit rien du déclenchement. Interroger
  `repos/.../actions/runs?per_page=1` et comparer `head_sha`.
- **Toute modification du workflow doit être revalidée en YAML avant commit** —
  une faute de syntaxe casse tous les builds suivants en silence.
- Le tag de Release (`apk-v2.0.N`) vient de `git rev-list --count HEAD`, donc le
  numéro saute quand on ajoute des commits : ne pas annoncer un numéro avant de
  l'avoir lu dans l'API.
- **Le sandbox bloque le téléchargement des assets de Release** (`curl` sur
  `releases/download/...` rend un fichier vide) : vérifier la CI par l'API
  Actions (jobs + étapes), pas en récupérant le binaire.
- **Messages de commit : jamais `printf`** (un `%` — « 100% » — est un format
  invalide). Écrire dans un fichier puis `git commit -F`.

## Fragilités du code

- Bloc « SECURITY PROTECTION » (v66) : l'IIFE englobe
  `init(Bible|Quran|Tafsir)VerseTooltip`. Recompter les accolades avant retouche.
- `#references-btn` et `#memory-toggle` partageaient le **même emplacement fixe** :
  masquer l'un révèle l'autre.
- **CRLF** : tout grep multi-ligne avec `\n` renvoie 0 alors que le code est là.
  L'outil Edit échoue pareil → patcher via un script Python écrivant `\r\n`.
- **`find('=')` sur une tranche JS** : le premier `=` est celui de
  `(window.__x=window.__x||{})[N]=`. Ancrer sur `find(']=')` puis `+2`.
- **Lettres hébraïques précomposées** (U+FB1D–FB4F) : un filtre `0x05D0–0x05EA`
  les supprime silencieusement. Normaliser en NFD avant filtrage. L'ordre des
  diacritiques n'est pas garanti entre les sources.
- **`_m/` → racine = trois `dirname`**, pas deux ni quatre.
- **Regex : ne pas doubler les backslashes** dans un littéral `/…/` hors gabarit.
  Et pour tester une tranche, préférer `String(x).indexOf(...)` à un littéral
  regex contenant `--`.
- **Mesurer une couverture en PONDÉRANT par les occurrences** : sur de l'OCR,
  52 % des formes mais 79 % des mots lus.
- **Mesure nulle ≠ « ça tient »** : une puce rendue avant stabilisation mesure 0.
- **`extractSuggestionsHtml()` (v81)** capturait tout le reste d'un message quand
  « suite » apparaissait en fin de bloc. Une extraction doit avoir un filet : si
  rien ne sort, ne rien retirer.
- **Références FR** : « Gn 5,1 » (virgule) autant que « Gn 5:1 ».
- **Ne pas dépendre d'une portée locale** pour fermer un panneau :
  `closeArchivesPanel()` était une const locale à `bindEvents()` → `ReferenceError`
  avalé par `try{}catch(e){}`, panneau resté ouvert.
- **`sanitizeSchemaHtml()` et ALLOW** : `TBODY`, `THEAD`, `A`, `SUP`, `SUB`
  refusés → un `<table>` perdait TOUTES ses lignes.
- **`colorizeSchemaRefs()` filtrait sur `indexOf(':')`** : un schéma en virgule
  française sortait immédiatement. Filtrer sur `indexOf('<')`.
- **`<br/>` du modèle visible** : échappé en `&lt;` par `mdToHtml`. Stocker en
  `@@BR@@` après la normalisation CRLF, restaurer à la fin.
- **Détection de rôle par `nodeType === 3`** : `box.textContent` colle
  « Abraham » + « patriarche ». Descendre dans les nœuds texte individuels.
- **Texte arabe : les signes d'annotation ne sont PAS des mots**
  (U+06D6–U+06ED). Les filtrer avant de découper (100 % d'alignement sur
  311 versets contre l'API quran.com, contre 31,8 % de désalignement avant).
- **Un nœud texte n'a pas `.closest()`** : passer par `node.parentNode.closest()`.
- **`range` sur une frontière de nœud texte = span vide** → section v95.
- **`m.ts === s.msgTs`** : un id DOM donne la CHAÎNE, `m.ts` est un NOMBRE.
- **`AndroidManifest.xml` n'a pas `android:largeHeap`** : tout gros objet natif
  tue l'app.

## Décisions produit arrêtées

- Gestes : **appui long** → bulle « Add to chat » ; **double-tap** → encadrement ;
  tap sur passage annoté → son commentaire (400 ms).
- Verrou : aucune pénalité au changement de fenêtre (chrono en pause), difficulté
  montante plafonnée à 3, question ratée qui revient, « souvenir de moi » 7 jours.
- Références : lien **local d'abord**, web en secours.
- **Le panneau ☷ RÉFÉRENCES n'a AUCUNE citation de verset** : 35 documents, 0
  citation. Les nombres entre parenthèses sont des **dates de publication**
  ((1964), (251), (380)) et les titres sont des intitulés latins (Lumen Gentium,
  Dei Verbum…). Un résolveur de citations y serait du code mort — vérifié, puis
  refusé.
- Traduction embarquée = « BJ 1998 » → **sous droits** : conditionne l'export et
  le comparateur de traductions.
- LibreTranslate : voir `artifacts/LIBRETRANSLATE.md`. L'**IP du PC change
  (DHCP)** → relancer `tools/start_libretranslate.py` et prendre l'adresse
  marquée ✅. Dernier relevé : WiFi `192.168.100.71`, Tailscale `100.74.55.70`.
