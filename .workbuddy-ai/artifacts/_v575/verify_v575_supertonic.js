/* ═══════════════════════════════════════════════════════════════════════
   Banc v575 (REPRISE v576) — le doublon voix (port 7788 + wrapper dédié)
   est RETIRÉ : Adeodat suit PARAMÈTRES → Lecture vocale (v109, dont le
   point de sortie unique est ttsEmission). Garde-fou :
     1. plus de window.__v575TtsVoice, plus de flag __v575 sur ttsEmission ;
     2. plus de rangée #adeodat-tts-mode dans le panneau ;
     3. le badge unifié v576 (#adeodat-voix) est présent à la place.
   SR doublé, magasin isolé (règle v559). ═══════════════════════════════ */
const H = require('../../../tools/bench_common.js');
const { chromium } = require('playwright');
const path = require('path'), os = require('os'), fs = require('fs');

const resultats = [];
function section(t) { console.log('\n■ ' + t); }
function ok(label, cond, detail) {
  resultats.push({ label, pass: !!cond });
  console.log((cond ? '  [OK]   ' : '  [ECHEC]') + ' ' + label + (detail ? ' — ' + detail : ''));
}

(async () => {
  const port = await H.pickFreePort();
  const STORE_DIR = path.join(os.tmpdir(), 'theo_v575b_store_' + Date.now());
  try { fs.mkdirSync(STORE_DIR, { recursive: true }); } catch (e) {}
  const relais = await H.spawnRelay({ port, localAppData: STORE_DIR });
  const BASE = 'http://127.0.0.1:' + port + '/THEOLOGICUS.html';
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const bruit = [];
  page.on('pageerror', e => bruit.push(String(e)));
  await page.addInitScript(H.isolationInit);
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);

  await page.evaluate(() => {
    window.__srInstances = [];
    window.SpeechRecognition = function () {
      const self = this;
      this.lang = ''; this.continuous = false; this.interimResults = false;
      window.__srInstances.push(self);
      this.start = function () {}; this.stop = function () {};
    };
  });

  section('1. Panneau ouvert');
  await page.click('#adeodat-orbe');
  await page.waitForFunction(() => {
    const p = document.getElementById('adeodat-pan');
    return p && p.style.display === 'flex';
  }, null, { timeout: 8000 });
  await page.waitForFunction(() => !!document.getElementById('adeodat-voix'), null, { timeout: 8000 });

  section('2. Le doublon v575 est bien RETIRÉ');
  const retrait = await page.evaluate(() => ({
    api: typeof window.__v575TtsVoice,
    flag: !!(window.ttsEmission && window.ttsEmission.__v575),
    rangee: !!document.getElementById('adeodat-tts-mode')
  }));
  ok('window.__v575TtsVoice n\u2019existe plus', retrait.api === 'undefined', retrait.api);
  ok('ttsEmission n\'est plus wrappé par v575', retrait.flag === false);
  ok('la rangée #adeodat-tts-mode n\'existe plus', retrait.rangee === false);

  section('3. Le badge unifié v576 est en place');
  const badge = await page.evaluate(() => {
    const b = document.getElementById('adeodat-voix');
    return b ? { txt: b.textContent, api: typeof window.__v576AdeodatVoix } : null;
  });
  ok('badge #adeodat-voix présent dans le panneau', !!badge);
  ok('l\'API __v576AdeodatVoix est exposée', !!badge && badge.api === 'object');
  ok('le badge reflète le moteur PAR DÉFAUT (Système)', !!badge && badge.txt.indexOf('Voix système') !== -1, badge ? badge.txt : '');

  section('4. Propreté');
  ok('aucune erreur JavaScript', bruit.length === 0, bruit.slice(0, 2).join(' | '));

  await browser.close();
  try { await H.killRelay(relais); } catch (e) {}

  const bons = resultats.filter(r => r.pass).length;
  console.log('\n========================================================================');
  console.log('RESULTAT : ' + bons + '/' + resultats.length);
  if (bons !== resultats.length) {
    console.log('Échecs :');
    resultats.filter(r => !r.pass).forEach(r => console.log('  - ' + r.label));
    process.exit(1);
  }
})().catch(e => { console.error('EXCEPTION :', e); process.exit(2); });
