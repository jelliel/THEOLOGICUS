# THEOLOGICUS — notes long terme

**Le détail procédural est dans les skills, pas ici.** `theologicus-apk-build`
(build, signature, CI, livraison), `theologicus-zindex-guard` (échelle, mot à mot,
infobulles), `theologicus-tts-diagnostic` (voix, prononciation, trois moteurs),
`theologicus-code-fragilities` (pièges du code). Journaux :
`.workbuddy-ai/memory/AAAA-MM-JJ.md`. Bancs : `.workbuddy-ai/artifacts/`.

## Règles qui, violées, coûtent cher

- **`python tools/sync_html.py` après CHAQUE correctif** (4 copies, md5-vérifié).
  Un correctif non synchronisé est **invisible**. L'exe lit le HTML **sur le
  disque** → redémarrage requis. `check_syntax.js` (Node **managé**, pas `py`)
  avant toute compilation.
- **Commit + push à CHAQUE correctif** (`jelliel/THEOLOGICUS`, `main`, message
  anglais, `git commit -F`). **Jamais `git stash`** (a détruit `.git/refs`).
  **Prouver la RELEASE par `/releases/latest` → `tag_name`**, pas seulement le run
  CI : le filtre `paths:` est une **liste d'allumage**. Version =
  `git rev-list --count HEAD`, lue dans l'API, jamais annoncée d'avance.
- **Clé de signature `~/.workbuddy-ai/keys/theologicus-release.jks` : ne jamais
  remplacer.** SHA-256 `93d8324058f1ecd1d252d97b976854ffaf2a976605b9658983d17db6d70f5e67`.
- **Toute config à survivre à une MAJ va dans `%LOCALAPPDATA%/THEOLOGICUS/`** —
  jamais dans le dossier d'installation, jamais seulement dans `localStorage`.
- **Le port doit être STABLE** (8765–8780, premier libre, réutilisation d'une
  instance lancée). Une origine = `scheme://hote:port` : deux ports = **deux
  stockages navigateur distincts** → clé API et config semblent effacées. **Ne pas
  réutiliser 8765-8780** (le projet Théo, séparé, est en 8770-8772).
- **Résoudre le port sans le sonder : `bind` d'abord, sonde si occupé**
  (`resoudre_port()`, v119). Sonder un port libre coûte le timeout entier →
  **10,7 s de démarrage** (régression v117). `bind` = 0 ms.

## Application

`THEOLOGICUS.html` ~1,52 Mo, **59 blocs `<script>`**, **LF**. 16 corpus à la
volée ; **`THEO_CORPORA` pilote tout** ; `summafr` id `1001` = Ia q.1, **hors
`THEO_CORPORA`**. Capacitor 8, `com.theologicus.app`, minSdk 24 → targetSdk 36.
Clés API **jamais embarquées**. Licences : WLC ; `biblegr/` CC BY-SA 3.0 ;
Whitaker's Words MIT (**`Parser(frequency='X')`**) ; Strong's GPL 3.0 ; OSHB
CC BY 4.0 ; Denzinger 1911.

## Fournisseurs LLM (v118)

`PROVIDERS` + `PROVIDER_BY_ID` ; formats `chat-completions`|`anthropic`|`responses` ;
clés dans `state.keys[<id>]`. UI des réglages **pilotée par les données**.

- **Convention `<fournisseur>:<modele>`** : `_providerModelId()` la décompose,
  `resolveModelConfig()` route endpoint **et** clé. Un modèle préfixé **n'obéit pas
  à `state.apiKey`** (qui ne décrit que Mistral) → `_clePourModele(activeId)` est la
  seule source correcte ; l'erreur 401 nomme le fournisseur.
- Liste déroulante **groupée par fournisseur** (`<optgroup>`, « clé manquante » mais
  reste choisissable) ; le menu **burger** réutilise cette liste.
- **Agnes AI** : OpenAI-compatible `https://apihub.agnes-ai.com/v1` ; modèles de
  conversation `agnes-2.5-flash`, `agnes-2.0-flash` ; **`agnes-image-*` /
  `agnes-video-*` ne répondent pas** sur `/chat/completions` → filtrés.
- Banc `_v118/verify_agnes.js` 29/29. **Piège :** un faux DOM stockant `innerHTML`
  sans le **parser** fait échouer un test alors que le code est correct.

## Services voisins (jamais embarqués)

Motif unique, réutilisé trois fois : **le service tourne à côté, THEOLOGICUS s'y
connecte par `proxy_server.py`**. `Supertonic` (8091), `LibreTranslate`,
**`MoneyPrinterTurbo` = STUDIO VIDÉO (v120/v121)**.

- **Toujours passer par le relais** : la page est servie en `127.0.0.1:8765`, tout
  autre port est **cross-origin**.
- **Sonder en LECTURE SEULE et prouver l'IDENTITÉ, pas la présence** (MPT :
  `GET /ping` doit rendre `pong`, avec ou sans guillemets).
- **`http_proxy` est défini et urllib l'honore AUSSI pour `127.0.0.1`** → **502**,
  qui *ressemble* à « le service a répondu 502 » alors qu'il n'a **rien reçu**.
  `build_opener(ProxyHandler({}))` (`_boucle_locale()`) — **à vérifier sur CHAQUE
  appel**, pas seulement la sonde (v121 : appliqué à un seul des deux, le service
  était détecté pendant que chaque requête échouait).
- **Sonder aussi la plage du WebUI** (MPT : 8080 API **et** 8501-8509, Streamlit de
  `start.bat`), **journaliser le port retenu**, **vider le cache s'il meurt**.
- **Formulaires de service : `%LOCALAPPDATA%/THEOLOGICUS/`**
  (`theologicus_studio.json`), comme les clés et la config TTS.
- **Une installation portative IMBRIQUE son application** : `resource/fonts` vit
  dans le sous-dossier `MoneyPrinterTurbo/`, pas à la racine qui porte les `.bat`.
  Chercher au mauvais niveau rend une liste **vide sans erreur** (v121).
- **Banc : s'isoler du vrai service.** S'il tourne, toutes les assertions « service
  absent » échouent **à tort** → ports privés au banc, et arrêter le faux service
  avant de tester les refus de démarrage.
- **Parité MoneyPrinterTurbo (v121)** : le formulaire suit EXACTEMENT
  `VideoParams` (`app/models/schema.py`). Noms vérifiés : `bgm_name` (pas
  `bgm_type`), `text_fore_color` (pas `text_color`). Les chaînes vides sont
  **omises**, jamais envoyées. Les listes (331 voix / 15 fr, 9 polices, 29
  musiques) sont **lues depuis le service**, jamais codées en dur.

## TTS — invariant unique

Chaîne `cleanMd` → … → `chunkText(180)` → file `speakNextSegment`, **sortie unique
`ttsEmission()`**. Trois moteurs (système / ElevenLabs / Supertonic). Détail et
pièges : skill `theologicus-tts-diagnostic`. **Latin lu en français : voulu,
question close.** **`[slowly]`/`[softly]` proscrits** (hors liste officielle v3 : la
durée mesurée était le mot prononcé). **Quota ElevenLabs épuisé** (9832/10000,
réarmement **2026-10-24**) → balises v3 à confirmer à l'oreille.

## Décisions produit arrêtées

- Gestes : appui long → « Add to chat » ; double-tap → encadrement ; tap sur passage
  annoté → son commentaire (400 ms). Verrou : difficulté plafonnée à 3, question
  ratée qui revient, « souvenir de moi » 7 jours.
- Panneau ☷ RÉFÉRENCES : **aucune citation de verset** (les nombres entre
  parenthèses sont des dates). Traduction embarquée « BJ 1998 » (sous droits).
- **Zéro littéral numérique dans un contenu non modal** ; une seule échelle z-index
  nommée (`--z-panneau` < `--z-carte` < `--z-mot`).
