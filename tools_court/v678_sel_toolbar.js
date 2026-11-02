/* ═══ v678 — BARRE D'OUTILS DE SÉLECTION (encadrage, surlignage, annotation) ═══
   Quand l'utilisateur sélectionne un mot ou une phrase dans les commentaires,
   cette barre flottante apparaît DIRECTEMENT avec les options d'annotation :
   - Surligner (5 couleurs en pastilles)
   - Encadrer (formes rapides : rectangle, rond, ovale, bandeau)
   - Annoter (note, commentaire Add to chat)
   - Outils (copier, traduire, chercher)

   Elle coexiste avec la bulle #atc-bubble existante. Cette barre se concentre
   sur l'ANNOTATION VISUELLE.

   Principe : on patche window.__atcBubble.show pour afficher NOTRE barre
   au lieu de la bulle quand on est dans un message (mode annotation).

   La barre s'affiche pour toute sélection dans un message (length >= 1). ═══ */
(function() {
  "use strict";
  if (window.__v678SelToolbar) return;

  var CSS = `
#sel-toolbar {
  position: fixed; z-index: 100001; display: none;
  flex-direction: column; gap: 0;
  background: rgba(13,22,38,.92);
  backdrop-filter: blur(8px) saturate(1.4);
  -webkit-backdrop-filter: blur(8px) saturate(1.4);
  border: 1px solid rgba(var(--accent-rgb),.28);
  border-radius: 12px; padding: 0;
  box-shadow: 0 10px 36px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.06);
  font-family: 'Exo 2', sans-serif; font-size: 13px;
  color: #eaf4ff; user-select: none;
  animation: atcPop var(--motion-dur) var(--motion-ease);
  max-width: 380px; overflow: hidden;
}
#sel-toolbar .st-bar {
  display: flex; align-items: center; gap: 2px; padding: 5px 6px;
  flex-wrap: wrap;
}
#sel-toolbar .st-group {
  display: flex; align-items: center; gap: 3px;
  padding: 2px 4px; border-radius: 8px;
}
#sel-toolbar .st-group:hover { background: rgba(255,255,255,.04); }
#sel-toolbar .st-label {
  font-size: 9px; letter-spacing: .8px; text-transform: uppercase;
  color: var(--cyan); margin-right: 2px; opacity: .7;
}
#sel-toolbar .st-sep {
  width: 1px; height: 18px; background: rgba(255,255,255,.10);
  margin: 0 2px;
}
#sel-toolbar .st-hl-dot {
  width: 18px; height: 18px; border-radius: 50%;
  cursor: pointer; border: 2px solid rgba(255,255,255,.15);
  transition: transform .12s, border-color .12s; flex-shrink: 0;
}
#sel-toolbar .st-hl-dot:hover { transform: scale(1.25); border-color: #fff; }
#sel-toolbar .st-btn {
  display: flex; align-items: center; justify-content: center;
  gap: 3px; cursor: pointer; border-radius: 7px;
  padding: 4px 6px; font-size: 12px; opacity: .85;
  transition: all .12s ease; line-height: 1;
  border: 1px solid transparent; background: transparent;
  color: #eaf4ff; font-family: inherit;
}
#sel-toolbar .st-btn:hover {
  opacity: 1; background: rgba(var(--accent-rgb),.18);
  transform: scale(1.08); border-color: rgba(var(--accent-rgb),.3);
}
#sel-toolbar .st-shapes { display: flex; gap: 3px; align-items: center; }
#sel-toolbar .st-shape-btn {
  display: flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border-radius: 7px; cursor: pointer;
  border: 1px solid rgba(255,255,255,.10);
  background: rgba(255,255,255,.03); transition: all .12s;
}
#sel-toolbar .st-shape-btn:hover {
  border-color: var(--cyan); box-shadow: 0 0 6px var(--cyan-dim);
  transform: translateY(-1px); background: rgba(var(--accent-rgb),.08);
}
#sel-toolbar .st-shape-btn svg { width: 16px; height: 16px; pointer-events: none; }
#sel-toolbar .st-more {
  display: none; padding: 6px 8px; border-top: 1px solid rgba(255,255,255,.08);
  flex-direction: column; gap: 4px; max-height: 220px; overflow-y: auto;
}
#sel-toolbar .st-more.open { display: flex; }
#sel-toolbar .st-more-cat {
  font-size: 9px; letter-spacing: .8px; text-transform: uppercase;
  color: var(--cyan); opacity: .7; margin-top: 4px;
}
#sel-toolbar .st-more-grid {
  display: grid; grid-template-columns: repeat(6,1fr); gap: 4px;
}
#sel-toolbar .st-more-ico {
  display: flex; align-items: center; justify-content: center;
  aspect-ratio: 1; border-radius: 6px; cursor: pointer;
  border: 1px solid rgba(255,255,255,.08);
  background: rgba(255,255,255,.03); transition: .12s;
}
#sel-toolbar .st-more-ico:hover {
  border-color: var(--cyan); box-shadow: 0 0 6px var(--cyan-dim);
  transform: translateY(-1px);
}
#sel-toolbar .st-more-ico svg { width: 18px; height: 18px; pointer-events: none; }
@media (pointer: coarse) {
  #sel-toolbar .st-hl-dot { width: 24px; height: 24px; }
  #sel-toolbar .st-btn { padding: 6px 8px; font-size: 14px; min-height: 36px; min-width: 36px; }
  #sel-toolbar .st-shape-btn { width: 32px; height: 32px; }
  #sel-toolbar .st-shape-btn svg { width: 20px; height: 20px; }
}
`;

  var SHAPES_RAPIDES = [
    {n:'Rectangle', svg:'<rect x="4" y="5" width="16" height="14" rx="2" fill="none" stroke="cur" stroke-width="2"/>'},
    {n:'Rond', svg:'<circle cx="12" cy="12" r="8" fill="none" stroke="cur" stroke-width="2"/>'},
    {n:'Ovale', svg:'<ellipse cx="12" cy="12" rx="9" ry="6" fill="none" stroke="cur" stroke-width="2"/>'},
    {n:'Bandeau', svg:'<path d="M3 6 H18 L21 12 L18 18 H3 Z" fill="none" stroke="cur" stroke-width="2"/>'}
  ];

  var HL_COLORS = [
    { key:'yellow', css:'#ffeb3b', label:'Jaune' },
    { key:'green',  css:'#81e68c', label:'Vert' },
    { key:'blue',   css:'#78c8ff', label:'Bleu' },
    { key:'pink',   css:'#ff96c8', label:'Rose' },
    { key:'red',    css:'#ff8c8c', label:'Rouge' }
  ];

  var toolbar = null;
  var morePanel = null;
  var currentSel = null;

  function buildToolbar() {
    if (toolbar) return toolbar;
    var style = document.createElement('style');
    style.id = 'v678-sel-toolbar-css';
    style.textContent = CSS;
    document.head.appendChild(style);

    toolbar = document.createElement('div');
    toolbar.id = 'sel-toolbar';
    var bar = document.createElement('div');
    bar.className = 'st-bar';

    /* Groupe 1 : SURLIGNER */
    var grpHL = document.createElement('div');
    grpHL.className = 'st-group';
    var lblHL = document.createElement('span');
    lblHL.className = 'st-label';
    lblHL.textContent = 'Surligner';
    grpHL.appendChild(lblHL);
    HL_COLORS.forEach(function(c) {
      var dot = document.createElement('span');
      dot.className = 'st-hl-dot';
      dot.style.background = c.css;
      dot.title = c.label;
      dot.dataset.color = c.key;
      dot.addEventListener('mousedown', function(e) { e.preventDefault(); e.stopPropagation(); });
      dot.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); applyHighlight(c.key); });
      grpHL.appendChild(dot);
    });
    bar.appendChild(grpHL);
    bar.appendChild(makeSep());

    /* Groupe 2 : ENCADRER */
    var grpShape = document.createElement('div');
    grpShape.className = 'st-group';
    var lblShape = document.createElement('span');
    lblShape.className = 'st-label';
    lblShape.textContent = 'Encadrer';
    grpShape.appendChild(lblShape);
    var shapesRow = document.createElement('div');
    shapesRow.className = 'st-shapes';
    SHAPES_RAPIDES.forEach(function(s) {
      var btn = document.createElement('div');
      btn.className = 'st-shape-btn';
      btn.title = s.n;
      btn.innerHTML = '<svg viewBox="0 0 24 24">' + s.svg.replace(/cur/g, '#4f8ef7').replace(/fill=("|')([^"']*)\1/g, 'fill="none"') + '</svg>';
      btn.addEventListener('mousedown', function(e) { e.preventDefault(); e.stopPropagation(); });
      btn.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); applyShape(s); });
      shapesRow.appendChild(btn);
    });
    var moreBtn = document.createElement('div');
    moreBtn.className = 'st-shape-btn';
    moreBtn.title = 'Plus de formes';
    moreBtn.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="6" cy="12" r="2" fill="#eaf4ff"/><circle cx="12" cy="12" r="2" fill="#eaf4ff"/><circle cx="18" cy="12" r="2" fill="#eaf4ff"/></svg>';
    moreBtn.addEventListener('mousedown', function(e) { e.preventDefault(); e.stopPropagation(); });
    moreBtn.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); toggleMore(); });
    shapesRow.appendChild(moreBtn);
    grpShape.appendChild(shapesRow);
    bar.appendChild(grpShape);
    bar.appendChild(makeSep());

    /* Groupe 3 : ANNOTER */
    var grpAnnot = document.createElement('div');
    grpAnnot.className = 'st-group';
    var btnNote = document.createElement('div');
    btnNote.className = 'st-btn'; btnNote.title = 'Ajouter une note'; btnNote.innerHTML = '\ud83d\udcdd';
    btnNote.addEventListener('mousedown', function(e) { e.preventDefault(); e.stopPropagation(); });
    btnNote.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); doNote(); });
    grpAnnot.appendChild(btnNote);
    var btnChat = document.createElement('div');
    btnChat.className = 'st-btn'; btnChat.title = 'Ajouter au chat'; btnChat.innerHTML = '\ud83d\udcac';
    btnChat.addEventListener('mousedown', function(e) { e.preventDefault(); e.stopPropagation(); });
    btnChat.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); doAddToChat(); });
    grpAnnot.appendChild(btnChat);
    bar.appendChild(grpAnnot);
    bar.appendChild(makeSep());

    /* Groupe 4 : OUTILS */
    var grpTools = document.createElement('div');
    grpTools.className = 'st-group';
    var btnCopy = document.createElement('div');
    btnCopy.className = 'st-btn'; btnCopy.title = 'Copier'; btnCopy.innerHTML = '\ud83d\udccb';
    btnCopy.addEventListener('mousedown', function(e) { e.preventDefault(); e.stopPropagation(); });
    btnCopy.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); doCopy(); });
    grpTools.appendChild(btnCopy);
    var btnTranslate = document.createElement('div');
    btnTranslate.className = 'st-btn'; btnTranslate.title = 'Traduire'; btnTranslate.innerHTML = '\ud83c\udf10';
    btnTranslate.addEventListener('mousedown', function(e) { e.preventDefault(); e.stopPropagation(); });
    btnTranslate.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); doTranslate(); });
    grpTools.appendChild(btnTranslate);
    var btnSpeak = document.createElement('div');
    btnSpeak.className = 'st-btn'; btnSpeak.title = 'Lire a voix'; btnSpeak.innerHTML = '\ud83d\udd0a';
    btnSpeak.addEventListener('mousedown', function(e) { e.preventDefault(); e.stopPropagation(); });
    btnSpeak.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); doSpeak(); });
    grpTools.appendChild(btnSpeak);
    bar.appendChild(grpTools);

    toolbar.appendChild(bar);

    morePanel = document.createElement('div');
    morePanel.className = 'st-more';
    toolbar.appendChild(morePanel);

    toolbar.addEventListener('mousedown', function(e) { e.stopPropagation(); });
    toolbar.addEventListener('mouseup', function(e) { e.stopPropagation(); });
    document.body.appendChild(toolbar);
    return toolbar;
  }

  function makeSep() { var s = document.createElement('div'); s.className = 'st-sep'; return s; }

  function fillMoreShapes() {
    if (!morePanel) return;
    morePanel.innerHTML = '';
    var palette = window.__FORMES_PALETTE || [];
    palette.forEach(function(group) {
      var cat = document.createElement('div');
      cat.className = 'st-more-cat'; cat.textContent = group.cat;
      morePanel.appendChild(cat);
      var grid = document.createElement('div');
      grid.className = 'st-more-grid';
      (group.items || []).forEach(function(it) {
        var ico = document.createElement('div');
        ico.className = 'st-more-ico'; ico.title = it.n;
        ico.innerHTML = '<svg viewBox="0 0 24 24">' + it.svg.replace(/cur/g, '#4f8ef7').replace(/fill=("|')([^"']*)\1/g, 'fill="none"') + '</svg>';
        ico.addEventListener('mousedown', function(e) { e.preventDefault(); e.stopPropagation(); });
        ico.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); applyShape(it); hideMore(); });
        grid.appendChild(ico);
      });
      morePanel.appendChild(grid);
    });
  }

  function toggleMore() {
    if (!morePanel) return;
    if (morePanel.classList.contains('open')) hideMore();
    else { fillMoreShapes(); morePanel.classList.add('open'); }
  }
  function hideMore() { if (morePanel) morePanel.classList.remove('open'); }

  function applyHighlight(color) {
    if (!currentSel) return;
    var s = currentSel;
    hideToolbar();
    /* highlightSelection est une fonction LOCALE du module atc, non exposée
       sur window. On utilise le bouton ✏️ de la bulle existante pour ouvrir
       le menu de couleurs, puis on clique sur la bonne couleur. */
    /* 1. Remplir _atcSel (peut avoir été effacé par hideToolbar) */
    window._atcSel = s;
    /* 2. Assurer que la bulle existe (ensureBubble crée les handlers) */
    if (window.__atcBubble && typeof window.__atcBubble.ensure === 'function') {
      window.__atcBubble.ensure();
    }
    /* 3. Cliquer le bouton ✏️ de la bulle pour ouvrir le menu de couleurs */
    var hlBtn = document.querySelector('#atc-bubble .atc-act[data-act="hl"]');
    if (hlBtn) {
      hlBtn.click();
      /* 4. Le menu de couleurs (#atc-color-menu) est maintenant ouvert.
         Cliquer sur la pastille de la couleur voulue. */
      setTimeout(function() {
        var menu = document.getElementById('atc-color-menu');
        if (!menu) return;
        var dot = menu.querySelector('.cc-dot[data-color="' + color + '"]');
        if (dot) dot.click();
      }, 50);
    }
  }

  function applyShape(shapeItem) {
    if (!currentSel) return; hideToolbar();
    var s = currentSel;
    if (!s.msgTs) { if (typeof toast === 'function') toast("L'encadrement exige un message porteur", 'info'); return; }
    if (typeof window.insertFigureAt === 'function') {
      var target = { msgTs: s.msgTs, selRect: s.rect, range: s.range, texte: s.text,
        clientX: s.rect ? s.rect.left + s.rect.width / 2 : 10,
        clientY: s.rect ? s.rect.top + s.rect.height / 2 : 10 };
      try { window.insertFigureAt(target, shapeItem); } catch(e) {}
    } else if (typeof window.openInsertMenuAt === 'function') {
      try { window.openInsertMenuAt({ msgTs: s.msgTs, selRect: s.rect, range: s.range, texte: s.text,
        clientX: s.rect ? s.rect.left + s.rect.width / 2 : 10,
        clientY: s.rect ? s.rect.top + s.rect.height / 2 : 10 }); } catch(e) {}
    }
  }

  function doNote() {
    if (!currentSel) return; hideToolbar();
    var s = currentSel;
    if (!s.msgTs && window.__v189NoteEditor) { window.__v189NoteEditor(s); return; }
    var btn = document.querySelector('#atc-bubble .atc-note-btn');
    if (btn) btn.click();
  }

  function doAddToChat() {
    if (!currentSel) return; hideToolbar();
    var btn = document.querySelector('#atc-bubble .atc-main');
    if (btn) btn.click();
  }

  function doCopy() {
    if (!currentSel) return;
    var text = currentSel.text || '';
    try { navigator.clipboard.writeText(text); if (typeof toast === 'function') toast('\u2713 Texte copie', 'success'); }
    catch(e) { var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); if (typeof toast === 'function') toast('\u2713 Texte copie', 'success'); }
  }

  function doTranslate() { if (!currentSel) return; hideToolbar(); var btn = document.querySelector('#atc-bubble .atc-act[data-act="translate"]'); if (btn) btn.click(); }
  function doSpeak() { if (!currentSel) return; hideToolbar(); var btn = document.querySelector('#atc-bubble .atc-act[data-act="speak"]'); if (btn) btn.click(); }

  function showToolbar(sel) { currentSel = sel; var t = buildToolbar(); hideMore(); t.style.display = 'flex'; positionToolbar(); }

  function positionToolbar() {
    if (!toolbar || !currentSel) return;
    var s = currentSel;
    toolbar.style.visibility = 'hidden'; toolbar.style.display = 'flex';
    var w = toolbar.offsetWidth || 320, h = toolbar.offsetHeight || 40;
    var x = s.rect.left + s.rect.width / 2 - w / 2;
    x = Math.max(10, Math.min(x, window.innerWidth - w - 10));
    var y = s.rect.top - h - 12;
    if (y < 8) y = s.rect.bottom + 12;
    if (y + h > window.innerHeight - 8 && s.rect.top - h - 12 >= 8) y = s.rect.top - h - 12;
    toolbar.style.left = x + 'px'; toolbar.style.top = y + 'px'; toolbar.style.visibility = '';
  }

  function hideToolbar() { if (toolbar) toolbar.style.display = 'none'; hideMore(); currentSel = null; }

  /* ── Stratégie : intercepter APRÈS detectSelectionAndShow ──
     detectSelectionAndShow (module atc) se déclenche sur mouseup avec un
     délai de 180ms, et sur selectionchange avec 220ms. Elle remplit
     window._atcSel puis appelle showBubble() (fonction LOCALE, non patchable).

     On ajoute nos PROPRRES écouteurs avec un délai légèrement supérieur (300ms)
     qui vérifient _atcSel : si on est en mode annotation (msgTs non-null),
     on affiche NOTRE barre et on masque la bulle existante. */
  var _selCheckTimer = null;

  function checkAndShowToolbar() {
    var s = window._atcSel;
    if (!s || !s.text || s.text.length < 1) { hideToolbar(); return; }
    if (!s.msgTs) {
      /* Mode universel (hors message) → pas de barre, bulle normale */
      hideToolbar();
      return;
    }
    /* Mode annotation (dans un message) → afficher la barre, masquer la bulle */
    showToolbar(s);
    /* Masquer la bulle existante */
    var bubble = document.getElementById('atc-bubble');
    if (bubble) bubble.style.display = 'none';
  }

  document.addEventListener('mouseup', function(e) {
    if (e && e.target && e.target.closest && e.target.closest('#sel-toolbar')) return;
    clearTimeout(_selCheckTimer);
    _selCheckTimer = setTimeout(checkAndShowToolbar, 300);
  });

  document.addEventListener('keyup', function(e) {
    if (e.shiftKey && (e.key.indexOf('Arrow') === 0 || e.key === 'Home' || e.key === 'End')) {
      clearTimeout(_selCheckTimer);
      _selCheckTimer = setTimeout(checkAndShowToolbar, 300);
    }
  });

  var _repositionRaf = 0;
  function repositionThrottled() {
    if (_repositionRaf) return;
    _repositionRaf = requestAnimationFrame(function() {
      _repositionRaf = 0;
      if (toolbar && toolbar.style.display !== 'none' && currentSel) {
        var sel = window.getSelection();
        if (sel && !sel.isCollapsed && sel.rangeCount > 0) {
          try { var r = sel.getRangeAt(0).getBoundingClientRect(); if (r && (r.width || r.height)) { currentSel.rect = r; currentSel.range = sel.getRangeAt(0).cloneRange(); } } catch(e) {}
        }
        positionToolbar();
      }
    });
  }

  document.addEventListener('mousedown', function(e) {
    if (!e.target.closest) return;
    if (e.target.closest('#sel-toolbar')) return;
    if (e.target.closest('#atc-bubble')) return;
    if (e.target.closest('#atc-insert-menu')) return;
    if (e.target.closest('#atc-color-menu')) return;
    if (e.target.closest('#atc-ask-popover')) return;
    if (e.target.closest('#atc-note-panel')) return;
    hideToolbar();
  });
  document.addEventListener('keydown', function(e) { if (e.key === 'Escape') hideToolbar(); });
  var cc = document.getElementById('chat-container');
  cc && cc.addEventListener('scroll', repositionThrottled, true);
  window.addEventListener('scroll', repositionThrottled, true);
  window.addEventListener('resize', repositionThrottled);

  function init() {
    /* Les écouteurs sont déjà posés au niveau du document.
       On ne patche plus __atcBubble.show car detectSelectionAndShow
       appelle showBubble() (fonction locale), pas window.__atcBubble.show(). */
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
  window.__v678SelToolbar = { show: showToolbar, hide: hideToolbar, build: buildToolbar };
})();
