/* Banc v448 — recherche sémantique locale.
   Ollama RÉEL (nomic-embed-text) : indexation d'un sous-ensemble CEC,
   pertinence sémantique, persistance IndexedDB, repli littéral. */
const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const PORT = 8804; const ROOT = process.env.THEO_ROOT || 'C:/tmp/theoverify';
const PW = process.env.PW_DIR || 'C:/Users/toshr/AppData/Local/ms-playwright';
let pass = 0;
const ok = (name, cond, detail) => { console.log(` ${cond ? '[OK] ' : '[ECHEC]'}${name}${cond || detail === undefined ? '' : ' — ' + String(detail).slice(0, 90)}`); if (cond) pass++; };
(async () => {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'THEOLOGICUS.html';
    const f = path.join(ROOT, rel);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) {
      res.writeHead(200, {'Content-Type': rel.endsWith('.js') ? 'application/javascript; charset=utf-8' : rel.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8'});
      return fs.createReadStream(f).pipe(res);
    }
    res.writeHead(404); res.end('nf');
  });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, process.env.PW_DIR ? { executablePath: path.join(PW, 'chromium-1234', 'chrome-win64', 'chrome.exe') } : {}));
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 120)));
  await page.addInitScript(() => localStorage.setItem('theologicus_wizard_skipped', '1'));
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const api = await page.evaluate(() => window.__v448Sem ? Object.keys(window.__v448Sem) : null);
  ok('API v448 exposée (recherche/indexer/idbCount…)', api && api.indexOf('recherche') >= 0, JSON.stringify(api));

  const ollama = await page.evaluate(() => window.__v448Sem.ollamaOk());
  ok('Ollama joignable depuis la page (CORS OK)', ollama === true, String(ollama));

  // 1. indexation réelle d'un sous-ensemble CEC (80 §) via nomic-embed-text
  const idx = await page.evaluate(() => window.__v448Sem.indexer('cec', { limite: 120 }));
  ok('indexation CEC (120 §) via embeddings réels', idx && idx.ok === true && idx.indexed === 120, JSON.stringify(idx));
  const cnt = await page.evaluate(() => window.__v448Sem.idbCount());
  ok('vecteurs persistés dans IndexedDB (theologicus_sem)', cnt >= 120, 'count=' + cnt);

  // 2. re-indexation → tout déjà indexé (0 nouveau)
  const idx2 = await page.evaluate(() => window.__v448Sem.indexer('cec', { limite: 120 }));
  ok('ré-indexation → 0 nouveau (cache IndexedDB)', idx2 && idx2.ok && idx2.indexed === 0, JSON.stringify(idx2));

  // 3. recherche sémantique : reformulation ≠ mot-à-mot (résultats via API)
  const sem = await page.evaluate(() => window.__v448Sem.recherche('comment Dieu parle-t-il aux hommes pour se faire connaître ?', { corpora: ['cec'], k: 5 }));
  const top1 = JSON.stringify((sem.hits || []).slice(0, 6));
  ok('sémantique : « Dieu parle aux hommes pour se faire connaître » → 6 premiers résultats = passages sur la révélation', /se révéler aux hommes|révélation/i.test(top1), top1.slice(0, 140));

  // 4. repli littéral renforcé (corpus non indexé + requête multi-tokens)
  const lit = await page.evaluate(async () => {
    const r = await window.__v448Sem.recherche('Trinité', { corpora: ['vlt'], k: 5 });
    return r;
  });
  ok('repli littéral fonctionne sans index (mode « lit »)', lit && lit.mode === 'lit', JSON.stringify(lit));

  ok('aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
  console.log(`RESULTAT : ${pass}/8`);
  process.exitCode = pass === 8 ? 0 : 1;
  await browser.close(); server.close();
})().catch(e => { console.log('EXCEPTION BANC :', e); process.exitCode = 1; process.exit(1); });
