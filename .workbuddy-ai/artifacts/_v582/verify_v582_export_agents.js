/* ═══════════════════════════════════════════════════════════════════════
   Banc v582 — EXPORT DES AGENTS THÉOLOGIQUES (🎓 AGENTS) :
   le panneau propose « ⬇ Exporter les N (JSON) » ; le fichier téléchargé
   est au FORMAT DES AGENTS UTILISATEURS (importable via « Importer un
   agent » : name + desc obligatoires), 20 entrées, Exégète/Patristique
   inclus avec instructions complètes. ═════════════════════════════════ */
const H = require('../../../tools/bench_common.js');
const { chromium } = require('playwright');
const path = require('path'), os = require('os'), fs = require('fs');

const resultats = [];
function section(t) { console.log('\n■ ' + t); }
function ok(label, cond, detail) {
  resultats.push({ label, pass: !!cond });
  console.log((cond ? '  [OK]   ' : '  [ECHEC]') + ' ' + label + (detail ? ' — ' + detail : ''));
}

(async () => {
  const port = await H.pickFreePort();
  const STORE_DIR = path.join(os.tmpdir(), 'theo_v582_store_' + Date.now());
  try { fs.mkdirSync(STORE_DIR, { recursive: true }); } catch (e) {}
  const relais = await H.spawnRelay({ port, localAppData: STORE_DIR });
  const BASE = 'http://127.0.0.1:' + port + '/THEOLOGICUS.html';
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const bruit = [];
  page.on('pageerror', e => bruit.push(String(e)));
  await page.addInitScript(H.isolationInit);
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);

  /* ── 1. panneau 🎓 ouvert + bouton présent ── */
  section('1. Panneau 🎓 AGENTS : bouton d’export présent');
  await page.evaluate(() => { const b = document.getElementById('open-presets'); if (b) b.click(); });
  await page.waitForFunction(() => {
    const p = document.getElementById('v527-panel');
    return p && p.classList.contains('open') && !!document.getElementById('v527-export');
  }, null, { timeout: 10000 });
  const btn = await page.evaluate(() => document.getElementById('v527-export').textContent);
  ok('le bouton « ⬇ Exporter les N (JSON) » est dans le panneau', /Exporter les \d+ \(JSON\)/.test(btn), btn);
  const nPresets = await page.evaluate(() => (window.__v527Agents && window.__v527Agents.presets || []).length);
  ok('le libellé annonce le bon nombre (' + nPresets + ')', btn.indexOf(String(nPresets)) !== -1, btn);

  /* ── 2. clic → téléchargement → contenu ── */
  section('2. Clic : téléchargement JSON importable');
  const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
  await page.evaluate(() => document.getElementById('v527-export').click());
  const download = await downloadPromise;
  ok('un téléchargement est déclenché', !!download);
  const nomFichier = download.suggestedFilename();
  ok('nom du fichier : agents-theologiques-theologicus.json', nomFichier === 'agents-theologiques-theologicus.json', nomFichier);
  const chemin = path.join(os.tmpdir(), 'theo_v582_export_' + Date.now() + '.json');
  await download.saveAs(chemin);
  const data = JSON.parse(fs.readFileSync(chemin, 'utf8'));
  ok('le JSON contient ' + nPresets + ' agents', Array.isArray(data) && data.length === nPresets, 'n=' + data.length);
  ok('schéma compatible « Importer un agent » (name + desc partout)',
     data.every(a => a.name && a.desc));
  ok('instructions complètes partout', data.every(a => typeof a.instructions === 'string' && a.instructions.length > 40));
  ok('champs techniques présents (temperature, maxTokens, style, forbidden, memPrio)',
     data.every(a => typeof a.temperature === 'number' && a.maxTokens === 4096 && !!a.style && !!a.forbidden && a.memPrio === 3));
  const exegete = data.find(a => a.name === 'Exégète');
  ok('l’agent « Exégète » est dans l’export avec sa méthode', !!exegete && /exégèse|texte/i.test(exegete.instructions), exegete ? exegete.instructions.slice(0, 60) : '(absent)');
  ok('la source est marquée « theologicus-preset »', data.every(a => a.source === 'theologicus-preset'));

  /* ── 3. propreté ── */
  section('3. Propreté');
  ok('aucune erreur JavaScript', bruit.length === 0, bruit.slice(0, 2).join(' | '));

  await browser.close();
  try { await H.killRelay(relais); } catch (e) {}

  const bons = resultats.filter(r => r.pass).length;
  console.log('\n========================================================================');
  console.log('RESULTAT : ' + bons + '/' + resultats.length);
  if (bons !== resultats.length) {
    console.log('Échecs :');
    resultats.filter(r => !r.pass).forEach(r => console.log('  - ' + r.label));
    process.exit(1);
  }
})().catch(e => { console.error('EXCEPTION :', e); process.exit(2); });
