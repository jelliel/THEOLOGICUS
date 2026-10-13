/* v572ter — micro en contexte non sécurisé : message précis (localhost exigé). */
const fs = require('fs');
const F = 'C:/tmp/theoverify/THEOLOGICUS.html';
let src = fs.readFileSync(F, 'utf8');
if ((src.match(/(?<!\r)\n/g) || []).length > 0) { console.error('FATAL : LF seuls avant édition'); process.exit(1); }

function remplacer(titre, oldLines, newLines) {
  const oldStr = oldLines.join('\r\n');
  const newStr = newLines.join('\r\n');
  const n = src.split(oldStr).length - 1;
  if (n !== 1) { console.error('FATAL [' + titre + '] : ancrage trouvé ' + n + ' fois'); process.exit(1); }
  src = src.replace(oldStr, () => newStr);
  console.log('OK  ' + titre);
}

/* ═══ 1. capter — garde contexte sécurisé AVANT getUserMedia ═══ */
remplacer('v571.capter — garde contexte sécurisé (T1)',
[
'  async function capter() {',
'    try {',
'      tampons = []; echantillons = 0; parle = false; silence = 0;',
'      flux = await navigator.mediaDevices.getUserMedia({ audio: true });'
],
[
'  async function capter() {',
'    try {',
'      tampons = []; echantillons = 0; parle = false; silence = 0;',
'      if (!navigator.mediaDevices || !window.isSecureContext) {',
'        /* v572ter — TypeError typique : contexte NON sécurisé (adresse LAN',
'           http://192.168.x.x ou 0.0.0.0) -> navigator.mediaDevices n\\\'existe',
'           pas. Le micro exige localhost (ou https) — message qui dit quoi',
'           faire au lieu d\\\'un « autorisez l\\\'accès » hors-sujet. */',
'        toast("🎙️ Micro indisponible : l\\\'adresse « " + location.origin + " » n\\\'est pas sécurisée. Sur l\\\'ordinateur serveur, ouvrez http://localhost:" + (location.port || "8765") + " — depuis un autre appareil, le micro exige HTTPS.", "error");',
'        dicteeArreter(true);',
'        return false;',
'      }',
'      flux = await navigator.mediaDevices.getUserMedia({ audio: true });'
]);

/* ═══ 2. capter — le catch affiche le message réel de l'erreur ═══ */
remplacer('v571.capter — catch avec message réel (T2)',
[
'      toast("🎙️ Micro indisponible (" + (e && e.name || e) + ") — autorisez l\\\'accès au micro", "error");'
],
[
'      toast("🎙️ Micro indisponible (" + (e && e.name || e) + (e && e.message ? " : " + String(e.message).slice(0, 90) : "") + ") — autorisez l\\\'accès au micro", "error");'
]);

/* ═══ contrôles ═══ */
if ((src.match(/(?<!\r)\n/g) || []).length > 0) { console.error('FATAL : LF seuls introduits'); process.exit(1); }
if (src.indexOf('est pas sécurisée') === -1) { console.error('FATAL : marqueur absent'); process.exit(1); }
const a2 = src.indexOf('<script id="v571-adeodat-v3g">');
const f2 = src.indexOf('</script>', a2);
try { new Function(src.slice(a2 + 32, f2)); console.log('SYNTAXE OK v571-adeodat-v3g'); }
catch (e) { console.error('FATAL : syntaxe v571 : ' + e.message); process.exit(1); }
fs.writeFileSync(F, src, 'utf8');
console.log('ÉCRIT. Taille : ' + src.length);
