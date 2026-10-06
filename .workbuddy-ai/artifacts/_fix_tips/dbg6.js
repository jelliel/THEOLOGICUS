const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const PORT = 8832; const ROOT = 'C:/tmp/theoverify';
const PW = 'C:/Users/toshr/AppData/Local/ms-playwright';
(async () => {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'THEOLOGICUS.html';
    const f = path.join(ROOT, rel);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) { res.writeHead(200, {'Content-Type': rel.endsWith('.js') ? 'application/javascript; charset=utf-8' : 'text/html; charset=utf-8'}); return fs.createReadStream(f).pipe(res); }
    res.writeHead(404); res.end('nf');
  });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: path.join(PW, 'chromium-1234', 'chrome-win64', 'chrome.exe'), args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await page.addInitScript(() => localStorage.setItem('theologicus_wizard_skipped', '1'));
  // marquer l'ordre : quand le bloc v66 s'exécute-t-il ?
  await page.addInitScript(() => { window.__t0 = Date.now(); });
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: 'domcontentloaded' });
  for (const ms of [500, 1000, 2000, 4000]) {
    await page.waitForTimeout(ms === 500 ? 500 : ms - (ms === 1000 ? 500 : ms === 2000 ? 1000 : 2000));
    const st = await page.evaluate(() => ({
      t: Date.now() - window.__t0,
      tip: !!document.getElementById('bible-verse-tip'),
      overlay: (() => { const o = document.getElementById('auth-overlay'); return o ? (o.className || '') + '|' + o.style.display : 'ABSENT'; })(),
      parseRef: typeof window.__parseBibleRef
    }));
    console.log('t=' + st.t + 'ms tip=' + st.tip + ' overlay=' + st.overlay + ' parseRef=' + st.parseRef);
  }
  console.log('erreurs:', errs.slice(0, 4));
  await browser.close(); server.close();
})().catch(e => { console.log('ERR:', String(e).slice(0, 200)); process.exit(1); });
