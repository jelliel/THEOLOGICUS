# -*- coding: utf-8 -*-
"""v632f — un encadre DEJA RENDU se re-ancre lui aussi.

Bogue mesure : `applyShapes` sort tot quand la boite existe deja dans le DOM
(`dejaLa`). Or le texte du message peut CHANGER sous le cadre sans re-rendu :
le module d'illustration insere une fiche Wikipedia (plusieurs centaines de
caracteres) et le passage etudie descend de 200 px — le cadre, lui, restait
accroche a ses anciens pixels jusqu'au prochain redemarrage. C'est le symptome
« ca bouge tout seul / ca revient de travers apres relance ».

On factorise donc le placement dans `_ancPlace(f, figEl, box)` et on l'applique
AUSSI aux encadres deja rendus, a chaque passe (l'observer de mutations et le
scroll declenchent deja `_atcScheduleApply`)."""
import io
P = r"C:\tmp\theoverify\THEOLOGICUS.html"
s = io.open(P, "r", encoding="utf-8", newline="").read()
assert s.count("\r\n") == s.count("\n")
s = s.replace("\r\n", "\n")

OLD = """        const dejaLa = box.querySelector('[data-fig-id="' + f.id + '"]');
        if (dejaLa) return;
        const figEl = buildFigEl(f);
        box.appendChild(figEl);"""

NEW = """        const dejaLa = box.querySelector('[data-fig-id="' + f.id + '"]');
        if (dejaLa) {
          /* v632f — le cadre est deja rendu : le contenu a pu CHANGER sous lui
             (fiche Wikipedia inseree, markdown re-rendu). On le replace. */
          _ancPlace(box, f, dejaLa);
          return;
        }
        const figEl = buildFigEl(f);
        box.appendChild(figEl);"""

assert s.count(OLD) == 1
s = s.replace(OLD, NEW, 1)

# Extraire le bloc de placement actuel pour en faire une fonction reutilisable.
OLD2 = """        if (f.ancre) {
          try {
            let sol = _ancResolve(box, f);
            if (!sol && typeof locateInBoxFiltre === 'function' &&
                typeof f.ancre.start === 'number' && typeof f.ancre.end === 'number') {
              /* repli : ancien encadre dont l'ancre n'a pas encore de texte,
                 ou texte introuvable -> on garde l'offset comme depart. */
              const rr0 = _ancRect(box, f.ancre.start, f.ancre.end);
              if (rr0) sol = { r: rr0, start: f.ancre.start, end: f.ancre.end };
            }
            _ancRepair(box, f, sol);
            if (sol && sol.r) {
              const rr = sol.r;
              /* v632 — decalage manuel meme si le texte a bouge. */
              const _dx = (f.ancre && typeof f.ancre.dx === 'number') ? f.ancre.dx : 0;
              const _dy = (f.ancre && typeof f.ancre.dy === 'number') ? f.ancre.dy : 0;
              const nx = rr.x - 8 + _dx, ny = rr.y - 6 + _dy;
              const nw = Math.max(rr.w + 16, 90);
              const nh = Math.max(rr.h + 16, 44);
              /* v621 — même borne qu'à la création : le cadre reste dans
                 la zone visible, sinon ses bords sont rognés. */
              const bx = Math.min(Math.max(0, Math.round(nx)), Math.max(0, box.clientWidth - Math.round(nw)));
              const by = Math.min(Math.max(0, Math.round(ny)), Math.max(0, box.clientHeight - Math.round(nh)));
              if (Math.abs(bx - f.x) > 1 || Math.abs(by - f.y) > 1 ||
                  Math.abs(nw - f.w) > 1 || Math.abs(nh - f.h) > 1) {
                f.x = bx; f.y = by;
                f.w = Math.round(nw); f.h = Math.round(nh);
                figEl.style.left = f.x + 'px'; figEl.style.top = f.y + 'px';
                figEl.style.width = f.w + 'px'; figEl.style.height = f.h + 'px';
                if (typeof markChatDirty === 'function') markChatDirty();
              }
            }
          } catch (e) {}
        }
      });
    });"""

NEW2 = """        _ancPlace(box, f, figEl);
      });
    });
    /* v628 — les cadres hors viewport n'ont pas ete traites : au scroll, la
       passe les reprend (listener plus bas -> _atcScheduleApply). */
  }
  /* ═══ v632f — PLACEMENT D'UN ENCADRE (creation ET re-rendu) ═══
     Une seule implementation : le cadre est pose exactement au meme endroit,
     qu'il vienne d'etre cree ou qu'il suive son texte. */
  function _ancPlace(box, f, figEl){
    if (!f || !f.ancre || !figEl || !box) return;
    try {
      let sol = _ancResolve(box, f);
      if (!sol && typeof locateInBoxFiltre === 'function' &&
          typeof f.ancre.start === 'number' && typeof f.ancre.end === 'number') {
        /* repli : ancien encadre dont l'ancre n'a pas encore de texte,
           ou texte introuvable -> on garde l'offset comme depart. */
        const rr0 = _ancRect(box, f.ancre.start, f.ancre.end);
        if (rr0) sol = { r: rr0, start: f.ancre.start, end: f.ancre.end };
      }
      _ancRepair(box, f, sol);
      if (!sol || !sol.r) return;
      const rr = sol.r;
      /* v632 — decalage manuel meme si le texte a bouge. */
      const _dx = (typeof f.ancre.dx === 'number') ? f.ancre.dx : 0;
      const _dy = (typeof f.ancre.dy === 'number') ? f.ancre.dy : 0;
      const nx = rr.x - 8 + _dx, ny = rr.y - 6 + _dy;
      const nw = Math.max(rr.w + 16, 90);
      const nh = Math.max(rr.h + 16, 44);
      /* v621 — même borne qu'à la création : le cadre reste dans la zone
         visible, sinon ses bords sont rognés. */
      const bx = Math.min(Math.max(0, Math.round(nx)), Math.max(0, box.clientWidth - Math.round(nw)));
      const by = Math.min(Math.max(0, Math.round(ny)), Math.max(0, box.clientHeight - Math.round(nh)));
      if (Math.abs(bx - f.x) <= 1 && Math.abs(by - f.y) <= 1 &&
          Math.abs(nw - f.w) <= 1 && Math.abs(nh - f.h) <= 1) return;
      f.x = bx; f.y = by;
      f.w = Math.round(nw); f.h = Math.round(nh);
      figEl.style.left = f.x + 'px'; figEl.style.top = f.y + 'px';
      figEl.style.width = f.w + 'px'; figEl.style.height = f.h + 'px';
      if (typeof markChatDirty === 'function') markChatDirty();
    } catch (e) {}
  }"""
# Le bloc NEW2 doit remplacer la FIN de applyShapes (les deux fermetures) mais
# les deux dernieres lignes sont aussi presentes ailleurs : on repere par la
# sequence exacte issue du bloc OLD2.
assert s.count(OLD2) == 1, "bloc placement non unique: %d" % s.count(OLD2)
s = s.replace(OLD2, NEW2, 1)

assert "\r" not in s
s = s.replace("\n", "\r\n")
io.open(P, "w", encoding="utf-8", newline="").write(s)
print("OK v632f re-ancrage continu")
