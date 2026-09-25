# OpenMontage — analyse et verdict

Dépôt : https://github.com/calesthio/OpenMontage
Commit examiné : `08e2151` — 164 Mo, ~2115 fichiers — **AGPLv3**
Deux lectures : `README.md` (786 l.), `docs/ARCHITECTURE.md`, `docs/PROVIDERS.md`,
`config.yaml`, `.env.example`, `requirements.txt`, `setup.py`, `Makefile`,
`tools/base_tool.py`, `backlot/server.py`, `backlot/__main__.py`, arborescences.

## Ce que c'est

**« The first open-source, agentic video production system. »** Un *studio vidéo pour
assistant de codage* : Claude Code, Cursor, Copilot, Windsurf, Codex. Le assistant
**est** le plan de contrôle.

Verbatim `docs/ARCHITECTURE.md` :

> « An LLM coding assistant acts as the orchestrator — reading pipeline manifests,
> following skill instructions, calling Python tools, and checkpointing state.
> **There is no runtime Python orchestrator; the agent is the control plane.** »

Flux : sujet → l'agent lit un manifeste YAML → par étape il lit une *stage-director
skill* (Markdown) → appelle des outils Python → écrit un checkpoint JSON → s'auto-évalue
→ porte d'approbation humaine → `final.mp4`.

## Surface réellement exécutable

| Élément | Nature | Appelable par THEOLOGICUS ? |
|---|---|---|
| `tools/` (57+ outils Python) | CLI/in-process, hérités de `BaseTool` | Non — pas de serveur |
| `pipeline_defs/*.yaml` (13) | Manifestes lus **par l'agent** | Non |
| `skills/**, .agents/skills/**` | Markdown lu **par l'agent** | Non |
| `schemas/*.json` (29) | Validation de contrats | Non |
| `backlot/server.py` | **FastAPI** `/api/health`, `/api/projects`, `/api/project/{id}/state`, `/api/project/{id}/events` (SSE), `/thumb/`, `/media/` | Oui — mais **tableau de bord**, pas de génération |
| `ink-theater/` | JS, marionnettes SVG | Non |
| `remotion-composer/` | Projet **Node + Remotion 4** (`npx remotion render`) | Non — build-time |

### Le point décisif : aucun client LLM à l'exécution

Recherche exhaustive de `class *LLM`, `def *llm`, `llm_provider` : **un seul résultat**,
`lib/config_model.py` → `class LLMConfig(BaseModel)` — une **déclaration Pydantic**.
Recherche de `chat/completions`, `/v1/messages`, `generateContent` dans tout le `.py` :
**deux occurrences, uniquement dans des commentaires, à propos de DashScope**.

**Aucun code n'appelle jamais un LLM.** Le champ `llm: {provider, model}` de
`config.yaml` (défaut `anthropic`, commentaire `anthropic | openai | gemini |
openrouter | ollama | mistral | minimax`) n'est lu **que** par un test de contrat :

```
tests/contracts/test_phase0_contracts.py:258: assert config.llm.provider == "anthropic"
```

OpenMontage ne génère pas de texte. **C'est l'assistant de codage hôte qui raisonne**,
OpenMontage n'apporte que les outils et les manifests.

## Verdict : intégration comme « modèle extra » — NON

« Modèle extra » dans THEOLOGICUS signifie : une entrée `PROVIDERS` avec un `base`
OpenAI-compatible joignable par HTTP. OpenMontage **n'expose aucune telle surface**.

Quatre blocages, chacun suffisant :

1. **Rien à appeler.** Pas de serveur de génération, pas de client LLM, pas d'endpoint
   chat. `backlot` sert un tableau de bord en lecture seule sur `projects/`.
2. **Ce n'est pas un modèle, c'est une méthodologie.** Sa valeur est un corpus de
   ~200 fichiers Markdown de consignes + 13 manifests YAML, lus par un agent. Il n'y a
   pas de « réponse » à obtenir ; il y a une **procédure** à suivre.
3. **Licence AGPLv3.** Copyleft fort, y compris pour l'usage en réseau. L'embarquer
   dans un exe Windows signé et une APK distribués obligerait à publier le code source
   de l'ensemble sous AGPLv3. Incompatible avec la distribution actuelle.
4. **Poids irréaliste.** Python 3.10+, FFmpeg, Node 18+, Remotion 4
   (`@remotion/cli` + React 18 + d3-geo + world-atlas), plus un venv ; et des dizaines
   de modèles payants (fal.ai, Kling, Runway, Suno, HeyGen, Google Veo…) dont les clés
   devraient être saisies par l'utilisateur. Le dépôt seul fait **164 Mo** — contre
   1,47 Mo pour `THEOLOGICUS.html` entier.

## Ce qui est réellement transposable

L'idée-force, déjà éprouvée ici (Beacon) : **un plan de contrôle qui lit des manifests
et des procédures déclaratives plutôt que du code en dur.**

Concrètement utile pour THEOLOGICUS, sans rien embarquer :

- **Manifestes de corpus déclaratifs.** `THEO_CORPORA` est déjà un registre de fait.
  Le rendre lisible depuis un YAML embarqué (un seul point d'édition) supprimerait la
  classe de bug « dossier absent des trois listes » (`COPY_DIRS`,
  `prepare_mobile.py`, job `windows`, `build_installer.bat`).
- **Portes d'approbation par étape.** Le mode narrateur / la validation avant
  génération TTS coûteuse est le même motif que les *creative gates* d'OpenMontage.
- **Auto-revue avant livraison.** OpenMontage vérifie par `ffprobe`, échantillonnage
  de frames, niveaux audio. Équivalent ici : le banc avant build (`check_syntax.js`,
  `sync_html.py`, `verify_*.js`) — déjà en place ; la leçon est de **le rendre
  systématique et bloquant**, ce qu'on fait déjà.

Aucune de ces idées n'exige une ligne de code OpenMontage.
