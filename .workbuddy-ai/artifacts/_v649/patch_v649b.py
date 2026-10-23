# -*- coding: utf-8 -*-
"""v649b — LE SCROLL NE DECLENCHE PLUS DE TRAVAIL INUTILE.

Etat apres v649 (sonde _v649/sonde_perf.js, 60 messages, 2 figures) :

                              reference   apres v649
    reflows / scroll (10 pas)     0            1134
    reflows / settle             —             264

Le cache de proximite a divise le cout par 3, mais il RESTE une mesure par
message et par passe, et le gestionnaire de scroll relance un settle complet
(4 passees) sur chaque cran.

Or le role de ce gestionnaire est etroit et precis : traiter les messages qui
ENTRENT dans le viewport (regle lazy v628). Un defilement de moins que la marge
(300 px) n'en fait entrer AUCUN — relancer un settle ne sert donc a rien.

Correctif, en deux gestes :
  1. le scroll est ignore tant que la vue n'a pas bouge de plus que la marge ;
  2. quand un message entre vraiment, UNE seule passe suffit : les reprises a
     120/400/900 ms servent a rattraper le contenu qui grandit APRES un rendu,
     pas un simple defilement. Le chemin de rendu (MutationObserver) garde ses
     4 passes.

Piece jointe : `_atcConteneurScroll()`. Mesure : `document.scrollingElement` NE
DEFILE PAS dans cette app (scrollHeight == clientHeight == 900) ; le vrai
conteneur est `#chat-container` (scrollHeight 24175). Sans ce helper, la
comparaison de position portait sur un element qui ne bougeait jamais.
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

# ───────── A. `_atcSettle` accepte un mode « une seule passe » ─────────
AVANT_A = (
    "  function _atcSettle(){\r\n"
)
APRES_A = (
    "  function _atcSettle(uneSeule){\r\n"
)
s = once(s, AVANT_A, APRES_A, "A1. signature de _atcSettle")

AVANT_A2 = (
    "    var _seq0 = Date.now();\r\n"
    "    passe();\r\n"
    "    _atcSettleTO.push(setTimeout(passe, 120));\r\n"
    "    _atcSettleTO.push(setTimeout(passe, 400));\r\n"
    "    _atcSettleTO.push(setTimeout(passe, 900));\r\n"
    "  }\r\n"
)
APRES_A2 = (
    "    var _seq0 = Date.now();\r\n"
    "    passe();\r\n"
    "    /* v649b — UNE SEULE PASSE SUR DEMANDE. Les reprises a 120/400/900 ms\r\n"
    "       servent a rattraper le contenu qui grandit APRES un rendu. Un simple\r\n"
    "       defilement n'insere aucun contenu : les declencher double le cout\r\n"
    "       pour rien. Le chemin de rendu (MutationObserver) garde ses 4 passes. */\r\n"
    "    if (uneSeule) return;\r\n"
    "    _atcSettleTO.push(setTimeout(passe, 120));\r\n"
    "    _atcSettleTO.push(setTimeout(passe, 400));\r\n"
    "    _atcSettleTO.push(setTimeout(passe, 900));\r\n"
    "  }\r\n"
)
s = once(s, AVANT_A2, APRES_A2, "A2. _atcSettle(uneSeule) saute les reprises")

# ───────── B. `_atcScheduleApply` transmet le mode ─────────
AVANT_B = (
    "  function _atcScheduleApply(){\r\n"
    "    if (_atcMoRaf) return;                       // deja planifie cette frame\r\n"
    "    if (typeof requestAnimationFrame === 'function') {\r\n"
    "      _atcMoRaf = requestAnimationFrame(function(){\r\n"
    "        _atcMoRaf = null;\r\n"
    "        try { _atcSettle(); } catch (e) {\r\n"
)
APRES_B = (
    "  function _atcScheduleApply(uneSeule){\r\n"
    "    if (_atcMoRaf) return;                       // deja planifie cette frame\r\n"
    "    /* v649b — tout declenchement qui ne vient PAS du scroll signifie que la\r\n"
    "       mise en page a change : le point de comparaison du defilement est\r\n"
    "       perime, on le remet a zero pour ne pas sauter un vrai changement. */\r\n"
    "    if (!uneSeule) _atcScrollVu = null;\r\n"
    "    if (typeof requestAnimationFrame === 'function') {\r\n"
    "      _atcMoRaf = requestAnimationFrame(function(){\r\n"
    "        _atcMoRaf = null;\r\n"
    "        try { _atcSettle(uneSeule); } catch (e) {\r\n"
)
s = once(s, AVANT_B, APRES_B, "B. _atcScheduleApply transmet le mode")

# ───────── C. le gestionnaire de scroll ─────────
AVANT_C = (
    "  var _atcScT = null;\r\n"
    "  document.addEventListener('scroll', function(){\r\n"
    "    if (window.__atcStreaming || window.__atcApplying || window.__atcFigEditing) return;\r\n"
    "    if (_atcScT) return;\r\n"
    "    _atcScT = setTimeout(function(){ _atcScT = null; _atcScheduleApply(); }, 120);\r\n"
    "  }, { passive: true, capture: true });\r\n"
)
APRES_C = (
    "  var _atcScT = null;\r\n"
    "  /* v649b — le conteneur qui defile VRAIMENT. Mesure :\r\n"
    "     `document.scrollingElement` NE DEFILE PAS dans cette app\r\n"
    "     (scrollHeight == clientHeight == 900) ; le vrai conteneur est\r\n"
    "     `#chat-container` (scrollHeight 24175, clientHeight 697). Comparer la\r\n"
    "     position sur un element qui ne bouge jamais rendait le garde inutile. */\r\n"
    "  var _atcScrollEl = null;\r\n"
    "  function _atcConteneurScroll(){\r\n"
    "    if (_atcScrollEl && document.contains(_atcScrollEl)) return _atcScrollEl;\r\n"
    "    _atcScrollEl = document.querySelector('#chat-container') ||\r\n"
    "                   document.querySelector('.message-content');\r\n"
    "    if (!_atcScrollEl) _atcScrollEl = document.scrollingElement || document.documentElement;\r\n"
    "    return _atcScrollEl;\r\n"
    "  }\r\n"
    "  var _atcScrollVu = null;\r\n"
    "  document.addEventListener('scroll', function(){\r\n"
    "    if (window.__atcStreaming || window.__atcApplying || window.__atcFigEditing) return;\r\n"
    "    if (_atcScT) return;\r\n"
    "    /* \U0001f534 v649b — NE RIEN FAIRE SI AUCUN MESSAGE N'EST ENTRE DANS LE VIEWPORT.\r\n"
    "       Ce gestionnaire existe pour traiter les messages qui ENTRENT (regle lazy\r\n"
    "       v628). Un defilement de moins que la marge (300 px) n'en fait entrer\r\n"
    "       AUCUN : relancer un settle complet ne sert a rien. Mesure avant correctif\r\n"
    "       (sonde _v649) : ~113 reflows forces par cran de molette sur une\r\n"
    "       conversation de 60 messages, la ou le build d'avant la refonte en\r\n"
    "       coutait 0. Un defilement continu ne declenche donc plus rien tant\r\n"
    "       qu'aucun message nouveau n'apparait — et quand il en apparait un, une\r\n"
    "       seule passe suffit (`uneSeule`). */\r\n"
    "    var _sc = _atcConteneurScroll();\r\n"
    "    var _st = _sc ? _sc.scrollTop : 0;\r\n"
    "    if (_atcScrollVu !== null && Math.abs(_st - _atcScrollVu) < _ATC_VIEW_MARGIN) return;\r\n"
    "    _atcScrollVu = _st;\r\n"
    "    _atcScT = setTimeout(function(){ _atcScT = null; _atcScheduleApply(true); }, 120);\r\n"
    "  }, { passive: true, capture: true });\r\n"
)
s = once(s, AVANT_C, APRES_C, "C. gestionnaire de scroll : garde de viewport")

# Le remplacement DOIT changer le fichier.
with io.open(CIBLE, "r", encoding="utf-8", newline="") as f:
    ref = f.read()
if s == ref:
    print("[ECHEC] aucune difference produite.")
    sys.exit(1)

crlf = s.count("\r\n")
lf_iso = len([1 for i, c in enumerate(s) if c == "\n" and (i == 0 or s[i - 1] != "\r")])
if lf_iso:
    print("[ECHEC] %d fin(s) de ligne LF isolee(s) dans le resultat." % lf_iso)
    sys.exit(1)

bak = CIBLE + ".v649b.bak"
if not os.path.exists(bak):
    shutil.copy2(CIBLE, bak)
    print("[OK] sauvegarde : %s" % os.path.basename(bak))

with io.open(CIBLE, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("OK \u2014 v649b appliqu\u00e9. CRLF : %d, LF isol\u00e9s : %d" % (crlf, lf_iso))
