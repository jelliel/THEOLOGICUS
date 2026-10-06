/* Banc v454 — le fond d'écran libère le quota de localStorage.
   Simule l'état de l'utilisateur : une image de fond volumineuse déjà dans
   localStorage. Vérifie la migration vers IndexedDB, la libération du quota,
   et que le fond s'affiche TOUJOURS (premier boot puis redémarrage). */
const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const PORT = 8870; const ROOT = 'C:/tmp/theoverify';
const PW = 'C:/Users/toshr/AppData/Local/ms-playwright';
let pass = 0;
const ok = (name, cond, detail) => { console.log(` ${cond ? '[OK] ' : '[ECHEC]'}${name}${cond || detail === undefined ? '' : ' — ' + String(detail).slice(0, 90)}`); if (cond) pass++; };
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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 110)));
  // fond volumineux (~2 Mo) déjà en localStorage, comme chez l'utilisateur
  await page.addInitScript(() => {
    try {
      var gros = 'data:image/png;base64,' + new Array(2 * 1024 * 1024).join('A');
      localStorage.setItem('theologicus-bg', gros);
      localStorage.setItem('theologicus-bg-enabled', '1');
      localStorage.setItem('theologicus-bg-opacity', '45');
      localStorage.setItem('theologicus-bg-type', 'image');
    } catch (e) { window.__seedErr = String(e); }
  });
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);

  const api = await page.evaluate(() => window.__v454Fond ? Object.keys(window.__v454Fond) : null);
  ok('API v454 exposée (migrer/etat/tailleLocale)', api && api.indexOf('migrer') >= 0, JSON.stringify(api));

  const apres = await page.evaluate(async () => {
    const ko = Math.round(window.__v454Fond.tailleLocale() / 1024);
    let idb = null;
    try { const rec = await db.get('settings', 'bg-image'); idb = rec && rec.value ? rec.value.length : 0; } catch (e) { idb = 'err'; }
    return {
      etat: window.__v454Fond.etat(),
      enLocal: window.__v454Fond.enLocal('theologicus-bg') ? 1 : 0,
      idb: idb,
      ko: ko,
      couche: (() => { const l = document.getElementById('custom-bg-layer'); return l ? (getComputedStyle(l).backgroundImage || '').slice(0, 30) + '|' + l.className : null; })(),
      classeCorps: document.body.classList.contains('custom-bg')
    };
  });
  ok('migration effectuée vers IndexedDB', apres.etat === 'migre' || apres.etat === 'libere', 'état=' + apres.etat);
  ok('l’image n’occupe PLUS localStorage', apres.enLocal === 0, 'présente : ' + apres.enLocal);
  ok('l’image est bien dans IndexedDB (settings/bg-image)', typeof apres.idb === 'number' && apres.idb > 2000000, 'taille IDB : ' + apres.idb);
  ok('le quota est libéré (espace local sous 500 Ko)', apres.ko < 500, 'espace : ' + apres.ko + ' Ko');
  ok('le fond est TOUJOURS affiché (couche + classe)', apres.classeCorps === true && /url\(/.test(String(apres.couche)), JSON.stringify({ c: apres.classeCorps, l: String(apres.couche).slice(0, 40) }));

  // 2. REDÉMARRAGE : plus rien en localStorage, le fond doit venir d'IndexedDB
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const reboot = await page.evaluate(() => {
    const l = document.getElementById('custom-bg-layer');
    return {
      enLocal: window.__v454Fond.enLocal('theologicus-bg'),
      classeCorps: document.body.classList.contains('custom-bg'),
      couche: l ? /url\(/.test(getComputedStyle(l).backgroundImage || '') : false
    };
  });
  ok('redémarrage : rien en localStorage', reboot.enLocal === false);
  ok('redémarrage : le fond vient d’IndexedDB et s’affiche', reboot.classeCorps === true && reboot.couche === true, JSON.stringify(reboot));

  // 3. écriture d'un nouveau fond : il ne repart PAS dans localStorage
  const nouveau = await page.evaluate(async () => {
    var gros = 'data:image/png;base64,' + new Array(300 * 1024).join('B');
    localStorage.setItem('theologicus-bg', gros);   // ce que fait l'app à l'upload
    await new Promise(r => setTimeout(r, 600));
    let idb = 0;
    try { const rec = await db.get('settings', 'bg-image'); idb = rec && rec.value ? rec.value.length : 0; } catch (e) {}
    return { enLocal: window.__v454Fond.enLocal('theologicus-bg') ? 1 : 0, idb: idb, ko: Math.round(window.__v454Fond.tailleLocale() / 1024) };
  });
  ok('nouveau fond : pas d’écriture localStorage', nouveau.enLocal === 0, 'présente : ' + nouveau.enLocal);
  ok('nouveau fond : écrit dans IndexedDB', nouveau.idb > 200000, 'IDB : ' + nouveau.idb);
  ok('nouveau fond : espace local toujours faible', nouveau.ko < 500, 'espace : ' + nouveau.ko + ' Ko');

  // 4. diagnostic du fond dans les Paramètres
  const diag = await page.evaluate(() => {
    window.__v454Fond.majEtat();
    const d = document.getElementById('v454-etat');
    return d ? d.textContent : null;
  });
  ok('diagnostic du fond affiché (état + espace local)', !!diag && /Fond/.test(diag) && /espace local/.test(diag), String(diag).slice(0, 100));

  ok('aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
  console.log(`RESULTAT : ${pass}/13`);
  process.exitCode = pass === 13 ? 0 : 1;
  await browser.close(); server.close();
})().catch(e => { console.log('EXCEPTION BANC :', e); process.exitCode = 1; process.exit(1); });
