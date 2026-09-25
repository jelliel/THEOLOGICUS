# Beacon (Asymptote Labs) — analyse et intégration à mon système

Analyse faite le 2026-09-25 sur `github.com/Asymptote-Labs/agent-beacon`
(commit `4324b0b`, branche `main`), cloné dans `/tmp/agent-beacon`.
À l'attention : ce document répond à « comment implémenter cela **dans ton
système** » — donc dans l'outillage d'agent, **pas** dans l'application
THEOLOGICUS.

---

## 1. Ce qu'est réellement Beacon

Beacon est une **couche de mémoire pour agents de codage**. Il ne fait pas de
théologie, ne génère rien : il **observe** ce que font des agents dans un
répertoire de travail, normalise ces traces, et en extrait de la connaissance
réutilisable.

La boucle revendiquée par le projet :

```
Lancer des agents
    ↓
Capturer l'historique de session     (hooks + OTLP + poll)
    ↓
Évaluer ce qui a marché              (un évaluateur distant, payant)
    ↓
Extraire la connaissance utile
    ↓
Revue humaine + approbation
    ↓
Réutilisation par les agents suivants (MCP + Agent Skills)
```

Trois mécanismes de collecte, par ordre d'importance :

| Mécanisme | Ce qu'il capture | Coût |
|---|---|---|
| **`beacon-hooks`** | invit., réponses, outils, commandes, fichiers, approbations, diffs | local |
| **OTLP** (récepteur sur `127.0.0.1`) | télémétrie OpenTelemetry des harnais qui la produisent | local |
| **poll** | rattrapage des fichiers de session des harnais | local |

Un point souvent mal lu : **le binaire `beacon-hooks` est indispensable.** Le
README de `manual-install` le dit explicitement — *« an install that keeps only
the CLI and the collector captures OpenTelemetry data and nothing from the hook
path »*. Une installation partielle ne capture donc rien de l'activité d'outils.

### Format de stockage

Une **JSONL locale**, une ligne = un événement :
`~/.beacon/endpoint/logs/runtime.jsonl`. Rotation à **10 MiB**, 5 archives.
Rien n'est envoyé par défaut : le transfert vers Beacon Managed ou vers un SIEM
(Splunk, Datadog, Sentinel…) est **optionnel et explicite**.

### Posture de données (SECURITY.md)

- Récepteurs **en boucle locale uniquement** (`127.0.0.1`).
- **Aucune dépendance hébergée** pour la collecte normale.
- Rédaction de secrets, troncature, limite de taille d'événement.
- L'extension navigateur (claude.ai / chatgpt.com) ne voit **que** le flux de la
  conversation, jamais les autres onglets ni l'historique.
- Licence **MIT**.

---

## 2. Les trois points d'intégration réels

Beacon n'a pas d'API REST à consommer : il expose **une CLI** et **un serveur
MCP**. Tout le reste en découle.

### 2.a — Serveur MCP (`beacon mcp serve`)

Sept outils, lus dans `cli/beacon/internal/mcpserver/server.go` (liste vérifiée
par un test, `server_test.go`) :

```
search_activity  summarize_activity  get_activity_event  list_activity_filters
search_memory    get_memory         get_memory_context
```

Les quatre premiers interrogent les **traces brutes** ; les trois derniers, la
**mémoire approuvée**. La distinction est essentielle et Beacon y insiste :
*« Approved memory has been reviewed by a person. Raw traces have not. »*

Déclaration MCP officielle (`agent-skills/mcp.json`) :

```json
{ "mcpServers": { "beacon": {
    "type": "stdio", "command": "beacon", "args": ["mcp", "serve"] } } }
```

### 2.b — Trois Agent Skills (le cœur de la valeur)

| Skill | Rôle | Réseau |
|---|---|---|
| `beacon-memory-recall` | avant une tâche, relire la mémoire projet approuvée | **aucun** |
| `beacon-memory-distill` | transformer des traces en leçons relues et approuvées | évaluateur distant, **avec consentement** |
| `beacon-memory-promote` | installer une mémoire approuvée en skill dans le dépôt | **aucun** |

`beacon-memory-recall` a deux chemins : les outils MCP s'ils sont disponibles,
sinon la CLI en repli :

```bash
beacon memory list --json --limit 5 -q "<deux ou trois termes distinctifs>"
```

Détail qui a son importance : **les termes sont liés par ET**. Une phrase entière
ne renvoie rien — il faut deux ou trois mots-clés, puis en retirer si c'est vide.

### 2.c — CLI `beacon memory` (surface complète)

```
memory list                                  memory candidates list|show|approve|reject|supersede
memory show <id>                             memory skills preview|install <candidate-id>
memory evaluations run|list|show             mcp serve | mcp doctor
```

Le cycle est toujours le même : *candidat* → `approve` → `skills install`.
Rien n'entre en mémoire sans une approbation humaine explicite.

---

## 3. La contrainte décisive : WorkBuddy n'est pas un harnais supporté

C'est le point qui commande toute la faisabilité, et il est net.

Les harnais branchés passent par un **fichier de configuration propre à chaque
outil**, où Beacon écrit ses hooks (`docs/cli/hooks.mdx`) :

| Harnais | Fichier de configuration des hooks |
|---|---|
| Claude Code | `~/.claude/settings.json` |
| Cursor | `~/.cursor/hooks.json` |
| Codex CLI | `~/.codex/hooks.json` |
| OpenCode | `~/.config/opencode/plugins/beacon.ts` |
| Qwen Code | `~/.qwen/settings.json` |

**Recherche exhaustive dans le dépôt entier : aucune occurrence de
« WorkBuddy » ni de « CodeBuddy »**, ni dans le code, ni dans les docs, ni dans
les manifestes. WorkBuddy ne figure pas dans le tableau des ~30 runtimes
supportés, et son agent n'expose pas de fichier de hooks au format Claude Code.

**Conséquence à assumer clairement :** `beacon endpoint hooks install` ne peut
pas brancher WorkBuddy. Tant que ce n'est pas le cas, lancer Beacon sur cette
machine produira **un fichier JSONL vide** — la mécanique sera en place, mais
aucune trace n'entrera.

---

## 4. Ce que j'ai retenu et intégré

Puisqu'une installation de Beacon serait **inerte** sur cette machine, j'ai
retenu ce qui est réellement transposable et utile dès maintenant. Trois choses,
par ordre de valeur.

### 4.1 La distinction mémoire approuvée / trace brute → déjà la mienne

Beacon sépare rigoureusement ce qu'un humain a relu de ce qu'un agent a produit
brut. C'est exactement la discipline de mon système, et elle mérite d'être
nommée explicitement plutôt que laissée implicite :

| Beacon | Mon équivalent |
|---|---|
| trace brute | journal daté `.workbuddy-ai/memory/AAAA-MM-JJ.md` |
| candidat | brouillon de note, non vérifié |
| **mémoire approuvée** | `MEMORY.md` + skills `theologicus-*` |
| promotion en skill | création d'un skill via SkillManage |

**Règle que je retiens : une leçon ne monte dans `MEMORY.md` ou dans un skill
qu'après vérification sur pièce.** Jamais depuis une simple impression de
session. C'est déjà ma pratique — elle est désormais écrite.

### 4.2 Le test de qualité « est-ce que ça mérite un skill ? »

Beacon pose un critère que je n'avais pas formulé aussi nettement
(`beacon-memory-promote`) :

**Promouvoir en skill :**
- les mémoires de type `workflow` et `convention` valables pour **beaucoup** de
  tâches du dépôt ;
- un `debugging_pattern` pour une panne qui **revient**.

**Laisser en mémoire seulement :**
- les pièges ponctuels liés à **un** fichier ou **un** incident ;
- **tout ce qui duplique déjà `CLAUDE.md` / `AGENTS.md` / la doc de
  contribution** — dans ce cas, corriger la doc, pas créer un skill.

Le second point est directement actionnable sur THEOLOGICUS : mes skills
`theologicus-*` ne doivent pas répéter ce qui est déjà dans `MEMORY.md` ou dans
les docs du dépôt. C'est un critère de non-duplication que j'applique désormais
avant toute création de skill.

Et l'avertissement qui va avec : *« Chaque skill installé s'ajoute à ce que
chaque agent considère à chaque tâche. »* — un skill de trop coûte à **chaque**
tâche, pas seulement à celle qui l'a motivé.

### 4.3 La discipline de requête `get_memory_context`

Les termes sont **ET-és**. Une question en langage naturel ne renvoie rien. La
méthode correcte : **deux ou trois termes distinctifs** (un nom d'outil, un
fichier, une chaîne d'erreur), puis retirer des termes si le premier essai est
vide. Cela vaut pour toute recherche dans ma mémoire de projet.

---

## 5. Si vous voulez malgré tout installer Beacon

Faisable, mais je ne l'ai **pas** fait, pour trois raisons que je préfère
énoncer plutôt que de les découvrir après coup :

1. **Le skill officiel l'interdit explicitement.** `beacon-memory-recall` dit :
   *« Do not install it yourself. »* — il renvoie l'utilisateur vers la doc.
   Je ne passe pas outre une consigne de sécurité d'un outil tiers sans votre
   accord.
2. **Ce serait inerte** (§3) : WorkBuddy n'étant pas branchable, le JSONL
   resterait vide.
3. **Le nom `beacon` est déjà pris sur cette machine** : le projet Théo
   (`Desktop/AI/Theologicus AI`) utilise `beacon` / `beacons` dans son
   vocabulaire. Un binaire `beacon` dans le `PATH` créerait une confusion.

### Si vous décidez d'y aller

Installation **Windows** (le MSI x64 existe, la doc `manual-install` ne mentionne
que macOS/Linux pour les archives, donc c'est le MSI qu'il faut prendre) :

```bash
msiexec /i BeaconEndpointAgent-<version>-x64.msi
```

Puis vérifier, sans rien laisser tourner :

```bash
beacon version
beacon mcp doctor
beacon memory list --limit 5
```

Et la seule partie qui serait **immédiatement utile** même sans hooks : le
serveur MCP. Je pourrais le déclarer dans `~/.workbuddy-ai/mcp.json` —

```json
{ "mcpServers": { "beacon": { "command": "beacon", "args": ["mcp", "serve"] } } }
```

— mais les sept outils liraient un magasin **vide** tant que les hooks ne sont
pas branchés. Je recommande d'attendre.

---

## 6. Verdict

**Beacon répond à un vrai problème** — la connaissance qui meurt avec une
session —, il est **MIT**, **local-first**, sans dépendance hébergée, et sa
séparation mémoire-approuvée / trace-brute est saine. Sur un harnais supporté
(Claude Code, Cursor, Codex), je le recommanderais sans réserve.

**Mais sur cette machine, la boucle ne peut pas se fermer** : la capture dépend
de hooks que WorkBuddy n'expose pas, et le dépôt ne le connaît pas. Installer
Beacon aujourd'hui produirait un tuyau sans eau.

**Ce que j'ai fait à la place**, et qui est acquis : les trois principes du §4 —
séparation approuvé/brut rendue explicite, **test de non-duplication avant
création d'un skill**, et **méthode de requête par termes ET-és**. Ils sont
transposables dès maintenant, sans rien installer, et ils durcissent un système
qui existe déjà.

**Ce qui reste ouvert**, si WorkBuddy devient un harnais supporté un jour :
brancher `beacon endpoint hooks install`, vérifier que le JSONL se remplit, puis
déclarer le serveur MCP. À ce moment-là, l'intégration serait celle décrite au
§5 — et les trois skills `beacon-memory-*` pourraient être repris tels quels.
