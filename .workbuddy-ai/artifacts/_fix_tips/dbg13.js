const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const PORT = 8850; const ROOT = 'C:/tmp/theoverify';
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
  await page.addInitScript(() => localStorage.setItem('theologicus_wizard_skipped', '1'));
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const avant = await page.evaluate(() => ({ env: /remplirSyriaque/.test(window.__hbRemplir.toString()), len: window.__hbRemplir.toString().length }));
  console.log('AVANT corpus : enveloppe=' + avant.env + ' len=' + avant.len);
  await page.evaluate(() => { if (window.__loadBibleNow) window.__loadBibleNow(); });
  await page.waitForTimeout(1500);
  const apres = await page.evaluate(() => ({ env: /remplirSyriaque/.test(window.__hbRemplir.toString()), len: window.__hbRemplir.toString().length, debut: window.__hbRemplir.toString().slice(0, 90) }));
  console.log('APRÈS corpus : enveloppe=' + apres.env + ' len=' + apres.len);
  console.log('debut:', apres.debut.replace(/\n/g, ' '));
  await browser.close(); server.close();
})().catch(e => { console.log('ERR:', String(e).slice(0, 200)); process.exit(1); });
