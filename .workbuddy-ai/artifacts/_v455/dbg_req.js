const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const PORT = 8890; const ROOT = 'C:/tmp/theoverify';
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
  page.on('request', r => { if (/videos|proxy/.test(r.url())) console.log('REQ', r.method(), r.url().slice(0, 110)); });
  await page.goto(`http://127.0.0.1:${PORT}/ai-video.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const info = await page.evaluate(() => ({ relais: (typeof _VIA_RELAIS !== 'undefined') ? _VIA_RELAIS : 'n/a', base: (typeof API_BASE !== 'undefined') ? API_BASE : 'n/a' }));
  console.log('relais:', JSON.stringify(info));
  const r = await page.evaluate(async () => {
    try { const id = await createVideoTask('P', null, null, 'agnes-video-2.5-flash', null); return 'OK id=' + id; }
    catch (e) { return 'ERR ' + e.message; }
  });
  console.log('résultat:', r);
  await browser.close(); server.close();
})().catch(e => { console.log('ERR:', String(e).slice(0, 200)); process.exit(1); });
