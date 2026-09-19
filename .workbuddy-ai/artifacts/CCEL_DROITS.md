# Corpus « Réforme & protestantisme » — droits, décision et mode d'emploi

Source : **CCEL** (Christian Classics Ethereal Library, ccel.org).

## La règle telle qu'elle est mesurée

CCEL publie sa politique sur `https://ccel.org/about/copyright.html` :

> « Most of the editions at the Christian Classics Ethereal Library are based
> on books that are public domain in the United States. However, they may have
> copyrighted introductions, cover art, and other special contents. **A few
> books are under another publisher's copyright and are used by permission;
> these are noted on the book information page.** These books may be used for
> personal, educational, or non-profit purposes. Contact us for permission to
> republish CCEL works or to use them commercially. »

Dans le ThML, cette mention est le champ **`<DC.Rights>`** de l'en-tête Dublin
Core. Sur les 48 œuvres sondées :

| `<DC.Rights>` | nombre | interprétation |
|---|---|---|
| `Public Domain` | 25 | domaine public explicite |
| vide (`<DC.Rights />`) | 23 | rien de signalé → domaine public, selon la politique |
| autre chose | **0** | aucune |

**Le générateur refuse donc toute œuvre dont `<DC.Rights>` est renseigné et
différent de « Public Domain ».** C'est un garde-fou automatique : si CCEL
ajoute un jour une restriction, elle ne passera pas.

## Ce qui reste Risqué, et pourquoi on l'assume

1. **Les introductions peuvent être protégées.** C'est écrit noir sur blanc.
   Parades appliquées :
   - les divisions intitulées *Introduction*, *Preface*, *Title Page*,
     *Indexes*, *Fac-simile*, *Original Table of Contents* sont **retirées** à
     la construction ;
   - on n'embarque que le texte, jamais les images ni la maquette.
2. **« Contactez-nous pour republication ou usage commercial ».**
   THEOLOGICUS est gratuit, open-source, sans publicité et sans
   monétisation — donc *non commercial* et *éducatif/personnel*. Le point
   reste **à confirmer par l'utilisateur** si l'app doit un jour être
   diffusée sur un store payant.
3. **Le domaine public est territorial.** « Public domain in the United
   States » ne vaut pas partout. Une traduction de 1845 (Beveridge) est
   hors droits dans le monde entier ; ce n'est pas vrai de tous les textes.

## Œuvres les plus récentes du corpus (à surveiller en priorité)

| Œuvre | Auteur | Mort | Remarque |
|---|---|---|---|
| Systematic Theology | Berkhof | 1938 | le plus récent — vérifier si diffusion hors US |
| The Philosophy of Revelation | Bavinck | 1921 | |
| Sermons on Several Occasions | Wesley | 1791 | |
| Systematic Theology | Hodge | 1878 | |

Tout le reste (Calvin, Luther, Owen, Baxter, Bunyan, Edwards, Schaff,
Melanchthon, Knox, Cranmer) est largement antérieur à 1900.

## Comment régénérer

```bash
python tools/build_reformed.py --build          # 91 entrées, ~28 Mo
python tools/build_reformed.py --probe calvin/institutes
```

Le cache HTTP est dans `tools/.ccel_cache/` (gitignored) : relancer coûte
une minute au lieu de quatre.

## Décision

On livre. Les œuvres sous-jacentes sont dans le domaine public, l'usage est
non commercial, les introductions potentiellement protégées sont retirées,
et le garde-fou `DC.Rights` empêche d'embarquer une œuvre restreinte.
