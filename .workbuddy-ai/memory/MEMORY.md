# THEOLOGICUS — notes long terme

**Tout le détail procédural est dans les skills, pas ici.** `theologicus-apk-build`
(build, signature, CI, outils, installation), `theologicus-zindex-guard` (échelle,
mot à mot, infobulles, pièges du banc), `theologicus-tts-diagnostic` (voix,
prononciation, trois moteurs), `theologicus-code-fragilities` (pièges du code).
Journaux datés : `.workbuddy-ai/memory/AAAA-MM-JJ.md`. Bancs : `.workbuddy-ai/artifacts/`.

## Règles qui, violées, coûtent cher

- **`python tools/sync_html.py` après CHAQUE correctif** (4 copies, md5-vérifié).
  Un correctif non synchronisé est **invisible**. L'exe lit le HTML **sur le
  disque** → redémarrage requis. `check_syntax.js` (via le **Node managé**, pas
  `py`) avant toute compilation.
- **Commit + push à CHAQUE correctif** (`jelliel/THEOLOGICUS`, `main`, message en
  anglais, `git commit -F`). **Jamais `git stash`** (a déjà détruit `.git/refs`).
  **Après un push, prouver la RELEASE par `/releases/latest` → `tag_name`**, pas
  seulement le run CI : le filtre `paths:` est une **liste d'allumage**, un commit
  hors liste ne déclenche rien. Version = `git rev-list --count HEAD`, lue dans
  l'API, jamais annoncée d'avance.
- **Clé de signature `~/.workbuddy-ai/keys/theologicus-release.jks` : ne jamais
  remplacer** (plus aucune MAJ publiable). SHA-256
  `93d8324058f1ecd1d252d97b976854ffaf2a976605b9658983d17db6d70f5e67`.
- **Toute config que l'utilisateur ne doit pas retaper après une MAJ va dans
  `%LOCALAPPDATA%/THEOLOGICUS/`** — jamais dans le dossier d'installation, jamais
  seulement dans `localStorage`.
- **Le port doit être STABLE** (plage 8765–8780, premier libre, réutilisation d'une
  instance lancée). Une origine = `scheme://hote:port` : deux ports = **deux
  stockages navigateur distincts**. Un port instable fait croire que la clé API et
  la config sont effacées. **Ne jamais réutiliser 8765-8780 pour un autre projet
  de cette machine** (le projet Théo, séparé, est en 8770-8772).

## Application

`THEOLOGICUS.html` ~1,47 Mo, **59 blocs `<script>`**, **LF**. 16 corpus à la volée ;
**`THEO_CORPORA` pilote tout** ; `summafr` id `1001` = Ia q.1, **hors `THEO_CORPORA`**.
Capacitor 8, `com.theologicus.app`, minSdk 24 → targetSdk 36. Clés API **jamais
embarquées**. Licences : WLC ; `biblegr/` CC BY-SA 3.0 ; Whitaker's Words MIT
(**`Parser(frequency='X')`**) ; Strong's GPL 3.0 ; OSHB CC BY 4.0 ; Denzinger 1911.

## Fournisseurs LLM (v118)

`PROVIDERS` + `PROVIDER_BY_ID` ; formats `chat-completions`|`anthropic`|`responses` ;
clés dans `state.keys[<id>]`. L'UI des réglages est **pilotée par les données**.

- **Convention `<fournisseur>:<modele>`** (`agnes:agnes-2.5-flash`,
  `openai:gpt-4o`) : `_providerModelId()` la décompose, `resolveModelConfig()`
  route endpoint **et** clé du fournisseur. Un modèle préfixé **n'obéit pas à
  `state.apiKey`** (qui ne décrit que Mistral) → `_clePourModele(activeId)` est la
  seule source correcte pour les gardes d'envoi ; l'erreur 401 nomme le fournisseur.
- Liste déroulante **groupée par fournisseur** (`<optgroup>`, « clé manquante » mais
  reste choisissable) ; le menu **burger** réutilise cette liste.
- **Agnes AI** : OpenAI-compatible `https://apihub.agnes-ai.com/v1`. Modèles de
  conversation `agnes-2.5-flash`, `agnes-2.0-flash` ; **`agnes-image-*` /
  `agnes-video-*` ne répondent pas** sur `/chat/completions` → filtrés.
- Banc `_v118/verify_agnes.js` 29/29. **Piège de banc** : un faux DOM qui stocke
  `innerHTML` sans le **parser** fait échouer un test alors que le code est correct.

## TTS — invariant unique

Chaîne `cleanMd` → … → `chunkText(180)` → file `speakNextSegment`, **sortie unique
`ttsEmission()`**. Trois moteurs (système / ElevenLabs / Supertonic). Détail et
pièges : skill `theologicus-tts-diagnostic`. **Latin lu en français : voulu, question
close.** **`[slowly]`/`[softly]` proscrits** (hors liste officielle v3 : la durée
mesurée était le mot prononcé). **Quota ElevenLabs épuisé** (9832/10000, réarmement
**2026-10-24**) → les balises v3 reposent sur la liste officielle, à confirmer à l'oreille.

## Décisions produit arrêtées

- Gestes : appui long → « Add to chat » ; double-tap → encadrement ; tap sur passage
  annoté → son commentaire (400 ms). Verrou : difficulté plafonnée à 3, question ratée
  qui revient, « souvenir de moi » 7 jours.
- Panneau ☷ RÉFÉRENCES : **aucune citation de verset** (les nombres entre parenthèses
  sont des dates). Traduction embarquée « BJ 1998 » (sous droits).
- **Zéro littéral numérique dans un contenu non modal** ; une seule échelle z-index
  nommée (`--z-panneau` < `--z-carte` < `--z-mot`).
