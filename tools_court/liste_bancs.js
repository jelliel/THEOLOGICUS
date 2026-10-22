/* Générateur de liste de bancs — même filtre que tools/bancs_shard.js,
   mais SANS spawnSync (EBUSY dans ce bac à sable). */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.env.THEO_ROOT || process.cwd();
const racine = path.join(ROOT, '.workbuddy-ai', 'artifacts');
const trouves = [];
const visiter = (dir) => {
  let entrees;
  try { entrees = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
  for (const e of entrees) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) visiter(p);
    else if (e.isFile() && /^verify_.*\.js$/.test(e.name)) trouves.push(p);
  }
};
let groupes;
try { groupes = fs.readdirSync(racine, { withFileTypes: true }); } catch (e) { groupes = []; }
for (const g of groupes) {
  if (!g.isDirectory()) continue;
  if (/^_v[456]\d*$/.test(g.name)) visiter(path.join(racine, g.name));
}
const exclus = /[\\/]_v457[\\/]|[\\/]_v441[\\/]/;
const out = trouves.filter(f => !exclus.test(f))
  .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
fs.writeFileSync(path.join(ROOT, 'liste_bancs.txt'), out.map(f => path.relative(ROOT, f)).join('\n') + '\n');
console.log(out.length + ' bancs listes');
