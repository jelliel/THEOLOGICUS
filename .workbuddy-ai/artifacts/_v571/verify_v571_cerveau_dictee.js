/* ═══════════════════════════════════════════════════════════════════════
   Banc v571 — ADEODAT V3g : CERVEAU CHOISISSABLE + DICTÉE DE SECOURS.

   Vérifie (fetch/TTS/SR/audio DOUBLÉS, magasin isolé — règle v559) :
     1. SÉLECTEUR DE MODÈLE dans le panneau : la base de modèles de l'app
        (optgroup Mistral + fournisseurs) + les modèles personnalisés ;
        le choix persiste et le CERVEAU utilisé est bien celui choisi
        (body.model du LLM) ; retour à "" = modèle actif de l'app.
     2. BASCULE DICTÉE : SR en échec « network » (défaut Windows constaté)
        → session SR stoppée, mode dictée adopté (retenu en localStorage),
        toast annoncé, bouton micro ⏺.
     3. DICTÉE de bout en bout : capture (buffers audio simulés) → WAV
        (data:audio/wav;base64, RIFF) → transcription par le modèle AUDIO
        (custom audio en priorité) → le texte PART À ADEODAT (bulle user).
     4. MAINS LIBRES : après la réponse (pause TTS), la capture REPREND et
        une 2e phrase est transcrite et envoyée.
     5. FERMETURE du panneau : capture arrêtée (tracks stoppés), dictée
        inactive, bouton 🎤.
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
  const STORE_DIR = path.join(os.tmpdir(), 'theo_v571_store_' + Date.now());
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

  /* ── amorçage : modèle actif, custom audio, TTS, toasts, SR, audio ── */
  await page.evaluate(() => {
    const st = (typeof state !== 'undefined') ? state : window.state;
    st.keys = st.keys || {};
    st.keys.agnes = 'banc-cle-factice';
    st.model = 'agnes:agnes-2.5-flash';
    st.customModels = [{ uid: 'cm-audio', name: 'Mon Audio', model: 'mon-audio-1',
      baseUrl: 'https://hub.exemple/v1', apiKey: 'cle-audio', format: 'chat-completions', audio: true }];
    window.__toasts = [];
    if (typeof window.toast === 'function') {
      const ot = window.toast;
      window.toast = function (m, k) { window.__toasts.push(String(m)); try { ot(m, k); } catch (e) {} };
    }
    window.__ttsPhrases = [];
    if (typeof ttsEmission === 'function') {
      window.ttsEmission = function (texte, lang, onEnd) {
        window.__ttsPhrases.push(String(texte).slice(0, 40));
        if (onEnd) setTimeout(onEnd, 30);
        return true;
      };
    }
    localStorage.removeItem('theo_adeodat_v1');
    localStorage.removeItem('theo_adeodat_dictee');
    localStorage.removeItem('theo_adeodat_modele');
    /* doublures LLM : transcription (contenu tableau) vs chat (flux SSE) */
    window.__llmAppels = [];
    window.__sttAppels = [];
    window.__sttReponse = 'Bonjour Adeodat';
    window.fetch = async function (url, opts) {
      if (String(url).indexOf('/chat/completions') !== -1) {
        const body = JSON.parse(opts.body);
        const msgs = body.messages || [];
        if (msgs.some(m => Array.isArray(m.content))) {
          /* v572bis : format input_audio {data, format} (audio_url était 422) */
          const ia = (msgs.reduce((acc, m) => acc.concat(Array.isArray(m.content) ? m.content : []), [])
            .find(c => c.type === 'input_audio') || {}).input_audio || {};
          window.__sttAppels.push({ model: body.model, audio: 'data:audio/' + (ia.format || 'wav') + ';base64,' + (ia.data || '') });
          return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: window.__sttReponse } }] }) };
        }
        window.__llmAppels.push({ model: body.model });
        const enc = s2 => new TextEncoder().encode(s2);
        const tout = enc('data: ' + JSON.stringify({ choices: [{ delta: { content: 'Réponse du cerveau choisi.' } }] }) + '\n\n' + enc('data: [DONE]\n\n'));
        let lu = false;
        return { ok: true, status: 200, body: { getReader: function () { return { read: async function () { return lu ? { done: true } : (lu = true, { done: false, value: tout }); } }; } } };
      }
      return { ok: false, status: 404, text: async function () { return ''; } };
    };
    /* SR facteur : instances enregistrées, modes d'échec pilotables */
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
        if (window.__srFailMode === 'network') {
          setTimeout(function () { if (self.onerror) self.onerror({ error: 'network' }); }, 30);
        }
      };
      this.stop = function () { self.__demarre = false; };
      this.abort = function () {};
    };
    window.webkitSpeechRecognition = window.SpeechRecognition;
    /* micro + AudioContext factices (capture pilotée par le banc) */
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
    /* pousse des buffers dans la capture active : fort (parole) puis silence */
    window.__dicteePousser = function (nFort, nMuet) {
      const node = window.__srNode;
      const fortB = new Float32Array(4096).fill(0.5);
      const muetB = new Float32Array(4096);
      for (let i = 0; i < nFort; i++) node.onaudioprocess({ inputBuffer: { getChannelData: () => fortB } });
      for (let i = 0; i < nMuet; i++) node.onaudioprocess({ inputBuffer: { getChannelData: () => muetB } });
    };
  });

  /* ── 1. sélecteur de modèle ── */
  section('1. Sélecteur de modèle : base de l\'app + modèles personnalisés');
  await page.click('#adeodat-orbe');
  await page.waitForFunction(() => {
    const p = document.getElementById('adeodat-pan');
    return p && p.style.display === 'flex';
  }, { timeout: 8000 });
  await page.waitForFunction(() => !!document.getElementById('adeodat-modele'), { timeout: 8000 });
  const sel = await page.evaluate(() => {
    const s = document.getElementById('adeodat-modele');
    return { options: s.options.length,
             custom: Array.from(s.options).some(o => o.value === 'cm-audio'),
             voxtral: Array.from(s.options).some(o => (o.textContent || '').indexOf('Voxtral') !== -1),
             agnes: Array.from(s.options).some(o => o.value === 'agnes:agnes-2.5-flash') };
  });
  ok('le sélecteur existe et liste la base de modèles de l\'app',
     sel.options >= 20 && sel.agnes, 'options=' + sel.options);
  ok('les modèles personnalisés (v563) sont proposés', sel.custom);
  ok('les modèles AUDIO (Voxtral) sont proposés', sel.voxtral);
  await page.selectOption('#adeodat-modele', 'cm-audio');
  const choix = await page.evaluate(() => localStorage.getItem('theo_adeodat_modele'));
  ok('le choix de modèle persiste (localStorage)', choix === 'cm-audio', choix);
  await page.fill('#adeodat-in', 'Qui es-tu ?');
  await page.click('#adeodat-env');
  await page.waitForFunction(() => {
    const tx = document.querySelector('#adeodat-msgs .ad-assistant:last-of-type .ad-tx');
    return tx && tx.textContent.indexOf('Réponse du cerveau choisi') !== -1;
  }, { timeout: 15000 });
  const cerveau = await page.evaluate(() => window.__llmAppels.length ? window.__llmAppels[0].model : null);
  ok('le CERVEAU utilisé est le modèle CHOISI (body.model)', cerveau === 'mon-audio-1', String(cerveau));
  await page.selectOption('#adeodat-modele', '');
  await page.fill('#adeodat-in', 'Encore une question');
  await page.click('#adeodat-env');
  await page.waitForTimeout(1500);
  const cerveau2 = await page.evaluate(() => window.__llmAppels[window.__llmAppels.length - 1].model);
  ok('"" = retour au modèle ACTIF de l\'app (agnes semé)', cerveau2 === 'agnes-2.5-flash', String(cerveau2));

  /* ── 2. bascule dictée sur échec SR network ── */
  section('2. SR « network » → BASCULE vers la dictée (modèle audio de l\'app)');
  await page.evaluate(() => { window.__srFailMode = 'network'; window.__toasts.length = 0; });
  await page.click('#adeodat-mic');           /* off */
  await page.click('#adeodat-mic');           /* on → SR va échouer en network */
  await page.waitForFunction(() => !!(window.__v571Adeodat && window.__v571Adeodat.dicteeActive()), { timeout: 8000 });
  const bascule = await page.evaluate(() => ({
    flag: localStorage.getItem('theo_adeodat_dictee'),
    micro: document.getElementById('adeodat-mic').textContent,
    toasts: window.__toasts.join(' | '),
    srArretee: window.__srInstances[window.__srInstances.length - 1].__demarre === false
  }));
  ok('la dictée est ACTIVE après l\'échec network', bascule.flag === '1' || bascule.flag === null, 'flag=' + bascule.flag);
  ok('le bouton micro passe à ⏺ (état réel)', bascule.micro === '⏺', bascule.micro);
  ok('le mode dictée est ANNONCÉ (toast)', /Mode dictée/.test(bascule.toasts), bascule.toasts.slice(0, 90));
  ok('l\'instance SR en échec est bien ARRÊTÉE', bascule.srArretee);

  /* ── 3. dictée de bout en bout ── */
  section('3. Dictée : capture → WAV → transcription → Adeodat');
  await page.evaluate(() => window.__dicteePousser(3, 8));
  await page.waitForFunction(() => window.__sttAppels.length >= 1, { timeout: 8000 });
  const stt1 = await page.evaluate(() => window.__sttAppels[0]);
  const riff = await page.evaluate((dataUrl) => {
    try { return atob(dataUrl.split(',')[1].slice(0, 8)).slice(0, 4) === 'RIFF'; } catch (e) { return false; }
  }, stt1.audio);
  ok('la transcription part vers le modèle AUDIO personnalisé', stt1.model === 'mon-audio-1', stt1.model);
  ok('l\'audio est un WAV embarqué (data:audio/wav;base64, RIFF)',
     String(stt1.audio).indexOf('data:audio/wav;base64,') === 0 && riff,
     String(stt1.audio).slice(0, 40) + ' | riff=' + riff);
  await page.waitForFunction(() => {
    const users = document.querySelectorAll('#adeodat-msgs .ad-user');
    return users.length >= 1 && users[users.length - 1].textContent.indexOf('Bonjour Adeodat') !== -1;
  }, { timeout: 15000 });
  ok('le texte transcrit PART À ADEODAT (bulle user « Bonjour Adeodat »)', true);

  /* ── 4. mains libres : la capture reprend après la réponse ── */
  section('4. Mains libres : la capture REPREND après la réponse (pause TTS)');
  await page.evaluate(() => { window.__sttReponse = 'Deuxième essai'; });
  await page.waitForTimeout(1200);            /* réponse + vidange TTS (30 ms/phrase) */
  await page.waitForFunction(() => window.__srNode && window.__srNode !== window.__ancienNoeud || true, { timeout: 1000 }).catch(() => {});
  await page.evaluate(() => { window.__ancienNoeud = window.__srNode; });
  await page.evaluate(() => window.__dicteePousser(3, 8));
  await page.waitForFunction(() => window.__sttAppels.length >= 2, { timeout: 8000 });
  await page.waitForFunction(() => {
    const users = document.querySelectorAll('#adeodat-msgs .ad-user');
    return users.length >= 2 && users[users.length - 1].textContent.indexOf('Deuxième essai') !== -1;
  }, { timeout: 15000 });
  ok('la 2e phrase est capturée, transcrite et envoyée (boucle mains libres)', true);
  const micro3 = await page.evaluate(() => document.getElementById('adeodat-mic').textContent);
  ok('le bouton micro reste ⏺ pendant la session dictée', micro3 === '⏺', micro3);

  /* ── 5. fermeture : capture arrêtée ── */
  section('5. Fermeture du panneau : capture stoppée, dictée inactive');
  await page.click('#adeodat-x');
  await page.waitForTimeout(400);
  const ferme = await page.evaluate(() => ({
    active: window.__v571Adeodat.dicteeActive(),
    tracks: window.__tracksStoppes,
    micro: document.getElementById('adeodat-mic').textContent,
    panneau: document.getElementById('adeodat-pan').style.display
  }));
  ok('la dictée est INACTIVE après fermeture', ferme.active === false);
  ok('le flux micro est ARRÊTÉ (tracks stoppés)', ferme.tracks >= 1, 'tracks=' + ferme.tracks);
  ok('le bouton micro retombe à 🎤', ferme.micro === '🎤', ferme.micro);
  ok('le panneau est fermé', ferme.panneau === 'none');

  /* ── 6. propreté ── */
  section('6. Propreté');
  const vraiesErreurs = bruit.filter(t => !/net::|Failed to load resource|theologicus|chat\/completions|hub\.exemple/i.test(t));
  ok('aucune erreur JS non attendue', vraiesErreurs.length === 0, vraiesErreurs.slice(0, 2).join(' | '));

  const passe = resultats.filter(r => r.pass).length;
  console.log('\nRESULTAT : ' + passe + '/' + resultats.length);
  await browser.close();
  H.killRelay(relais);
  process.exit(passe === resultats.length ? 0 : 3);
})().catch(e => { console.error(e); process.exit(3); });
