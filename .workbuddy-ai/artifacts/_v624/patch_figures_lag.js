// Patch v624 — ANTI-LAG figures.
// Réécrit atcPersist() en throttle leading+trailing (350 ms) et ajoute un
// garde-fou __atcFigEditing sur l'observer + wrap __atcApplying sur
// insertFigureAt/dup. Préserve le CRLF (slice littérale).
const fs = require("fs");
const F = "C:/tmp/theoverify/THEOLOGICUS.html";
const BAK = "C:/tmp/theoverify/.workbuddy-ai/artifacts/_v624/THEOLOGICUS_html_pre_v624.bak";
const CRLF = "\r\n";

const src = fs.readFileSync(F, "utf8");
fs.writeFileSync(BAK, src); // sauvegarde avant toute modif

function block(lines) { return lines.join(CRLF); }

// Chaque remplacement : { from, to }. from doit être UNIQUE (indexOf===lastIndexOf).
const changes = [];
function add(fromLines, toLines, label) {
  changes.push({ from: block(fromLines), to: block(toLines), label });
}

// ── CHANGE A : atcPersist -> throttle leading+trailing ──
add(
  [
    "  async function atcPersist(){",
    "    try { if (typeof flushChatNow === 'function') flushChatNow(); } catch(e) {}",
    "    try { if (typeof saveChat === 'function') await saveChat(); } catch(e) {}",
    "    try { if (typeof markChatDirty === 'function') markChatDirty(); } catch(e) {}",
    "  }",
  ],
  [
    "  /* v624 — ANTI-LAG figures : les sliders/couleurs de figure émettent des",
    "     dizaines d'événements `input`/s. L'ancien atcPersist refaisait un",
    "     buildChatPayload() + localStorage.setItem SYNCHRONE (flushChatNow) à",
    "     CHAQUE appel -> écriture bloquante -> lag puis freeze quand on insère ou",
    "     modifie des figures. THROTTLE leading+trailing (350 ms) :",
    "     - 1re demande = sauvegarde immédiate (comportement discret identique,",
    "       aucune régression sur surlignage/insertion/suppression) ;",
    "     - demandes répétées dans la fenêtre = coalescées en 1 seule sauvegarde",
    "       finale. L'état mémoire est déjà à jour, rien n'est perdu ; le",
    "     beforeunload fait flushChatNow() synchronement en dernier recours. */",
    "  let _atcPersistTO = null;",
    "  let _atcPersistLeading = false;",
    "  let _atcPersistPromise = null;",
    "  async function _atcPersistRun(){",
    "    _atcPersistTO = null;",
    "    _atcPersistLeading = false;",
    "    try { if (typeof flushChatNow === 'function') flushChatNow(); } catch(e) {}",
    "    try { if (typeof saveChat === 'function') await saveChat(); } catch(e) {}",
    "    try { if (typeof markChatDirty === 'function') markChatDirty(); } catch(e) {}",
    "  }",
    "  function atcPersist(){",
    "    if (!_atcPersistTO && !_atcPersistLeading) {",
    "      _atcPersistLeading = true;",
    "      _atcPersistPromise = _atcPersistRun();",
    "      return _atcPersistPromise;",
    "    }",
    "    if (_atcPersistTO) clearTimeout(_atcPersistTO);",
    "    _atcPersistPromise = new Promise(function(res){ _atcPersistTO = setTimeout(function(){ _atcPersistRun().finally(res); }, 350); });",
    "    return _atcPersistPromise;",
    "  }",
  ],
  "A:atcPersist-throttle"
);

// ── CHANGE B : observer guard __atcFigEditing ──
add(
  [ "      if (window.__atcStreaming || window.__atcApplying) return;" ],
  [ "      if (window.__atcStreaming || window.__atcApplying || window.__atcFigEditing) return;" ],
  "B:observer-guard"
);

// ── CHANGE C1 : helper _figEditing + _figEdTO ──
add(
  [ "  let figToolsEl = null;" ],
  [
    "  let figToolsEl = null;",
    "  let _figEdTO = null;",
    "  function _figEditing(){ window.__atcFigEditing = true; if (_figEdTO) clearTimeout(_figEdTO); _figEdTO = setTimeout(function(){ window.__atcFigEditing = false; }, 140); }",
  ],
  "C1:figEditing-helper"
);

// ── CHANGE C2..C6 : handlers fig-tools ──
add(
  [ "    col.addEventListener('input', function(){ f.color = col.value; refreshFigVisual(fb, f); atcPersist(); });" ],
  [ "    col.addEventListener('input', function(){ f.color = col.value; refreshFigVisual(fb, f); _figEditing(); atcPersist(); });" ],
  "C2:col"
);
add(
  [ "    rng.addEventListener('input', function(){ f.weight = parseFloat(rng.value); refreshFigVisual(fb, f); wv.textContent = f.weight.toFixed(1); atcPersist(); });" ],
  [ "    rng.addEventListener('input', function(){ f.weight = parseFloat(rng.value); refreshFigVisual(fb, f); wv.textContent = f.weight.toFixed(1); _figEditing(); atcPersist(); });" ],
  "C3:rng"
);
add(
  [ "    fill.addEventListener('input', function(){ f.fill = fill.value; fillOff.classList.remove('on'); refreshFigVisual(fb, f); atcPersist(); });" ],
  [ "    fill.addEventListener('input', function(){ f.fill = fill.value; fillOff.classList.remove('on'); refreshFigVisual(fb, f); _figEditing(); atcPersist(); });" ],
  "C4:fill"
);
add(
  [ "    fillOff.addEventListener('click', function(){ f.fill = ''; fillOff.classList.add('on'); refreshFigVisual(fb, f); atcPersist(); });" ],
  [ "    fillOff.addEventListener('click', function(){ f.fill = ''; fillOff.classList.add('on'); refreshFigVisual(fb, f); _figEditing(); atcPersist(); });" ],
  "C5:fillOff"
);
add(
  [ "    rot.addEventListener('input', function(){ f.rot = parseInt(rot.value, 10) || 0; rv.textContent = f.rot + '°'; refreshFigVisual(fb, f); atcPersist(); });" ],
  [ "    rot.addEventListener('input', function(){ f.rot = parseInt(rot.value, 10) || 0; rv.textContent = f.rot + '°'; refreshFigVisual(fb, f); _figEditing(); atcPersist(); });" ],
  "C6:rot"
);
add(
  [ "    rotZero.addEventListener('click', function(){ f.rot = 0; rot.value = '0'; rv.textContent = '0°'; refreshFigVisual(fb, f); atcPersist(); });" ],
  [ "    rotZero.addEventListener('click', function(){ f.rot = 0; rot.value = '0'; rv.textContent = '0°'; refreshFigVisual(fb, f); _figEditing(); atcPersist(); });" ],
  "C7:rotZero"
);

// ── CHANGE D1 : insertFigureAt appendChild sous __atcApplying ──
add(
  [
    "    if (typeof markChatDirty === 'function') markChatDirty();",
    "    atcPersist();",
    "    box.appendChild(buildFigEl(f));",
  ],
  [
    "    if (typeof markChatDirty === 'function') markChatDirty();",
    "    atcPersist();",
    "    window.__atcApplying = true;",
    "    try { box.appendChild(buildFigEl(f)); } catch(e) {}",
    "    setTimeout(function(){ window.__atcApplying = false; }, 0);",
  ],
  "D1:insertFigureAt"
);

// ── CHANGE D2 : dup appendChild sous __atcApplying ──
add(
  [
    "      msg.shapes.push(nf);",
    "      fb.parentElement.appendChild(buildFigEl(nf));",
    "      if (typeof markChatDirty === 'function') markChatDirty();",
    "      atcPersist();",
  ],
  [
    "      msg.shapes.push(nf);",
    "      window.__atcApplying = true;",
    "      try { fb.parentElement.appendChild(buildFigEl(nf)); } catch(e) {}",
    "      setTimeout(function(){ window.__atcApplying = false; }, 0);",
    "      if (typeof markChatDirty === 'function') markChatDirty();",
    "      atcPersist();",
  ],
  "D2:dup"
);

// ── Application avec vérifications ──
let out = src;
for (const c of changes) {
  const i = out.indexOf(c.from);
  const j = out.lastIndexOf(c.from);
  if (i === -1) { console.error("ECHEC [" + c.label + "] : motif introuvable"); process.exit(1); }
  if (i !== j) { console.error("ECHEC [" + c.label + "] : motif NON UNIQUE (" + (j - i) + ")"); process.exit(1); }
  out = out.slice(0, i) + c.to + out.slice(i + c.from.length);
  console.log("OK  [" + c.label + "] remplacé (" + c.from.length + " -> " + c.to.length + " chars)");
}

// Vérification d'intégrité : aucun LF NU (tout \n doit être précédé de \r).
// Le nombre de \r\n augmente légitimement quand on ajoute des lignes ; seul un
// \n isolé (sans \r) trahirait une corruption de fin de ligne.
const lfAfter = (out.match(/\n/g) || []).length;
const crlfAfter = (out.match(/\r\n/g) || []).length;
const lfBefore = (src.match(/\n/g) || []).length;
const crlfBefore = (src.match(/\r\n/g) || []).length;
console.log("CRLF avant=" + crlfBefore + " apres=" + crlfAfter + " (attendu : +" + (crlfAfter - crlfBefore) + " lignes)");
console.log("LF avant=" + lfBefore + " apres=" + lfAfter);
if (lfAfter !== crlfAfter) {
  console.error("ABORT : LF nu détecté (" + (lfAfter - crlfAfter) + ") — intégrité CRLF compromise");
  process.exit(2);
}

fs.writeFileSync(F, out);
console.log("ÉCRIT : " + F);
console.log("BACKUP : " + BAK);
