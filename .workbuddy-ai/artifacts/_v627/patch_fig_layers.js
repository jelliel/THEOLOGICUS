// v627 — Interface : calques de figures (premier plan / arriere-plan).
// 2 remplacements LITTERAUX (CRLF préservé) :
//  (A) buildFigEl : applique f.z comme z-index inline (persistance du calque).
//  (B) showFigTools : ajoute 2 boutons (⤒ devant, ⤓ derriere) qui ajustent f.z
//      et le z-index de l'element, et persistent via atcPersist().
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || path.resolve(__dirname, '../../THEOLOGICUS.html');

const A_OLD = [
'    el.dataset.figId = f.id;',
'    el.style.left = (f.x||10) + \'px\'; el.style.top = (f.y||10) + \'px\';',
'    el.style.width = (f.w||150) + \'px\'; el.style.height = (f.h||90) + \'px\';',
'    el.style.setProperty(\'--fc\', f.color || \'#4f8ef7\');'
].join("\r\n");

const A_NEW = [
'    el.dataset.figId = f.id;',
'    el.style.left = (f.x||10) + \'px\'; el.style.top = (f.y||10) + \'px\';',
'    el.style.width = (f.w||150) + \'px\'; el.style.height = (f.h||90) + \'px\';',
'    el.style.setProperty(\'--fc\', f.color || \'#4f8ef7\');',
'    if (f.z != null) el.style.zIndex = String(f.z);'
].join("\r\n");

const B1_OLD = [
'    hlBtn.addEventListener(\'click\', function(e){ e.stopPropagation(); surlignerFigure(fb, f, ts); });',
'    const dup = document.createElement(\'button\'); dup.textContent = \'⧉\'; dup.title = \'Dupliquer la figure\';'
].join("\r\n");

const B1_NEW = [
'    hlBtn.addEventListener(\'click\', function(e){ e.stopPropagation(); surlignerFigure(fb, f, ts); });',
'    /* v627 — CALQUES : premier plan / arriere-plan. f.z persiste dans la shape. */',
'    const frontBtn = document.createElement(\'button\'); frontBtn.textContent = \'⤒\'; frontBtn.title = \'Premier plan (devant)\';',
'    const backBtn = document.createElement(\'button\'); backBtn.textContent = \'⤓\'; backBtn.title = \'Arrière-plan (derrière)\';',
'    function _figMaxZ(){ var m=(state.messages||[]).find(function(mm){ return mm.ts===ts; }); if(!m||!m.shapes) return 6; var mx=6; (m.shapes||[]).forEach(function(s){ var z=parseInt(s.z,10); if(!isNaN(z)&&z>mx) mx=z; }); return mx; }',
'    function _figMinZ(){ var m=(state.messages||[]).find(function(mm){ return mm.ts===ts; }); if(!m||!m.shapes) return 6; var mn=6; (m.shapes||[]).forEach(function(s){ var z=parseInt(s.z,10); if(!isNaN(z)&&z<mn) mn=z; }); return mn; }',
'    frontBtn.addEventListener(\'click\', function(e){ e.stopPropagation(); var nz=_figMaxZ()+1; f.z=nz; fb.style.zIndex=String(nz); _figEditing(); atcPersist(); });',
'    backBtn.addEventListener(\'click\', function(e){ e.stopPropagation(); var nz=_figMinZ()-1; f.z=nz; fb.style.zIndex=String(nz); _figEditing(); atcPersist(); });',
'    const dup = document.createElement(\'button\'); dup.textContent = \'⧉\'; dup.title = \'Dupliquer la figure\';'
].join("\r\n");

const B2_OLD = [
'    t.appendChild(noteBtn); t.appendChild(hlBtn);',
'    t.appendChild(sep2); t.appendChild(dup); t.appendChild(del);'
].join("\r\n");

const B2_NEW = [
'    t.appendChild(noteBtn); t.appendChild(hlBtn);',
'    t.appendChild(frontBtn); t.appendChild(backBtn);',
'    t.appendChild(sep2); t.appendChild(dup); t.appendChild(del);'
].join("\r\n");

let buf = fs.readFileSync(ROOT, 'utf8');

function replaceOnce(label, oldS, newS){
  const n = buf.split(oldS).length - 1;
  if (n !== 1) { console.error("ERREUR [" + label + "] : occurrence = " + n + " (attendu 1)."); process.exit(2); }
  buf = buf.split(oldS).join(newS);
}

replaceOnce('A_buildFigEl_z', A_OLD, A_NEW);
replaceOnce('B1_figTools_btns', B1_OLD, B1_NEW);
replaceOnce('B2_figTools_append', B2_OLD, B2_NEW);

const lfNus = (buf.match(/(?<!\r)\n/g) || []).length;
if (lfNus !== 0) { console.error("ERREUR : " + lfNus + " LF nus détectés."); process.exit(3); }

fs.writeFileSync(ROOT, buf, 'utf8');
console.log("OK : v627 calques de figures appliqués (CRLF intact).");
