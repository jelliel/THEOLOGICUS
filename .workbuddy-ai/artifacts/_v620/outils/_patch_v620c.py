# -*- coding: utf-8 -*-
"""v620c — test géométrique plus STRICT : le CENTRE du surlignage doit être
DANS le cadre.

L'intersection de rectangles avec 4 px de tolérance attrapait l'annotation
VOISINE (« beta » pour un cadre posé sur « gamma ») : faux positif mesuré par
le contrôle négatif du banc v619.
"""
import sys

P = "THEOLOGICUS.html"
with open(P, encoding="utf-8", newline="") as f:
    s = f.read().replace("\r\n", "\n")

ancien = """        const TOL = 4;
        anns.forEach(function(an){
          if (!an || !an.id || vus[an.id]) return;
          let spans;
          try { spans = document.querySelectorAll('.atc-hl[data-hl-id="' + an.id + '"]'); } catch (e) { return; }
          for (let i = 0; i < spans.length; i++) {
            const r = spans[i].getBoundingClientRect();
            if (!r.width || !r.height) continue;
            if (r.left < rf.right + TOL && r.right > rf.left - TOL &&
                r.top < rf.bottom + TOL && r.bottom > rf.top - TOL) { ajouter(an); break; }
          }
        });"""
if s.count(ancien) != 1:
    raise SystemExit("ancre : %d" % s.count(ancien))

nouveau = """        anns.forEach(function(an){
          if (!an || !an.id || vus[an.id]) return;
          let spans;
          try { spans = document.querySelectorAll('.atc-hl[data-hl-id="' + an.id + '"]'); } catch (e) { return; }
          for (let i = 0; i < spans.length; i++) {
            const r = spans[i].getBoundingClientRect();
            if (!r.width || !r.height) continue;
            /* Le CENTRE du surlignage doit tomber DANS le cadre. Une simple
               intersection prenait l'annotation VOISINE (banc v619 : « beta »
               pour un cadre sur « gamma »). */
            const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
            if (cx >= rf.left && cx <= rf.right && cy >= rf.top && cy <= rf.bottom) {
              ajouter(an); break;
            }
          }
        });"""
s = s.replace(ancien, nouveau)

with open(P, "w", encoding="utf-8", newline="") as f:
    f.write(s.replace("\n", "\r\n"))
print("OK — v620c appliqué")
