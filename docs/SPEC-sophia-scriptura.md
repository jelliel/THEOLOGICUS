# SPEC — Intégration Sophia Scriptura (sophiascriptura.com) dans THEOLOGICUS

Statut : **IMPLÉMENTÉE (v673), approche A** — tranches 1 à 4 livrées et vérifiées.

| Tranche | État | Preuve |
|---|---|---|
| 1. Client MCP + cache | ✅ | banc `_v673` : appel réel, 2e appel sans réseau, timeout, hors-ligne → null |
| 2. Détecteur de références | ✅ | 10 formes FR/EN reconnues, 4 pièges sans faux positif |
| 3. Injection dans le prompt | ✅ | prompt système 2 946 c. avec bloc, URL, garde-fous ; borné |
| 4. Réglage par agent + puce | ✅ | case persistée (création + édition), puce avec 3 liens |

Décisions prises à l'implémentation :
- injection en **un seul point** (`_sendMessageOriginal`), donc tous les modèles en bénéficient ;
- les appels utilitaires (questions de suivi) **ne portent pas** le bloc — vérifié (B6) ;
- la puce est ancrée dans `#input-area`, pas dans `#chat-container` (que `renderMessages` reconstruit) ;
- approche **B (tool-calling) non faite** : elle reste ouverte, et devra être mesurée modèle par modèle.

---

## 1. Ce qui est déjà fait et vérifié

| Point | État | Preuve |
|---|---|---|
| Serveur MCP joignable | ✅ | `initialize` → `sophia-scriptura` v1.0.0, protocole 2025-06-18 |
| Authentification | ✅ **aucune** | pas de `Authorization` requise |
| Transport | ✅ Streamable HTTP | réponse JSON directe, `Access-Control-Allow-Origin: *` |
| Outils | ✅ 8 | `lookup_scripture`, `get_passage`, `get_passages`, `search_text`, `lookup_topic`, `list_topics`, `list_works`, `get_author` |
| Données réelles | ✅ | `lookup_scripture("Matthew 19:9")` → 64 résultats datés, avec `cites[]` et URL |
| Connecteur WorkBuddy | ✅ déclaré | `~/.workbuddy-ai/mcp.json` (à activer via « Trust ») |

**Contenu servi** : écrits des Pères (jusqu'à ~451), grec/latin, traduction anglaise **par IA**, référence d'édition, URL canonique, `sbl_footnote`. Couverture **partielle** : un résultat vide veut dire « absent du corpus publié ».

## 2. Ce que l'app ne sait pas faire aujourd'hui (constat, pas supposition)

- **Aucun tool-calling** : zéro occurrence de `tools`, `tool_calls`, `tool_choice` dans les 8,2 Mo.
- `callLLMStream()` (l. 13035) ne lit que `delta.content` ; un `tool_calls` renvoyé par un modèle serait **ignoré silencieusement**.
- Trois fournisseurs : **Mistral** (défaut), **Agnes** (`apihub.agnes-ai.com`), **Ollama** (local). Le support de `tools` n'est pas homogène et n'est pas déclaré dans l'app.

→ Conséquence : « intégrer le MCP » ne peut pas être un simple branchement. Il faut choisir **qui déclenche l'appel**.

## 3. Hypothèses que je fais (corrige-moi maintenant)

1. **Priorité au français** : l'utilisateur écrit en français, le corpus répond en anglais. Les extraits doivent être **cités en anglais** (c'est la source) avec la mention « traduction IA », et l'agent les **commente en français**.
2. **Coût accepté mais borné** : une injection de contexte patristique doit rester **≤ 1 500 tokens** par tour. Donc `compact:true` d'abord, puis `get_passages` sur 2–3 ids au maximum.
3. **Le corpus ne remplace pas la Bible** : il montre *comment les Pères ont lu* un verset, pas le texte biblique lui-même.
4. **Pas de clé, donc pas de quota à protéger** — mais un cache local est nécessaire (mêmes requêtes fréquentes, latence réseau).
5. **Opt-in par agent** : la fonction est activée dans les réglages d'un agent, pas globalement (tous les agents ne sont pas théologiques).

## 4. Deux approches — et ma recommandation

### A. Pré-résolution (recommandée en premier)

L'app **détecte** la référence biblique dans le message de l'utilisateur, interroge le MCP **avant** d'appeler le modèle, et injecte un bloc compact dans le prompt système.

```
message utilisateur
   → détection référence (« Mt 19,9 », « Matthieu 19:9 », « 1 Co 7,10-15 »)
   → lookup_scripture(compact:true, limit:6)
   → get_passages(ids: 2-3 les plus pertinents)
   → bloc « Contexte patristique » dans le system prompt
   → callLLMStream() inchangé
```

- ✅ Fonctionne avec **tous** les modèles (Mistral, Agnes, Ollama), aucun risque fournisseur.
- ✅ Aucune modification de `callLLMStream()`.
- ✅ Coût maîtrisé, comportement déterministe, testable.
- ❌ Le modèle ne peut pas décider lui-même d'un second appel (pas de suivi multi-étapes).

### B. Tool-calling natif

Exposer les 8 outils dans `tools`, boucler sur `tool_calls`, réinjecter `role:"tool"`.

- ✅ Le modèle choisit, peut enchaîner (`lookup_topic` → `get_passages`).
- ❌ Dépend du fournisseur ; sur Agnes/Ollama non vérifié → échec silencieux probable.
- ❌ Touche le cœur de `callLLMStream()` : streaming + outils = complexité réelle (les `tool_calls` arrivent en deltas fragmentés).
- ❌ Coût en tokens et en latence non borné par construction.

**Recommandation** : livrer **A** (couvre tes trois usages : vérifier une citation, enrichir une réponse doctrinale, rechercher un texte via une commande `/peres`), puis **B** en second temps, réservé aux modèles dont le support est **mesuré**, pas supposé.

## 5. Découpage proposé (4 tranches, chacune vérifiable seule)

| # | Tranche | Livrable | Test |
|---|---|---|---|
| 1 | Client MCP + cache | `vNOM` module : `sophia.call(tool, args)`, timeout 8 s, 1 retry, cache mémoire+IDB, `compact` par défaut | banc : 8 outils, réponse hors-ligne servie par le cache, timeout respecté |
| 2 | Détecteur de références | `sophia.detectRefs(texte)` → `[{livre, chapitre, versets}]`, formats FR/EN, numérotation LXX signalée | banc : 25 cas (dont « Mt 19,9 », « Matthieu 19:9 », « 1 Co 7,10-15 », « Ps 22 LXX », faux positifs écartés) |
| 3 | Injection dans le prompt | bloc « Contexte patristique » borné à 1 500 tokens, consignes de citation (URL + `sbl_footnote` + « traduction IA » + « couverture partielle ») | banc : le bloc est présent, borné, et les consignes sont dans le system prompt |
| 4 | Réglage par agent + affichage | case « Patristique » dans les réglages d'agent ; puce « Sources » repliable sous la réponse, liens cliquables | banc : agent sans la case → aucune requête réseau ; agent avec → 1 requête, puce visible |

## 6. Risques identifiés

| Risque | Impact | Parade |
|---|---|---|
| Le modèle invente une citation patristique | **Grave** (fausse autorité) | consigne stricte : n'utiliser que les extraits fournis, jamais de mémoire ; URL obligatoire |
| Latence ajoutée au tour | Moyen | cache + `compact` + timeout 8 s + **dégradation silencieuse** : si le MCP échoue, on envoie le message **sans** le bloc |
| Dépendance externe non maîtrisée | Moyen | tout est derrière un drapeau par agent ; l'app reste pleinement fonctionnelle sans réseau |
| Dérive de la traduction IA présentée comme source | Grave | mention obligatoire, imposée dans le prompt **et** dans l'UI |
| `get_passages` renvoie 20 passages → explosion du prompt | Moyen | plafond dur : 3 ids, troncature à 400 caractères par extrait |

## 7. Ce que je ne ferai pas sans ton accord explicite

- Modifier `callLLMStream()` (tranche B).
- Envoyer une requête au MCP pour un agent où la case n'est pas cochée.
- Stocker autre chose que les réponses en cache (aucune donnée personnelle transmise : seules les références et les mots-clés sortent).

---

**Décision attendue** : GO sur l'approche **A** (pré-résolution) pour les tranches 1→4, ou GO direct sur **A+B** ?
