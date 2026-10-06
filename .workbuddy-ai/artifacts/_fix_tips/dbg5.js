const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const PORT = 8830; const ROOT = 'C:/tmp/theoverify';
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
  page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 150)));
  await page.addInitScript(() => localStorage.setItem('theologicus_wizard_skipped', '1'));
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    window.__log = [];
    const tr = window.__v105cPointeur;
    const orig = tr.dansRetenant;
    tr.dansRetenant = function (root) {
      const r = orig.call(tr, root);
      window.__log.push({ root: root && (root.id || 'x'), res: r, pt: tr.point(), box: root && root.getBoundingClientRect ? (() => { const b = root.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; })() : null });
      return r;
    };
    // observe les changements de style du panneau
    const cont = document.createElement('div');
    cont.className = 'message-content'; cont.id = 'repro-msg';
    cont.innerHTML = '<a class="bible-ref" href="#" target="_blank">Gn 1:1</a>';
    cont.style.cssText = 'position:fixed;left:80px;top:300px;z-index:2147480000;font-size:18px';
    document.body.appendChild(cont);
    // trace aussi les mouseout sur le lien
    document.addEventListener('mouseout', e => {
      const t = e.target;
      if (t && t.className && String(t.className).indexOf('bible-ref') >= 0)
        window.__log.push({ ev: 'mouseout-lien', rel: e.relatedTarget ? (e.relatedTarget.id || e.relatedTarget.className || e.relatedTarget.tagName) : null });
    }, true);
  });
  const t = await page.evaluate(() => { const a = document.querySelector('#repro-msg a'); const b = a.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  await page.mouse.move(t.x - 30, t.y + 25);
  await page.waitForTimeout(80);
  await page.mouse.move(t.x, t.y);
  await page.waitForTimeout(900);
  const out = await page.evaluate(() => {
    const tip = document.getElementById('bible-verse-tip');
    return {
      log: window.__log.slice(0, 14),
      tip: tip ? { d: tip.style.display, o: tip.style.opacity, box: (() => { const b = tip.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; })() } : null,
      pt: window.__v105cPointeur.point()
    };
  });
  console.log(JSON.stringify(out, null, 1).slice(0, 1800));
  await browser.close(); server.close();
})().catch(e => { console.log('ERR:', String(e).slice(0, 200)); process.exit(1); });
