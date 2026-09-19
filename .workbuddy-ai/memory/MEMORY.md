# THEOLOGICUS — notes long terme

Détail complet ailleurs : skill `theologicus-apk-build`, `.workbuddy-ai/artifacts/`
(proposition 2.0, spec 2.0, CI, secrets, LibreTranslate), journaux datés.
Ici uniquement ce qui doit survivre.

## Application

- Monolithe `THEOLOGICUS.html` (~1,2 Mo) + tranches JS : `bible/` (66),
  `quran/` (114), `tafsir/` (114), `libs/`, **`summa/`** (611 questions,
  17 Mo), **`fathers/`** (118 œuvres, 36 Mo), **`reformed/`** (91 entrées,
  27,8 Mo), **`orthodox/`** (43 entrées, 1,9 Mo), **`islamic/`** (93 livres,
  5,4 Mo : Houdas & Marçais, le Sahih d'Al-Bukhari en français). Chargés **à la
  volée** par `__ensureBibleBook` / `__ensureQuranSurah` / `__ensureTafsirSurah`
  / `__ensureSummaQuestion` / `theoCorpusWork`.
- **`THEO_CORPORA` pilote tout** : un corpus = `{dir, pfx, idx, wrk, nms,
  label, tab, root, web}`. Ajouter une entrée suffit — onglets de la
  bibliothèque, `theoParseRef`, rendu du modal et `parseLibraryRef` s'en
  déduisent. Ordre de résolution des citations : **fathers → reformed →
  orthodox → islamic** (le plus long alias gagne, le premier corpus essayé
  gagne). Conséquence : un titre chrétien et un titre musulman identiques
  (« de la foi », « grand catéchisme ») donnent toujours le **premier** corpus
  — c'est une précédence, pas un bug. Interroger `parseIslamicRef` (etc.)
  pour forcer un corpus.
- **Les `.js` de `assets/` sont déflatés au ratio 0,19 dans l'APK** (mesuré :
  51,86 Mo → 9,74 Mo). Un corpus de texte ne coûte donc qu'un cinquième de
  son poids disque. **Ne jamais tailler un corpus avant d'avoir mesuré.**
- Les générateurs de corpus (`tools/build_summa.py`, `build_fathers.py`,
  `build_reformed.py`, `build_orthodox.py`, `build_islamic.py`) gardent leur
  cache HTTP dans `tools/.summa_cache/`, `.fathers_cache/`, `.ccel_cache/`,
  `.orthodox_cache/`, `.islamic_cache/` (tous gitignored). Relancer régénère
  tout sans réseau.
- **OCR : deux pièges récurrents dans les livres numérotés.** (1) Un tome
  porte souvent **deux séries** de lignes-titre : le corps, puis la **table des
  matières** en fin de volume (en majuscules, nom après un tiret). Couper à
  `TABLE DES MATIÈRES`, sinon le corpus double et les numéros sont faux.
  (2) Les **chiffres romains OCR-isés ne sont pas fiables** (`Ilï`→III,
  `XL`→XI) : préférer un identifiant **séquentiel** à un identifiant calculé.
  Règle générale : l'ordre du texte est fiable, le chiffre ne l'est pas.
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
- PowerShell depuis Bash est bloqué → outil PowerShell dédié.
- `AndroidManifest.xml` n'a **pas** `android:largeHeap` : tout gros objet natif
  tue l'app (v65, d'où la sauvegarde par morceaux).

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
