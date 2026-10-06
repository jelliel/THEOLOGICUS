const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const PORT = 8844; const ROOT = 'C:/tmp/theoverify';
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
  page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 200)));
  await page.addInitScript(() => localStorage.setItem('theologicus_wizard_skipped', '1'));
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { if (window.__loadBibleNow) window.__loadBibleNow(); });
  await page.waitForTimeout(1200);
  const r = await page.evaluate(async () => {
    const panneau = document.createElement('div');
    panneau.innerHTML = '<div id="hb-slot"></div>';
    document.body.appendChild(panneau);
    window.__hbRemplir({ book: '1', ch: 1, v1: 1, v2: 2, ref: 'Gn 1:1-2' }, panneau);
    await new Promise(r => setTimeout(r, 900));
    return {
      hb: panneau.querySelectorAll('.hb').length,
      lt: panneau.querySelectorAll('.lt').length,
      syr: panneau.querySelectorAll('.syr').length,
      slotsLt: panneau.querySelectorAll('.lt-slot').length,
      slotsSyr: panneau.querySelectorAll('.syr-slot').length,
      html: panneau.querySelector('#hb-slot').innerHTML.slice(-200)
    };
  });
  console.log(JSON.stringify(r, null, 1).slice(0, 700));
  await browser.close(); server.close();
})().catch(e => { console.log('ERR:', String(e).slice(0, 250)); process.exit(1); });
