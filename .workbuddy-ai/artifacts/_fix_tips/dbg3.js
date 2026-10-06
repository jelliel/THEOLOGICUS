const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const PORT = 8826; const ROOT = 'C:/tmp/theoverify';
const PW = 'C:/Users/toshr/AppData/Local/ms-playwright';
const vis = el => !!el && el.style.display !== 'none' && getComputedStyle(el).display !== 'none';
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
  // le module d'infobulle est DIFFÉRÉ jusqu'au chargement du corpus
  await page.evaluate(() => { const o = document.getElementById('auth-overlay'); if (o) { o.style.pointerEvents = 'none'; } if (window.__loadBibleNow) window.__loadBibleNow(); });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const cont = document.createElement('div');
    cont.className = 'message-content'; cont.id = 'repro-msg';
    cont.innerHTML = '<p>Texte de contexte avant le lien.</p><a class="bible-ref" href="#" target="_blank">Gn 1:1</a><p>Texte après.</p>';
    cont.style.cssText = 'position:fixed;left:80px;top:300px;width:420px;z-index:2147480000;font-size:16px';
    document.body.appendChild(cont);
  });
  const etat = () => page.evaluate(() => {
    const vis = el => !!el && el.style.display !== 'none' && getComputedStyle(el).display !== 'none';
    const g = id => document.getElementById(id);
    const box = el => { if (!el) return null; const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)].join(','); };
    return {
      verset: vis(g('bible-verse-tip')) + ' ' + box(g('bible-verse-tip')),
      hb: vis(g('hb-tip')) + ' ' + box(g('hb-tip')),
      lt: vis(g('lt-tip')) + ' ' + box(g('lt-tip')),
      syr: vis(g('syr-tip')) + ' ' + box(g('syr-tip')),
      pointeur: window.__v105cPointeur && window.__v105cPointeur.p ? (window.__v105cPointeur.p.x + ',' + window.__v105cPointeur.p.y) : 'n/a'
    };
  });
  const target = sel => page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 8) }; }, sel);
  // 1. survol du lien (avec petits pas, comme une main)
  let t = await target('#repro-msg .bible-ref');
  await page.mouse.move(t.x - 40, t.y + 30);
  for (let i = 0; i < 5; i++) { await page.mouse.move(t.x - 40 + i * 10, t.y + 30 - i * 6); await page.waitForTimeout(60); }
  await page.mouse.move(t.x, t.y);
  await page.waitForTimeout(700);
  console.log('A. panneau ouvert :', JSON.stringify(await etat()));
  // 2. aller sur un mot hébreu du panneau
  let w = await target('#bible-verse-tip #hb-slot .hb');
  if (!w) { console.log('   pas de mot hébreu'); await browser.close(); server.close(); return; }
  const steps = 6;
  const from = t, to = w;
  for (let i = 1; i <= steps; i++) { await page.mouse.move(from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps); await page.waitForTimeout(45); }
  await page.waitForTimeout(700);
  console.log('B. sur le mot     :', JSON.stringify(await etat()));
  // 3. entrer dans la carte du mot
  let c = await target('#hb-tip');
  if (c) {
    for (let i = 1; i <= 5; i++) { await page.mouse.move(w.x + (c.x - w.x) * i / 5, w.y + (c.y - w.y) * i / 5); await page.waitForTimeout(45); }
    await page.waitForTimeout(400);
    console.log('C. dans la carte  :', JSON.stringify(await etat()));
    await page.mouse.move(c.x + 4, c.y + 4);
    await page.waitForTimeout(400);
    console.log('D. micro-mouvement:', JSON.stringify(await etat()));
  } else { console.log('C/D. carte absente'); }
  await browser.close(); server.close();
})().catch(e => { console.log('ERR:', String(e).slice(0, 250)); process.exit(1); });
