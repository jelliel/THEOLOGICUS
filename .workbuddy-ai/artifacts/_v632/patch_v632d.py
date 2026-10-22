# -*- coding: utf-8 -*-
"""v632d — la GEOMETRIE DE CREATION d'un encadre ancre decoule du RECT DU MOT,
pas de `selectedRange.getBoundingClientRect()`.

Bogue mesure : creer un encadre sur « Seigneur des » donnait w=104,375 px alors
que le re-ancrage calculait w=100 px pour le MEME passage. Cause : le rect de la
plage de selection est arrondi par le moteur (chaque ligne etiree au pixel), et
surtout la plage traverse ici une <strong> : sa bounding box peut inclure un
peu de boite. A la creation on prend desormais EXACTEMENT le meme calcul que le
re-ancrage (`_ancRect`), donc l'encadre ne « bouge » plus d'un rendu a l'autre :
il est pose sur le mot et y reste."""
import io
P = r"C:\tmp\theoverify\THEOLOGICUS.html"
s = io.open(P, "r", encoding="utf-8", newline="").read()
assert s.count("\r\n") == s.count("\n")
s = s.replace("\r\n", "\n")

OLD = """      x = target.selRect.left - br.left + box.scrollLeft - 8;
      y = target.selRect.top - br.top + box.scrollTop - 6;
      w = Math.max(target.selRect.width + 16, 90);
      h = Math.max(target.selRect.height + 16, 44);"""

NEW = """      x = target.selRect.left - br.left + box.scrollLeft - 8;
      y = target.selRect.top - br.top + box.scrollTop - 6;
      w = Math.max(target.selRect.width + 16, 90);
      h = Math.max(target.selRect.height + 16, 44);
      /* v632d — la geometrie est ALIGNEE sur le re-ancrage (meme calcul, meme
         rect) : sinon le cadre perd 4 px de large au premier rendu et « saute »
         visibly. On ne le fait que si l'ancre texte a pu etre calculee. */
      if (target.range) {
        try {
          var _off0 = computeOffsetInBoxFiltre(box, target.range);
          if (_off0 && _off0.end > _off0.start) {
            var _r0 = _ancRect(box, _off0.start, _off0.end);
            if (_r0) {
              x = _r0.x - 8; y = _r0.y - 6;
              w = Math.max(_r0.w + 16, 90);
              h = Math.max(_r0.h + 16, 44);
            }
          }
        } catch (e) {}
      }"""

assert s.count(OLD) == 1
s = s.replace(OLD, NEW, 1)
assert "\r" not in s
s = s.replace("\n", "\r\n")
io.open(P, "w", encoding="utf-8", newline="").write(s)
print("OK v632d geometrie de creation alignee")
