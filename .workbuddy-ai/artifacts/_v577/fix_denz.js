/* v577 — Denzinger : le JSON parsé est l'ŒUVRE elle-même ({id,a,t,u,c}),
   pas {« dz_xxx » : œuvre}. Gérer les deux formes. */
const fs = require('fs');
const F = 'C:/tmp/theoverify/THEOLOGICUS.html';
let src = fs.readFileSync(F, 'utf8');
if (/(?<!\r)\n/.test(src)) { console.error('LF seuls présents — abort'); process.exit(1); }
const M574 = 'v574-adeodat-v3i';
const deb = src.indexOf('<script id="' + M574 + '">');
if (deb === -1) { console.error('module v574 introuvable'); process.exit(1); }
let fin = src.indexOf('<script id=', deb + 10);
const finBody = src.indexOf('</body>', deb);
if (fin === -1 || (finBody !== -1 && finBody < fin)) fin = finBody;
const avant = src.slice(0, deb), milieu = src.slice(deb, fin), apres = src.slice(fin);

function lignes(a) { return a.join('\r\n'); }
const anc = lignes([
  '                const j = JSON.parse(t.slice(pos + 1).replace(/;\\s*$/, ""));',
  '                Object.keys(j).forEach(function (k) {',
  '                  const w = j[k]; if (!w) return;',
  '                  (w.c || []).forEach(function (ch) {',
  '                    (ch.s || []).forEach(function (se) {',
  '                      (se.p || []).forEach(function (p) {',
  '                        if (typeof p === "string" && p.length > 20) docs.push({ ref: (w.t || k) + " §" + (se.t || ""), texte: p });',
  '                      });',
  '                    });',
  '                  });',
  '                });'
]);
const nouv = lignes([
  '                const j = JSON.parse(t.slice(pos + 1).replace(/;\\s*$/, ""));',
  '                /* le JSON peut être l’œuvre DIRECTE ({id,a,t,u,c}) ou un dict {dz_xxx: œuvre} */',
  '                const works = (j && j.c) ? [j] : Object.keys(j || {}).map(function (k) { return j[k]; }).filter(function (w2) { return w2 && w2.c; });',
  '                works.forEach(function (w) {',
  '                  (w.c || []).forEach(function (ch) {',
  '                    (ch.s || []).forEach(function (se) {',
  '                      (se.p || []).forEach(function (p) {',
  '                        if (typeof p === "string" && p.length > 20) docs.push({ ref: (w.t || "Denzinger") + " §" + (se.t || ""), texte: p });',
  '                      });',
  '                    });',
  '                  });',
  '                });'
]);
const n = milieu.split(anc).length - 1;
if (n !== 1) { console.error('ANCRAGE trouvé ' + n + ' fois'); process.exit(1); }
src = avant + milieu.replace(anc, () => nouv) + apres;
if (/(?<!\r)\n/.test(src)) { console.error('LF seuls introduits'); process.exit(1); }
fs.writeFileSync(F, src, 'utf8');
console.log('  ✓ loader Denzinger réparé (œuvre directe ou dictionnaire)');
