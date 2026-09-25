# THEOLOGICUS — notes long terme

**Détail procédural : skills** `theologicus-apk-build`, `theologicus-zindex-guard`,
`theologicus-tts-diagnostic`, `theologicus-code-fragilities` ; journaux
`.workbuddy-ai/memory/AAAA-MM-JJ.md` ; bancs `.workbuddy-ai/artifacts/`.

## Règles qui coûtent cher si violées

- **`python tools/sync_html.py` après CHAQUE correctif** (4 copies). Non synchronisé
  = **invisible**. L'exe lit le HTML **sur le disque** → redémarrer. **Un serveur
  lancé sert son ANCIENNE copie** → le tuer avant de tester.
  `check_syntax.js` ne valide que le **JS**, jamais le HTML.
- **Commit + push à CHAQUE correctif** (`jelliel/THEOLOGICUS`, `main`, anglais,
  `git commit -F`). **Jamais `git stash`** (a détruit `.git/refs`). **Prouver la
  release par `/releases/latest` → `tag_name`**, jamais par le run de workflow.
  Version = `git rev-list --count HEAD`, lue dans l'API.
- **Clé `~/.workbuddy-ai/keys/theologicus-release.jks` : ne jamais remplacer.**
- **Toute config survivant à une MAJ va dans `%LOCALAPPDATA%/THEOLOGICUS/`** —
  jamais le dossier d'install, jamais `localStorage` seul.
- **Port STABLE 8765–8780.** Deux ports = deux origines = **deux stockages
  navigateur** → clé et config *semblent* effacées. **`bind` d'abord** (sonder
  d'abord coûte ~10,7 s de démarrage).
- **Le shell qui détache tue un exe windowed** (~26 s) → `run_in_background` et
  sonder dans la même invocation.

## Application

`THEOLOGICUS.html` ~1,55 Mo, **59 `<script>`**, **LF**. **`THEO_CORPORA` pilote
tout** ; `summafr` id `1001` = Ia q.1, **hors `THEO_CORPORA`**. Capacitor 8,
`com.theologicus.app`, minSdk 24 → targetSdk 36. Clés **jamais embarquées**.

## Modal PARAMÈTRES — 5 onglets (v122)

`.settings-tabs` + 5 `.settings-panneau` (Modèle IA, Fournisseurs, Lecture vocale,
Sauvegarde, Cache). Onglet persisté ; `window.__settingsOuvrirOnglet`.

- **Cacher par `hidden`, jamais `display:none` en ligne** — le style en ligne gagne
  contre la feuille, `hidden=false` ne rallume plus rien.
- `#settings-panneau-model` = « LLM Settings » de MPT ; le test de connexion
  appelle **`resolveModelConfig()`, le chemin d'appel RÉEL** de l'app, pas la
  passerelle MPT (qui ne connaît que SON registre et SON `config.toml`).
- **`settingsModelSync()` (état→UI) ≠ `_setLlmDecrireFournisseur()` (UI→desc.)** :
  appeler la première depuis `onchange` **annule le choix de l'utilisateur**.
- Accès unique `_set = id => document.getElementById(id)` — le piège `$(id)` sans
  `#` (`$` = `querySelector`) ne doit jamais revenir.
- **Découper un modal — un piège en masque un autre** : tracer la **profondeur**
  des `<div>` depuis `modal-body` (chaque panneau doit ouvrir à la **même**
  profondeur ; une balise perdue rend les suivants **enfants** du précédent),
  remonter **`parentElement`** (seule preuve d'ascendance), vérifier qu'aucun bloc
  n'est resté **hors de tout panneau**.

## Fournisseurs LLM (v118)

`PROVIDERS` + `PROVIDER_BY_ID` ; formats `chat-completions`|`anthropic`|
`responses` ; clés dans `state.keys[<id>]`. Convention **`<fournisseur>:<modele>`**
→ `_providerModelId()` → `resolveModelConfig()`. Un modèle préfixé **n'obéit pas à
`state.apiKey`** (Mistral seul) → **`_clePourModele(activeId)` seule source
correcte**. **Agnes AI** : `agnes-image-*`/`agnes-video-*` **muets** sur
`/chat/completions`.

## Services voisins (jamais embarqués)

`Supertonic` (8091), `LibreTranslate`, **`MoneyPrinterTurbo` = STUDIO VIDÉO**.

- **Toujours passer par le relais** : page en `127.0.0.1:8765`, tout autre port est
  **cross-origin**.
- **`http_proxy` est honoré AUSSI pour `127.0.0.1`** → **502** qui *ressemble* à une
  réponse du service alors qu'il n'a **rien reçu**. `_boucle_locale()` sur **CHAQUE**
  appel, pas seulement la sonde.
- **Sonder en LECTURE SEULE ; prouver l'IDENTITÉ, pas la présence** (MPT : `/ping`
  → `pong`). **Une install portative IMBRIQUE son app** : mauvais niveau = liste
  **vide sans erreur**. **Banc : s'isoler du vrai service.**
- **Parité MPT** : suivre EXACTEMENT `VideoParams` ; chaînes vides **omises** ;
  listes **lues depuis le service**.

## TTS / produit

`cleanMd` → … → `chunkText(180)` → file `speakNextSegment`, **sortie unique
`ttsEmission()`**. **Latin lu en français : voulu — question close.**
**`[slowly]`/`[softly]` proscrits** ; **quota ElevenLabs épuisé** (2026-10-24).
**Aucune citation de verset** dans ☷ RÉFÉRENCES (nombres = dates). **Zéro littéral
numérique dans un contenu non modal** ; une seule échelle z-index nommée.
Bancs : `verify_settings` 71/71, `verify_studio_v121` 55/55, `verify_studio` 14/14.
