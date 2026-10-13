/* ═══════════════════════════════════════════════════════════════════════
   Banc v575 — VOIX SUPERTONIC (Adeodat, voie 1 : serveur local) :
     1. Rangée de config dans le panneau (mode/port/voix/Tester) — défauts
        et visibilité (port+voix+Tester masqués en mode Système).
     2. Wrapper ttsEmission transparent en mode Système (le locuteur
        d'origine reçoit la phrase, aucune diversion).
     3. Mode Supertonic : la phrase part PAR LE RELAIS /fla/ au serveur
        (POST /v1/tts {text, voice, lang:'fr'}), le WAV est joué (Audio
        doublé), onEnd déclenché, la voix système NE parle PAS.
     4. Voix sélectionnable (F3) propagée dans le corps de la requête.
     5. Serveur en erreur (HTTP 500) : REPLI AUTOMATIQUE voix système +
        un SEUL toast d'alerte (pas de double alerte).
     6. Sonde Tester : /v1/health → toast « disponible — supertonic-3 ».
     7. Persistance (mode, port, voix).
   fetch/Audio/ttsEmission doublés, magasin isolé (règle v559). ═════════ */
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
  const STORE_DIR = path.join(os.tmpdir(), 'theo_v575_store_' + Date.now());
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

  /* SR factice (évite la capture dictée pendante) + toasts + fetch relais +
     Audio factice (play → ended) */
  await page.evaluate(() => {
    window.__srInstances = [];
    window.SpeechRecognition = function () {
      const self = this;
      this.lang = ''; this.continuous = false; this.interimResults = false;
      window.__srInstances.push(self);
      this.start = function () {}; this.stop = function () {};
    };
    window.__toasts = [];
    if (typeof window.toast === 'function') {
      const ot = window.toast;
      window.toast = function (m, k) { window.__toasts.push(String(m)); try { ot(m, k); } catch (e) {} };
    }
    window.__ttsAppels = [];
    window.__healthAppels = [];
    window.__sysAppels = [];
    window.__audioUrls = [];
    window.__supaMode = 'ok';
    const F0 = window.fetch ? window.fetch.bind(window) : null;
    window.fetch = async function (url, opts) {
      const u = String(url);
      if (u.indexOf('/fla/127.0.0.1:7788') !== -1 || u.indexOf('/fla/127.0.0.1:7799') !== -1) {
        if (u.indexOf('/v1/health') !== -1) {
          window.__healthAppels.push(u);
          return { ok: true, status: 200, json: async function () { return { status: 'ok', model: 'supertonic-3', sample_rate: 44100, voices_loaded: 10 }; } };
        }
        if (u.indexOf('/v1/tts') !== -1) {
          window.__ttsAppels.push({ url: u, body: JSON.parse(opts.body) });
          if (window.__supaMode === 'err') {
            return { ok: false, status: 500, blob: async function () { return new Blob(['x']); } };
          }
          return { ok: true, status: 200, blob: async function () { return new Blob([new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4])], { type: 'audio/wav' }); } };
        }
      }
      if (F0) return F0(url, opts);
      return { ok: false, status: 404, text: async function () { return ''; } };
    };
    window.Audio = function (url) {
      window.__audioUrls.push(String(url));
      this.src = url;
      this.play = function () {
        const self = this;
        setTimeout(function () { if (typeof self.onended === 'function') self.onended(); }, 10);
        return Promise.resolve();
      };
    };
  });

  /* ── 0. panneau ouvert ── */
  section('0. Panneau Adeodat ouvert');
  await page.click('#adeodat-orbe');
  await page.waitForFunction(() => {
    const p = document.getElementById('adeodat-pan');
    return p && p.style.display === 'flex';
  }, null, { timeout: 8000 });
  ok('panneau ouvert', true);
  await page.waitForFunction(() => !!document.getElementById('adeodat-tts-mode'), null, { timeout: 6000 });

  /* ── 1. rangée de config : défauts + visibilité ── */
  section('1. Rangée de config : défauts (Système, port 7788, M1) + éléments masqués');
  const cfg = await page.evaluate(() => ({
    mode: document.getElementById('adeodat-tts-mode').value,
    port: document.getElementById('adeodat-tts-port').value,
    voix: document.getElementById('adeodat-tts-voix').value,
    cachePort: document.getElementById('adeodat-tts-port').style.display === 'none',
    cacheVoix: document.getElementById('adeodat-tts-voix').style.display === 'none',
    cacheTest: document.getElementById('adeodat-tts-test').style.display === 'none',
    wrapper: !!(window.ttsEmission && window.ttsEmission.__v575)
  }));
  ok('mode par défaut = Système', cfg.mode === 'sys');
  ok('port par défaut = 7788', cfg.port === '7788');
  ok('voix par défaut = M1', cfg.voix === 'M1');
  ok('port/voix/Tester masqués en mode Système', cfg.cachePort && cfg.cacheVoix && cfg.cacheTest);
  ok('le wrapper ttsEmission est actif', cfg.wrapper);

  /* ── 2. mode Système : transparence ── */
  section('2. Mode Système : la phrase va au locuteur d\u2019origine (aucune diversion)');
  await page.evaluate(() => {
    /* remplace le wrapper par un enregistreur, puis ré-installe par-dessus */
    window.ttsEmission = function (texte, lang, onEnd) {
      window.__sysAppels.push(String(texte));
      if (typeof onEnd === 'function') setTimeout(onEnd, 5);
    };
    window.__v575TtsVoice.installe();
  });
  await page.evaluate(() => new Promise(function (res) {
    window.ttsEmission('test voix système', 'fr-FR', res, res);
    setTimeout(res, 3000);
  }));
  const sys1 = await page.evaluate(() => ({
    sys: window.__sysAppels.length,
    supa: window.__ttsAppels.length
  }));
  ok('la voix système a reçu la phrase', sys1.sys === 1, 'sys=' + sys1.sys);
  ok('aucune requête Supertonic', sys1.supa === 0);

  /* ── 3. mode Supertonic : relais + Audio + onEnd ── */
  section('3. Mode Supertonic : /fla/…/v1/tts → WAV → onEnd (voix système muette)');
  await page.evaluate(() => {
    const sel = document.getElementById('adeodat-tts-mode');
    sel.value = 'supa';
    sel.dispatchEvent(new Event('change'));
  });
  await page.waitForTimeout(120);
  const modeOk = await page.evaluate(() => ({
    cle: localStorage.getItem('theo_adeodat_tts_mode'),
    visible: document.getElementById('adeodat-tts-port').style.display !== 'none'
  }));
  ok('le mode Supertonic est persisté et la config visible', modeOk.cle === 'supa' && modeOk.visible);
  await page.evaluate(() => { window.__sysAppels.length = 0; });   /* ne compter QUE cet appel */
  await page.evaluate(() => new Promise(function (res) {
    let fini = false;
    window.ttsEmission('Bonjour test.', 'fr-FR', function () { fini = true; res(); }, function (e) { fini = true; res(); });
    setTimeout(function () { if (!fini) res(); }, 5000);
  }));
  const supa1 = await page.evaluate(() => ({
    body: window.__ttsAppels.length ? window.__ttsAppels[0].body : null,
    url: window.__ttsAppels.length ? window.__ttsAppels[0].url : '',
    audio: window.__audioUrls.length,
    sys: window.__sysAppels.length
  }));
  ok('la requête part au serveur VIA LE RELAIS /fla/ (pas de CORS)', supa1.url.indexOf('/fla/127.0.0.1:7788/v1/tts') !== -1, supa1.url.slice(-40));
  ok('corps conforme {text, voice:M1, lang:fr}',
     !!supa1.body && supa1.body.text === 'Bonjour test.' && supa1.body.voice === 'M1' && supa1.body.lang === 'fr',
     JSON.stringify(supa1.body));
  ok('le WAV est joué (Audio doublé)', supa1.audio >= 1);
  ok('la voix système reste muette pendant Supertonic', supa1.sys === 0, 'sys=' + supa1.sys);

  /* ── 4. voix sélectionnable ── */
  section('4. Voix sélectionnée (F3) propagée à la requête');
  await page.evaluate(() => {
    const s = document.getElementById('adeodat-tts-voix');
    s.value = 'F3';
    s.dispatchEvent(new Event('change'));
  });
  await page.evaluate(() => new Promise(function (res) {
    window.ttsEmission('Deuxième phrase.', 'fr-FR', res, res);
    setTimeout(res, 5000);
  }));
  const supa2 = await page.evaluate(() => ({
    voix: localStorage.getItem('theo_adeodat_tts_supa_voix'),
    body: window.__ttsAppels.length ? window.__ttsAppels[window.__ttsAppels.length - 1].body : null
  }));
  ok('voix F3 persistée et envoyée', supa2.voix === 'F3' && supa2.body && supa2.body.voice === 'F3', JSON.stringify(supa2.body));

  /* ── 5. serveur en erreur : repli système + un seul toast ── */
  section('5. HTTP 500 : repli automatique voix système + UNE alerte');
  await page.evaluate(() => { window.__supaMode = 'err'; window.__sysAppels.length = 0; });
  await page.evaluate(() => new Promise(function (res) {
    window.ttsEmission('phrase en panne', 'fr-FR', res, res);
    setTimeout(res, 5000);
  }));
  const err1 = await page.evaluate(() => ({
    sys: window.__sysAppels.length,
    toasts: window.__toasts.filter(t => t.indexOf('Supertonic injoignable') !== -1).length
  }));
  ok('la voix système prend le relais (jamais de silence)', err1.sys === 1, 'sys=' + err1.sys);
  ok('un seul toast d\u2019alerte', err1.toasts === 1, 'n=' + err1.toasts);
  await page.evaluate(() => new Promise(function (res) {
    window.ttsEmission('deuxième panne', 'fr-FR', res, res);
    setTimeout(res, 5000);
  }));
  const err2 = await page.evaluate(() => ({
    sys: window.__sysAppels.length,
    toasts: window.__toasts.filter(t => t.indexOf('Supertonic injoignable') !== -1).length
  }));
  ok('pas de double alerte au second échec', err2.sys === 2 && err2.toasts === 1, 'sys=' + err2.sys + ' toasts=' + err2.toasts);

  /* ── 6. sonde Tester : /v1/health ── */
  section('6. Tester : sonde /v1/health → « disponible — supertonic-3 »');
  await page.evaluate(() => { window.__supaMode = 'ok'; });
  await page.click('#adeodat-tts-test');
  await page.waitForFunction(() => window.__toasts.some(t => t.indexOf('Supertonic disponible') !== -1), null, { timeout: 8000 });
  const sonde = await page.evaluate(() => ({
    t: window.__toasts.find(t => t.indexOf('Supertonic disponible') !== -1) || '',
    n: window.__healthAppels.length
  }));
  ok('la sonde interroge la santé du serveur', sonde.n >= 1);
  ok('le toast porte le modèle et la fréquence', /supertonic-3/.test(sonde.t) && /44100/.test(sonde.t), sonde.t.slice(0, 90));

  /* ── 7. port personnalisé persisté ── */
  section('7. Port personnalisé (7799) persisté');
  await page.evaluate(() => {
    const p = document.getElementById('adeodat-tts-port');
    p.value = '7799';
    p.dispatchEvent(new Event('change'));
  });
  const portOk = await page.evaluate(() => ({
    cle: localStorage.getItem('theo_adeodat_tts_port'),
    champ: document.getElementById('adeodat-tts-port').value
  }));
  ok('le port 7799 est persisté', portOk.cle === '7799' && portOk.champ === '7799');

  /* ── propreté ── */
  section('8. Propreté');
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
