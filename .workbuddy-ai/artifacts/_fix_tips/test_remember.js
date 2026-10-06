/* Le « Se souvenir de moi » : on écrit l'enregistrement EXACT que writeRemember()
   produirait (jeton = sha256('remember:' + AUTH_HASH), calculé avec Node) puis on
   recharge : si le verrou ne se lève pas, la LECTURE est cassée. */
const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const PORT = 8836; const ROOT = 'C:/tmp/theoverify';
const PW = 'C:/Users/toshr/AppData/Local/ms-playwright';
const TOK = '6c0d0ff968f4ed4a7dcf82313d563d051a391eef7d56e99f7ac5aa7aa56e7c75';
(async () => {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'THEOLOGICUS.html';
    const f = path.join(ROOT, rel);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) { res.writeHead(200, {'Content-Type': rel.endsWith('.js') ? 'application/javascript; charset=utf-8' : 'text/html; charset=utf-8'}); return fs.createReadStream(f).pipe(res); }
    res.writeHead(404); res.end('nf');
  });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: path.join(PW, 'chromium-1234', 'chrome-win64', 'chrome.exe'), args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  // 1. écriture de l'enregistrement tel que writeRemember() le produirait
  await page.evaluate((tok) => {
    localStorage.setItem('theologicus_remember', JSON.stringify({ v: 1, mode: 'admin', exp: Date.now() + 7 * 86400000, tok: tok }));
  }, TOK);
  const ecrit = await page.evaluate(() => localStorage.getItem('theologicus_remember'));
  console.log('1. enregistrement écrit :', ecrit ? 'oui' : 'NON');
  // 2. rechargement : le verrou doit s'ouvrir tout seul
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const st = await page.evaluate(() => {
    const o = document.getElementById('auth-overlay');
    const quiz = document.querySelector('.quiz-option, [data-act="quiz"]');
    return {
      overlayDisplay: o ? getComputedStyle(o).display : 'ABSENT',
      overlayHiddenClass: o ? o.classList.contains('hidden') : null,
      quizVisible: !!quiz,
      rememberEncore: !!localStorage.getItem('theologicus_remember'),
      appVisible: !!document.getElementById('chat-container')
    };
  });
  console.log('2. après rechargement :', JSON.stringify(st));
  const unlocked = st.overlayDisplay === 'none' || st.overlayHiddenClass === true;
  console.log(unlocked ? '=> LECTURE OK (session restaurée)' : '=> LECTURE CASSÉE (le verrou revient malgré l’enregistrement)');
  console.log('erreurs:', errs.slice(0, 3));
  await browser.close(); server.close();
})().catch(e => { console.log('ERR:', String(e).slice(0, 200)); process.exit(1); });
