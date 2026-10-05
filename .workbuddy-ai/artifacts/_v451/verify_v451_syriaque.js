/* Banc v451 — Peshitta syriaque mot-à-mot.
   Corpus RÉEL syriaque/bN.js + translittération v37 + TTS espion. */
const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const PORT = 8812; const ROOT = 'C:/tmp/theoverify';
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
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 120)));
  await page.addInitScript(() => localStorage.setItem('theologicus_wizard_skipped', '1'));
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const api = await page.evaluate(() => window.__v451Syr ? Object.keys(window.__v451Syr) : null);
  ok('API v451 exposée (bibleSyr/remplirSyriaque/translit/prononce)', api && api.indexOf('bibleSyr') >= 0, JSON.stringify(api));

  await page.evaluate(() => {
    window.__spy = [];
    window.ttsStop = function () {};
    window.ttsEmission = function (txt, lang, onEnd, onErr) { window.__spy.push({ txt: String(txt), lang: lang }); if (onEnd) setTimeout(onEnd, 5); return true; };
  });

  // 1. corpus réel : Gn 1:1 en syriaque
  const gn = await page.evaluate(() => window.__v451Syr.bibleSyr(1).then(l => l['1']['1']));
  ok('Peshitta Gn 1:1 servie depuis syriaque/b1.js', /ܒܪܺܝܫܺܝܬ/.test(gn), String(gn).slice(0, 40));

  // 2. NT non couvert (pas de source libre) : garde propre
  const nt = await page.evaluate(() => window.__v451Syr.bibleSyr(43));
  ok('livre 43 (Jean) → null (NT Peshitta absent, pas d’erreur)', nt === null, String(nt));

  // 3. translittération syriaque réelle
  const tr = await page.evaluate(() => window.__v451Syr.translit('ܒܪܺܝܫܺܝܬ݂'));
  ok('translittération syriaque → lettres latines', /[a-z]{3,}/i.test(tr), String(tr).slice(0, 30));

  // 4. ligne « ܀ Peshitta » injectée dans un panneau OT
  await page.evaluate(() => {
    const panneau = document.createElement('div');
    panneau.innerHTML = '<div id="hb-slot"></div>';
    document.body.appendChild(panneau);
    window.__v451Syr.remplirSyriaque({ book: '1', ch: 1, v1: 1, v2: 2 }, panneau);
  });
  await page.waitForTimeout(500);
  const r4 = await page.evaluate(() => {
    const slot = document.querySelector('#hb-slot');
    const mots = slot.querySelectorAll('.syr[data-syr]');
    return { n: mots.length, premier: mots[0] ? mots[0].getAttribute('data-syr') : '', btn: !!slot.querySelector('.syr-verse-btn') };
  });
  ok('ligne « ܀ Peshitta » : mots syriaques survolables injectés', r4.n >= 10 && /ܒܪܺܝܫܺܝܬ/.test(r4.premier), JSON.stringify(r4).slice(0, 80));
  ok('bouton 🔊 verset syriaque présent', r4.btn === true);

  // 5. panneau NT → pas de ligne syriaque
  const r5 = await page.evaluate(() => {
    const panneau = document.createElement('div');
    panneau.innerHTML = '<div id="hb-slot"></div>';
    document.body.appendChild(panneau);
    window.__v451Syr.remplirSyriaque({ book: '43', ch: 1, v1: 1, v2: 1 }, panneau);
    return panneau.querySelectorAll('.syr-slot').length;
  });
  ok('panneau NT (Jean) → aucune ligne syriaque (limitation documentée)', r5 === 0, 'lignes : ' + r5);

  // 6. fiche de mot + clic 🔊 (translittération d'abord)
  await page.evaluate(() => {
    const el = document.querySelector('#hb-slot .syr[data-syr]');
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  });
  await page.waitForTimeout(300);
  const r6 = await page.evaluate(() => {
    const t = document.getElementById('syr-tip');
    return { ouvert: t && t.style.display === 'block', say: !!(t && t.querySelector('.syr-say')), texte: (t ? t.textContent : '').slice(0, 80) };
  });
  ok('survol mot syriaque → fiche avec translittération et 🔊', r6.ouvert && r6.say, JSON.stringify(r6).slice(0, 100));
  await page.evaluate(() => { window.__spy = []; document.querySelector('#syr-tip .syr-say').click(); });
  await page.waitForTimeout(150);
  const spy = await page.evaluate(() => window.__spy);
  ok('clic 🔊 → translittération lue en voix française', spy.length >= 1 && spy[0].lang === 'francais' && /[a-z]/i.test(spy[0].txt), JSON.stringify(spy));

  ok('aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
  console.log(`RESULTAT : ${pass}/10`);
  process.exitCode = pass === 10 ? 0 : 1;
  await browser.close(); server.close();
})().catch(e => { console.log('EXCEPTION BANC :', e); process.exitCode = 1; process.exit(1); });
