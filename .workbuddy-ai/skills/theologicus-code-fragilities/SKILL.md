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
  `theologicus_wizard_skipped='1'` **ne suffit PAS** : l'assistant s'affiche aussi
  tant qu'aucune identité d'IA n'est configurée. Et pour une CAPTURE, écarter les
  deux surcouches explicitement — sinon l'image montre la porte, pas l'app.
- **Une capture « avant/après » doit être vérifiée DIFFÉRENTE.** Deux images
  committées comme preuve d'un correctif avaient **le même sha1** (3 924 octets,
  rectangle uni) : la cible était codée en dur dans le banc, et l'app était
  verrouillée. Comparer les empreintes avant de présenter une preuve visuelle ;
  deux empreintes égales = la capture a manqué sa cible, pas « aucun effet ».
  Sur un panneau translaté/animé, capturer la **page entière** :
  `elementHandle.screenshot()` et `page.screenshot({clip})` se trompent tous deux
  de cible.
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

### Une route ajoutée dans do_POST n'existe pas en GET (v126)

`/proxy/` était câblée dans la seule chaîne `do_POST`. Un `GET /proxy/…`
n'atteignait donc jamais le relais : la distribution de fichiers répondait
**404 avant** tout appel au fournisseur. Le symptôme est trompeur — la
vérification de clé (un `GET /models`) échouait et affichait « clé invalide »
pour une clé parfaite.

Et forcer la méthode (`conn.request('POST', …)`) donnait un **405** sur
tout ce qui n'est pas POST. Une route de relais doit être branchée dans
**chaque** méthode qu'elle sert, et transmettre `self.command`.

### Le relais est mono-thread : il ne peut pas se relayer lui-même

Viser `/proxy/http://127.0.0.1:8765/…` depuis le relais lui-même donne un
**502** systématique : il ne peut pas se servir une requête pendant qu'il en
traite une. Un banc qui teste le proxy de cette façon accuse le proxy d'une
panne qui n'existe pas. Utiliser un **serveur témoin sur un autre port** qui
renvoie la méthode reçue (`METHODE=GET`) : déterministe et sans ambiguïté.

### Coller une page autonome dans THEOLOGICUS repeint toute l'app

Un document tiers porte presque toujours `body { … }`, `:root { … }` et
`* { … }`. Injecté tel quel, **il redéfinit l'application entière**, et ses
fonctions globales (`escapeHtml`, `toast`…) entrent en collision avec les
nôtres — ici 104 fonctions, dont deux déjà présentes.

La réponse est l'**iframe de même origine** : elle isole les deux mondes
(CSS et JS), partage le stockage local, et autorise les appels `/proxy/…`.
Une origine différente rendrait les deux impossibles.

### Un fichier compagnon oublié donne un iframe VIDE, sans erreur

THEOLOGICUS n'est plus un seul fichier : le modal AI VIDEO charge
`ai-video.html`. Oublier de le propager dans `mobile/www`, `dist` et
`_inst_v102` donne un cadre vide et muet — invisible sur la machine de
développement. `tools/sync_html.py` propage donc aussi les `COMPAGNONS`.

### Le repli `srcdoc` d'un iframe doit se contrôler AUSSI à l'ouverture du modal, pas seulement sur `load`

Piège vérifié (v126f) : un iframe dont le `src` pointe sur une route qui
renvoie 404 charge sa page d'erreur TRÈS tôt. Si le `load` listener est posé
APRÈS un `await` (le binding vit dans une fonction `async`), le chargement
initial a déjà eu lieu avant que le listener existe → l'évènement `load` est
manqué, le repli (`srcdoc` depuis un `#b64` embarqué) ne se déclenche jamais,
et le message d'erreur reste `hidden`. Résultat : cadre vide muet dans l'exe
packagé, alors que le `.bat` (qui a le fichier séparé) marche.

Règle : le test de repli doit être une fonction idempotente appelée à DEUX
endroits — (1) sur `load` (l'iframe finit de charger alors que le modal est
déjà ouvert) et (2) dans le handler d'ouverture du modal (contrôle immédiat,
car l'échec initial est déjà consommé). Juger sur le TITRE du document
(`/AI VIDEO/i`), pas sur `body.children.length` (la 404 a plusieurs enfants).

### Un champ « input » sans listener `input`/`change` ne persiste JAMAIS — et le statut reste figé

Piège vérifié (v126g) : un `<input>` dont aucun handler n'écrit dans le
stockage (ici `localStorage`) garde sa valeur dans le DOM, mais toute
fonction qui lit depuis le storage renvoie du vide. Conséquence : « Aucune
clé » même après saisie, valeur perdue au reload, et le statut UI ne se
rafraîchit que lorsque l'utilisateur déclenche la vérification.

Règle : tout input qui alimente une fonction persistante doit avoir un
listener `input` qui écrit à chaque frappe. Les handlers de vérification
doivent lire la valeur COURANTE de l'input (source de vérité) et la
persister — paré contre les races (paste → clic Vérifier avant que
l'event `input` n'ait été délivré) et contre les écritures échouées
(quota, mode privé). Bonus : appeler la fonction de mise-à-jour du
statut dans le listener `input` rend le statut live, sans attendre le
clic Vérifier.

### Un relais sans proxy système échoue là où le navigateur sort — « Erreur réseau » à tort

Piège vérifié (v126h) : un relais local qui fait l'amont avec `http.client`
(ou tout client sans `env http_proxy`) ne rejoint PAS l'API cible DERRIÈRE
UN PROXY D'ENTREPRISE, alors que le navigateur (WebView2) OUI, car il lit la
config réseau de l'OS. Le fetch via le relais est alors rejeté (ou renvoie
502/404), et le code affiche un « Erreur réseau » générique pour une clé
pourtant valide. Ce n'est ni un bug d'iframe (testé : `srcdoc`/`about:srcdoc`
résout une URL relative `/proxy/...` comme un `http://` normal), ni un bug du
relais→API (testé : `curl /proxy/...` renvoie le vrai 401 de l'API).

Règles :
1. **Un fetch peut être rejeté (exception) — pas seulement rendre un statut.**
   Séparer « le relais est mort » (rejet, 502, 404 HTML d'un relais obsolète)
   de « l'API répond » (401, 200...). Ne jamais aplatir en un seul message
   opaque « Erreur réseau » : un statut HTTP réel (401) doit rester lisible.
2. **Repli sur un appel DIRECT** quand le relais est mort : le navigateur
   gère proxy + certificats. Possible si l'API renvoie `Access-Control-
   Allow-Origin: *` (constaté sur Agnes/Mistral `/models`). Garder `_VIA_RELAIS`
   pour ne tenter le direct que hors `file://` (en `file://` l'URL est déjà
   directe).
3. **Ne jamais `res.json()` aveuglément** : un 404 HTML (relais obsolète) le
   fait lever → « Erreur réseau » à tort. Lire `res.text()`, ne parser que si
   `Content-Type` est JSON (ou le texte débute par `{`).
4. **`res.text()` consomme le corps** : lire d'abord le texte, puis parser, et
   traiter `data` (jamais `res.json()` après coup).

NOTA banc (headless) : `frameLocator().evaluate(b=>b.click())` plutôt que
`.click()` Playwright (avalé par hit-test du HUD) ; ouvrir le modal via
`evaluate` et poser `localStorage['theologicus_wizard_skipped']='1'` en
`addInitScript` pour court-circuiter l'assistant.

### Une réponse « modèles » non standard ne doit pas devenir zéro en silence

Piège vérifié (v126i) : une réponse HTTP 200 peut être JSON mais enveloppée
autrement (`data`, `models`, `items`, `result`, `result.data`). Si le code
ne connaît que `data`, la clé paraît acceptée mais la grille reste vide.
Pire : une page HTML d'un relais obsolète peut être traitée comme une liste
vide au lieu de déclencher le repli direct.

Règle : normaliser explicitement les enveloppes en distinguant `[]` (vraie
liste vide) de `null` (réponse illisible). Pour une réponse 200 illisible du
relais, tenter l'URL directe avant d'afficher un résultat vide. Toujours
rendre la grille et afficher « aucun modèle renvoyé par l'API » si la liste
est réellement vide ; ne pas coder en dur des modèles qui pourraient ne pas
être autorisés par la clé.

### Un 429 doit respecter Retry-After, pas une durée codée en dur

Piège vérifié (v126j) : `apiFetch` attendait 15/30/45 secondes quelle que
soit la valeur envoyée par le fournisseur, puis lançait une requête immédiate
après le dernier essai. La génération vidéo affichait donc `WARN 429 — 15s`,
message technique qui ne disait pas que la reprise était automatique.

Règle : lire `Retry-After` comme secondes ou comme date HTTP, attendre ce
délai, afficher « Limite API — reprise automatique », puis retenter. Au
dernier essai, retourner la dernière réponse 429 : ne pas envoyer une
requête supplémentaire sans délai. Tester au minimum 429 + Retry-After court
→ nouvelle tentative → 200, ainsi que les régressions iframe/UI.

### Un relais HTTP doit préserver l'encodage avant `response.json()`

Piège vérifié (v126k) : `http.client` lit des octets bruts. Si le fournisseur
répond en gzip/br et que le relais ne demande pas `Accept-Encoding: identity`
ou ne retransmet pas `Content-Encoding`, le navigateur reçoit des octets
compressés sans information de décodage. `response.json()` lève alors
`Unexpected token ... is not valid JSON`, souvent affiché dans un commentaire
AI comme si le modèle avait mal répondu.

Règle : demander `Accept-Encoding: identity` côté amont ; si l'amont compresse
malgré tout, retransmettre `Content-Encoding` côté réponse. Tester avec un
serveur amont qui renvoie volontairement du gzip et vérifier que le JSON est
encore décodable via le relais. Si le relais est embarqué par PyInstaller,
reconstruire l'exe après le correctif Python : modifier le HTML seul ne suffit
pas.

### Un préfixeur de route (/proxy/) doit être idempotent ou appelé à UN endroit

Piège vérifié (v126l) : `callLLM` préfixait l'endpoint via `apiEndpoint`, puis
`fetchLLMResponse(url)` repassait la même URL dans `apiEndpoint` → «
/proxy//proxy/https://… ». Le relais construisait une cible sans hôte et tout
appel non-streaming (commentaires de sélection, quiz…) échouait en mode servi,
alors que `file://` (apiEndpoint sans effet) et le chat streaming
(`callLLMStream`, un seul préfixe) passaient — le succès du chat masquait le
bug depuis des semaines. Règle : une fonction de routage retourne tel reloc ce
qui est déjà préfixé, et le préfixe n'est appliqué qu'à un seul endroit de la
chaîne d'appel. Côté serveur, stripper les préfixes répétés en défense.
Banc : servir la page, mocker `/proxy/`, journaliser les URLs reçues — le
double préfixe saute aux yeux.

### Un 429 fournisseur peut être une VRAIE limite de compte, pas un bug client

Piège vérifié (v126l) : « Limite API — 429 » dans l'app alors que le même
module en `file://` « marchait » a fait chercher une différence de relais ou
d'en-têtes. Mesure directe : le compte gratuit Agnes n'accepte qu'UNE
génération vidéo à la fois (2ᵉ POST 3 s après le 1ᵉʳ → 429 ; POST de nouveau
200 ~7 min plus tard). Le standalone marchait parce qu'il tournait seul avec
la même clé. Règle : avant d'incriminer le code, reproduire par appels réseau
directs (clé incluse — IndexedDB/localStorage du navigateur) et mesurer la
limite réelle. Côté app : lance de relance plus longue que la fenêtre
d'indisponibilité mesurée, message du fournisseur journalisé, et repli sur un
autre fournisseur dont la clé est valide (Mistral quota épuisé → Agnes chat).

## v126m — cadres d'annotation : l'offset prime sur le texte, et les bancs mentent

### Les lignes `[DIAG]` sont MASQUÉES par défaut — un banc qui les attend ne prouve rien

Le script `v18-quiet-console` (tout en haut du HTML, ligne ~5) enveloppe
`console.log/info/debug` et **jette** tout message qui matche `[DIAG]`, `[MIG]`,
`[SECTION]`, `[TTS]`, sauf si `localStorage.theo_debug === '1'` ou `?debug=1`
dans l'URL. Mesuré : sans ça, `window.__diagLog` reste bloqué à **2 entrées**
(les deux premiers `console.log` du document) et **aucune** ligne
`applyHighlights:` n'apparaît — une assertion « la corruption a pris effet »
devient insatisfiable sans que rien ne soit cassé. **Tout banc qui veut
observer `[DIAG]` doit poser `localStorage.setItem('theo_debug','1')` dans son
`addInitScript`.** Corollaire : `page.on('console')` ne remonte rien non plus
pour ces lignes.

### L'app RÉÉCRIT son état à la fermeture de page : corrompre son stockage de l'extérieur ne marche pas

`flushChatNow()` (sur `pagehide`/`beforeunload`) sérialise `state.messages` dans
`localStorage['theologicus_chat_<id>']`, et l'autosave fait de même dans
IndexedDB. Un banc qui écrit un `start/end` corrompu dans IndexedDB **et**
localStorage puis recharge voit la corruption **annulée** : l'état en mémoire
(l'ancien) est réécrit par-dessus au déchargement. Mesure : offset relu **159**,
et `indexOf("canonique")` dans l'espace des nœuds texte **159** — identiques,
donc la valeur corrompue n'a jamais été relue. Le banc passait **à tort**.
Règle : pour tester une dérive d'état, **construire l'anomalie par le chemin
réel** (sélection souris → bulle → annotation), jamais en bricolant le stockage.

### `loadChat` garde la copie la PLUS RÉCENTE de IndexedDB / localStorage

`loadChat` charge les deux et retient celle dont `updated` est le plus grand
(`if (lsChat && (!chat || lsChat.updated > chat.updated)) chat = lsChat`). Un
banc qui « graine » une conversation doit donc écrire la **même** valeur des
deux côtés, ou **seulement** dans `localStorage` en laissant IndexedDB vide (le
repli `fallbackId` prend alors le relais). Écrire un seul côté avec un `updated`
plus petit revient à ne rien écrire.

### Le RACINE d'un banc dépend de sa PROFONDEUR — un 404 silencieux ressemble à un blocage

`path.resolve(__dirname, "..", "..", "..")` n'est la racine du dépôt que pour un
banc posé dans `.workbuddy-ai/artifacts/_v126/`. Déplacé d'un cran (dans
`_v126/_align_bench/`), il pointe sur `.workbuddy-ai/` : le serveur répond
**404** sur `THEOLOGICUS.html`, la page fait **154 octets**,
`window.renderMessages` n'existe jamais et le banc meurt sur un
`waitForFunction` à 90 s — lu comme « l'app ne démarre pas ». Contrôle en une
ligne : `document.documentElement.outerHTML.length` (≈ 1,9 M pour la vraie page,
~150 pour un 404).

### Annotation « Add to chat » : `occ` est ABSENT, donc l'offset positionnel gagne

`window._atcSel` (créé par `detectSelectionAndShow`) porte
`{text, range, rect, msgTs, hlId}` — **pas de `occ`**. Or `applyHighlights`
essaie `wrapNth(text, occ)` **puis** `wrapByOffset(start, end)` **puis**
`wrapOnce(text)`. Sans `occ`, c'est donc l'**offset** qui décide, et il a la
priorité sur la recherche par texte. Dès que le rendu diffère de celui capturé à
la sélection (markdown réécrit, section retirée, réponse prolongée), l'offset
désigne une AUTRE portion de texte : **le cadre se pose sur un autre mot**, et
il y restait (le span déjà présent avec le bon `data-hl-id` était réutilisé sans
vérifier son contenu). Correctif : après chaque pose, comparer le texte
**réellement enroulé** (concaténation des spans d'un même id, espace
`normalizeMatch`) au texte annoté ; si ça diffère, dé-wraper et laisser la
recherche par texte reposer. **Le texte annoté est la seule vérité** : c'est ce
que l'utilisateur a sélectionné et voit. Banc
`verify_annotations_offset_drift.js` : 7/7 avec le correctif ; contrôle négatif
sur la révision d'avant **6/7** — le cadre est sur `docétisme` au lieu de
`marcionisme` (`[DIAG] … byOffset=1 realigned=0`). Un banc sans contrôle négatif
qui échoue n'est pas une preuve.

### Le HTML du dépôt porte un TAMPON, et l'app installée sert le fichier à côté de l'exe

`THEOLOGICUS.html` du dépôt contient `var STAMPED = '__THEO_VERSION__'` ; c'est
`tools/stamp_version.py <dossier> <version>` (appelé par `build_installer.bat`)
qui remplace le tampon et écrit `version.txt`. Donc : copier le HTML du dépôt tel
quel dans une app installée **casse l'affichage de version** — il faut
tamponner. Et `app.py` fait `base = app_dir()` (dossier de l'**exe**) puis
`os.chdir(base)` : l'app servie lit `THEOLOGICUS.html` **à côté de l'exe**. Un
correctif purement HTML/JS s'applique donc en remplaçant **ce seul fichier**,
sans recompilation PyInstaller/Inno — à condition de viser la bonne copie. La
bonne copie est la **cible du raccourci** : la lire avec `pywin32`
(`WScript.Shell.CreateShortcut(...).TargetPath`), pas la deviner. Ici le
raccourci du Bureau et celui du menu Démarrer pointaient tous deux vers
`…\_v123\_pub\installe\THEOLOGICUS.exe`, alors que
`%LOCALAPPDATA%\Programs\THEOLOGICUS\` (v2.0.94, 20/09) n'était **plus lancé par
personne** — c'est pourtant là que j'ai d'abord cherché.

### Lire le tampon de version : il n'est PAS en tête de fichier

Piège mesuré en écrivant `maj_installe.py`. Le `var STAMPED = '…'` de
`THEOLOGICUS.html` tombe vers la **ligne 33000** d'un fichier de 1,8 Mo / 35 678
lignes (le script qui l'affiche est tout en bas, près de `cb(STAMPED)`). Un
`f.read(200000)` pour « lire juste l'en-tête » renvoie donc **toujours**
`inconnue` — et le script a silencieusement nommé sa sauvegarde
`THEOLOGICUS.inconnue.html` avant que je le remarque. Lire le fichier entier,
puis `re.search(r"STAMPED\s*=\s*'([^']*)'", txt)`.
Corollaire : ne pas déduire la version installée du `version.txt` à côté (il
peut être en avance sur le HTML si un script a écrit l'un sans l'autre) — lire
le tampon **dans le HTML**, et vérifier la cible en comparant les deux fichiers
**hors tampon** (`re.sub(r"STAMPED = '[^']*'", "STAMPED = 'X'", t)` des deux
côtés) : ici 1 867 336 vs 1 867 345 octets, soit exactement les 9 octets de
`2.0.206` contre `__THEO_VERSION__`, tout le reste identique.

## v127 — figures : remplir l'intérieur et faire tourner les flèches

Les figures sont des boîtes flottantes `.atc-figbox` construites par
`buildFigEl(f)` ; l'artwork est un `<svg>` redessiné par `figSvgInner(f)` et
rafraîchi par `refreshFigVisual(fb, f)` ; la barre d'outils est `showFigTools`.
L'objet figure porte maintenant `{id,x,y,w,h,shape,color,text,svg,weight,fill,rot}`.
La palette vient de `window.__FORMES_PALETTE` (catégorie `'Blocs Flèches'`, 8
items). Quatre contraintes, chacune vérifiée :

- **Ne remplir QUE les formes FERMÉES.** `applyFigPaint(svgInner, f)` réécrit
  chaque balise pour lui poser un `fill` explicite : la couleur demandée sur les
  formes fermées, `none` partout ailleurs. Sont fermées `polygon`, `rect`,
  `circle`, `ellipse`, et un `path` dont le `d` se termine par `Z`. Un `path`
  ouvert (flèche courbée) doit rester en contour : **le navigateur referme
  implicitement un chemin qu'on remplit**, donc le remplir peint une **tache**
  au lieu de la flèche. Le banc asserte les deux cas dans la MÊME figure :
  `["path:none","polygon:#ffd54f"]`.
- **Faire tourner l'ARTWORK, pas la boîte.** `applyFigRot(svg, f)` pose
  `transform: rotate(Ndeg)` sur le `<svg>` (avec `transformOrigin: 50% 50%`),
  jamais sur `.atc-figbox` : la boîte garde son cadre, ses poignées et son texte
  droits, et `getBoundingClientRect` reste exploitable. Le banc vérifie que
  `svg.style.transform === "rotate(45deg)"` **et** `fb.style.transform === ""`.
- **`preserveAspectRatio` doit suivre la rotation.** Les flèches sont dessinées
  dans un `viewBox 0 0 24 24` étiré à la boîte (`preserveAspectRatio="none"`),
  ce qui est voulu pour une flèche longue et fine. Mais une fois tournée de 90°,
  l'étirement s'applique toujours **selon les axes d'origine** : la flèche
  devient **courte et énorme**. D'où `figAspect(f)` : `"xMidYMid meet"` dès que
  `rot != 0`, `"none"` sinon. Le banc asserte le passage
  (`aspect="none"` → `"xMidYMid meet"`).
- **Les 4 formes BASIC se remplissent par le FOND, pas par le SVG.**
  `Rectangle`, `Carré`, `Rond`, `Losange` sont dessinées par la boîte
  elle-même : leur couleur de remplissage va sur `el.style.background`
  (`applyFigBg`), et elles sont **exclues de la rotation** (les tourner
  n'apporte rien). `const BASIC = ['Rectangle','Carré','Rond','Losange']`.

Côté interface : la barre `.fig-tools` peut dépasser la largeur du conteneur
avec les nouveaux contrôles — d'où `flex-wrap:wrap; max-width:min(94vw,370px)` et
un repositionnement calculé **après** coup d'après `t.offsetHeight` réel
(`top = fb.offsetTop - hauteur - 8`), sinon la barre se pose sur la figure.
Un nuancier `.im-swatch.none` hachuré
(`repeating-linear-gradient(45deg,…)`) + un bouton `∅` remettent en contour
seul ; le réglage est mémorisé dans `window._atcFigFill` / `window._atcFigRot`
pour la figure suivante, exactement comme la couleur et le poids.
Banc `verify_figures_fill_rotate.js` : **27/27**, par le chemin réel (clic droit
sur le message → `#atc-insert-menu` → `.im-ico[title=…]` → `.fig-tools`), avec
persistance vérifiée après `renderMessages(true)`, relecture du
`localStorage['theologicus_chat_<id>']` et `page.reload()`.

## v128 — fluidité : points chauds de CE monolithe

La méthode de mesure (CDP `Performance`, `LayerTree`, `Tracing`, comptage de
`scrollIntoView`) est dans le skill `web-ui-audit-measure`, section
« Mesurer la FLUIDITÉ ». Ici, seulement les endroits de THEOLOGICUS qui
chauffent, avec le chiffre mesuré avant/après.

- **`.message` portait `will-change: transform, opacity` et une animation
  d'entrée en `both`.** Sur 40 messages : **69 calques composés**, dont 47
  « will-change: transform » et 44 « active accelerated transform animation ».
  Après : **28 calques**, 9 et 7. L'animation est devenue opt-in
  (`.message.msg-enter`) et n'est posée que sur le dernier message par
  `renderMessages`, ainsi que sur celui de `_createStreamDiv`. Si tu ajoutes
  un endroit qui crée un `.message`, ajoute `msg-enter` **seulement** s'il
  s'agit d'un message qui entre.
- **`updateMinimapHighlight` appelait `scrollIntoView` à chaque événement de
  défilement** — mesuré 119 pour 120 images — et `mmEntries` n'était jamais
  vidé, donc le coût continuait minimap fermée. Trois gardes désormais : la
  fonction sort si `!minimap.classList.contains('visible')`, elle sort si
  l'entrée active n'a pas changé, et `window._rebuildMinimap` (appelé par
  `renderMessages`) ne reconstruit que si la minimap est visible, sinon il vide
  `mmEntries`. L'entrée active est gardée visible par
  `minimap.scrollTop += …` et **non** par `scrollIntoView`. Attention :
  `showMinimap()` doit poser la classe `visible` **avant** de construire.
- **Le gestionnaire de défilement de `#chat-container`** était enregistré en
  anonyme, sans `passive`, et refaisait `updateThumb` + `showScrollbar` +
  `updateMinimapHighlight` à chaque événement. Il est maintenant regroupé en un
  `requestAnimationFrame` (`syncScroll`). `updateThumb` ne réécrit la hauteur
  et la position du pouce que si la valeur arrondie change.
- **`repositionBubble`** est branché en phase **capture sur `window`** : il se
  déclenche donc pour le défilement de n'importe quel conteneur. Il sort
  immédiatement si la bulle n'est pas affichée
  (`!b.style.display || b.style.display === 'none'`) et il est étranglé par
  `repositionBubbleThrottled`. Sans la garde, trois mises en page forcées par
  image, bulle fermée comprise.
- **`loadChat` rendait deux fois** en cas de migration d'offsets. Les offsets
  migrés vivent dans `state.messages` ; `__applyMarks` / `__applyHighlights` /
  `__applyShapes` suffisent à les reporter. Le second `renderMessages()` ne
  reste qu'en filet si ces applicateurs manquent.
- **`loadArchiveChat` re-rendait toute la liste** des conversations, donc
  relisait **toutes** les conversations dans IndexedDB (messages compris) et
  reconstruisait le HTML — pour un seul changement visible. Il déplace
  maintenant la classe `active-chat` (les items portent `data-chat-id`). Le
  rendu complet est conservé **si `archivesSearchQuery` est actif**, car les
  extraits surlignés doivent être recalculés. Sûr même si la liste n'a jamais
  été rendue : passer sur la vue `archives` appelle `renderArchives()`, qui
  recalcule `isActive` depuis `state.chatId`.
- **`body { scroll-behavior: smooth }`** ne concernait que le document
  (propriété non héritée) mais donnait leur comportement aux `scrollIntoView()`
  sans `behavior`. Repassé en `auto` ; les défilements voulus doux passent
  `{behavior:'smooth'}` explicitement.
- **Non confirmé, ne pas « corriger »** : les trois `.floating-circle`
  (`filter: blur(80px)`, animés 20 s) sous la coque qui porte
  `backdrop-filter: blur(22px)`. Hypothèse d'un re-flou permanent **démentie
  par la mesure** : 1 % du temps au repos, 42 peintures pour 2 s. Laissés tels
  quels.

---

## v129 — préréglages de performance et fiche GPU

### Le GPU n'est pas à activer : pywebview ne le désactive pas

Vérifié à la lecture de `webview/platforms/edgechromium.py` (dépôt **et** copie
installée) : le seul argument Chromium transmis est
`--disable-features=ElasticOverscroll`. Aucun `--disable-gpu`, aucun
`--disable-gpu-compositing`. Une application WebView2 rend donc **déjà** sur le
GPU dès que le pilote le permet. Avant de chercher un correctif côté
application, le lire dans la page :

```js
var gl = c.getContext('webgl2') || c.getContext('webgl');
var d = gl.getExtension('WEBGL_debug_renderer_info');
gl.getParameter(d.UNMASKED_RENDERER_WEBGL)
// « ANGLE (AMD, AMD Radeon RX 6600 (0x000073FF) Direct3D11 vs_5_0 ps_5_0, D3D11) »
```

`SwiftShader` / `Software` / `llvmpipe` = repli logiciel ; `ANGLE` / `Direct3D` /
un nom de constructeur = matériel. Sur ce poste : **matériel**.

Version du moteur WebView2, au registre :
`HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}`
→ valeur `pv` (lu par `_version_webview2()` dans `app.py`).

### Ajouter des drapeaux Chromium : il faut intercepter une AFFECTATION

pywebview écrit `props.AdditionalBrowserArguments = '…'` — une affectation. La
variable d'environnement documentée par Microsoft
(`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`) est donc **écrasée et sans effet**.
La seule voie propre est de sous-classer `CoreWebView2CreationProperties` et
d'**ajouter** dans `__setattr__` (voir `activer_drapeaux_gpu()` dans `app.py`).
Deux pièges, tous deux trouvés par test :

- un second appel **empile** les sous-classes : les drapeaux du premier appel
  restent actifs et la nouvelle liste n'a plus d'effet. Poser un marqueur
  (`_theo_gpu`) et mettre à jour la liste portée par la classe existante ;
- désactiver (`THEOLOGICUS_GPU=0`) ne **retire** rien si le patch a déjà été
  posé dans le même processus : conserver la classe d'origine (`_theo_base`) et
  la restaurer.

À appeler **avant** `create_window` : pywebview lit les propriétés au moment où
il construit le contrôle.

### Les interrupteurs v35/v39 se reposent depuis un intervalle

`v35-reduce-fx-js` et `v39-mobile-fixes` injectent leurs commandes **depuis un
`setInterval`**. Retirer les commandes brutes une seule fois perd la course dès
que la v39 ajoute son bouton après nous : deux étiquettes « Performance » et
deux commandes pour un même réglage (constaté par banc). **Le retrait doit être
rejoué à chaque passage du monteur.**

### Un objet vide est VRAI en JavaScript

`var p = etat.python || {}` puis `p ? … : 'hors application'` annonçait
« version inconnue » au lieu de « hors application Windows » : `{}` est vrai.
Tester `=== null` explicitement. Et distinguer trois cas, pas deux : pas de
pont du tout (navigateur), pont présent mais **méthode absente** (exe antérieur
— « application à mettre à jour »), méthode présente. Annoncer « aucun
drapeau » quand on ne SAIT pas est faux.

### Une interface qui interroge Python doit tolérer l'exe antérieur

`window.pywebview.api.renderer_info()` n'existe que depuis la v129. L'appel se
fait donc en testant `typeof api.renderer_info === 'function'` **avant**
d'appeler, et la fiche dit « application à mettre à jour ». Une méthode js_api
ajoutée côté Python n'existe pas dans l'exe déjà installé — le HTML doit être
écrit pour les deux.

### Ne pas écrire dans le DOM quatre fois par seconde

Un monteur qui boucle toutes les 250 ms pour attendre un hôte créé par un autre
script doit **ralentir** une fois monté : passe rapide au démarrage, puis veille
lente (ici 500 ms, et seulement le retrait des commandes brutes). Réécrire du
texte 4 fois par seconde en permanence est absurde dans une version consacrée à
la fluidité.

### Semer une conversation dans un banc : la forme compte

- La conversation stockée n'est **pas** un tableau de messages mais un objet
  `{id, model, messages, title, updated, fav}`. Semer un tableau nu ne lève
  **rien** et ne dessine **rien** : 0 message, aucune erreur. Deux tentatives
  perdues là-dessus.
- `loadChat(id)` ne dessine rien depuis un semis `localStorage` ; c'est
  **`loadArchiveChat(id, -1)`** qui rend la conversation.
- Voir aussi v126m : `loadChat` garde la copie la plus récente d'IndexedDB.

### Un jeton de thème emprunté n'est pas une couleur

Insérer un bloc dans un conteneur inconnu et lui donner
`color: var(--text-primary)` ne garantit rien : **le jeton dépend du thème, le
fond dépend du conteneur, et les deux ne sont pas coordonnés.**

Cas mesuré (v129). Le thème `glass` (celui de l'app) redéfinit
`--text-primary: #eaf4ff` (clair) mais **ne définit pas `--bg-card`** ; or
`#v6-more-menu` porte `background: var(--bg-card)` et retombe donc sur le
`#ffffff` de `:root`. Résultat : texte clair sur fond blanc, contraste
**1,65:1**, libellés invisibles — et **aucune** assertion du banc ne bronchait.
Les `.hud-btn` du menu souffrent du même défaut (`--text-secondary` = `#b7ccdf`
sur blanc) : c'est un défaut préexistant du thème, à signaler plutôt qu'à
corriger au passage.

Règle : **un bloc inséré porte sa propre surface**, sombre, et n'emprunte plus
rien — ici `background: var(--popup-bg, rgba(10,21,36,.96))` avec
`color: var(--text-bright, #eaf4ff)`. Mesuré après correction : 16,5:1 dans le
menu, 18,3:1 dans le panneau, dans les deux hôtes.

Et le corollaire de méthode : **vérifier la lisibilité par une mesure**, jamais
à l'œil sur une capture. Le banc remonte les ancêtres jusqu'à un fond opaque et
exige un rapport de contraste ≥ 3:1 :

```js
const fondEffectif = (el) => {
  let n = el;
  while (n && n !== document.documentElement) {
    const bg = getComputedStyle(n).backgroundColor;
    const a = bg.match(/[\d.]+/g);
    if (a && (a.length < 4 || parseFloat(a[3]) > 0.5)) return bg;
    n = n.parentElement;
  }
  return "rgb(255,255,255)";
};
```

### Un contrôle négatif doit rendre une LISTE, pas une exception

Si le banc attend un objet global que la copie d'avant ne définit pas
(`window.__V129`), `waitForFunction` et `page.evaluate` lèvent et le contrôle
négatif **n'affiche aucun total** — on ne sait pas combien d'assertions ont
échoué. Envelopper ces attentes dans un `try/catch` et tester
`if (window.__X)` avant d'appeler. Ici : 48/48 sur le dépôt contre 9/48 sur la
copie, au lieu d'une trace de pile.

## Lire ce que contient VRAIMENT un exe PyInstaller (v129)

**Un scan binaire ne prouve rien.** Chercher des chaînes dans
`THEOLOGICUS.exe` (`grep`, `strings`, lecture d'octets) donne des comptes à
**0** pour du code pourtant présent : PyInstaller **compresse** le script
principal et le `PYZ`. Mesuré le 28/09 : `ElasticOverscroll`,
`AdditionalBrowserArguments`, `CoreWebView2CreationProperties` tous à 0 alors
que le code y était. Cette absence a produit une conclusion fausse
(« il faut reconstruire l'exe ») et a failli faire refaire une compilation
inutile — avec un installeur non signé par-dessus l'installation qui marche.

**La bonne méthode : ouvrir l'archive.**

```python
from PyInstaller.archive.readers import CArchiveReader
import marshal

arc = CArchiveReader(r"...\THEOLOGICUS.exe")
print(list(arc.toc))              # ~12 entrees ; le script principal s'appelle "app"
co = marshal.loads(arc.extract("app"))   # objet code du script principal
```

Le `PYZ` s'ouvre par `arc.open_embedded_archive("PYZ.pyz")` (≈556 modules ici) ;
`pyz.toc` liste les modules, `pyz.extract(nom)` rend les octets à démarshaler.

**Comparer deux versions de code** : parcourir récursivement `co_consts` en
descendant dans les objets code imbriqués, collecter les chaînes, et comparer
les **ensembles**. Ici `consts(exe) == consts(app.py compilé)` → `True` : la
preuve que l'exe embarque bien le `app.py` du dépôt.

**Trois pièges de cette inspection, tous rencontrés :**

- **Le marqueur cherché n'est pas là où on le cherche.** Un nom de fonction ou
  d'attribut est dans `co_names` ; un littéral de chaîne (y compris une clé de
  dictionnaire, ou `os.environ.get("MA_VARIABLE", …)`) est dans `co_consts`.
  Chercher `THEOLOGICUS_GPU_ARGS` dans `co_names` a rendu « absent » à tort.
- **Un filtre de longueur fabrique des absences.** Filtrer les chaînes à plus de
  12 caractères a exclu `"hote"` (4 caractères) et produit un second « absent »
  faux. Ne pas filtrer avant d'avoir conclu ; filtrer seulement pour l'affichage.
- **Le journal de l'application est un canal de preuve.** `app.py` redirige
  `stdout`/`stderr` vers `THEOLOGICUS.log` **uniquement** en mode figé
  (`sys.frozen`). Donc toute ligne lue dans ce journal vient d'un **exe**, pas
  d'un script — et `[OK] Drapeaux GPU transmis a WebView2 : …` est une preuve
  d'exécution, pas une déduction. Comparer le nombre de lignes avant/après un
  lancement pour attribuer les nouvelles lignes au bon processus.

**Règle générale** : pour savoir ce qu'un binaire contient, interroger son
format. Et **quand une observation contredit une inférence, l'observation
gagne** — les deux lignes du journal étaient déjà là avant que je conclue le
contraire.

## Jetons de thème : les trois pièges qui rendent un thème illisible (v130)

Ce monolithe a **deux générations de thèmes**. Les anciennes (`glass`, `cyber`,
`midnight`, définies vers la ligne 1328) et les récentes (`v6-glass`,
`v6-cyber`, `v6-light`, vers la ligne 31796). L'attribut du document est
`data-theme="glass"` : **le thème par défaut appartient à la génération
ancienne**, et c'est là que les défauts se logent.

### 1. `var(--x)` sans repli et sans définition n'est pas une erreur visible

La déclaration **entière** devient invalide à la compilation de la valeur, et la
propriété retombe **silencieusement** sur sa valeur initiale. Aucune exception,
aucun message. Mesuré : dans `glass`,

```css
html[data-theme="glass"] .message.assistant { background: var(--chat-assistant) }
```

`--chat-assistant` n'étant défini que par les thèmes `v6-*`, la bulle perd son
fond, devient transparente, et c'est le blanc de
`.section-chat { background: var(--bg-card) }` qui apparaît — texte clair sur
blanc, **1,11:1**. Aucune revue de code ne voit ça.

### 2. Un jeton qui vaut la MAUVAISE valeur n'est pas un jeton ABSENT

Chercher les jetons « non définis » rate le cas le plus fréquent : `--bg-card`
**est** défini (par `:root`, à `#ffffff`) et c'est précisément le problème quand
le thème est sombre. Il faut lire la **valeur calculée dans le thème actif** :

```js
document.documentElement.setAttribute("data-theme", th);
getComputedStyle(document.documentElement).getPropertyValue("--bg-card");
```

### 3. Une surface et son texte doivent venir de la MÊME famille

Régression que j'ai introduite puis corrigée : donner à un bloc « sa propre
surface » en empruntant `--popup-bg` avec un repli de texte clair. Correct en
thème sombre, **faux en thème clair** où `--popup-bg` vaut blanc → texte clair
sur blanc, mesuré **1:1** en `light`. Prendre `--bg-card` + `--text-primary` :
tout thème bascule les deux ensemble.

### Les thèmes anciens ne redefinissent que les jetons de TEXTE

C'est la cause de fond. Quand `glass`/`cyber`/`midnight` passent en sombre, ils
redéfinissent `--text-primary`, `--text-secondary`, `--text-dim`… mais **pas**
`--bg-card`, `--chat-user`, `--chat-assistant`, qui restent hérités de `:root`
(blancs). Les thèmes `v6-*` font les deux familles. Correctif appliqué : donner
aux trois thèmes anciens les jetons de surface, pris dans leur propre palette.

Effet mesuré, éléments sous 3:1 — `glass` **26 → 1**, `cyber` **15 → 1**,
`midnight` **13 → 1**.

### Lire le thème réellement utilisé, sans le deviner

Le thème est en IndexedDB, dans le profil WebView2 de l'application :

```
%APPDATA%\pywebview\EBWebView\Default\IndexedDB\http_127.0.0.1_8765.indexeddb.leveldb
```

**Pas** `%LOCALAPPDATA%\EBWebView`, qui appartient à une autre application.
On lit la valeur en cherchant `theme` dans les `.ldb`/`.log` (LevelDB) et en
prenant la chaîne courte qui suit. Résultat ici : `v6-cyber` — donc
l'utilisateur ne subissait **pas** le défaut, contrairement à ce qu'un
raisonnement par défaut aurait fait croire.

### Deux installations coexistent

Les raccourcis du Bureau et du menu Démarrer pointent vers
`C:\Theologicus\.workbuddy-ai\artifacts\_v123\_pub\installe`. Vérification en
lisant les `.lnk` (les chemins y sont en **UTF-16LE**) — `pywin32`/COM est refusé
comme LOLBin. `%LOCALAPPDATA%\Programs\THEOLOGICUS` est une installation
**ancienne** : ne pas la prendre pour la vivante.

### Mesurer le contraste par thème

`contraste_par_theme.js` : pose chaque `data-theme`, ouvre le menu, puis compte
les éléments dont le texte descend sous 3:1. C'est ce qui a montré les 26/15/13 et
permis de vérifier l'après. **Ne pas conclure d'un seul thème** : le défaut était
invisible dans `v6-cyber` et massif dans `glass`.

**Corrigé en v131 — la résolution du fond décrite ci-dessus était FAUSSE.** Le
fond ne s'obtient pas « en remontant jusqu'au premier opaque » : une couche
translucide n'est pas un fond. `rgba(255,255,255,0.6)` sur une coque sombre est un
**gris moyen**, pas du blanc ; la prendre pour opaque **surestime le contraste** et
fait passer les défauts des surfaces en verre sous le seuil. Il faut **composer
toute la chaîne translucide** jusqu'à la première couche réellement opaque
(alpha ≥ 0,999), du bas vers le haut. Détail complet dans le skill
`web-ui-audit-measure`.

## Un SECOND `:root` peut écraser un thème entier (v131)

Le document contient **deux** `:root` : celui du haut (ligne ~1204, palette
**claire**) et un second à la ligne ~29999, dans `<style id="v9-palette">`, écrit
pour la coque **v9 SOMBRE** (il déclare `--text: #e6edf7`, `--text-bright`,
`--cyan`, `--neon`, `--cyan-dim`, `--bg-void`, `--bg-hull`).

Un bloc de thème écrit `[data-theme="light"] { … }` a la spécificité **(0,1,0)** —
**la même que `:root`**. À spécificité égale, **le dernier du document gagne**.
Donc la palette v9 écrasait les thèmes `light` et `midnight`, qui sont déclarés
AVANT elle. Conséquences mesurées dans `light` : `--text` valait `#e6edf7` (blanc
cassé) au lieu de `#2d4a6b`, `--neon` `#4f8ef7` au lieu de `#00875a` → **1,03:1**
sur `.success-block`, **1,08:1** sur le libellé du bouton d'export, **2,81:1** sur
`.badge-neon`. Dans `midnight` le dégât n'était pas la lisibilité mais la
**teinte** : `--cyan`/`--neon` bleus au lieu de violets.

**Règle durable : toute surcharge de thème s'écrit `html[data-theme="…"]`** —
spécificité (0,1,1) — jamais `[data-theme="…"]`. C'est déjà la convention de
`glass`, `cyber`, `midnight` et des `v6-*`.

Pour nommer le gagnant au lieu de le supposer : `sonde_cascade.js` liste, dans
l'ordre du document, toutes les règles qui déclarent un jeton sur `<html>`, avec
leur spécificité et leur feuille, et marque celle qui gagne. Il faut **deux**
mesures, pas un raisonnement : `getComputedStyle` donne la valeur, lui donne la
cause.

## Une fuite de jeton de surface casse un thème SOMBRE (v131)

`--glass-bg` est défini dans `:root` en `rgba(255,255,255,.6)` — **blanc**. Les
trois thèmes `v6-*` définissaient `--glass-border` mais **pas** `--glass-bg`. Leurs
panneaux de verre (`#memory-panel`, `.navbar-container`, la coque `.tpai-*`)
étaient donc **blancs et translucides sous un texte clair**. Mesuré dans
`v6-cyber`, le thème de l'utilisateur : **1,24:1** sur `.memory-header h3` ; après
correctif **5,69:1**.

**Généralisation : un thème sombre doit redéfinir TOUS les jetons de surface qu'il
hérite, pas seulement les jetons de texte.** Le détecteur est `fuites_jetons.js` :
pour chaque thème, il dresse la liste des jetons réellement utilisés comme
`background` (lue dans `rule.cssText`, **jamais** via `getPropertyValue` — voir le
piège des abréviations) et signale ceux qu'un thème sombre hérite **clairs**. Il ne
signale que `--glass-bg`, et c'est le bon verdict.

Attention au faux positif : une **bordure** claire sur fond sombre est légitime.
Restreindre le test aux jetons employés comme `background`.

## Douze jetons morts : les trouver sans se tromper (v131)

Douze jetons étaient référencés **sans repli** et définis **nulle part** dans les
sept thèmes : `--text-muted`, `--plasma-dim`, `--violet-dim`, `--bg-panel`, `--bg`,
`--bg-dark`, `--void`, `--plate`, `--grid`, `--neon-dim`, `--gold`, `--plasma`.
Chaque déclaration qui les emploie était donc **entièrement invalide**.

Trois précautions, chacune apprise d'un échec :

- **Ne balayer que les règles VIVANTES.** Un balayage du texte brut remonte des
  citations dans des **commentaires CSS** (`var(--app-h)` alors que l'usage réel est
  `var(--app-h, 100vh)`, avec repli) et dans des **chaînes de gabarit JS**
  (`var(--bg-dark)`). Onze faux positifs par thème.
- **Exclure les jetons fournis à l'exécution** par `setProperty` : ici huit
  (`--app-h`, `--dur`, `--fc`, `--gl-radius`, `--p`, `--sch-box-border`,
  `--sch-edge`, `--shift`). Ils n'existent pas dans la feuille, donc « morts » à
  tort.
- **Un repli se lit dans `cssText`** : une virgule de premier niveau dans
  `var(--x, …)` signale le repli. `getPropertyValue` ne le voit pas.

Résultat après correctif : **71 références sans repli, aucun jeton mort dans les
sept thèmes** (`jetons_manquants.js`, code de sortie 0).

**Déclaration morte DANS une même règle.** Le bloc `html[data-theme="light"]`
déclare `--void` **deux fois** (lignes 4569 et 4584) : la première ne sert à rien.
C'est préexistant, invisible, et du même genre que les douze ci-dessus — un jeton
peut être « défini » et pourtant mort.
