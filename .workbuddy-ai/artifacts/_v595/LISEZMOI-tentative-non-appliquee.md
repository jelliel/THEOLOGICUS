# v595 — TENTATIVE NON APPLIQUÉE (documentée)

**Statut : le module n'est PAS dans THEOLOGICUS.html.** Il a été écrit, mesuré,
jugé **incorrect**, puis retiré. Les fichiers sont conservés pour que la
prochaine tentative ne repaye pas les mêmes mesures.

## Le défaut visé (mesuré, réel)

`.header-controls` est une bande défilable (`overflow-x: auto`,
`scrollbar-width: thin`) dont le contenu est **rogné** : à 1280 px sa boîte fait
544 px pour 981 px de contenu, donc 4 boutons sur 8 sont invisibles ; à 1024 px,
2 sur 8. Rien n'est perdu (on peut défiler) mais rien ne le signale.

⚠️ **Piège de mesure** : `getBoundingClientRect()` ne tient pas compte du
rognage d'un ancêtre. Un premier relevé comptait ces boutons comme « visibles »
alors qu'ils sont hors de la boîte — c'est ce qui avait masqué le défaut.

## Pourquoi la tentative a échoué (deux fois)

1. **Critère « retirer jusqu'à ce que la boîte ne déborde plus » : ne converge
   pas.** La boîte de la bande est dimensionnée par son **contenu**
   (`flex: 0 1 auto` sur le parent `.v6-grp`). Chaque bouton retiré la rétrécit,
   ce qui entretient le débordement. Mesuré : 6 boutons descendus au lieu de 4
   à 1280 px — la barre se vidait toute seule.

2. **Critère « préfixe qui tient dans la place figée » : repose sur une
   hypothèse fausse.** Le calcul supposait un écart régulier entre boutons. La
   mesure a montré un « gap » de **42 px** au lieu de 8 : la bande ne contient
   pas 8 boutons mais **9 enfants hétérogènes** —

   | enfant | largeur | type |
   |---|---|---|
   | `open-palette` | 91 | bouton |
   | `model-select` | 26 | **sélecteur** |
   | `open-gsearch` | 133 | bouton |
   | `open-diag` | 114 | bouton |
   | `v155-atelier` | 0 | conteneur |
   | `agent-select` | 26 | **sélecteur** |
   | `v159-media-wrap` | 0 | conteneur |
   | `context-meter` | 0 | **témoin d'état** |
   | `auto-save-indicator` | 34 | **témoin d'état** |

   Des éléments **non-boutons** s'intercalent entre les boutons. Déplacer
   seulement les `.hud-btn` laisse les sélecteurs et les témoins rognés, et
   fausse tout calcul d'écart.

3. **Régression introduite** : à 1920 px, où les 8 boutons tenaient, le module
   en descendait 2 dans le menu. Inacceptable.

## Ce qu'une correction correcte exige

- Traiter **tous** les enfants de la bande (boutons, sélecteurs, témoins), pas
  seulement les `.hud-btn` — ou décider explicitement lesquels sont
  sacrifiables.
- Ne pas fonder le calcul sur un écart supposé : utiliser la **géométrie
  réelle** (`rect.right <= boite.right`), qui ne suppose rien.
- Se protéger de la **rétroaction** (boîte dimensionnée par le contenu) : figer
  la place disponible avant tout retrait, et vérifier qu'on ne retire pas plus
  que nécessaire — contrôle A/B obligatoire sur **1920** (aucun retrait attendu).
- Trois modules construisent cette barre (`v6`, `v35`, `v31`) + plusieurs media
  queries, dont certaines avec un historique de bugs de syntaxe CSS (v103). La
  prudence s'impose.

## Fichiers

- `src_v595.txt` — le module écrit (menu « Plus » width-aware). **Non appliqué.**
- `apply_v595.js` — l'insertion (idempotente, tranches + CRLF).
- `essai_v595_topbar.js` — le banc de contrôle. **Renommé** : la CI n'exécute
  que les `verify_*.js`, et un banc rouge sur un module non appliqué rendrait la
  CI rouge pour rien. À renommer en `verify_*` le jour où le module est livré.
