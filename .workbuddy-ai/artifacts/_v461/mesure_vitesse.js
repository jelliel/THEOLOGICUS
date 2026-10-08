const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const PORT = 8911; const ROOT = 'C:/tmp/theoverify';
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
  await page.route('**/languages', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[{"code":"fr"}]' }));
  await page.route('**/translate', async r => {
    let c = {}; try { c = JSON.parse(r.request().postData() || '{}'); } catch (e) {}
    const lot = Array.isArray(c.q) ? c.q : [c.q];
    await new Promise(x => setTimeout(x, 400));   /* latence du moteur */
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ translatedText: lot.map(t => 'FR:' + t) }) });
  });
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const r = await page.evaluate(async () => {
    window.__livro.ouvrir();
    const paras = []; for (let i = 0; i < 240; i++) paras.push('paragraphe ' + i + ' — texte suffisamment long pour un envoi réel');
    const e = window.__livro.etat();
    async function chrono(n, lang) {
      e.parallele = n; e.cible = lang;
      const t0 = performance.now();
      await window.__livro.traduire(paras.slice(), lang, 'lt');
      return Math.round(performance.now() - t0);
    }
    const seq = await chrono(1, 'pt');
    const p3 = await chrono(3, 'ro');
    const p6 = await chrono(6, 'sv');
    return { seq: seq, p3: p3, p6: p6, lots: Math.ceil(240 / 24) };
  });
  console.log('240 paragraphes =', r.lots, 'lots · latence moteur simulée 400 ms');
  console.log('  séquentiel (1 lot à la fois) :', r.seq, 'ms');
  console.log('  parallèle 3                  :', r.p3, 'ms  →', (r.seq / r.p3).toFixed(1) + '× plus rapide');
  console.log('  parallèle 6                  :', r.p6, 'ms  →', (r.seq / r.p6).toFixed(1) + '× plus rapide');
  await browser.close(); server.close();
})().catch(e => { console.log('ERR:', String(e).slice(0, 200)); process.exit(1); });
