/* v98 — quelles descriptions du panneau References contiennent une citation
   de verset ? Sert a savoir si le correctif a de la matiere a baliser, ou si
   le panneau est simplement pauvre en citations (auquel cas le correctif est
   inutile et il faut le dire). */
'use strict';
const fs = require('fs');
const s = fs.readFileSync(process.argv[2] || 'THEOLOGICUS.html', 'utf8');
const i = s.indexOf('THEO_REFS_DATA');
const j = s.indexOf('function initReferencesPanel');
const blk = s.slice(i, j);
const re = /desc:\s*"((?:[^"\\]|\\.)*)"/g;
const descs = [];
let m;
while ((m = re.exec(blk))) descs.push(m[1]);
console.log('descriptions trouvees : ' + descs.length + '\n');
descs.forEach(d => console.log('  - ' + d));
console.log('\n--- celles contenant un chiffre ---');
const num = descs.filter(d => /\d/.test(d));
console.log('nombre : ' + num.length);
num.forEach(d => console.log('  * ' + d));
console.log('\n--- celles qui seraient balisees par la regex biblique ---');
const bRefRe = /\b(?:(\d+)\s+)?(Gn|Ex|Lv|Nb|Dt|Jos|Jg|Rt|1S|2S|1R|2R|1Ch|2Ch|Es|Ne|Et|Jb|Ps|Pr|Ec|Ct|Is|Jr|Lm|Ez|Dn|Os|Jl|Am|Ab|Jo|Mi|Na|Ha|So|Ag|Za|Ml|Mt|Mc|Lc|Jn|Ac|Rm|1Co|2Co|Ga|Ep|Ph|Col|1Th|2Th|1Tm|2Tm|Tt|Phm|He|Jc|1P|2P|1Jn|2Jn|3Jn|Jd|Ap|Matthieu|Marc|Luc|Jean|Actes|Romains|Psaume|Proverbes|Isaie|Ésaïe|Jérémie)\b\.?\s*(\d+[:.,]\d+(?:-\d+)?)/gi;
let n = 0;
num.forEach(d => { bRefRe.lastIndex = 0; const mm = bRefRe.exec(d); if (mm) { n++; console.log('  >> ' + d + '   ==> ' + mm[0]); } });
console.log('nombre : ' + n);
