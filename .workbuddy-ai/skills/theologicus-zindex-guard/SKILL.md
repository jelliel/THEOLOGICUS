---
name: theologicus-zindex-guard
description: Vérifier et protéger l'empilement (z-index) de l'app THEOLOGICUS — panneaux de verset, fiches de mot à mot, bulles d'annotation. Utiliser quand on touche à un z-index, à une infobulle, à un panneau de verset, ou quand l'utilisateur dit qu'une infobulle « passe derrière », « n'est pas visible entièrement », ou que « le fix n'est pas appliqué partout ». Fournit un garde statique (pré-commit) et un garde navigateur (juge de paix).
agent_created: true
---

# THEOLOGICUS — garde d'empilement

## Pourquoi ce skill existe

En v96, un correctif de z-index n'avait migré que **trois panneaux sur cinq**,
parce que la liste des panneaux avait été écrite **à la main**. Deux sont restés
hors échelle (`#verse-mini-tip` à 130000, `#v37-tip` à 129999), donc ~120 000
crans au-dessus des fiches de mot (9500) : la fiche ne pouvait pas passer
devant. L'utilisateur a vu le défaut avant nous.

**Règle qui en découle : ne jamais énumérer à la main ce qu'on peut lire dans
le DOM.** Toute correction de ce type doit être accompagnée d'un contrôle qui
énumère.

## L'échelle (dans `:root` de THEOLOGICUS.html)

| variable | valeur | rôle |
|---|---|---|
| `--z-content` | 1 | contenu normal |
| `--z-sticky` | 100 | barres collantes |
| `--z-panel` | 199 | panneaux latéraux |
| `--z-sidebar` | 999 | rail |
| `--z-overlay` | 1000 | overlays |
| `--z-modal-lg` | 2000 | modales larges |
| `--z-modal` | 3000 | modales |
| `--z-popup` | 5000 | ancienne génération d'infobulles |
| `--z-panneau` | **9000** | **panneaux de verset** (bible, quran, tafsir, mini) |
| `--z-carte` | **9800** | **carté latérale** (translittération `#v37-tip`) |
| `--z-mot` | **9900** | **fiches de mot à mot** — la plus haute des trois |
| `--z-toast` | 10000 | toasts |
| `--z-bulle` | **100000** | bulles d'annotation |
| `--z-au-dessus` | 100002 | au-dessus de tout |

**Quatre niveaux à ne pas confondre** : le panneau (9000) montre le verset, la
carte (9800) montre la translittération, la fiche (9900) montre le mot, la bulle
(100000) montre les actions de sélection.

**Ordre imposé : `--z-panneau` < `--z-carte` < `--z-mot`.** L'invariant à
préserver est « **toute fiche domine tout panneau** » — c'est lui que le banc
`_v97/exhaustif.js` teste mécaniquement, en croisant les cinq panneaux avec les
quatre fiches. Ajouter un rang entre les deux casse cet invariant si on le place
au mauvais endroit : c'est exactement ce qui est arrivé en v105f, où
`--z-carte: 9800` **au-dessus** de `--z-mot: 9500` faisait passer les quatre
fiches sous la carte de translittération.

## Piège n°1 — les cinq panneaux, pas trois

| panneau | où est son z-index |
|---|---|
| `#bible-verse-tip` | **inline** (`style.cssText`, l. ~20399) |
| `#quran-verse-tip` | **inline** (l. ~20586) |
| `#tafsir-verse-tip` | **inline** (l. ~20864) |
| `#verse-mini-tip` | **feuille de style** (l. ~1092) |
| `#v37-tip` | **feuille de style** (l. ~26859, `var(--z-carte,9800)`) |

Trois en JS, deux en CSS. Un `grep` sur les feuilles de style n'en voit que
deux — c'est exactement l'erreur qui produit un correctif partiel. **Chercher
dans les deux.**

## Piège n°2 — le port de la fiche vit dans `body`

Les fiches (`#hb-tip`, `#gr-tip`, `#lat-tip`, `#qw-tip`) sont créées par
`document.body.appendChild(...)` : elles sont **sœurs** du panneau, jamais
descendantes.

Conséquence mesurée : `tip.contains(fiche)` est **toujours faux**. Le garde
`dansPanneau(n)` des trois panneaux scripturaires ne peut donc pas voir une
fiche. Il faut tester explicitement `n.closest('#hb-tip')` etc.

Pourquoi ça ne cassait rien jusqu'ici : en passant d'un mot à sa fiche, le
navigateur **n'émet aucun `mouseout` du lien** (vérifié par trace CDP). La
protection était **incidente** — elle tenait à ce que `__placerFiche` (v94) ne
pose jamais une fiche sur son mot. Fragile, pas cassé.

## Piège n°5 — le placement doit connaître le PANNEAU, pas seulement le mot (v101)

Capture du 2026-09-22 : la fiche du grec « Πᾶς » recouvrait la bande utile du
panneau du verset. Le texte grec (`ἐγὼ δὲ λέγω ὑμῖν ὅτι πᾶς…`) était lu à
moitié.

**Ce n'est pas un problème d'empilement non plus** — la fiche était bien peinte
au-dessus. C'est le **placement** qui était aveugle.

`__placerFiche` minimisait `aireRecouvrement(boite, mot)` **et rien d'autre**.
Or le mot du mot-à-mot vit *dans* le panneau : ses quatre candidats l'entourent,
donc entrent tous dans le panneau. Mesuré sur Matthieu 5:22 (panneau 360×403,
fiche 300×280) :

| candidat | recouvre le mot | recouvre le panneau |
|---|---|---|
| dessous | 631 | 84 000 |
| dessus | 0 | **47 850** ← retenu |
| droite | 0 | 84 000 |
| gauche | 631 | 76 055 |

Le score s'arrêtait au premier candidat à `aire === 0` sur le mot. « dessus »
gagnait donc en cachant **33 %** du panneau, sans jamais le regarder.

**Correctif, en trois étages :**

1. Les **cinq panneaux deviennent des obstacles explicites** (`obstacles()`).
   Le score sépare strictement « recouvre le mot » (interdit) de « recouvre le
   panneau » (à fuir), et l'ordre des candidats tranche à égalité — l'ancien
   comportement est reproduit quand aucun panneau n'est ouvert.
2. **Quatre candidats HORS panneau, essayés EN PREMIER** : `hors-droite`,
   `hors-gauche`, `hors-haut`, `hors-bas`. Ils ne sont retenus que s'ils
   tiennent **entièrement à l'écran SANS bornage** (si `borne()` doit les
   déplacer, il n'y avait pas la place et ils reviendraient sur le panneau).
3. **Dernier recours** : plafonner la hauteur de la fiche à la plus grande bande
   libre autour du panneau (jamais sous 140 px). Les quatre fiches ont déjà
   `overflow-y:auto` : rien n'est perdu, la suite se lit en défilant.

**Effet mesuré** (`elementFromPoint` sur la surface du panneau — jamais une
comparaison de nombres) :

| fenêtre | avant | après |
|---|---|---|
| bureau 984×765 | `dessus`, 33 % caché | `hors-haut`, **0 %** |
| petit bureau 784×705 | — | `hors-haut`, **0 %** |
| mobile 500×665 | — | `hors-haut`, **0 %** |
| tablette 584×605 | `dessus`, **42 %** caché | `hors-haut`, **0 %** (fiche 280→274 px) |

Sur la tablette aucune bande n'atteint 280 px (mesuré : 173 / 23 / 274 / −100) :
c'est le plafonnement qui sauve le cas, pas les candidats.

**Règle générale : un placement qui ne connaît que sa cible est aveugle. Il doit
connaître les obstacles.**

## Piège n°6 — une erreur de syntaxe tue TOUT le bloc `<script>` en silence

Vécu v101, et c'est le plus coûteux : un `/* … */` inline **à l'intérieur d'un
bloc de commentaire** ferme celui-ci prématurément. Le script
`v94-fiche-placement` entier échouait (`Unexpected identifier 'mot'`),
`__placerFiche` n'était **jamais publié**, et **les quatre fiches restaient à
`left:0; top:0`** — le coin de la fenêtre.

`tools/check_syntax.js` n'a rien vu : il analyse les blocs `<script>` d'un
fichier HTML, pas un script isolé après édition.

**Réflexe : après avoir touché un bloc, l'extraire et le tester seul.**

```bash
awk '/<script id="v94-fiche-placement">/,/<\/script>/' THEOLOGICUS.html \
  | sed '1d;$d' > /tmp/bloc.js && node --check /tmp/bloc.js
```

**Et vérifier que le helper EXISTE à l'exécution** — `typeof window.__placerFiche`
vaut `undefined` à tous les instants du chargement quand le bloc est cassé. Un
`elementFromPoint` qui rend une fiche « au coin » alors qu'elle devrait être
ailleurs est un **symptôme**, pas un artefact de banc.

## Piège n°4 — `relatedTarget` ne suffit PAS (v100, le plus tenace)

Corriger le z-index ne suffit pas à rendre un mot atteignable. Défaut signalé
par enregistrement vidéo : le panneau s'ouvre, l'utilisateur descend vers la
ligne de mots, **le panneau se referme en chemin** — la translittération et les
Strong deviennent inaccessibles.

**Ce n'est pas un problème d'empilement.** Les mots étaient correctement peints
au-dessus du panneau. Ils étaient **inatteignables**.

Cause, mesurée au traceur CDP : en descendant du lien vers les mots, le
navigateur émet **UN SEUL `mouseout`** sur le lien, avec `relatedTarget` = **le
fond de page**, pas le panneau. Le garde teste `relatedTarget`, conclut « la
souris s'en va », et referme pendant que le curseur est encore en route.

La géométrie rend ça inévitable : le panneau est posé **au-dessus** du lien
(panneau `y=472`, lien `y=659`), donc rejoindre un mot oblige à sortir du lien
par un bord où le panneau n'est pas encore. **Juger sur `relatedTarget`, c'est
juger un chemin que le curseur n'a pas fini de parcourir.**

Correctif, appliqué aux panneaux **Bible, Coran et Tafsir** : au `mouseout`, on
**arme** la fermeture (160 ms) au lieu de fermer ; tout `mouseover` visant le
panneau, un mot (`.hb`, `.gr`, `.lat`, `.qw`) ou une fiche **annule** l'armement.
`#verse-mini-tip` avait déjà cette forme (250 ms + test `:hover`) et `#v37-tip`
se déclenche sur le mot lui-même : ni l'un ni l'autre à modifier.

**Règle générale pour ce projet : ne jamais fermer un panneau au survol sur le
seul critère de `relatedTarget`. Armer + annuler.**

### Deux erreurs de mesure qui ont failli produire un faux diagnostic

- **`offsetParent !== null` est FAUX pour tout élément `position:fixed`.** Les
  quatre fiches sont en `position:fixed` : ce test déclarait « cachée » une fiche
  parfaitement peinte. Juger sur la boîte **peinte** (`getBoundingClientRect`
  + `display`/`visibility` calculés).
- **Mesurer pendant que la souris est SUR la cible**, pas après l'avoir quittée :
  sinon on mesure un état déjà refermé et l'on croit à un échec.

Instrumenter `style.display` par `Object.defineProperty` sur l'**instance**
casse `getComputedStyle` (les autres accès rendent `undefined`) et ne se
désinstalle pas en réaffectant une valeur : il faut `delete el.style.display`.

## Piège n°7 — un panneau peut mourir EN PLEIN TRAJET vers sa propre poignée (v105d)

**Symptôme utilisateur : « je ne peux pas déplacer l'infobulle »** — la bulle
s'évapore avant qu'on l'atteigne. Rien à voir avec l'empilement.

MESURE (parcours utilisateur REEL, coordonnées CDP, fenêtre 921×838) :

| étape | x,y | ce qui est sous le pointeur | panneau |
|---|---|---|---|
| survol de la référence | 54, 501 | `span.bible-ref` | ouvert à (20,534) 360×221 |
| pas 1 | 93, 507 | `chat-container` | **encore ouvert** |
| pas 2 | 132, 513 | `chat-container` | **`display:none`** |

La poignée est à (353,539). Pour l'atteindre depuis le lien, la souris traverse
**~33 px où elle n'est ni sur le lien ni sur le panneau**. Le `mouseout` du lien
arme la fermeture (160 ms) et rien ne l'annule : le panneau est mort au pas 2.
**Le déplacement était donc impossible, non par mauvais placement de la poignée,
mais parce que la bulle s'évaporait sur le trajet qui y mène.**

Deux enseignements :

1. **`armerFermeture` doit juger en FONCTION DU POINTEUR RÉEL, pas de
   `relatedTarget`.** Le panneau recouvre le lien : le `mouseout` du lien annonce
   le fond de page même quand la souris est posée sur le panneau. On tient un
   point mis à jour en capture (`pointerover`/`pointermove`/`mouseover`) et on
   interroge `elementFromPoint` — jamais la classe de la cible supposée.
2. **Le verdict d'armement est PÉRIMÉ à l'échéance.** Il faut **rejuger dans le
   `setTimeout`**, sinon on ferme sur une décision prise 160 ms plus tôt — c'est
   précisément le temps que met la souris à traverser la gouttière. La règle est
   dans `#v105c-pointeur` : « retenu » = le pointeur est dans la **boîte gonflée
   d'une marge de 48 px** (`MARGE = 48`, la gouttière mesurée fait 33 px).

**Règle : un délai de grâce exige deux décisions, à l'armement ET à l'échéance.**

## Piège n°8 — le bouton ✕ avalé par la poignée qui le contient (v105e)

MESURE : `.v105-x` est un **enfant** de `.v105-poignee`. Un appui sur le ✕
atteint la poignée d'abord, et `pointerdown` partait en **drag**. Trace :

```
pointerdown -> v105-x
pointerup   -> v105-poignee v105-tire     <<< le ✕ n'est plus la cible
click       -> v105-poignee               <<< l'écouteur du ✕ ne tourne JAMAIS
```

Résultat : `posee: true`, mémoire conservée, le bouton **paraissait mort**. Un
`elementFromPoint` sur le centre du ✕ renvoyait bien `v105-x` (donc le banc
croyait le bouton cliquable) — **le test de position ne suffit pas, il faut
tracer la cible de chaque ÉVÉNEMENT.**

Correctif : `pointerdown` sur la poignée **renvoie tôt** si
`e.target.closest('.v105-x')`. Trace après correctif :
`pointerdown/pointerup/click -> v105-x`, et le panneau repart à `-9999px`.

## Piège n°9 — ne pas accuser l'app d'un geste que personne ne fait (banc)

Le banc v105 échouait sur « le drag n'a pas marché » parce qu'il **déplaçait la
souris ailleurs AVANT de saisir la poignée**, puis exigeait qu'elle y soit
encore. Ce détour n'est pas le parcours utilisateur : quitter la bulle est un
droit. **Un banc doit suivre le geste réel** — partir du panneau et progresser
par petits pas à travers lui.

Et **ne pas exiger le delta brut quand l'app borne à l'écran** : la bulle posée à
`x=541`, large de 360, dans une fenêtre de 921, ne peut pas recevoir `+120` sans
sortir de l'écran. Le bornage est un **service**, pas un échec.

## Piège n°3 — `pointer-events` pendant le chargement

`#bible-verse-tip` naît avec `pointer-events:none` et ne passe à `auto` que
dans le `.then()` du chargement du corpus. Le panneau est donc **visible mais
traversé par la souris** tant que le corpus n'est pas là. Mesuré : bascule à
~250 ms avec le corpus en cache. À surveiller si l'utilisateur signale que rien
ne réagit au survol juste après l'ouverture.

## Utilisation du garde

### Mode statique (rapide, sans navigateur) — pré-commit

```bash
cd /c/Theologicus
node C:/Users/toshr/.workbuddy-ai/skills/theologicus-zindex-guard/scripts/garde_z.js \
     --statique THEOLOGICUS.html
```

Exit 0 = toutes les règles de contenu passent par `var(--z-*)`.
Exit 1 = un littéral subsiste, avec **le numéro de ligne**.

Il ne classe pas les z-index (pas de contexte DOM) : il vérifie seulement
qu'aucune règle d'infobulle/panneau n'utilise un **littéral numérique**. C'est
la cause racine : un littéral ne se compare à rien, donc il se fait oublier.

### Mode navigateur (juge de paix) — avant livraison

```bash
cd /c/Theologicus
# serveur par défaut : mobile/www  (la copie publiée est index.html)
node C:/Users/toshr/.workbuddy-ai/skills/theologicus-zindex-guard/scripts/garde_z.js

# ou forcer la racine
THEO_WWW=C:/Theologicus node .../garde_z.js
```

Vérifie quatre choses :

1. les quatre fiches sont montées, et leur z-index minimal ;
2. aucun **contenu visible non modal** ne passe devant les fiches ;
3. chaque panneau de verset **monté** déclare son z-index via `var(--z-*)` ;
4. inventaire commenté de tout ce qui est au-dessus des fiches.

Classement appliqué : `modal` (bloque l'interaction → accepté), `masqué au
repos` (`display:none` → hors peinture → ignoré), `exception` (liste motivée en
tête de fichier), sinon `CONTENU VISIBLE` → échec.

## Pièges du banc lui-même (rencontrés quatre fois)

1. **Servir le bon nom de fichier.** La copie publiée de l'app est
   `mobile/www/index.html`. Naviguer vers `/THEOLOGICUS.html` renvoie un 404 de
   3 octets : aucun script ne tourne, tous les éléments sont absents, et l'on
   croit à une régression. Le garde détecte le nom réellement présent.
   **Confirmé en v105f** : `_v96/exhaustif.js` servait `/THEOLOGICUS.html`
   contre `mobile/www/` (qui ne contient QUE `index.html`) et rendait
   **5 ECHECS fantômes**. Le même banc relancé avec `THEO_WWW=C:/Theologicus`
   donne **ECHECS = 0**. Corollaire : quand un banc échoue, **relancer le même
   banc sur la baseline** avant toute retouche de l'app.
   *Ne pas oublier `_v96/`* : les bancs d'une version ancienne ne meurent pas
   quand leur successeur arrive, ils se contentent de mentir.
2. **Attendre l'enregistrement des modules différés.** Les modules d'infobulle
   sont accrochés via `__corpusHook` ; le DOM reste vide jusqu'à l'entrée dans
   le corpus. Utiliser une attente de condition, pas un `sleep` fixe.
3. **Ne jamais fabriquer l'objet qu'on mesure.** Une version antérieure créait
   `#verse-mini-tip` en `div` nu, sans la feuille de style du module, puis lisait
   `z-index: auto` et concluait « hors échelle ». On mesurait le banc, pas l'app.
   Si un élément est absent : **le dire comme absent**, ne pas le maquiller.
4. **Compter les échecs AVEC ANCRE.** `grep -ci 'ECHEC'` compte aussi la ligne
   d'en-tête `=== 4. reste-t-il un z-index en dur sur un panneau ? ===` et le
   verdict `ECHECS = 0` : deux faux positifs en v105f, deux fausses alertes.
   Utiliser `grep -c '^ECHEC'` (avec l'espace final) ou lire le verdict final.
   *Règle générale : un compteur sans ancre mesure le bruit du rapport, pas le
   résultat.*

## Vérifier que le garde sert à quelque chose

Un garde qui passe ne prouve rien s'il ne peut pas échouer. On réintroduit le
défaut et on exige l'échec :

```bash
cd /c/Theologicus
cp THEOLOGICUS.html _t.html
node -e "
const fs=require('fs'); let s=fs.readFileSync('_t.html','utf8');
s=s.replace('position:fixed; z-index:var(--z-carte,9800); max-width:360px; min-width:150px;',
            'position:fixed; z-index:129999; max-width:360px; min-width:150px;');
fs.writeFileSync('_t.html',s);"
node .../garde_z.js --statique _t.html     # doit sortir en 1, en pointant la ligne
rm -f _t.html
```

Attendu : 1 échec en statique (il pointe la ligne du littéral, mesuré : l.
26858). Si le garde passe alors que le défaut est réintroduit, **le garde est
faux**, pas l'app.

**Contre-épreuve navigateur, mesurée en v105f** (plus directe que `node -e`,
que le heredoc mutile) : graine sur la **ligne** ciblée par son numéro, car un
`sed` sur motif global toucherait aussi les commentaires.

```bash
cd /c/Theologicus
cp THEOLOGICUS.html /tmp/sauvegarde.html
cp mobile/www/index.html /tmp/sauvegarde_index.html
sed -i '26859s/var(--z-carte,9800)/200000/' THEOLOGICUS.html
cp THEOLOGICUS.html mobile/www/index.html     # le banc sert mobile/www
node .../garde_z.js                            # -> ECHECS = 3
cp /tmp/sauvegarde.html THEOLOGICUS.html       # restaurer
cp /tmp/sauvegarde_index.html mobile/www/index.html
cmp THEOLOGICUS.html mobile/www/index.html     # doit etre silencieux
```

Mesuré : **ECHECS = 3**, dont « aucun contenu VISIBLE non modal ne passe devant
les fiches → `[{"nom":"v37-tip","z":200000}]` ». Le garde n'est donc pas vacuous.
**Toujours restaurer depuis une sauvegarde nommée, jamais ré-éditer en sens
inverse** — et vérifier la restauration par `cmp`.

**Le motif de remplacement doit correspondre au TEXTE RÉEL de la règle.** Ce
test a été écrit pour la règle de `#v37-tip` du temps où elle valait
`var(--z-panneau,9000)` ; après la v105 elle vaut `var(--z-carte,9800)`. Un
`String.replace` qui ne trouve rien **ne signale rien** : le garde passe alors
sur un fichier intact et l'on croit qu'il est vacuous alors qu'il est seulement
mal exercé. Vérifier que le fichier témoin contient bien le littéral avant de
conclure.

## Suites de régression à relancer après toute retouche d'empilement

```bash
cd /c/Theologicus
node .workbuddy-ai/artifacts/_v97/exhaustif.js     # 11/11 — les 5 panneaux
node .workbuddy-ai/artifacts/_v97/garde_fiche.js   #  7/7 — lien -> mot -> fiche
node .workbuddy-ai/artifacts/_v97/cas_dangereux.js #  3/3 — 6/6 mots
node .workbuddy-ai/artifacts/_v96/verif.js         # 12/12
node .workbuddy-ai/artifacts/_v94/verif.js         #  8/8
node .workbuddy-ai/artifacts/_v95/verif_fix.js     #  tous OK
node .workbuddy-ai/artifacts/_v104/bench_overlap.js # 5/5 — la fiche fuit le panneau
node .workbuddy-ai/artifacts/_v105/bench_v105.js   # 24/24 — cartes déplaçables
node tools/check_syntax.js                         # 0 erreur
```

Puis : `cp THEOLOGICUS.html mobile/www/index.html`, commit, push.
