const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const PORT = 8913; const ROOT = 'C:/tmp/theoverify';
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
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(String(e).slice(0, 200)));
  page.on('download', d => console.log('TÉLÉCHARGEMENT DÉCLENCHÉ :', d.suggestedFilename()));
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  // on charge un livre puis on clique sur les trois boutons d'export
  await page.evaluate(async () => {
    window.__livro.ouvrir();
    const b = await fetch('.workbuddy-ai/artifacts/_v461/fixtures/livre.epub').then(r => r.blob());
    await window.__livro.charger(new File([b], 'livre.epub'));
  });
  await page.waitForTimeout(800);
  for (const id of ['v461-txt', 'v461-docx', 'v461-epub']) {
    const avant = Date.now();
    await page.evaluate(i => document.getElementById(i).click(), id);
    await page.waitForTimeout(900);
    console.log('clic', id, '→', Date.now() - avant, 'ms');
  }
  const msg = await page.evaluate(() => document.getElementById('v461-msg').textContent);
  console.log('message :', String(msg).slice(0, 120));
  console.log('erreurs :', erreurs.slice(0, 3));
  await browser.close(); server.close();
})().catch(e => { console.log('ERR:', String(e).slice(0, 200)); process.exit(1); });
