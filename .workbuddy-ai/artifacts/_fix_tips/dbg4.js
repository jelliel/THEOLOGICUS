const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const PORT = 8828; const ROOT = 'C:/tmp/theoverify';
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
  page.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE:' + m.text().slice(0, 120)); });
  await page.addInitScript(() => localStorage.setItem('theologicus_wizard_skipped', '1'));
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const g = await page.evaluate(() => ({
    parseBibleRef: typeof window.__parseBibleRef,
    v105cPointeur: typeof window.__v105cPointeur,
    hbRemplir: typeof window.__hbRemplir,
    V37: typeof window.__V37,
    v449: typeof window.__v449Phon,
    bibleVerseTip: !!document.getElementById('bible-verse-tip'),
    hbTip: !!document.getElementById('hb-tip'),
    ltTip: !!document.getElementById('lt-tip'),
    syrTip: !!document.getElementById('syr-tip'),
    qwTip: !!document.getElementById('qw-tip'),
    bodyChildren: document.body.children.length
  }));
  console.log('globals:', JSON.stringify(g));
  console.log('erreurs:', errs.slice(0, 6));
  await browser.close(); server.close();
})().catch(e => { console.log('ERR:', String(e).slice(0, 200)); process.exit(1); });
