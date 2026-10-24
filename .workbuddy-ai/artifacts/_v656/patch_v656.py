# -*- coding: utf-8 -*-
"""v656 — VEILLE DE MISE EN PAGE.

Le defaut, mesure trois fois :
    banc v634, run local : depart 147,72  ->  reloads 149,301, 149,301, 149,301
    CI shard 1           : 149,240        ->  149,301
Le cadre est pose AVANT que le contenu ait fini de grandir, et RIEN ne le
replace ensuite : `_atcSettle` s'arrete a 900 ms alors que la mise en page
mesuree (`_v655/diag_layout.js`) continue de croitre jusqu'a ~4 s
(74 832 -> 78 009 px, +3 177 px).

Ce qui est faux n'est pas l'ancre (mesure v654 : ancre changee = 0/18), c'est
le MOMENT du placement. Il faut donc continuer a replacer tant que la hauteur
de contenu bouge — et s'arreter des que le contenu est calme.

Ce n'est PAS la convergence de v651b (qui re-reparait l'ANCRE et degradait
tout) : ici on ne touche pas a l'ancre, on rejoue le PLACEMENT, qui est
idempotent par construction (`bx = rr.x + ox`, v634 verifie ow/oh immuables).
"""
import io
import os
import shutil
import sys

_ici = os.path.dirname(os.path.abspath(__file__))
# Le script vit dans <racine>/.workbuddy-ai/artifacts/_v656/ : trois remontees.
CIBLE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(_ici))),
                     "THEOLOGICUS.html")


def crlf(t):
    return t.replace("\r\n", "\n").replace("\n", "\r\n")


s = io.open(CIBLE, "r", encoding="utf-8", newline="").read()
avant_taille = len(s)


def once(texte, avant, apres, nom):
    n = texte.count(avant)
    if n != 1:
        print("ECHEC %s : %d occurrence(s)" % (nom, n))
        sys.exit(1)
    print("  [OK] %s" % nom)
    return texte.replace(avant, apres, 1)


# ── 1. la fonction de veille, inseree avant `var _atcSettleTO = [];` ──────────
ANCRE_1 = "  var _atcSettleTO = [];\r\n"

VEILLE = crlf("""  /* ═══ v656 — VEILLE DE MISE EN PAGE ═══
     POURQUOI. `_atcSettle` rejoue le placement a 0 / 120 / 400 / 900 ms. Mais
     le contenu grandit PLUS LONGTEMPS que ca : mesure `_v655/diag_layout.js`
     sur la conversation reelle « Kyrios », la hauteur du conteneur passe de
     74 832 a 78 009 px en ~4 s (+3 177 px), par paliers. Un cadre pose a
     900 ms l'est donc sur une mise en page encore provisoire, et rien ne le
     replace ensuite. Symptome exact, mesure deux fois :

         banc v634, local : depart 147,72  ->  reloads 149,301 (x3)
         CI shard 1       : 149,240        ->  149,301

     CE QUE CE N'EST PAS. Pas la convergence de v651b, qui re-reparait
     l'ANCRE et degradait tout (63/107 puis 21-33/107). Ici l'ancre n'est
     JAMAIS touchee : la mesure v654 a montre qu'elle est identique dans
     18 cas sur 18, c'est le texte qui se deplace. On rejoue donc seulement
     le PLACEMENT, qui est idempotent par construction (`bx = rr.x + ox`) et
     que v634 verifie deja (ow/oh immuables apres 5 rendus).

     COMMENT. On echantillonne la hauteur du conteneur : toutes les 300 ms tant
     qu'elle bouge, puis toutes les 600 ms. Des qu'elle change, une passe de
     placement — c'est exactement l'instant ou une position provisoire devient
     fausse. Fenetre de 12 s : la croissance mesuree dure ~4 s, 12 s la couvre
     largement ; au-dela, une croissance n'est plus le fait du rendu mais d'une
     action, et d'autres chemins la traitent. Plafond de 60 echantillons.

     Un echantillon de `scrollHeight` sur une mise en page propre ne force RIEN :
     le layout est deja a jour. Il ne coute quelque chose que quand la hauteur a
     effectivement change — c'est-a-dire quand il faut replacer.

     COUT. Nul sur un defilement : le chemin scroll appelle
     `_atcSettle(true)` et sort avant la veille. Sur un rendu, la veille ne
     place que si la hauteur a bouge. */
  var _atcVeilleTO = null;
  var _atcDernierScroll = 0;
  function _atcVeilleArret(){
    if (_atcVeilleTO) { try { clearTimeout(_atcVeilleTO); } catch (e) {} _atcVeilleTO = null; }
  }
  function _atcHauteurConteneur(){
    var sc = _atcConteneurScroll();
    return (sc === document.documentElement || sc === document.body)
      ? (document.documentElement.scrollHeight || document.body.scrollHeight)
      : sc.scrollHeight;
  }
  function _atcVeille(passe, seq0){
    _atcVeilleArret();
    var hPrec = _atcHauteurConteneur();
    var calme = 0, tours = 0, t0 = Date.now();
    var tour = function(){
      _atcVeilleTO = null;
      tours++;
      var maintenant = Date.now();
      var fini = (maintenant - t0) > 12000 || tours >= 60;
      /* ON NE VEILLE PAS PENDANT QUE L'UTILISATEUR DEFILE. Son geste a la
         priorite, et un defilement ne change pas la mise en page : rien ne
         presse. Mesure : sans cette retenue, le cout d'un defilement passait
         de 220 a 416 reflows sur 10 crans — la veille travaillait pendant le
         geste. */
      if (!fini && maintenant - (_atcDernierScroll || 0) < 250) {
        _atcVeilleTO = setTimeout(tour, 300);
        return;
      }
      var h = _atcHauteurConteneur();
      if (h !== hPrec) { hPrec = h; calme = 0; try { passe(); } catch (e) {} }
      else calme++;
      if (fini) return;
      _atcVeilleTO = setTimeout(tour, calme >= 3 ? 600 : 300);
    };
    _atcVeilleTO = setTimeout(tour, 300);
  }

""")

# ── 2. annuler la veille quand une nouvelle sequence demarre ──────────────────
ANCRE_2 = """    for (var i = 0; i < _atcSettleTO.length; i++) { try { clearTimeout(_atcSettleTO[i]); } catch (e) {} }
    _atcSettleTO = [];
"""
APRES_2 = """    for (var i = 0; i < _atcSettleTO.length; i++) { try { clearTimeout(_atcSettleTO[i]); } catch (e) {} }
    _atcSettleTO = [];
    /* v656 — une NOUVELLE SEQUENCE COMPLETE remplace la precedente : sa veille
       aussi. Mais PAS sur `uneSeule` : ce chemin est celui du DEFILEMENT, et
       l'application defile d'elle-meme au chargement. L'annuler la faisait
       mourir avant la fin de la croissance — mesure sur la conversation
       reelle : la derive revenait (11/107, 381 px) alors que le mecanisme
       etait corrige. Une veille ne doit pas s'arreter parce qu'on a fait
       defiler la vue : le defilement ne change pas la mise en page. */
    if (!uneSeule) _atcVeilleArret();
"""

# ── 3. brancher la veille apres la derniere passe ────────────────────────────
ANCRE_3 = """    _atcSettleTO.push(setTimeout(passe, 900));
  }
"""
APRES_3 = """    _atcSettleTO.push(setTimeout(passe, 900));
    /* v656 — le contenu grandit au-dela de 900 ms : on continue a replacer
       tant que la hauteur bouge, et on s'arrete au calme. */
    _atcVeille(passe, _seq0);
  }
"""

ANCRE_4 = """  document.addEventListener('scroll', function(){
    if (window.__atcStreaming || window.__atcApplying || window.__atcFigEditing) return;
"""
APRES_4 = """  document.addEventListener('scroll', function(){
    /* v656 — un defilement est en cours : la veille s'efface (voir _atcVeille). */
    _atcDernierScroll = Date.now();
    if (window.__atcStreaming || window.__atcApplying || window.__atcFigEditing) return;
"""

for nom, avant, apres in [
    ("1. fonction _atcVeille", ANCRE_1, VEILLE + ANCRE_1),
    ("2. annulation dans _atcSettle", crlf(ANCRE_2), crlf(APRES_2)),
    ("3. branchement apres la passe de 900 ms", crlf(ANCRE_3), crlf(APRES_3)),
    ("4. horodatage du defilement", crlf(ANCRE_4), crlf(APRES_4)),
]:
    s = once(s, avant, apres, nom)

# ── garde-fous ───────────────────────────────────────────────────────────────
lf_isoles = len([1 for i, c in enumerate(s) if c == "\n" and (i == 0 or s[i - 1] != "\r")])
if lf_isoles != 0:
    print("ECHEC : %d LF isole(s) — CRLF casse" % lf_isoles)
    sys.exit(1)

if not os.path.exists(CIBLE + ".v656.bak"):
    shutil.copy2(CIBLE, CIBLE + ".v656.bak")

io.open(CIBLE, "w", encoding="utf-8", newline="").write(s)
print()
print("CRLF : %d | LF isoles : %d | taille %d -> %d octets"
      % (s.count("\r\n"), lf_isoles, avant_taille, len(s)))
