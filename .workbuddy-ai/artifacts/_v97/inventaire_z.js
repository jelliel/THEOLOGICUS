/* Inventaire des z-index numeriques : sert a decider ce qui doit entrer
   dans l'echelle --z-* et ce qui est legitimement un modal. */
'use strict';
const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'THEOLOGICUS.html', 'utf8').split('\n');
const re = /z-index:\s*(\d{4,})/;
const hits = [];
src.forEach((l, i) => { const m = re.exec(l); if (m) hits.push({ l: i + 1, z: parseInt(m[1], 10), t: l.trim().slice(0, 100) }); });
hits.sort((a, b) => b.z - a.z);
console.log('declarations numeriques >= 1000 : ' + hits.length);
hits.forEach(h => console.log(String(h.z).padStart(7) + '  l.' + String(h.l).padStart(6) + '  ' + h.t));
