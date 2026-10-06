const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const PORT = 8892; const ROOT = 'C:/tmp/theoverify';
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
  let corps = null;
  await page.route('**/proxy/**', async route => {
    if (route.request().method() === 'POST') { corps = route.request().postData(); }
    await route.fulfill({ status: 401, contentType: 'application/json', body: '{"detail":"x"}' });
  });
  await page.goto(`http://127.0.0.1:${PORT}/ai-video.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  // 1. corps 2.5
  const r1 = await page.evaluate(async () => {
    try { await createVideoTask('PROMPT', null, null, 'agnes-video-2.5-flash', null); return 'ok'; } catch (e) { return 'err:' + e.message; }
  });
  const c1 = corps;
  console.log('1. résultat:', r1);
  console.log('   corps   :', String(c1).slice(0, 160));
  // 2. image base64 sur 2.5
  const r2 = await page.evaluate(async () => {
    try { await createVideoTask('P', 'data:image/png;base64,AAAA', null, 'agnes-video-2.5-flash', null); return 'AUCUNE ERREUR (probleme)'; } catch (e) { return 'err:' + e.message; }
  });
  console.log('2. image base64 sur 2.5 :', r2);
  // 3. corps v2.0
  corps = null;
  const r3 = await page.evaluate(async () => {
    try { await createVideoTask('P', 'data:image/png;base64,AAAA', null, 'agnes-video-v2.0', null); return 'ok'; } catch (e) { return 'err:' + e.message; }
  });
  const c3 = corps;
  console.log('3. v2.0 résultat:', r3);
  console.log('   corps  :', String(c3).slice(0, 160));
  await browser.close(); server.close();
})().catch(e => { console.log('ERR:', String(e).slice(0, 200)); process.exit(1); });
