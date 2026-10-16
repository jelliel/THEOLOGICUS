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

> **Décisions prises par défaut pour débloquer T2** (faute d'arbitrage) : la
> tranche 2 a été construite en prenant **l'option la plus conservatrice** sur
> Q2 — seules les citations **délimitées** (`« »`, `" "`, `“ ”`) et
> **adjacentes** (≤ 40 caractères de la référence) sont appariées ; sans
> citation délimitée, **le module ne dit rien**. Ce choix ne peut pas produire
> de faux positif. Q1 et Q3 restent **ouvertes** : elles ne bloquent pas T2,
> mais bloquent T3.

1. **Le ✅ actuel doit-il changer ?** Il porte sur la référence ; une pastille
   verte à côté d'un texte cité se lit comme « citation exacte ». Options :
   (a) garder ✅ pour la référence et ajouter une marque distincte pour le
   texte ; (b) réserver ✅ au texte conforme et dégrader la référence à un
   simple lien vérifié. **Décision nécessaire avant la tranche 3 (UI).**
2. **Périmètre du texte comparé** : seulement les citations explicitement
   introduites (« il est écrit », « : ») ou tout passage entre guillemets ?
   → **tranché pour T2** : citations délimitées ET adjacentes (voir ci-dessus).
3. **Traduction de référence** : le corpus local est la BJ 1998. Faut-il
   comparer aussi aux autres versions embarquées (biblelt, biblegr…) et
   signaler « conforme dans une autre version » ? **Ouverte.**

## 10. Découpage (tranches atomiques)

- [x] **T1 — le comparateur** (pure fonction). Aucune dépendance.
  - Acceptance : verdicts conformes à la section 8.
  - Verify : banc `_v590` (21/21).
  - Files : `THEOLOGICUS.html` (1 module), `_v590/verify_v590_citations.js`.
- [x] **T2 — l'appariement** référence ↔ texte cité.
  - Acceptance : citations délimitées + adjacentes appariées ; **aucune**
    appariée sinon ; deux références dans un même bloc → aucun mélange.
  - Verify : banc `_v590` (34/34, sections 9 et 10).
  - Files : `THEOLOGICUS.html` (même module), banc.
  - Décision : travaille sur les éléments `.bible-ref` **déjà rendus** par
    l'appareil existant — le module ne re-parse donc pas les références
    (aucune duplication de `parseRef` / `BOOK_NUM`).
- [x] **T3 — l'UI** (module `v591-citations-ui`) : marque distincte posée sur le
  TEXTE CITÉ (✓ vert conforme / ≈ orange proche / ≠ rouge divergent), le ✅
  existant restant intact. Respecte le réglage `theologicus_verify` (off/souple/
  strict), `demarquer()` pour re-marquer, idempotent, **ne touche pas au message
  en cours de flux** (`.theo-streaming`, l.12376) et reprend après.
  - Acceptance : voir le banc `_v591` (24/24).
  - Décision : option (a) de la Q1 — AJOUTER une marque, ne pas changer le sens
    du ✅ déjà livré. Réversible.
- [x] **T4 — les références magistérielles : la SOMME** (module v591 étendu).
  Corpus **français** trouvé en local : traduction Drioux (domaine public),
  `summafr/`, 613 questions, chargée à la demande par `__ensureSummaFrQuestion`.
  L'app rend déjà `<a class="theo-ref summa-ref" data-summa="1002"
  data-summa-a="3">` : qid et article sont dans les attributs, rien à re-parser.
  - **Règle retenue, et elle est prouvable : on ne marque QUE ce qu'on a
    trouvé.** ✓ le texte est dans l'ARTICLE cité ; ⇄ il est dans la QUESTION
    mais pas dans l'article cité (mauvaise attribution — signal vérifiable) ;
    **rien** si introuvable. Le corpus est une **OCR de 1851** (« Mar.ière dout
    Aristolc ») : une différence peut venir de la traduction ou de la
    numérisation, pas du modèle. Accuser à tort une citation magistérielle
    serait pire que se taire.
  - ⚠️ **Limite assumée** : ni le Catéchisme (CEC) ni les conciles n'ont de
    corpus texte local — seules les références à la **Somme** sont vérifiables.
  - Banc `_v593` **17/17**.
  - 🔴 **Deux correctifs trouvés par le banc** :
    1. **BUG RÉEL** : `marquerSumma` ne testait pas le mode « off » → il
       marquait quand même. Corrigé (le mode vaut pour les deux corpus).
    2. **Faiblesse de conception** : sur un texte LONG (~10 000 caractères),
       la couverture par sous-séquence est **laxiste** — une citation d'un
       AUTRE article de la même question atteignait **86 %** (vocabulaire
       partagé). Ajout de `contient()` dans v590 : « présent » = **contigu**
       aux limites de mots près. Un test négatif du banc affirme explicitement
       que des mots présents mais NON contigus ne comptent pas.

## 11. Constats annexes (trouvés en chemin, NON corrigés ici)

Ces trois points sont hors périmètre de la tranche en cours. Ils sont notés
parce qu'ils sont **vérifiés**, pas supposés.

1. ✅ **CORRIGÉ (v592) — `parseRef` ne résolvait pas les livres numérotés en
   abrégé.** Mesuré avant : `2 Tm 3,16` → **null**, `2Tm 3,16` → **null**,
   `1 Co 13,4` → **null** (seule la forme longue marchait). Deux causes : la clé
   était reconstruite avec un espace (`"2 tm"`) alors que `BOOK_NUM` ne contient
   que `"2tm"` ; et la regex exigeait un espace après le numéro.
   Correctif : `\s*` après le numéro + **table dérivée sans espaces** testée en
   second recours (on ne réécrit pas `BOOK_NUM`, il sert ailleurs).
   **Second défaut trouvé en écrivant le banc** : la classe de caractères du nom
   de livre excluait l'ESPACE, donc la clé `'cantique des cantiques'` — pourtant
   présente dans `BOOK_NUM` — était **inatteignable** : la forme longue n'avait
   jamais résolu. Corrigé aussi (le garde-fou reste la table : « voir Jean
   3,16 » → clé « voir jean » → null).
   Banc `_v592` **15/15** : 15 abréviations numérotées, 13 formes déjà
   supportées, **11 cas négatifs** (élargir ne doit pas rendre permissif),
   plages/« : », intégration avec le ✅ existant et avec v590/v591.
   ⚠️ **Reste à faire** : `BOOK_NUM` a **au moins 3 copies** dans le fichier
   (`BOOK_NUM` l.26839, `SCH_BOOKS` l.30479, `FR2NUM` l.47235). Seule celle de
   `parseRef` est corrigée. Les deux autres alimentent d'autres fonctions
   (schéma, AELF) et portent **la même faiblesse** sur les livres numérotés :
   à traiter dans une tranche dédiée, et la duplication mérite d'être résorbée.
2. **Anomalie de corpus** : le texte de `Mt 5,3` (BJ) commence par un guillemet
   droit parasite — `"Heureux ceux qui ont une âme de pauvre…`. À vérifier dans
   la chaîne de fabrication du corpus.
3. ✅ **Défaut RÉEL trouvé par le banc et corrigé (T3)** : la marque ✅ de
   l'appareil existant est insérée **entre** la référence et la citation
   (`initVerifyMarks`, l.27588). Sans traitement, elle **masquait** le texte et
   la détection échouait dès que le ✅ était posé — donc en production, et pas
   dans un banc exécuté trop tôt. Correctif : `voisinTexte()` saute les nœuds de
   marque (`verify-mark`, `v591-cite`) et les nœuds texte vides ; les glyphes de
   marque sont aussi absorbés par les séparateurs. Deux assertions de
   non-régression ajoutées au banc `_v590`.
