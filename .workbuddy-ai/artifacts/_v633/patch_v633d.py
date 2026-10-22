# -*- coding: utf-8 -*-
"""v633d — `f.x = 0` NE DOIT PAS DEVENIR 10.

Mesure (diag_v621.js) : `_ancRect` renvoie {x:0, y:4, w:317, h:17}, donc
`_ancPlace` calcule f.x = 0, f.y = 0 — mais le cadre est rendu a
`offsetLeft = 10, offsetTop = 10`.

Cause : `buildFigEl` ecrit `(f.x||10)`. En JS, **0 est falsy** : une figure
ancree sur le TOUT DEBUT d'un message (x = 0) ou sur la PREMIERE ligne (y = 0)
est rendue 10 px trop a droite et 10 px trop bas. Le cadre ne couvre alors pas
son texte (mesure : `dansCadre: false`), et le badge de commentaire, pose au
coin, se retrouve SUR les mots -> il mange le glisser de selection (c'est ce
que revelait le banc v621, section 3).

Correctif : tester le TYPE, pas la verite de la valeur.
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

bak = os.path.join(ICI, "THEOLOGICUS_pre_v633d.bak")
io.open(bak, "w", encoding="utf-8", newline="").write(src)

def once(old, new, quoi):
    global s
    n = s.count(old)
    if n != 1:
        sys.exit("REFUS [%s] : %d occurrences (attendu 1)" % (quoi, n))
    s = s.replace(old, new)
    print("  OK  " + quoi)

once(
"""    el.style.left = (f.x||10) + 'px'; el.style.top = (f.y||10) + 'px';
    el.style.width = (f.w||150) + 'px'; el.style.height = (f.h||90) + 'px';""",
"""    /* ═══ v633d — 0 EST UNE VALEUR, PAS UNE ABSENCE ═══
       `(f.x||10)` faisait rendre a 10 px toute figure ancree en x = 0 (debut de
       message) ou y = 0 (premiere ligne) : le cadre ne couvrait plus son texte.
       On teste le TYPE (Number fini) et on ne remplace que l'ABSENCE. */
    const _num = function(v, d){ return (typeof v === 'number' && isFinite(v)) ? v : d; };
    el.style.left = _num(f.x, 10) + 'px'; el.style.top = _num(f.y, 10) + 'px';
    el.style.width = _num(f.w, 150) + 'px'; el.style.height = _num(f.h, 90) + 'px';""",
"v633d : buildFigEl distingue 0 de l'absence")

# ── _ancPlace doit aussi CORRIGER un DOM deja rendu (sinon 0 vs 10 subsiste) ──
once(
"""      if (Math.abs(bx - f.x) <= 1 && Math.abs(by - f.y) <= 1 &&
          Math.abs(nw - f.w) <= 1 && Math.abs(nh - f.h) <= 1) return;
      f.x = bx; f.y = by;""",
"""      /* v633d — on compare aussi au DOM : si le style rendu diverge de la
         geometrie calculee (cas x = 0 rendu a 10 px par l'ancien `||10`), il
         faut reecrire le style, sinon l'ecart est fige pour toujours. */
      const _ol = parseFloat(figEl.style.left), _ot = parseFloat(figEl.style.top);
      const _dejaBon = (Math.abs(bx - f.x) <= 1 && Math.abs(by - f.y) <= 1 &&
                        Math.abs(nw - f.w) <= 1 && Math.abs(nh - f.h) <= 1 &&
                        Math.abs(_ol - bx) <= 1 && Math.abs(_ot - by) <= 1);
      if (_dejaBon) return;
      f.x = bx; f.y = by;""",
"v633d : _ancPlace corrige un DOM divergent")

out = s.replace("\n", "\r\n")
crlf = out.count("\r\n")
lf = out.count("\n") - crlf
if lf != 0:
    sys.exit("REFUS : LF isoles apres normalisation : %d" % lf)
io.open(CIBLE, "w", encoding="utf-8", newline="").write(out)
print("OK — v633d applique. CRLF %d/%d, taille %d" % (crlf, crlf, len(out)))
