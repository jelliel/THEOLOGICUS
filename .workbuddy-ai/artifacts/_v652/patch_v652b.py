# -*- coding: utf-8 -*-
"""v652b — UN GESTE INVALIDE LE MARQUEUR DE PLACEMENT.

v652 a fait sauter `_ancPlace` pour une figure deja placee tant que la
generation de mise en page n'a pas change. Gain mesure : scroll 129 -> 50-96
reflows, et plus aucune figure deplacee d'une ouverture a l'autre.

MAIS la regression v632 (banc `verify_ancrage_encadres`, 10/12 au lieu de 12/12)
montre le cote pervers : apres un GLISSEMENT, la figure n'etait plus replacée du
tout. Or c'est `_ancPlace` qui recalcule `bx = rr.x + ox` ET qui persiste la
geometrie corrigee. Consequence mesuree : le cadre reste a sa nouvelle place
(x=628) pendant la session, mais le store garde l'ancienne (x=558) — au
rechargement il revient en arriere.

Correctif : `persistFig` (appele au mouseup d'un geste) INVALIDE le marqueur.
La passe suivante replace donc la figure une seule fois — ce qui restaure la
persistance — puis le marqueur est repose et le defilement redevient gratuit.

Verifie sur build pre-v652 : 12/12. Avec v652 : 10/12. Attendu apres v652b : 12/12.
"""
import io, os, shutil, sys

_ici = os.path.dirname(os.path.abspath(__file__))
CIBLE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(_ici))),
                     "THEOLOGICUS.html")

with io.open(CIBLE, "r", encoding="utf-8", newline="") as f:
    s = f.read()

AVANT = (
    "    f.x = nx; f.y = ny; f.w = nw; f.h = nh;\r\n"
)
APRES = (
    "    f.x = nx; f.y = ny; f.w = nw; f.h = nh;\r\n"
    "    /* \U0001f534 v652b \u2014 UN GESTE INVALIDE LE MARQUEUR DE PLACEMENT.\r\n"
    "       v652 saute `_ancPlace` pour une figure deja placee (c'est ce qui rend\r\n"
    "       le defilement gratuit). Mais c'est `_ancPlace` qui recalcule\r\n"
    "       `bx = rr.x + ox` ET qui persiste la geometrie corrigee : sans lui, le\r\n"
    "       cadre restait a sa nouvelle place pendant la session (x=628) tandis\r\n"
    "       que le store gardait l'ancienne (x=558) \u2014 au rechargement il\r\n"
    "       revenait en arriere. Mesure : banc v632 10/12 au lieu de 12/12.\r\n"
    "       On invalide donc le marqueur ici : la passe suivante replace la\r\n"
    "       figure UNE fois (persistance restauree), puis le defilement redevient\r\n"
    "       gratuit. */\r\n"
    "    fb.__atcGen = -1;\r\n"
)

n = s.count(AVANT)
if n != 1:
    print("[ECHEC] ancre : %d occurrence(s) (attendu 1)." % n)
    sys.exit(1)
s = s.replace(AVANT, APRES, 1)
print("[OK] persistFig invalide le marqueur de placement")

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

bak = CIBLE + ".v652b.bak"
if not os.path.exists(bak):
    shutil.copy2(CIBLE, bak)
    print("[OK] sauvegarde : %s" % os.path.basename(bak))

with io.open(CIBLE, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("OK \u2014 v652b appliqu\u00e9. CRLF : %d, LF isol\u00e9s : %d" % (crlf, lf_iso))
