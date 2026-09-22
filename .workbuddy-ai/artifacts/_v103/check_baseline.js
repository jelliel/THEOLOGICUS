/* Compare la syntaxe des blocs <script> de la VERSION COMMITTEE (HEAD) et de la
   version en cours d'edition, pour savoir si une erreur est pre-existante ou
   introduite par la retouche en cours. */
'use strict';
const fs = require('fs');
const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

function analyse(src, etiquette) {
  let m, n = 0, bad = 0;
  const errs = [];
  re.lastIndex = 0;
  while ((m = re.exec(src)) !== null) {
    const attrs = m[1] || '', code = m[2] || '';
    if (/\bsrc\s*=/i.test(attrs) || !code.trim()) continue;
    n++;
    const line = src.slice(0, m.index).split('\n').length;
    try { new Function(code); }
    catch (e) { bad++; errs.push('ligne ' + line + ' : ' + e.message); }
  }
  console.log(etiquette + ' -> blocs ' + n + ', ERREURS ' + bad);
  errs.forEach(e => console.log('     ' + e));
  return bad;
}

const courant = fs.readFileSync(path.join(ROOT, 'THEOLOGICUS.html'), 'utf8');
const base = execFileSync('git', ['show', 'HEAD:THEOLOGICUS.html'], { cwd: ROOT, maxBuffer: 1 << 28 }).toString();

const bBase = analyse(base, 'VERSION COMMITTEE (HEAD)');
const bCour = analyse(courant, 'VERSION EN COURS D EDITION');

console.log('');
if (bBase === bCour) {
  console.log('VERDICT : identique -> l erreur est PRE-EXISTANTE, pas introduite par la retouche.');
} else if (bBase > bCour) {
  console.log('VERDICT : la retouche a CORRIGE des erreurs (' + bBase + ' -> ' + bCour + ').');
} else {
  console.log('VERDICT : la retouche a INTRODUIT des erreurs (' + bBase + ' -> ' + bCour + ').');
}
