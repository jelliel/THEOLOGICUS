const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const PORT = 8842; const ROOT = 'C:/tmp/theoverify';
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
  page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 160)));
  await page.addInitScript(() => localStorage.setItem('theologicus_wizard_skipped', '1'));
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  const avant = await page.evaluate(() => ({
    hbRemplir: typeof window.__hbRemplir, v450: typeof window.__v450Lt, v451: typeof window.__v451Syr
  }));
  console.log('t=1s (avant corpus):', JSON.stringify(avant));
  await page.evaluate(() => { const o = document.getElementById('auth-overlay'); if (o) o.style.pointerEvents = 'none'; if (window.__loadBibleNow) window.__loadBibleNow(); });
  await page.waitForTimeout(1500);
  const apres = await page.evaluate(() => ({
    hbRemplir: typeof window.__hbRemplir, v450: typeof window.__v450Lt, v451: typeof window.__v451Syr,
    wrapped450: !!(window.__v450Lt && window.__v450Lt.__wrap), // heuristique
    remplirLatinRenvoie: (() => { try { const p = document.createElement('div'); p.innerHTML = '<div id="hb-slot"></div>'; const r = window.__v450Lt.remplirLatin({ book: '1', ch: 1, v1: 1, v2: 1 }, p); return 'appelé:' + r; } catch (e) { return 'ERREUR:' + e.message; } })()
  }));
  console.log('t=2.5s (corpus chargé):', JSON.stringify(apres));
  await page.waitForTimeout(600);
  const ligne = await page.evaluate(() => {
    // la ligne a-t-elle été écrite dans le panneau factice ?
    return 'panneaux factices: ' + document.querySelectorAll('.lt-slot').length + ' | .syr-slot: ' + document.querySelectorAll('.syr-slot').length;
  });
  console.log(ligne);
  await browser.close(); server.close();
})().catch(e => { console.log('ERR:', String(e).slice(0, 250)); process.exit(1); });
