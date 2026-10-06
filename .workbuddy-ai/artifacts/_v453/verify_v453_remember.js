/* Banc v453 — « Se souvenir de moi » robuste au changement de port.
   Le cookie ignore le port : on simule l'autre origine en vidant
   localStorage (ce qui arrive quand l'app sert sur 8766 au lieu de 8765). */
const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const PORT = 8860; const ROOT = 'C:/tmp/theoverify';
const PW = 'C:/Users/toshr/AppData/Local/ms-playwright';
const TOK = '6c0d0ff968f4ed4a7dcf82313d563d051a391eef7d56e99f7ac5aa7aa56e7c75';
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
  const browser = await chromium.launch({ executablePath: path.join(PW, 'chromium-1234', 'chrome-win64', 'chrome.exe'), args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 120)));
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  const api = await page.evaluate(() => window.__v453Remember ? Object.keys(window.__v453Remember) : null);
  ok('API v453 exposée (synchroniser/cookie/effacerCookie)', api && api.indexOf('synchroniser') >= 0, JSON.stringify(api));

  // 1. l'app écrit l'enregistrement (comme au déverrouillage avec la case cochée)
  await page.evaluate((tok) => {
    localStorage.setItem('theologicus_remember', JSON.stringify({ v: 1, mode: 'admin', exp: Date.now() + 7 * 86400000, tok: tok }));
    window.__v453Remember.synchroniser();
  }, TOK);
  await page.waitForTimeout(200);
  const ck = await page.evaluate(() => window.__v453Remember.cookie());
  ok('l’enregistrement est recopié dans le COOKIE', !!ck && /"v":1/.test(ck), String(ck).slice(0, 60));

  // 2. SIMULATION DE L'AUTRE PORT : localStorage vidé, cookie conservé
  await page.evaluate(() => localStorage.removeItem('theologicus_remember'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2200);
  const st = await page.evaluate(() => {
    const o = document.getElementById('auth-overlay');
    return {
      overlay: o ? getComputedStyle(o).display : 'ABSENT',
      cache: o ? o.classList.contains('hidden') : null,
      ls: !!localStorage.getItem('theologicus_remember'),
      quiz: !!document.querySelector('.quiz-option')
    };
  });
  ok('localStorage restauré depuis le cookie au démarrage', st.ls === true, JSON.stringify(st));
  ok('le verrou NE revient PAS (session restaurée malgré le changement d’origine)', st.overlay === 'none' || st.cache === true, JSON.stringify(st));
  ok('aucun quiz affiché', st.quiz === false);

  // 3. révocation : les deux supports sont nettoyés
  const purge = await page.evaluate(() => {
    localStorage.setItem('theologicus_remember', JSON.stringify({ v: 1, mode: 'admin', exp: Date.now() - 1000, tok: 'x' }));
    window.__v453Remember.synchroniser();
    return { ls: localStorage.getItem('theologicus_remember'), ck: window.__v453Remember.cookie() };
  });
  ok('enregistrement expiré → purge des deux supports', purge.ls === null && !purge.ck, JSON.stringify(purge));

  // 4. la révocation de l'app (⚙ Paramètres) doit aussi nettoyer le cookie
  await page.evaluate((tok) => {
    localStorage.setItem('theologicus_remember', JSON.stringify({ v: 1, mode: 'admin', exp: Date.now() + 7 * 86400000, tok: tok }));
    window.__v453Remember.synchroniser();
    if (window.theologicusForgetRemember) window.theologicusForgetRemember();
    window.__v453Remember.synchroniser();
  }, TOK);
  const revoque = await page.evaluate(() => ({ ls: localStorage.getItem('theologicus_remember'), ck: window.__v453Remember.cookie() }));
  ok('« Oublier l’accès mémorisé » efface aussi le cookie', revoque.ls === null && !revoque.ck, JSON.stringify(revoque));

  ok('aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
  console.log(`RESULTAT : ${pass}/8`);
  process.exitCode = pass === 8 ? 0 : 1;
  await browser.close(); server.close();
})().catch(e => { console.log('EXCEPTION BANC :', e); process.exitCode = 1; process.exit(1); });
