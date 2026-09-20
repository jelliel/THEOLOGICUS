# Sources des données linguistiques

THEOLOGICUS embarque ses corpus pour fonctionner sans réseau. Chaque
source est listée ici avec sa licence et l'endroit où elle apparaît dans
l'application.

## Arabe — mot à mot et translittération

- Source : api.quran.com (Quran Foundation), API v4.
- Contenu : pour chacun des 77 419 mots du Coran, une glose anglaise et
  une translittération.
- Fichiers : `quranwbw/`.
- Licence : diffusion libre par l'API publique. Attribution : Quran
  Foundation / api.quran.com.

## Arabe — racines, lemmes et morphologie

- Source : **Quranic Arabic Corpus** (Dr Kais Dukes, université de
  Leeds) — https://corpus.quran.com
- Contenu : racine trilitère (ex. `سمو` pour `بِسْمِ`), lemme, catégorie
  grammaticale, traits morphologiques. 50 262 mots porteurs d'une racine.
- Fichiers : `quranroots/` ; le fichier source
  `quranroots/quran-morphology.txt` est livré **verbatim**, jamais
  modifié.
- Licence : **GNU General Public License**. La notice du corpus impose :
  « *Permission is granted to copy and distribute verbatim copies of this
  file, but CHANGING IT IS NOT ALLOWED* » et « *This annotation can be
  used in any website or application, provided its source (the Quranic
  Arabic Corpus) is clearly indicated, and a link is made to
  http://corpus.quran.com* ». L'application affiche donc la mention
  « Racine : Quranic Arabic Corpus (GPL) » avec le lien.

## Hébreu — texte vocalisé, lemmes et morphologie

- Source : **Westminster Leningrad Codex (WLC) 4.20** publié par
  *Open Scriptures Hebrew Bible* — fichiers `wlc/*.xml` du dépôt
  https://github.com/openscriptures/morphhb
- Contenu : texte hébreu **vocalisé**, lemme (numéro Strong), code de
  morphologie Westminster. 303 979 mots.
- Fichiers : `biblehb/b1.js` … `biblehb/b39.js` (un par livre), plus
  `biblehb/strongs.js` (8 674 entrées : lemme vocalisé, translittération
  historique, définition KJV en anglais).
- Licence : le texte du WLC est dans le **domaine public** ; lemmes et
  morphologie sont diffusés sous **CC BY 4.0** — attribution obligatoire
  (« Open Scriptures Hebrew Bible Project »), affichée dans l'infobulle.

### Pourquoi le WLC et pas `oshb.js`

`oshb.js` (même dépôt) est numéroté selon la **KJV**, où le titre d'un
psaume est fondu dans le verset 1. Le corpus français de THEOLOGICUS
(BJ) suit la numérotation **massorétique**, où ce titre est un verset à
part entière. Mesuré chapitre par chapitre, sur les 39 livres :

| source comparée au corpus français | chapitres alignés |
|---|---|
| `oshb.js` (numérotation KJV)    | 787 / 930 (84,6 %) |
| `wlc/*.xml` (numérotation massorétique) | 921 / 931 (98,9 %) |

Le WLC a donc été retenu. Ses 10 chapitres non alignés ne sont **pas
émis** : Gn 15, Ex 30, 1 S 28, 2 R 11, 2 Ch 10, Ps 51, Ps 103, Dn 3
(lacunes du corpus français ou différences de canon : Dn 3 comprend les
additions grecques, Dn 13 et Ml 4 n'ont pas d'hébreu).

### Translittération

Mécanique et déterministe : table lettre par lettre appliquée au texte
vocalisé (consonnes, *matres lectionis*, dagesh, point du shin/sin,
sheva vocal ou muet). Le Tétragramme est rendu « YHWH », convention
documentée du *Qere* perpétuel. Aucune voyelle n'est reconstruite : la
translittération ne fait que rendre les signes présents dans la source.

### Pas de « racine » trilitère

La racine trilitère hébraïque n'est **pas** dans les données sous
licence utilisées. L'application affiche donc le **lemme** (entrée
lexicale Strong, vocalisée) et le nomme ainsi, plutôt que de proposer
une racine qui serait reconstruite — donc potentiellement fausse.

## Arabe — traduction française du mot à mot

Les gloses d'origine sont **anglaises**. Pour les afficher en français,
THEOLOGICUS utilise **LibreTranslate** installé sur la machine
(`tools/start_libretranslate.py`) : aucune clé API, aucun texte ne sort
de l'ordinateur. Le vocabulaire est traduit une seule fois (23 667
gloses distinctes), puis figé dans `quranwbw/`.

Deux précautions :

- la traduction est **automatique** et l'application l'étiquette comme
  telle (« trad. auto. »), la glose anglaise d'origine restant affichée
  en dessous. Une traduction automatique n'est jamais présentée comme
  une source ;
- le moteur se trompant sur le vocabulaire théologique (« the Most
  Gracious » devenait « les plus gracieuses », « All-Wise » « Tous les
  jours »), un **glossaire vérifié** corrige les épithètes divines et
  quelques termes clés (`CORRECTIONS` et `EPITHETES` dans
  `tools/traduit_gloses.py`). C'est un correctif ciblé, pas une
  réécriture : tout le reste reste la traduction automatique.

Moteur : Argos Translate (en→fr), via LibreTranslate.

## Grec — texte, lemmes et morphologie (Nouveau Testament)

- Source : **MorphGNT — édition SBLGNT**, James K. Tauber, version 6.12,
  DOI 10.5281/zenodo.376200. 27 fichiers au format
  `BBCCVV POS parsing texte mot mot_normalisé lemme`. 137 547 mots.
- Fichiers : `biblegr/b40.js` … `biblegr/b66.js` (un par livre), plus
  `biblegr/strongs.js` (5 523 entrées grecques).
- Deux licences distinctes, **vérifiées sur les pages officielles** et non
  déduites d'un README :
  - le texte SBLGNT est sous **CC BY 4.0**. La page
    <https://sblgnt.com/license/> s'intitule « End User License Agreement »,
    mais son contenu est bien le texte intégral de la licence Creative
    Commons Attribution 4.0 ;
  - la morphologie et la lemmatisation MorphGNT sont sous **CC BY-SA 3.0**.
- Conséquence **assumée** : le corpus dérivé `biblegr/` est publié sous
  **CC BY-SA 3.0**, avec attribution (SBLGNT + MorphGNT / J. K. Tauber)
  affichée dans l'infobulle et reprise ici. C'est le prix du mot à mot
  complet : les sources grecques libres de droits ne fournissent que le
  texte, sans lemme ni analyse grammaticale.

### Alignement des versets — pourquoi il manque des versets

La BJ porte des versets que le **texte critique** n'a pas : Mt 17,21 ;
Mc 7,16 ; Lc 23,17 ; Jn 7,53–8,11 (la péricope de la femme adultère) ;
Rm 16,25-27 ; etc. Leur numérotation ne se **décale pas** : un verset
absent est simplement sauté, ses voisins gardent leur numéro (vérifié :
Jn 8 grec = 12 à 59, Rm 16 grec = 1 à 24). Un chapitre est donc émis dès
que chaque verset grec appartient à la plage française.

Chaque manque est confronté à la liste connue des omissions du texte
critique : **0 manque inexpliqué** sur 260 chapitres. Ces versets ne sont
pas passés sous silence — l'infobulle affiche « grec absent pour les
versets … (le texte critique ne les porte pas) ».

Un seul verset est écarté, faute d'équivalent français : **Ap 12,18**
(« il se tint sur le sable de la mer »), que la BJ rattache à Ap 13,1.

### Marques d'appareil critique non reproduites

SBLGNT écrit ⸀ ⸂ ⸃ et trois variantes (5 114 et 1 764 occurrences). Elles
ne se posent cependant pas toujours sur le même mot : en Mt 1,5,
« ⸂Βόες … Ῥαχάβ, Βόες⸃ » encadre cinq mots. Leur sens exact n'ayant pas
pu être établi avec certitude, elles sont **retirées** du mot affiché
plutôt qu'interprétées : affirmer à tort qu'un mot est douteux serait une
erreur d'édition, pas une prudence.

### Lien vers Strong : 94,1 %, sans jamais deviner

Les 5 449 lemmes distincts de MorphGNT ont été confrontés aux 5 523
entrées grecques de Strong :

| cas | lemmes | part des occurrences |
|---|---|---|
| une seule entrée Strong → **relié** | 4 923 | 94,1 % |
| plusieurs entrées (ambigu) → **non relié** | 18 | 4,4 % |
| aucune entrée (surtout des noms propres) → **non relié** | 508 | 1,6 % |

Un lemme ambigu n'est pas relié : aucun numéro Strong n'est inventé. Ces
mots affichent leur lemme et leur analyse grammaticale, sans numéro.
Cas typique : Δαυίδ (David) n'est pas relié parce que Strong écrit Δαβίδ.

### Translittération

Mécanique, comme pour l'hébreu : esprit rude rendu « h », iota souscrit
rendu par une voyelle longue, diphtongues (αι ει οι αυ ευ ου…) et gamma
nasal (γγ γκ γξ γχ → ng nk nx nch) résolus par lecture anticipée d'une
lettre. η et ω sont toujours longs. Aucune accentuation n'est
reconstruite.

## Strong (hébreu et grec)

- Source : Open Scriptures, « Unified Strong's Dictionaries »,
  https://github.com/openscriptures/strongs
- Licence : **GNU GPL 3.0** pour la compilation XML. Les définitions
  originales de Strong (1890) sont dans le domaine public.
- Les définitions sont **anglaises**. Elles sont traduites en français une
  seule fois, en local, par LibreTranslate/Argos
  (`_m/traduit_strongs.py`) — 8 674 entrées hébraïques et 5 523 grecques.
  Même règle que pour l'arabe : la traduction est **automatique**, elle est
  étiquetée « trad. auto. » dans l'application et la source anglaise reste
  affichée en dessous.

  La notation propre à Strong (le « X » des sens incertains, les groupes de
  suffixes comme `god(-ly, -ward)`) **subsiste** dans le français rendu :
  c'est un code editorial qu'aucune traduction automatique ne sait lire. Une
  passe de « décodage » a été écrite puis **abandonnée**, parce qu'elle
  fabriquait des formes inexistantes — `nature(-ral)` devenait « natureral »,
  `write(-ing, -ten)` « writeing, writeten ». Inventer des mots est pire que
  laisser une notation brute. Voir `_m/mesure_notation.py`.

## Contrôle qualité — aucune donnée inventée

Un mot à mot décalé est pire que pas de mot à mot. Les deux corpus
arabes sont donc construits avec une vérification d'alignement : pour
chaque verset, le nombre de mots de la source doit correspondre au
nombre de mots du texte arabe de THEOLOGICUS (signes d'annotation
coraniques exclus). En cas d'écart, le verset est **ignoré** — jamais
deviné.

Résultat : 6 233 versets couverts sur 6 236 (99,95 %). Les 3 versets
écartés (37:130, 95:1, 97:1) sont ceux où notre découpage diffère des
deux sources à la fois.

Le corpus hébreu applique la même règle, mais au niveau du **chapitre** :
si le nombre de versets du WLC ne concorde pas exactement avec celui du
corpus français, le chapitre entier est omis. Résultat : 921 chapitres
émis sur 931 (98,9 %) — voir le tableau ci-dessus.

Le corpus grec ne peut pas suivre cette règle : le texte critique omet
légitimement des versets, et les exclure reviendrait à supprimer des
chapitres entiers (Rm 16, Jn 8). Il applique donc une variante stricte —
émettre un chapitre seulement si chaque verset grec appartient à la plage
française, puis vérifier un par un que les manques correspondent à une
omission connue du texte critique. Résultat : **260 chapitres émis sur
260**, 0 manque inexpliqué, 1 verset écarté (Ap 12,18).
