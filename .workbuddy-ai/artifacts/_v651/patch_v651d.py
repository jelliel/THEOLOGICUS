# -*- coding: utf-8 -*-
"""v651d — CONVERGENCE UNE SEULE FOIS (et non repetee).

Etat mesure sur la conversation REELLE « Kyrios » (107 figures, 0 ancre,
messages de 11 000 a 14 000 caracteres) :

    4 executions du banc : 11/107 deplacees (381 px), 0, 11/107, 0

Soit ~50 % des ouvertures qui deplacent 11 figures de 381 px. C'est une COURSE
entre le chargement des fiches (`.theo-fig`) et la reparation d'ancre.

Deux tentatives precedentes, toutes deux MESUREES PIRE sur ces memes donnees :
    garde de calme seul        : 92/107 deplacees, 387 px
    convergence bornee a 3     : 63/107, et l'instabilite ne s'arretait plus

L'oscillation venait de la REPETITION : chaque re-reparation change l'ancre,
donc la position, donc la hauteur, donc re-declenche.

Correctif : converger UNE SEULE FOIS.
  - une ancre reparee porte `_c = 0` (non confirmee) ;
  - a la premiere passe CALME, on la refait et on pose `_c = 1` ;
  - une ancre `_c = 1` n'est PLUS JAMAIS refaite.
La reparation immediate est conservee (le contrat « une figure sans ancre est
reparee au rendu » ne bouge pas), et la position affichee reste stable.
"""
import io, os, shutil, sys

_ici = os.path.dirname(os.path.abspath(__file__))
CIBLE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(_ici))),
                     "THEOLOGICUS.html")

with io.open(CIBLE, "r", encoding="utf-8", newline="") as f:
    s = f.read()

def once(s, avant, apres, etiquette):
    n = s.count(avant)
    if n != 1:
        print("[ECHEC] %s : %d occurrence(s) de l'ancre (attendu 1)." % (etiquette, n))
        sys.exit(1)
    print("[OK] %s" % etiquette)
    return s.replace(avant, apres, 1)

# ───── A. le mesureur de calme ─────
AVANT_A = (
    "  function _atcConteneurScroll(){\r\n"
    "    var el = document.querySelector('#chat-container') || document.querySelector('.message-content');\r\n"
    "    if (!el) el = document.scrollingElement || document.documentElement;\r\n"
    "    return el;\r\n"
    "  }\r\n"
)
APRES_A = (
    "  function _atcConteneurScroll(){\r\n"
    "    var el = document.querySelector('#chat-container') || document.querySelector('.message-content');\r\n"
    "    if (!el) el = document.scrollingElement || document.documentElement;\r\n"
    "    return el;\r\n"
    "  }\r\n"
    "  /* \u2550\u2550\u2550 v651d \u2014 LA MISE EN PAGE EST-ELLE CALME ? \u2550\u2550\u2550\r\n"
    "     Sert a confirmer UNE SEULE FOIS l'ancre d'une figure reparee. Mesure sur\r\n"
    "     la conversation reelle « Kyrios » : la reparation entre en COURSE avec le\r\n"
    "     chargement des fiches (.theo-fig). 2 executions sur 4 deplacaient 11\r\n"
    "     figures de 381 px ; les 2 autres, aucune. C'est la plainte « ca change\r\n"
    "     d'emplacement a chaque ouverture ». */\r\n"
    "  var _atcCalmeH = -1, _atcCalmeT = 0, _atcCalmePasse = true;\r\n"
    "  function _atcMesurerCalme(){\r\n"
    "    try {\r\n"
    "      var sc = _atcConteneurScroll();\r\n"
    "      var h = sc ? sc.scrollHeight : 0;\r\n"
    "      var now = Date.now();\r\n"
    "      if (h !== _atcCalmeH) { _atcCalmeH = h; _atcCalmeT = now; }\r\n"
    "      return (now - _atcCalmeT) >= 400;\r\n"
    "    } catch (e) { return true; }\r\n"
    "  }\r\n"
)
s = once(s, AVANT_A, APRES_A, "A. mesureur de calme")

# ───── B. convergence UNE SEULE FOIS ─────
AVANT_B = (
    "      var _repare = false;\r\n"
    "      if (!f.ancre) {\r\n"
    "        if (!_ancFit(box, f, figEl)) return;\r\n"
    "        _repare = true;\r\n"
    "      }\r\n"
)
APRES_B = (
    "      var _repare = false;\r\n"
    "      /* \U0001f534 v651d \u2014 CONVERGER UNE SEULE FOIS, JAMAIS EN BOUCLE.\r\n"
    "         Mesure sur la conversation reelle « Kyrios » (107 figures) : 2\r\n"
    "         executions du banc sur 4 deplacaient 11 figures de 381 px, les 2\r\n"
    "         autres aucune \u2014 c'est une course avec le chargement des fiches\r\n"
    "         (.theo-fig). Les deux correctifs essayes avant etaient PIRE sur ces\r\n"
    "         memes donnees : garde de calme seul 92/107 (387 px), convergence\r\n"
    "         bornee a 3 reprises 63/107 SANS JAMAIS se stabiliser \u2014 parce que\r\n"
    "         chaque re-reparation change l'ancre, donc la position, donc la\r\n"
    "         hauteur, donc re-declenche.\r\n"
    "         Ici on converge UNE SEULE FOIS : `_c = 0` sur une ancre fraichement\r\n"
    "         reparee, refaite a la premiere passe CALME, puis `_c = 1` et plus\r\n"
    "         jamais touchee. La reparation immediate est conservee (le contrat\r\n"
    "         « une figure sans ancre est reparee au rendu » ne bouge pas). */\r\n"
    "      if (f.ancre && f.ancre._c !== 1 && _atcCalmePasse) {\r\n"
    "        if (_ancFit(box, f, figEl) && f.ancre) { f.ancre._c = 1; }\r\n"
    "        _repare = true;\r\n"
    "      }\r\n"
    "      if (!f.ancre) {\r\n"
    "        if (!_ancFit(box, f, figEl)) return;\r\n"
    "        if (f.ancre) f.ancre._c = 0;\r\n"
    "        _repare = true;\r\n"
    "      }\r\n"
)
s = once(s, AVANT_B, APRES_B, "B. convergence unique (marqueur _c)")

# ───── C. passe() : evaluer le calme une fois par passe + passe a 1600 ms ─────
AVANT_C = (
    "      try { applyHighlights(); applyMarks(); applyShapes(); } catch (e) {}\r\n"
    "      setTimeout(function(){ window.__atcApplying = false; }, 0);\r\n"
    "    };\r\n"
)
APRES_C = (
    "      _atcCalmePasse = _atcMesurerCalme();\r\n"
    "      try { applyHighlights(); applyMarks(); applyShapes(); } catch (e) {}\r\n"
    "      setTimeout(function(){ window.__atcApplying = false; }, 0);\r\n"
    "    };\r\n"
)
s = once(s, AVANT_C, APRES_C, "C1. passe() : calme evalue une fois par passe")

AVANT_D = (
    "    _atcSettleTO.push(setTimeout(passe, 900));\r\n"
    "  }\r\n"
)
APRES_D = (
    "    _atcSettleTO.push(setTimeout(passe, 900));\r\n"
    "    /* v651d \u2014 passe tardive : les fiches arrivent souvent apres 900 ms. Sans\r\n"
    "       elle, la confirmation « calme » n'aurait jamais lieu. */\r\n"
    "    _atcSettleTO.push(setTimeout(passe, 1600));\r\n"
    "  }\r\n"
)
s = once(s, AVANT_D, APRES_D, "C2. _atcSettle : passe tardive a 1600 ms")

with io.open(CIBLE, "r", encoding="utf-8", newline="") as f:
    ref = f.read()
if s == ref:
    print("[ECHEC] aucune difference produite.")
    sys.exit(1)

crlf = s.count("\r\n")
lf_iso = len([1 for i, c in enumerate(s) if c == "\n" and (i == 0 or s[i - 1] != "\r")])
if lf_iso:
    print("[ECHEC] %d fin(s) de ligne LF isolee(s)." % lf_iso)
    sys.exit(1)

bak = CIBLE + ".v651d.bak"
if not os.path.exists(bak):
    shutil.copy2(CIBLE, bak)
    print("[OK] sauvegarde : %s" % os.path.basename(bak))

with io.open(CIBLE, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("OK \u2014 v651d appliqu\u00e9. CRLF : %d, LF isol\u00e9s : %d" % (crlf, lf_iso))
