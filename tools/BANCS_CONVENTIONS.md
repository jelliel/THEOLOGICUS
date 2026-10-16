# Conventions des bancs Playwright (THEOLOGICUS)

Document vivant des règles vérifiées sur pièce pour les `verify_*.js`. Toute
nouvelle règle y est ajoutée avec le numéro de version qui l'a fait naître.
Lue par `tools/verifier_assets.py` (`controle_bancs_assertions_dom`).

## 0. Principe directeur
**Un banc ne doit dépendre QUE de ce qui est VERSIONNÉ**, et **ne doit casser
que si le DÉFAUT qu'il vise est présent** — jamais parce qu'un AUTRE module a
évolué. Un faux rouge de banc bloque la publication (CI : `bancs → failure`
⇒ pas de release). Donc : un banc fragile est un risque de livraison.

## 1. Ajouts DOM additifs (leçon v598 → v597)
Un module **additif** (bouton sticky, menu, badge) peut ajouter un enfant à un
conteneur **partagé** (`.header-controls` est touché par v6/v31/v35/v597/v598).
Si un banc antérieur COMPTE ou ORDONNE les enfants de ce conteneur, il casse
quand le module additif arrive — **sans aucune régression réelle** (faux positif).

### Règles
- **Ne jamais égaliser `.children.length` (ou `childElementCount`) à un entier
  fixe** sur un conteneur qui peut recevoir des ajouts ultérieurs.
- **Ne jamais ordonner les enfants par une liste en dur** qui inclut les ajouts.
- **Préférer une allow-list des éléments d'ORIGINE** : filtrer les enfants lus
  dans le DOM contre la liste connue des contrôles d'origine, et vérifier leur
  ordre RELATIF. Tout élément ajouté dynamiquement est ainsi ignoré, quelle que
  soit son identité. (Pattern `ORIGINE.filter(id => enfants.includes(id))` dans
  `verify_v597_bande.js`.)
- **Pattern `NORM_ORDRE`** (dans `verify_v598_overflow_menu.js`) : normaliser une
  chaîne d'ordre en retirant les identifiants `vNNN-*` avant comparaison A/B.
- Convention d'identifiants : **un module ajoute ses éléments avec un id
  `vNNN-<nom>`**. Pour repérer un ajout sans le nommer, on peut filtrer tout id
  commençant par `v` suivi de chiffres **à l'exclusion des contrôles d'origine**
  (ceux-ci sont listés explicitement, ex. `v155-atelier`, `v159-media-wrap`).

## 2. A/B d'interface — méthode obligatoire
- **Contrôle négatif exigé** : matérialiser l'état « avant » et exiger qu'il
  ÉCHOUE (sinon le banc ne prouve rien). Reconstruire l'état avant **dans la
  page** (`feuille.sheet.disabled = true`), sans aucun fichier externe — un banc
  ne doit pas dépendre d'un fichier non versionné (`_before.html` a déjà cassé la
  CI, v596/v597).
- **Même viewport des deux côtés** de l'A/B (comparer 1280 vs 1920 fausse la
  signature, vécu v598).
- **SIGNATURE** : exclure `width`/`height` (fragiles : une redistribution de ~4 px
  entre groupes flex ne déplace aucun contrôle existant) **et les classes
  dynamiques d'autres modules** (ex. `v597`, `v597-deborde`).
- **Garde-fou rects-identiques-on/off** : prouver « aucun contrôle existant ne
  bouge » en comparant `getBoundingClientRect()` de chaque enfant, hors l'élément
  ajouté.
- **Éloigner la souris des DEUX côtés** avant de comparer (styles `:hover`).
- Tester l'**EXISTENCE** d'un pseudo-élément (`content`), pas son opacité
  (`getComputedStyle(el,'::after').opacity` vaut 1 par défaut si `content:none`).

## 3. Assertions : comportement, pas libellé
- Ancrer sur le **comportement** (un élément apparaît/clique/ferme), jamais sur
  un **libellé** d'interface (un titre qui change rend le banc rouge pour rien,
  v589).
- Un banc qui lit un **toast** doit vider la file des toasts avant CHAQUE action
  (sinon il ramasse un toast périmé d'une section précédente).

## 4. Mise en place du banc
- Helpers `basculer/ouvrir/fermer` appelant `page.evaluate` doivent être DÉFINIS
  **DANS l'IIFE** (`page` n'existe qu'à l'intérieur), sinon `ReferenceError:
  page is not defined` (vécu v598).
- `spawnRelay({port})` SANS `localAppData` sert le VRAI magasin → TOUT banc :
  `localAppData:<tmp>` + clé semée `provider:model` + fetch INTERCEPTÉ ; attendre
  une condition, jamais un délai fixe.
- Chemins Chromium : derrière `process.env.PW_DIR` (jamais en dur — casse la CI,
  v534).
- Jamais de **BACKTICKS** dans une chaîne passée à `node -e` en shell (bash
  exécute → corruption de fichier). Écrire le patch dans un fichier.

## 5. Garde-fou automatique (`verifier_assets.py`)
`controle_bancs_assertions_dom` scanne les `verify_*.js` (`_v4*`,`_v5*`) et :
- signale en ERREUR tout `.children.length === N` / `childElementCount === N`
  (vrai risque cross-bench) ;
- avertit (non fatal) tout banc qui lit l'ordre des enfants de `.header-controls`
  sans exclusion des éléments dynamiques (ni `.filter(`, ni `NORM_ORDRE`).
Les deux gardes sont conçues pour ne rien signaler aujourd'hui et protéger les
ajouts futurs.
