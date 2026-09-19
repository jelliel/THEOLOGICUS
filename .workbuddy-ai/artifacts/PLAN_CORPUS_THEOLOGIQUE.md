# Plan — corpus théologique local (toutes confessions)

> Rédigé le 2026-09-19 après **sondes réelles**. Base : `apk-v2.0.50`,
> correctif `biblia://` livré (`a86a227`).
> Décision utilisateur : périmètre **toutes confessions d'emblée**,
> démarrage par **newadvent.org**.

---

## 1. Faisabilité mesurée (pas estimée)

| Source | Statut | Mesure |
|---|---|---|
| **Somme théologique** (newadvent/summa) | ✅ exploitable | 200 · 36 020 caractères · 11 balises de titre sur Q.1 |
| **Pères de l'Église** (newadvent/fathers) | ✅ exploitable | 200 · texte structuré |
| **Catéchisme du Concile de Trente** | ❌ **404** | `newadvent.org/catechism/` n'existe pas — chemin à retrouver |
| **CCEL** (protestant) | ⚠️ JS | 34 Ko de HTML → 2,7 Ko de texte : page rendue côté client, **API à utiliser** |
| **Denzinger** | ⚠️ lourd | scans/PDF **latins** → OCR obligatoire, résultat en latin |

### La Somme, chiffrée

L'index renvoie 5 parties (`/summa/1.htm` … `/summa/5.htm`), chacune listant ses
questions. **619 pages de questions** :

| Partie | Questions | Numérotation |
|---|---|---|
| Prima Pars | 119 | 1001 → 1119 |
| Prima Secundae | 114 | 2001 → 2114 |
| Secunda Secundae | 192 | 3001 → 3189 |
| Tertia Pars | 92 | 4001 → 4090 |
| Supplement | 102 | 5001 → 5099 |

**Une page = une question** contenant tous ses articles. Ordre de grandeur :
~10-15 Mo de texte brut, soit **~3-5 Mo dans l'APK** (le corpus actuel fait
51 Mo sur le disque pour un APK de 11,3 Mo : le texte se compresse fort).

---

## 2. Architecture retenue

On **copie** le motif qui marche déjà pour `bible/`, `quran/`, `tafsir/` :

```
summa/
  index.js            -> window.__summaIndex  (parties -> questions -> titres)
  s1001.js ...        -> une tranche par question (chargee a la volee)
```

- **Jamais de préchargement** : le tafsir pèse 41 Mo et `AndroidManifest.xml`
  n'a **pas** `largeHeap`. Tout se charge à la demande, comme
  `__ensureBibleBook()` / `__ensureQuranSurah()`.
- **Résolution en cascade**, identique à la v2.0 §4.1 : la référence se résout
  en local, le lien web ne devient qu'une sortie de secours.
- **Marques de vérification** : on réutilise le moteur T4 — « Somme Ia q. 9999 »
  n'existe pas → ⚠️ citation inventée.

---

## 3. Découpage en tranches livrables

Chaque tranche est utilisable seule.

| # | Tranche | Source | État |
|---|---|---|---|
| **T1** | **Somme théologique** (611 questions) | newadvent/summa | **FAIT** — 611/611, 3 115 articles, 17 Mo |
| **T2** | Pères de l'Église (œuvres principales) | newadvent/fathers | **FAIT** — 118 œuvres, 36 Mo, 416 alias |
| **T3** | Protestant (Calvin, Luther, confessions) | CCEL, ThML | **FAIT** — 91 entrées, 27,8 Mo, 190 alias |
| **T4** | Orthodoxe | Hapgood 1906 + Schaff | **FAIT** — 43 entrées, 1,9 Mo, 168 alias |
| **T5** | Islamique — le hadith | Houdas & Marçais 1903-1914 | **FAIT** — 93 livres, 5,4 Mo, 102 alias |
| **T6** | Denzinger | Denzinger 1911, 11e éd. | **FAIT** — 128 sections, 1,3 Mo, 292 alias |

**Ordre recommandé : T1 → T2 → T3 → T5 → T4 → T6.** T1 et T2 sont livrées et
donnent un résultat visible rapidement.

### Structure réelle de newadvent/fathers (mesurée, pas supposée)

- L'index liste **419 œuvres** de **69 auteurs** ; l'identifiant est `NNWW`
  (groupe + œuvre). `3402` = Ambroise, *Le Saint-Esprit*.
- **315 œuvres sont « feuilles »** : tout le texte est sur la page.
- **104 ne sont que des sommaires** ; le texte vit sur des pages filles dont
  l'identifiant *commence par* celui de l'œuvre et est plus long.
  Deux schémas coexistent : `1101 → 110101…110113` (6 chiffres) et
  `3402 → 34021, 34022, 34023` (5 chiffres). Les filles sont toujours des
  feuilles : **jamais un troisième niveau**.
- Règle retenue, valable pour les deux schémas :
  `fille.startswith(œuvre) and len(fille) > len(œuvre)`.
- Dans une page : `<h1>` titre, `<h2>`/`<h3>` sections, `<p>` paragraphes.
  Le bloc `<div class="pub">` = « About this page » (source, traducteur) :
  **à supprimer**, sinon on embarque du bruit.

###Poids : pourquoi 118 œuvres et non 419

Le corpus complet avoisine **200 Mo** de texte. On ne garde qu'un **noyau
choisi de 118 œuvres** (Pères apostoliques, apologistes, grands traités
dogmatiques, conciles œcuméniques) = **36 Mo**.

Point clé mesuré sur un APK existant : les `.js` dans `assets/` sont **déflatés
au ratio 0,19** (51,86 Mo → 9,74 Mo). Les 36 Mo du corpus ne coûtent donc
que **~7 Mo** dans l'APK. Le poids disque n'était pas le vrai problème.

### T4 en détail — ce qui manquait vraiment

Les Pères *grecs* étaient déjà couverts par T2 (Athanase, les trois
Cappadociens, Cyrille de Jérusalem, Jean Chrysostome, Jean Damascène, et les
**sept conciles œcuméniques** en 18 entrées). Ce qui manquait, c'était tout
ce qui est **spécifiquement orthodoxe et post-patristique** :

1. **La liturgie byzantine.** *Service Book of the Holy Orthodox-Catholic
   Apostolic Church*, Isabel F. Hapgood, 1906 — domaine public, OCR de 1,88 Mo
   sur archive.org (`cu31924029363128_djvu.txt`). Découpage : liturgie de
   saint Jean Chrysostome, des Présanctifiés, Vigile, Heures, Grandes
   Complies, les Mystères, les Douze Grandes Fêtes, les huit tons.
2. **Les symboles orientaux.** Schaff, *Creeds of Christendom*.

**Piège mesuré sur Schaff, à retenir** : le volume II est une édition
critique qui n'imprime les confessions grecques qu'en **grec et latin**, en
colonnes parallèles — donc dans des `<table>`, que le parseur écarte. Le
texte **anglais** de ces confessions est dans le **volume I** (« The History
of Creeds »), chapitre 3. D'où `s_greekchurch` et `s_oecumenical` depuis
`creeds1`, et `s_philaret` / `s_rules` depuis `creeds2`.

Autre piège : le tokenizer ThML ne lit `title=` que placé juste après le nom
de balise. `creeds2` écrit `<div2 id="…" title="…">` → **tous les titres
disparaissaient**. `fix_titles()` remonte l'attribut en tête.

**Le philologue, pas l'heuristique.** Le découpage du *Service Book* est fait
sur des **indices de lignes mesurés**, pas devinés : le nettoyage ne supprime
jamais de ligne (il les vide), donc les indices restent valides. Trois pièges
OCR réels, tous rencontrés :
- les **en-têtes de page** (« THE DIVINE LITURGY 65 ») se répètent ~60 fois →
  écartés par fréquence, sauf ceux marqués `*` ou précédés d'un chiffre romain ;
- un titre peut être **coupé par une césure** sur deux lignes
  (« THE ORDI- » / « NATION OF A DEACON ») → on recolle comme un paragraphe ;
- une page d'illustration a été **retournée** par l'OCR
  (« HDHAHD 3H1 JO WSnOaiMAS SHX ») → une seule occurrence, liste explicite.

### T5 en détail — le troisième pilier, en français

L'application avait déjà le **Coran** (français + arabe) et le **tafsir**
d'Ibn Kathir (anglais). Manquait le **hadith**, et surtout en français.

Source : **Houdas & Marçais, *Les traditions islamiques*** — la traduction
française du *Sahih* d'Al-Bukhari, 1903-1914, 4 tomes, domaine public,
archive.org (`lestraditionsisl0Nmuamuoft`), 6,5 Mo d'OCR.

Structure mesurée : `TITRE PREMIER.` (le livre) → nom en majuscules sur la
ligne suivante → `CHAPITRE …` → traditions numérotées.

**Le piège central, et il est trompeur :** chaque tome porte **deux séries**
de lignes `TITRE`. Celle du corps (numéros croissants), puis celle de la
**table des matières** en fin de volume, en majuscules avec le nom après un
tiret (`TITRE IV. — DES ABLUTIONS.`). Garder les deux doublait le corpus et
faisait gagner la table sur le corps : les numéros devenaient absurdes
(« DE LA SCIENCE » = 49) et la moitié des livres partaient en identifiant de
rebut. On coupe net à la première ligne `TABLE DES MATIÈRES`.

**Deuxième décision, contre-intuitive :** les **chiffres romains ne sont pas
fiables** — l'OCR lit `Ilï` pour III, `VL` pour VI, `XL` pour XI, `L\\V` pour
LXV. Un identifiant tiré du chiffre était faux une fois sur trois. L'**ordre
du corps** est fiable, le chiffre ne l'est pas : les identifiants sont donc
**séquentiels** (`bukh_01`… `bukh_92`). Ils tombent juste, l'ordre canonique
du Sahih étant celui du corps : Révélation, Foi, Science, Ablutions, Lotion,
Menstrues, Lustration pulvérale, Prière…

Autres pièges rencontrés :
- le mot « **titre** » apparaît en plein texte (« titre d'échange, mille
  dirhems ») → la regex `TITRE` est désormais **sensible à la casse** ;
- le nom du livre manque parfois ; la ligne suivante est alors déjà le premier
  `CHAPITRE`, en majuscules lui aussi → ne pas le prendre comme titre ;
- l'OCR colle aux noms des **appels de note** (« DE L'UNITÉ DE DIEU ffl »,
  « DES MALADES d) ») → dernier mot de moins de 4 lettres **sans voyelle**
  = bruit, on le retire.

**Le livre I n'a qu'un chapitre et ce n'est pas un bug** : vérifié sur
l'OCR, les 480 lignes du « TITRE PREMIER » tiennent en un seul `CHAPITRE`
suivi de traditions longuement commentées.

### T6 en détail — le Denzinger, et pourquoi on ne découpe pas par numéro

Le Denzinger est célèbre pour ses **numéros marginaux** (« Denzinger 3020 »).
Trois mesures faites avant d'écrire une ligne, toutes négatives :

| Ce qu'on voudrait | Ce qu'on mesure | Conséquence |
|---|---|---|
| découper par **numéro marginal** | ~1100 retrouvés sur ~2200, suite **non monotone** | impossible |
| découper par **page imprimée** | 67 numéros isolés sur ~950 pages, non monotones | impossible |
| découper par **titre de section** | titres corrects et dans l'ordre | **c'est celui-là** |

Le découpage retenu est donc par **section** : un pontife ou un concile
(« S. LEO I M. 440—461. », « Conc. TRIDENTINUM 1545—1563. »), les sessions et
les canons devenant des chapitres à l'intérieur. **128 sections.**

**Piège majeur — il a failli livrer un corpus faux.** Deux scans de la même
édition existent. `...00denz` a le meilleur OCR pour la **table**,
`...01denz` pour le **corps**. Comme les titres viennent du corps, on prend
`...01denz`. Surtout, il ne faut **pas** « corriger » les titres du corps avec
la table : un rapprochement par similarité de nom (seuil 0,55) a remplacé
« S. HYGINUS » par « S. ZOSIMUS » et produit un corpus où **chaque document
était attribué au mauvais pontife** — la règle d'or du projet interdit
précisément ça. Le corpus ne vaut que si l'attribution est sûre.

Autres pièges mesurés :
- les **en-têtes de page** répètent le pontife courant, parfois avec un OCR
  différent (« PELAGIUS I 251—253 » puis « S. CORNELIUS I 251—253 ») → on
  dédoublonne par **années**, pas par titre ;
- l'OCR prend des lettres pour des chiffres (« I676 » pour 1676) →
  normalisation avant comparaison ;
- la particule « **Conc.** » est en minuscules : la compter fait tomber
  « Conc. NICAENUM I 325. » à 0,77 de majuscules et **Nicée disparaît** du
  corpus. On la retire avant de mesurer ;
- **Vatican I** n'a pas de titre propre : il n'apparaît que dans les en-têtes
  doubles. Ses documents sont dans la section Pie IX, et l'alias « Vatican I »
  y pointe explicitement.

---

## 4. Tranche T1 en détail — la Somme

1. **Récupérer** les 5 index de parties, en déduire la liste exacte des 619
   questions (déjà validé : 619).
2. **Aspirer** les 619 pages, une par une, avec temporisation
   (politesse envers le serveur).
3. **Parser** : pour chaque page, extraire le titre de la question puis chaque
   article (les balises de titre sont présentes — 11 sur Q.1).
4. **Produire** `summa/index.js` + une tranche par question.
5. **Brancher** la résolution locale : « Somme Ia q. 2 a. 3 » → panneau local.
6. **Vérifier** en CDP : résolution, mode avion, absence de requête externe,
   non-régression du banc (33/33 + nouveaux contrôles).

### Langue : point à trancher

La Somme de New Advent est la traduction **anglaise** dominicaine (domaine
public). L'application est française. Le code contient déjà ce précédent :
« Version anglaise préférée — français non disponible sur vatican.va ».

→ **Tranché (2026-09-19) : la Somme est aussi disponible en français.**
Voir la section 4 bis ci-dessous.

### 4 bis. La Somme en français — Drioux (T7), livré

Deux traductions intégrales sont en domaine public : **Lachat** (16 volumes)
et **Drioux** (8 volumes, `lasommethologi0Nthom`). Mesuré : Lachat est
**bilingue**, latin et français entrelacés ligne à ligne (10 945 lignes
françaises pour 484 lignes latines longues) — l'extraction du seul français y
est incertaine. Drioux est **français seul** (13 lignes latines sur 28 890).
C'est donc Drioux.

`tools/build_summa_fr.py` → `summafr/` : **613 questions, 2 978 articles,
20,2 Mo**, 614 fichiers. Mêmes identifiants que `summa/` (`1001` = Ia q.1),
donc aucune référence existante à changer.

Comptes par volume, tous exacts : 74 / 84 / 75 / 91 / 98 / 71 / 19 / 101.
Par partie : Ia 119, Ia-IIae 114, IIa-IIae 189, IIIa 90, Supplément 101
(99 + les 2 de l'appendice).

**Cinq pièges, tous mesurés**

1. **La table de fin de volume répète les questions.** Volume 4 l'intitule
   « CONTENUES DANS LE QUATRIÈME VOLUME » et non « TABLE DES MATIÈRES » —
   couper sur la seule deuxième forme laissait 119 questions au volume 4.
   Le volume 7 contient en plus 55 000 lignes d'index latin après sa table.
2. **Le mot-clé QUESTION est lui-même mangé** : `QIESTION`, `OIJESTION`,
   `giiKsrioN`, `OIKSTION`, `QUESTIOxN`, `QUESTlOiN`, `QU^ESTIO`, `QLESTION`.
   Une chaîne littérale perdait 14 questions sur le volume 1. On reconnaît
   donc une *forme* : 6 à 11 lettres, initiale Q/O/G/C/I, finale N ou O,
   contenant `ST` ou `SR`.
3. **Les chiffres romains sont illisibles en décodage direct** : `XIL` se lit
   39 (le `L` final est un `I`), `XLV` se lit 85, `LUI` se lit 56. On génère
   *toutes* les valeurs romaines **syntaxiquement valides** que le token peut
   représenter (chaque caractère ayant ses confusions documentées : G→C,
   U→V ou II, Y→V, H→II, J→I, E→C, L→L ou I…), puis la suite tranche.
   Ne jamais « corriger » un titre par similarité : c'est exactement
   l'erreur qui, sur le Denzinger, attribuait chaque document au mauvais pape.
4. **Le numéro retenu n'est jamais le chiffre lu** : c'est le rang, contrôlé
   par le compte de questions du volume. Le chiffre lu ne sert qu'à
   *confirmer* — il concorde dans 98 à 100 % des cas, et c'est cette
   concordance qui valide la numérotation.
5. **« ARTICLE » est mangé aussi** : `AKTICLE`, `ARTICULUS`, `ARTICULIJS`,
   et « ARTICLE UAfIQUE » pour UNIQUE. À l'inverse, un « article. » en plein
   texte n'est pas un en-tête. D'où une règle mot-clé + chiffre, avec un
   repli approché (distance d'édition ≤ 3) réservé aux lignes courtes.

**Deux questions sont restées en latin chez Drioux** (IIa-IIae q.154,
Supplément q.64). Elles portent `lang: 'la'`, l'index les signale, et
l'application affiche un avertissement : jamais présentées pour du français.

**Dans l'application** : le panneau de la Somme s'ouvre en français, avec un
bouton FR/EN et un repli sur le corpus anglais si la question manque.

---

## 5. Risques et inconnues

| Risque | Parade |
|---|---|
| **Trent : 404** | retrouver le bon chemin, ou renoncer à cette œuvre |
| **CCEL rendu en JS** | passer par leur API ; sinon source protestante de repli |
| **Langue anglaise** | chercher d'abord une édition française libre de droits |
| **Licences** | ne prendre **que** du domaine public confirmé ; le CEC et la BJ 1998 restent exclus |
| **Taille de l'APK** | compression forte + chargement à la volée ; aucun préchargement |
| **Fiabilité des textes** | **jamais** générer un texte théologique : tout provient d'une source réelle et vérifiable |

> Rappel de la règle d'or : on n'invente aucun texte. Une fausse citation
> patristique détruit la confiance — refus déjà acté dans la proposition 2.0.

---

## 6. Prochaine étape

Écrire `tools/build_summa.py` : aspirer + parser, et **d'abord le prouver sur
une seule question** (Prima Pars Q.1) avant de lancer les 619. Si le parsing
tient sur Q.1, on généralise.

Scripts de sondes déjà disponibles (non commités, gitignorés) :
`_probe_sources.py`, `_audit_theo.py`, `_audit_dyn.py`, `_audit_lib.py`.
