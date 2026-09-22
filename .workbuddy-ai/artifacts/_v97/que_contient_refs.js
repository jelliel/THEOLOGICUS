/* v98 — que contient REELLEMENT le panneau References ?
   Objectif : decider si le cablage des citations a de la matiere, ou si le
   correctif doit etre retire. On lit les donnees, on ne suppose rien. */
'use strict';
const fs = require('fs');
const s = fs.readFileSync(process.argv[2] || 'THEOLOGICUS.html', 'utf8');
const i = s.indexOf('THEO_REFS_DATA');
const j = s.indexOf('function initReferencesPanel');
const blk = s.slice(i, j);

const noms = [];
const re = /name:\s*"((?:[^"\\]|\\.)*)"/g;
let m;
while ((m = re.exec(blk))) noms.push(m[1]);
console.log('=== NOMS DE DOCUMENTS (' + noms.length + ') ===');
noms.forEach(n => console.log('  ' + n));

console.log('\n=== champ "fathers" present ? ===');
const faths = [];
const re2 = /fathers:\s*"([^"]*)"/g;
while ((m = re2.exec(blk))) faths.push(m[1]);
console.log('documents relies a un corpus Patristique : ' + faths.length);

/* Y a-t-il des references bibliques dans les NOMS (pas les descriptions) ? */
const bRef = /\b(\d+\s+)?(Gn|Ex|Lv|Nb|Dt|Jos|Jg|Rt|1S|2S|1R|2R|1Ch|2Ch|Es|Ne|Et|Jb|Ps|Pr|Ec|Ct|Is|Jr|Lm|Ez|Dn|Os|Jl|Am|Ab|Jo|Mi|Na|Ha|So|Ag|Za|Ml|Mt|Mc|Lc|Jn|Ac|Rm|1Co|2Co|Ga|Ep|Ph|Col|1Th|2Th|1Tm|2Tm|Tt|Phm|He|Jc|1P|2P|1Jn|2Jn|3Jn|Jd|Ap|Matthieu|Marc|Luc|Jean|Actes|Romains|Psaume|Proverbes|Ésaïe|Jérémie)\.?\s*(\d+[:.,]\d+)/gi;
const dansNoms = noms.filter(n => { bRef.lastIndex = 0; return bRef.test(n); });
console.log('\n=== NOMS contenant une citation biblique ===');
console.log('nombre : ' + dansNoms.length);
dansNoms.forEach(n => console.log('  >> ' + n));

/* et dans les descriptions ? */
const descs = [];
const re3 = /desc:\s*"((?:[^"\\]|\\.)*)"/g;
while ((m = re3.exec(blk))) descs.push(m[1]);
const dansDesc = descs.filter(d => { bRef.lastIndex = 0; return bRef.test(d); });
console.log('\ndescriptions contenant une citation biblique : ' + dansDesc.length);

/* la categorie "autres" contient-elle des entrees hors THEO_REFS_DATA ? */
console.log('\n=== categories presentes ===');
const cats = new Set();
const re4 = /cat:\s*"([^"]*)"/g;
while ((m = re4.exec(blk))) cats.add(m[1]);
console.log(Array.from(cats).join(', '));
