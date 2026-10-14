/* Répare les esc() cassés : .replace(/"/g, """)  →  .replace(/"/g, """) */
const fs = require('fs');
const F = 'C:/tmp/theoverify/THEOLOGICUS.html';
let s = fs.readFileSync(F, 'utf8');
const D = String.fromCharCode(34);                       /* guillemet droit */
const AMPS = '&' + 'quot' + ';';                          /* l'entité " */
if (AMPS.indexOf('quot') === -1) { console.error('gardien entité'); process.exit(1); }
const casse = '.replace(/' + D + '/g, ' + D + D + D + ')';
const bon = '.replace(/' + D + '/g, ' + D + AMPS + D + ')';
if (casse === bon) { console.error('gardien : casse == bon'); process.exit(1); }
if (bon.indexOf('quot') === -1) { console.error('gardien : bon sans entité'); process.exit(1); }
const n = s.split(casse).length - 1;
if (n !== 3) { console.error('occurrences cassees : ' + n); process.exit(1); }
s = s.split(casse).join(bon);
if (/(?<!\r)\n/.test(s)) { console.error('LF seuls introduits'); process.exit(1); }
fs.writeFileSync(F, s, 'utf8');
console.log('esc() repare x3 : ' + JSON.stringify(casse) + ' -> ' + JSON.stringify(bon));
