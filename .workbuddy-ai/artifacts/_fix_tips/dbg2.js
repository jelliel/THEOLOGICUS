const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const PORT = 8824; const ROOT = 'C:/tmp/theoverify';
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
  page.on('console', m => { const t = m.text(); if (/TTS|DIAG|ERREUR|Error/.test(t)) return; });
  page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 200)));
  await page.addInitScript(() => localStorage.setItem('theologicus_wizard_skipped', '1'));
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const st1 = await page.evaluate(() => {
    const cont = document.createElement('div');
    cont.className = 'message-content'; cont.id = 'repro-msg';
    cont.innerHTML = '<a class="bible-ref" href="#" target="_blank">Gn 1:1</a>';
    cont.style.cssText = 'position:fixed;left:80px;top:200px;z-index:2147480000;font-size:18px';
    document.body.appendChild(cont);
    window.__fired = [];
    document.addEventListener('mouseover', e => {
      const t = e.target;
      window.__fired.push((t && (t.className || t.tagName)) + '');
    }, true);
    return {
      tipExiste: !!document.getElementById('bible-verse-tip'),
      parseTest: (typeof window.__parseBibleRef === 'function') ? JSON.stringify(window.__parseBibleRef('Gn 1:1')) : 'absent'
    };
  });
  console.log('état initial:', JSON.stringify(st1));
  const r = await page.evaluate(() => { const a = document.querySelector('#repro-msg a'); const b = a.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  await page.mouse.move(r.x - 60, r.y - 60);
  await page.waitForTimeout(100);
  await page.mouse.move(r.x, r.y);
  await page.waitForTimeout(1500);
  const st2 = await page.evaluate(() => {
    const t = document.getElementById('bible-verse-tip');
    return {
      fired: window.__fired.slice(0, 6),
      tip: t ? { display: t.style.display, opacity: t.style.opacity, hb: t.querySelectorAll('.hb').length } : null
    };
  });
  console.log('après survol:', JSON.stringify(st2));
  await browser.close(); server.close();
})().catch(e => { console.log('ERR:', String(e).slice(0, 200)); process.exit(1); });
