const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const PORT = 8909; const ROOT = 'C:/tmp/theoverify';
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
  page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 200)));
  await page.route('**/languages', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[{"code":"fr"},{"code":"nl"}]' }));
  await page.route('**/translate', r => {
    let c = {}; try { c = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
    console.log('REQ /translate q=', JSON.stringify(c.q).slice(0, 80), 'format=', c.format);
    const lot = Array.isArray(c.q) ? c.q : [c.q];
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ translatedText: lot.map(t => 'FR:' + t) }) });
  });
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const r = await page.evaluate(async () => {
    window.__livro.ouvrir();
    const gz = document.getElementById('v461-glos');
    gz.value = 'Verbe'; gz.dispatchEvent(new Event('input'));
    try {
      const out = await window.__livro.traduire(['Au commencement était le Verbe.', 'Et le Verbe était Dieu.'], 'nl', 'lt');
      return { ok: true, out: out };
    } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
  });
  console.log('résultat :', JSON.stringify(r).slice(0, 300));
  await browser.close(); server.close();
})().catch(e => { console.log('ERR:', String(e).slice(0, 200)); process.exit(1); });
