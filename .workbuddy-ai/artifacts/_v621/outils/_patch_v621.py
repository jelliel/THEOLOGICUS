# -*- coding: utf-8 -*-
"""v621 — LE CADRE DEVIENT TRAVERSANT : on peut SÉLECTIONNER le texte dessous.

Le cadre était une surcouche qui captait la souris : impossible de sélectionner
un mot ou une phrase à l'intérieur pour y poser un surlignage ou un commentaire.

Correctif : `pointer-events:none` sur la boîte (le texte redevient sélectionnable)
+ des BORDS saisissables (déplacer) + une POIGNÉE, et `pointer-events:auto` sur
la croix, les poignées de redimension et le badge de commentaire.
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


# ────────────────────────────────────────────────────────────────
# 1. CSS
# ────────────────────────────────────────────────────────────────
CSS = r'''@media (pointer:coarse){.atc-figbox .fb-note{width:24px;height:24px;line-height:22px;font-size:12px;top:-12px;left:-12px}}
/* ═══ v621 — LE CADRE EST CREUX ═══
   Le texte qu'il entoure redevient SÉLECTIONNABLE (donc surlignable et
   commentable). Le cadre ne capte plus la souris que par ses BORDS, sa
   POIGNÉE et ses boutons — sans quoi il ne serait plus déplaçable. */
.atc-figbox{pointer-events:none}
.atc-figbox .fb-edge{
  position:absolute; pointer-events:auto; cursor:move; z-index:10;
}
.atc-figbox .fb-edge[data-bord="t"]{left:0;right:0;top:-4px;height:9px}
.atc-figbox .fb-edge[data-bord="b"]{left:0;right:0;bottom:-4px;height:9px}
.atc-figbox .fb-edge[data-bord="l"]{top:0;bottom:0;left:-4px;width:9px}
.atc-figbox .fb-edge[data-bord="r"]{top:0;bottom:0;right:-4px;width:9px}
.atc-figbox .fb-grip{
  position:absolute; left:50%; top:-10px; transform:translateX(-50%);
  width:26px; height:9px; border-radius:5px; pointer-events:auto; cursor:move;
  background:rgba(13,22,38,.9); border:1px solid var(--fc); z-index:12;
  opacity:0; transition:opacity .12s;
}
.atc-figbox:hover .fb-grip, .atc-figbox.sel .fb-grip{opacity:.9}
.atc-figbox .fb-x, .atc-figbox .h, .atc-figbox .fb-note{pointer-events:auto}
'''
anc_css = '@media (pointer:coarse){.atc-figbox .fb-note{width:24px;height:24px;line-height:22px;font-size:12px;top:-12px;left:-12px}}\n'
a = une_fois(anc_css)
s = s[:a] + CSS + s[a + len(anc_css):]

# ────────────────────────────────────────────────────────────────
# 2. buildFigEl — bords + poignée
# ────────────────────────────────────────────────────────────────
anc = """    ['nw','ne','sw','se'].forEach(function(dir){
      const h = document.createElement('span'); h.className = 'h'; h.dataset.dir = dir;
      el.appendChild(h);
    });
    return el;"""
a = une_fois(anc)
s = s[:a] + """    ['nw','ne','sw','se'].forEach(function(dir){
      const h = document.createElement('span'); h.className = 'h'; h.dataset.dir = dir;
      el.appendChild(h);
    });
    /* v621 — la boîte est TRAVERSANTE (pointer-events:none) pour laisser
       sélectionner le texte : on rend le cadre saisissable par ses BORDS et
       par une POIGNÉE, sinon il ne serait plus déplaçable. */
    ['t','b','l','r'].forEach(function(bord){
      const e = document.createElement('span');
      e.className = 'fb-edge'; e.dataset.bord = bord;
      e.title = 'Glisser pour déplacer le cadre';
      el.appendChild(e);
    });
    const grip = document.createElement('span');
    grip.className = 'fb-grip'; grip.title = 'Déplacer le cadre';
    el.appendChild(grip);
    return el;""" + s[a + len(anc):]

# ────────────────────────────────────────────────────────────────
# 3. Infobulle : le survol de la SURFACE ne peut plus arriver (traversant)
# ────────────────────────────────────────────────────────────────
FALLBACK = r'''  /* v621 — le cadre est traversant : son INTÉRIEUR ne reçoit plus la souris
     (c'est ce qui rend le texte sélectionnable). Le `mouseover` du cadre ne
     peut donc plus déclencher l'infobulle ; on la retrouve au `mousemove`,
     quand le pointeur est dans son rectangle et qu'aucune sélection ni
     glissement n'est en cours. */
  var _mvFigT = 0;
  cc && cc.addEventListener('mousemove', function(e){
    if (window.__THEO_TOUCH_UI && window.__THEO_TOUCH_UI()) return;
    const t = Date.now();
    if (t - _mvFigT < 140) return;
    _mvFigT = t;
    if (e.buttons) return;                       /* glissement ou sélection en cours */
    try { const sel = window.getSelection(); if (sel && !sel.isCollapsed) return; } catch (err) {}
    const deja = document.getElementById('atc-tip');
    let cible = null;
    const cadres = document.querySelectorAll('.atc-figbox');
    for (let i = 0; i < cadres.length; i++) {
      const r = cadres[i].getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        cible = cadres[i]; break;
      }
    }
    if (!cible) {
      if (deja && deja._forFig) closeAtcTip();
      return;
    }
    if (deja && deja._forFig === cible) return;
    const msgEl = cible.closest('.message');
    const ts = msgEl ? parseInt(msgEl.dataset.msgId, 10) : null;
    const msg = (state.messages || []).find(function(m){ return m.ts === ts; });
    const f = (msg && msg.shapes) ? msg.shapes.find(function(x){ return x.id === cible.dataset.figId; }) : null;
    if (!f) return;
    if (!showTipForFig(cible, f, msg) && deja && deja._forFig) closeAtcTip();
  }, { passive: true });

'''
a = une_fois("  cc && cc.addEventListener('mouseout', function(e){\n    const fb = e.target.closest ? e.target.closest('.atc-figbox') : null;")
s = s[:a] + FALLBACK + s[a:]

with open(P, "w", encoding="utf-8", newline="") as f:
    f.write(s.replace("\n", "\r\n"))
print("OK — v621 appliqué")
