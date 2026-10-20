# -*- coding: utf-8 -*-
"""v619b — une infobulle orpheline (cadre retiré/re-rendu) doit disparaître,
et survoler un cadre SANS annotation ne doit pas laisser celle du précédent."""
import sys

P = "THEOLOGICUS.html"
with open(P, encoding="utf-8", newline="") as f:
    s = f.read().replace("\r\n", "\n")

ancien = """    const deja = document.getElementById('atc-tip');
    if (deja && deja._forFig === fb) return;
    const msgEl = fb.closest('.message');"""
if s.count(ancien) != 1:
    raise SystemExit("ancre 1 : %d" % s.count(ancien))
s = s.replace(ancien, """    const deja = document.getElementById('atc-tip');
    if (deja && deja._forFig === fb) return;
    /* le cadre porteur a été retiré (re-rendu, suppression) : son infobulle
       n'a plus de mouseout pour la fermer, elle resterait affichée. */
    if (deja && deja._forFig && deja._forFig.isConnected === false) closeAtcTip();
    const msgEl = fb.closest('.message');""")

ancien2 = """    if (!f) return;
    showTipForFig(fb, f, msg);
  });"""
if s.count(ancien2) != 1:
    raise SystemExit("ancre 2 : %d" % s.count(ancien2))
s = s.replace(ancien2, """    if (!f) return;
    /* cadre sans annotation ni note : on n'hérite pas de l'infobulle du cadre
       précédent (elle restait affichée pendant le survol du suivant). */
    if (!showTipForFig(fb, f, msg)) closeAtcTip();
  });""")

with open(P, "w", encoding="utf-8", newline="") as f:
    f.write(s.replace("\n", "\r\n"))
print("OK — v619b appliqué")
