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

## Strong (hébreu et grec)

- Source : Open Scriptures, « Unified Strong's Dictionaries »,
  https://github.com/openscriptures/strongs
- Licence : **GNU GPL 3.0** pour la compilation XML. Les définitions
  originales de Strong (1890) sont dans le domaine public.

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
