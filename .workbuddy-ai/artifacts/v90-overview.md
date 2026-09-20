# v2.0.90 — le mot à mot grec du Nouveau Testament

**Commit** `57b33c9` · **versionName** 2.0.90 · **versionCode** 91

Quand tu ouvres un verset du Nouveau Testament, une ligne grecque apparaît
maintenant sous le texte français, découpée en mots cliquables. Chaque mot
ouvre une bulle avec la translittération, le lemme, l'entrée Strong, le sens
et l'analyse grammaticale complète. L'hébreu livré en v2.0.89 continue de
fonctionner sur l'Ancien Testament.

---

## Ce qui s'affiche

Sur Jean 1,1, par exemple :

```
Ἐν ἀρχῇ ἦν ὁ λόγος καὶ ὁ λόγος ἦν πρὸς τὸν θεόν…
en  archē  ēn  ho  logos  kai  ho  logos  ēn  pros  ton  theon…
```

Un clic sur `ἀρχῇ` donne :

- **Translittération** : archē
- **Lemme** : ἀρχη · ar-khay' · Strong G746
- **Sens** : « Début, coin, (au, le) premier (état)… » — traduction
  automatique, avec la source anglaise en dessous
- **Analyse** : nom, datif, singulier, féminin
- **Code brut** : `N- ----DSF-`
- **Sources** : SBLGNT (CC BY 4.0) et MorphGNT / J. K. Tauber (CC BY-SA 3.0)

---

## La décision que tu as prise

Tu avais choisi « **Complet, avec BY-SA assumé** ». Concrètement :

- le texte SBLGNT est en **CC BY 4.0** ;
- la morphologie et les lemmes de MorphGNT sont en **CC BY-SA 3.0** ;
- notre corpus dérivé `biblegr/` est donc publié sous **CC BY-SA 3.0**, avec
  l'attribution affichée dans l'application et reprise dans `LICENCES.md`.

C'est ce prix qui donne le lemme et l'analyse grammaticale. Les sources grecques
libres de droits ne fournissent que le texte nu.

Un détail qui mérite d'être noté : la page `sblgnt.com/license` s'intitule
« End User License Agreement », et le README de MorphGNT y renvoie comme à un
EULA. Son contenu est en réalité le texte intégral de la licence Creative
Commons Attribution 4.0. J'ai vérifié la page plutôt que le titre.

---

## Ce qui a été mesuré avant d'écrire la moindre ligne

### Le lien vers Strong : 94,1 %

Les 5 449 lemmes distincts du grec ont été confrontés aux 5 523 entrées
grecques de Strong :

| cas | lemmes | part des occurrences |
|---|---|---|
| une seule entrée → **relié** | 4 923 | 94,1 % |
| plusieurs entrées (ambigu) → **non relié** | 18 | 4,4 % |
| aucune entrée → **non relié** | 508 | 1,6 % |

**Aucun numéro Strong n'est inventé.** Un lemme ambigu n'est pas relié : le mot
affiche son lemme et son analyse, sans numéro. Cas typique : Δαυίδ n'est pas
relié, parce que Strong écrit Δαβίδ.

### L'alignement des versets : 260 chapitres sur 260

La BJ porte des versets que le texte critique n'a pas — Mt 17,21 ;
Jn 7,53–8,11 (la femme adultère) ; Rm 16,25-27 ; etc. Leur numérotation **ne
se décale pas** : un verset absent est sauté, ses voisins gardent leur numéro
(vérifié : Jn 8 grec = 12 à 59). Chaque manque a été confronté un par un à la
liste connue des omissions : **0 manque inexpliqué**.

Plutôt que de les passer sous silence, l'application affiche « grec absent pour
les versets 25–27 (le texte critique ne les porte pas) ». Un seul verset est
écarté : Ap 12,18, que la BJ rattache à Ap 13,1.

### Les marques d'appareil : retirées, pas interprétées

SBLGNT écrit ⸀ ⸂ ⸃ (5 114 et 1 764 occurrences). Mais en Mt 1,5,
« ⸂Βόες … Ῥαχάβ, Βόες⸃ » **encadre cinq mots** : on ne peut pas savoir quel
mot est visé. Interpréter ces marques reviendrait à affirmer à tort qu'un mot
est douteux — une erreur d'édition, pas une prudence. Elles sont donc
retirées du mot affiché, et c'est écrit dans `LICENCES.md`.

---

## Les définitions Strong passent au français — hébreu compris

Les définitions Strong sont anglaises. Elles ont été traduites **sur la
machine** (LibreTranslate/Argos, aucune clé, rien ne sort de l'ordinateur) :
8 508 entrées hébraïques et 5 513 grecques, soit 98 à 99 % de couverture.

Deux garde-fous, les mêmes que pour les gloses arabes :

- la traduction est **étiquetée** « trad. auto. » dans l'application ;
- la source anglaise reste affichée en dessous.

L'hébreu en profitait aussi : sa bulle affichait « Sens (en) », elle affiche
désormais le français d'abord.

**Une passe de nettoyage a été écrite puis abandonnée.** Strong utilise une
notation (`X`, `god(-ly, -ward)`) qu'aucune traduction automatique ne sait
lire. J'ai écrit un décodeur, puis je l'ai écarté : il ne touchait que 10 %
des entrées et il **fabriquait des mots inexistants** — `nature(-ral)` devenait
« natureral », `write(-ing, -ten)` « writeten ». Inventer des formes est pire
que laisser une notation brute. La raison est consignée dans
`_m/mesure_notation.py` pour que personne ne la refasse.

---

## Vérifications

| contrôle | résultat |
|---|---|
| `tools/check_syntax.js` | 55 blocs, **0 erreur** |
| harnais général `_diag_v20.js` | **133/133** |
| sonde hébreu `_probe_v89.js` | **20/20** |
| sonde grec `_probe_v90.js` | **24/24** |

La sonde hébreu a d'ailleurs relevé une assertion devenue fausse : elle
affirmait « Jean 1,1 → aucun contenu ». C'était vrai avant cette version ;
c'est précisément ce que la v90 change. Le test a été réécrit.

---

## Fichiers

- `biblegr/` — 27 livres + `strongs.js`, 6,4 Mo (nouveau)
- `biblehb/strongs.js` — définitions françaises ajoutées
- `tools/build_grec.py` — le constructeur du corpus grec (nouveau)
- `tools/build_hebrew.py` — définitions françaises
- `THEOLOGICUS.html` — module `v90-gr` + `v90b`
- `LICENCES.md` — section grecque, licences vérifiées, notation KJV
- `tools/prepare_mobile.py`, `.github/workflows/build-apk.yml`,
  `build_installer.bat` — `biblegr` ajouté aux trois listes d'empaquetage

---

## Deux points à traiter à part

- **Fichiers sensibles non suivis à la racine du dépôt** :
  `mistral api key.txt`, `signing_key.pem`, `signing_cert.pem`. Ils ne sont
  pas versionnés, mais ils traînent dans le répertoire de travail — un
  `git add .` un peu large les embarquerait. À supprimer ou à sortir du dépôt.
- **Prochaines langues** du mot à mot : le latin et le syriaque. Ils n'ont pas
  de corpus libre équivalent et passeront par le modèle IA, étiqueté comme
  tel — c'est le choix déjà arrêté pour les langues hors corpus.
