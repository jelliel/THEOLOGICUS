# -*- coding: utf-8 -*-
"""v621c — GARDER LE CADRE DANS LA ZONE VISIBLE.

`.message-content` a `overflow:hidden`. Un cadre posé à -8 px (marge autour
d'une sélection) sort de la zone : ses bords gauches/hauts sont rognés et donc
plus hit-testés -> impossible à déplacer (mesuré au banc v618). On BORNE la
position au contenu, à la création comme au ré-ancrage.
"""
import sys

P = "THEOLOGICUS.html"
with open(P, encoding="utf-8", newline="") as f:
    s = f.read().replace("\r\n", "\n")


def une_fois(ancre):
    n = s.count(ancre)
    if n != 1:
        raise SystemExit("ANCRE %r : %d occurrence(s)" % (ancre[:70], n))
    return s.index(ancre)


# 1. insertFigureAt : borner x/y
ancien = """    if (target.selRect) {
      x = target.selRect.left - br.left + box.scrollLeft - 8;
      y = target.selRect.top - br.top + box.scrollTop - 6;
      w = Math.max(target.selRect.width + 16, 90);
      h = Math.max(target.selRect.height + 16, 44);
    } else {"""
a = une_fois(ancien)
s = s[:a] + """    if (target.selRect) {
      x = target.selRect.left - br.left + box.scrollLeft - 8;
      y = target.selRect.top - br.top + box.scrollTop - 6;
      w = Math.max(target.selRect.width + 16, 90);
      h = Math.max(target.selRect.height + 16, 44);
      /* v621 — le cadre doit rester DANS le contenu : `.message-content` a
         overflow:hidden, et un bord rogné n'est plus saisissable. */
      x = Math.min(Math.max(0, x), Math.max(0, box.clientWidth - w));
      y = Math.min(Math.max(0, y), Math.max(0, box.clientHeight - h));
    } else {""" + s[a + len(ancien):]

# 2. applyShapes : borner le ré-ancrage
ancien2 = """                if (Math.abs(nx - f.x) > 1 || Math.abs(ny - f.y) > 1 ||
                    Math.abs(nw - f.w) > 1 || Math.abs(nh - f.h) > 1) {
                  f.x = Math.round(nx); f.y = Math.round(ny);
                  f.w = Math.round(nw); f.h = Math.round(nh);"""
a2 = une_fois(ancien2)
s = s[:a2] + """                /* v621 — même borne qu'à la création : le cadre reste dans
                   la zone visible, sinon ses bords sont rognés. */
                const bx = Math.min(Math.max(0, Math.round(nx)), Math.max(0, box.clientWidth - Math.round(nw)));
                const by = Math.min(Math.max(0, Math.round(ny)), Math.max(0, box.clientHeight - Math.round(nh)));
                if (Math.abs(bx - f.x) > 1 || Math.abs(by - f.y) > 1 ||
                    Math.abs(nw - f.w) > 1 || Math.abs(nh - f.h) > 1) {
                  f.x = bx; f.y = by;
                  f.w = Math.round(nw); f.h = Math.round(nh);""" + s[a2 + len(ancien2):]

with open(P, "w", encoding="utf-8", newline="") as f:
    f.write(s.replace("\n", "\r\n"))
print("OK — v621c appliqué")
