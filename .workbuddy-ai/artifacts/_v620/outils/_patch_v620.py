# -*- coding: utf-8 -*-
"""v620 — le survol d'un cadre trouve aussi les commentaires par GÉOMÉTRIE.

Constat vidéo : un cadre dessiné à la main (ou créé sans sélection) n'a PAS
d'ancre texte -> la recherche par offsets ne trouvait rien et rien ne
s'affichait, alors que le commentaire existait bien (il s'affiche hors cadre).

Repli : intersection des RECTANGLES à l'écran entre le cadre et les spans
`.atc-hl` du message.
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


ancien = """  function annsDansCadre(msg, f){
    if (!msg || !f || !f.ancre) return [];
    const a0 = Number(f.ancre.start), a1 = Number(f.ancre.end);
    if (!(a1 > a0)) return [];
    return (msg.annotations || []).filter(function(an){
      if (!an) return false;
      const s0 = Number(an.start), e0 = Number(an.end);
      if (!(e0 > s0)) return false;
      return s0 < a1 && e0 > a0;      /* chevauchement, pas égalité stricte */
    });
  }"""

if s.count(ancien) != 1:
    raise SystemExit("ancre annsDansCadre : %d" % s.count(ancien))

nouveau = """  function annsDansCadre(msg, f, fb){
    if (!msg) return [];
    const anns = msg.annotations || [];
    /* 1. par OFFSETS (précis) — seulement si le cadre a une ancre texte. */
    if (f && f.ancre) {
      const a0 = Number(f.ancre.start), a1 = Number(f.ancre.end);
      if (a1 > a0) {
        const parOff = anns.filter(function(an){
          if (!an) return false;
          const s0 = Number(an.start), e0 = Number(an.end);
          if (!(e0 > s0)) return false;
          return s0 < a1 && e0 > a0;   /* chevauchement, pas égalité stricte */
        });
        if (parOff.length) return parOff;
      }
    }
    /* 2. par GÉOMÉTRIE — un cadre dessiné à la main (ou créé sans sélection)
       n'a AUCUNE ancre : sans ce repli, le survol ne montrait rien alors que
       le commentaire existait bel et bien (constaté sur vidéo). */
    if (!fb || !fb.isConnected) return [];
    let rf;
    try { rf = fb.getBoundingClientRect(); } catch (e) { return []; }
    if (!rf || !rf.width || !rf.height) return [];
    const TOL = 4;
    const vus = {};
    const out = [];
    anns.forEach(function(an){
      if (!an || !an.id || vus[an.id]) return;
      let spans;
      try { spans = document.querySelectorAll('.atc-hl[data-hl-id="' + an.id + '"]'); } catch (e) { return; }
      for (let i = 0; i < spans.length; i++) {
        const r = spans[i].getBoundingClientRect();
        if (!r.width || !r.height) continue;
        if (r.left < rf.right + TOL && r.right > rf.left - TOL &&
            r.top < rf.bottom + TOL && r.bottom > rf.top - TOL) {
          vus[an.id] = 1; out.push(an); break;
        }
      }
    });
    return out;
  }"""

s = s.replace(ancien, nouveau)

# appel : passer fb
anc2 = "    const anns = annsDansCadre(msg, f);"
if s.count(anc2) != 1:
    raise SystemExit("appel annsDansCadre : %d" % s.count(anc2))
s = s.replace(anc2, "    const anns = annsDansCadre(msg, f, fb);")

with open(P, "w", encoding="utf-8", newline="") as f:
    f.write(s.replace("\n", "\r\n"))
print("OK — v620 appliqué")
