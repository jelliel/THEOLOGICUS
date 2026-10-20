# -*- coding: utf-8 -*-
"""v620b — UNION des deux méthodes (offsets + géométrie).

Séparer les deux laissait un trou : si le cadre a une ancre PÉRIMÉE, la
recherche par offsets peut renvoyer une annotation qui n'est plus visuellement
dedans, et le repli géométrique n'était alors jamais tenté.
"""
import sys

P = "THEOLOGICUS.html"
with open(P, encoding="utf-8", newline="") as f:
    s = f.read().replace("\r\n", "\n")

debut = "  function annsDansCadre(msg, f, fb){"
fin = "\n  function showTipForFig(fb, f, msg){"
i = s.index(debut)
j = s.index(fin, i)

NOUVEAU = r'''  function annsDansCadre(msg, f, fb){
    if (!msg) return [];
    const anns = msg.annotations || [];
    const out = [], vus = {};
    const ajouter = function(an){ if (!an || !an.id || vus[an.id]) return; vus[an.id] = 1; out.push(an); };
    /* 1. par OFFSETS (précis) — seulement si le cadre a une ancre texte. */
    if (f && f.ancre) {
      const a0 = Number(f.ancre.start), a1 = Number(f.ancre.end);
      if (a1 > a0) {
        anns.forEach(function(an){
          const s0 = Number(an && an.start), e0 = Number(an && an.end);
          if (!(e0 > s0)) return;
          if (s0 < a1 && e0 > a0) ajouter(an);   /* chevauchement, pas égalité */
        });
      }
    }
    /* 2. par GÉOMÉTRIE — un cadre dessiné à la main (ou créé sans sélection)
       n'a AUCUNE ancre : sans ce repli, le survol ne montrait rien alors que
       le commentaire existait bel et bien (constaté sur vidéo). On AJOUTE
       (union) : une ancre périmée ne doit pas masquer un commentaire visible. */
    if (fb && fb.isConnected) {
      let rf = null;
      try { rf = fb.getBoundingClientRect(); } catch (e) {}
      if (rf && rf.width && rf.height) {
        const TOL = 4;
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
        });
      }
    }
    return out;
  }
'''

s = s[:i] + NOUVEAU + s[j:]

with open(P, "w", encoding="utf-8", newline="") as f:
    f.write(s.replace("\n", "\r\n"))
print("OK — v620b appliqué")
