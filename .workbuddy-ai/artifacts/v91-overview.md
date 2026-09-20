# v2.0.92 — le mot à mot latin (textes du magistère)

*(Livré sous le tag `apk-v2.0.94` : la CI nomme la version
`2.0.<nombre de commits>`, et ce changement a été poussé avec les notes de
la v90 et le correctif de version. Le numéro d'ordre interne et le tag
peuvent donc différer — seul le tag compte pour installer.)*

Les mots latins de Denzinger deviennent cliquables. Chacun ouvre une bulle
avec le lemme, le type, la flexion complète et le sens — en français, avec
l'anglais de la source en dessous.

```
Symboli Apostolici forma occidentalis antiquior.
   ↓ clic sur « sancta »
Lemme      sancta
           adjectif — nominatif / ablatif / vocatif, singulier / pluriel,
           féminin / neutre, positif
           consacrée, sacrée, inviolable ; vénérable, auguste… (trad. auto.)
           source (en) : consecrated, sacred, inviolable ; venerable…
```

---

## La source

**Whitaker's Words** — réimplémentation Python `blagae/whitakers_words`,
sous **licence MIT**. Le programme Ada d'origine de William Whitaker avait une
licence « très libérale » rédigée par lui-même, proche du domaine public.
Environ 39 000 entrées latin-anglais avec la morphologie flexionnelle
complète : c'est un vrai dictionnaire, pas un modèle de langue.

J'avais prévu de basculer le latin sur le modèle IA faute de corpus libre.
Ce n'est finalement pas nécessaire : une ressource libre et vérifiable
existait. C'est toujours préférable — un modèle inventerait des analyses
plausibles, un dictionnaire n'affiche que ce qu'il sait.

**Texte analysé** : Denzinger, *Enchiridion Symbolorum*, 11e éd., Bannwart
S.J., 1911 — domaine public, et le seul corpus latin de l'application.

---

## Couverture : 79 % des mots lus

Le texte de 1911 est une **numérisation**. 38 599 formes distinctes pour
166 000 mots, dont 69 % n'apparaissent qu'une seule fois — une bonne part est
du bruit d'OCR (« Symbob », « mterrogationes »). Compter les formes donne donc
un chiffre trompeur ; j'ai mesuré ce que le lecteur voit vraiment :

| mesure | résultat |
|---|---|
| occurrences analysées | **131 393 / 166 248 (79,0 %)** |
| formes distinctes analysées | 20 263 / 38 599 (52,5 %) |

Et les formes non reconnues les plus fréquentes ne sont pas du latin :
lettres isolées (`s`, `v`, `u`), abréviations (`cf`, `sqq`), chiffres romains
(`iii`, `iv`), et du grec cité dans le texte (`kai`).

### Un seuil qui cachait un tiers du vocabulaire

La bibliothèque filtre par défaut à `frequency='C'`. Ce réglage laisse passer
« caritas » mais **pas** « suus », « sacramentum », « omnino » ni « tanquam » —
un comble pour du latin ecclésiastique. Mesuré sur les 3 000 formes les plus
fréquentes du corpus :

| seuil | formes résolues | analyses par mot |
|---|---|---|
| `C` (défaut) | 74 % | 1,64 |
| `X` (retenu) | **84 %** | 1,82 |

Dix points de couverture pour une ambiguïté qui reste très faible. Sans cette
mesure, un tiers du vocabulaire courant serait passé à la trappe sans que rien
ne le signale.

---

## La règle d'or, tenue comme pour l'hébreu et le grec

- **Une forme non reconnue n'a aucune entrée.** L'infobulle écrit alors
  « aucune analyse disponible pour cette forme » et rappelle que le texte est
  une numérisation. Aucune analyse n'est inventée.
- **Une forme ambiguë porte toutes ses analyses** (4 au plus), comme un
  dictionnaire. « caritas » donne le nom *caritas* (« charité ») et le
  participe de *careo* (« manquer de ») : on ne tranche pas à la place du
  lecteur.
- **Les sens sont traduits sur la machine** (LibreTranslate/Argos, aucune clé,
  rien ne sort de l'ordinateur) : 7 892 sens traduits, étiquetés
  « trad. auto. », avec l'anglais gardé en dessous.

---

## Vérifications

| contrôle | résultat |
|---|---|
| `tools/check_syntax.js` | 56 blocs, **0 erreur** |
| harnais général `_diag_v20.js` | **133/133** |
| sonde hébreu `_probe_v89.js` | **20/20** |
| sonde grec `_probe_v90.js` | **24/24** |
| sonde latin `_probe_v91.js` | **14/14** |

La sonde latin vérifie entre autres le rendu **réel** d'une œuvre Denzinger
(1 623 mots marqués), le fait qu'un corpus non latin n'est jamais marqué, et
que le texte reste échappé.

---

## Fichiers

- `latin/mots.js` — 20 263 entrées, 6,9 Mo (nouveau)
- `tools/build_latin.py` — le constructeur (nouveau)
- `THEOLOGICUS.html` — module `v91-la`, `lang: 'la'` sur le corpus
- `LICENCES.md` — section latine
- `tools/prepare_mobile.py`, `.github/workflows/build-apk.yml`,
  `build_installer.bat` — `latin` ajouté aux trois listes d'empaquetage

Le corpus latin se construit avec une dépendance non versionnée :

```
pip install git+https://github.com/blagae/whitakers_words.git
```

---

## Suite

Le syriaque reste la dernière langue demandée. Il n'existe pas d'équivalent
libre comparable pour la Peshitta : celui-ci passera par le modèle IA,
étiqueté comme tel — c'est le choix déjà arrêté pour les langues sans corpus.
