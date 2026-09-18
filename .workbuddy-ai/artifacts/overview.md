# THEOLOGICUS — correctifs mobile

Dernier commit : `91edeb4` · APK : **v1.0.44** (versionCode 44) · release CI
attendue : `apk-v1.0.45`

---

# v67 — retrait du widget vertical et du bouton mémoire

Demandé : « supprime les parties encerclé en rouge de l'interface ».

Sur la capture, deux éléments sur le bord droit :

1. **Widget vertical flottant** (`#floating-sidebar`) — bar à 6 boutons qui
   apparaissait au survol d'un message assistant (copier, lire, mémoire,
   nouveau chat, exporter, Hermes). Les icônes étaient peu parlantes au
   toucher et le widget doublonnait avec la bulle déjà présente au doigt.
2. **Bouton circulaire en bas à droite** (`#memory-toggle`) — ouvrait le
   panneau mémoire, par ailleurs joignable depuis le rail.

Les deux sont masqués via `display: none !important;` sur leur règle CSS de
base. Le DOM et tous les gestionnaires clavier restent en place — retirer le
flag pour les faire revenir si besoin.

Vérifié via CDP (`getComputedStyle` → `display: none` sur les deux) + capture
d'écran.

---

# v66 — verrouillage au lancement : « se souvenir de moi » + robustesse

Demandé : « rendre cela plus robuste et rapide, et surtout une option
"se souvenir de moi" pour le mot de passe admin ».

## « Se souvenir de moi »

Case à cocher sur l'écran **Connexion Admin**, validité **7 jours**. Coché →
l'app s'ouvre directement, plus de quiz ni de mot de passe.

- `localStorage['theologicus_remember']` = `{v:1, mode:'admin', exp, tok}`,
  `tok = sha256hex('remember:' + AUTH_HASH)`. L'expiration **et** le jeton sont
  vérifiés à la lecture.
- **Révocable** : ⚙ PARAMÈTRES > 🔐 ACCÈS AU LANCEMENT > « Oublier l'accès
  mémorisé ». Le verrouillage revient au lancement suivant.
- Un script inline masque l'écran **avant le premier rendu** : sans lui le
  verrou clignotait une fraction de seconde à chaque ouverture, même quand il
  n'y avait plus rien à saisir.

## Le mot de passe n'est plus en clair

Remplacé par une empreinte SHA-256 salée, vérifiée par une implémentation
**pur JS** (`crypto.subtle` exigerait un contexte sécurisé, absent d'un WebView
servi en `file://`). Validée contre les vecteurs NIST.

> Honnêtement : tout se joue côté client, donc c'est de la **dissimulation**,
> pas de la sécurité. Personne ne peut plus lire le mot de passe d'un coup
> d'œil dans la source — c'est tout.

## Robustesse

| Avant | v66 |
|---|---|
| Changer de fenêtre/onglet remplaçait la question, **retirait un point** et augmentait la difficulté | le chronomètre est **mis en pause** puis reprend — sur Android une simple notification suffisait à tout remettre à zéro |
| Chrono 15 s, malus au dépassement | **20 s**, et le dépassement donne seulement une nouvelle question |
| Question ratée = **jamais revue** (liste noire définitive) | elle revient : la liste noire vidait le pool et provoquait des réinitialisations en boucle |
| Difficulté augmentée par l'**échec**, jusqu'au palier « expert » | augmentée par la **réussite**, plafonnée à 3 |
| `sort(() => Math.random() - 0.5)` — mélange **biaisé** | Fisher-Yates |
| Libellé injecté dans un `onclick` entre apostrophes | `data-opt` + un seul écouteur délégué |

## Base de questions corrigée

100 questions, dont une apparaissait **3 fois** (le suivi par `indexOf()`
pointait donc toujours la première). Corrigé aussi :

- une entrée corrompue en **cyrillique** (« déдесятроcanoniques ») ;
- **Immaculée Conception** attribuée à Vatican I → proclamée par **Pie IX en
  1854** (*Ineffabilis Deus*) ;
- **Filioque** attribué à un concile qui ne l'a jamais défini ;
- « Combien de **cas** dans la Genèse » → chapitres ; « buisson de **Soreb** »
  → mont Horeb ;
- « Docteur de l'Église le **plus ancien** » et « **premier** Docteur » n'ont
  pas de réponse sûre.

## Vérifié (`_diag_v66.js`, 9 contrôles, tous verts)

| Contrôle | Résultat |
|---|---|
| Mot de passe en clair dans le HTML servi | **absent** |
| Premier lancement | verrou visible, 4 options, score 0 |
| Mauvaise réponse | nouvelle question, chrono remis à 20, **compteur à 0** |
| Onglet masqué puis rendu | chrono 14→14 (pause) → 12 (reprise), question et compteur intacts |
| 3 bonnes réponses | accès accordé, mode `verse` |
| Mauvais mot de passe | « Mot de passe incorrect », aucun accès |
| Bon mot de passe **sans** la case | accès `admin`, **aucun jeton** |
| Bon mot de passe **avec** la case | jeton écrit, **7 jours** |
| Rechargement (session vidée) | **accès direct** `admin` — le jeton suffit |
| Bouton « oublier » | jeton effacé, verrou revenu |

---

# v65 — l'app se fermait au choix du dossier de sauvegarde

Signalé : « j'ai un bug avec la sauvegarde DATA/Statistiques… lorsque je
sélectionne le répertoire où je veux sauvegarder, ça quitte directe l'appli ».

## Cause : un `OutOfMemoryError`, pas un bug de sélecteur

Le backup fait **35 740 308 octets**. Trois allocations empilées au même
instant, alors que le sélecteur SAF est déjà à l'écran :

| Où | Allocations |
|---|---|
| WebView | `btoa(unescape(encodeURIComponent(json)))` sur 35 Mo — la chaîne intermédiaire triple sur de l'arabe ou de l'hébreu |
| Pont Capacitor | la chaîne Base64 (~48 Mo) copiée vers le natif |
| Java | un **seul `String`** (~96 Mo en UTF-16) + le `byte[]` décodé (~36 Mo) |

`AndroidManifest.xml` n'a **pas** `android:largeHeap`. Le pic tombe exactement
au retour du sélecteur → « ça quitte dès que je choisis le répertoire ».

## Correctif : on ouvre le dossier d'abord, on écrit ensuite

`SavePickerPlugin.java` (réécrit) :

- `saveAs({name})` ouvre SAF **avec le nom du fichier seulement** — plus aucune
  donnée ne traverse le pont pendant que le sélecteur est ouvert → `{token}`
- `writeChunk({token, data64})` ajoute ~256 Ko
- `finish({token})` ferme, affiche le Toast · `abort({token})` ferme et supprime
- Les sessions vivent dans une **map statique** : `saveAs` et `pickDir` peuvent
  s'exécuter sur deux instances si l'activité est recréée par le sélecteur.

Côté JS, `exportData()` envoie `{filename, text}` sur natif (le desktop garde
`data64`, `app.py` inchangé) ; le shim encode via `TextEncoder` puis pousse des
tranches de 192 Ko.

**Garde-fou** trouvé pendant les tests : le repli `Filesystem` ne sait porter
que du Base64. Il ré-encode si le backup fait moins de 4 Mo, sinon il
**signale l'échec**. Avant, il écrivait un fichier de **0 octet** en répondant
`ok:true` — une fausse sauvegarde, pire que le plantage.

## Vérifié (`_diag_save.js`, bridge Capacitor simulé, 6 scénarios)

| Scénario | Résultat |
|---|---|
| A. 1,1 Mo (accents + arabe + hébreu + emoji) | 9 morceaux de 262 144 → **identique à l'octet près**, 20 ms |
| B. ancien chemin `{filename, data64}` | identique |
| C. `writeChunk` échoue, backup < 4 Mo | `abort` + repli avec les vraies données, `ok:true` |
| C2. `writeChunk` échoue, backup > 4 Mo | 500 + `ok:false`, **aucun fichier vide** |
| D. vieux plugin sans morceaux | `saveAs({name, data64})`, inchangé |
| E. utilisateur annule le sélecteur | `abort` non appelé, repli, `ok:true` |

---

# v64 — le sélecteur de langue de traduction restait vide

Signalé : « des fois lorsque je sélectionne un mot à traduire, ça doit
m'afficher la langue, mais lorsque je clique dans le box, la langue FR ne
vient pas de suite, je dois cliquer en plusieurs fois ».

**Le `<select id="lt-lang">` était créé vide** et rempli seulement *après*
`resolveEndpoint()` **puis** `fetch(ep + '/languages')`. Deux files d'attente
en série avant la moindre option :

1. `resolveEndpoint()` essaie l'URL enregistrée, puis `localhost`, puis la
   passerelle et `.1`/`.2` — **chaque essai mort attend son timeout**
   (1200 ms). Avec une URL enregistrée périmée (l'IP du PC avait changé :
   `.8` → `.71`), on cumule plusieurs secondes avant même de parler au serveur.
2. `/languages` s'ajoute par-dessus — lent au premier appel quand
   LibreTranslate charge ses modèles.

Pendant tout ce temps : **liste vide**. L'utilisateur rouvrait la popup en
boucle — d'où « je dois cliquer en plusieurs fois ».

## Correctif

Le sélecteur n'est **plus jamais vide** :

- **Liste de repli immédiate** : 10 langues sûres (`fr, en, de, it, el, he,
  ar, nl, ja, ko` — toutes vérifiées présentes sur le serveur local), **FR en
  tête**, affichées dès l'ouverture de la popup.
- **Cache de `/languages`** (10 min) : les popups suivantes s'ouvrent avec la
  vraie liste sans attendre le réseau.
- **Préchauffage** 4 s après le démarrage : si une URL est enregistrée, le
  serveur est résolu et la liste chargée en tâche de fond. La première popup
  affiche alors directement les 34 langues.
- **Timeout du 1er essai porté à 3000 ms** (URL enregistrée, celle qui
  réussit presque toujours) ; les candidats de découverte restent à 1200 ms.
- **Le choix de l'utilisateur n'est jamais écrasé** : s'il a déjà choisi dans
  la liste de repli, la vraie liste n'écrase pas sa sélection.
- Changement de serveur → la liste en cache est invalidée.

## Vérifié (Chrome headless 412×915, Capacitor simulé)

| Scénario | t = 0 (ouverture) | ensuite |
|---|---|---|
| URL déjà configurée (préchauffage) | **34 langues, FR en tête** ✅ | — |
| URL saisie après chargement | **10 (repli), FR en tête** ✅ | 34 langues à 3 s |
| Serveur injoignable | **10 (repli), FR en tête** ✅ | jamais vide |

Avant le correctif : `n = 0` options à t = 0 dans les trois cas.

---

# v62 — la barre du header recouvrait les modals

L'utilisateur ne pouvait plus accéder aux modals du header : « ils sont l'un
sur l'autre ». Cause structurelle, pas un bug JS.

**Mesure** (Chrome headless 412×915, `Capacitor.isNativePlatform()` vrai) :

| Élément | x | droite | largeur |
|---|---|---|---|
| Burger `#v6-iconbtn` (≡) | 10 | 50 | 40 |
| Brand `#v6-brand` | 60 | 106 | 46 |
| `#v7-conv` (titre conv.) | 116 | **261** | 145 |
| `#v6-right-grp` (recherche + archives + hermes + ⋮) | **220** | 406 | 186 |

→ **41 px de chevauchement** entre `#v7-conv` (flex) et `#v6-right-grp`
(position: absolute).

## Cause

`#v6-topbar` (règle v43, ligne 21097) réserve `padding-right: 104 px` à droite,
mais le groupe droit contient **désormais 4 boutons** (40+6+44+6+44+6+40 =
186 px). Le padding est resté à 104 px : le groupe absolu déborde de 84 px sur
la zone réservée au titre. Comme `#v7-conv` est un enfant flex en flux normal,
il occupe toute la largeur disponible et finit peint **sous** les boutons.

Le titre était donc visuellement masqué par les boutons — d'où l'impression
que « les modals sont l'un sur l'autre ».

## Correctif

Une seule règle `@media (max-width: 640px)` met tout droit :

- `#v6-topbar { padding: 0 196px 0 8px }` — réserve la place réelle du groupe
  droit (186 px + 8 de tampon), au lieu des 104 px historiques.
- `#v7-conv { max-width: calc(100vw - 312px) }` — cape le titre pour qu'il ne
  déborde jamais dans la zone réservée, peu importe la largeur (412 → 100 px ;
  360 → 48 px ; 320 → 8 px ; 280 → 0 px).
- `#v7-conv-title { text-overflow: ellipsis }` — le titre trop long devient « … »
  au lieu de couper le layout.

## Vérifié

Aux 4 largeurs courantes (Chrome headless + émulation mobile), `#v6-right-grp`
reste dans le viewport, **aucun chevauchement interne** entre ses 4 enfants
(gap 6 px respecté), `#v7-conv` ne déborde jamais dans la zone réservée.

```
=== 412x915 ===  grp 220→406  v7-conv 116→216 ✅
=== 360x780 ===  grp 168→354  v7-conv 116→164 ✅
=== 320x720 ===  grp 128→314  v7-conv 116→124 ✅
=== 280x720 ===  grp  88→274  v7-conv 116→116 ✅ (titre ellipsé)
```

Si la barre paraît encore trop chargée à l'usage, deux suites possibles sans
refonte (à trancher) :
- **Déplacer `#v35-archives-top` et `#v31-hermes-top` dans `#v6-more-menu`** sur
  mobile (le helper `moveTo(id, group)` existe déjà) — la barre n'aurait plus
  que recherche + ⋮.
- **Réduire la taille des boutons** sur mobile (actuellement 40-44 px, tap
  target Material = 48 px, marge possible).

---

# v47 — le commentaire d'annotation ne s'affichait plus

Signalé : après une annotation, toucher le passage annoté ne montrait rien.

**C'était une régression v41.** Le commentaire s'ouvrait au `mouseover`. Comme
un tap émet `mouseover`, l'infobulle s'ouvrait au lieu de laisser sélectionner
le texte — j'avais désactivé le survol au doigt **sans le remplacer**. La
fonction est restée morte sur mobile pendant 6 versions.

Trois morceaux, parce qu'un déclencheur tactile ne remplace pas un déclencheur
souris tel quel :

1. **`click` sur `.atc-hl` → commentaire**, avec 400 ms de délai au doigt pour
   qu'un double-tap puisse l'annuler.
2. **Fermeture au `touchstart` hors de l'infobulle** : elle se fermait au
   `mouseleave`, événement inexistant au doigt — sans ça elle restait affichée
   indéfiniment.
3. **Suppression de 700 ms après un double-tap** : le `click` arrive **après**
   le `touchend`, donc le clic reprogrammait l'infobulle malgré la détection du
   double-tap. Trouvé par le test, pas par raisonnement.

Vérifié (`_diag_v47.js`) : tap → commentaire affiché ; double-tap → rien ;
touche ailleurs → fermé ; survol souris → inchangé.

---

# v46 — l'encadrement restait affiché

Retour après v45 : « appui long sur un mot → j'ai la bulle **en plus de**
l'encadrement ». Deux causes.

## 1. Le menu ne se fermait qu'au `mousedown` (la vraie cause)

`#atc-insert-menu` était fermé par un `document.mousedown`. Or **un appui long
sur Android n'émet pas de `mousedown`** — il émet `contextmenu`. Le menu
ouvert par le double-tap précédent restait donc à l'écran, et l'appui long
suivant affichait la bulle **par-dessus un menu jamais fermé**. D'où « la bulle
**en plus de** l'encadrement ».

→ Fermeture ajoutée sur `touchstart` hors du menu.

## 2. Fausse paire de taps

Le détecteur de double-tap comptait **tout** `touchend`. Un appui long dure
~500 ms, et le glissement d'une poignée de sélection produit un **second**
`touchend` : les deux pouvaient former une paire valide (< 350 ms, < 40 px).

→ Seuls des taps **francs** comptent désormais : pression < 250 ms **et** aucun
`touchmove` de plus de 12 px. Sinon la paire est oubliée.

## Gestes vérifiés (`_diag_v46.js`, `Touch`/`TouchEvent` synthétiques)

| Geste | Résultat |
|---|---|
| appui long 600 ms | **bulle seule** ✅ |
| double-tap franc (2 × 80 ms) | **encadrement** ✅ |
| glissement 40 px + tap | **bulle seule** ✅ |
| menu ouvert + touche ailleurs | `block` → `none` ✅ |

---

# v45 — l'encadrement ne se lance plus à la sélection

Demande : l'encadrement **seulement** au double-tap, pas quand je sélectionne
un mot ou une phrase.

`openInsertMenuAt()` n'a que trois appelants :

| Déclencheur | S'ouvre à la sélection ? |
|---|---|
| action 📐 dans la bulle (clic délibéré) | non |
| double-tap (v42) | non |
| **`contextmenu` sur `.message-content`** | **OUI** |

Or **sur Android, l'appui long émet `contextmenu`** — et l'appui long est
exactement le geste pour sélectionner un mot ou une phrase. Sélectionner
ouvrait donc le menu d'encadrement à la place de la bulle.

Sur tactile, cette branche est court-circuitée. Les menus surlignage
(`.atc-mark`, `.atc-hl`) et figure (`.atc-figbox`) sont **conservés** :
l'appui long est leur seul moyen d'accès sur mobile. Le clic droit souris
ouvre toujours l'encadrement — aucune régression desktop.

Vérifié en navigateur : appui long au doigt → **menu non créé** ; clic droit
souris → **menu affiché**.

**Point tranché avec l'utilisateur** : sur Android, double-taper un mot *le
sélectionne*, donc les deux gestes se confondent. Choix retenu = **garder le
double-tap direct** (v42) : double-taper un mot l'encadre immédiatement, et
sélectionner par appui long ne déclenche plus rien.

---

# v44 — dernière dépendance à un serveur local

Audit complet des 12 actions de la bulle de sélection : **une seule** appelait
encore une machine locale.

| Action | Transport | Sur le téléphone |
|---|---|---|
| 11 actions | HTTPS vers le fournisseur IA | ✅ (depuis v43) |
| **Traduire** | `http://localhost:5000/translate` (LibreTranslate auto-hébergé) | ❌ mort |

Sur Android, `localhost` désigne **le téléphone**, et le HTTP en clair est
bloqué (`usesCleartextTraffic=false`). Depuis v44, l'action « traduire » est
masquée dès que `__THEO_TOUCH_UI()` est vrai (Capacitor natif **ou**
`pointer: coarse`) ; elle reste disponible sur desktop, où le serveur tourne.

Les deux seuls endpoints same-origin (`/theologicus-keys`, `/save-data`) sont
déjà couverts par le shim mobile v34. **Il ne reste plus aucun appel à une
machine locale dans l'APK.**

---

# v43 — deux pannes majeures

## 1. Plus aucun appel IA ne fonctionnait sur l'APK

`apiEndpoint()` réécrit **toutes** les URL de fournisseurs en `/proxy/<url>`,
un serveur local CORS (`proxy_server.py`, lancé par `app.py`, l'app pywebview).
**Ce serveur n'existe pas sur le téléphone.** Donc sur l'APK, chaque requête
partait vers `https://localhost/proxy/...` → 404 → « Erreur API ».

Ce n'était pas limité au bouton ❓ : **le chat entier était mort**. Le proxy ne
fait que relayer les en-têtes et le corps — il n'injecte aucune clé — donc
appeler le fournisseur directement est strictement équivalent. C'est ce que
fait désormais le natif.

CORS vérifié en préflight avant de trancher :

| Fournisseur | Réponse |
|---|---|
| Mistral | `access-control-allow-origin: *` ✅ |
| OpenAI | `Access-Control-Allow-Origin: https://localhost` ✅ |
| Anthropic | nécessite `anthropic-dangerous-direct-browser-access: true` (ajouté) |

## 2. Le bouton « Plus » sortait de l'écran en portrait

Mesuré en émulation 412 px : bord droit du ⋮ à **414 px**, puis **437 px** après
une première tentative de correctif. Or v6 **déplace physiquement** tous les
boutons de modals dans ce menu (`moveTo()` fait un `appendChild`) — donc ils
étaient tous inatteignables. C'est exactement « je ne vois pas les modals du
header ».

Le contenu de la barre dépasse la largeur disponible ; laisser les éléments se
comprimer ne suffisait pas (le groupe glissait plus loin). La barre réserve
désormais 104 px à droite et le groupe recherche + ⋮ est **ancré en absolu** :
il reste atteignable quel que soit le contenu. Mesuré après : **362–406 px**.

Le menu reçoit aussi `max-height: calc(100vh - 70px)` et `overflow-y: auto` —
sans ça, sur un écran court, ses dernières entrées (STATS, zone critique)
étaient coupées sans moyen de défiler.

**Le menu « Plus » contient déjà tous les modals** : API, AGENT, DATA,
PARAMÈTRES, HERMES, ARCHIVES, NOUVEAU, COMPRESSER, ANNOT., CLEAR, STATS. Rien à
y déplacer — il fallait juste pouvoir l'atteindre.

---

# v42 — bulle de sélection et double-tap

- **Bulle restaurée** avec ses 12 actions. Le problème était leur taille, pas
  leur présence : la bulle se replie sur plusieurs lignes et chaque cible fait
  44 px. Mesuré : 12 actions, aucune < 44 px, 396 px de large sur 412.
- **Double-tap → encadrement** : deux taps à moins de 350 ms et 40 px ouvrent
  le menu d'encadrement. Fait à la main (`dblclick` est pris par le renommage
  et n'est pas fiable sur WebView). Tactile uniquement.

# v41 — conservé partiellement

La garde qui empêche l'infobulle d'annotation de s'ouvrir au **tap** reste :
un tap émet `mouseover`, donc sans elle chaque toucher bloquait la sélection.
Le survol souris est inchangé.

# v40 — rail latéral et version automatique

- Le rail ne s'ouvrait jamais au doigt : `iPadTouchFix()` re-déclenchait
  `el.click()` 12 ms après chaque `touchend` sans vérifier si le navigateur
  avait déjà cliqué → **chaque bouton mobile était actionné deux fois**.
- `versionCode` = `git rev-list --count HEAD`, avec `fetch-depth: 0` en CI.

---

# Contrôles sur l'APK livrée

- `aapt2 dump badging` (local + CI) : `com.theologicus.app`,
  local versionCode **43** / `1.0.43` (v66), release CI attendue
  versionCode **44** / `1.0.44`
- `apksigner verify` (local + CI) : SHA-256
  `93d8324058f1ecd1d252d97b976854ffaf2a976605b9658983d17db6d70f5e67`
  (identique à toutes les versions depuis le run #24 → la mise à jour
  s'installe par-dessus sans désinstallation, qu'elle vienne du build local
  ou de GitHub)
- v65 (×5), v64, v62, v61, v60, v59, v58, v47, v46, v45, v44, v43 et v42 sont
  tous présents dans les assets packagés (`grep -c 'vNN —' …/index.html`)
- Build local v66 : `BUILD SUCCESSFUL` en 19 s (cache très chaud)
- CI run #35360438491 → **success** → release `apk-v1.0.45` publiée,
  `app-release.apk` (11 344 825 o) re-vérifié : versionCode **45** / `1.0.45`,
  `93d832…`, widget vertical et bouton mémoire masqués (`display: none`)
- `main` = `91edeb4` (poussé)
- APK à installer : `.workbuddy-ai/artifacts/theologicus-v1.0.45-release-ci.apk`
  (11,3 Mo) — locale `theologicus-v1.0.44-release.apk` au même code
- Historique : v62 → `e605d73` (1.0.40), v63 → `05f81dd` (1.0.41 desktop),
  v64 → `1f64d44` (1.0.42), v65 → `dd022bb` (1.0.42 local / 1.0.43 CI),
  v66 → `1baa5e5` (1.0.43 local / 1.0.44 CI),
  v67 → `91edeb4` (1.0.44 local / 1.0.45 CI)

> Attention : `THEOLOGICUS.html` est en **CRLF**. Chercher un motif multi-ligne
> avec `\n` dans les assets renvoie un faux négatif — utiliser `\r\n`.

# Test comportemental (Chrome headless, 412×915, `Capacitor.isNativePlatform()` vrai)

Un vrai message est créé via l'état interne (`state.messages` + `renderMessages()`),
puis sélectionné — l'app re-rend `#chat-container` en asynchrone et vide toute
sélection faite sur un nœud injecté à la main.

| Contrôle | Résultat |
|---|---|
| Bulle au doigt | affichée, **11 actions**, 396 px de large, aucun débordement |
| Action « Traduire » au doigt | **masquée** ✅ (v44) |
| Action « Traduire » à la souris | **visible** ✅ (témoin : 12 actions) |
| Cibles tactiles | aucune < 44 px |
| `apiEndpoint()` | renvoie l'URL du fournisseur telle quelle ✅ (v43) |
| En-tête Anthropic | `anthropic-dangerous-direct-browser-access: true` présent ✅ |
| Groupe recherche + ⋮ en portrait | bord droit à **406 px** pour 412 → atteignable ✅ |
| Gestionnaire double-tap | présent ✅ |

# Attention : locale et GitHub ont des signatures différentes

**Une première analyse a conclu à tort que les releases GitHub étaient non
signées.** Elle cherchait des fichiers `META-INF/*.RSA`, ce qui ne détecte que
la signature **JAR v1**. Or AGP signe en **v2/v3** : la signature vit dans
l'APK Signing Block, sans aucun fichier `META-INF`. Contrôle fiable :
`apksigner verify --print-certs`, jamais un listing de ZIP.

Situation réelle, mesurée sur les releases v1.0.19 → v1.0.22 :

| Source | Certificat SHA-256 |
|---|---|
| Build local (`output/…`) | `93d832…` |
| Release GitHub (**depuis le run #24**) | `93d832…` ✅ |
| Release GitHub (avant, v1.0.19 → v1.0.23) | `078f6c…` ⚠️ |

**C'était le problème** : deux signatures incompatibles, donc impossible
d'installer l'une par-dessus l'autre sans désinstaller (perte des annotations,
clés API, conversations). Les secrets `APK_KEYSTORE_*` contenaient un keystore
différent de `theologicus-release.jks`. Corrigé le 2026-09-16 : les trois
secrets ont été remplacés par les valeurs du keystore local, et le run #24 a
produit un `93d832…` avec le DN complet `CN=THEOLOGICUS, OU=Mobile, C=FR`.

Désormais **une seule signature partout** : tu peux installer indifféremment
depuis GitHub ou depuis un fichier transféré, toujours en mise à jour.
Règle absolue : **ne jamais remplacer `theologicus-release.jks`**.

Autre piège : l'APK locale `v1.0.20` et la release GitHub `apk-v1.0.20`
portent le même numéro mais **pas le même code** (le `versionCode` local est
compté avant le commit, celui de la CI après). Toujours donner le **chemin
exact**, jamais seulement la version.

# Reste à faire

1. **Tester sur le téléphone** la sauvegarde DATA/Statistiques (v65) : choisir
   un dossier, vérifier que l'app ne se ferme plus et que le fichier produit
   fait la taille attendue (~35 Mo), puis le réimporter.
2. **Tester sur le téléphone** que la barre est lisible et que les 4 boutons
   sont atteignables sans chevauchement (v62). Si encore trop chargée à
   l'usage : déplacer archives/hermes dans le menu « Plus » sur mobile (helper
   `moveTo(id, group)` déjà disponible).
2. **Pare-feu Windows** : la règle autorisant le port 5000 pour LibreTranslate
   doit être créée en **administrateur** (`netsh advfirewall firewall add
   rule …` nécessite l'élévation). Sans elle le téléphone ne joint pas le PC.
3. **Saisie unique de l'URL LibreTranslate** dans la popup ⚙️ de l'app
   (`http://192.168.100.71:5000`) — l'auto-découverte ne sonde que la passerelle
   et `.1`/`.2`, pas le PC qui est en `.71`.
4. **Tester sur le téléphone** le verrou v66 (« souvenir de moi », 7 jours,
   effacement depuis les réglages) et la disparition des deux boutons v67
   (`#floating-sidebar`, `#memory-toggle`).

# Proposition 2.0 — document d'analyse

`v2.0-proposition.md` (18/09/2026, état de référence `v1.0.45`). **Aucune ligne
de code modifiée** — c'est une proposition, pas une implémentation.

Constat qui structure tout le document : `buildSystemPrompt()` (l. 13742) ne
donne au modèle que des **règles de citation**, jamais de **contenu**. Il est
reconstruit à chaque appel (l. 13742, 14522, 14606, 14695, 15205, 15256, 15330)
et il n'existe **aucune** fonction de récupération documentaire. Les **51 Mo**
de corpus locaux (`bible/` 4,3 · `quran/` 2,6 · `tafsir/` 41 · `libs/` 3,1) ne
servent donc qu'à l'affichage.

Absences **vérifiées** par recherche dans le monolithe : recherche plein texte
(0 — aucune fonction `searchBible`/`searchCorpus`, aucun `id="search*"`),
concordance (0), lexique/Strong (0 — les 38 « strong » sont des `<strong>`),
catena (0), synopse (0), versification (0), calendrier (0), embeddings (0),
SQLite (0 — mais `indexedDB` 17 usages), détection hors ligne (0 —
`navigator.onLine` jamais appelé). Denzinger : 1 mention, aucune donnée.

La « bibliothèque de référence » déclare **41 sources** dont chacune est un
simple `url:` vers `vatican.va` → décorative hors ligne.

Structure proposée en trois paliers :

1. **Vérifier** — index inversé local + recherche globale ; **vérificateur de
   citations** (extraction des références, contrôle d'existence, contrôle du
   texte cité, annotation ✅/⚠️/✏️) ; renvois cliquables. C'est le vrai contenu
   de la 2.0 : transformer une promesse du prompt en garantie du logiciel, sans
   réseau ni modèle supplémentaire.
2. **Retrouver** — versification Vulgate/hébraïque/Septante, concordance de
   racines, index thématique, glossaire théologique (~400-600 entrées),
   calendrier liturgique (algorithmique, zéro donnée), dossier d'étude PDF.
3. **Étudier** — synopse des Évangiles (~250 péricopes), comparateur de
   traductions (Crampon 1923 + Vulgate, domaine public), conciles et magistère
   en local, catena patristique sur les ~300 versets majeurs, apparat critique
   allégé, biométrie.

Refus explicités : embeddings/RAG neuronal (un index BM25 local fait mieux ici),
Strong complet (projet de plusieurs mois), catena auto-générée (une fausse
citation patristique détruit la confiance), téléchargement des URL vatican.va,
synchronisation cloud, compression des 51 Mo.

---

# v2.0 — livré (commit `061e09d`, release `apk-v2.0.46`)

Spécification : `v2.0-spec.md`. La CI publie désormais des tags `2.0.x`
(`VERSION_NAME=2.0.$N`, l. 46 et 146 du workflow).

## Les deux problèmes corrigés

**1. Le bouton rond du bas à droite n'avait pas disparu.** `#references-btn` et
`#memory-toggle` déclarent **le même emplacement fixe** (`right:16px;
bottom:80px; 40×40; border-radius:50%`). Masquer `#memory-toggle` en v67 a
simplement révélé `#references-btn`, placé dessous dans le DOM — d'où
l'impression que rien n'avait changé. Les deux sont maintenant masqués ; le
panneau RÉFÉRENCES reste accessible par la barre supérieure (v62) et
`window.v13RefsOpen()`.

Trouvé en **mesurant** la capture au lieu de l'œil : l'image fait 1440×3088,
densité 3,66 (viewport 393 px), bouton droit mesuré à x ≈ 1305, ce qui
correspond exactement à l'emplacement `right:16px`.

**2. Toutes les références étaient des liens morts hors ligne.**
`inlineMd()` transformait chaque référence biblique en lien vers BibleGateway.
Le Coran était déjà local ; les documents magistériels partent sur vatican.va.
Désormais un tap résout la référence contre le corpus embarqué et affiche le
verset sur place, sans réseau. La mécanique existait déjà (`parseRef`,
`getVerses`, `showTip`, `__ensureBibleBook`) mais n'était branchée que sur le
survol — inopérante au doigt.

## Ajouts

- `tools/build_versification.js` → `bible/versification.js` (9,7 Ko) et
  `quran/versification.js` (1,1 Ko) : **66 livres / 1 191 chapitres /
  31 207 versets** et **114 sourates / 6 236 versets**, 0 divergence. Généré
  depuis le corpus, jamais saisi. Permet de dire si un verset existe sans
  charger 4,3 Mo.
- `tools/check_syntax.js` — valide les 49 blocs `<script>` inline. À lancer
  avant toute compilation : un bloc cassé rend l'app muette (l'incident v66).
- Diagnostic précis des références invalides : « Le chapitre 3 compte
  36 versets : le verset 37 n'existe pas. »
- `biblehub.net/search.cgi` (404) → `biblehub.com/search.php` (200).

### T4 — marques de vérification des références (livré)

Chaque référence biblique ou coranique reçue de l'IA est confrontée au corpus
embarqué **hors ligne** et marquée à côté du lien :

- **✅** — le verset existe dans le corpus local (table de versification,
  instantané, sans chargement de tranche) ;
- **⚠️** — la référence est absente du corpus (chapitre ou verset inexistant) :
  c'est une citation inventée ;
- **✏️** — le verset existe mais son texte n'est pas disponible localement.

Réglage **⚙ PARAMÈTRES → Vérification des références** : `strict` (défaut, chaque
référence marquée), `souple` (seules les absences ⚠️), `désactivé` (aucun
marquage, comportement 1.0). Stocké dans `localStorage['theologicus_verify']`,
appliqué en live à toute la conversation via un `MutationObserver` sur
`#chat-container`. Moteur `initVerifyMarks()` (~l. 19116) — parsers et états de
vérification exposés sur `window` (`__parseBibleRef`, `__bibleVerifyState`,
`__parseQuranRef`, `__quranVerifyState`, `__applyVerifyMarks`). Les marques sont
des **frères** du lien (pas des enfants) pour que `textContent` reste parseable.

> **Correctif post-`apk-v2.0.47`** : le contrôle réglage (select
> `#verify-mode-select` + `syncVerifyModeSelect()` + handler `onchange`) avait été
> **omis** de la build `apk-v2.0.47` (le moteur de marquage y était présent, mais
> l'UI permettant de passer en `souple`/`off` manquait — `syncVerifyModeSelect()`
> était appelé sans être défini). Restauré le 2026-09-18, shippe à la prochaine
> release. Le moteur et la logique de mode (testés via `localStorage` +
> `dispatchEvent`) étaient déjà vérifiés à 24/24.

## Preuves

Banc CDP `_diag_v20.js` : **24/24** (18 de la base + 6 du T4). Tap `Jean 3:16` →
verset local, navigation bloquée. `Jean 3:37` → signalé. `Psaume 23:1` **réseau
coupé** → résolu. **0 requête externe** sur toute la session. T4 : réf. valide →
✅, réf. absente → ⚠️, Coran valide → ✅, mode `souple` retire ✅ et garde ⚠️,
mode `désactivé` → 0 marque.

APK : `versionCode 46`, `versionName 2.0.46`, signature
`93d8324058f1ecd1d252d97b976854ffaf2a976605b9658983d17db6d70f5e67` (inchangée).
CI run `35363869961` → succès.

## Reste à faire (v2.0, palier 1)

1. **Vérifier sur téléphone** : taper une référence, couper les données, vérifier
   que le verset s'affiche ; confirmer que le bouton du bas à droite a
   disparu ; tester le nouveau réglage *mode vérification*.
2. **Fallback `1.0.` dans `android/app/build.gradle`** l. 48 — à passer à `2.0.`
   quand on retouchera le build (non fait ici pour ne pas créer une release en
   double). La skill passe désormais `APK_VERSION_NAME` explicitement.
3. **Droits sur la traduction** : le corpus est identifié « BJ 1998 » (Bible de
   Jérusalem, 1998) — donc sous droits. Cela conditionne le comparateur de
   traductions et l'export des paliers suivants.
