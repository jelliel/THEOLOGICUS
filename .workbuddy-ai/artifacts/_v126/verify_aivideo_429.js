// v126j — Prove-It : une réponse 429 doit respecter Retry-After puis reprendre.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const PORT = 8768;
const ROOT = path.resolve(__dirname, '..', '..', '..');
const PW = 'C:/Users/toshr/AppData/Local/ms-playwright';
let calls = 0;

(async () => {
  const server = http.createServer((req, res) => {
    const file = req.url === '/' ? path.join(ROOT, 'ai-video.html') : '';
    if (file && fs.existsSync(file)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(file).pipe(res);
      return;
    }
    if (req.url === '/mock') {
      calls++;
      if (calls === 1) {
        res.writeHead(429, { 'Retry-After': '1', 'Content-Type': 'application/json' });
        res.end('{"error":"rate limited"}');
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      }
      return;
    }
    res.writeHead(404); res.end('not found');
  });
  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
  const browser = await chromium.launch({
    executablePath: path.join(PW, 'chromium-1234', 'chrome-win64', 'chrome.exe'),
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  try {
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const out = await page.evaluate(async () => {
      state.stopRequested = false;
      const waits = [];
      window.sleep = async ms => { waits.push(ms); };
      const res = await apiFetch('/mock', { method: 'GET' });
      return { status: res.status, waits, text: await res.text() };
    });
    const checks = [
      ['le premier 429 est retenté', calls === 2],
      ['Retry-After est respecté', out.waits[0] === 1000],
      ['la requête reprend avec HTTP 200', out.status === 200],
      ['aucune erreur JavaScript', errors.length === 0],
    ];
    let pass = 0;
    for (const [name, ok] of checks) { if (ok) pass++; console.log(`  ${ok ? '[OK]  ' : '[ECHEC]'}${name}`); }
    console.log(`RESULTAT : ${pass}/${checks.length}`);
    process.exitCode = pass === checks.length ? 0 : 1;
  } finally {
    await browser.close();
    server.close();
  }
})().catch(e => { console.error(e); process.exitCode = 2; });
