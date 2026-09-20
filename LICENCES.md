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

## Hébreu — texte, lemmes et morphologie

- Source : **Open Scriptures Hebrew Bible** (OSHB),
  https://github.com/openscriptures/morphhb
- Contenu : texte du Codex de Léningrad (WLC), lemmes, morphologie,
  numéros Strong.
- Licence : lemmes et morphologie sous **CC BY 4.0** — attribution
  obligatoire (« Open Scriptures Hebrew Bible Project »). Le texte du
  WLC est dans le **domaine public**.

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
