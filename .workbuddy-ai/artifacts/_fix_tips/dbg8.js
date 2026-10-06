const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const PORT = 8838; const ROOT = 'C:/tmp/theoverify';
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
  page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 160)));
  await page.addInitScript(() => localStorage.setItem('theologicus_wizard_skipped', '1'));
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const o = document.getElementById('auth-overlay'); if (o) o.style.pointerEvents = 'none'; if (window.__loadBibleNow) window.__loadBibleNow(); });
  await page.waitForTimeout(1200);
  // instrumenter l'observateur : compter les fermetures vues et les réouvertures
  await page.evaluate(() => {
    window.__diag = { fermetures: 0, reouvertures: 0 };
    const obs = new MutationObserver(() => {});
    const carte = document.getElementById('hb-tip');
    if (carte) obs.observe(carte, { attributes: true, attributeFilter: ['style'] });
    window.__diag.observeurActif = true;
  });
  await page.evaluate(() => {
    const cont = document.createElement('div');
    cont.className = 'message-content'; cont.id = 'repro-msg';
    cont.innerHTML = '<a class="bible-ref" href="#" target="_blank">Gn 1:1</a>';
    cont.style.cssText = 'position:fixed;left:80px;top:300px;z-index:2147480000;font-size:18px';
    document.body.appendChild(cont);
  });
  const t = await page.evaluate(() => { const a = document.querySelector('#repro-msg a'); const b = a.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  await page.mouse.move(t.x, t.y);
  await page.waitForTimeout(800);
  const w = await page.evaluate(() => { const e = document.querySelector('#bible-verse-tip #hb-slot .hb'); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  await page.mouse.move(w.x, w.y);
  await page.waitForTimeout(700);
  const st1 = await page.evaluate(() => ({
    carteVisible: (() => { const c = document.getElementById('hb-tip'); return c && c.style.display !== 'none'; })(),
    ancre: (() => { const a = window.__v452Cartes.ancre(); return a ? a.className + '/' + (a.getAttribute('data-h') || '').slice(0, 8) : null; })(),
    boite: window.__v452Cartes.boite(),
    pointeur: window.__v105cPointeur.point(),
    obs: window.__diag.observeurActif
  }));
  console.log('sur le mot   :', JSON.stringify(st1).slice(0, 300));
  // se diriger vers la fiche, pas à pas
  const c = await page.evaluate(() => { const e = document.getElementById('hb-tip'); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + 20 }; });
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(w.x + (c.x - w.x) * i / 8, w.y + (c.y - w.y) * i / 8);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(400);
  const st2 = await page.evaluate(() => ({
    carteVisible: (() => { const cc = document.getElementById('hb-tip'); return cc && cc.style.display !== 'none'; })(),
    pointeur: window.__v105cPointeur.point(),
    boite: window.__v452Cartes.boite(),
    couloir: window.__v452Cartes.couloirConnu(window.__v105cPointeur.point()),
    ancreVivante: (() => { const a = window.__v452Cartes.ancre(); return !!(a && a.isConnected); })()
  }));
  console.log('après trajet  :', JSON.stringify(st2).slice(0, 300));
  await browser.close(); server.close();
})().catch(e => { console.log('ERR:', String(e).slice(0, 250)); process.exit(1); });
