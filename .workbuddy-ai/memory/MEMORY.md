# THEOLOGICUS — notes long terme

Détail narratif : skills `theologicus-apk-build`, `theologicus-zindex-guard`,
journaux datés `.workbuddy-ai/memory/AAAA-MM-JJ.md`, bancs
`.workbuddy-ai/artifacts/`. Ici seulement ce qui survit.

## Application

- Monolithe `THEOLOGICUS.html` (~1,35 Mo, **LF** — Edit fonctionne directement,
  jamais CRLF : `s.count('\r\n') == 0`) + tranches JS à la volée : 16 corpus
  (`bible/`, `quran/`, `tafsir/`, `libs/`, `summa/` EN 611 q., `summafr/` Drioux
  613 q. id `1001` = Ia q.1, `fathers/` 118, `reformed/` 91, `orthodox/` 43,
  `islamic/` 93, `denzinger/` 128, `quranwbw/`, `quranroots/`, `biblehb/` 39 +
  `strongs.js`, `biblegr/` 27 + `strongs.js`, `latin/` `mots.js`).
  Loaders `__ensure{Bible,Quran,Tafsir,Summa,SummaFr,BibleHb,StrongsHb,
  BibleGr,StrongsGr,Latin}`. `summafr/` n'est PAS dans `THEO_CORPORA`.
- **`THEO_CORPORA` pilote tout** : `{dir,pfx,idx,wrk,nms,label,tab,root,web}`.
  Précédence des corpus chrétiens : **fathers → reformed → orthodox → islamic →
  denzinger**. Un titre dans deux corpus renvoie le premier.
- `.js` d'`assets/` déflatés à 0,19 dans l'APK (51,86 → 9,74 Mo) : mesurer
  avant de tailler. Caches HTTP `tools/.<nom>_cache/` gitignored.
- Capacitor 8, `com.theologicus.app`, webDir `mobile/www`, minSdk 24 →
  targetSdk 36, AGP 8.13.0, Gradle 8.14.3. Clés API en `localStorage['__serverKeys']`
  (shim v34), **jamais embarquées**.
- Licences : WLC (hb), MorphGNT/SBLGNT (`biblegr/` **CC BY-SA 3.0**),
  Whitaker's Words (latin MIT, **`Parser(frequency='X')` — le défaut `'C'`
  supprime « suus », « sacramentum », « omnino »**), Strong's OS **GPL 3.0**,
  OSHB **CC BY 4.0**, Quranic Arabic Corpus **GPL sans modification**,
  Denzinger 1911 (domaine public).

## Échelle z-index — une seule échelle, nommée

Valeurs dans `:root`, **ordonnées**. Garde-fou : skill
`theologicus-zindex-guard`.

```
--z-content:1  --z-sticky-sub:10  --z-subnav:99  --z-sticky:100
--z-panel:199  --z-fab:200  --z-sidebar:999  --z-overlay:1000
--z-modal-lg:2000  --z-modal:3000  --z-popup:5000
--z-panneau:9000   ← panneaux de verset (Bible, Coran, Tafsir, mini, v37)
--z-mot:9500       ← fiches de mot : au-dessus du contenu expliqué
--z-toast:10000
--z-bulle:100000   ← bulle d'annotation ; --z-au-dessus:100002
```

- **CINQ panneaux, pas trois** : `#bible-verse-tip`, `#quran-verse-tip`,
  `#tafsir-verse-tip` en **inline JS** (`style.cssText`) **et** `#verse-mini-tip`,
  `#v37-tip` en **feuille de style**. Un grep des feuilles n'en voit que deux :
  c'est l'erreur qui produit un correctif partiel.
- Les quatre fiches (`#hb-tip`, `#gr-tip`, `#lat-tip`, `#qw-tip`) **et** les
  panneaux sont enfants de premier niveau de `document.body` : leurs z-index se
  comparent *directement*. `tip.contains(fiche)` est **toujours faux** ;
  `dansPanneau()` doit aussi tester `n.closest('#hb-tip'|…)`.
- **Un enfant DOM ne peint jamais au-dessus de son parent par z-index.**
- **Aucun `transform`/`filter`/`opacity < 1` sur un ancêtre** : chacun crée un
  contexte d'empilement qui annule le z-index. Le duel se conclut par
  `elementFromPoint`, **jamais** par comparaison de nombres.
- **Un contenu non modal ne doit pas porter de littéral numérique** : un
  littéral ne se compare à rien, il se fait oublier. Contrôle déterministe du
  garde-fou.

## Mot à mot dans les infobulles — le mot vit DANS le panneau

**C'est la racine de cinq défauts.** Survol, placement, fermeture en découlent.

- Ligne de mots cliquables : `.hb` (Tahoma), `.gr`, `.lat` dans `#hb-slot`
  **à l'intérieur** de `#bible-verse-tip` ; `.qw` dans `#quran-verse-tip`.
  `#hb-slot` n'est rempli que pour les livres 1..39 (le NT est grec).
  Le panneau passe alors `pointer-events:auto`. **Tafsir n'a légitimement
  aucun mot.**
- **v93/v96 — tester `relatedTarget`, pas la classe du `target`.** Le mot n'a
  ni la classe du lien ni celle d'un `span.bible-ref`.
- **v100 — `relatedTarget` NE SUFFIT PAS.** Mesuré : un seul `mouseout` en
  descendant du lien vers le panneau (le panneau est **au-dessus** du lien),
  `relatedTarget` = fond de page. Correctif : **armer** la fermeture (160 ms)
  au `mouseout`, l'**annuler** sur tout `mouseover` panneau/mot/fiche.
- **v101 — LE PLACEMENT NE REGARDAIT QUE LE MOT.** Panneaux = obstacles
  explicites, score séparé mot/panneau, mot prime ; **quatre candidats HORS
  panneau** essayés d'abord, retenus seulement s'ils tiennent à l'écran **sans
  bornage**.
- **v102 — LE REPLI NE PLAFONNAIT QUE LA HAUTEUR.** Fiches `max-width:300px` :
  la largeur est aussi un plafond. Bandes 784×705 → 378 px, 584×605 → 178,
  500×665 → **94** — plus étroites que la fiche → candidats extérieurs rejetés,
  retour aux internes : 52 % et 45 % du panneau cachés. **Le banc validé à
  ≥ 280 px ne prouve rien sur une fenêtre plus étroite.** Correctif : plafonner
  les **deux** dimensions, contraintes seulement par ce que la bande limite,
  bandes **de la plus grande à la plus petite**, plancher **150×120 px**,
  **restauration** si une bande ne convient pas.
- **v104 — LE REPLI ETAIT CONDITIONNE A `hote`.** Le repli v101/v102 (plafonner
  la fiche pour la sortir du panneau) ne se declenchait que si un mot etait
  *strictement contenu* dans un panneau. Un mot au ras du bord (padding,
  debordement de ligne) rend `hote === null` : la reduction etait **sautee** et
  la fiche restait **DESSUS** le panneau. Ce n'etait **pas** un defaut
  d'empilement (9500 > 9000, `elementFromPoint` donnait bien la fiche).
  Correctif : declencher des `candidate.surPanneau`, et prendre comme reference
  `hote` **ou** le premier panneau que la fiche recouvre (`aireRecouvrement > 0`).
  **Regle : un garde-fou conditionne a une detection parfaite est un garde-fou
  qui s'efface sur les cas limites — le fallback doit avoir son propre critere.**
- **v96 — `tailleFiche()` lisait `offsetHeight`** ; une fiche `max-height` est
  peinte plus courte. Repli : `hauteurPeinte()` lit la chaîne `max-height`.
- `window.__placerFiche(fiche, mot)` : **réutiliser, jamais replacer à la main.**
- Un balayage avec un mot large ne teste rien (`dessous` gagne, `ECART` 6 px
  annule le recouvrement) : faux mot de **1 px**.
- **Une erreur de syntaxe dans un `<script>` tue TOUT le bloc en silence.**
  Vécu v101 : un `/* … */` inline fermait le commentaire → `__placerFiche`
  jamais publié → fiches à `left:0; top:0`. `check_syntax.js` ne l'a pas vu :
  **extraire et tester le bloc isolément** (`awk` entre balises, `node --check`)
  avant de conclure.

## Schémas parchemin (```schema)

- **v103 — LES LIBELLES ETAIENT TRANCHES EN DEUX.** `.schema-row` a
  `flex-wrap:wrap` mais **`.schema-tree .schema-kids` NON**. Sans repli, les
  enfants se **compriment** (`flex-shrink:1`) sous la largeur du mot le plus
  long, et **`overflow-wrap:anywhere` hérité** de `.message-content` tranche
  sans trait d'union. Mesuré en 380 px : Musaylima 97→90, Al-Mukhtar 101→90,
  (Guerrier) 92→90. Correctif : `flex-wrap`+`row-gap` sur `.schema-kids`,
  `flex-shrink:0` sur les groupes, `overflow-wrap/word-break:normal` sur
  `.schema-box`. **3 → 0 coupé.**
- **Il existe DEUX feuilles de schéma** : `<style>` principale (~l. 1482) **et**
  une copie dans `exportCss()` (~l. 15545). Toute retouche **DOIT** être faite
  des deux côtés, sinon l'export reste cassé.

## Rail latéral / burger (trois traits en haut à gauche)

- **v103 — LE BURGER NE FAISAIT RIEN SUR WINDOWS.** Une **accolade fermante en
  trop** dans `<style id="v6-ui-css">` fermait `@media (max-width:640px)`
  avant l'heure → **erreur de syntaxe CSS** → le parseur **abandonne tout ce
  qui suit** : `@media (min-width:901px)` (seul porteur du repli
  `margin-left:-268px`) n'était **jamais enregistré**. Le burger basculait
  bien `sidebar-open`, rien n'écoutait. Correctif : remettre `#v6-more-menu`
  **dans** son `@media`.
- Diagnostic décisif : `textContent` contient la règle mais
  `document.styleSheets` ne la contient pas → feuille tronquée. Contrôle
  mécanique : compter les accolades **hors commentaires**
  (`re.sub(r'/\*.*?\*/','',s,flags=re.S)`).
- Seuil désaccordé, laissé tel quel : CSS replie dès **901 px**, JS n'ouvre
  au démarrage qu'à partir de **1024 px** → entre les deux le rail démarre
  replié. Bénin.

## Annotations et commentaires (Add to chat)

- **v95 — un span VIDE de 3 px tuait le clic.** Une plage sur la frontière
  d'un nœud texte insérait un `<span data-hl-id=X></span>` vide **avant** le
  vrai span. `querySelector('[data-hl-id]')` rendait le vide. Corrigé :
  sauter toute tranche vide.
- Symptôme asymétrique : un mot n'a qu'un vrai span, le vide est collé à
  côté. Ne pas conclure « le mot marche, la phrase non » — le défaut touche
  les deux. Un toast ne doit jamais mentir : vérifier qu'un span non vide
  existe avant d'annoncer « cliquez le passage surligné ».
- v86 (`window._atcSel`) cohabite avec `#chat-container` ; ce n'est **pas** la
  cause du v95 (causalité testée).

## Build Android / Windows — CLÉ CRITIQUE

```
C:\Users\toshr\.workbuddy-ai\keys\theologicus-release.jks   alias: theologicus
…\+ .PASSWORD.txt et .base64.txt ← CI
```
RSA 4096. **Ne jamais remplacer** : plus aucune mise à jour publiable.
SHA-256 `93d8324058f1ecd1d252d97b976854ffaf2a976605b9658983d17db6d70f5e67`.
Vérifier par `apksigner verify --print-certs`. Procédure complète → skill
`theologicus-apk-build`.

- `./gradlew` échoue sur `metadata.bin (Access is denied)` : relancer avec
  `dangerouslyDisableSandbox`.
- `APK_VERSION_NAME` obligatoire, sinon repli sur `1.0.<code>`.
- **Ne pas lancer `prepare_mobile.py`** en local : son `rmtree(mobile/www)` est
  bloqué. Régénérer `mobile/www/index.html` puis `copytree(dirs_exist_ok=True)`
  par corpus. Jamais `npx cap sync`.
- Tout dossier ajouté doit être dans `COPY_DIRS`, sinon la CI livre une app
  sans corpus (piégé `summa`, `fathers`, `reformed`).
- **PyInstaller : pas de `--clean`.** Purger `dist\THEOLOGICUS` **AVANT**.
  `COLLECT` recrée le dossier — purger avant, copier par-dessus ensuite.
- `cmd //c fichier.bat` ne s'exécute pas depuis Bash : rejouer étape par étape.
- `signtool` rend `exit=0` même en échec : lire la sortie. `verify /pa` échoue
  en « root not trusted » — normal.
- Vérifier le **contenu** livré, pas seulement la version : neutraliser des
  deux côtés le placeholder `__THEO_VERSION__` et la valeur tamponnée.
- L'installeur se teste en l'installant pour de vrai. `THEOLOGICUS.exe` ne se
  lance pas depuis le sandbox : servir le dossier **installé** + Chrome
  headless.
- `tools/check_syntax.js` (57 blocs, 5 ignorés) **avant toute compilation**
  (incident v66). Ne valide pas un script isolé.

### Rebuild local de l'installeur Windows — l'ordre exact

`cmd //c build_installer.bat` ne s'exécute pas depuis Bash. Rejouer à la main :

1. `py -3.12 -m PyInstaller` — **pas de `--clean`** ; supprimer
   `build/THEOLOGICUS` et `dist/THEOLOGICUS` **avant**.
2. `cp -r` les 16 corpus dans `dist/THEOLOGICUS/` — **par-dessus, sans
   supprimer** (l'exe vient d'y être écrit). Purger *avant* PyInstaller,
   jamais après (sinon exe détruit, `signtool` échoue sur `File not found`
   annoncé `exit=0`).
3. `theologicus_keys.json` = `{"mistral": ""}` ; `libs/fonts` (24 fichiers).
4. `py -3.12 tools/stamp_version.py dist/THEOLOGICUS <version>` — version
   en argument, jamais celle du `VERSION` racine.
5. `signtool sign /f THEOLOGICUS_signing.pfx /p theologicus2026 /fd SHA256
   /td SHA256 /tr http://timestamp.digicert.com` sur l'exe **puis** sur
   l'installeur (l'installeur invalide la signature de l'exe si on l'oublie :
   resigner les deux à la fin).
6. `ISCC installer.iss /DMyAppVersion=<version>` → ~75 s.
7. Copier installeur + `dist/THEOLOGICUS/THEOLOGICUS.exe` dans `output/`.

**Si la source change après compilation, tout recommencer à partir de
l'étape 2** (l'exe PyInstaller est une coquille, le HTML est une donnée).

## Dépôt / CI

- Deux jobs : `build` (APK) et `windows` (exe + zip + installeur Inno).
  **Ajouter un corpus = TROIS listes** : `COPY_DIRS` de `prepare_mobile.py`,
  la liste du job `windows`, `build_installer.bat`. Une liste oubliée ne casse
  pas le build : elle donne des 404 à l'usage.
- `dist/` local = vestige, ne se régénère pas tout seul.
- Version = `git rev-list --count HEAD` (2.0.N). `VERSION` racine remis à
  jour. **Ne pas annoncer un numéro avant de l'avoir lu dans l'API.**
- `jelliel/THEOLOGICUS`, `main`. **Commits en anglais.** Jamais committer :
  `android/local.properties`, `android/release.keystore`, `mobile/www/*`,
  `theologicus_keys.json`. Pas de `gh` CLI. `GIT_TERMINAL_PROMPT=0`.
- **`git fetch` n'écrit pas de refs de suivi** : `git ls-remote` pour l'état
  distant. Vérifier une publication par `curl -sL` de `raw.githubusercontent.com`
  + `cmp`.
- **Le workflow filtre sur `paths:`** — un push ne touchant aucun chemin listé
  ne déclenche **RIEN**. Chemins surveillés : `THEOLOGICUS.html`, `bible/**`,
  `quran/**`, `tafsir/**`, `libs/**`, `android/**`, `tools/**`, `app.py`,
  `installer.iss`, `build_installer.bat`, `THEOLOGICUS.ico`, `VERSION`,
  `package*.json`, `capacitor.config.json`, le workflow lui-même.
- **Après un push, prouver qu'un run CI existe** : interroger
  `api.github.com/repos/jelliel/THEOLOGICUS/actions/runs` et comparer
  `head_sha`.
- Le sandbox bloque le téléchargement des assets de Release : vérifier par
  l'API Actions, pas en récupérant le binaire.
- Commits : jamais `printf` (« 100% » = format invalide). `git commit -F`.
- **NE JAMAIS lancer `git stash` ici** — un `git stash` interrompu (SIGTERM)
  a détruit `.git/refs` et le `.pack` (2026-09-22). Symptôme trompeur : git
  répond « not a git repository » alors que `.git/` existe. Récupération :
  1. `ls .git/` → repérer ce qui manque.
  2. `mkdir -p .git/refs/heads .git/refs/tags .git/refs/remotes/origin`.
  3. Lire `.git/logs/refs/heads/main` → SHA exact. L'écrire dans
     `.git/refs/heads/main`.
  4. `git fetch origin main` → pack complet (57 Mo).
  5. `git fsck` ; si « failed to load pack » persistent, **déplacer** les
     `.idx` orphelins et `multi-pack-index` vers `.git/_orphelins/`.
  6. Vérifier `git rev-parse HEAD` == `git ls-remote origin main`.
  **Le distant est la sauvegarde** : tout ce qui a été poussé est récupérable.
- Disque C: plein (99 %, ~2,3–2,9 Go libres). Profils Chrome des bancs CDP
  dans `%TEMP%\theo-*` (724 Mo) — nettoyer après campagne.
- Les 23 `.apk` d'`artifacts/` (428 Mo) sont des résidus locaux. **Décision
  utilisateur : on ne supprime rien.** Ils n'étaient hors git que par accident
  de `git add`, **PAS** par une règle. `*.apk` `*.aab` ajoutés à `.gitignore`.
- **SECRETS A LA RACINE — aucun motif ne les couvrait** (vérifié 2026-09-22,
  `git check-ignore` ne nommait rien) : `THEOLOGICUS_signing.pfx` (clé de
  signature Releases, mot de passe dans le même dossier), `signing_key.pem`,
  `signing_cert.pem`, « mistral api key.txt ». Un seul `git add -A` les
  publiait. Motifs ajoutés : `*.pfx` `*.p12` `*.jks` `*.keystore` `*.pem`
  `*.key` + `*api key*.txt` `*secret*` `*credential*`. **Contrôle non-
  régression obligatoire** : `git ls-files | git check-ignore --stdin` doit
  rendre **vide**.
- **Règle générale : ce qui doit rester hors du dépôt s'écrit dans
  `.gitignore`, cela ne se retient pas.** Deux pièges le même jour (APK,
  secrets) — dans les deux cas je croyais à une règle qui n'existait pas.
  Vérifier par `git check-ignore` et `git add -An`.

## Bancs de test headless (CDP) — pièges vérifiés

- **Contre-épreuve obligatoire** : lancer le MÊME banc sur la baseline
  (`git show HEAD:THEOLOGICUS.html`) et sur la cible. Vert des deux côtés ne
  prouve **rien** ; le delta est la preuve.
- **Servir le bon nom de fichier.** La copie publiée est
  `mobile/www/index.html`. `/THEOLOGICUS.html` renvoie 404 → tous les z-index
  à `auto`, `__placerFiche` à `undefined` — ressemble à une régression
  totale. **Méthode qui marche** : `cp THEOLOGICUS.html mobile/www/index.html`
  + `cmp`, puis banc **sans** `THEO_INDEX`.
- **Avant d'accuser un correctif, refaire tourner le banc sur HEAD.** Si HEAD
  échoue aussi, c'est le banc. Script prêt : `_v103/check_baseline.js`.
- Un banc qui n'ouvre aucun panneau mesure le vide (v102 : `__placerFiche`
  sans panneau = fiche 0×0, `hote` null).
- Un banc qui descend trop peu ne prouve rien (v102 validé à 984 px, cassé
  sous 300 px).
- Ne jamais **fabriquer** un panneau : un `<div>` nu sans sa feuille fait
  mesurer le banc lui-même.
- **Attendre une CONDITION, pas un `sleep`** : sinon tout `z-index` calculé
  vaut `auto`. Idem pour les mots (chargement asynchrone).
- `#setup-wizard-overlay.active` **et** `#auth-overlay` recouvrent tout au
  premier lancement. `remove()` ; `display:none` ne suffit pas pour
  `#auth-overlay`.
- **`#theo-maj-bandeau`** (bandeau « mise a jour disponible », `z-index:99997`)
  s'affiche seul au chargement, recouvre le bas de l'ecran et **intercepte la
  souris** : un `mouseMoved` vers un mot du bas tombe sur lui et le survol ne
  declenche rien — cela ressemble a un defaut d'empilement. Le neutraliser dans
  tout banc qui vise le bas de l'ecran (`remove()` + `clearInterval`).
- `let state` (~l. 8115) est au niveau d'un `<script>` : **pas** `window.state`.
- **Un backtick dans un commentaire à l'intérieur d'un gabarit JS casse le
  fichier** — piégé **quatre fois** (v103, commentaire CSS dans `exportCss()`,
  qui est une chaîne entre backticks). `check_syntax.js` signale
  `Unexpected identifier` sur un bloc de 11 000 lignes, sans rapport visible.
  Un commentaire *dans une feuille `<style>`* peut en porter sans risque ;
  c'est le **gabarit JS** qui est mortel.
- Viser le **centre exact** du `getBoundingClientRect()`. `elementFromPoint`
  ne départage pas deux éléments qui ne se chevauchent pas.
- `offsetParent !== null` est **FAUX** pour tout `position:fixed`. Les quatre
  fiches le sont. Juger sur la boîte **peinte** + `display`/`visibility`.
  **Mesurer pendant que la souris est SUR la cible.**
- Instrumenter `style.display` par `Object.defineProperty` sur l'**instance**
  casse `getComputedStyle` et ne se désinstalle pas : `delete`.
- `node -e` mange les regex et heredoc mange backticks/`${}` : écrire un `.js`.
- Chemins : `node --check /tmp/x.js` rend `C:\tmp\x.js` introuvable. Écrire
  les fichiers de travail dans le projet, jamais dans `/tmp`.

## Fragilités du code

- Bloc « SECURITY PROTECTION » (v66) : l'IIFE englobe
  `init(Bible|Quran|Tafsir)VerseTooltip`. Recompter les accolades avant
  retouche.
- `find('=')` sur une tranche JS : le premier `=` est celui de
  `(window.__x=window.__x||{})[N]=`. Ancrer sur `find(']=')` puis `+2`.
- **Lettres hébraïques précomposées** (U+FB1D–FB4F) : un filtre `0x05D0–0x05EA`
  les supprime silencieusement. Normaliser en NFD avant filtrage.
- `_m/` → racine = trois `dirname`.
- Regex : ne pas doubler les backslashes dans un littéral `/…/`.
- Mesure nulle ≠ « ça tient » : une puce rendue avant stabilisation mesure 0.
- `extractSuggestionsHtml()` (v81) capturait tout le reste d'un message.
- Références FR : « Gn 5,1 » (virgule) autant que « Gn 5:1 ».
- Ne pas dépendre d'une portée locale pour fermer un panneau :
  `closeArchivesPanel()` (const locale) → `ReferenceError` avalé par
  `catch(e){}`.
- `sanitizeSchemaHtml()` et ALLOW : `TBODY`, `THEAD`, `A`, `SUP`, `SUB`
  refusés → un `<table>` perdait TOUTES ses lignes.
- `colorizeSchemaRefs()` filtrait sur `indexOf(':')` : un schéma en virgule
  française sortait immédiatement. Filtrer sur `indexOf('<')`.
- `<br/>` du modèle visible : stocker en `@@BR@@` après normalisation CRLF.
- Détection de rôle par `nodeType === 3` : `box.textContent` colle « Abraham »
  + « patriarche ». Descendre dans les nœuds texte individuels.
- Texte arabe : les signes d'annotation ne sont **PAS** des mots
  (U+06D6–U+06ED). Les filtrer avant de découper.
- Un nœud texte n'a pas `.closest()` : `node.parentNode.closest()`.
- `range` sur une frontière de nœud texte = span vide → v95.
- `m.ts === s.msgTs` : un id DOM donne la **CHAÎNE**, `m.ts` est un NOMBRE.
- `AndroidManifest.xml` n'a pas `android:largeHeap`.

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