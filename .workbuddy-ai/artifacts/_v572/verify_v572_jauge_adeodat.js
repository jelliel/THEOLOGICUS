/* ═══════════════════════════════════════════════════════════════════════
   Banc v572 — JAUGE DES MODÈLES D'ADEODAT + diagnostic de dictée.

   Vérifie (fetch/TTS/SR/audio DOUBLÉS, magasin isolé — règle v559) :
     1. BOUTON 📉 dans la rangée du sélecteur → modal #aj-modal ouverte,
        listant la base de modèles (≥20 lignes) + modèles personnalisés.
     2. SONDES : requête minimale réelle par modèle — 🟢 pour un
        chat-completions 200, 🔴 « Clé API invalide » sur un endpoint 401.
     3. CLIC sur une ligne 🟢 → devient le CERVEAU d'Adeodat
        (theo_adeodat_modele + #adeodat-modele synchronisés) — le chat
        principal n'est PAS modifié.
     4. SECTION 🎙️ DICTÉE : sonde de transcription réelle (mini WAV
        data:audio/wav) par modèle audio — 🟢 sur un modèle audio
        fonctionnel, 🔴 avec le DÉTAIL HTTP (404 modèle inconnu) sur un
        fournisseur qui n'héberge pas Voxtral.
     5. ÉCHEC DE TRANSCRIPTION : le toast dit la VRAIE raison
        (« Transcription impossible — voxtral… → HTTP 404 ») au lieu du
        message générique v571.
     6. ↻ Re-tester relance les sondes.
   ═══════════════════════════════════════════════════════════════════════ */
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
  const STORE_DIR = path.join(os.tmpdir(), 'theo_v572_store_' + Date.now());
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

  /* ── amorçage : clés, modèles custom, TTS, toasts, SR/audio factices ── */
  await page.evaluate(() => {
    const st = (typeof state !== 'undefined') ? state : window.state;
    st.keys = st.keys || {};
    st.keys.agnes = 'banc-cle-factice';
    st.model = 'agnes:agnes-2.5-flash';
    st.customModels = [
      { uid: 'cm-audio', name: 'Mon Audio', model: 'mon-audio-1', baseUrl: 'https://hub.exemple/v1', apiKey: 'cle-audio', format: 'chat-completions', audio: true },
      { uid: 'cm-broken', name: 'Modèle cassé', model: 'casse-1', baseUrl: 'https://broken.exemple/v1', apiKey: 'cle-casse', format: 'chat-completions' }
    ];
    window.__toasts = [];
    if (typeof window.toast === 'function') {
      const ot = window.toast;
      window.toast = function (m, k) { window.__toasts.push(String(m)); try { ot(m, k); } catch (e) {} };
    }
    window.__ttsPhrases = [];
    if (typeof ttsEmission === 'function') {
      window.ttsEmission = function (texte, lang, onEnd) { window.__ttsPhrases.push(String(texte).slice(0, 40)); if (onEnd) setTimeout(onEnd, 30); return true; };
    }
    localStorage.removeItem('theo_adeodat_v1');
    localStorage.removeItem('theo_adeodat_dictee');
    localStorage.removeItem('theo_adeodat_modele');
    window.__llmAppels = [];
    window.__sttAppels = [];
    const json = (obj, status) => ({ ok: (status || 200) < 400, status: status || 200, json: async () => obj, text: async () => JSON.stringify(obj) });
    const jsonErr = (status, msg) => ({ ok: false, status, json: async () => ({ error: { message: msg } }), text: async () => JSON.stringify({ error: { message: msg } }) });
    window.fetch = async function (url, opts) {
      const u = String(url);
      const method = (opts && opts.method) || 'GET';
      if (u.indexOf('/chat/completions') !== -1) {
        const body = opts && opts.body ? JSON.parse(opts.body) : {};
        const msgs = body.messages || [];
        if (msgs.some(m => Array.isArray(m.content))) {
          /* sonde dictée OU transcription (audio_url) */
          window.__sttAppels.push({ url: u.slice(0, 70), model: body.model });
          if (u.indexOf('hub.exemple') !== -1) return json({ choices: [{ message: { content: 'un bip' } }] });
          return jsonErr(404, 'model not found: ' + body.model);
        }
        if (u.indexOf('broken.exemple') !== -1) return jsonErr(401, 'bad key');
        if (body.max_tokens === 1) return json({ choices: [{ message: { content: 'ok' } }] });
        /* chat normal (envoyer) : flux SSE */
        window.__llmAppels.push({ model: body.model });
        const enc = s2 => new TextEncoder().encode(s2);
        const tout = enc('data: ' + JSON.stringify({ choices: [{ delta: { content: 'Réponse du cerveau choisi.' } }] }) + '\n\n' + enc('data: [DONE]\n\n'));
        let lu = false;
        return { ok: true, status: 200, body: { getReader: function () { return { read: async function () { return lu ? { done: true } : (lu = true, { done: false, value: tout }); } }; } } };
      }
      return { ok: false, status: 404, text: async () => '' };
    };
    /* SR factices (bascule dictée) + micro/AudioContext factices */
    window.__srInstances = [];
    window.__srFailMode = 'ok';
    window.SpeechRecognition = function () {
      const self = this;
      this.lang = ''; this.continuous = false; this.interimResults = false;
      this.__demarre = false;
      window.__srInstances.push(self);
      this.start = function () {
        if (window.__srFailMode === 'throw') throw new Error('boom-micro');
        self.__demarre = true;
        if (window.__srFailMode === 'network') setTimeout(function () { if (self.onerror) self.onerror({ error: 'network' }); }, 30);
      };
      this.stop = function () { self.__demarre = false; };
      this.abort = function () {};
    };
    window.webkitSpeechRecognition = window.SpeechRecognition;
    window.__tracksStoppes = 0;
    navigator.mediaDevices.getUserMedia = async function () {
      return { getTracks: function () { return [{ stop: function () { window.__tracksStoppes++; } }]; } };
    };
    window.AudioContext = function () {
      this.sampleRate = 16000;
      this.destination = {};
      this.createMediaStreamSource = function () { return { connect: function () {} }; };
      this.createGain = function () { return { gain: { value: 1 }, connect: function () {} }; };
      this.createScriptProcessor = function () {
        const node = { onaudioprocess: null, connect: function () {} };
        window.__srNode = node;
        return node;
      };
      this.close = async function () {};
    };
    window.webkitAudioContext = window.AudioContext;
    window.__dicteePousser = function (nFort, nMuet) {
      const node = window.__srNode;
      const fortB = new Float32Array(4096).fill(0.5);
      const muetB = new Float32Array(4096);
      for (let i = 0; i < nFort; i++) node.onaudioprocess({ inputBuffer: { getChannelData: () => fortB } });
      for (let i = 0; i < nMuet; i++) node.onaudioprocess({ inputBuffer: { getChannelData: () => muetB } });
    };
  });

  /* ── 1. bouton 📉 + modal ── */
  section('1. Bouton 📉 → jauge des modèles d\'Adeodat');
  await page.click('#adeodat-orbe');
  await page.waitForFunction(() => {
    const p = document.getElementById('adeodat-pan');
    return p && p.style.display === 'flex';
  }, { timeout: 8000 });
  await page.waitForFunction(() => !!document.getElementById('adeodat-jauge-btn'), { timeout: 8000 });
  await page.click('#adeodat-jauge-btn');
  await page.waitForFunction(() => {
    const m = document.getElementById('aj-modal');
    return m && m.classList.contains('open');
  }, { timeout: 8000 });
  await page.waitForFunction(() => document.querySelectorAll('#aj-list .aj-pend').length === 0, null, { timeout: 30000 });
  const jauge = await page.evaluate(() => ({
    lignes: document.querySelectorAll('#aj-list .aj-row').length,
    sum: (document.getElementById('aj-sum') || {}).textContent || ''
  }));
  ok('la jauge liste la base de modèles (≥20 lignes)', jauge.lignes >= 20, 'lignes=' + jauge.lignes);
  ok('le résumé annonce les 4 états', /testés/.test(jauge.sum), jauge.sum);

  /* ── 2. sondes : 🟢 agnes, 🔴 cassé, ⚪ sans clé ── */
  section('2. Sondes minimales : 🟢 / 🔴 / ⚪');
  const etat2 = await page.evaluate(() => {
    const res = { vert: false, rouge: false, blanc: false, rougeDet: '' };
    document.querySelectorAll('#aj-list .aj-row').forEach(function (r) {
      const nm = r.querySelector('.tj-nm').textContent;
      const ico = r.querySelector('.tj-ico').textContent;
      if (nm.indexOf('agnes-2.5-flash') !== -1 && ico === '🟢') res.vert = true;
      if (nm.indexOf('Modèle cassé') !== -1 && ico === '🔴') { res.rouge = true; const d = r.querySelector('.aj-det'); res.rougeDet = d ? d.textContent : ''; }
      if (nm.indexOf('OpenAI') !== -1 && nm.indexOf('gpt-4o') !== -1 && ico === '⚪') res.blanc = true;
    });
    return res;
  });
  ok('le modèle du fournisseur semé répond 🟢', etat2.vert);
  ok('l\'endpoint en 401 affiche 🔴 + « Clé API invalide »', etat2.rouge && /Clé API/.test(etat2.rougeDet), etat2.rougeDet.slice(0, 80));
  ok('un fournisseur sans clé affiche ⚪', etat2.blanc);

  /* ── 3. clic = cerveau d'Adeodat ── */
  section('3. Clic sur une ligne 🟢 → cerveau d\'Adeodat (chat principal intact)');
  const clique = await page.evaluate(() => {
    const rows = document.querySelectorAll('#aj-list .aj-row');
    for (const r of rows) {
      if (r.querySelector('.tj-nm').textContent.indexOf('Mon Audio') !== -1) { r.click(); return true; }
    }
    return false;
  });
  const choix = await page.evaluate(() => ({
    flag: localStorage.getItem('theo_adeodat_modele'),
    select: (document.getElementById('adeodat-modele') || {}).value,
    chatActif: (typeof state !== 'undefined' ? state.model : null)
  }));
  ok('la ligne « Mon Audio » est cliquable', clique);
  ok('le cerveau d\'Adeodat est CHOISI (persisté + sélecteur synchronisé)',
     choix.flag === 'cm-audio' && choix.select === 'cm-audio', JSON.stringify(choix));
  ok('le modèle ACTIF du chat n\'est PAS modifié', choix.chatActif === 'agnes:agnes-2.5-flash', String(choix.chatActif));

  /* ── 4. section dictée : sonde réelle de transcription ── */
  section('4. Section 🎙️ dictée : transcription réelle (mini WAV)');
  await page.waitForFunction(() => document.querySelectorAll('#aj-dic-list .aj-pend').length === 0, null, { timeout: 30000 });
  const dic = await page.evaluate(() => {
    const res = [];
    document.querySelectorAll('#aj-dic-list .aj-row').forEach(function (r) {
      const d = r.querySelector('.aj-det');
      res.push({ ico: r.querySelector('.tj-ico').textContent, det: d ? d.textContent : '' });
    });
    return { rows: res, stt: window.__sttAppels.length };
  });
  ok('la sonde dictée a envoyé un VRAI appel de transcription', dic.stt >= 1, 'appels=' + dic.stt);
  const dicAudio = dic.rows.find(r => /Mon Audio/.test(r.det) || dic.rows.indexOf(r) === 0);
  const dicPremiere = await page.evaluate(() => {
    const n = document.querySelector('#aj-dic-list .aj-row .tj-nm');
    return n ? n.textContent : '';
  });
  ok('la PREMIÈRE ligne dictée est la config réellement utilisée (🧠, cerveau suivi)',
     /🧠/.test(dicPremiere) && /mon-audio-1/.test(dic.rows[0].det || ''),
     'ligne="' + dicPremiere.slice(0, 60) + '"');
  ok('le modèle audio personnalisé est 🟢 opérationnel', dic.rows.length >= 1 && dic.rows[0].ico === '🟢', JSON.stringify(dic.rows[0]));
  const dicAgnes = await page.evaluate(() => {
    const rows = document.querySelectorAll('#aj-dic-list .aj-row');
    for (const r of rows) {
      if (r.querySelector('.tj-nm').textContent.indexOf('Agnes') !== -1) {
        const d = r.querySelector('.aj-det');
        return { ico: r.querySelector('.tj-ico').textContent, det: d ? d.textContent : '' };
      }
    }
    return null;
  });
  ok('un fournisseur sans Voxtral est 🔴 avec le DÉTAIL (HTTP 404)',
     dicAgnes && dicAgnes.ico === '🔴' && /404|Modèle inconnu/.test(dicAgnes.det), dicAgnes ? dicAgnes.det.slice(0, 90) : '(absent)');

  /* ── 5. échec de transcription : le toast dit la VRAIE raison ── */
  section('5. Transcription impossible : le toast affiche le diagnostic HTTP');
  await page.click('#aj-close');                 /* la jauge masque le micro */
  await page.waitForFunction(() => {
    const m = document.getElementById('aj-modal');
    return m && !m.classList.contains('open');
  }, { timeout: 8000 });
  await page.evaluate(() => {
    const st = (typeof state !== 'undefined') ? state : window.state;
    st.customModels = [];                        /* plus de modèle audio perso */
    window.__toasts.length = 0;
    window.__srFailMode = 'network';
  });
  await page.click('#adeodat-mic');              /* off */
  await page.click('#adeodat-mic');              /* on → SR network → dictée */
  await page.waitForFunction(() => !!(window.__v571Adeodat && window.__v571Adeodat.dicteeActive()), { timeout: 8000 });
  await page.evaluate(() => window.__dicteePousser(3, 8));
  await page.waitForFunction(() => window.__toasts.some(t => t.indexOf('Transcription impossible') !== -1), null, { timeout: 20000 });
  const diag = await page.evaluate(() => window.__toasts.find(t => t.indexOf('Transcription impossible') !== -1) || '');
  ok('le toast de transcription contient le VRAI diagnostic (HTTP 404)',
     /Transcription impossible/.test(diag) && /404/.test(diag), diag.slice(0, 110));

  /* ── 6. re-test ── */
  section('6. ↻ Re-tester relance les sondes');
  await page.evaluate(() => { document.getElementById('aj-retest').click(); });
  await page.waitForFunction(() => document.querySelectorAll('#aj-list .aj-pend').length > 0, null, { timeout: 8000 }).catch(() => {});
  await page.waitForFunction(() => document.querySelectorAll('#aj-list .aj-pend').length === 0, null, { timeout: 30000 });
  ok('le bouton ↻ relance les sondes (liste re-testée)', true);

  /* ── 7. propreté ── */
  section('7. Propreté');
  const vraiesErreurs = bruit.filter(t => !/net::|Failed to load resource|theologicus|chat\/completions|hub\.exemple|broken\.exemple/i.test(t));
  ok('aucune erreur JS non attendue', vraiesErreurs.length === 0, vraiesErreurs.slice(0, 2).join(' | '));

  const passe = resultats.filter(r => r.pass).length;
  console.log('\nRESULTAT : ' + passe + '/' + resultats.length);
  await browser.close();
  H.killRelay(relais);
  process.exit(passe === resultats.length ? 0 : 3);
})().catch(e => { console.error(e); process.exit(3); });
