/* Banc v449 — prononciation 🔊 dans les infobulles.
   ttsEmission/ttsStop sont substitués (le module résout les globales à
   l'appel) : on capture (texte, langue) au lieu d'écouter réellement. */
const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const PORT = 8808; const ROOT = 'C:/tmp/theoverify';
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

  const api = await page.evaluate(() => window.__v449Phon ? Object.keys(window.__v449Phon) : null);
  ok('API v449 exposée (prononce/prononceChaine/boutonVerset)', api && api.indexOf('prononce') >= 0, JSON.stringify(api));

  // espion TTS (le module résout les globales à l'appel)
  await page.evaluate(() => {
    window.__spy = [];
    /* modélisation réaliste : PAS de voix hébraïque native (false), toutes
       les autres voix existent (true) et appellent onEnd asynchronement. */
    window.ttsStop = function () {};
    window.ttsEmission = function (txt, lang, onEnd, onErr) {
      window.__spy.push({ txt: String(txt), lang: lang });
      if (lang === 'hebreu') return false;
      if (onEnd) setTimeout(onEnd, 5);
      return true;
    };
  });

  // 1. API directe : arabe, grec, hébreu (canal natif)
  const r1 = await page.evaluate(() => ({
    ar: window.__v449Phon.prononce('كِتَاب', 'arabic'),
    gr: window.__v449Phon.prononce('λόγος', 'greek'),
    hb: window.__v449Phon.prononce('בְּרֵאשִׁית', 'hebrew')
  }));
  const spy1 = await page.evaluate(() => window.__spy);
  ok('arabe → ttsEmission(lang « arabe »)', r1.ar === 'natif' && spy1.some(s => s.lang === 'arabe' && /كِتَاب/.test(s.txt)), JSON.stringify(spy1.map(s => s.lang)));
  ok('grec → ttsEmission(lang « grec »)', r1.gr === 'natif' && spy1.some(s => s.lang === 'grec' && /λόγος/.test(s.txt)), '');
  ok('hébreu → tentative native émise (lang « hébreu »), repli si voix absente', spy1.some(s => s.lang === 'hebreu' && /בְּרֵאשִׁית/.test(s.txt)) && r1.hb === 'translit', 'canal=' + r1.hb);

  // 2. repli phonétique : voix hébraïque absente → translittération latine
  await page.evaluate(() => { window.__spy = []; });
  const r2 = await page.evaluate(() => window.__v449Phon.prononce('בְּרֵאשִׁית', 'hebrew'));
  const spy2 = await page.evaluate(() => window.__spy);
  ok('hébreu sans voix native → repli translittération « français »', r2 === 'translit' && spy2.some(s => s.lang === 'francais' && /^[a-zà-ÿ'\-]+$/i.test(s.txt)), JSON.stringify(spy2.map(s => s.lang + ':' + s.txt.slice(0, 20))));

  // 3. infobulle hébreu : le bouton 🔊 est injecté et prononce le mot
  await page.evaluate(() => { window.__spy = []; window.__spyReturn = true; });
  await page.evaluate(() => {
    const cont = document.createElement('div');
    cont.id = 'v449-test-hb';
    cont.innerHTML = '<span class="hb" data-h="בְּרֵאשִׁית" data-t="berechit" data-s="H7225" data-m="N-CFS">בְּרֵאשִׁית</span>';
    cont.style.cssText = 'position:fixed;left:60px;top:80px;z-index:2147480000;font-size:20px';
    document.body.appendChild(cont);
  });
  await page.hover('#v449-test-hb .hb');
  await page.waitForTimeout(900);
  const hasBtn = await page.evaluate(() => {
    const tip = document.getElementById('hb-tip');
    const b = tip && tip.querySelector('.v449-btn');
    return b ? { oui: true, mot: (tip.querySelector('.hb-mot') || {}).textContent } : { oui: false };
  });
  ok('infobulle hébreu → bouton 🔊 injecté', hasBtn.oui === true, JSON.stringify(hasBtn));
  await page.evaluate(() => document.querySelector('#hb-tip .v449-btn').click());
  await page.waitForTimeout(200);
  const spy3 = await page.evaluate(() => window.__spy);
  ok('clic 🔊 hébreu → prononce le mot affiché (lang « hébreu »)', spy3.some(s => s.lang === 'hebreu'), JSON.stringify(spy3.map(s => s.lang)));

  // 4. bouton « verset en langue source » dans le panneau
  const r4 = await page.evaluate(() => {
    const slot = document.createElement('div');
    slot.id = 'hb-slot';
    slot.innerHTML = '<span class="hb" data-h="בָּרָא">בָּרָא</span> <span class="hb" data-h="אֱלֹהִים">אֱלֹהִים</span>';
    document.body.appendChild(slot);
    window.__v449Phon.boutonVerset(slot);
    const b = slot.querySelector('.v449-verse-btn');
    if (!b) return { btn: false };
    window.__spy = [];
    b.click();
    return { btn: true };
  });
  await page.waitForTimeout(300);
  const n4 = await page.evaluate(() => window.__spy.length);
  ok('bouton 🔊 verset : chaîne des 2 mots hébreux prononcée', r4.btn === true && n4 >= 2, 'appels : ' + n4);

  // 5. infobulle de verset coranique : 🔊 TTS arabe à côté de la récitation
  const r5 = await page.evaluate(async () => {
    /* l'infobulle coranique est créée à la demande : on simule son ouverture */
    let tip = document.getElementById('quran-verse-tip');
    if (!tip) { tip = document.createElement('div'); tip.id = 'quran-verse-tip'; document.body.appendChild(tip); }
    tip.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    tip.innerHTML = '<button id="quran-audio-btn">🎧 Écouter la récitation</button>'
      + '<div><span class="qw"><span class="qw-h">بِسْمِ</span></span> <span class="qw"><span class="qw-h">ٱللَّهِ</span></span></div>';
    await new Promise(r => setTimeout(r, 200));
    const b = tip.querySelector('.v449-quran-btn');
    if (!b) return { tip: true, btn: false };
    window.__spy = [];
    b.click();
    return { tip: true, btn: true, n: window.__spy.length, txt: window.__spy[0] ? window.__spy[0].txt : '', lang: window.__spy[0] ? window.__spy[0].lang : '' };
  });
  ok('infobulle de verset coranique → bouton 🔊 TTS arabe', r5.btn === true && r5.lang === 'arabe' && /بِسْمِ/.test(r5.txt), JSON.stringify(r5).slice(0, 90));

  ok('aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
  console.log(`RESULTAT : ${pass}/10`);
  process.exitCode = pass === 10 ? 0 : 1;
  await browser.close(); server.close();
})().catch(e => { console.log('EXCEPTION BANC :', e); process.exitCode = 1; process.exit(1); });
