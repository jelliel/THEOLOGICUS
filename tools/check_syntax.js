/* Verifie la syntaxe de chaque <script> inline de THEOLOGICUS.html.
 * Un seul bloc casse rend toute l'app muette : ce controle doit passer AVANT
 * toute compilation d'APK.
 * Usage : node tools/check_syntax.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const file = path.resolve(__dirname, '..', 'THEOLOGICUS.html');
const src = fs.readFileSync(file, 'utf8');

const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
let m, n = 0, bad = 0, skipped = 0;

while ((m = re.exec(src)) !== null) {
  const attrs = m[1] || '';
  const code = m[2] || '';
  if (/\bsrc\s*=/i.test(attrs)) { skipped++; continue; }
  if (!code.trim()) { skipped++; continue; }
  n++;
  const line = src.slice(0, m.index).split('\n').length;
  try {
    new Function(code);
  } catch (e) {
    bad++;
    console.log('ERREUR ligne ' + line + ' : ' + e.message);
    const lines = code.split('\n');
    console.log('   bloc de ' + lines.length + ' lignes, debut : ' + lines[0].trim().slice(0, 70));
  }
}

console.log('blocs inline analyses : ' + n + '   ignores (src/vide) : ' + skipped);
console.log(bad === 0 ? 'syntaxe : OK (0 erreur)' : 'syntaxe : ' + bad + ' ERREUR(S)');
process.exit(bad === 0 ? 0 : 1);
