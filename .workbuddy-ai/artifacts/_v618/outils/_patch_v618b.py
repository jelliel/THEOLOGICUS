# -*- coding: utf-8 -*-
"""v618b — persistFig ne doit pas retirer l'ancre sur un simple CLIC.

Mesuré : un `mousedown`+`mouseup` sans déplacement sur un encadré appelait
persistFig -> `delete f.ancre`. Le cadre cessait alors de suivre son texte au
re-rendu/redémarrage : le correctif v609 était annulé par un simple appui.
"""
import sys

P = "THEOLOGICUS.html"
with open(P, encoding="utf-8", newline="") as f:
    s = f.read().replace("\r\n", "\n")

ancien = """  function persistFig(f, fb){
    f.x = fb.offsetLeft; f.y = fb.offsetTop; f.w = fb.offsetWidth; f.h = fb.offsetHeight;
    /* v609 — déplacement/retaille MANUELS : l'ancre texte est retirée (la
       position manuelle prime sur le ré-ancrage automatique). */
    if (f.ancre) { delete f.ancre; }"""
if s.count(ancien) != 1:
    raise SystemExit("ancre persistFig : %d" % s.count(ancien))

nouveau = """  function persistFig(f, fb){
    const nx = fb.offsetLeft, ny = fb.offsetTop, nw = fb.offsetWidth, nh = fb.offsetHeight;
    /* v618 — un CLIC (down+up sans mouvement) appelle aussi persistFig : il ne
       doit PAS retirer l'ancre, sinon le cadre cesse de suivre son texte après
       un simple appui (le correctif v609 était annulé sans qu'on le voie). */
    const aBouge = (nx !== f.x || ny !== f.y || nw !== f.w || nh !== f.h);
    f.x = nx; f.y = ny; f.w = nw; f.h = nh;
    /* v609 — déplacement/retaille MANUELS : l'ancre texte est retirée (la
       position manuelle prime sur le ré-ancrage automatique). */
    if (aBouge && f.ancre) { delete f.ancre; }"""
s = s.replace(ancien, nouveau)

with open(P, "w", encoding="utf-8", newline="") as f:
    f.write(s.replace("\n", "\r\n"))
print("OK — persistFig corrigé")
