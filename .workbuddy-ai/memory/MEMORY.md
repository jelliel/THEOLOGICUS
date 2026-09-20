# THEOLOGICUS — notes long terme

Détail complet ailleurs : skill `theologicus-apk-build`, `.workbuddy-ai/artifacts/`
(proposition 2.0, spec 2.0, CI, secrets, LibreTranslate), journaux datés.
Ici uniquement ce qui doit survivre.

## Application

- Monolithe `THEOLOGICUS.html` (~1,2 Mo) + tranches JS : `bible/` (66),
  `quran/` (114), `tafsir/` (114), `libs/`, **`summa/`** (611 questions,
  17 Mo, anglais), **`summafr/`** (613 questions, 20,2 Mo : trad. **Drioux**,
  domaine public — mêmes ids, `1001` = Ia q.1), **`fathers/`** (118 œuvres,
  36 Mo), **`reformed/`** (91 entrées, 27,8 Mo), **`orthodox/`** (43 entrées,
  1,9 Mo), **`islamic/`** (93 livres, 5,4 Mo : Houdas & Marçais, le Sahih
  d'Al-Bukhari en français), **`denzinger/`** (128 sections, 1,3 Mo : le
  magistère, éd. latine 1911). Chargés **à la volée** par `__ensureBibleBook`
  / `__ensureQuranSurah` / `__ensureTafsirSurah` / `__ensureSummaQuestion` /
  `__ensureSummaFrQuestion` / `theoCorpusWork`. Le panneau de la Somme
  s'ouvre en **français** (`__SUMMA_LANG_DEFAULT='fr'`), bouton FR/EN, repli
  sur l'anglais si la question manque. `summafr/` n'est PAS dans
  `THEO_CORPORA` (moteur des corpus patristiques) : la Somme a son propre
  modal et son propre résolveur.
- **`THEO_CORPORA` pilote tout** : un corpus = `{dir, pfx, idx, wrk, nms,
  label, tab, root, web}`. Ajouter une entrée suffit — onglets de la
  bibliothèque, `theoParseRef`, rendu du modal et `parseLibraryRef` s'en
  déduisent. Ordre de résolution des citations : **fathers → reformed →
  orthodox → islamic → denzinger** (le plus long alias gagne, le premier
  corpus essayé gagne). Conséquence : un titre chrétien et un titre musulman identiques
  (« de la foi », « grand catéchisme ») donnent toujours le **premier** corpus
  — c'est une précédence, pas un bug. Interroger `parseIslamicRef` (etc.)
  pour forcer un corpus.
- **Les `.js` de `assets/` sont déflatés au ratio 0,19 dans l'APK** (mesuré :
  51,86 Mo → 9,74 Mo). Un corpus de texte ne coûte donc qu'un cinquième de
  son poids disque. **Ne jamais tailler un corpus avant d'avoir mesuré.**
- Les générateurs de corpus (`tools/build_summa.py`, `build_fathers.py`,
  `build_reformed.py`, `build_orthodox.py`, `build_islamic.py`,
  `build_denzinger.py`, `build_summa_fr.py`) gardent leur cache HTTP dans
  `tools/.summa_cache/`, `.fathers_cache/`, `.ccel_cache/`, `.orthodox_cache/`,
  `.islamic_cache/`, `.denzinger_cache/`, `.summafr_cache/` (tous gitignored).
  Relancer régénère tout sans réseau.
- **Vider le dossier de sortie avant chaque génération** (`rm -f denzinger/*.js`).
  Les fichiers d'une génération précédente y restent, sont `git add`-és et
  partent dans l'APK avec du contenu **faux** : piégé en T6 (165 fichiers
  versés pour 131 réellement produits).
- **Ne jamais « corriger » un titre OCR par rapprochement approximatif**
  (difflib, seuil bas) : en T6 un seuil de 0,55 a remplacé « S. HYGINUS » par
  « S. ZOSIMUS » et attribué chaque document au mauvais pontife. Un corpus
  dont l'attribution n'est pas sûre est pire que pas de corpus.
- **OCR : deux pièges récurrents dans les livres numérotés.** (1) Un tome
  porte souvent **deux séries** de lignes-titre : le corps, puis la **table des
  matières** en fin de volume (en majuscules, nom après un tiret). Couper à
  `TABLE DES MATIÈRES`, sinon le corpus double et les numéros sont faux.
  (2) Les **chiffres romains OCR-isés ne sont pas fiables** (`Ilï`→III,
  `XL`→XI) : préférer un identifiant **séquentiel** à un identifiant calculé.
  Règle générale : l'ordre du texte est fiable, le chiffre ne l'est pas.
  (3) Le **mot-clé lui-même** peut être méconnaissable (`giiKsrioN` pour
  QUESTION, `AKTICLE`, `ARTICLE UAfIQUE` pour UNIQUE). Méthode qui marche :
  générer toutes les valeurs romaines **syntaxiquement valides** que le token
  peut représenter (table de confusions documentée), laisser la **suite**
  trancher, et **valider par le compte attendu** — jamais l'inverse.
  Ne pas `strip()` la ponctuation à gauche d'un token : « !X » (IX) devient
  « X » et 9 se lit 10.
- **`build_reformed.tokenize` ne lit `title=` que collé au nom de balise** :
  `<div2 id="…" title="…">` donne un titre vide. `build_orthodox.fix_titles()`
  remonte l'attribut en tête avant de parser.
- **CCEL / Schaff « Creeds of Christendom »** : le **vol. II est une édition
  critique, grec + latin uniquement** (et en `<table>`, donc écarté par le
  parseur). Le texte **anglais** des confessions grecques est au **vol. I**,
  chap. 3. Ne pas chercher Mogila / Dositheus dans creeds2.
- **`COPY_DIRS` de `tools/prepare_mobile.py`** : tout corpus oublié ici
  disparaît de l'APK sans erreur visible (déjà piégé avec `summa`, `fathers`,
  `reformed`).
- **`biblehb/`** (39 livres + `strongs.js`, 12 Mo) : mot à mot hébreu,
  `biblehb/bN.js` chargé par `__ensureBibleHb(n)`, dictionnaire par
  `__ensureStrongsHb()`. Source **WLC** (`wlc/*.xml`, Open Scriptures),
  **pas** `morphhb/oshb.js` : oshb.js est numéroté **KJV** et fond le
  titre d'un psaume dans le verset 1, alors que le corpus français suit
  la numérotation massorétique. Mesuré : oshb.js 84,6 % de chapitres
  alignés, WLC **98,9 %**. Le WLC est de plus **vocalisé**.
- **`quranwbw/`** : tranches `[glose_en, translit, glose_fr]`. Le français
  vient de LibreTranslate **local** (23 667 gloses uniques, cache
  `tools/.glosses_fr.json`), complété d'un glossaire vérifié
  (`CORRECTIONS`/`EPITHETES` dans `tools/traduit_gloses.py`) parce
  qu'Argos Translate massacrait les épithètes divines. Toujours étiqueté
  « trad. auto. » dans l'UI, anglais source gardé dessous.
- Capacitor 8, `com.theologicus.app`, webDir `mobile/www`, minSdk 24 →
  targetSdk 36, AGP 8.13.0, Gradle 8.14.3.
- Clés API **jamais embarquées** : saisies au lancement,
  `localStorage['__serverKeys']`. Shim v34 remplace `fetch('/theologicus-keys')`
  et `/save-data` sur natif.
- v2.0 : les références bibliques se résolvent **en local** au tap (écouteur
  `click` en capture dans `initBibleVerseTooltip`). Tables
  `bible/versification.js` + `quran/versification.js` **générées** par
  `tools/build_versification.js` — régénérer après tout changement du corpus.

## Signature release — FICHIER CRITIQUE

```
C:\Users\toshr\.workbuddy-ai\keys\theologicus-release.jks   alias: theologicus
C:\Users\toshr\.workbuddy-ai\keys\theologicus-release.PASSWORD.txt
C:\Users\toshr\.workbuddy-ai\keys\theologicus-release.jks.base64.txt  ← CI
```
RSA 4096. **Ne jamais remplacer ce JKS** : plus aucune mise à jour publiable.
SHA-256 `93d8324058f1ecd1d252d97b976854ffaf2a976605b9658983d17db6d70f5e67`.
Vérifier par `apksigner verify --print-certs`, **jamais** en cherchant
`META-INF/*.RSA` (AGP signe en v2/v3, aucun META-INF : fausse alerte connue).

## Build

Chaîne hors dépôt : `C:\Users\toshr\.workbuddy-ai\binaries\android-tools\`
(`jdk21`, `android-sdk`). Procédure exacte → skill `theologicus-apk-build`.

- `./gradlew` échoue en fin sur `~/.gradle/.../metadata.bin (Access is denied)` :
  relancer avec `dangerouslyDisableSandbox` sur le `~/.gradle` déjà peuplé.
- **`APK_VERSION_NAME` obligatoire** : sinon `build.gradle` l. 48 retombe sur
  `1.0.<code>` et l'APK s'annonce autrement que le HTML.
- **Ne pas lancer `prepare_mobile.py`** en local : son `rmtree(mobile/www)`
  est bloqué par la sécurité (`SAFE_DELETE_BULK_CONFIRM_REQUIRED`, ~950
  fichiers). Contournement éprouvé : régénérer `mobile/www/index.html` seul
  (remplacement du viewport + `__THEO_VERSION__`), puis
  `shutil.copytree(src, mobile/www/<dossier>, dirs_exist_ok=True)` pour chaque
  corpus. Jamais `npx cap sync` en local (échoue, et peut livrer le code
  précédent). **Tout dossier ajouté doit aussi être dans `COPY_DIRS`** sinon
  CI livre une app sans corpus (déjà piégé avec `summa`).
- `tools/check_syntax.js` valide les 49 blocs `<script>` inline. **À lancer avant
  toute compilation** — un bloc cassé rend l'app muette (incident v66).

## Dépôt / CI

- Deux jobs : `build` (APK) et `windows` (exe PyInstaller + zip portable +
  installeur Inno Setup). **Ajouter un corpus = mettre à jour TROIS listes** :
  `COPY_DIRS` de `tools/prepare_mobile.py`, la liste du job `windows` dans
  `.github/workflows/build-apk.yml`, et `build_installer.bat`. Une liste
  oubliée ne casse pas le build : elle donne des 404 à l'usage.
- La version affichée vient de `git rev-list --count HEAD` (2.0.N). Le fichier
  `VERSION` racine est **périmé à 1.0.10** : ne jamais s'en servir (la CI passe
  la version en argument à `tools/stamp_version.py`).

- `jelliel/THEOLOGICUS`, `main`. Commits en **anglais**.
- Jamais committer : `android/local.properties`, `android/release.keystore`,
  `mobile/www/*`, `theologicus_keys.json`.
- Pas de `gh` CLI. Pushes OK (Git Credential Manager) → toujours
  `GIT_TERMINAL_PROMPT=0`. Dépôt public → API GitHub sans auth pour les runs.
  `git status` ment parfois (« upstream is gone ») → `git ls-remote origin`.
- `versionCode` = `git rev-list --count HEAD` (avant le commit en local, après
  en CI). Tags `apk-v2.0.<N>` depuis le 2026-09-18. Le fichier `VERSION` à la
  racine est **périmé** — ne pas s'y fier.

## Fragilités du code

- Bloc « SECURITY PROTECTION » (v66) : l'IIFE englobe aussi
  `init(Bible|Quran|Tafsir)VerseTooltip` et ne se ferme qu'après eux. Recompter
  les accolades avant toute retouche.
- `#references-btn` et `#memory-toggle` partageaient le **même emplacement
  fixe** : masquer l'un révèle l'autre. Vérifier les collisions d'emplacement
  avant de conclure qu'un masquage a échoué.
- **CRLF** : tout grep multi-ligne avec `\n` renvoie 0 alors que le code est là.
  L'outil Edit échoue pareil → patcher via un script Python qui écrit `\r\n`.
- **`find('=')` sur une tranche JS** : le premier `=` est celui de
  `(window.__x=window.__x||{})[N]=`. Toujours ancrer sur `find(']=')` puis
  `+2`. Déjà rencontré 3 fois (oshb.js, versification.js,
  `traduit_gloses.py`).
- **Lettres hébraïques précomposées** (U+FB1D–FB4F : « shin pointé »,
  « vav+holam », « dalet+dagesh ») : `strongs.xhtml` les utilise, et un
  filtre `0x05D0–0x05EA` les supprime silencieusement. Toujours passer par
  `unicodedata.normalize('NFD', …)` avant tout filtrage de l'hébreu.
- **Ordre des diacritiques hébreux non garanti** entre les sources. Ne pas
  supposer lettre→dagesh→voyelle.
- **LibreTranslate** : `tools/start_libretranslate.py` peut annoncer
  « Echec de l'installation » alors que le paquet est bien installé (le
  sandbox bloque la lecture d'un `.pyc`, le contrôle `have_module`
  renvoie False). Vérifier `importlib.util.find_spec('libretranslate')`
  avant de conclure.
- **Animation CSS sur Android WebView** : une `@keyframes` peut être armée,
  remonter dans `getComputedStyle().animationName`, et **ne jamais s'exécuter**.
  Ne jamais écrire un test qui vérifie `animationName` : piloter le mouvement en
  JS (`element.animate`) et **mesurer le déplacement réel** (N9/N10 du banc).
- **`scrollWidth` gelé** sur `overflow:hidden` + `text-overflow:ellipsis`
  (Android WebView) : mesurer l'élément **intérieur** sans ellipsis.
- **Mesure nulle ≠ « ça tient »** : une puce rendue avant stabilisation mesure
  0. Ne jamais en conclure qu'il n'y a rien à faire — re-mesurer plus tard.
- **`extractSuggestionsHtml()` (v81)** : capturait tout le reste d'un message
  quand le mot « suite » (banal en français) ou « approfondir » apparaissait en
  fin de bloc. Si les puces produites étaient déjà utilisées (`_isSuggestionUsed`),
  le texte retiré disparaissait. **Règle** : une fonction d'extraction doit
  toujours avoir un filet — si rien ne sort, ne rien retirer. Et le déclencheur
  doit être un titre court (le mot-clé EN TÊTE de ligne), pas une phrase qui
  contient le mot-clé par hasard.
- **French refs** : les références bibliques en français s'écrivent « Gn 5,1 »
  (virgule), pas « Gn 5:1 ». Toute regex qui les cherche doit accepter les
  deux formes **et** la résolution au tap aussi (parseRef() élargie 2026-09-20).
- **`closeArchivesPanel()` était une const LOCALE à `bindEvents()`** : depuis
  `loadArchiveChat()` (autre portée), c'était un `ReferenceError` silencieux
  dans un `try{}catch(e){}` → le panneau restait ouvert, le toast annonçait
  « chargée ». Règle : soit exposer sur `window`, soit fermer en touchant la
  classe directement (sans dépendre de la portée).
- **`loadChat()` échouait en silence** et `loadArchiveChat()` annonçait quand même
  « Conversation chargée » → un toast ne doit jamais mentir. Toujours retourner
  une valeur de vérité et la tester avant d'afficher la confirmation.
- **`sanitizeSchemaHtml()` et ALLOW** : `TBODY`, `THEAD`, `A`, `SUP`, `SUB`
  étaient refusés → un `<table>` du modèle perdait TOUTES ses lignes (le
  conteneur retiré, ses enfants aussi), un lien perdait son texte. Toujours
  inclure dans ALLOW les balises structurelles dont l'absence tue le contenu.
- **`colorizeSchemaRefs()` et le filtre `indexOf(':')`** : un schéma sans
  deux-points (« Gn 5,1 » virgule française, ou sans aucune référence)
  **sortait immédiatement** et donc perdu les rôles, le pliage et la barre
  d'outils. Le filtre demande désormais `indexOf('<')` (présence de balises),
  pas un deux-points. Un filtre trop optimiste qui exclut des entrées
  légitimes fait perdre la fonctionnalité aux yeux de l'utilisateur.
- **`<br/>` du modèle visible à l'écran** : le modèle écrit souvent
  `Seth<br/>Enosh` en texte courant ; le premier traitement de `mdToHtml`
  échappe `<` en `&lt;`, la balise devient texte visible. Parade : stocker
  `<br...>` en `@@BR@@` juste après la normalisation CRLF et restaurer en
  `<br>` à la toute fin de `mdToHtml`, après `@@MDLINK`. Trois cas
  couverts : bloc de code, prose hors bloc, schéma avec balise inconnue.
- **Détection de rôle par `nodeType === 3`** : `box.textContent` colle
  « Abraham » + « patriarche » en `abrahampatriarche`, aucun mot-clé
  n'est trouvé aux bords. Toujours descendre dans les nœuds texte
  individuels pour normaliser les bordures.
- **Texte arabe du Coran : les signes d'annotation ne sont PAS des mots.**
  ۖ ۛ ۚ … (U+06D6–U+06ED) sont des tokens séparés par des espaces dans
  notre champ `arabe`. Les compter faisait croire à un désalignement avec
  api.quran.com (31,8 %). Après exclusion : **100 % sur 311 versets**.
  Toujours filtrer cette plage avant de découper en mots.
- **Un nœud texte n'a pas `.closest()`** : pour remonter au conteneur,
  passer par `node.parentNode.closest(...)`. Déjà piégé dans v37 et v86.
- **`m.ts === s.msgTs` est une égalité stricte** : un id DOM
  `mc-9000000001` donne la CHAÎNE alors que `m.ts` est un NOMBRE.
  Toujours re-numériser ce qu'on lit d'un `id`.
- **En headless, l'app démarre derrière l'écran d'authentification** qui
  recouvre tout : `elementFromPoint` renvoie `auth-logo`. Masquer les
  `body > *` en `fixed`/`absolute` de plus de 300×300 avant toute sonde
  qui utilise des coordonnées.
- **Licences des données bibliques (vérifié 2026-09-20)** : Strong's XML
  d'Open Scriptures est **GPL 3.0** (pas domaine public) ; OSHB
  lemme/morphologie est **CC BY 4.0** (texte WLC domaine public) ;
  Quranic Arabic Corpus est **GPL** et interdit la modification → livrer
  le fichier tel quel et le parser à l'exécution.
- **Couleurs v83 par rôle** : `patriarche` ambre `#9a6206`, `roi` or
  `#b8860b`, `prophète` bleu `#2f6f8f`, `prêtre` violet `#6a3fa0`,
  `apôtre` vert `#0f6b4a`, `source` taupe `#8a7a55`. Le détecteur est
  en français (accents supprimés) — l'anglais (`patriarch`) est aussi
  reconnu.
- PowerShell depuis Bash est bloqué → outil PowerShell dédié.
- `AndroidManifest.xml` n'a **pas** `android:largeHeap` : tout gros objet natif
  tue l'app (v65, d'où la sauvegarde par morceaux).
- **Messages de commit : jamais `printf`** (un `%` dans le texte — « 100% » —
  est un format invalide et tronque le message en pleine phrase). Écrire le
  message dans un fichier puis `git commit -F fichier`.

## Décisions produit arrêtées avec l'utilisateur

- Gestes : **appui long** → bulle « Add to chat » uniquement ; **double-tap** →
  encadrement ; tap sur passage annoté → son commentaire (400 ms).
- Verrou : **aucune pénalité** au changement de fenêtre (le chrono se met en
  pause), difficulté montante plafonnée à 3, question ratée qui revient,
  « souvenir de moi » 7 jours.
- Références : lien **local d'abord**, lien web en secours seulement.
- Traduction embarquée = « BJ 1998 » (Bible de Jérusalem) → **sous droits** :
  conditionne l'export et le comparateur de traductions.
- LibreTranslate : voir `artifacts/LIBRETRANSLATE.md`. L'**IP du PC change
  (DHCP)** → relancer `tools/start_libretranslate.py` et prendre l'adresse
  marquée ✅, jamais une adresse supposée. Dernier relevé : WiFi
  `192.168.100.71`, Tailscale `100.74.55.70`.
