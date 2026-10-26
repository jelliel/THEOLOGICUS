# MEMORY — THEOLOGICUS (essentiel ; détails → daily logs)

## Build
- `THEOLOGICUS.html` : fichier unique, modules `<script id="vNOM">` avant `</body>`. **CRLF obligatoire**. `ls`=octets, `String.length`=UTF-16.
- 🔴 Injection par **tranches** (jamais `s.replace(ancre,module)` : avale `</script>`). Vérifier fermeture + `node --check`. Ancre multi-ligne en LF dans un CRLF = échec silencieux.
- 🔴 Normaliser CRLF : `s.replace("\n","\r\n")` **LITTÉRAL**. La regex `(?<!\r)\n` en heredoc double les échappements et casse le JS (30 modules, v611). Après : `node --check` + comptage CRLF/LF.
- Embarque `ai-video.html` + `newsreel.html` → `tools/sync_html.py` + `--check` (refuse d'écraser une cible plus grande). Version = `git rev-list --count` → `apk-v4.0.N`.
- 🔴 **Clé `~/.workbuddy-ai/keys/theologicus-release.jks` : ne jamais remplacer.** Perdre = plus de mises à jour signées.
- 🔴 **`tools/sync_html.py` après CHAQUE correctif (4 copies)** : non synchronisé = invisible. **L'exe lit le HTML sur le disque.**
- 🔴 **Commit + push à CHAQUE correctif** (`jelliel/THEOLOGICUS`, `main`). **Jamais `git stash`.**
- 🔴 Port **STABLE 8765–8780** (deux ports = deux stockages navigateur). Binder d'abord.
- 🔴 **Aucun processus de fond ne survit à l'invocation qui l'a lancé** (relais, MPT) → `tools/run_benches.py` possède le relais.
- Skills **versionnés** dans `.workbuddy-ai/skills/` = MIROIR de `~/.workbuddy-ai/skills/` ; **le canonique vit dans le répertoire utilisateur**. `tools/sync_skills.py` copie Source(user) → Miroir(repo) : éditer directement le miroir puis lancer `sync_skills` **ÉCRASE l'ajout**. Bon flux : éditer `~/.workbuddy-ai/skills/…/SKILL.md`, puis `sync_skills.py`, puis `git add`. `tools/githooks/pre-commit` vérifie le miroir à chaque commit. Clone neuf : `python tools/install_hooks.py` (`core.hooksPath` ne voyage pas).

## CI
- `controles` → 5 shards (`tools/bancs_shard.js`) → `bancs_gate` (`if:always()`) → `build`/`windows`, qui dépendent du GATE, pas des shards.
- 🔴 Ajout/suppression de module ⇒ mettre à jour `MODULES_ATTENDUS` (`tools/ci_smoke.js`) et le relancer en local.
- 🔴 Ne jamais conclure sur la DURÉE d'un shard : sous charge, un shard sain monte à 50–63 min.
- 🔴 `tools/bancs_shard.js` inutilisable en local : `spawnSync(node.exe)` = **EBUSY** ici, compté « dépassement de délai » (138 échecs en 1 s). Contournement : `tools_court/liste_bancs.js` + `tools_court/lanceur.sh`.

## Ancrage des edits d'étude (v632→v647) — le cœur
- 🔴 Espace d'offsets CANONIQUE : `noeudsTexteVisibles` exclut `.atc-figbox, .theo-fig, .theo-src-chips, [data-no-anchor]`. Ancrer sur le TEXTE ; l'offset ne départage que les occurrences. Mesure et restitution symétriques.
- 🔴 99,7 % des figures du store n'avaient AUCUNE ancre → `_ancFit` la répare en lisant le texte couvert, et la réparation doit être PERSISTÉE.
- 🔴 **Réparation en DEUX PHASES (v657b)** — résout la tension « ancre au geste » (v647/v648) vs « ancre au layout final » (v657e, le bug « position aléatoire au démarrage ») : PHASE 1 réparation IMMÉDIATE, ancre marquée `prov = 1` (lue à t0) ; PHASE 2 au signal de stabilité (`_atcStableLayout` = debounce 1 s partagé + garde `document.fonts.ready`), ancre encore provisoire et jamais gestée (pas d'ox/oy ni dx/dy) re-ancrée depuis la position D'ORIGINE `ancre.px/py` → converge d'un démarrage à l'autre. Un geste supprime `prov` : décision utilisateur intouchable. `keepGeo` conserve ow/oh d'une provisoire. Un gate de stabilité PUR (v657 67cd930) laissait ~2 s sans ancre → v647/v648 rouges en CI (40115275280).
- 🔴 **Un signal à passe unique doit désamorcer les marqueurs « déjà traité »** : le marqueur v652 `figEl.__atcGen = _atcNearGen` faisait SAUTER la figure sur la passe unique du debounce (layout figé ⇒ génération inchangée) — la finalisation ne recevait JAMAIS sa passe (mesuré : provisoires 638.. jamais ré-ancrées, `stableVu: 0`). Tant que `prov` est posé, ne PAS marquer `__atcGen`.
- 🔴 La position convergente d'une finalisation = la position D'ORIGINE du store (`px/py`), pas la position courante (elle dépend de l'ancre provisoire → auto-renforçante, non convergente).
- 🔴 **Un banc de course de repair utilise une carte NEUTRE (sans data-wiki)** : une carte `data-wiki` déclenche le pipeline de cartes de l'app, qui génère un contenu final NON déterministe (boxH 800 vs 1029, un `.theo-fig` en plus selon l'instant) — le banc mesure alors l'app, pas la repair.
- 🔴 `(f.x||10)` : **0 est une valeur** — tester le TYPE, pas la véracité.
- 🔴 Une figure réparée se CENTRE (`ancre.cx`) ; on n'invente pas d'offset (mesuré : cadres à 333 px de leur texte).
- 🔴 **Sa taille est la sienne — jamais `rr.w+16`** : ancre multi-lignes ⇒ `rr.w` ≈ conteneur, et `f.w` élargi redonne le `_w0` du démarrage suivant ⇒ gonflait à chaque redémarrage (447→1612 px). Plancher = largeur de la PREMIÈRE LIGNE, plafond ×1,6.
- 🔴 Borner sur `scrollHeight` (contenu), jamais `clientHeight` (vu 727 puis 849 → borne différente selon l'instant, et persistée).
- 🔴 Placement IDEMPOTENT + rejoué après stabilisation (`_atcSettle` branché sur `_atcScheduleApply`) : le contenu grandit par paliers, le cadre suit une passe plus tard (240→301 mesurés).
- 🔴 **Un geste manuel ne doit JAMAIS être défait** (v647) : `_ancPlace` s'abstient si `figEl.__atcGeste` ; le mousedown pose la marque, le mouseup la lève. Un DÉPLACEMENT mémorise l'écart AU COIN de l'ancre (`ox/oy`) — accumuler `dx/dy` sur le centrage n'est pas reproductible (dx=30 enregistré, cadre rendu à 0). Le redimensionnement retire l'ancre et pose `f.libre=1`.
- 🔴 **Une marque « en cours » doit avoir son filet** (v647b) : un `mouseup` perdu (bouton lâché hors fenêtre) laisserait `__atcGeste` posé ⇒ le cadre ne serait PLUS JAMAIS replacé, il ne suivrait plus son texte — la classe de défaut même qu'on corrige. Écouteur de capture sur `window`, idempotent avec `up()`.
- 🔴 Persistance : `saveChat` écrit dans **IndexedDB** (canonique) ; localStorage n'est qu'un filet. Lire localStorage a fait croire 5 versions durant que le store n'apprenait rien. `atcPersist` n'est PAS sur `window`. `_ancRect` renvoie du conteneur **scroll inclus** → revenir au viewport = SOUSTRAIRE `scrollTop`.
- 🔴 **Un geste manuel n'est jamais jeté, même sur une mise en page qui bouge** (v648) : le garde `__atcStable === false` de `persistFig` était placé AVANT le calcul de `aBouge`, donc un déplacement fait pendant que le contenu s'insère encore faisait `return` sans rien enregistrer — et `_ancPlace` rappelait alors le cadre sur son ancre (dans la session ET au démarrage). Ce qui est provisoire, c'est la position ABSOLUE ; l'écart à l'ancre (`ox/oy`) est durable. Garde déplacé après `aBouge`.
- Anti-lag : `atcPersist()` = `flushChatNow()` (setItem synchrone) — jamais sur un `input` répété ; throttle 350 ms ; garder `__atcApplying`/`__atcFigEditing`.

## Bancs (règles dures)
- 🔴 Un contrôle négatif doit échouer pour la BONNE raison, et rendre l'ancien build STRUCTURELLEMENT incapable de passer.
- 🔴 Un contrôle négatif qui mesure `0 → 0` ne prouve RIEN : il doit TENIR une valeur réelle (`{"l":30,"t":18} -> {"l":30,"t":18}`), sinon il passe à vide des deux côtés.
- 🔴 **Un helper de comparaison déclaré `async` rend le contrôle VIDE** : une fonction `async` retourne une Promise, TOUJOURS truthy, donc `cond && memeGeo(a,b)` vaut vrai quoi qu'il arrive. C'était le cas dans les bancs v647 et v648 (v648, oct. 2026) : A2 et C ne testaient en réalité que A1. Comparaison **synchrone**, ou `await` à l'appel.
- 🔴 **L'état d'un banc doit être vérifié À L'INSTANT où le code le lit**, pas à l'instant où on le prépare : forcer `__atcStable=false` avant le glissement ne sert à rien, `_atcSettle` le réarme en ~200 ms (premier banc v648 = faux positif 8/8).
- 🔴 Aucun scénario ne doit passer à vide : semer ce qu'on vérifie et REFUSER de passer quand la prémisse manque.
- 🔴 Deux mesures concordantes ne suffisent pas pour « mise en page stabilisée » : il faut ~1 s de calme (5 mesures). C'était la fluctuation de v634.
- 🔴 Ne jamais retirer `setup-wizard-overlay` (coupe l'init) : semer `theologicus_wizard_skipped='1'`, désarmer `.active` en boucle.
- 🔴 Un banc qui échoue une fois puis passe n'est pas « flaky à ignorer » : le rejouer pour trouver la condition.
- `page.evaluate(fn, arg)` : UN SEUL argument ; helpers définis dans l'IIFE.

## Stockage / environnement
- IDB `THEOLOGICUS_AI_DB` canonique ; localStorage filet 5 Mo. WebView (exe/APK) ne télécharge pas les blob URL → export serveur `/save-data`.
- 🔴 `git push` BLOQUE >5 min ici (GCM du PortableGit, invite dans le bac à sable) → timeout 124, sortie vide. La recette `git credential fill` ne prime RIEN (fichier vide). Ce QUI MARCHE, vérifié : `TOKEN=$(gh auth token)` puis `git -c credential.helper= -c http.extraheader="Authorization: Basic $(printf '%s' "x-access-token:$TOKEN" | base64 -w0)" push origin main` → 7 s. `cmd | tail` renvoie le code de `tail` → fichier + `$?`.
- 🔴 Lancer une commande de fond DANS un wrapper `&` + `sleep` la fait tuer avec le wrapper : le log reste vide et l'effet n'a pas eu lieu. Passer la commande elle-même en `run_in_background`.
- Jetons CSS : un même jeton se déclare plusieurs fois (thème) → ancorer après la PREMIÈRE occurrence du `:root`. Insertion CSS par regex : inclure le `;`. `window.toast`/`state` : un top-level `const` n'est PAS sur `window`. Mocker le contrat DOCUMENTÉ d'une API, jamais un commode.

---

## Règles héritées (reprises du MEMORY.md précédent, à ne pas reperdre)

- Config survivant à une MAJ → `%LOCALAPPDATA%/THEOLOGICUS/`, **jamais** le dossier d'install.
- `maj_installe.py` (`_v126/_align_bench/`, gitignoré) tamponne le HTML du dépôt dans
  `C://Theologicus//.workbuddy-ai//artifacts//_v123//_pub//installe//` — cible des raccourcis.
  Ce dossier `installe/` **n'a pas suivi** le déplacement du projet vers `C://tmp//theoverify`.
- 🔴 **La version doit MONTER.** Le fichier porte `VERSION` (gitignoré, donc rien ne
  signale un retard). Cas réel : `2.0.214` écrit alors que l'install était en `2.0.224`.
  Garde de monotonie (comparaison **numérique**). Lire le tampon en place :
  `grep -o "STAMPED *= *'[^']*'" installe/THEOLOGICUS.html`.
- **Vérifier la parité hors tampon** (le tampon fait 9 caractères d'écart) : comparer les
  **sha1 après neutralisation du tampon**, pas les tailles seules.

## Application

`THEOLOGICUS.html` ~1,65 Mo, **59 `<script>`**, **LF**. **`THEO_CORPORA` pilote
tout** ; `summafr` id `1001` hors `THEO_CORPORA`. Capacitor 8, `com.theologicus.app`.
Accès DOM : `_STU`/`_set` = `getElementById` ; **`$(id)` sans `#`** est un piège.

## Modals à onglets (PARAMÈTRES 5 · STUDIO 6)

**Cacher par `hidden`, jamais `display:none` en ligne.** Un `display:none` en ligne
sur une vue INTERNE (`#studio-form`/`-progress`/`-result`) laisse un panneau
visible mais **vide** : restaurer l'état à **chaque ouverture**. Un `<!--` fermé
par `*/` avale tout jusqu'au prochain `-->` : présent dans les octets, **absent du
DOM**. Test de connexion PARAMÈTRES = `resolveModelConfig()`, le chemin réel.

## MPT

**Aucune route de configuration** → THEOLOGICUS édite `config.toml` : ligne à
ligne, liste blanche, clés inconnues **signalées et jamais écrites**, ajout dans
`[app]`. Clés de banques = **listes** TOML. **Un fournisseur sans zone n'a d'adresse
nulle part.** Le service est un **voisin** (« non détecté » est vrai) : 2 s sur
**8080**, `/ping` → `pong`. **Prouver l'identité** (`pong` seul) ; **`_boucle_locale()`
indispensable** sinon `http_proxy`=53051 rend un 502 qui ressemble à une réponse.
`mpt_lancer()` rend `lance:true` **avant** que MPT réponde → sonder la condition.

## AI VIDEO — vérification de clé (v126h)

`verifyAgnesKey`/`verifyMistralKey` passent par `_verifCle(relais, direct,
key, applyUI)`. **Le relais (proxy_server) utilise `http.client` SANS le
proxy système** → derrière un proxy d'entreprise il ne sort PAS, alors que
WebView2 OUI. Donc si le fetch `/proxy/` est rejeté, 502 ou 404 HTML (relais
obsolète), **repli sur un fetch DIRECT vers l'URL nue** (`_VIA_RELAIS` + CORS
`*` le permettent). **Ne jamais `res.json()` aveuglément** (un 404 HTML le
fait lever → « Erreur réseau » à tort) : lire le texte, ne parser que si
`Content-Type` JSON ou tête `{`. `fetch` rejeté = relais/API injoignable ;
tout le reste renvoie un statut lisible (valide / invalide / HTTP n).

## Sources de médias (v126)

11 sources, 4 groupes (`stock` 3 · `ia` 6 · `image` 1 · `local` 1), via
`GET /mpt/sources`. **Chaque clé porte un lien « Get API Key »** `target=_blank`
`rel=noopener noreferrer`. Fiches IA **construites par le service**. **Un champ hors
`#studio-modal` n'est jamais enregistré, sans erreur** (c'est le sélecteur balayé).
La note « source payante » doit suivre le **`change`**, pas le remplissage.

## Bancs — mise en œuvre (héritée)

`tools/run_benches.py [--mpt] [--port N] [--keep] banc…` lance le relais, attend
par **CONDITION**, exécute, referme.

- **Un banc part de l'état qu'il prétend tester** : `verify_service_lifecycle` et
  `verify_studio_autostart` exigent MPT **ARRÊTÉ** (les lancer avec `--mpt` donne
  32/35 et 15/18 qui accusent l'app **à tort**) ; les autres exigent `--mpt`.
- Scores : v126 137/137 + 109/109 · v125 35/35 + 56/56 · v124 35/35 + 18/18 ·
  v123 78/78 · v122 71/71 · v120 57/57 + 14/14.
- Attendre la **CONDITION**, jamais un délai fixe. **Une assertion périmée encode
  un ancien défaut** : corriger le banc. **Une sonde 404 n'est pas une erreur**
  (`version.txt` → « dev ») : filtrer ce bruit précis.
- node : `NODE_PATH=…/node/workspace/node_modules` **en ligne** ; Chromium
  `ms-playwright/chromium-1234`. Déverrouillage : `localStorage['theologicus_remember']`
  = SHA-256(`remember:`+`AUTH_HASH`). Poser `theologicus_wizard_skipped='1'` sinon
  l'assistant intercepte les clics.
- `run_benches.py` prend des **chemins**, pas des noms : `--mpt .workbuddy-ai/artifacts/_v126/verify_x.js`.
- Un banc doit **imprimer sa couverture même quand tout va bien** : « silence =
  propre » ne se distingue pas de « banc qui n'a rien regardé ».

## Déploiement (installation réelle)

`maj_installe.py` (`_v126/_align_bench/`, **gitignoré**) tamponne le HTML du dépôt
dans `C:\Theologicus\.workbuddy-ai\artifacts\_v123\_pub\installe\` — cible des
raccourcis Bureau et Menu Démarrer. Le dossier `installe/` **n'a pas suivi** le
déplacement du projet vers `C:\tmp\theoverify`.

- **La version doit MONTER.** Le fichier porte `VERSION` ; il est gitignoré, donc
  rien ne signale qu'il est resté en arrière. Cas réel : il disait `2.0.214` alors
  que l'installation était en `2.0.224` → on allait faire **reculer** l'app.
  Un garde de monotonie refuse maintenant (comparaison **numérique**, pas en
  chaînes). **Lire le tampon en place avant de choisir le numéro :**
  `grep -o "STAMPED *= *'[^']*'" installe/THEOLOGICUS.html`.
- **Vérifier la parité hors tampon** (le tampon fait 9 caractères d'écart) :
  `STAMPED = '__THEO_VERSION__'` (16) contre `STAMPED = '2.0.225'` (7).
  Comparer les **sha1 après neutralisation du tampon** — pas les tailles seules.
- Version en place au 2026-09-28 : **2.0.225**.

## Thèmes / lisibilité (v130–v132)

Sept thèmes : `glass` (défaut), `cyber`, `midnight` (génération ancienne) et
`v6-glass`, `v6-cyber`, `v6-light` (récente), plus `light`. **Détail des pièges
dans le skill `theologicus-code-fragilities`** (jetons morts, second `:root`,
fuite de jeton de surface, coque incomplète) et `web-ui-audit-measure` (mesure du
contraste, fonds en dégradé). Cinq règles qui coûtent cher :

- **Toute surcharge de thème s'écrit `html[data-theme="…"]`** (0,1,1). En
  `[data-theme="…"]` (0,1,0), le second `:root` de `#v9-palette`, plus bas,
  l'écrase — c'est ce qui rendait `light` et `midnight` illisibles.
- **Un thème sombre doit redéfinir TOUS les jetons de surface qu'il hérite**,
  pas seulement les jetons de texte (`--glass-bg` manquait aux trois `v6-*`).
- **Quand on surcharge la coque, aligner la LISTE des jetons sur celle de la
  coque d'origine.** `#v9-palette` pose sa palette **sur `.tpai-shell`** aussi :
  un jeton posé là masque la valeur héritée pour tous les descendants, et la
  spécificité ne sert à rien contre ça. Le bloc `v6-light` n'en portait que 15
  sur 19 → `.suggestion-chip` à 1,22:1. **Un correctif partiel est plus trompeur
  qu'aucun correctif.**
- **Le fond se COMPOSE** (chaîne translucide jusqu'à l'opaque), il ne se prend
  pas « au premier ancêtre opaque » : sinon les surfaces en verre passent le
  seuil. Détecteurs : `jetons_manquants.js`, `fuites_jetons.js`,
  `audit_contraste_theme.js`, `sonde_cascade.js` (bancs `_v126/_presets_bench/`).
- **Un relevé qui accuse un composant doit être vérifié avant le composant.** Un
  fond en **dégradé** n'est pas dans `backgroundColor` : `.avatar` (blanc sur
  `linear-gradient(#534ab7,#7f77dd)`) était annoncé 1,00:1 alors qu'il est à
  3,76–6,93:1. Le « corriger » aurait dégradé un composant sain.

État mesuré (2026-09-28, instrument égal des deux côtés) : **0** élément sous 3:1
dans **les sept** thèmes. Avant v132 : `light` **40**, `v6-light` **11**. Un seul
non-mesurable par thème : `.avatar` (dégradé, amplitude 1,84).

## Divers

TTS : sortie unique `ttsEmission()` ; **latin lu en français : voulu, question
close** ; **`[slowly]`/`[softly]` proscrits** ; quota ElevenLabs épuisé 2026-10-24.
**Zéro littéral numérique hors modal** ; une seule échelle z-index nommée.
Voisins : Supertonic 8091, LibreTranslate, MPT 8080. **Parité MPT** : suivre
EXACTEMENT `VideoParams`, chaînes vides **omises**.

> Note : la convention de version est passée de `2.0.<n>` à `apk-v4.0.<n>`
> (`git rev-list --count HEAD`) ; au 23 oct. 2026 le dépôt est en **663** révisions.
