const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const PORT = 8822; const ROOT = 'C:/tmp/theoverify';
const PW = 'C:/Users/toshr/AppData/Local/ms-playwright';
(async () => {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'THEOLOGICUS.html';
    const f = path.join(ROOT, rel);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) {
      res.writeHead(200, {'Content-Type': rel.endsWith('.js') ? 'application/javascript; charset=utf-8' : 'text/html; charset=utf-8'});
      return fs.createReadStream(f).pipe(res);
    }
    res.writeHead(404); res.end('nf');
  });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: path.join(PW, 'chromium-1234', 'chrome-win64', 'chrome.exe'), args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 150)));
  await page.addInitScript(() => localStorage.setItem('theologicus_wizard_skipped', '1'));
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => {
    const cont = document.createElement('div');
    cont.className = 'message-content'; cont.id = 'repro-msg';
    cont.innerHTML = '<a class="bible-ref" href="#" target="_blank">Gn 1:1</a>';
    cont.style.cssText = 'position:fixed;left:80px;top:120px;z-index:2147480000;font-size:18px';
    document.body.appendChild(cont);
    const a = cont.querySelector('a');
    const r = a.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const top = document.elementFromPoint(cx, cy);
    return {
      rect: { x: cx, y: cy },
      top: top ? (top.id || top.className || top.tagName) : null,
      overlay: (() => { const o = document.getElementById('auth-overlay'); return o ? getComputedStyle(o).pointerEvents + '/' + o.style.display : 'none'; })(),
      watermark: (() => { const o = document.getElementById('watermark-overlay'); return o ? getComputedStyle(o).pointerEvents + '/' + getComputedStyle(o).zIndex : 'none'; })()
    };
  });
  console.log('point:', JSON.stringify(info));
  await browser.close(); server.close();
})().catch(e => { console.log('ERR:', String(e).slice(0, 200)); process.exit(1); });
