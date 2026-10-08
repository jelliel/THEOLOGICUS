/* Banc v450 — Vulgate latine mot-à-mot.
   Corpus RÉEL biblelt/bN.js + dictionnaire latin/mots.js + TTS espion. */
const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const PORT = 8810; const ROOT = process.env.THEO_ROOT || 'C:/tmp/theoverify';
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

  const api = await page.evaluate(() => window.__v450Lt ? Object.keys(window.__v450Lt) : null);
  ok('API v450 exposée (bibleLt/mots/remplirLatin/dictLookup)', api && api.indexOf('bibleLt') >= 0, JSON.stringify(api));

  // espion TTS
  await page.evaluate(() => {
    window.__spy = [];
    window.ttsStop = function () {};
    window.ttsEmission = function (txt, lang, onEnd, onErr) { window.__spy.push({ txt: String(txt), lang: lang }); return true; };
  });

  // 1. corpus réel : Mt 1:1 en latin
  const mt = await page.evaluate(() => window.__v450Lt.bibleLt(40).then(l => l['1']['1']));
  ok('Vulgate Mt 1:1 (« Liber generationis ») servie depuis biblelt/b40.js', /Liber generationis/.test(mt), String(mt).slice(0, 60));
  const gn = await page.evaluate(() => window.__v450Lt.bibleLt(1).then(l => l['1']['1']));
  ok('Vulgate Gn 1:1 (« In principio »)', /In principio/.test(gn), String(gn).slice(0, 60));

  // 2. dictionnaire latin : « in » → FR « dans »
  const dico = await page.evaluate(() => window.__v450Lt.mots().then(() => window.__v450Lt.dictLookup('in')));
  ok('dictionnaire latin chargé, « in » → FR « dans »', dico && /dans/.test(dico[4] || ''), JSON.stringify(dico).slice(0, 80));

  // 3. ligne latine injectée dans un panneau de verset
  const r3 = await page.evaluate(() => {
    const panneau = document.createElement('div');
    panneau.innerHTML = '<div id="hb-slot"></div>';
    document.body.appendChild(panneau);
    window.__v450Lt.remplirLatin({ book: '40', ch: 1, v1: 1, v2: 2 }, panneau);
    return { slot: true };
  });
  await page.waitForTimeout(500);
  const r3b = await page.evaluate(() => {
    const pan = document.querySelector('#hb-slot').parentNode;
    const lts = pan.querySelectorAll('.lt[data-l]');
    return {
      n: lts.length,
      premier: lts[0] ? lts[0].getAttribute('data-l') : '',
      btn: !!pan.querySelector('.lt-verse-btn')
    };
  });
  ok('ligne « ⚓ Vulgate » : mots survolables injectés', r3b.n >= 10 && r3b.premier === 'Liber', JSON.stringify(r3b));
  ok('bouton 🔊 verset latin présent', r3b.btn === true);

  // 4. fiche de mot au survol (dict + bouton prononcer)
  await page.evaluate(() => {
    const el = document.querySelector('.lt-slot .lt[data-l="generationis"]') || document.querySelector('.lt-slot .lt');
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  });
  await page.waitForTimeout(700);
  const r4 = await page.evaluate(() => {
    const t = document.getElementById('lt-tip');
    if (!t || t.style.display !== 'block') return { ouvert: false };
    return { ouvert: true, texte: t.textContent.slice(0, 120), say: !!t.querySelector('.lt-say') };
  });
  ok('survol mot latin → fiche ouverte avec bouton 🔊', r4.ouvert === true && r4.say === true, JSON.stringify(r4).slice(0, 120));

  // 5. clic 🔊 → ttsEmission(lang « latin »)
  await page.evaluate(() => { window.__spy = []; document.querySelector('#lt-tip .lt-say').click(); });
  await page.waitForTimeout(150);
  const spy = await page.evaluate(() => window.__spy);
  ok('clic 🔊 → ttsEmission(lang « latin »)', spy.length >= 1 && spy[0].lang === 'latin', JSON.stringify(spy));

  ok('aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
  console.log(`RESULTAT : ${pass}/9`);
  process.exitCode = pass === 9 ? 0 : 1;
  await browser.close(); server.close();
})().catch(e => { console.log('EXCEPTION BANC :', e); process.exitCode = 1; process.exit(1); });
