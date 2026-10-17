// Outil CI — orchestrateur de SHARD pour les bancs Playwright.
//
// La CI lançait autrefois TOUS les bancs en SÉQUENTIEL : une régression n'était
// signalée qu'à la FIN du parcours (parfois > 40 min). On découpe la liste en
// SHARD_TOTAL tranches et on ne fait tourner que la tranche SHARD_INDEX, pour que
// chaque tranche tourne dans un runner DIFFÉRENT et PARALLÈLE. Un défaut remonte
// dès que SA tranche se termine (≈ durée de la tranche la plus lente / N).
//
// Exclus (et pourquoi) — cohérent avec l'ancien parcours séquentiel :
//   _v457 : voie ffmpeg.wasm abandonnée (Worker cross-origin, cœur 32 Mo)
//   _v441 : exige un serveur Ollama local, absent en CI
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = process.env.THEO_ROOT || process.cwd();
const SHARD_INDEX = parseInt(process.env.SHARD_INDEX || '0', 10);
const SHARD_TOTAL = parseInt(process.env.SHARD_TOTAL || '1', 10);
const PER_BENCH_TIMEOUT = 300; // s — un banc bloqué ne fige pas la CI

// Walker récursif SANS dépendance (glob n'est pas installé en CI).
function listerBancs() {
  const racine = path.join(ROOT, '.workbuddy-ai', 'artifacts');
  const trouves = [];
  const visiter = (dir) => {
    let entrees;
    try { entrees = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entrees) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) visiter(p);
      else if (e.isFile() && /^verify_.*\.js$/.test(e.name)) trouves.push(p);
    }
  };
  // On ne balaie que les dossiers _v4*/_v5* (cohérent avec le filtre d'allumage CI).
  let groupes;
  try { groupes = fs.readdirSync(racine, { withFileTypes: true }); }
  catch { return trouves; }
  for (const g of groupes) {
    if (!g.isDirectory()) continue;
    if (/^_v[456]\d*$/.test(g.name)) visiter(path.join(racine, g.name));
  }
  const exclus = /[\\/]_v457[\\/]|[\\/]_v441[\\/]/;
  return trouves
    .filter(f => !exclus.test(f))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
}

const tout = listerBancs();
const tranche = tout.filter((_, i) => i % SHARD_TOTAL === SHARD_INDEX);

console.log(`SHARD ${SHARD_INDEX + 1}/${SHARD_TOTAL} — ${tranche.length} banc(s) sur ${tout.length} au total.`);

let ok = 0, echecs = 0, ignores = 0;
const lignes = [];
for (const b of tranche) {
  const rel = path.relative(ROOT, b);
  console.log(`───── ${rel}`);
  const t0 = Date.now();
  const lancerBanc = () => spawnSync(process.execPath, [b], {
    cwd: ROOT,
    env: { ...process.env, PY_BIN: process.env.PY_BIN || 'python3' },
    timeout: PER_BENCH_TIMEOUT * 1000,
    encoding: 'utf8',
  });
  let r;
  try {
    r = lancerBanc();
  } catch (e) {
    echecs++;
    console.error(`  ERREUR D'EXÉCUTION — ${e.message}`);
    lignes.push(`### ERREUR D'EXÉCUTION — ${rel}\n\`\`\`\n${e.message}\n\`\`\``);
    continue;
  }
  /* v604 — RELANCE UNIQUE sur échec rapide : les bancs minutés (traces IDB en
     millisecondes, comptages de pagination) peuvent trébucher sous la charge
     des 5 shards PARALLÈLES — échecs qui BOUGENT d'un banc à l'autre d'un run
     à l'autre (v440 puis v537_instrumente, mesuré). Un banc flaky a droit à
     une SECONDE chance ; une vraie régression échoue DEUX fois et bloque.
     Les dépassements de délai ne sont PAS relancés (2 × 300 s = trop long). */
  let relance = false;
  if (r.status !== 0 && r.status !== 77 && r.signal !== 'SIGTERM' && r.status !== null) {
    relance = true;
    console.log('  relance unique (flaky probable sous charge parallèle)…');
    try { r = lancerBanc(); } catch (e) { /* on garde le premier résultat */ }
  }
  const s = ((Date.now() - t0) / 1000).toFixed(0);
  const code = r.status; // null si tué par timeout (SIGTERM → status null, signal 'SIGTERM')
  const last = (r.stdout || '').trim().split('\n').pop() || '(sans sortie)';
  if (code === 0) {
    ok++;
    console.log(`  OK (${s}s)${relance ? ' — flaky, passé à la relance' : ''} — ${last}`);
    lignes.push(`### OK${relance ? ' (flaky — passé à la relance)' : ''} — ${rel}`);
  } else if (code === 77) {
    ignores++;
    console.log(`  IGNORÉ (prérequis absent) — ${last}`);
    lignes.push(`### IGNORÉ — ${rel}`);
  } else if (r.signal === 'SIGTERM' || code === null) {
    echecs++;
    console.error(`  DÉPASSEMENT DE DÉLAI (${PER_BENCH_TIMEOUT} s) — banc bloqué`);
    /* v604 — sur timeout aussi, imprimer la fin du stdout : sans elle, on ne
       sait PAS où le banc pendait (section sans sortie). */
    const outT = (r.stdout || '').trim().split('\n').slice(-15).join('\n');
    if (outT) console.error('    ── 15 dernières lignes du banc :\n' + outT.split('\n').map(l => '    ' + l).join('\n'));
    lignes.push(`### DÉPASSEMENT DE DÉLAI (${PER_BENCH_TIMEOUT} s) — ${rel}\n\`\`\`\n${outT}\n\`\`\``);
  } else {
    echecs++;
    const err = (r.stderr || '').trim().split('\n').slice(-10).join('\n');
    console.error(`  ÉCHEC (code ${code}) — ${last}`);
    /* v604 — imprimer aussi la fin du STDOUT : les assertions [ECHEC] des bancs
       y sont, et sans elles un échec CI est indéboguable (le rapport de shard
       n'était lisible nulle part). */
    const out15 = (r.stdout || '').trim().split('\n').slice(-15).join('\n');
    if (out15) console.error('    ── 15 dernières lignes du banc :\n' + out15.split('\n').map(l => '    ' + l).join('\n'));
    if (err) console.error('    ── stderr :\n' + err.split('\n').map(l => '    ' + l).join('\n'));
    lignes.push(`### ÉCHEC (code ${code}) — ${rel}\n\`\`\`\n${last}\n${out15}\n${err}\n\`\`\``);
  }
}

const resume = `**Shard ${SHARD_INDEX + 1}/${SHARD_TOTAL} : ${ok} réussi(s), ${ignores} ignoré(s), ${echecs} en échec.**`;
console.log('───────── ' + resume);
fs.writeFileSync(path.join(ROOT, 'rapport_shard_' + SHARD_INDEX + '.md'), resume + '\n\n' + lignes.join('\n'));

process.exit(echecs === 0 ? 0 : 1);
