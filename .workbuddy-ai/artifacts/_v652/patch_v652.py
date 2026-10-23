# -*- coding: utf-8 -*-
"""v652 — LE DEFILEMENT NE RECALCULE PLUS RIEN.

Objectif : « je veux que le scroll des conversations devienne tres leger et
fluide ».

CONSTAT. `applyShapes` appelle `_ancPlace` pour CHAQUE figure visible, a
CHAQUE passe. `_ancPlace` fait un walk complet du texte du message
(`_ancResolve`) et plusieurs `Range.getBoundingClientRect`. Sur la conversation
reelle « Kyrios » (15 messages de 11 000 a 14 000 caracteres, 107 figures), une
passe de defilement recalcule donc la geometrie de dizaines de figures.

Or DEFILER NE CHANGE NI L'ANCRE NI LA POSITION D'UNE FIGURE : elle est
positionnee dans le message et defile avec lui. Rien a recalculer.

CORRECTIF. Une figure deja placee porte la generation de mise en page
(`__atcGen`). On la saute tant que cette generation n'a pas change — et elle
change des que la hauteur de contenu bouge (`_atcNearGen`, deja maintenu par
`_atcBoxNear`). Une redimension de fenetre la fait changer aussi.

Ce qui continue de fonctionner : une figure JAMAIS placee est traitee quand
elle entre dans le viewport ; une figure dont le contenu a bouge (fiche
Wikipedia, markdown re-rendu) est replacee, parce que la hauteur a change.
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

# ───── A. sauter une figure deja placee ─────
AVANT_A = (
    "        const dejaLa = box.querySelector('[data-fig-id=\"' + f.id + '\"]');\r\n"
    "        if (dejaLa) {\r\n"
    "          /* v632f \u2014 le cadre est deja rendu : le contenu a pu CHANGER sous lui\r\n"
    "             (fiche Wikipedia inseree, markdown re-rendu). On le replace. */\r\n"
    "          _ancPlace(box, f, dejaLa);\r\n"
    "          return;\r\n"
    "        }\r\n"
)
APRES_A = (
    "        const dejaLa = box.querySelector('[data-fig-id=\"' + f.id + '\"]');\r\n"
    "        if (dejaLa) {\r\n"
    "          /* v632f \u2014 le cadre est deja rendu : le contenu a pu CHANGER sous lui\r\n"
    "             (fiche Wikipedia inseree, markdown re-rendu). On le replace.\r\n"
    "             \U0001f534 v652 \u2014 MAIS PAS S'IL N'A PAS CHANGE.\r\n"
    "             `_ancPlace` fait un walk complet du texte du message et plusieurs\r\n"
    "             `Range.getBoundingClientRect`. Sur la conversation reelle\r\n"
    "             « Kyrios » (15 messages de 11 000 a 14 000 caracteres, 107\r\n"
    "             figures), une passe de defilement recalculait donc la geometrie\r\n"
    "             de dizaines de figures \u2014 alors que DEFILER NE CHANGE NI L'ANCRE\r\n"
    "             NI LA POSITION d'une figure : elle est positionnee dans le\r\n"
    "             message et defile avec lui.\r\n"
    "             On saute donc la figure tant que la generation de mise en page\r\n"
    "             n'a pas bouge. `_atcNearGen` change des que la hauteur de\r\n"
    "             contenu change (fiche inseree, markdown re-rendu) et sur une\r\n"
    "             redimension de fenetre : ces cas-la replacent bien. */\r\n"
    "          if (dejaLa.__atcGen === _atcNearGen) return;\r\n"
    "          _ancPlace(box, f, dejaLa);\r\n"
    "          return;\r\n"
    "        }\r\n"
)
s = once(s, AVANT_A, APRES_A, "A. applyShapes : saute une figure deja placee")

# ───── B. marquer la figure apres un placement reussi ─────
AVANT_B = (
    "      if (_dejaBon) return;\r\n"
    "      /* \u2550\u2550\u2550 v633g \u2014 RECALER L'ANCRE SUR LE TEXTE REELLEMENT COUVERT \u2550\u2550\u2550\r\n"
)
APRES_B = (
    "      /* v652 \u2014 la figure est placee et conforme : on note la generation de\r\n"
    "         mise en page. Une passe suivante, sur le meme contenu, ne la\r\n"
    "         recalculera plus (c'est tout le gain au defilement). */\r\n"
    "      figEl.__atcGen = _atcNearGen;\r\n"
    "      if (_dejaBon) return;\r\n"
    "      /* \u2550\u2550\u2550 v633g \u2014 RECALER L'ANCRE SUR LE TEXTE REELLEMENT COUVERT \u2550\u2550\u2550\r\n"
)
s = once(s, AVANT_B, APRES_B, "B. _ancPlace : marque la generation apres placement")

AVANT_C = (
    "      if (_repare && typeof atcPersist === 'function') {\r\n"
    "        try { atcPersist(); } catch (e) {}\r\n"
    "      }\r\n"
    "    } catch (e) {}\r\n"
    "  }\r\n"
)
APRES_C = (
    "      if (_repare && typeof atcPersist === 'function') {\r\n"
    "        try { atcPersist(); } catch (e) {}\r\n"
    "      }\r\n"
    "      /* v652 \u2014 placement mene a son terme (recalage v633g compris). */\r\n"
    "      figEl.__atcGen = _atcNearGen;\r\n"
    "    } catch (e) {}\r\n"
    "  }\r\n"
)
s = once(s, AVANT_C, APRES_C, "C. _ancPlace : marque aussi en fin de placement")

# ───── D. une redimension de fenetre invalide les marqueurs ─────
AVANT_D = (
    "  document.addEventListener('scroll', function(){\r\n"
    "    if (window.__atcStreaming || window.__atcApplying || window.__atcFigEditing) return;\r\n"
    "    if (_atcScT) return;\r\n"
)
APRES_D = (
    "  /* v652 \u2014 une redimension de fenetre refluidifie le texte : la geometrie\r\n"
    "     memorisee n'est plus valable. On invalide les marqueurs de placement.\r\n"
    "     (La hauteur de contenu change souvent, mais pas toujours : une fenetre\r\n"
    "     plus large peut garder la meme hauteur totale.) */\r\n"
    "  window.addEventListener('resize', function(){ _atcNearGen++; }, { passive: true });\r\n"
    "  document.addEventListener('scroll', function(){\r\n"
    "    if (window.__atcStreaming || window.__atcApplying || window.__atcFigEditing) return;\r\n"
    "    if (_atcScT) return;\r\n"
)
s = once(s, AVANT_D, APRES_D, "D. resize : invalide les marqueurs")

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

bak = CIBLE + ".v652.bak"
if not os.path.exists(bak):
    shutil.copy2(CIBLE, bak)
    print("[OK] sauvegarde : %s" % os.path.basename(bak))

with io.open(CIBLE, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("OK \u2014 v652 appliqu\u00e9. CRLF : %d, LF isol\u00e9s : %d" % (crlf, lf_iso))
