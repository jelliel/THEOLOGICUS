# -*- coding: utf-8 -*-
"""v651 — NE PLUS REPARER UNE ANCRE SUR UNE MISE EN PAGE QUI BOUGE.

Defaut mesure (sonde _v651/sonde_reparation.js). `_ancFit` repare une figure
sans ancre en lisant « le texte couvert par sa boite ». Or, dans une vraie
conversation, des fiches (`.theo-fig`) et des puces de sources
(`.theo-src-chips`) s'inserent APRES le rendu. La boite, elle, reste a ses
pixels : elle couvre donc un texte DIFFERENT selon que les fiches sont la ou
non. Et la reparation est PERSISTEE.

Mesure, meme conversation, meme figure, seule difference : le MOMENT ou la
fiche est inseree par rapport a la reparation.

    fiche inseree APRES la reparation : ancre end=199, position finale y=283
    fiche DEJA LA a la reparation     : ancre end=139, position finale y=0

144 px d'ecart, fige dans le store. A l'ouverture suivante, si les fiches sont
en cache, la reparation tombe sur l'autre texte : le cadre a change
d'emplacement. C'est exactement « ca change a chaque ouverture ».

Correctif : la reparation attend que la mise en page soit CALME — aucun
changement de hauteur de contenu depuis 700 ms. A ce moment-la, les fiches sont
chargees, en cache ou non, et la reparation est reproductible.

On ajoute aussi une passe a 1600 ms : sans elle, la derniere passe tombait a
900 ms, souvent AVANT le seuil de calme, et la figure n'aurait jamais ete
reparee. Une passe de plus ne coute presque rien depuis v649 (la proximite
n'est plus mesuree que sur changement de contenu).
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

# ───── A. le mesureur de calme, juste apres `_atcConteneurScroll` ─────
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
    "  /* \u2550\u2550\u2550 v651 \u2014 LA MISE EN PAGE EST-ELLE CALME ? \u2550\u2550\u2550\r\n"
    "     `_ancFit` repare une figure sans ancre en lisant le texte couvert par sa\r\n"
    "     boite. Si des fiches (`.theo-fig`) ou des puces de sources s'inserent\r\n"
    "     encore, la boite couvre un texte DIFFERENT \u2014 et la reparation est\r\n"
    "     persistee. Mesure (sonde _v651/sonde_reparation.js) : ancre end=199 et\r\n"
    "     position y=283 quand la fiche arrive apres la reparation, contre end=139\r\n"
    "     et y=0 quand elle est deja la. 144 px figes dans le store, et un cadre\r\n"
    "     qui change d'emplacement a chaque ouverture.\r\n"
    "     On attend donc 700 ms sans changement de hauteur de contenu : a ce\r\n"
    "     moment-la les fiches sont chargees, en cache ou non. */\r\n"
    "  var _atcCalmeH = -1, _atcCalmeT = 0, _atcCalmePasse = true;\r\n"
    "  function _atcMesurerCalme(){\r\n"
    "    try {\r\n"
    "      var sc = _atcConteneurScroll();\r\n"
    "      var h = sc ? sc.scrollHeight : 0;\r\n"
    "      var now = Date.now();\r\n"
    "      if (h !== _atcCalmeH) { _atcCalmeH = h; _atcCalmeT = now; }\r\n"
    "      return (now - _atcCalmeT) >= 700;\r\n"
    "    } catch (e) { return true; }\r\n"
    "  }\r\n"
)
s = once(s, AVANT_A, APRES_A, "A. mesureur de calme de mise en page")

# ───── B. la reparation attend le calme ─────
AVANT_B = (
    "      var _repare = false;\r\n"
    "      if (!f.ancre) {\r\n"
    "        if (!_ancFit(box, f, figEl)) return;\r\n"
    "        _repare = true;\r\n"
    "      }\r\n"
)
APRES_B = (
    "      var _repare = false;\r\n"
    "      if (!f.ancre) {\r\n"
    "        /* \U0001f534 v651 \u2014 NE PAS REPARER SUR UNE MISE EN PAGE QUI BOUGE.\r\n"
    "           Mesure : ancre end=199 / position y=283 si une fiche s'insere\r\n"
    "           apres la reparation, contre end=139 / y=0 si elle est deja la.\r\n"
    "           La reparation etant PERSISTEE, l'ecart se fige et le cadre change\r\n"
    "           d'emplacement a l'ouverture suivante. On attend donc le calme\r\n"
    "           (700 ms sans changement de hauteur) ; une passe ulterieure\r\n"
    "           reprendra la figure. */\r\n"
    "        if (!_atcCalmePasse) return;\r\n"
    "        if (!_ancFit(box, f, figEl)) return;\r\n"
    "        _repare = true;\r\n"
    "      }\r\n"
)
s = once(s, AVANT_B, APRES_B, "B. _ancFit garde par le calme de mise en page")

# ───── C. passe() : calculer le calme, et ajouter la passe a 1600 ms ─────
AVANT_C = (
    "      /* v649c \u2014 plus de cache par passe : l'invalidation de `_atcBoxNear`\r\n"
    "         se fait par la hauteur de contenu, ce qui est plus precis (une passe\r\n"
    "         apres une insertion re-mesure, une passe apres un simple scroll non). */\r\n"
    "      try { applyHighlights(); applyMarks(); applyShapes(); } catch (e) {}\r\n"
)
APRES_C = (
    "      /* v649c \u2014 plus de cache par passe : l'invalidation de `_atcBoxNear`\r\n"
    "         se fait par la hauteur de contenu, ce qui est plus precis (une passe\r\n"
    "         apres une insertion re-mesure, une passe apres un simple scroll non). */\r\n"
    "      /* v651 \u2014 le calme est evalue UNE fois par passe, pas une fois par figure. */\r\n"
    "      _atcCalmePasse = _atcMesurerCalme();\r\n"
    "      try { applyHighlights(); applyMarks(); applyShapes(); } catch (e) {}\r\n"
)
s = once(s, AVANT_C, APRES_C, "C1. passe() : evalue le calme une fois par passe")

AVANT_D = (
    "    if (uneSeule) return;\r\n"
    "    _atcSettleTO.push(setTimeout(passe, 120));\r\n"
    "    _atcSettleTO.push(setTimeout(passe, 400));\r\n"
    "    _atcSettleTO.push(setTimeout(passe, 900));\r\n"
)
APRES_D = (
    "    if (uneSeule) return;\r\n"
    "    _atcSettleTO.push(setTimeout(passe, 120));\r\n"
    "    _atcSettleTO.push(setTimeout(passe, 400));\r\n"
    "    _atcSettleTO.push(setTimeout(passe, 900));\r\n"
    "    /* v651 \u2014 passe tardive : sans elle, la derniere tombait a 900 ms, souvent\r\n"
    "       AVANT le seuil de calme de 700 ms apres la derniere insertion, et une\r\n"
    "       figure sans ancre n'aurait jamais ete reparee. Depuis v649 une passe\r\n"
    "       supplementaire ne coute presque rien (la proximite n'est mesuree que\r\n"
    "       sur changement de contenu). */\r\n"
    "    _atcSettleTO.push(setTimeout(passe, 1600));\r\n"
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

bak = CIBLE + ".v651.bak"
if not os.path.exists(bak):
    shutil.copy2(CIBLE, bak)
    print("[OK] sauvegarde : %s" % os.path.basename(bak))

with io.open(CIBLE, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("OK \u2014 v651 appliqu\u00e9. CRLF : %d, LF isol\u00e9s : %d" % (crlf, lf_iso))
