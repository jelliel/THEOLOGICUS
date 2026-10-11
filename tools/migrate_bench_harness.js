// Outil de migration Axe 4 (lot R1b) — THEOLOGICUS.
//
// Roule l'outillage partagé tools/bench_common.js sur les bancs Playwright
// autonomes (ceux qui réimplémentaient tuerPort/assurerRelais/relaisVit en
// dur). La transformation est VOLONTAIREMENT MINIMALE et STRUCTURE-PRÉSERVANTE :
//   • on ne touche PAS au plumbing de port (PORT/BASE/EP) ni au lancement du
//     navigateur ni aux assertions ;
//   • on remplace SEULEMENT le démarrage/arrêt du relais :
//       tuerPort + assurerRelais  ->  H.spawnRelay({ port: PORT })  (arrêt par PID)
//       relais.kill()             ->  H.killRelay(relais)
//   ce qui supprime le code mort Windows (netstat/findstr/taskkill) et la course
//   de tuerPort (qui tuait le relais d'un AUTRE banc en exécution parallèle).
//
// Les bancs qui isolent le magasin (LOCALAPPDATA/STORE_DIR/THEO_STORE) sont
// VOLONTAIREMENT IGNORÉS ici (traitement manuel : ils ont besoin des options
// localAppData/storeMaxBytes de spawnRelay).
//
// Usage : node tools/migrate_bench_harness.js [--apply]
//   sans --apply : dry-run (affiche ce qui serait changé, n'écrit rien).

'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const APPLY = process.argv.includes('--apply');

// Découvre les bancs autonomes (tuerPort + assurerRelais) dans _v4* / _v5*.
function decouvrir() {
  const racine = path.resolve(__dirname, '..');
  const artifacts = path.join(racine, '.workbuddy-ai', 'artifacts');
  const trouves = [];
  for (const sub of fs.readdirSync(artifacts)) {
    if (!/^_v[45]/.test(sub)) continue;
    const sd = path.join(artifacts, sub);
    if (!fs.statSync(sd).isDirectory()) continue;
    for (const f of fs.readdirSync(sd)) {
      if (/^verify_.*\.js$/.test(f)) trouves.push(path.join(sd, f));
    }
  }
  return trouves
    .filter(f => fs.readFileSync(f, 'utf8').includes('function tuerPort(port)'))
    .filter(f => fs.readFileSync(f, 'utf8').includes('async function assurerRelais'));
}

// Retire le bloc commençant à la ligne contenant `startMarker` jusqu'à son
// accolade fermante (comptage de profondeur), renvoyant les nouvelles lignes.
function retirerBloc(lines, startMarker) {
  const start = lines.findIndex(l => l.includes(startMarker));
  if (start === -1) return lines;
  let depth = 0, ended = -1;
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) { if (ch === '{') depth++; else if (ch === '}') depth--; }
    if (depth === 0) { ended = i; break; }
  }
  if (ended === -1) throw new Error('bloc non fermé pour ' + startMarker);
  // Retire [start..ended] puis les lignes vides consécutives superflues.
  const out = lines.slice(0, start).concat(lines.slice(ended + 1));
  return out;
}

function transform(content) {
  let lines = content.split(/\r?\n/);
  const problems = [];

  if (content.includes('LOCALAPPDATA') || content.includes('THEO_STORE') || content.includes('STORE_DIR')) {
    return { skip: true, reason: 'isole le magasin (LOCALAPPDATA/STORE) — traitement manuel', lines };
  }
  if (!lines.some(l => l.includes('if (!await assurerRelais())'))) {
    return { skip: true, reason: 'appel assurerRelais introuvable', lines };
  }
  if (lines.some(l => l.includes("require('../../../tools/bench_common.js')") || l.includes('require("../../../tools/bench_common.js")'))) {
    return { skip: true, reason: 'déjà migré', lines };
  }
  // Alias : éviter la collision si le banc déclare déjà un `H` (ex. v537).
  const alias = /(?:const|let|var|function)\s+H\b/.test(content) ? 'BHC' : 'H';

  // 1) insérer le require du harnais juste après la ligne `require(...playwright)`.
  const idxChromium = lines.findIndex(l => /require\(["']playwright["']\)/.test(l));
  if (idxChromium === -1) return { skip: true, reason: 'require playwright introuvable', lines };
  lines.splice(idxChromium + 1, 0, `const ${alias} = require('../../../tools/bench_common.js');`);

  // 2) retirer les blocs de relais en dur.
  lines = retirerBloc(lines, 'function tuerPort(port) {');
  if (lines.some(l => l.includes('async function relaisVit()'))) lines = retirerBloc(lines, 'async function relaisVit()');
  lines = retirerBloc(lines, 'async function assurerRelais() {');

  // 3) remplacer l'appel assurerRelais() par spawnRelay + garde.
  //    Deux formes possibles : tout sur une ligne, ou bloc multi-lignes
  //    (le `}` fermant sur une ligne suivante).
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('if (!await assurerRelais())')) {
      const garde = "if (!relais.child || relais.child.exitCode !== null) { console.log(\"\\nRelais injoignable.\"); process.exit(2); }";
      if (lines[i].includes('Relais injoignable')) {
        // forme mono-ligne : on remplace toute la ligne par les deux lignes.
        lines[i] = `relais = await ${alias}.spawnRelay({ port: PORT });\n` + garde;
      } else {
        // forme multi-lignes : on retire tout le bloc (i .. accolade fermante).
        let depth = 0, end = i;
        for (let j = i; j < lines.length; j++) {
          for (const ch of lines[j]) { if (ch === '{') depth++; else if (ch === '}') depth--; }
          if (depth === 0) { end = j; break; }
        }
        lines.splice(i, end - i + 1, `relais = await ${alias}.spawnRelay({ port: PORT });`, garde);
      }
      break;
    }
  }

  // 4) remplacer relais.kill( par <alias>.killRelay(relais)
  lines = lines.map(l => l.replace(/relais\.kill\(/g, alias + '.killRelay(relais'));

  // 5) normaliser les double-lignes vides superflues (max 1).
  const out = [];
  for (const l of lines) {
    if (l.trim() === '' && out.length && out[out.length - 1].trim() === '') continue;
    out.push(l);
  }
  return { skip: false, lines: out };
}

// ── exécution ────────────────────────────────────────────────────────────
const fichiers = decouvrir();
let faits = 0, ignores = 0, manuels = [];
for (const f of fichiers) {
  const content = fs.readFileSync(f, 'utf8');
  const r = transform(content);
  const nom = path.basename(f);
  if (r.skip) {
    ignores++;
    if (/isole le magasin/.test(r.reason)) manuels.push(nom);
    if (!APPLY) console.log(`  ⏭  ${nom} — ignoré : ${r.reason}`);
    continue;
  }
  const nouveau = r.lines.join('\n');
  if (APPLY) {
    fs.writeFileSync(f, nouveau);
    // vérification de syntaxe
    try { execSync(`node --check "${f}"`, { stdio: 'ignore' }); faits++; }
    catch (e) { console.log(`  ❌ ${nom} — erreur de syntaxe après migration !`); }
  } else {
    faits++;
    console.log(`  ✅ ${nom} — migré (dry-run)`);
  }
}
console.log(`\n${APPLY ? 'APPLIQUÉ' : 'DRY-RUN'} : ${faits} migrés, ${ignores} ignorés.`);
if (manuels.length) console.log(`  À traiter manuellement (magasin isolé) : ${manuels.join(', ')}`);
