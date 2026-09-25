# THEOLOGICUS — notes long terme

**Détail procédural : skills** `theologicus-apk-build`, `theologicus-zindex-guard`,
`theologicus-tts-diagnostic`, `theologicus-code-fragilities` ; journaux
`.workbuddy-ai/memory/AAAA-MM-JJ.md` ; bancs `.workbuddy-ai/artifacts/`.
**Version = `git rev-list --count HEAD` → `2.0.<n>`.**
**Ne pas reconstruire ici ce qui est dans un skill — y renvoyer.**

**Les 4 skills sont VERSIONNÉS** dans `.workbuddy-ai/skills/` (miroir de
`~/.workbuddy-ai/skills/`, qui n'est **pas** un dépôt git). La **source de
vérité reste le dossier utilisateur** ; après avoir modifié un skill :
`python tools/sync_skills.py` (copie) ou `--verifier` (contrôle, sortie 1 si
écart). **Un miroir qui diverge est pire que pas de miroir.** La clé de
signature `~/.workbuddy-ai/keys/` reste **hors dépôt** — les skills n'en citent
que le **chemin**. `.gitignore` exempte `!.workbuddy-ai/skills/**` pour que les
motifs `*secret*`/`_*.js` ne l'avalent pas en silence.

## Règles qui coûtent cher si violées

- **`python tools/sync_html.py` après CHAQUE correctif** (4 copies). Non synchronisé
  = **invisible**. L'exe lit le HTML **sur le disque** → redémarrer. **Un serveur
  lancé sert son ANCIENNE copie** → le tuer avant de tester.
  `check_syntax.js` ne valide que le **JS**, jamais le HTML.
- **Commit + push à CHAQUE correctif** (`jelliel/THEOLOGICUS`, `main`, anglais,
  `git commit -F`). **Jamais `git stash`** (a détruit `.git/refs`). **Prouver la
  release par `/releases/latest` → `tag_name`**, jamais par le run de workflow.
- **Clé `~/.workbuddy-ai/keys/theologicus-release.jks` : ne jamais remplacer.**
- **Toute config survivant à une MAJ va dans `%LOCALAPPDATA%/THEOLOGICUS/`** —
  jamais le dossier d'install, jamais `localStorage` seul.
- **Port STABLE 8765–8780.** Deux ports = deux origines = **deux stockages
  navigateur** → clé et config *semblent* effacées. **`bind` d'abord** (sonder
  d'abord coûte ~10,7 s de démarrage).
- **Le shell qui détache tue un exe windowed** (~26 s) → `run_in_background` et
  sonder dans la même invocation. **Un service voisin (MPT 8080) ne survit pas
  non plus à l'invocation** : démarrer service + relais + banc dans la **MÊME**
  invocation ; ne jamais `kill` le relais.

## Application

`THEOLOGICUS.html` **1,61 Mo**, **59 `<script>`**, **LF**. **`THEO_CORPORA` pilote
tout** ; `summafr` id `1001` = Ia q.1, **hors `THEO_CORPORA`**. Capacitor 8,
`com.theologicus.app`, minSdk 24 → targetSdk 36. Clés **jamais embarquées**.
Accès DOM unique par panneau : `_set`/`_STU` = `getElementById` — le piège
`$(id)` sans `#` (`$` = `querySelector`) ne doit jamais revenir.

## Modals à onglets — PARAMÈTRES (5, v122) · STUDIO VIDÉO (6, v123)

`.settings-tabs` + `.settings-panneau` ; onglet persisté ; `window.__*OuvrirOnglet`.
Onglets STUDIO : Génération, Modèle IA, Sources, Publication, Clés, Cache — **tous
enfants de `modal-body`**, barre d'action commune.

- **Cacher par `hidden`, jamais `display:none` en ligne** — le style en ligne gagne
  contre la feuille, `hidden=false` ne rallume plus rien.
- **Un `display:none` en ligne sur une vue INTERNE trompe** : `#studio-form`,
  `#studio-progress`, `#studio-result`. Rallumer le **panneau** ne rallume pas la
  vue qu'il contient → panneau visible mais **vide**. Rallumer la vue, **sauf** si
  un rendu/le résultat est en cours. Restaurer l'état mémorisé **à CHAQUE
  ouverture**, pas seulement au chargement.
- **Un `<!--` fermé par `*/` avale tout jusqu'au prochain `-->`** : panneau
  présent dans les **octets servis**, **absent du DOM**. Se voit en comparant le
  **fichier au DOM parsé** puis en **comptant `<!--` / `-->`** — un compte de
  `<div>` équilibré ne dit **rien**.
- PARAMÈTRES : `#settings-panneau-model` = « LLM Settings » de MPT ; le test de
  connexion appelle **`resolveModelConfig()`, le chemin d'appel RÉEL**.
  **`settingsModelSync()` (état→UI) ≠ `_setLlmDecrireFournisseur()` (UI→desc.)** :
  appeler la première depuis `onchange` **annule le choix de l'utilisateur**.

## MPT — écrire SA config (v123)

**MPT n'a AUCUNE route de configuration** (`app/router.py` : `ping`, `video`,
`llm` ; ses réglages ne sont écrits que par son WebUI, in-process) → THEOLOGICUS
édite `config.toml` **lui-même** : **éditeur LIGNE À LIGNE**, liste blanche, clés
inconnues **signalées et jamais écrites**, ajout **dans `[app]`**, `tmp` +
`os.replace`, `.theologicus.bak`. Clés de banques de médias = **listes** TOML.
Registre lu dans `app/models/llm_provider.py` (28 fournisseurs) **avec suivi de
profondeur**. `mpt_cache_nettoyer()` **refuse sans `confirme=True`**.
**Un fournisseur sans zone n'a d'adresse NULLE PART** : ne pas en inventer.

## MPT — cycle de vie du service (v124)

**Le bandeau « Service non détecté » est VRAI :** MPT est un **voisin séparé**,
rien ne le relance. Mesuré : `lib/python/python.exe MoneyPrinterTurbo/main.py`
démarre en **2 s** sur **8080**, `/ping` → `pong`, 29 musiques.
- **Prouver l'identité, pas la présence** : `_mpt_probe` n'accepte que
  `pong`/`"pong"`. **`_boucle_locale()` est indispensable** — sans elle
  `http_proxy` (ici `127.0.0.1:53051`) rend un **502 qui ressemble à une réponse
  du service**. Vérifié : l'ouvreur n'a **aucun `ProxyHandler`**.
- `mpt_status()` doit exposer **l'état d'installation** (`installe`/`api_bat`)
  pour séparer « installé mais arrêté » de « dossier introuvable ».
- `mpt_lancer()` rend `lance:true` **AVANT** que MPT ne réponde → l'UI doit
  sonder jusqu'à la **condition**, jamais conclure au retour de la route.
- **Le portatif IMBRIQUE son app** : `api.bat` est à la racine, l'app dans
  `MoneyPrinterTurbo/`. Un mauvais niveau = liste **vide sans erreur**.

## Fournisseurs LLM (v118)

`PROVIDERS` + `PROVIDER_BY_ID` ; formats `chat-completions`|`anthropic`|
`responses` ; clés dans `state.keys[<id>]`. Convention **`<fournisseur>:<modele>`**
→ `_providerModelId()` → `resolveModelConfig()`. Un modèle préfixé **n'obéit pas à
`state.apiKey`** (Mistral seul) → **`_clePourModele(activeId)` seule source
correcte**. **Agnes AI** : `agnes-image-*`/`agnes-video-*` **muets** sur
`/chat/completions`.

## Services voisins (jamais embarqués)

`Supertonic` (8091), `LibreTranslate`, **`MoneyPrinterTurbo` (8080) = STUDIO VIDÉO**.
Toujours passer par le relais : la page est en `127.0.0.1:8765`, tout autre port
est **cross-origin**. **Banc : s'isoler du vrai service.** **Parité MPT** : suivre
EXACTEMENT `VideoParams` ; chaînes vides **omises** ; listes **lues depuis le
service**.

## TTS / produit

`cleanMd` → … → `chunkText(180)` → file `speakNextSegment`, **sortie unique
`ttsEmission()`**. **Latin lu en français : voulu — question close.**
**`[slowly]`/`[softly]` proscrits** ; **quota ElevenLabs épuisé** (2026-10-24).
**Aucune citation de verset** dans ☷ RÉFÉRENCES (nombres = dates). **Zéro littéral
numérique dans un contenu non modal** ; une seule échelle z-index nommée.

## Bancs

`_v124/verify_service_lifecycle` · `_v123/verify_studio_settings` 78/78 ·
`_v122/verify_settings` 71/71 · `_v120/verify_studio_v121` 55/55 ·
`_v120/verify_studio` 14/14. **Un délai fixe mesure un état transitoire** →
attendre la **CONDITION** (`waitForFunction`), jamais `waitForTimeout` devant du
réseau. **Une assertion peut affirmer le faux** : vérifier ce que l'outil stocke
réellement.
