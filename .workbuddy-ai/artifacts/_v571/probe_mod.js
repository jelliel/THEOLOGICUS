/* sonde 2 : écrit le module généré dans un fichier et lance node --check */
const fs = require('fs');
const cp = require('child_process');
const src = fs.readFileSync('C:/tmp/theoverify/.workbuddy-ai/artifacts/_v571/apply_edits_v571.js', 'utf8');
const deb = src.indexOf('const MOD = [');
const fin = src.indexOf('\n];\nconst ancre', deb);
const MOD = eval(src.slice(deb + 'const MOD = '.length + 0, fin + 2));
const js = MOD.join('\r\n');
/* retire la balise ouvrante (1re ligne) et </script> (dernière ligne) */
const sansBalises = js.split('\r\n').slice(1, -2).join('\r\n');
fs.writeFileSync('C:/tmp/theoverify/.workbuddy-ai/artifacts/_v571/module_extrait.js', sansBalises, 'utf8');
const r = cp.spawnSync('C:/Users/toshr/.workbuddy-ai/binaries/node/versions/22.22.2-6/node.exe', ['--check', 'C:/tmp/theoverify/.workbuddy-ai/artifacts/_v571/module_extrait.js'], { encoding: 'utf8' });
console.log('status', r.status);
console.log(r.stderr || 'OK');
