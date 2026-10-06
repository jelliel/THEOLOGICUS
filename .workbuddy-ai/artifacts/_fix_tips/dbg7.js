const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const PORT = 8834; const ROOT = 'C:/tmp/theoverify';
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
  await page.waitForTimeout(1500);
  await page.evaluate(() => { if (window.__loadBibleNow) window.__loadBibleNow(); });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const cont = document.createElement('div');
    cont.className = 'message-content'; cont.id = 'repro-msg';
    cont.innerHTML = '<a class="bible-ref" href="#" target="_blank">Gn 1:1</a>';
    cont.style.cssText = 'position:fixed;left:80px;top:300px;z-index:2147480000;font-size:18px';
    document.body.appendChild(cont);
  });
  const t = await page.evaluate(() => { const a = document.querySelector('#repro-msg a'); const b = a.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  await page.mouse.move(t.x, t.y);
  await page.waitForTimeout(900);
  const r = await page.evaluate(() => {
    const tip = document.getElementById('bible-verse-tip');
    const out = { panelPE: getComputedStyle(tip).pointerEvents, mots: [], slot: null };
    const slot = tip.querySelector('#hb-slot');
    out.slot = slot ? slot.innerHTML.slice(0, 200) : 'PAS DE SLOT';
    tip.querySelectorAll('#hb-slot .hb, #hb-slot .lt, #hb-slot .syr').forEach(w => {
      const b = w.getBoundingClientRect();
      const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
      const top = document.elementFromPoint(cx, cy);
      out.mots.push({
        cls: w.className.split(' ')[0],
        pe: getComputedStyle(w).pointerEvents,
        box: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)],
        top: top ? (top.id || top.className || top.tagName) : null,
        dansPanel: tip.contains(top)
      });
    });
    return out;
  });
  console.log('panel pointer-events:', r.panelPE);
  console.log('slot:', r.slot);
  console.log('mots atteignables:', JSON.stringify(r.mots.slice(0, 5), null, 1));
  await browser.close(); server.close();
})().catch(e => { console.log('ERR:', String(e).slice(0, 200)); process.exit(1); });
