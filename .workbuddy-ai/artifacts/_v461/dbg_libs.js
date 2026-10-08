const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const PORT = 8907; const ROOT = 'C:/tmp/theoverify';
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
  const page = await browser.newPage();
  const echecs = [];
  page.on('requestfailed', r => echecs.push(r.url().slice(-40) + ' ' + (r.failure() || {}).errorText));
  page.on('response', r => { if (r.status() >= 400) echecs.push(r.status() + ' ' + r.url().slice(-40)); });
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const r = await page.evaluate(() => ({
    JSZip: typeof JSZip, pdfjs: typeof pdfjsLib, mammoth: typeof mammoth,
    tags: Array.from(document.querySelectorAll('script[src*="libs/"]')).map(s => s.getAttribute('src')),
    chargeur: typeof window.__chargerLibs
  }));
  console.log(JSON.stringify(r, null, 1));
  console.log('échecs réseau :', echecs.slice(0, 6));
  await browser.close(); server.close();
})().catch(e => { console.log('ERR:', String(e).slice(0, 200)); process.exit(1); });
