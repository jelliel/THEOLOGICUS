// v445 — Prove-It : la fiche d'étude IA se génère depuis le panier 🧺 avec
// repli complet (primaire 401 → Ollama local), s'enregistre, se réouvre
// depuis l'historique et s'exporte.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const PORT = 8788;
const ROOT = 'C:/tmp/theoverify';
const PW = 'C:/Users/toshr/AppData/Local/ms-playwright';

(async () => {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'THEOLOGICUS.html';
    if (rel.startsWith('fail401')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end('{"error":{"message":"Rate limit exceeded","code":"1300"}}');
      return;
    }
    const f = path.join(ROOT, rel);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) {
      res.writeHead(200, { 'Content-Type': rel.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8' });
      return fs.createReadStream(f).pipe(res);
    }
    res.writeHead(404); res.end('nf');
  });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: path.join(PW, 'chromium-1234', 'chrome-win64', 'chrome.exe'), args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('theologicus_wizard_skipped', '1');
    localStorage.setItem('theo_basket_v1', JSON.stringify([
      { id: 'b1', src: 'Summa', text: "La grâce est une participation à la vie divine. Elle élève l'âme au-dessus de ses forces naturelles." },
      { id: 'b2', src: 'Sélection', text: "L'homme est justifié par la foi, mais la foi sans les œuvres est morte : les deux se tiennent." },
    ]));
  });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  let pass = 0;
  const ok = (name, cond, detail) => { console.log(`  ${cond ? '[OK]  ' : '[ECHEC]'}${name}${cond || detail === undefined ? '' : ' — ' + detail}`); if (cond) pass++; };
  try {
    await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1500);

    // 1. bouton HUD + panier vu
    ok('le bouton « ✨ FICHE » existe dans le HUD', await page.evaluate(() => !!document.getElementById('v445-fiche-btn')));
    await page.evaluate(() => window.__v445Fiche.ouvre());
    const src = await page.evaluate(() => document.getElementById('v445-fiche-src').textContent);
    ok('le panier 🧺 est vu (2 sélections)', src.includes('2 sélection'));

    // 2. prompt construit sur les extraits
    const prompt = await page.evaluate(() => window.__v445Fiche.promptDepuisPanier(window.__v445Fiche.panier()));
    ok('le prompt embarque les extraits et la structure demandée', prompt.includes('[1]') && prompt.includes('grâce est une participation') && prompt.includes('Questions d'));

    // 3. génération : primaire en échec → Ollama local répond
    await page.evaluate(() => {
      state.customModels = [{ uid: 'fail401-uid', name: 'primaire en échec', model: 'faux', baseUrl: 'http://127.0.0.1:' + location.port + '/fail401/v1', apiKey: 'x', format: 'chat-completions' }];
      state.model = 'fail401-uid';
    });
    await page.evaluate(() => window.__v445Fiche.generer());
    await page.waitForFunction(() => /<h1>|<h2>/.test((document.getElementById('v445-fiche-body') || {}).innerHTML || '') || /❌/.test((document.getElementById('v445-fiche-body') || {}).textContent || ''), null, { timeout: 150000 });
    const gen = await page.evaluate(() => ({ h: !!document.querySelector('#v445-fiche-body h1, #v445-fiche-body h2'), err: document.getElementById('v445-fiche-body').textContent.slice(0, 120) }));
    ok('échec primaire → fiche générée via Ollama (titres présents)', gen.h, gen.err);

    // 4. enregistrement + historique
    await page.evaluate(() => document.getElementById('v445-fiche-save').click());
    await page.waitForTimeout(200);
    const hist = await page.evaluate(() => ({ n: window.__v445Fiche.ldFiches().length, box: document.getElementById('v445-fiche-hist').textContent }));
    ok('la fiche est enregistrée et l’historique la liste', hist.n === 1 && /1 fiche/.test(hist.box));

    // 5. export MD disponible (dernière fiche)
    const mdOk = await page.evaluate(() => {
      const f = window.__v445Fiche.ldFiches()[0];
      return f && f.contenu.length > 100 && /##/.test(f.contenu);
    });
    ok('la fiche enregistrée est exportable (markdown structuré)', mdOk);

    ok('aucune erreur JavaScript', errors.length === 0);
    console.log(`RESULTAT : ${pass}/7`);
    process.exitCode = pass === 7 ? 0 : 1;
  } catch (e) {
    console.log('EXCEPTION BANC :', e);
    process.exitCode = 1;
  } finally {
    await browser.close(); server.close();
  }
})();
