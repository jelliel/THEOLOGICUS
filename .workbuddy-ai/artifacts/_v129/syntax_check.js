// Extrait du handler de drag retravaille (v129) -> validation de syntaxe seule.
function handler() {
  const fb = {}; const f = {}; const ts = 0;
  const dir = null;
  const sx = 0, sy = 0, ol = 0, ot = 0, ow = 0, oh = 0;
  let _mvEv = null, _mvRaf = 0;
  function _mvApply() {
    _mvRaf = 0;
    const ev = _mvEv; _mvEv = null;
    if (!ev) return;
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    if (dir === 'se') {
      fb.style.width = Math.max(46, ow + dx) + 'px'; fb.style.height = Math.max(34, oh + dy) + 'px';
    } else if (dir === 'sw') {
      const w = Math.max(46, ow - dx);
      fb.style.left = (ol + (ow - w)) + 'px'; fb.style.width = w + 'px'; fb.style.height = Math.max(34, oh + dy) + 'px';
    } else if (dir === 'ne') {
      const h = Math.max(34, oh - dy);
      fb.style.top = (ot + (oh - h)) + 'px'; fb.style.width = Math.max(46, ow + dx) + 'px'; fb.style.height = h + 'px';
    } else if (dir === 'nw') {
      const w = Math.max(46, ow - dx), h = Math.max(34, oh - dy);
      fb.style.left = (ol + (ow - w)) + 'px'; fb.style.top = (ot + (oh - h)) + 'px'; fb.style.width = w + 'px'; fb.style.height = h + 'px';
    } else {
      fb.style.left = (ol + dx) + 'px'; fb.style.top = (ot + dy) + 'px';
    }
  }
  function mv(ev) {
    _mvEv = ev;
    if (!_mvRaf) _mvRaf = requestAnimationFrame(_mvApply);
  }
  function up() {
    if (_mvRaf) { cancelAnimationFrame(_mvRaf); _mvRaf = 0; _mvApply(); }
    document.removeEventListener('mousemove', mv);
    document.removeEventListener('mouseup', up);
    fb.classList.remove('dragging');
    persistFig(f, fb);
    if (fb.classList.contains('sel')) showFigTools(fb, f, ts);
  }
  fb.classList.add('dragging');
  document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
}
if (typeof handler !== 'function') throw new Error('handler manquant');
