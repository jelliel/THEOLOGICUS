# -*- coding: utf-8 -*-
"""v622 — un seul commentaire à la fois : celui qu'on survole.

Demande : « dans les encadrés, s'il y a plusieurs commentaires, je veux que ça
affiche seulement celui qui survole à la souris ».

Avant : le survol d'un CADRE listait TOUS les commentaires qu'il recouvre.
Maintenant : chaque surlignage porte SA fiche (survol direct, v619) ; le survol
du cadre ne montre plus que SA note propre — jamais la liste des autres.
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


# 1. supprimer annsDansCadre (devenu inutile)
debut = "  function annsDansCadre(msg, f, fb){"
fin = "\n  function showTipForFig(fb, f, msg){"
i = s.index(debut)
j = s.index(fin, i)
s = s[:i] + s[j + 1:]

# 2. showTipForFig : la NOTE du cadre uniquement
ancien = """  function showTipForFig(fb, f, msg){
    const anns = annsDansCadre(msg, f, fb);
    const note = (f && f.note) ? String(f.note) : '';
    if (!anns.length && !note) return false;
    closeAtcTip();
    const tip = document.createElement('div');
    tip.id = 'atc-tip';
    tip._forFig = fb;
    let html = '';
    if (anns.length === 1 && !note) {
      /* un seul commentaire : la fiche complète, boutons compris */
      html = buildTipHTML(anns[0]);
    } else {
      const n = anns.length + (note ? 1 : 0);
      html = '<div class="atc-tip-tag">💬 ' + n + ' annotation' + (n > 1 ? 's' : '') +
             ' dans cet encadré</div>';
      anns.forEach(function(an){
        const corps = an.loading ? '⏳ Le modèle rédige le commentaire…'
                    : (an.error ? '✗ ' + esc(an.error)
                    : esc(an.a || an.note || '(vide)'));
        html += '<div style="border-top:1px solid rgba(79,195,247,.18);padding-top:8px;margin-top:8px">'
              + '<div class="atc-tip-q">« ' + esc(an.text) + ' »</div>'
              + '<div class="atc-tip-a">' + corps + '</div></div>';
      });
      if (note) {
        html += '<div style="border-top:1px solid rgba(255,213,79,.28);padding-top:8px;margin-top:8px">'
              + '<div class="atc-tip-tag">💬 Note de l\\'encadré</div>'
              + '<div class="atc-tip-a">' + esc(note) + '</div></div>';
      }
    }
    tip.innerHTML = html;
    tip.addEventListener('mouseenter', function(){ clearTimeout(tip._hideT); });
    tip.addEventListener('mouseleave', function(){ closeAtcTip(); });
    document.body.appendChild(tip);
    positionTip(tip, fb.getBoundingClientRect());
    if (anns.length === 1 && !note) wireTipActions(tip, anns[0], anns[0].id);
    return true;
  }"""
if s.count(ancien) != 1:
    raise SystemExit("ancre showTipForFig : %d" % s.count(ancien))

nouveau = """  /* v622 — le survol d'un CADRE n'affiche QUE sa note propre. Les commentaires
     des passages qu'il recouvre ont chacun LEUR fiche, déclenchée par le
     survol du surlignage lui-même (le cadre est traversant depuis v621).
     Lister tous les commentaires du cadre était illisible dès qu'il y en avait
     plusieurs — et le mauvais commentaire pouvait être lu à la place du bon. */
  function showTipForFig(fb, f){
    const note = (f && f.note) ? String(f.note) : '';
    if (!note) return false;
    closeAtcTip();
    const tip = document.createElement('div');
    tip.id = 'atc-tip';
    tip._forFig = fb;
    tip.innerHTML = '<div class="atc-tip-tag">💬 Note de l\\'encadré</div>'
                  + '<div class="atc-tip-a">' + esc(note) + '</div>';
    tip.addEventListener('mouseenter', function(){ clearTimeout(tip._hideT); });
    tip.addEventListener('mouseleave', function(){ closeAtcTip(); });
    document.body.appendChild(tip);
    positionTip(tip, fb.getBoundingClientRect());
    return true;
  }"""
s = s.replace(ancien, nouveau)

# 3. mousemove : laisser la main au surlignage survolé
anc = """    try { const sel = window.getSelection(); if (sel && !sel.isCollapsed) return; } catch (err) {}
    /* Le cadre sous le pointeur, calculé AVANT le throttle"""
a = une_fois(anc)
s = s[:a] + """    try { const sel = window.getSelection(); if (sel && !sel.isCollapsed) return; } catch (err) {}
    /* v622 — le pointeur est SUR un commentaire : c'est SA fiche qui doit
       s'afficher (survol du surlignage, v619), jamais celle du cadre. */
    if (e.target && e.target.closest && e.target.closest('.atc-hl')) {
      const t0 = document.getElementById('atc-tip');
      if (t0 && t0._forFig) closeAtcTip();
      _mvFigCible = null;
      return;
    }
    /* Le cadre sous le pointeur, calculé AVANT le throttle""" + s[a + len(anc):]

# 4. appel : showTipForFig(cible, f)
anc2 = "    if (!showTipForFig(cible, f, msg) && deja && deja._forFig) closeAtcTip();"
a2 = une_fois(anc2)
s = s[:a2] + "    if (!showTipForFig(cible, f) && deja && deja._forFig) closeAtcTip();" + s[a2 + len(anc2):]

# 5. le mouseover du cadre (cc) appelait aussi showTipForFig avec 3 args
s = s.replace("    showTipForFig(fb, f, msg);", "    showTipForFig(fb, f);")

with open(P, "w", encoding="utf-8", newline="") as f:
    f.write(s.replace("\n", "\r\n"))
print("OK — v622 appliqué")
