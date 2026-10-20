# -*- coding: utf-8 -*-
"""v619 — VOIR LES COMMENTAIRES D'UN ENCADRÉ AU SURVOL.

Cause mesurée : le cadre est une surcouche (z-index:6) posée sur le texte.
Le survol atteint le CADRE, jamais le surlignage `.atc-hl` situé dessous :
`e.target.closest('.atc-hl')` est donc toujours null et l'infobulle ne
s'affichait jamais pour un commentaire enfermé dans un encadré.

Correctif : au survol d'un cadre, on lit les annotations du message dont les
OFFSETS chevauchent l'ancre du cadre et on affiche la même infobulle.
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
# 1. Extraire le câblage des boutons de l'infobulle (réutilisable)
# ────────────────────────────────────────────────────────────────
ancien = """    positionTip(tip, hlEl.getBoundingClientRect());
    const cp = tip.querySelector('.atc-tip-copy');
    if (cp) cp.addEventListener('click', function(e){
      e.stopPropagation();
      navigator.clipboard.writeText(String(a.a || ''));
      closeAtcTip();
    });
    const del = tip.querySelector('.atc-tip-del');
    if (del) del.addEventListener('click', function(e){
      e.stopPropagation();
      removeAnnotation(hlEl.dataset.hlId);
    });
    const rty = tip.querySelector('.atc-tip-retry');
    if (rty) rty.addEventListener('click', async function(e){
      e.stopPropagation();
      rty.disabled = true; rty.textContent = '↻…';
      await retryComment(hlEl.dataset.hlId);
    });
  }
"""
a = une_fois(ancien)
s = s[:a] + """    positionTip(tip, hlEl.getBoundingClientRect());
    wireTipActions(tip, a, hlEl.dataset.hlId);
  }
  /* v619 — câblage sorti de showTipFor pour servir AUSSI l'infobulle d'un
     encadré (les boutons Copier / Supprimer / Réessayer). */
  function wireTipActions(tip, a, hlId){
    const id = hlId || (a && a.id);
    const cp = tip.querySelector('.atc-tip-copy');
    if (cp) cp.addEventListener('click', function(e){
      e.stopPropagation();
      try { navigator.clipboard.writeText(String(a.a || '')); } catch (err) {}
      closeAtcTip();
    });
    const del = tip.querySelector('.atc-tip-del');
    if (del) del.addEventListener('click', function(e){
      e.stopPropagation();
      removeAnnotation(id);
    });
    const rty = tip.querySelector('.atc-tip-retry');
    if (rty) rty.addEventListener('click', async function(e){
      e.stopPropagation();
      rty.disabled = true; rty.textContent = '↻…';
      await retryComment(id);
    });
  }
""" + s[a + len(ancien):]

# ────────────────────────────────────────────────────────────────
# 2. Survol d'un encadré -> infobulle des annotations qu'il recouvre
# ────────────────────────────────────────────────────────────────
FONCTIONS = r'''  /* ═══ v619 — LES COMMENTAIRES D'UN ENCADRÉ AU SURVOL ═══
     Le cadre recouvre le texte : le survol ne touche jamais le surlignage
     `.atc-hl` placé dessous, donc son commentaire restait invisible. On
     retrouve les annotations par CHEVAUCHEMENT D'OFFSETS avec l'ancre du
     cadre — la même référence que le ré-ancrage v609. */
  function annsDansCadre(msg, f){
    if (!msg || !f || !f.ancre) return [];
    const a0 = Number(f.ancre.start), a1 = Number(f.ancre.end);
    if (!(a1 > a0)) return [];
    return (msg.annotations || []).filter(function(an){
      if (!an) return false;
      const s0 = Number(an.start), e0 = Number(an.end);
      if (!(e0 > s0)) return false;
      return s0 < a1 && e0 > a0;      /* chevauchement, pas égalité stricte */
    });
  }

  function showTipForFig(fb, f, msg){
    const anns = annsDansCadre(msg, f);
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
              + '<div class="atc-tip-tag">💬 Note de l\'encadré</div>'
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
  }

  /* Survol d'un cadre : afficher les commentaires qu'il recouvre. */
  cc && cc.addEventListener('mouseover', function(e){
    if (window.__THEO_TOUCH_UI && window.__THEO_TOUCH_UI()) return;
    const fb = e.target.closest ? e.target.closest('.atc-figbox') : null;
    if (!fb) return;
    if (fb.classList.contains('dragging')) return;
    if (e.target.closest && e.target.closest('.fb-note')) return;  /* le badge a son rôle propre */
    const deja = document.getElementById('atc-tip');
    if (deja && deja._forFig === fb) return;
    const msgEl = fb.closest('.message');
    const ts = msgEl ? parseInt(msgEl.dataset.msgId, 10) : null;
    const msg = (state.messages || []).find(function(m){ return m.ts === ts; });
    const f = (msg && msg.shapes) ? msg.shapes.find(function(x){ return x.id === fb.dataset.figId; }) : null;
    if (!f) return;
    showTipForFig(fb, f, msg);
  });
  cc && cc.addEventListener('mouseout', function(e){
    const fb = e.target.closest ? e.target.closest('.atc-figbox') : null;
    if (!fb) return;
    /* passage vers un enfant du MÊME cadre : pas de clignotement */
    if (e.relatedTarget && fb.contains && fb.contains(e.relatedTarget)) return;
    if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('#atc-tip')) return;
    const tip = document.getElementById('atc-tip');
    if (tip && tip._forFig === fb) closeAtcTip();
  });

'''
a = une_fois("  function removeAnnotation(hlId){")
s = s[:a] + FONCTIONS + s[a:]

with open(P, "w", encoding="utf-8", newline="") as f:
    f.write(s.replace("\n", "\r\n"))
print("OK — v619 appliqué")
