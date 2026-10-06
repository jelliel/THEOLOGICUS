/* Banc v460 — « Aucune vidéo » doit dire POURQUOI.
   Vérifie la traduction des causes (401/429/400/réseau) puis, en conditions
   réelles, que le résumé et le toast annoncent la cause dominante. */
const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const PORT = 8903; const ROOT = 'C:/tmp/theoverify';
const PW = 'C:/Users/toshr/AppData/Local/ms-playwright';
let pass = 0;
const ok = (name, cond, detail) => { console.log(` ${cond ? '[OK] ' : '[ECHEC]'}${name}${cond || detail === undefined ? '' : ' — ' + String(detail).slice(0, 105)}`); if (cond) pass++; };
(async () => {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'ai-video.html';
    const f = path.join(ROOT, rel);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) { res.writeHead(200, { 'Content-Type': rel.endsWith('.js') ? 'application/javascript; charset=utf-8' : 'text/html; charset=utf-8' }); return fs.createReadStream(f).pipe(res); }
    res.writeHead(404); res.end('nf');
  });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: path.join(PW, 'chromium-1234', 'chrome-win64', 'chrome.exe'), args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 110)));
  await page.addInitScript(() => { localStorage.setItem('agnes_api_key', 'sk-test'); });
  await page.goto(`http://127.0.0.1:${PORT}/ai-video.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  // 1. traduction des causes
  const t = await page.evaluate(() => ({
    c401: classerEchec('HTTP 401'),
    c429: classerEchec('HTTP 429'),
    c400: classerEchec('HTTP 400'),
    c5xx: classerEchec('HTTP 503'),
    cRes: classerEchec('Failed to fetch'),
    cMont: classerEchec('Assemblage impossible : ffmpeg a échoué'),
    dom: causeProbable(['HTTP 401', 'HTTP 401', 'HTTP 503'])
  }));
  ok('401 → clé Agnes refusée', /clé Agnes/.test(t.c401), t.c401);
  ok('429 → limite du plan gratuit', /limite du plan gratuit/.test(t.c429), t.c429);
  ok('400 → requête refusée', /requête refusée/.test(t.c400), t.c400);
  ok('503 → service indisponible', /indisponible/.test(t.c5xx), t.c5xx);
  ok('réseau → connexion impossible', /connexion/.test(t.cRes), t.cRes);
  ok('assemblage → segments conservés', /segments restent/.test(t.cMont), t.cMont);
  ok('cause dominante comptée (2 × 401 sur 3)', /^2 échecs : clé Agnes/.test(t.dom), t.dom);

  // 2. en conditions réelles : une génération qui échoue en 429
  await page.evaluate(async () => {
    state.mode = 'image';
    state.images = [{ type: 'image', dataUri: 'data:image/png;base64,AAAA', thumbnail: 'data:image/png;base64,AAAA', id: 1, name: 'x.png', size: 4 }];
    state.activeModels = ['agnes-video-v2.0'];
    state.durationFrames = 121;
    state.agnesKeyStatus = 'ok';          /* sinon le bouton reste désactivé */
    if (typeof updateGenerateBtn === 'function') updateGenerateBtn();
    window.__sauve = window.createVideoTask;
    window.createVideoTask = async function () { throw new Error('HTTP 429'); };
    window.createVideoTask = window.createVideoTask;   /* la boucle résout par nom */
    logState.entries = [];
    document.getElementById('generate-btn').click();
  });
  await page.waitForTimeout(3500);
  const res = await page.evaluate(() => ({
    resume: logState.entries.map(e => e.message).filter(m => /Aucune vidéo/.test(m)),
    toast: (document.getElementById('toast-text') || {}).textContent || null,
    echecs: logState.entries.filter(e => /💥/.test(e.message)).length
  }));
  ok('le résumé du journal annonce la cause', res.resume.some(m => /limite du plan gratuit/.test(m)), JSON.stringify(res.resume).slice(0, 120));
  ok('le TOAST visible annonce aussi la cause', /limite du plan gratuit/.test(String(res.toast)), String(res.toast).slice(0, 110));
  ok('les échecs par scène sont journalisés', res.echecs >= 1, 'lignes 💥 : ' + res.echecs);
  ok('aucune erreur JavaScript', errors.length === 0, errors.join(' | '));

  console.log(`RESULTAT : ${pass}/11`);
  process.exitCode = pass === 11 ? 0 : 1;
  await browser.close(); server.close();
})().catch(e => { console.log('EXCEPTION BANC :', e); process.exitCode = 1; process.exit(1); });
