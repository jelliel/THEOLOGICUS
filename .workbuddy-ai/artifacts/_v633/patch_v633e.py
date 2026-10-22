# -*- coding: utf-8 -*-
"""v633e — `_ancUnderPoint` DOIT REELLEMENT RENDRE UNE ANCRE.

Mesure (v609 section 5) : `insertFigureAt({clientX, clientY})` sans `range`
produit `ancre: false`. La cause est dans la fonction elle-meme, dont la
logique est inversee :

    if (best) {
      var rr = document.caretRangeFromPoint(...);   // presque toujours NON nul
      if (!rr) { ... return une ancre ... }          // donc on ne rend JAMAIS
    }

Resultat : le repli « les mots sous le point de clic » ne renvoyait jamais rien,
donc une figure creee par simple clic restait sans ancre — exactement le cas de
319 des 320 figures du store mesure.

Correctif : on prend le point de CARET sous le curseur, on elargit au MOT qui
l'entoure dans le noeud texte, et on calcule son offset dans l'espace CANONIQUE
(noeudsTexteVisibles), le meme que celui utilise par la restitution.
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

bak = os.path.join(ICI, "THEOLOGICUS_pre_v633e.bak")
io.open(bak, "w", encoding="utf-8", newline="").write(src)

def once(old, new, quoi):
    global s
    n = s.count(old)
    if n != 1:
        sys.exit("REFUS [%s] : %d occurrences (attendu 1)" % (quoi, n))
    s = s.replace(old, new)
    print("  OK  " + quoi)

ANCIEN = """  function _ancUnderPoint(box, clientX, clientY){
    try {
      if (!box || typeof clientX !== 'number' || typeof clientY !== 'number') return null;
      var el = document.elementFromPoint(clientX, clientY);
      if (el && el.closest) el = el.closest('.message-content') || el;
      if (el && box.contains(el)) {
        var r = document.createRange();
        r.selectNodeContents(el);
        var rects = r.getClientRects(), best = null, bd = Infinity;
        for (var i = 0; i < rects.length; i++) {
          var q = rects[i];
          var d = Math.abs(q.top - clientY) + Math.abs(q.left - clientX);
          if (d < bd) { bd = d; best = q; }
        }
        if (best) {
          var rr = document.caretRangeFromPoint ? document.caretRangeFromPoint(clientX, clientY) : null;
          if (!rr) {
            var off = computeOffsetInBoxFiltre(box, r);
            if (off) return { start: off.start, end: off.end, texte: '' };
          }
        }
      }
    } catch (e) {}
    return null;
  }"""

NOUVEAU = """  function _ancUnderPoint(box, clientX, clientY){
    try {
      if (!box || typeof clientX !== 'number' || typeof clientY !== 'number') return null;
      /* 1. le point de CARET sous le curseur (API standard, et repli WebKit). */
      var cr = null;
      if (document.caretRangeFromPoint) cr = document.caretRangeFromPoint(clientX, clientY);
      else if (document.caretPositionFromPoint) {
        var cp = document.caretPositionFromPoint(clientX, clientY);
        if (cp && cp.offsetNode) {
          cr = document.createRange();
          cr.setStart(cp.offsetNode, cp.offset);
          cr.collapse(true);
        }
      }
      if (!cr || !cr.startContainer) return null;
      var node = cr.startContainer;
      if (node.nodeType !== 3) return null;              /* pas un noeud texte */
      if (!box.contains(node)) return null;
      /* 2. on rejette les zones exclues de l'espace canonique. */
      if (node.parentElement && node.parentElement.closest(
            '.atc-figbox, .theo-fig, .theo-src-chips, [data-no-anchor]')) return null;
      var val = node.nodeValue || '';
      if (!val.trim()) return null;
      /* 3. on elargit au MOT qui entoure le caret (bornes non blanches). */
      var i = Math.max(0, Math.min(cr.startOffset, val.length));
      var a = i, b = i;
      while (a > 0 && /[^\\s]/.test(val.charAt(a - 1))) a--;
      while (b < val.length && /[^\\s]/.test(val.charAt(b))) b++;
      if (b <= a) {                                       /* caret sur un blanc */
        if (!val.trim()) return null;
        a = val.search(/\\S/); b = a + 1;
        while (b < val.length && /[^\\s]/.test(val.charAt(b))) b++;
      }
      var mot = val.slice(a, b);
      if (!mot) return null;
      /* 4. offset dans l'espace CANONIQUE (le meme que la restitution). */
      var off = computeOffsetInBoxFiltre(box, (function(){
        var r = document.createRange();
        r.setStart(node, a); r.setEnd(node, b);
        return r;
      })());
      if (!off || !(off.end > off.start)) return null;
      return { start: off.start, end: off.end, texte: mot.slice(0, 200) };
    } catch (e) {}
    return null;
  }"""

once(ANCIEN, NOUVEAU, "v633e : _ancUnderPoint rend une ancre reelle (mot sous le caret)")

out = s.replace("\n", "\r\n")
crlf = out.count("\r\n")
lf = out.count("\n") - crlf
if lf != 0:
    sys.exit("REFUS : LF isoles apres normalisation : %d" % lf)
io.open(CIBLE, "w", encoding="utf-8", newline="").write(out)
print("OK — v633e applique. CRLF %d/%d, taille %d" % (crlf, crlf, len(out)))
