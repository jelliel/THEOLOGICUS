# -*- coding: utf-8 -*-
"""v633i — UN CADRE REPARE NE PEUT PAS ETRE PLUS PETIT QUE SON TEXTE.

Mesure (banc v633, assertion C) : l'ancre porte
    "Kyrios comme titre christologique"  ->  rect du texte : l = 309, w = 221
mais la figure d'origine mesurait w = 200 (semee ainsi dans le store).
Centree, elle occupe 319 -> 519, alors que le texte va de 309 a 530 : elle ne
peut pas le contenir. Un cadre plus etroit que les mots qu'il designe est
contradictoire — il ne « respecte » plus la phrase.

Regle : pour un cadre REPARE, `nw = max(ow, rr.w + 16)` et
`nh = max(oh, rr.h + 16)`. On GRANDIT si necessaire, on ne retrecit jamais
(la taille voulue par l'utilisateur reste un plancher).
"""
import io, os, sys

ICI = os.path.dirname(os.path.abspath(__file__))
ROOT = ICI
for _ in range(3):
    ROOT = os.path.dirname(ROOT)
CIBLE = os.path.join(ROOT, "THEOLOGICUS.html")

src = io.open(CIBLE, "r", encoding="utf-8", newline="").read()
crlf_avant = src.count("\r\n")
lf_isoles_avant = src.count("\n") - crlf_avant
s = src.replace("\r\n", "\n")
print("avant : CRLF %d / LF isoles %d / %d octets" % (crlf_avant, lf_isoles_avant, len(src)))
if lf_isoles_avant != 0:
    sys.exit("REFUS : LF isoles presents")

bak = os.path.join(ICI, "THEOLOGICUS_pre_v633i.bak")
io.open(bak, "w", encoding="utf-8", newline="").write(src)

def once(old, new, quoi):
    global s
    n = s.count(old)
    if n != 1:
        sys.exit("REFUS [%s] : %d occurrences (attendu 1)" % (quoi, n))
    s = s.replace(old, new)
    print("  OK  " + quoi)

once(
"""      if (f.ancre.cx && typeof f.ancre.ow === 'number' && typeof f.ancre.oh === 'number') {
        /* v633h — cadre REPARE : centre sur le texte de son ancre, taille gardee. */
        nw = Math.max(f.ancre.ow, 46); nh = Math.max(f.ancre.oh, 34);
        nx = rr.x + (rr.w - nw) / 2 + _dx;
        ny = rr.y + (rr.h - nh) / 2 + _dy;
      } else if""",
"""      if (f.ancre.cx && typeof f.ancre.ow === 'number' && typeof f.ancre.oh === 'number') {
        /* v633h — cadre REPARE : centre sur le texte de son ancre.
           v633i — mais jamais PLUS PETIT que ce texte : un cadre de 200 px
           autour d'une phrase de 221 px ne peut pas la contenir, il la
           « respecte » mal. On grandit, on ne retrecit jamais. */
        nw = Math.max(f.ancre.ow, rr.w + 16, 46);
        nh = Math.max(f.ancre.oh, rr.h + 16, 34);
        nx = rr.x + (rr.w - nw) / 2 + _dx;
        ny = rr.y + (rr.h - nh) / 2 + _dy;
      } else if""",
"v633i : un cadre repare ne retrecit jamais sous son texte")

out = s.replace("\n", "\r\n")
crlf = out.count("\r\n")
lf = out.count("\n") - crlf
if lf != 0:
    sys.exit("REFUS : LF isoles apres normalisation : %d" % lf)
io.open(CIBLE, "w", encoding="utf-8", newline="").write(out)
print("OK — v633i applique. CRLF %d/%d, taille %d" % (crlf, crlf, len(out)))
