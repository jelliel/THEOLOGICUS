/* Banc v447 — lecteur parallèle lié.
   Vérifie contre les corpus RÉELS : BJ embarquée, valtorta.json,
   paralleles.json (v190), et le chaînage Coran → Bible → Valtorta. */
const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const PORT = 8802; const ROOT = process.env.THEO_ROOT || 'C:/tmp/theoverify';
const PW = process.env.PW_DIR || 'C:/Users/toshr/AppData/Local/ms-playwright';
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
  const browser = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, process.env.PW_DIR ? { executablePath: path.join(PW, 'chromium-1234', 'chrome-win64', 'chrome.exe') } : {}));
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 120)));
  await page.addInitScript(() => localStorage.setItem('theologicus_wizard_skipped', '1'));
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const api = await page.evaluate(() => window.__v447Par ? Object.keys(window.__v447Par) : null);
  ok('API v447 exposée (cherche/ouvre/chercheValtorta…)', api && api.indexOf('cherche') >= 0, JSON.stringify(api));

  const col = id => (document.getElementById(id) || {}).textContent || '';
  // 1. Bible : Jn 2,1-11 (les noces de Cana)
  const r1 = await page.evaluate(async () => {
    await window.__v447Par.cherche('Jn 2,1-11', 'bible');
    return { c1: document.getElementById('v447-c1').textContent, c2: document.getElementById('v447-c2').textContent, c3: document.getElementById('v447-c3').textContent };
  });
  ok('Jn 2,1-11 → texte BJ local (mariage à Cana)', /Cana/i.test(r1.c1), r1.c1.slice(0, 60));
  ok('Jn 2,1-11 → épisode Valtorta « noces de Cana »', /noces de Cana/i.test(r1.c2) || /Cana/i.test(r1.c2), r1.c2.slice(0, 70));
  ok('Jn 2,1-11 → lien maria-valtorta.org présent', (await page.evaluate(() => document.getElementById('v447-c2').innerHTML.indexOf('maria-valtorta.org') >= 0)));

  // 2. Bible : Mt 5,3 → au moins un épisode Valtorta (Sermon sur la montagne)
  await page.evaluate(() => window.__v447Par.cherche('Mt 5,3', 'bible'));
  const n2 = await page.evaluate(() => document.getElementById('v447-c2').querySelectorAll('a[href*="maria-valtorta"]').length);
  ok('Mt 5,3 → épisodes Valtorta (Sermon) indexés', n2 >= 1, 'liens : ' + n2);

  // 3. Coran : 2:255 (Ayat al-Kursi) → parallèle + texte BJ réel + chaînage Valtorta
  const r3 = await page.evaluate(async () => {
    await window.__v447Par.cherche('2:255', 'coran');
    return { c1: document.getElementById('v447-c1').textContent, c2: document.getElementById('v447-c2').textContent, c3: document.getElementById('v447-c3').textContent };
  });
  ok('2:255 → verset local arabe/fr (Al-Baqara)', /Al-Baqara/i.test(r3.c1) || /Trône/i.test(r3.c1), r3.c1.slice(0, 60));
  ok('2:255 → parallèle curé « Ayat al-Kursi »', /al-Kursi|Trône/i.test(r3.c2), r3.c2.slice(0, 60));
  ok('2:255 → texte BJ réel du parallèle (Ex 3:14 « Je suis celui qui suis »)', /Je suis celui/i.test(r3.c2), r3.c2.slice(0, 80));
  ok('2:255 → chaînage Valtorta depuis les parallèles bibliques', /Valtorta/i.test(r3.c2) || /Valtorta/i.test(r3.c3), '');

  // 4. entrée invalide → message, pas de crash
  const r4 = await page.evaluate(async () => {
    await window.__v447Par.cherche('abcdefgh', 'bible');
    return document.getElementById('v447-c1').textContent;
  });
  ok('entrée invalide → message explicite, pas de crash', /non reconnue/i.test(r4), r4.slice(0, 60));

  ok('aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
  console.log(`RESULTAT : ${pass}/11`);
  process.exitCode = pass === 11 ? 0 : 1;
  await browser.close(); server.close();
})().catch(e => { console.log('EXCEPTION BANC :', e); process.exitCode = 1; process.exit(1); });
