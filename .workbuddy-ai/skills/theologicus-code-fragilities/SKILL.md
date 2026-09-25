---
name: theologicus-code-fragilities
description: Pièges vérifiés sur pièce dans le code de THEOLOGICUS (parseur CSS, NFD, sanitisation, sélecteurs, tranches JS) et règles durables des bancs headless CDP. Utiliser avant toute retouche du monolithe THEOLOGICUS.html, avant d'écrire un banc de mesure, ou quand un symptôme « impossible » apparaît (règle CSS ignorée, lignes de tableau perdues, nœud texte sans closest, mesure à 0).
agent_created: true
---

# THEOLOGICUS — fragilités du code et pièges des bancs

Ces points ont tous été **mesurés**, jamais déduits. Ne pas les redécouvrir :
chacun a coûté une session. Liste volontairement télégraphique.

## Fragilités du code (monolithe)

- **`$("id")` SANS `#` : un sélecteur faux ne lève AUCUNE erreur (v120).** `$` est
  `const $ = s => document.querySelector(s)`. Donc `$("studio-modal")` cherche une
  **BALISE** `<studio-modal>`, ne trouve rien et rend **`null`**. Un `if (m)` saute
  alors en silence : le bouton STUDIO VIDÉO ne faisait **rien**, sans un message.
  **32 appels** du bloc studio étaient dans cette forme, contre 17 corrects
  (`$("#…")`) — le mélange dans le même fichier rend l'œil inopérant. Corriger par
  région : isoler le bloc par ses bornes textuelles, puis
  `re.sub(r'\$\(\"([a-z0-9\-]+)\"\)', r'$("#\1")', bloc)` **et** vérifier
  `selecteurs encore sans # : 0` avant d'écrire.
  **Règle durable : ne jamais conclure « le code tourne » parce qu'il ne lève pas.**
  Un banc doit OBSERVER L'ÉTAT APRÈS LE CLIC (`display`, `classList.contains`), pas
  l'absence d'exception — le banc v120 rend « aucune erreur JavaScript » **et**
  trois échecs sur le même défaut. `document.querySelector('studio-modal') === null`
  est le contrôle qui attrape la classe entière de bugs.
- **Un serveur déjà lancé sert une version PÉRIMÉE, même après `sync_html.py`.**
  Mesuré : `THEOLOGICUS.exe` (PID visible au `netstat` sur 8765) servait
  1 469 128 o quand le disque portait 1 495 645 o — le correctif était sur le disque
  et **absent de l'app**. `SERVE_DIR` est le dossier du **module** : l'exe installé
  sert `_inst_v102`, pas la racine du dépôt. **Arrêter le processus, relancer, puis
  re-sonder** (`len(bytes)` + comptage du motif fautif) avant de croire un test
  navigateur. Ne pas chercher un cache HTTP : le serveur envoie `no-store` et lit
  le fichier à chaque requête — c'est **l'instance** qui est vieille.
- **Comparer des longueurs : `len(s)` sur une `str` Python compte les CARACTÈRES.**
  Un fichier UTF-8 de 1 495 645 octets rend 1 469 169 caractères — l'écart de 26 476
  ressemble à une troncature (et l'a fait croire). Toujours `len(open(p,'rb').read())`.
- Bloc « SECURITY PROTECTION » (v66) : l'IIFE englobe
  `init(Bible|Quran|Tafsir)VerseTooltip` — **recompter les accolades** avant retouche.
- **Une accolade fermante en trop dans un `<style>` fait ABANDONNER au parseur tout
  ce qui suit.** La règle reste dans `textContent` mais est absente de
  `document.styleSheets` → feuille tronquée, symptôme « ma règle CSS est ignorée ».
  Compter les accolades **hors commentaires** :
  `re.sub(r'/\*.*?\*/', '', s, flags=re.S)`.
- **DEUX feuilles de schéma** : le `<style>` principal **et** une copie dans
  `exportCss()`. Toute retouche doit être faite des deux côtés, sinon l'export
  diverge de l'écran.
- **Lettres hébraïques précomposées** (U+FB1D–FB4F) : un filtre `0x05D0–0x05EA` les
  supprime **silencieusement**. Normaliser en NFD avant filtrage.
- Détection de rôle par `nodeType === 3` : `box.textContent` colle « Abraham » +
  « patriarche ». Descendre dans les nœuds texte individuels.
- Texte arabe : les signes d'annotation ne sont **PAS** des mots (U+06D6–U+06ED) —
  les filtrer avant de découper.
- `range` sur une frontière de nœud texte insère un `<span data-hl-id>` **vide**
  (v95) → sauter toute tranche vide, et **ne pas annoncer « cliquez le passage
  surligné » avant qu'un span non vide existe** (un toast ne doit jamais mentir).
- `sanitizeSchemaHtml()` et la liste ALLOW refusent `TBODY`, `THEAD`, `A`, `SUP`,
  `SUB` → un `<table>` perdait **TOUTES** ses lignes.
- `colorizeSchemaRefs()` filtrait sur `indexOf(':')` : un schéma en virgule française
  (« Gn 5,1 ») sortait immédiatement. Filtrer sur `indexOf('<')`.
- **Ne pas dépendre d'une portée locale pour fermer un panneau** :
  `closeArchivesPanel()` (const locale) → `ReferenceError` avalé par `catch(e){}`.
- `<br/>` du modèle visible : stocker en `@@BR@@` après normalisation CRLF.
- `find('=')` sur une tranche JS : le premier `=` est celui de
  `(window.__x=window.__x||{})[N]=`. Ancrer sur `find(']=')` puis `+2`.
- Un nœud texte n'a pas `.closest()` : `node.parentNode.closest()`.
- `m.ts === s.msgTs` : un id DOM donne la **CHAÎNE**, `m.ts` est un **NOMBRE**.
- Références FR : « Gn 5,1 » (virgule) autant que « Gn 5:1 ».
- Mesure nulle ≠ « ça tient » : une puce rendue avant stabilisation mesure 0.
- `extractSuggestionsHtml()` (v81) capturait tout le reste d'un message.
- `_m/` → racine = trois `dirname`. Regex : ne pas doubler les backslashes dans un
  littéral `/…/`.
- `AndroidManifest.xml` n'a pas `android:largeHeap`.
- `.schema-kids` n'avait pas `flex-wrap` (contrairement à `.schema-row`) : les
  libellés se comprimaient et `overflow-wrap:anywhere` hérité les tranchait en deux
  (v103). `flex-shrink:0` sur les groupes, `overflow-wrap:normal` sur `.schema-box`.
- Seuil désaccordé laissé tel quel : le CSS replie dès **901 px**, le JS n'ouvre au
  démarrage qu'à partir de **1024 px**. Bénin, ne pas « corriger » au hasard.
- **`mdToHtml` rend en DEUX passes — piège structurel.** Le texte entre guillemets
  (`«…»`, `"…"`) et les mentions `Source : …`, `Selon …`, `D'après …`, `cf. …` sont
  extraits en **jetons** (`@@BCIT`, `@@BSRC`) **AVANT** le rendu, puis restaurés
  **APRÈS** `inlineMd`. Leur contenu ne traverse donc **jamais** les règles inline :
  le gras à l'intérieur d'une citation s'affichait `**gras**` en clair (v111).
  Correctif : **`mdEmphase(s)`**, fonction **nommée**, appelée par `inlineMd` **et**
  par le site de restauration — **tout site qui restaure du texte brut doit
  l'appeler**. Deux corollaires : `[^*]+` ratait `**a * b**` (→ `[\s\S]+?`), et
  `Source\s*:\s*[^\n,;]+` capturait le `**` fermant **compris**, laissant l'ouvrant
  orphelin hors du span (→ `[^\n,;*]+`). **Quand un marqueur survit « par
  endroits », chercher ce qui est EXTRAIT, pas ce qui est CONVERTI** — et ne pas
  conclure « le convertisseur existe donc c'est autre chose » : il existait, il
  n'était simplement jamais appliqué à ce contenu-là. Banc `_tts/bench_gras.js`
  (34 cas, **8 en échec avant, 0 après**). Les quatre règles jumelles restées dans
  `inlineMd` sont inatteignables mais doivent rester **alignées** : deux sites
  divergents, c'est le piège classique de ce fichier.

## Fournisseurs LLM — pièges vérifiés (v118)

- **Un identifiant de modèle peut désigner un FOURNISSEUR** :
  `"<providerId>:<model>"` (`agnes:agnes-2.5-flash`, `openai:gpt-4o`).
  `_providerModelId()` le décompose ; `resolveModelConfig()` route endpoint
  **et** clé du fournisseur (`state.keys[<id>]`). Un identifiant **nu** reste
  Mistral (rétrocompatibilité de `MODELS`). Une partie modèle vide (`"agnes:"`)
  rend `null` — sinon la requête part sans nom de modèle (400 opaque).
- **Un modèle préfixé n'obéit PAS à `state.apiKey`** : ce champ ne décrit que la
  clé Mistral. Tout garde de la forme `if (!state.apiKey)` **rejette à tort** un
  modèle d'un autre fournisseur (« Configurez votre clé API d'abord » alors que
  la clé utile est là). Utiliser `_clePourModele(activeId)`. Vérifier **chaque**
  garde avant d'annoncer un nouveau fournisseur : elles étaient plusieurs.
- **Ne pas proposer les modèles qui ne répondent pas sur l'endpoint visé** :
  `agnes-image-*` / `agnes-video-*` ne répondent pas sur `/chat/completions`.
  Filtrer à la source (`_providerModelsOf()`), pas à l'affichage.
- **La liste des modèles doit être groupée par fournisseur** (`<optgroup>`) et
  **partagée** par le menu bureau ET le menu burger. Le burger rebâtissait sa
  liste sur `MODELS` seul : il n'aurait jamais montré que Mistral.
- **Piège de banc** : `msel.innerHTML = sel.innerHTML` est une copie de **chaîne**
  en navigateur. Un faux DOM qui stocke la chaîne sans la **parser** (ni
  sérialiser les enfants du source) fait échouer le test du burger **alors que
  le code est correct**. Sérialiser les enfants, puis re-parser.

## Services voisins — connecteur dans proxy_server.py (v120)

Motif partagé par **Supertonic**, **LibreTranslate** et **MoneyPrinterTurbo
(STUDIO VIDÉO)** : le service tourne à côté, l'app s'y connecte par
`proxy_server.py`. **On n'embarque jamais le service.**

- **Toujours passer par un RELAIS, jamais appeler le service en direct.** La page
  est servie en `127.0.0.1:8765` ; tout autre port est une **autre origine**, donc
  cross-origin. Un relais local supprime le besoin d'imposer une config CORS à
  l'utilisateur.
- **`http_proxy` piège la boucle locale — et le symptôme est TROMPEUR.**
  `HTTP_PROXY`/`http_proxy` sont définis dans l'environnement de cette machine, et
  **urllib les honore AUSSI pour `127.0.0.1`**. Le proxy ne peut pas joindre la
  boucle locale et rend **502 Bad Gateway** : cela *ressemble* à « le service a
  répondu 502 » alors qu'il **n'a jamais reçu la requête**. Correctif :

  ```python
  opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
  ```

  **Le test est l'ABSENCE de `ProxyHandler` dans `opener.handlers`** (avec
  `proxies={}`, `build_opener` ne l'installe pas) — pas une table vide, qui
  n'existe pas. `curl` est piégé de la même façon : comparer avec `--noproxy '*'`.
- **Sonder en LECTURE SEULE, et prouver l'IDENTITÉ, pas la présence.** « Le port
  répond » ne prouve rien : n'importe quel programme peut tenir 8080. MPT :
  `GET /ping` doit rendre `pong`.
- **FastAPI `-> str` rend `"pong"` AVEC guillemets** (corps JSON). Accepter les
  deux formes : ce qui compte est l'identité du service, pas l'encodage.
- **Sonder la plage ENTIÈRE, y compris le front de l'outil.** MPT ouvre **8080**
  (`api.bat`) **ou 8501-8509** (`start.bat` → Streamlit choisit le premier libre).
  **Journaliser le port retenu** (un port qui change en silence casse la
  stabilité d'origine, cf. v117) et **vider le cache s'il meurt** — sinon l'UI
  promet un studio qui échoue à chaque envoi.
- **Formulaire de service → `%LOCALAPPDATA%/THEOLOGICUS/`**, comme les clés et la
  config TTS. Écriture **atomique** (`tmp` + `os.replace`). Jamais dans le dossier
  d'installation.
- **Relire `failed_stage` et `error` du service et les REMONTER tels quels.**
  MPT nomme l'étape fautive et la cause (`moonshot: api_key is not set…`) :
  afficher « échec » seul force l'utilisateur à fouiller l'autre outil pour une
  cause qu'on avait déjà.
- **Banc : ISOLER ses ports du vrai service.** Si le service tourne sur la machine,
  son port répond pour de bon et les assertions « service absent » échouent **à
  tort**. Travailler sur des **ports privés au banc**, et **arrêter le faux
  service** avant de tester les refus de démarrage (sinon « déjà lancé » est la
  bonne réponse et le test est faux). Voir `_v120/verify_studio.py` (50/50).
- **Un front couplé à son processus n'est pas extraytable.** Le WebUI de MPT
  (`webui/Main.py`, 8 262 lignes) **importe `app.services`** et tourne sous
  Streamlit dans le même processus : pas d'`api/v1`, pas de HTTP. Sa valeur est
  dans l'API, pas dans son interface. **Intégrer leur API derrière NOTRE front.**

## Demarrage / resolution de port — pieges verifies (v119)

- **Sonder un port LIBRE coute le timeout ENTIER.** Sur cette machine, un port
  de la plage ni ouvert ni refuse (aucun RST) fait expirer la connexion : ~0,4 s.
  Le bug v117 : 16 ports x 2 requetes = **10,7 s de demarrage**. Un `bind`, lui,
  repond a la meme question en **0 ms**.
- **Ordre correct : `bind` d'abord.** Un bind reussi est une preuve instantanee
  que le port est libre — inutile de le sonder ensuite. On ne sonde QUE les ports
  occupes, ou un serveur repond en quelques ms. Voir `resoudre_port()` (app.py).
- **Une seconde sonde qui n'existe que pour une transition de version est un
  cout permanent.** Le test du contenu de `THEOLOGICUS.html` (v117) ne servait
  qu'a reconnaitre une instance d'un exe anterieur : il doublait la facture a
  chaque lancement, pour un service rendu une seule fois. A supprimer une fois la
  transition passee.
- **Ne jamais se fier a « ca a l'air plus rapide »** : chronometrer l'ancienne ET
  la nouvelle strategie sur l'etat reel des ports (`_v119/verify_demarrage.py`,
  qui espionne en plus `_est_notre_serveur` pour prouver qu'aucun port libre
  n'est sonde).
- **Un exe en cours d'usage verrouille son fichier** : `cp` echoue avec
  `Device or resource busy`. Trois scenarios de port a distinguer — instance a
  nous (arret immediat), port tenu par un AUTRE programme (le cas lent), plage
  libre (le cas lent aussi).

## Bancs headless (CDP) — règles durables

Les pièges de harnais (nom de fichier servi, `#theo-maj-bandeau`, `.welcome-banner`,
`display` instrumenté, `setTimeout` journalisé, `elementFromPoint` vs trace
d'événement, comptes de conditions, `NODE_PATH`…) sont dans le skill
**`theologicus-zindex-guard`**, section « Pièges du banc lui-même ». Ci-dessous
seulement ce qui se réapprend mal.

- **Contre-épreuve obligatoire** : le MÊME banc sur la baseline **et** sur la cible.
  Vert des deux côtés ne prouve **rien** ; le delta est la preuve
  (`_v103/check_baseline.js`). La baseline doit vivre **dans la racine du projet** :
  l'app dérive ses chemins de corpus de `location.pathname` et ne s'initialise
  jamais dans un sous-dossier (sinon `detectScriptLang is not defined`).
- **Le banc doit suivre le GESTE RÉEL.** v105 : il déplaçait la souris ailleurs
  **avant** de saisir la poignée, puis exigeait qu'elle y soit encore — un geste que
  personne ne fait, et il accusait l'app. Et **ne pas exiger le delta brut quand
  l'app borne à l'écran** : le bornage est un service.
- **Observer l'ÉTAT APRÈS le geste, jamais « pas d'exception » (v120).**
  `_v120/verify_studio.js` : clic réel sur le bouton, puis `classList.contains`,
  `getComputedStyle(...).display`, `getBoundingClientRect().width`, et l'existence
  des 22 champs internes. Sur le défaut d'origine il rend **« aucune erreur
  JavaScript » et 11/14** — exactement pourquoi le bug a survécu. Contre-épreuve
  faite : défaut réintroduit → 11/14, défaut retiré → 14/14.
- **Le harnais doit déverrouiller l'app avant de tester l'UI.** Profil neuf =
  écran de verrouillage (`#auth-overlay`, `z-index:999999`, `inset:0`) **plus**
  l'assistant de premier lancement (`#setup-wizard-overlay`) — deux couches qui
  interceptent le pointeur et font dire au banc « le clic ne passe pas » alors que
  l'app est saine. Forger le jeton comme l'app :
  `sha256('remember:' + AUTH_HASH)` → `localStorage['theologicus_remember']`
  `{v:1, mode:'admin', exp:Date.now()+7*86400000, tok}`. **Le jeton mal formé est
  SUPPRIMÉ au démarrage** (`readRemember`), donc l'écran reste : vérifier
  `localStorage.getItem(...)` après chargement avant d'accuser le reste.
- **Chromium de Playwright : épingler `executablePath`.** Le paquet installé
  réclame une révision absente (`chromium_headless_shell-1243`) alors que la
  machine en a d'autres ; sans chemin explicite,
  `browserType.launch: Executable doesn't exist`. Valeurs valides : voir
  `_v120/verify_studio.js` (candidats testés par `fs.existsSync`).
- **`--dir` d'un installeur Inno : lancer via `cmd //c` en Git Bash.** Un
  `./Setup.exe /DIR=C:\x` direct rend **`EXIT=0` sans rien installer**
  (antislashs mangés, aucun journal). Aussi : `/tmp` en Git Bash = dossier Temp
  Windows, pas `C:\tmp` — une consigne PowerShell pointant `C:\tmp` ne voit rien.
- **Un banc trop confortable ne prouve rien** (v102 : vert à 984 px, cassé sous
  300 px). Un banc qui n'ouvre aucun panneau mesure le vide.
- **Tester les étages en isolement ne prouve rien** : en v106, chaque étage du TTS
  était correct un par un et le défaut vivait dans la file. Instrumenter le **point
  d'entrée réel** (`speechSynthesis.speak`), pas la fonction interne.
- **Un test de bout en bout peut masquer le défaut qu'il prétend mesurer** : le repli
  générique produisait la même sortie que l'étape cassée, donc le test passait sur la
  version d'avant. **Tester l'étage précis qu'on répare.**
- **Un `sleep` ne remplace pas une condition** : sinon tout `z-index` calculé vaut
  `auto` et les mots ne sont pas chargés.
- **Un backtick dans un commentaire à l'intérieur d'un gabarit JS casse le fichier**
  — piégé **cinq fois**. Le message (`missing ) after argument list`) ne désigne
  jamais la bonne ligne.
- Écrire les fichiers de travail **dans le projet**, jamais dans `/tmp`
  (`node --check /tmp/x.js` → `C://tmp//x.js` introuvable sous Git Bash).
- En headless, les utterances échouent en `not-allowed` (pas de périphérique audio) :
  **c'est normal et ça n'invalide pas la sonde** — le journal `SPEAK`/`ONERROR` reste
  probant.
- **Mesurer le VERDICT, jamais un marqueur** : `grep -c 'v107'` comptait mes propres
  commentaires d'en-tête et donnait un faux positif.
- `git show HEAD:fichier` après un commit renvoie la version **corrigée** : pour une
  contre-épreuve, prendre `HEAD~1` **et vérifier le md5**.
- Écrire les scripts de banc avec l'outil Write, jamais par heredoc Bash : un
  `${…}` dans le texte (ex. `JSON.stringify`) déclenche `Bad substitution`.

### Protocole CDP — les cinq fautes qui coûtent une heure chacune

Mesuré sur `bench_v109_moteurs.js`, qui a échoué **cinq fois de suite** avant
d'être vert. Chaque symptôme ressemblait à « l'app ne répond pas ».

1. **UN SEUL compteur d'identifiants pour toute la session.** Le banc en avait
   deux — un pour `send()`, un pour `ev()` — qui émettaient tous les deux
   `1, 2, 3…`. La réponse à `Runtime.evaluate` **arrivait bien** (la trace
   l'affichait : `[cdp] id 1`) mais se perdait dans la collision. Symptôme
   trompeur : « Runtime.evaluate sans réponse » alors que le message était reçu.
   Un client CDP ne doit jamais réutiliser un id. Corrigé par un guichet unique
   `requete(method, params)` partagé par `send` **et** `ev`.
2. **`Runtime.enable` n'est pas optionnel** avant `Runtime.evaluate` : sans lui,
   aucune réponse, silence total. Le domaine `Page`, lui, répond sans son enable.
3. **`Page.navigate` résout AVANT que le nouveau document soit commité.** Une
   évaluation envoyée dans cet intervalle vise un contexte d'exécution détruit :
   Chrome l'abandonne sans répondre. Attendre `Page.loadEventFired` (avec un
   repli silencieux si l'événement se perd).
4. **Une exception dans le PREMIER écouteur `message` empêche les suivants de
   tourner** (EventEmitter). Le gestionnaire générique doit donc entourer son
   `JSON.parse` d'un `try`, sinon un message illisible condamne l'écouteur de
   `ev()` qui attend une réponse déjà arrivée. Ajouter `ws.setMaxListeners(0)`.
5. **Un diagnostic doit nommer l'interpréteur.** `sys.exit("numpy est requis")`
   a coûté deux essais : numpy était installé, mais pas dans le Python qui
   tournait. Mettre `sys.executable` dans le message, toujours.

Deux outils qui ont réellement servi, à garder :

- **Trace CDP sous `BANC_DEBUG`** : journaliser chaque message reçu
  (`id N` ou `method`). C'est cette trace, et rien d'autre, qui a désigné la
  collision d'identifiants. Sans elle on ne voit que « pas de réponse ».
- **Chien de garde** (`process.exit(2)` après N secondes) : un banc bloqué doit
  le dire, pas tourner indéfiniment.

### Environnement d'exécution — l'élévation casse `import numpy`

Constaté sur ce poste : quand une commande est **élevée** (bac à sable
contourné), `import numpy` échoue dans l'interpréteur géré, alors que numpy est
bien installé — parce qu'il est résolu dans le **site-packages utilisateur**
(`C:\Users\toshr\Python\Python313\site-packages`), hors du préfixe géré, et que
ce chemin n'est plus lisible dans ce mode. En bac à sable normal, tout marche.

- Symptôme : « numpy est requis » alors que `python -c "import numpy"` répond.
- Remède : utiliser l'interpréteur de l'**environnement isolé**
  (`…\.workbuddy-ai\binaries\python\envs\default\Scripts\python.exe`), dont les
  paquets vivent sous le préfixe géré.
- Ne pas conclure trop vite : c'est aussi ce qui fait qu'un `spawn` de Node et un
  `nohup` de shell peuvent se comporter différemment **sur le même script**.

### Ajouter un service local : recopier le cycle de vie existant

`proxy_server.py` porte déjà **tout** le schéma d'un service local, écrit pour
LibreTranslate : découverte de l'interpréteur (`_lt_python_cmd`), test
d'importabilité, sondage HTTP, `status/start/stop/install`, journal dans
`logs/`, `CREATE_NO_WINDOW`, `atexit`, et les routes `/libretranslate/*` que
l'app appelle en **same-origin** (`fetch(path, {method:'POST'})`). L'UI de
PARAMÈTRES suit le même dessin : pastille, ligne d'état, bouton bascule,
bouton journal.

**Avant d'inventer un second mécanisme, chercher celui-là.** En v110, un
`DesktopApi` pywebview a failli être ajouté pour piloter Supertonic ; les routes
existantes faisaient déjà le travail, sans bridge natif, et donc **aussi dans un
navigateur**.

Deux différences à ne pas oublier quand on copie le schéma :

- **L'interpréteur se choisit en le TESTANT** (`import numpy, onnxruntime`), pas
  en le supposant : `sys.executable` (n'est pas un Python en exe gelé), puis
  `py -3`, `python`, `python3`. Le message d'échec doit **nommer l'interpréteur**
  et donner la commande d'installation exacte.
- **`ready` n'est pas `running`.** Un port ouvert n'est pas un service prêt : le
  modèle ONNX peut se charger encore. `ready` exige le champ `loaded` du
  `/health`, sinon la première lecture échoue alors que l'UI annonce « en ligne ».

Et une conséquence de déploiement : **`proxy_server.py` est compilé DANS l'exe**
PyInstaller. Une route ajoutée là ne prend effet qu'après reconstruction de
l'exécutable — un `THEOLOGICUS.html` à jour ne suffit pas. Les fichiers voisins
(`tools/`) doivent en plus être livrés par `build_installer.bat`.

### Un message d'erreur qui ne dit pas la cause est un défaut

« ElevenLabs : échec (moteur-erreur) » a coûté un aller-retour utilisateur : le
message réel était jeté avant l'affichage. Une clé refusée (401) et un Voice ID
inconnu (404) appellent pourtant des gestes opposés.

Règle : **un code d'erreur interne ne doit jamais être la seule chose montrée.**
Transmettre le détail à côté du code (`onErr(code, detail)`), garder le code pour
la logique (arrêter ou non la file) et le détail pour l'humain.

Mesuré sur ce poste : **un port localhost fermé ne produit pas d'erreur de
connexion** — un relais local répond **HTTP 502** (`upstream connect failed … os
error 10061`). Vérifié sur 8099, 8123 et 9999 : tous 502. Un vrai service qui
écoute (3900) répond 200.

Deux conséquences, toutes deux piégeuses :

- **`curl … && echo "ça répond"` est un faux positif** : curl sort en 0 sur un
  502. C'est le **code HTTP** ou le **corps** qu'il faut regarder. Je m'en suis
  servi pour annoncer qu'un service tournait alors qu'il était mort.
- **Un sondage qui conclut « service déjà là » sur la seule réception d'une
  réponse est faux.** Il doit exiger `statusCode === 200` **et** un corps
  analysable, et retomber sur son plan B sinon — sinon il échoue au lieu de
  démarrer le service, au moment précis où il en aurait besoin.

Corollaire : un service lancé en arrière-plan depuis un shell **ne survit pas** à
la fin de l'invocation. Un banc doit donc **savoir démarrer ce dont il dépend**,
et le prouver en le faisant au moins une fois sans rien de préalablement lancé.

### Un contrôle qui court avant le câblage est instable

`ttsCablerParametres()` tourne sur `DOMContentLoaded`, donc **après** le moment
où `detectScriptLang` existe déjà. Mesurer dès que `detectScriptLang` est une
fonction donnait **un vert sur deux** — le sélecteur de voix était encore vide
une fois sur deux. Attendre la condition elle-même
(`attendreCondition(expr, ms)`), jamais un `sleep`, jamais l'apparition d'un
autre symbole pris comme proxy.

## Le `#` manquant : la forme en VARIABLE (v121)

`$` est `document.querySelector` : il exige le `#`. La forme littérale
(`$("studio-modal")`) a déjà coûté un bouton mort (v120). **La forme en variable
est plus sournoise** :

```js
const s = $(id);        // id = "studio-voice"  -> querySelector("studio-voice")
const l = $(idS);       // cherche une BALISE <studio-voice> -> null
const pk = $(idPick);   // idem
const b = $(bouton);    // idem
```

Le `#` **ne peut pas** figurer dans le littéral puisqu'il n'y en a pas. Neuf
sites de ce type dans le bloc studio, **zéro exception**, trois symptômes
distincts qu'on imputerait au service voisin :

- curseurs qui bougent mais dont l'étiquette reste figée ;
- pipette et champ texte qui divergent ;
- listes déroulantes qui restent vides.

**Correctif durable : un point d'accès unique.**
`const _SEL = id => document.getElementById(id);` puis `_SEL` partout dans le
bloc. `getElementById` **ne prend pas de `#`** et n'accepte pas de sélecteur :
la classe entière d'erreurs disparaît.

**Audit à refaire tel quel après toute retouche du bloc :** lister **tous** les
`$(x)` et signaler ceux dont `x` n'est pas un littéral commençant par `#`.

```python
deb = src.find("const _studio = { polling:")
fin = src.find("window.__studioOpen = studioOpen;")
for m in re.finditer(r'\$\(([^()]*)\)', src[deb:fin]):
    arg = m.group(1).strip()
    if not arg.startswith('"#') and not arg.startswith('"<'):
        print("SUSPECT", arg)
```

Un audit qui ne cherche que `$("litteral")` rate **tous** les `$(variable)`.
Corollaire : les commentaires citant `$(idS)` ressortent comme suspects — lire la
ligne avant de conclure.

## Boucle locale : `_boucle_locale()` ou rien (v121)

`http_proxy`/`HTTP_PROXY` sont définis sur ce poste et **urllib les honore aussi
pour `127.0.0.1`**. Le proxy ne joint pas la boucle locale → **502**, un message
qui ressemble à « le service a répondu 502 » alors qu'il n'a jamais reçu la
requête.

`_mpt_probe` désarmait ce piège ; **`mpt_requete` non**. Résultat : `/mpt/status`
rendait `running:true` pendant que **chaque** requête échouait — un défaut qui
accuse le service voisin.

**Règle : toute sortie HTTP vers la boucle locale passe par `_boucle_locale()`**
(`build_opener(ProxyHandler({}))`). Vérifier **chaque** appel, pas seulement la
sonde : un correctif appliqué à un seul des deux sites laisse le pire des
symptômes, celui qui est *à moitié* vert.

## Un exécutable portatif imbrique son application (v121)

`MPT_DEFAULT_DIR` est la **racine** du portatif (elle porte les `.bat` et
`lib/`), mais le code Python et `resource/fonts` vivent dans le **sous-dossier**
`MoneyPrinterTurbo/`. Chercher `racine/resource/fonts` ne trouve rien, **sans
erreur** : la route rend `count: 0` et le sélecteur reste vide.

Résolution robuste, sous-dossier d'abord :

```python
def _mpt_racines():
    base = _mpt_dir()
    if not base: return []
    sub = os.path.join(base, "MoneyPrinterTurbo")
    return ([sub, base] if os.path.isdir(sub) else [base])
```

Toute lecture de fichier dans une installation portative passe par cette liste.

## Une assertion peut être fausse : ne pas « corriger » l'application

`<input type="color">` **minuscule** ce qu'on affecte à `.value` (`#FFEEDD` →
`#ffeedd`). Le banc exigeait la majuscule : **l'application avait raison**, le
banc avait tort. Deux échecs sur 55 venaient de là.

Devant un échec, trancher **d'abord** qui a tort, et corriger le côté fautif. Un
banc ajusté pour faire passer une application fausse transforme un contrôle en
décoration.

## Découper un modal en onglets — les trois pièges d'affilée (v122)

Passer `#settings-modal` de « tout visible » à **cinq panneaux** (`.settings-panneau`
+ `.settings-tabs`) a produit **trois défauts successifs**, chacun masquant le
suivant : le banc ne voyait le second qu'une fois le premier corrigé. Les trois se
diagnostiquent par la **structure**, jamais par l'œil.

1. **`display:none` EN LIGNE gagne contre la feuille de style.** Les quatre
   panneaux cachés portaient `style="display:none"` : `pa.hidden = false` ne les
   rallumait **jamais**, car le style en ligne d'un ancêtre (ou de l'élément)
   l'emporte sur toute règle de feuille. **Cacher par l'attribut `hidden`** (stylé
   `[hidden]{display:none}`) et basculer `el.hidden` — l'attribut, lui, est
   souverain. Un `display:none` en ligne est un piège d'écriture, pas un style.

2. **Une balise perdue rend les panneaux SUIVANTS enfants du précédent.** Deux
   `</div>` manquants (ceux de `#tts-st-block` et du panneau TTS) ont fait que
   `#settings-panneau-keys` et `#settings-panneau-cache` sont devenus **enfants**
   de `#settings-panneau-tts` : le HTML restait « bien formé » pour le navigateur,
   donc aucun message. **Méthode de diagnostic, dans cet ordre :**
   - **(a) Tracer la PROFONDEUR des `<div>` ligne à ligne depuis `modal-body`.**
     Chaque panneau **doit s'ouvrir à la même profondeur**. Un décalage de +1 sur
     les panneaux tardifs = une fermeture perdue en amont. C'est ce tracé, et rien
     d'autre, qui a désigné la ligne.
   - **(b) Remonter `parentElement` dans le navigateur** pour prouver l'ascendance
     réelle (`…-corps < panneau-keys < panneau-tts < modal-body` = faux). Un
     document « bien formé » ne dit **rien** sur la hiérarchie voulue.

3. **Un bloc resté HORS de tout panneau n'est jamais montré.** Le bloc
   `🔐 ACCÈS AU LANCEMENT` (`#remember-state`, `#forget-remember-btn`) était dans
   le DOM mais à l'extérieur des cinq panneaux → invisible pour toujours. D'où un
   contrôle de banc explicite : pour chaque onglet, vérifier que **chaque champ
   attendu est non seulement présent mais ATTEIGNABLE** (visible quand son onglet
   est actif). Un champ qui existe et qu'on ne peut jamais voir est un défaut, pas
   une réussite.

Corollaire de méthode : **`check_syntax.js` ne valide que le JS, jamais le HTML.**
Sur un découpage de markup, la seule preuve est la profondeur + `parentElement` +
« rien ne reste dehors ». Banc `_v122/verify_settings.js` (**71/71**).

### Deux fonctions à responsabilités distinctes (v122)

Un sélecteur à `onchange` qui rappelle la fonction de synchronisation **annule le
choix de l'utilisateur** : `settingsModelSync()` relit `state.model` (état→UI) et
écrase la sélection en cours. Le banc l'a montré en clair — sélectionner `openai`,
appliquer, obtenir `deepseek:gpt-4o-mini`.

Séparer : **`settingsModelSync()` (état→UI)** pour l'ouverture et l'application
d'un choix déjà posé, **`_setLlmDecrireFournisseur(fid)` (UI→description)** pour
l'`onchange`, qui décrit la sélection **sans relire l'état**. Toute logique
partagée est extraite dans une **fonction nommée** appelée par les deux. Règle
générale : **une fonction qui lit l'état ne peut pas être appelée depuis un
gestionnaire qui vient de le contredire.**

### Le test de connexion vise le CHEMIN D'APPEL RÉEL

Le bouton « Tester la connexion » appelle **`resolveModelConfig()`** (l'endpoint,
la clé et le format que l'app utilisera vraiment), **pas** la passerelle MPT — qui
ne connaît que son propre registre et son `config.toml` et validerait donc une
configuration que l'app n'utilise pas. Contrôler ce qui sera utilisé, pas ce qui
est déclaré.

---

## v123 — éditer le `config.toml` d'un logiciel tiers, et trois pièges de banc

### MoneyPrinterTurbo n'expose AUCUNE route de configuration

`app/router.py` ne monte que `ping`, `video`, `llm`. Ses réglages (clés Pexels,
fournisseur LLM, publication) ne sont écrits que par son WebUI Streamlit, **dans
le même processus que lui**. Toute application extérieure doit donc éditer
`config.toml` **elle-même**. Conséquences de méthode :

- **Éditeur ligne à ligne, jamais de réécriture complète** : un `config.toml`
  de 253 lignes porte des commentaires et des clés qu'on ne connaît pas. On
  réécrit la ligne de la clé visée, on ajoute les clés manquantes **dans la
  bonne section** (`[app]`), on écrit en `tmp` + `os.replace`.
- **Liste blanche obligatoire**, et les clés inconnues **signalées, jamais
  écrites** : une écriture opportuniste dans le fichier d'un tiers est
  indétectable jusqu'à ce que son propriétaire constate la casse.
- **Types** : les clés de banques de médias sont des **listes** TOML, pas des
  chaînes. Écrire une chaîne là où le logiciel attend une liste casse la
  recherche de vidéos **sans message d'erreur**.
- **Un test de connexion doit viser le CHEMIN D'APPEL RÉEL** : remplir les
  valeurs vides depuis le registre, puis émettre une vraie requête au
  fournisseur, et rapporter **la cause** (HTTP, délai, clé absente).

### Parser un fichier Python comme source de vérité (registre de 28 fournisseurs)

Lire `app/models/llm_provider.py` plutôt que recopier la liste : le tiers en
ajoute à chaque version. Trois pièges mesurés :

1. **Suivi de profondeur obligatoire** (`profondeur += code.count("(") - code.count(")")`).
   Une regex de fin d'entrée `\),?` se déclenche sur la parenthèse fermante d'un
   appel **imbriqué** (`LLMProviderEndpoint(`, `api_key_url=(...)`) et coupe
   l'entrée trop tôt — ou la laisse ouverte. Résultat : **28 fournisseurs lus, ou
   0**, selon l'entrée rencontrée.
2. **Assignation d'état, pas deux regex.** Deux motifs (l'un pour l'identifiant,
   l'autre pour le libellé) matchent **toutes les chaînes nues** : le libellé
   ressortait égal à l'identifiant. On lit `id` **puis** `label` par
   `if courant["id"] is None: … else: …`, dans l'ordre où ils apparaissent.
3. **Dédupliquer les sous-entités par leur identifiant** : les zones de service
   imbriquées étaient comptées deux fois (`api_key_url=` en plus de `base_url=`).

### `<!--` fermé par `*/` — un panneau entier disparaît du DOM

Un commentaire HTML ouvert `<!--` et fermé par `*/` fait avaler au parseur **tout
ce qui suit** jusqu'au prochain `-->`. Le panneau `#studio-panneau-keys` était
**dans les octets servis** et **absent du DOM**.

Diagnostic, dans cet ordre :

1. **Comparer le FICHIER au DOM PARSÉ** : `grep` trouve `data-panneau="keys"` 2×,
   `querySelectorAll` n'en rend que 5. L'écart désigne la zone.
2. **Compter les délimiteurs de commentaire**, pas les balises :
   `s.count('<!--')` vs `s.count('-->')`. C'est le seul contrôle qui voit le
   défaut — un comptage de `<div>`/`</div>` équilibré ne dit **rien**.
3. Vérifier aussi **`-->` orphelin** et **double ouverture** en parcourant le
   fichier dans l'ordre.

### `display:none` en ligne sur une vue INTERNE (le piège v122, deuxième étage)

`#studio-form` (l'aiguillage form/progress/result du studio) porte un
`display:none` **en ligne**. Rallumer le **panneau** ne rallume pas la **vue
qu'il contient** : revenir sur « Génération » après un onglet de réglages donnait
un panneau **visible mais vide**, 39 champs inatteignables.

Règle : quand on rallume un conteneur, se demander **ce qui, à l'intérieur, garde
son propre état d'affichage**. Correctif ici : `studioOuvrirOnglet("generation")`
rappelle `studioShow("studio-form")`, **sauf si une des trois vues est déjà
allumée** — un rendu en cours ou un résultat affiché appartient à l'utilisateur.

Corollaire : **restaurer un état mémorisé à CHAQUE ouverture**, pas seulement au
chargement de la page. `studioOpen()` applique désormais l'onglet retenu : c'est
le seul point qui rallume le panneau **et** la vue interne.

### Trois pièges de banc, tous les trois rencontrés ici

1. **Un délai fixe mesure un état transitoire.** Le banc lisait la liste des
   fournisseurs après 1 600 ms et voyait `nb = 1` (l'option « — charger les
   réglages — »). Le service répondait correctement (200, 2 885 octets, 28
   fournisseurs) et **l'application était juste**. Le délai tombait **16 ms trop
   tôt** — les onglets précédents avaient laissé des chaînes de chargement en
   vol. **Attendre la CONDITION** (`waitForFunction` sur `options.length > 5`,
   sur « la vue est rallumée », sur « les zones ≥ 3 »), jamais un `waitForTimeout`
   devant du réseau.
2. **Une assertion peut affirmer le faux.** Le banc exigeait `/openai\.com/` dans
   la Base URL d'un fournisseur sans zone. **Le tiers ne stocke nulle part cette
   adresse** : son registre n'en porte que pour les fournisseurs **à zones**, et
   son `config.toml` la laisse vide. L'assertion vérifie maintenant ce qui compte :
   le champ est **libre** et **ne retient pas** l'adresse de la zone précédente.
   Inventer une adresse pour faire passer un test serait un formulaire décoratif.
3. **Un délai fixe après une bascule d'onglet.** Après `__studioOuvrirOnglet`
   suivi de `waitForTimeout(400)`, les champs étaient mesurés avant que leur vue
   soit rallumée. Même remède : attendre que la vue soit **effectivement visible**.

### Environnement : un service tiers ne survit pas à l'invocation

Le service (port 8080) et le relais sont tués à la fin de **chaque** invocation ;
tout `kill` sur un processus frère emporte l'autre. Motif fiable : **démarrer le
service, démarrer le relais et lancer le banc dans la MÊME invocation**, sans
jamais tuer le relais — on laisse l'invocation se terminer.

---

## v124 — un service VOISIN : le relancer, et ne pas crier au loup

### Le symptôme peut être la vérité

« À chaque ouverture j'ai *Service non détecté* » : **le bandeau disait vrai**.
Mesuré — MPT démarre en ~2 s, ouvre 8080, `/ping` → `"pong"`, 29 musiques.
`_mpt_probe` et `_boucle_locale()` étaient **justes** (vérifié : l'ouvreur ne
contient **aucun `ProxyHandler`**). Avant de « corriger » la détection, **prouver
que le service tourne** ; ici il ne tournait pas, parce qu'un service voisin n'est
relancé par rien. Le défaut réel était ailleurs : **un message unique pour deux
situations opposées**.

### Deux états à ne jamais confondre

Séparer, dans la réponse d'état, ce que la machine peut réellement faire :

| État | Signe | Ce que l'UI doit faire |
|---|---|---|
| installé, arrêté | dossier + `api.bat` présents | **relancer elle-même** |
| dossier absent | `installe:false` | l'expliquer, **ne proposer aucun bouton** |
| dossier présent, sans `api.bat` | `raison:"no-bat"` | l'expliquer, aucun bouton |

Un bouton qui ne peut pas aboutir est pire que pas de bouton. Concrètement :
`_mpt_installation()` rend `installe`/`api_bat`/`peut_lancer`/`raison`, et
`mpt_status()` porte ces clés **à chaque retour**, y compris service en marche —
une seule requête suffit alors à décider.

### `lance:true` n'est pas `running:true`

`mpt_lancer()` rend `{"ok":true,"lance":true}` **dès que le script est parti**,
avant que le port ne réponde. Un appelant qui juge sur le retour de la route
affiche « détecté » pour un service absent. **Sonder jusqu'à la CONDITION**,
jamais attendre un délai fixe.

Mesures à retenir : `main.py` lancé directement → **2 s** ; via `api.bat`
(`cmd /c` → python → imports) → **13,7 s**. La fenêtre d'attente doit couvrir le
chemin LENT (20 s ici), pas le rapide.

### Deux `api.bat` concurrents se disputent le port

L'ouverture automatique et un clic manuel peuvent se chevaucher. Une garde de
ré-entrée (drapeau sur la fonction) est nécessaire, et **une seule
implémentation** : le bouton rappelle le même chemin que l'ouverture.

### Pièges de banc rencontrés ici

- **`taskkill /IM python.exe` tue le banc lui-même** : le processus s'arrête et
  la sortie est **tronquée** (mesuré : coupée à la section 4). Tuer **le PID qui
  écoute** le port (`netstat -ano`), jamais par nom d'image.
- **`curl` honore `http_proxy` même pour `127.0.0.1`** → `502 upstream connect
  failed`, pris pour une réponse du service. Dans les sondes shell :
  **`curl --noproxy '*'`**. C'est le même piège que `_boucle_locale()` côté code.
- **Un banc doit partir de l'état qu'il prétend tester** : partir d'un service
  *vivant* pour vérifier la relance rend 2 échecs qui accusent l'application.
  Vérifier l'état de départ **dans le banc**, et échouer explicitement s'il est
  faux.

### Vérifier les routes d'un tiers dans SON routeur

`app/router.py` de MPT ne monte que `ping`, `video`, `llm`. Ses vraies routes
sont `/api/v1/musics` et `/api/v1/video_materials` : **il n'existe NI
`/api/v1/voices` NI `/api/v1/fonts`**. Les routes `/mpt/voices` et `/mpt/fonts`
du relais sont des lectures **locales**, pas des relais. Une assertion écrite
d'après l'intuition échouait ici alors que l'application était juste : **lire le
routeur**, ne pas déduire l'existence d'une route du nom de la ressource.

### La forme de la réponse n'est pas celle qu'on suppose (v125)

`GET /api/v1/musics` rend `{status, message, data:{files:[{name,size,file}]}}`.
Le client lisait `j.musics || j.data.musics` : **aucune des deux clés n'existe**,
donc la liste restait à ses deux entrées écrites en dur. Le défaut était
**silencieux** — pas d'erreur, juste 29 musiques inaccessibles. Règle : quand on
consomme la réponse d'un tiers, **lire la forme réelle** (ici `j.data.files`), et
accepter plusieurs formes plutôt que d'en supposer une.

### Un nom de champ inventé est ignoré SANS erreur

Pydantic **ignore** un champ inconnu au lieu de le refuser. Envoyer `bgm_name`
(qui n'existe pas dans `VideoParams`) ne produisait donc **aucune erreur** : la
vidéo sortait juste sans musique. Le contrat réel est un **couple** :

| Besoin | `bgm_type` | `bgm_file` |
|---|---|---|
| Pas de musique | `""` (chaîne vide, PAS `"none"`) | `""` |
| Aléatoire | `"random"` | `""` |
| Une musique précise | `"preset"` | `<nom du fichier>` |

Un **nom de fichier mis dans `bgm_type` est ignoré** (`get_bgm_file()` ne
reconnaît que `random`, `preset` et les fournisseurs externes) : la vidéo
sortirait sans musique, sans message. Corollaire du piège v122 : la bonne
question n'est pas « ce nom est-il accepté ? » mais **« ce nom est-il LU ? »**.

### Une assertion périmée peut encoder un ancien défaut

Le banc `_v120` affirmait `!('bgm_type' in payload)` — vrai du temps où le code
envoyait `bgm_name` (champ inexistant) *à la place* de `bgm_type`. Corriger le
code en **supprimant** `bgm_type` donnait un banc vert sur un code faux. Quand on
corrige un contrat, **relire les assertions qui le décrivent** : une assertion
peut décrire le bug et non l'attendu. Voir la skill `stale-test-triage`.

### Un float écrit comme une chaîne casse au premier usage

`_toml_valeur()` n'avait pas de branche `float` : `voice_volume` tombait dans la
branche chaîne et `voice_volume = "1.0"` était écrit **avec guillemets**. MPT
attend un nombre. Un type ajouté à une liste blanche doit avoir **sa branche de
sérialisation**, sinon la valeur part dans le mauvais type.

### La fenêtre d'attente doit être une CONDITION, pas un délai

Deux fois dans cette session un délai fixe a produit un faux échec : la liste des
musiques lue avant que la requête n'ait répondu, et le moteur enregistré écrasé
par la liste du service arrivée plus tard. Les bancs doivent attendre une
**condition** (`waitForFunction(() => …)`, ou une boucle sur l'état observé) et
non un délai (`waitForTimeout(n)`) : un délai fixe « marche ici » et casse
ailleurs **sans qu'aucun code n'ait bougé**.

### Un processus de fond n'appartient qu'à l'invocation qui l'a lancé (v126)

`nohup python proxy_server.py &`, `disown`, `run_in_background` : **toutes** ces
formes meurent à la fin de l'invocation. Symptôme trompeur — le relais répond au
**premier** appel dans l'invocation qui l'a lancé (données correctes, on croit
avoir vérifié), puis est introuvable à l'appel suivant (`HTTP 0`). On perd des
allers-retours à « redémarrer le relais » au lieu de conclure une fois pour toutes.

La réponse est `tools/run_benches.py [--mpt] [--port N] [--keep] banc…` : **une
seule invocation possède le relais**, le lance, attend qu'il réponde par
**condition**, exécute les bancs comme sous-processus, le referme. Un banc qui
dépend d'un serveur doit pouvoir se lancer **seul**, sinon il n'est pas
reproductible.

### Un banc doit partir de l'état qu'il prétend tester (v126)

`verify_service_lifecycle` (35/35) et `verify_studio_autostart` (18/18) exigent
MPT **ARRÊTÉ** — c'est leur précondition, écrite dedans. Les lancer avec `--mpt`
donne respectivement **32/35** et **15/18**, avec des échecs qui **accusent
l'application** : `le service MPT est demarre (prerequis)` et
`POST /mpt/start emis automatiquement -> 0 appel(s)`. Rien n'était cassé : j'avais
démarré le service qu'ils veulent trouver à l'arrêt. Avant d'incriminer un code,
**relire la précondition du banc**.

### Une sonde 404 n'est pas une erreur

`version.txt` est demandé **exprès** et le code se rabat sur `'dev'` quand le
statut n'est pas 200 (`xhr.status === 200 ? … : 'dev'`). Le 404 est le
fonctionnement **normal** en développement. Le laisser compter comme erreur JS
fait échouer le banc en permanence — et **un garde qui crie au loup finit
désactivé**. Filtrer ce bruit **précis** (`/version\.txt/`), jamais « toutes les
erreurs console ». Même leçon que le scan de secrets du `pre-commit`.

### Un champ hors du conteneur balayé n'est jamais enregistré

`studioReglagesPayload()` ne balaie que `#studio-modal [data-cle]`. Un champ
créé ailleurs — ou déplacé hors du modal par une restructuration — **existe dans
le DOM, se remplit, s'affiche**, et sa valeur **n'est jamais envoyée**, sans
erreur nulle part. Le banc doit donc vérifier l'**appartenance**
(`element.closest('#studio-modal')`), pas seulement l'existence de l'identifiant.

### Une note écrite au remplissage ne suit pas le choix

`studioRemplirSources()` écrivait la note « source payante » une seule fois, au
moment où la liste arrivait du service. L'utilisateur qui **bascule** ensuite sur
un générateur facturé n'avait **aucun avertissement** — précisément le moment où
il compte. Une note qui décrit un **choix** doit être branchée sur l'événement
`change`, avec un garde d'attache unique (`dataset.noteLiee`), pas recalculée au
seul chargement.

### Deux menus qui partagent une clé doivent partager une liste (v126)

`#stu-mat-source` (réglages) et `#studio-source` (génération) écrivent la même
clé `video_source`. Le premier a été étendu à 11 sources ; le second est resté
à 3 (`pexels`, `pixabay`, `local`) parce qu'il est écrit **en dur dans le HTML**
et n'est rempli par personne. Conséquence : 8 sources configurables mais
**jamais utilisables**, et surtout une valeur enregistrée (`metaso_minimax`)
qui, ne trouvant aucune option, fait retomber le `<select>` sur la première —
**Pexels, sans rien dire**. On croit générer chez le fournisseur choisi.

Deux éléments qui écrivent la même clé doivent être **remplis par le même
appel**, jamais l'un dynamiquement et l'autre en dur. Le banc doit comparer les
**deux listes** (`menuGen.ids.join() === menuIds.join()`), pas seulement
vérifier que le premier est complet. Et « la valeur se pose-t-elle ? » se
mesure : affecter une valeur et relire `select.value`.

### Un banc qui déclenche l'action réelle peut coûter de l'argent (v126)

Le banc de la confirmation de dépense clique sur « GÉNÉRER LA VIDÉO ». Sans
précaution, **chaque exécution lancerait une génération facturée** pour de bon
chez le fournisseur. On coupe le réseau avant de cliquer :

```js
await page.route("**/mpt/submit*", r => r.fulfill({ status: 200,
  contentType: "application/json",
  body: JSON.stringify({ ok: true, data: { task_id: "banc-fausse-tache" } }) }));
```

Règle générale : un banc qui exerce un bouton **irréversible ou payant** doit
intercepter l'appel sortant. Un test qui coûte de l'argent finit par être
retiré — donc par ne plus rien protéger.

### Un prix inconnu ne s'affiche pas : on montre le calcul

Ni l'app ni le service ne connaissent le tarif du fournisseur au moment de
l'envoi. Afficher un montant serait **inventer**. On affiche donc les
**grandeurs** (vidéos × plans × durée) et la **formule**, que l'utilisateur
peut vérifier, et on dit que le montant exact n'est connu qu'après coup.
Un total sans formule ne se vérifie pas et inspire une confiance qu'on n'a pas.

### Demander confirmation seulement quand il y a quelque chose à perdre

La confirmation de dépense ne s'affiche **que** si la source est dans le groupe
`ia`. La réclamer aussi pour Pexels la rendrait routine, et une confirmation
lus par réflexe ne protège plus rien le jour où elle compte. Le banc vérifie
les **deux** sens : elle apparaît pour une source payante, elle n'apparaît
**pas** pour une gratuite.
