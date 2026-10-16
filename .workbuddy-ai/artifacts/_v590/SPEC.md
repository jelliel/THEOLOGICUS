# SPEC — v590 : vérification de FIDÉLITÉ des citations

Statut : **tranche 1 implémentée**, tranches 2+ en attente d'arbitrage (voir
« Questions ouvertes »).

## 1. Objectif

Une réponse de THEOLOGICUS peut écrire :

> « Jn 3,16 : *Dieu a tant aimé le monde qu'il a donné son Fils unique* » ✅

Aujourd'hui le ✅ signifie **« cette référence existe »** — il est produit par
`initVerifyMarks()` (ligne 27539) à partir des **seuls numéros** du verset
(`window.__bibleVerseCounts`). Il **ne dit rien du texte cité**. L'utilisateur
peut donc lire « ✅ » comme « cette citation est exacte » alors que le texte a
été altéré. C'est un faux positif silencieux — le pire genre, puisqu'il porte
sur une autorité.

**Objectif** : rendre le ✅ vrai, en vérifiant le **texte**, pas seulement la
référence. Succès = une citation altérée n'est plus marquée conforme.

## 2. État des lieux VÉRIFIÉ (ce qui existe déjà — ne pas reconstruire)

| Élément | État | Ce qu'il fait / ne fait pas |
|---|---|---|
| `parseRef` + `BOOK_NUM` | **existe** (26869 / 26840) | « Jn 5,1 » / « Gn 5:1 » → `{book, ch, v1, v2}`. Alias FR + abréviations. |
| `window.__bibleVerifyState` | **existe** (26859) | `ok` / `missing` / `unknown` — **existence** du verset, via les compteurs. |
| `quranParseRef` + `quranVerifyState` | **existe** (27545) | idem pour le Coran. |
| `initVerifyMarks()` | **existe** (27539) | pose ✅/⚠️/✏️ sur `a.bible-ref` / `a.quran-ref`, 3 modes (`theologicus_verify` : strict/souple/off), réglage UI ligne 12769. |
| `THEO_REF_RE` + `theoRefHtml` | **existe** (10283 / 10403) | détecte Somme/CEC/encycliques/conciles/Pères → **lien externe**, **aucune vérification**. |
| Comparaison **texte cité ↔ corpus** | **ABSENT** | ← c'est tout l'objet de cette spec. |

## 3. Commandes (réel)

```
Bancs (isolés)   : node .workbuddy-ai/artifacts/_v590/verify_v590_citations.js
Contrôles        : py tools/verifier_assets.py
Copies embarquées: py tools/sync_html.py --check      (doit finir à 0 écart)
CI               : déclenchée par THEOLOGICUS.html + .workbuddy-ai/artifacts/_v5*/verify_*.js
```

## 4. Structure

```
THEOLOGICUS.html                     → module <script id="v590-citations"> avant </body>
.workbuddy-ai/artifacts/_v590/       → SPEC.md, banc, script d'application
```
Le module est **additif** : il n'écrase aucun global existant, il expose
`window.__v590Citations`.

## 5. Style (extrait réel du module)

```js
function comparer(cite, reel) {
  var c = normaliser(cite), r = normaliser(reel);
  if (!c || !r) return { verdict: "indetermine", score: 0 };
  if (c === r) return { verdict: "conforme", score: 1, partiel: false };
  if (c.length >= 8 && r.indexOf(c) !== -1) return { verdict: "conforme", score: 1, partiel: true };
  var score = 1 - levenshtein(c, r) / Math.max(c.length, r.length);
  return { verdict: score >= 0.97 ? "conforme" : (score >= 0.55 ? "approximatif" : "divergent"), score: R3(score) };
}
```
Conventions du dépôt : `var`/`function` (pas de classes), IIFE `"use strict"`,
garde d'idempotence `if (window.__X) return`, aucun `innerHTML` avec données
utilisateur, CRLF obligatoire dans le fichier.

## 6. Stratégie de test

Banc Playwright (convention du dépôt) dans `_v590/verify_v590_citations.js`,
magasin isolé (`spawnRelay({localAppData})`). Il **appelle la fonction réelle
dans la page** (donc il prouve aussi qu'elle est exposée) sur des cas figés :
citation exacte, citation avec variantes typographiques (« » vs " », accents,
apostrophes ’ vs '), citation **partielle**, paraphrase, texte étranger, entrée
vide. Chaque verdict est affirmé. Le banc échoue si un cas change de verdict.

## 7. Limites (Always / Ask first / Never)

- **Always** : normaliser des deux côtés avec la MÊME fonction ; retourner
  `indetermine` plutôt que de deviner ; documenter les seuils.
- **Ask first** : modifier `initVerifyMarks` (comportement existant visible) ;
  changer les libellés ✅ ; toucher au réglage `theologicus_verify`.
- **Never** : présenter « approximatif » comme « conforme » ; comparer sans
  normaliser (les variantes typographiques sont légitimes) ; bloquer le rendu
  du chat (la vérification est un ornement, jamais un préalable).

## 8. Critères de succès

1. `comparer()` distingue exact / partiel / paraphrase / étranger / vide.
2. Les variantes typographiques ne créent **aucun** faux « divergent ».
3. Une altération d'un mot ne produit **pas** « conforme ».
4. Le module est inerte au repos (aucun DOM, aucun réseau, aucun timer).
5. Banc vert, `verifier_assets.py` vert, `sync_html --check` à 0 écart.

## 9. Questions ouvertes (arbitrage humain requis)

1. **Le ✅ actuel doit-il changer ?** Il porte sur la référence ; une pastille
   verte à côté d'un texte cité se lit comme « citation exacte ». Options :
   (a) garder ✅ pour la référence et ajouter une marque distincte pour le
   texte ; (b) réserver ✅ au texte conforme et dégrader la référence à un
   simple lien vérifié. **Décision nécessaire avant la tranche 3 (UI).**
2. **Périmètre du texte comparé** : seulement les citations explicitement
   introduites (« il est écrit », « : ») ou tout passage entre guillemets ?
   Le premier est plus sûr (moins de faux positifs), le second plus complet.
3. **Traduction de référence** : le corpus local est la BJ 1998. Faut-il
   comparer aussi aux autres versions embarquées (biblelt, biblegr…) et
   signaler « conforme dans une autre version » ?

## 10. Découpage (tranches atomiques)

- [x] **T1 — le comparateur** (pure fonction). Aucune dépendance.
  - Acceptance : verdicts conformes à la section 8.
  - Verify : banc `_v590`.
  - Files : `THEOLOGICUS.html` (1 module), `_v590/verify_v590_citations.js`.
- [ ] **T2 — l'extracteur** : repérer dans une réponse les passages cités et
  les apparier à leur référence. Dépend de la Q2.
- [ ] **T3 — l'UI** : marquer chaque citation. Dépend de la Q1.
- [ ] **T4 — les références magistérielles** (Somme, CEC, conciles) : il faut
  un corpus texte pour comparer ; aujourd'hui `theoRefHtml` ne fait qu'un lien.
  Dépend d'un arbitrage de périmètre (le corpus Somme/CEC est-il complet ?).
