# -*- coding: utf-8 -*-
"""v618 — ANNOTER UN ENCADRÉ : commentaire + surlignage SUR le cadre.

Un cadre posé sur un mot recouvre le texte et intercepte le geste : impossible
de le sélectionner pour y poser un commentaire. On offre donc les actions SUR
le cadre (barre d'outils + badge 💬).
"""
import sys

P = "THEOLOGICUS.html"
with open(P, encoding="utf-8", newline="") as f:
    s = f.read().replace("\r\n", "\n")


def une_fois(ancre):
    n = globals()['s'].count(ancre)
    if n != 1:
        raise SystemExit("ANCRE %r : %d occurrence(s)" % (ancre[:70], n))
    return globals()['s'].index(ancre)


# ────────────────────────────────────────────────────────────────
# 1. CSS
# ────────────────────────────────────────────────────────────────
CSS = r'''.atc-figbox .fb-x:hover{transform:scale(1.15)}
/* v618 — badge de commentaire TOUJOURS visible sur un encadré annoté :
   le cadre recouvre le texte, c'est le seul repère permanent. */
.atc-figbox .fb-note{
  position:absolute; top:-9px; left:-9px; width:18px; height:18px; line-height:17px;
  text-align:center; background:rgba(13,22,38,.95); color:#ffd54f;
  border:1px solid rgba(255,213,79,.75); border-radius:50%; font-size:10px;
  cursor:pointer; z-index:13; box-shadow:0 1px 4px rgba(0,0,0,.45);
}
.atc-figbox .fb-note:hover{transform:scale(1.15)}
#atc-fig-note{
  position:fixed; z-index:100000; width:min(340px,92vw); background:#15171c; color:#e8e6df;
  border:1px solid #2c2f37; border-radius:10px; padding:12px;
  box-shadow:0 10px 30px rgba(0,0,0,.45); font-family:inherit;
}
#atc-fig-note .fn-t{font-size:12px;opacity:.8;margin-bottom:6px}
#atc-fig-note .fn-q{font-size:11px;opacity:.65;margin-bottom:8px;font-style:italic;line-height:1.45}
#atc-fig-note textarea{
  width:100%; box-sizing:border-box; background:#0f1115; color:#e8e6df;
  border:1px solid #2c2f37; border-radius:8px; padding:8px; font-family:inherit; resize:vertical;
}
#atc-fig-note .fn-row{display:flex;gap:8px;justify-content:flex-end;margin-top:8px;flex-wrap:wrap}
#atc-fig-note button{
  background:#23262e; color:#cfcabb; border:1px solid #34373f; border-radius:8px;
  padding:6px 12px; cursor:pointer; font-family:inherit;
}
#atc-fig-note button.fn-ok{background:#3a5bd9;color:#fff;border:none}
#atc-fig-note button[data-sup]{color:#ff8a80;border-color:rgba(255,138,128,.4)}
#atc-fig-note .fn-aide{font-size:10px;opacity:.45;margin-top:6px}
'''
anc_css = ".atc-figbox .fb-x:hover{transform:scale(1.15)}\n"
a = une_fois(anc_css)
s = s[:a] + CSS + s[a + len(anc_css):]

# ────────────────────────────────────────────────────────────────
# 2. buildFigEl — badge 💬
# ────────────────────────────────────────────────────────────────
anc = """    const x = document.createElement('span'); x.className = 'fb-x'; x.textContent = '×'; x.setAttribute('data-del-fig', f.id);
    el.appendChild(x);
"""
a = une_fois(anc)
s = s[:a] + anc + """    /* v618 — un encadré peut porter un COMMENTAIRE : le badge le signale
       sans qu'il faille survoler (au doigt, le survol n'existe pas). */
    if (f.note) {
      const nb = document.createElement('span');
      nb.className = 'fb-note'; nb.textContent = '💬';
      nb.setAttribute('data-note-fig', f.id);
      nb.title = 'Commentaire : ' + String(f.note).slice(0, 300);
      el.appendChild(nb);
    }
""" + s[a + len(anc):]

# ────────────────────────────────────────────────────────────────
# 3. Barre d'outils — boutons 💬 et 🖍
# ────────────────────────────────────────────────────────────────
anc = """    const dup = document.createElement('button'); dup.textContent = '⧉'; dup.title = 'Dupliquer la figure';
"""
a = une_fois(anc)
s = s[:a] + """    /* v618 — ANNOTER L'ENCADRÉ. Le cadre recouvre le texte : impossible de
       sélectionner ce qu'il entoure. Ces deux boutons rendent l'annotation
       possible SANS retirer le cadre. */
    const noteBtn = document.createElement('button');
    noteBtn.textContent = '💬';
    noteBtn.title = f.note ? 'Modifier le commentaire de cet encadré' : 'Commenter cet encadré (note enregistrée avec le cadre)';
    noteBtn.addEventListener('click', function(e){ e.stopPropagation(); ouvrirNoteFigure(fb, f, ts); });
    const hlBtn = document.createElement('button');
    hlBtn.textContent = '🖍';
    hlBtn.title = f.ancre
      ? 'Surligner le texte encadré (cliquez de nouveau pour retirer)'
      : 'Surlignage impossible : ce cadre n\\'est pas lié à un texte';
    if (!f.ancre) hlBtn.style.opacity = '0.4';
    hlBtn.addEventListener('click', function(e){ e.stopPropagation(); surlignerFigure(fb, f, ts); });
""" + anc + s[a + len(anc):]

anc = "    t.appendChild(sep2); t.appendChild(dup); t.appendChild(del);"
a = une_fois(anc)
s = s[:a] + "    t.appendChild(noteBtn); t.appendChild(hlBtn);\n" + anc + s[a + len(anc):]

# ────────────────────────────────────────────────────────────────
# 4. Fonctions : note + surlignage
# ────────────────────────────────────────────────────────────────
FONCTIONS = r'''  /* ═══ v618 — ANNOTER UN ENCADRÉ (commentaire, surlignage) ═══
     Le cadre est une SURCOUCHE : il capte le geste qui servirait à sélectionner
     le texte qu'il entoure. Sans ces fonctions, un mot encadré ne pouvait plus
     être ni commenté ni surligné — la seule issue était de supprimer le cadre. */
  function _figTexte(f){
    return String((f && ((f.ancre && f.ancre.texte) || f.text)) || '');
  }
  /* Couleur de surlignage la plus proche du cadre (5 teintes disponibles). */
  function _couleurMarque(f){
    const c = String((f && f.color) || '').toLowerCase();
    if (c === '#81e68c') return 'green';
    if (c === '#4f8ef7' || c === '#b388ff') return 'blue';
    if (c === '#ff96c8') return 'pink';
    if (c === '#ff8a80' || c === '#ff7043') return 'red';
    return 'yellow';
  }
  function fermerNoteFigure(){
    const p = document.getElementById('atc-fig-note');
    if (p) p.remove();
  }
  function ouvrirNoteFigure(fb, f, ts){
    if (!f) return;
    fermerNoteFigure();
    const txt = _figTexte(f).slice(0, 140);
    const p = document.createElement('div');
    p.id = 'atc-fig-note';
    p.innerHTML =
      '<div class="fn-t">💬 Commentaire de l\'encadré</div>' +
      (txt ? '<div class="fn-q">« ' + esc(txt) + ' »</div>'
           : '<div class="fn-q">Ce cadre n\'est pas lié à un texte : le commentaire reste attaché au cadre.</div>') +
      '<textarea rows="4" placeholder="Votre commentaire, votre note d\'étude…"></textarea>' +
      '<div class="fn-row">' +
        '<button data-ann>Annuler</button>' +
        (f.note ? '<button data-sup>🗑 Supprimer</button>' : '') +
        '<button class="fn-ok" data-save>💾 Enregistrer</button>' +
      '</div>' +
      '<div class="fn-aide">Ctrl+Entrée pour enregistrer · Échap pour fermer</div>';
    document.body.appendChild(p);
    /* Placement : près du cadre, ramené dans la fenêtre. */
    try {
      const r = fb.getBoundingClientRect();
      const w = p.offsetWidth || 340, h = p.offsetHeight || 220;
      let left = Math.min(Math.max(10, r.left), Math.max(10, window.innerWidth - w - 12));
      let top = r.top - 8;
      if (top + h > window.innerHeight - 10) top = Math.max(10, window.innerHeight - h - 10);
      p.style.left = left + 'px';
      p.style.top = top + 'px';
    } catch (e) {}
    const ta = p.querySelector('textarea');
    ta.value = f.note || '';
    ta.addEventListener('mousedown', function(e){ e.stopPropagation(); });
    p.addEventListener('mousedown', function(e){ e.stopPropagation(); });
    p.addEventListener('touchstart', function(e){ e.stopPropagation(); }, { passive: true });
    function majBadge(){
      if (!fb) return;
      let b = fb.querySelector('.fb-note');
      if (f.note) {
        if (!b) { b = document.createElement('span'); b.className = 'fb-note'; b.textContent = '💬'; fb.appendChild(b); }
        b.setAttribute('data-note-fig', f.id);
        b.title = 'Commentaire : ' + String(f.note).slice(0, 300);
      } else if (b) { b.remove(); }
    }
    function enregistrer(){
      const v = String(ta.value || '').trim();
      if (v) { f.note = v; f.noteTs = Date.now(); }
      else { delete f.note; delete f.noteTs; }
      if (typeof markChatDirty === 'function') markChatDirty();
      atcPersist();
      majBadge();
      fermerNoteFigure();
      toast(v ? '✓ Commentaire enregistré sur l\'encadré' : '✓ Commentaire supprimé', 'success');
    }
    p.querySelector('[data-save]').onclick = enregistrer;
    p.querySelector('[data-ann]').onclick = fermerNoteFigure;
    const sup = p.querySelector('[data-sup]');
    if (sup) sup.onclick = function(){
      delete f.note; delete f.noteTs;
      if (typeof markChatDirty === 'function') markChatDirty();
      atcPersist();
      majBadge();
      fermerNoteFigure();
      toast('✓ Commentaire supprimé', 'success');
    };
    ta.addEventListener('keydown', function(e){
      if (e.key === 'Escape') { e.preventDefault(); fermerNoteFigure(); }
      else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); enregistrer(); }
    });
    setTimeout(function(){ try { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) {} }, 40);
  }
  /* Surligne le TEXTE sous le cadre (ou retire le surlignage existant).
     Les offsets viennent de l'ancre texte du cadre (v609) : le surlignage se
     replace donc comme le cadre après un re-rendu. */
  function surlignerFigure(fb, f, ts){
    const msg = (state.messages || []).find(function(m){ return m.ts === ts; });
    if (!msg) { toast('Message introuvable', 'error'); return; }
    if (!f.ancre) {
      toast('Ce cadre n\'est pas lié à un texte : encadrez une SÉLECTION pour pouvoir la surligner.', 'info');
      return;
    }
    const s0 = f.ancre.start, e0 = f.ancre.end;
    msg.marks = msg.marks || [];
    const i = msg.marks.findIndex(function(mk){ return mk && mk.start === s0 && mk.end === e0; });
    if (i >= 0) {
      msg.marks.splice(i, 1);
      if (typeof markChatDirty === 'function') markChatDirty();
      atcPersist();
      renderMessagesSafe();
      toast('✓ Surlignage retiré · Enregistré', 'success');
      return;
    }
    const id = 'mk-' + Date.now();
    msg.marks.push({ id: id, text: _figTexte(f) || ' ', color: _couleurMarque(f),
      start: s0, end: e0, fig: f.id });
    if (typeof markChatDirty === 'function') markChatDirty();
    atcPersist();
    /* Même précaution que highlightSelection : l'observer ne doit pas relancer
       une passe sur nos propres mutations. */
    window.__atcApplying = true;
    try { applyMarks(); } catch (e) {}
    setTimeout(function(){ window.__atcApplying = false; }, 0);
    toast('✓ Texte encadré surligné (' + _couleurMarque(f) + ') · clic droit sur le surlignage pour la couleur', 'success');
  }
  window.__theoFigAnnot = { ouvrirNoteFigure: ouvrirNoteFigure, surlignerFigure: surlignerFigure, fermerNoteFigure: fermerNoteFigure };

'''
a = une_fois("  document.addEventListener('mousedown', function(e){\n    if (e.target.closest && (e.target.closest('.atc-figbox') || e.target.closest('.fig-tools'))) return;")
s = s[:a] + FONCTIONS + s[a:]

# ────────────────────────────────────────────────────────────────
# 5. Clic sur le badge 💬 -> ouvrir la note (sans démarrer un déplacement)
# ────────────────────────────────────────────────────────────────
anc = """    if (!f) return;
    cc.querySelectorAll('.atc-figbox.sel').forEach(function(o){ if (o !== fb) o.classList.remove('sel'); });"""
a = une_fois(anc)
s = s[:a] + """    if (!f) return;
    /* v618 — le badge 💬 ouvre le commentaire et ne doit PAS démarrer un
       glissement du cadre (le mousedown global le ferait). */
    const badge = e.target.closest ? e.target.closest('.fb-note') : null;
    if (badge) { e.preventDefault(); e.stopPropagation(); ouvrirNoteFigure(fb, f, ts); return; }
    cc.querySelectorAll('.atc-figbox.sel').forEach(function(o){ if (o !== fb) o.classList.remove('sel'); });""" + s[a + len(anc):]

# ────────────────────────────────────────────────────────────────
# 6. Export — le commentaire de l'encadré suit le cadre
# ────────────────────────────────────────────────────────────────
anc = "  (m.shapes||[]).forEach(s=>{ if(s&&s.text) md+='> 📦 **Encadré** : '+s.text+'\\n\\n'; });"
a = une_fois(anc)
s = s[:a] + anc + "\n  /* v618 — le commentaire d'un encadré est exporté AVEC lui. */\n  (m.shapes||[]).forEach(s=>{ if(s&&s.note) md+='> 💬 **Note de l\\'encadré** : '+String(s.note).replace(/\\n+/g,' ')+'\\n\\n'; });" + s[a + len(anc):]

# HTML : APRES la boucle des commentaires (commentHtml est declare juste avant)
anc = "  (m.annotations||[]).forEach(a=>{ if(a&&a.a){ const c=String(a.a).replace(/[#*_`>|]/g,'').trim(); if(c) commentHtml+='<div class=\"exp-comment\"><b>💬 Commentaire :</b> '+(typeof escapeHtml==='function'?escapeHtml(c):c)+'</div>'; } });"
a = une_fois(anc)
s = s[:a] + anc + """
  /* v618 — commentaires des encadrés, dans l'export riche. */
  (m.shapes||[]).forEach(s=>{ if(s&&s.note){ const c=String(s.note).replace(/[#*_`>|]/g,'').trim();
    if(c) commentHtml+='<div class="exp-comment"><b>💬 Note de l\\'encadré'+(s.text?' (« '+String(s.text).slice(0,60)+' »)':'')+' :</b> '+(typeof escapeHtml==='function'?escapeHtml(c):c)+'</div>'; } });""" + s[a + len(anc):]

with open(P, "w", encoding="utf-8", newline="") as f:
    f.write(s.replace("\n", "\r\n"))
print("OK — v618 appliqué")
