# Traduction biblique embarquée — statut juridique et options

> Contexte : THEOLOGICUS embarque un texte biblique français complet (~4,3 Mo dans
> `bible/`). Identifié comme **« BJ 1998 » (Bible de Jérusalem)**. Cette note
> établit le statut juridique réel et les options pour les paliers 2/3
> (comparateur de traductions, export PDF), bloqués par cette question.

## Ce qui est embarqué (vérifié)

Extrait de `bible/b1.js` (Genèse 1:1-2) :
> « Au commencement, Dieu créa le ciel et la terre. Or la terre était vide et
> vague, les ténèbres couvraient l'abîme, un vent de Dieu tournoyait sur les
> eaux. »

Phrasé caractéristique d'une traduction française catholique moderne
(Bible de Jérusalem / équivalent). Textuellement **sous droits**.

## Statut juridique de la Bible de Jérusalem

- Éditeur historique : **Éditions du Cerf** (aujourd'hui groupe **Bayard**).
  Traduction collective de l'**École Biblique et Archéologique Française de
  Jérusalem (EBAF)**.
- L'édition « 1998 » a un texte **identique à l'édition 1956** (source :
  archive.org, métadonnées de l'exemplaire Cerf 1998).
- **Toujours sous copyright** en France/UE (vie de l'auteur + 70 ans ; œuvre
  collective toujours exploitée et vendue par Cerf/Bayard). **Pas de domaine
  public, pas d'utilisation libre.**
- Conséquence : embarquer le texte intégral dans un **dépôt GitHub public** et
  des **releases APK publiques** = **redistribution d'une œuvre protégée** sans
  licence. Risque réel si l'app est diffusée (y compris via les releases
  GitHub, accessibles à tous).

## Traductions françaises du domaine public (libres à redistribuer)

| Traduction | Date | Domaine public ? | Source fiable |
|---|---|---|---|
| **Louis Segond 1910** | 1910 | Oui (traducteur décédé 1885) | `fr.wikisource.org/wiki/Bible_Segond_1910`, archive.org |
| **Crampon 1923** | 1923 | Oui (A. Crampon décédé 1935 → libre en UE depuis ~2006) | `fr.wikisource.org/wiki/Bible_Crampon_1923` |
| Darby / Ostervald / Martin | — | Oui (œuvres anciennes) | multiples |

Ces textes peuvent être **bundlés, exportés et comparés librement** — ils
débloquent les paliers 2/3 sans risque.

## Options pour la suite

**A. Garder la BJ en affichage interne, textes PD pour ce qui sort.**
- En app, la BJ reste la traduction affichée (usage personnel).
- Le comparateur et l'export utilisent **Segond 1910** (ou Crampon 1923) comme
  texte de référence/public.
- Ne règle **pas** le risque de redistribution du dépôt/releases (la BJ y reste
  embarquée). Convient si l'app reste à usage purement personnel / sideload.

**B. Passer le corpus embarqué en texte du domaine public.**
- Remplacer `bible/` par Segond 1910 (ou Crampon 1923), généré depuis
  Wikisource. L'app devient 100 % redistribuable.
- Perte de la qualité de la BJ, mais alignement juridique total. Le générateur
  `tools/build_versification.js` et la table de versification restent valides
  (ils dépendent de la structure des livres, pas de la traduction).

**C. Obtenir une licence auprès de Bayard/Cerf.**
- Seule voie pour redistribuer légalement la BJ elle-même. Long, payant,
  incertain pour une app distribuée gratuitement.

**D. Ne rien changer (usage strictement personnel).**
- Le risque de redistribution persiste tant que le dépôt et les releases sont
  publics. Acceptable seulement si l'app n'est jamais partagée.

## Recommandation

Pour débloquer les paliers 2/3 **sans risque** : adopter **l'option A** comme
immédiat (BJ en affichage, Segond 1910 en couche export/comparateur), et, si
l'app doit rester publiquement distribuable, **prévoir l'option B** (basculer le
corpus embarqué en texte du domaine public). L'option C n'est pertinente que si
tu tiens absolument à la BJ redistribuée.

À trancher avec l'utilisateur avant d'engager les paliers 2/3.
