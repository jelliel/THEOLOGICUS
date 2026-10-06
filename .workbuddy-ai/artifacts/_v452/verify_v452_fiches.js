/* Banc v452 — les fiches de mot ne s'évaporent plus en chemin.
   Parcours humain réel : lien → mot → trajet vers la fiche → fiche.
   Vérifie aussi que la SORTIE RÉELLE ferme toujours (comportement préservé). */
const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const PORT = 8840; const ROOT = 'C:/tmp/theoverify';
const PW = 'C:/Users/toshr/AppData/Local/ms-playwright';
let pass = 0;
const ok = (name, cond, detail) => { console.log(` ${cond ? '[OK] ' : '[ECHEC]'}${name}${cond || detail === undefined ? '' : ' — ' + String(detail).slice(0, 80)}`); if (cond) pass++; };
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
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 120)));
  await page.addInitScript(() => localStorage.setItem('theologicus_wizard_skipped', '1'));
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const o = document.getElementById('auth-overlay'); if (o) o.style.pointerEvents = 'none'; if (window.__loadBibleNow) window.__loadBibleNow(); });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const cont = document.createElement('div');
    cont.className = 'message-content'; cont.id = 'v452-msg';
    cont.innerHTML = '<a class="bible-ref" href="#" target="_blank">Gn 1:1</a>';
    cont.style.cssText = 'position:fixed;left:80px;top:300px;z-index:2147480000;font-size:18px';
    document.body.appendChild(cont);
  });
  const api = await page.evaluate(() => window.__v452Cartes ? Object.keys(window.__v452Cartes) : null);
  ok('API v452 exposée (carteOuverte/couloirConnu/ancre)', api && api.indexOf('couloirConnu') >= 0, JSON.stringify(api));

  const vis = (id) => page.evaluate(i => { const c = document.getElementById(i); return !!c && c.style.display !== 'none' && getComputedStyle(c).display !== 'none'; }, id);
  const box = (sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + Math.min(12, b.height / 2) }; }, sel);

  // ouvrir le panneau
  const lien = await box('#v452-msg .bible-ref');
  await page.mouse.move(lien.x, lien.y);
  await page.waitForTimeout(800);
  ok('panneau du verset ouvert au survol du lien', await vis('bible-verse-tip'));

  const slotInfo = await page.evaluate(() => {
    const pan = document.querySelector('#bible-verse-tip');
    return pan ? { hb: pan.querySelectorAll('.hb').length, lt: pan.querySelectorAll('.lt').length, syr: pan.querySelectorAll('.syr').length } : 'PAS DE PANNEAU';
  });
  console.log('   slot (mots):', JSON.stringify(slotInfo));

  // parcours : mot → trajet → fiche, pour chaque alphabet présent
  const cas = [
    ['hébreu', '#bible-verse-tip .hb', 'hb-tip'],
    ['latin', '#bible-verse-tip .lt', 'lt-tip'],
    ['syriaque', '#bible-verse-tip .syr', 'syr-tip']
  ];
  for (const [nom, selMot, idCarte] of cas) {
    const mot = await box(selMot);
    if (!mot) { ok(`fiche ${nom} : mot présent`, false, 'mot introuvable'); continue; }
    await page.mouse.move(mot.x, mot.y);
    await page.waitForTimeout(700);
    const ouverte = await vis(idCarte);
    ok(`fiche ${nom} : s'ouvre au survol du mot`, ouverte, idCarte);
    if (!ouverte) continue;
    const fiche = await box('#' + idCarte);
    for (let i = 1; i <= 8; i++) { await page.mouse.move(mot.x + (fiche.x - mot.x) * i / 8, mot.y + (fiche.y - mot.y) * i / 8); await page.waitForTimeout(55); }
    await page.waitForTimeout(300);
    ok(`fiche ${nom} : SURVIT au trajet vers elle`, await vis(idCarte));
    await page.mouse.move(fiche.x + 5, fiche.y + 5);
    await page.waitForTimeout(300);
    ok(`fiche ${nom} : survit au micro-mouvement dedans`, await vis(idCarte));
    // sortie réelle : on s'éloigne franchement
    await page.mouse.move(1200, 860);
    await page.waitForTimeout(600);
    ok(`fiche ${nom} : la sortie réelle ferme toujours (comportement préservé)`, !(await vis(idCarte)));
  }

  // grec : verset du NT (Jn 1:1) → ligne grecque
  await page.evaluate(() => {
    const c = document.getElementById('v452-msg');
    if (c) c.innerHTML = '<a class="bible-ref" href="#" target="_blank">Jn 1:1</a>';
  });
  const lien2 = await box('#v452-msg .bible-ref');
  await page.mouse.move(lien2.x, lien2.y);
  await page.waitForTimeout(1200);
  const motGr = await box('#bible-verse-tip .gr');
  if (motGr) {
    await page.mouse.move(motGr.x, motGr.y);
    await page.waitForTimeout(800);
    ok('fiche grec : s\'ouvre au survol du mot', await vis('gr-tip'));
    const fg = await box('#gr-tip');
    for (let i = 1; i <= 8; i++) { await page.mouse.move(motGr.x + (fg.x - motGr.x) * i / 8, motGr.y + (fg.y - motGr.y) * i / 8); await page.waitForTimeout(55); }
    await page.waitForTimeout(300);
    ok('fiche grec : SURVIT au trajet vers elle', await vis('gr-tip'));
    await page.mouse.move(1240, 880);
    await page.waitForTimeout(600);
    ok('fiche grec : la sortie réelle ferme toujours', !(await vis('gr-tip')));
  } else {
    ok('fiche grec : mot grec présent dans le panneau NT', false, 'mot introuvable');
  }

  ok('aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
  console.log(`RESULTAT : ${pass}/18`);
  process.exitCode = pass === 18 ? 0 : 1;
  await browser.close(); server.close();
})().catch(e => { console.log('EXCEPTION BANC :', e); process.exitCode = 1; process.exit(1); });
