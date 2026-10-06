/* Repro — chaîne d'infobulles : verset → mot → la carte du mot survit-elle
   au moindre mouvement de souris ? (signalé par l'utilisateur) */
const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const PORT = 8820; const ROOT = 'C:/tmp/theoverify';
const PW = 'C:/Users/toshr/AppData/Local/ms-playwright';
(async () => {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'THEOLOGICUS.html';
    const f = path.join(ROOT, rel);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) {
      res.writeHead(200, {'Content-Type': rel.endsWith('.js') ? 'application/javascript; charset=utf-8' : rel.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8'});
      return fs.createReadStream(f).pipe(res);
    }
    res.writeHead(404); res.end('nf');
  });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ executablePath: path.join(PW, 'chromium-1234', 'chrome-win64', 'chrome.exe'), args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(() => localStorage.setItem('theologicus_wizard_skipped', '1'));
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  // l'overlay d'auth intercepte les vrais survols : on le rend perméable
  await page.evaluate(() => { const o = document.getElementById('auth-overlay'); if (o) o.style.pointerEvents = 'none'; });

  // un vrai lien biblique dans un message, comme dans l'app
  await page.evaluate(() => {
    const cont = document.createElement('div');
    cont.className = 'message-content';
    cont.id = 'repro-msg';
    cont.innerHTML = '<a class="bible-ref" href="https://www.biblegateway.com/x" target="_blank">Gn 1:1</a>';
    cont.style.cssText = 'position:fixed;left:80px;top:120px;z-index:2147480000;font-size:18px';
    document.body.appendChild(cont);
  });
  await page.hover('#repro-msg .bible-ref');
  await page.waitForTimeout(1200);

  const etat = async (etape) => await page.evaluate((e) => {
    const vt = document.getElementById('bible-verse-tip');
    const hb = document.getElementById('hb-tip');
    const lt = document.getElementById('lt-tip');
    const syr = document.getElementById('syr-tip');
    const vis = el => !!el && el.style.display !== 'none' && getComputedStyle(el).display !== 'none';
    return {
      etape: e,
      verset: vis(vt), hb: vis(hb), lt: vis(lt), syr: vis(syr),
      mots: vt ? vt.querySelectorAll('#hb-slot .hb').length : 0,
      motsLt: vt ? vt.querySelectorAll('#hb-slot .lt').length : 0,
      motsSyr: vt ? vt.querySelectorAll('#hb-slot .syr').length : 0
    };
  }, etape);
  console.log('1. après survol du lien  :', JSON.stringify(await etat('apres-lien')));

  // survol d'un mot hébreu DANS l'infobulle du verset
  const pos = await page.evaluate(() => {
    const w = document.querySelector('#bible-verse-tip #hb-slot .hb');
    if (!w) return null;
    const r = w.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (!pos) { console.log('AUCUN mot hébreu trouvé dans le panneau'); await browser.close(); server.close(); return; }
  await page.mouse.move(pos.x, pos.y);
  await page.waitForTimeout(900);
  console.log('2. après survol du mot   :', JSON.stringify(await etat('apres-mot')));

  // micro-mouvement DANS la carte du mot (le geste qui casse tout)
  const pos2 = await page.evaluate(() => {
    const t = document.getElementById('hb-tip');
    if (!t || t.style.display === 'none') return null;
    const r = t.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + 14 };
  });
  if (pos2) {
    await page.mouse.move(pos2.x, pos2.y);
    await page.waitForTimeout(400);
    console.log('3. après 1er mouvement   :', JSON.stringify(await etat('mvt-1')));
    await page.mouse.move(pos2.x + 6, pos2.y + 6);
    await page.waitForTimeout(400);
    console.log('4. après 2e mouvement    :', JSON.stringify(await etat('mvt-2')));
  } else {
    console.log('3/4. la carte du mot n’était déjà plus ouverte');
  }
  await browser.close(); server.close();
})().catch(e => { console.log('ERR:', String(e).slice(0, 300)); process.exit(1); });
