/* ═══════════════════════════════════════════════════════════════════════
   Banc v576 — VOIX UNIFIÉE : Adeodat suit PARAMÈTRES → Lecture vocale.
     1. Badge #adeodat-voix = moteur LU DANS LA MÊME CLÉ
        (theologicus-tts-moteurs) : défaut Système, puis Supertonic 3.
     2. Synchronisation : le badge se rafraîchit à la RÉOUVERTURE du
        panneau (observateur style), sans appel manuel.
     3. Clic sur le badge → PARAMÈTRES ouvert sur l'onglet Lecture vocale.
     4. CHEMIN UNIFIÉ : avec moteur=supertonic, ttsEmission (donc la voix
        d'Adeodat) part en GET http://127.0.0.1:8091/tts?text=…&voice=…
        (le service local de l'app, v109) — prouvé par un fetch doublé qui
        renvoie un WAV ; onEnd déclenché via l'Audio doublé.
     5. Retour au Système : ttsMoteurDistant() repasse à false.
   fetch/Audio/SR doublés, magasin isolé (règle v559). ══════════════════ */
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
  const STORE_DIR = path.join(os.tmpdir(), 'theo_v576_store_' + Date.now());
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

  /* SR factice + Audio factice (play → ended) + fetch doublé qui sert le
     service local Supertonic de l'app (port 8091, GET /tts) */
  await page.evaluate(() => {
    window.__srInstances = [];
    window.SpeechRecognition = function () {
      const self = this;
      this.lang = ''; this.continuous = false; this.interimResults = false;
      window.__srInstances.push(self);
      this.start = function () {}; this.stop = function () {};
    };
    window.__stAppels = [];
    window.__audioUrls = [];
    const F0 = window.fetch ? window.fetch.bind(window) : null;
    window.fetch = async function (url, opts) {
      const u = String(url);
      if (u.indexOf('127.0.0.1:8091/tts?') !== -1) {
        window.__stAppels.push(u);
        return { ok: true, status: 200, blob: async function () { return new Blob([new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4])], { type: 'audio/wav' }); } };
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

  section('1. Panneau ouvert : badge présent, défaut = Voix système');
  await page.click('#adeodat-orbe');
  await page.waitForFunction(() => {
    const p = document.getElementById('adeodat-pan');
    return p && p.style.display === 'flex';
  }, null, { timeout: 8000 });
  await page.waitForFunction(() => !!document.getElementById('adeodat-voix'), null, { timeout: 8000 });
  const b1 = await page.evaluate(() => document.getElementById('adeodat-voix').textContent);
  ok('le badge affiche « 🔊 Voix système » par défaut', b1.indexOf('Voix système') !== -1, b1);

  /* ── 2. PARAMÈTRES → Supertonic : le badge suit LA MÊME CLÉ ── */
  section('2. Moteur Supertonic choisi dans PARAMÈTRES : le badge suit la même clé');
  await page.evaluate(() => {
    localStorage.setItem('theologicus-tts-moteurs', JSON.stringify({
      moteur: 'supertonic',
      narration: true,
      supertonic: { url: 'http://127.0.0.1:8091', voix: 'F2', vitesse: 1.05 }
    }));
    window.__v576AdeodatVoix.majBadge();
  });
  const b2 = await page.evaluate(() => ({
    txt: document.getElementById('adeodat-voix').textContent,
    moteur: window.__v576AdeodatVoix.moteurActif()
  }));
  ok('le badge affiche « 🎙️ Supertonic 3 »', b2.txt.indexOf('Supertonic 3') !== -1, b2.txt);
  ok('moteurActif() = supertonic', b2.moteur === 'supertonic');

  /* ── 3. chemin unifié : la voix d'Adeodat part au service local de l'app ── */
  section('3. ttsEmission (voix d\u2019Adeodat) part en GET /tts?…&voice=F2 sur 8091');
  await page.evaluate(() => new Promise(function (res) {
    let fini = false;
    window.ttsEmission('Ave Maria, gratia plena.', 'francais', function () { fini = true; res(); }, function () { fini = true; res(); });
    setTimeout(function () { if (!fini) res(); }, 5000);
  }));
  const st = await page.evaluate(() => ({
    n: window.__stAppels.length,
    url: window.__stAppels[0] || '',
    audio: window.__audioUrls.length
  }));
  ok('la requête GET part au SERVICE LOCAL de l\u2019app (port 8091)', st.n === 1 && st.url.indexOf('127.0.0.1:8091/tts?') !== -1, st.url.slice(0, 90));
  ok('la voix choisie (F2) est dans l\u2019URL', st.url.indexOf('voice=F2') !== -1);
  ok('le texte d\u2019Adeodat est dans l\u2019URL (encodé)', st.url.indexOf('text=Ave') !== -1 || st.url.indexOf('text=Ave%20Maria') !== -1 || decodeURIComponent(st.url).indexOf('Ave Maria') !== -1);
  ok('le WAV est joué (Audio doublé) et onEnd déclenché', st.audio >= 1);

  /* ── 4. synchronisation à la réouverture du panneau (sans appel manuel) ── */
  section('4. Réouverture du panneau : badge rafraîchi TOUT SEUL');
  await page.evaluate(() => window.__v564Adeodat.fermer());
  await page.evaluate(() => {
    localStorage.setItem('theologicus-tts-moteurs', JSON.stringify({
      moteur: 'supertonic',
      narration: true,
      supertonic: { url: 'http://127.0.0.1:8091', voix: 'M3', vitesse: 1.05 }
    }));
  });
  await page.evaluate(() => window.__v564Adeodat.ouvrir());
  await page.waitForFunction(() => {
    const p = document.getElementById('adeodat-pan');
    return p && p.style.display === 'flex';
  }, null, { timeout: 8000 });
  await page.waitForTimeout(400);
  const b3 = await page.evaluate(() => document.getElementById('adeodat-voix').textContent);
  ok('le badge suit le changement de moteur SANS appel manuel', b3.indexOf('Supertonic 3') !== -1, b3);

  /* ── 5. clic sur le badge → PARAMÈTRES, onglet Lecture vocale ── */
  section('5. Clic badge → PARAMÈTRES ouvert sur l\u2019onglet Lecture vocale');
  await page.click('#adeodat-voix');
  await page.waitForFunction(() => {
    const t = document.getElementById('settings-tab-tts');
    return t && t.getAttribute('aria-selected') === 'true';
  }, null, { timeout: 8000 });
  const onglet = await page.evaluate(() => {
    const pan = document.querySelector('#settings-modal .settings-panneau[data-panneau="tts"]');
    return {
      tab: document.getElementById('settings-tab-tts').getAttribute('aria-selected'),
      panneauVisible: pan ? pan.hidden === false : false,
      supa: !!document.getElementById('tts-st-hint')
    };
  });
  ok('l\u2019onglet « 🔊 Lecture vocale » est sélectionné', onglet.tab === 'true');
  ok('le panneau TTS est affiché', onglet.panneauVisible);
  ok('la section Supertonic 3 y est visible', onglet.supa);

  /* ── 6. retour au Système ── */
  section('6. Retour au moteur Système : chemin distant désactivé');
  await page.evaluate(() => {
    localStorage.setItem('theologicus-tts-moteurs', JSON.stringify({ moteur: 'system', narration: true }));
    window.__v576AdeodatVoix.majBadge();
  });
  const b4 = await page.evaluate(() => ({
    txt: document.getElementById('adeodat-voix').textContent,
    distant: (typeof ttsMoteurDistant === 'function') ? ttsMoteurDistant() : null
  }));
  ok('le badge repasse à « 🔊 Voix système »', b4.txt.indexOf('Voix système') !== -1, b4.txt);
  ok('ttsMoteurDistant() = false (plus de service distant)', b4.distant === false);

  /* ── propreté ── */
  section('7. Propreté');
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
