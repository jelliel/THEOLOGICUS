/* ═══════════════════════════════════════════════════════════════════════
   Banc v568 — ADEODAT RÉACTIF (V3e) : orbe = écoute directe, session micro
   continue (anti-stop Windows), TTS phrase-par-phrase, latence réduite.

   Vérifie (fetch + TTS + SR DOUBLÉS, magasin isolé — règle v559) :
     1. CLIC sur l'ORBE → le panneau s'ouvre ET la session micro démarre
        automatiquement (instance SR créée — écoute directe demandée).
     2. La phrase reconnue part à Adeodat (bulle user) — mode mains libres.
     3. onend → REDÉMARRAGE auto de la session (le micro ne s'arrête plus
        au bout d'un moment — défaut Windows constaté).
     4. TTS PHRASE-PAR-PHRASE : pendant le STREAMING, la première phrase
        est lue AVANT la fin du flux (latence perçue) — la file lit
        séquentiellement ; à la fin, la réponse n'est PAS relue en entier.
     5. LATENCE : le corps de la requête porte max_tokens=700 et le
        contexte est borné (system + ≤8 messages d'historique + user).
     6. Toggle 🎤 → la session s'arrête (relance stoppée).
   ═══════════════════════════════════════════════════════════════════ */
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
  const STORE_DIR = path.join(os.tmpdir(), 'theo_v568_store_' + Date.now());
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

  /* semer le modèle actif (règle v559) + TTS/SR doublés */
  await page.evaluate(() => {
    const st = (typeof state !== 'undefined') ? state : window.state;
    st.keys = st.keys || {};
    st.keys.agnes = 'banc-cle-factice';
    st.model = 'agnes:agnes-2.5-flash';
    window.__ttsPhrases = [];
    if (typeof ttsEmission === 'function') {
      window.ttsEmission = function (texte, lang, onEnd) {
        window.__ttsPhrases.push(String(texte).slice(0, 50));
        if (onEnd) setTimeout(onEnd, 30);       /* la file avance */
        return true;
      };
    }
    localStorage.removeItem('theo_adeodat_v1');
    /* doublure du fetch LLM : réponse STREAMÉE (SSE via body.getReader) */
    window.__llmReq = null;
    const enc = s2 => new TextEncoder().encode(s2);
    window.fetch = async function (url, opts) {
      if (String(url).indexOf('/chat/completions') !== -1) {
        window.__llmReq = JSON.parse(opts.body);
        const parts = [];
        ['Première phrase complète. ', 'Deuxième phrase plus longue, avec détails.', 'Troisième phrase finale.'].forEach(function (m) {
          parts.push(enc('data: ' + JSON.stringify({ choices: [{ delta: { content: m } }] }) + '\n\n'));
        });
        parts.push(enc('data: [DONE]\n\n'));
        const plat = [];
        parts.forEach(function (c) { c.forEach(function (b) { plat.push(b); }); });
        const tout = new Uint8Array(plat);
        let lu = false;
        return { ok: true, status: 200, body: { getReader: function () { return { read: async function () { return lu ? { done: true } : (lu = true, { done: false, value: tout }); } }; } } };
      }
      return { ok: false, status: 404, text: async function () { return ''; } };
    };
  });

  /* ── 1. ORBE = ouvrir + ÉCOUTE directe ── */
  section('1. CLIC sur l\'orbe → panneau + SESSION MICRO automatique');
  await page.evaluate(() => {
    /* classe SR FAUSSE : instances pilotables */
    window.__srInstances = [];
    window.SpeechRecognition = function () {
      const self = this;
      this.lang = ''; this.continuous = false; this.interimResults = false;
      this.__demarre = false; this.__arrete = false;
      window.__srInstances.push(self);
      this.start = function () { self.__demarre = true; };
      this.stop = function () { self.__demarre = false; self.__arrete = true; if (self.onend) self.onend(); };
      this.abort = function () {};
    };
    window.__cancels = 0;
    if (window.speechSynthesis) window.speechSynthesis.cancel = function () { window.__cancels++; };
    document.getElementById('adeodat-orbe').click();
  });
  await page.waitForFunction(() => {
    const p = document.getElementById('adeodat-pan');
    return p && p.style.display === 'flex' && window.__srInstances.length >= 1 &&
           window.__srInstances[0].__demarre;
  }, { timeout: 10000 });
  const orbe = await page.evaluate(() => ({
    panneau: document.getElementById('adeodat-pan').style.display === 'flex',
    instances: window.__srInstances.length,
    demarree: window.__srInstances[0].__demarre,
    barreIn: window.__cancels >= 1
  }));
  ok('l\'orbe ouvre le panneau ET démarre la session micro', orbe.panneau && orbe.demarree);
  ok('barre-in immédiate (le TTS en cours se tait)', orbe.barreIn);

  /* ── 2. mains libres : la phrase reconnue part à Adeodat ── */
  section('2. Mains libres : la phrase reconnue part à Adeodat');
  await page.evaluate(() => {
    const inst = window.__srInstances[window.__srInstances.length - 1];
    inst.onresult({ results: [[{ transcript: 'Qui es-tu ?' }]] });
  });
  await page.waitForFunction(() => {
    const tx = document.querySelector('#adeodat-msgs .ad-assistant:last-of-type .ad-tx');
    return tx && tx.textContent.indexOf('Première phrase') !== -1;
  }, { timeout: 15000 });
  const mainsLibres = await page.evaluate(() => {
    const users = document.querySelectorAll('#adeodat-msgs .ad-user');
    const derniere = users[users.length - 1];
    return { user: derniere ? derniere.querySelector('.ad-tx').textContent : '' };
  });
  ok('la phrase RECONNUE part à Adeodat (bulle user « Qui es-tu ? »)',
     mainsLibres.user === 'Qui es-tu ?', JSON.stringify(mainsLibres.user));

  /* ── 3. anti-stop Windows : onend → relance ── */
  section('3. Session micro : onend → RELANCE automatique (anti-stop Windows)');
  const nbAvant = await page.evaluate(() => window.__srInstances.length);
  await page.evaluate(() => {
    const inst = window.__srInstances[window.__srInstances.length - 1];
    if (inst.onend) inst.onend();
  });
  await page.waitForTimeout(700);
  const nbApres = await page.evaluate(() => window.__srInstances.length);
  ok('après onend, une NOUVELLE instance est démarrée (relance auto)',
     nbApres >= nbAvant + 1 && await page.evaluate(() => window.__srInstances[window.__srInstances.length - 1].__demarre),
     'instances ' + nbAvant + ' → ' + nbApres);

  /* ── 4. TTS phrase-par-phrase pendant le streaming ── */
  section('4. TTS phrase-par-phrase : première phrase lue PENDANT le streaming');
  const tts = await page.evaluate(() => ({ phrases: window.__ttsPhrases.slice(), n: window.__ttsPhrases.length }));
  ok('les phrases sont lues SÉPARÉMENT (3 phrases = 3 appels TTS)',
     tts.n === 3 && tts.phrases[0].indexOf('Première phrase') !== -1 &&
     tts.phrases[1].indexOf('Deuxième phrase') !== -1,
     JSON.stringify(tts.phrases));
  ok('la réponse n\'est PAS relue en entier après coup (file déjà parlée)',
     tts.phrases.every(p => p.indexOf('Troisième') !== -1 ? p.indexOf('Troisième phrase finale.') === 0 : true) &&
     tts.n === 3);

  /* ── 5. latence : max_tokens 700 + contexte borné ── */
  section('5. Latence : max_tokens 700 + contexte ≤ 8 messages d\'historique');
  const lat = await page.evaluate(() => ({
    maxTokens: window.__llmReq ? window.__llmReq.max_tokens : null,
    messages: window.__llmReq ? window.__llmReq.messages.length : 0
  }));
  ok('max_tokens = 700 (réponses bornées)', lat.maxTokens === 700, 'max_tokens=' + lat.maxTokens);
  ok('contexte borné : system + ≤8 historique + user', lat.messages <= 10, 'messages=' + lat.messages);

  /* ── 6. toggle 🎤 = arrêt de session ── */
  section('6. Toggle 🎤 : arrêt de la session (relance stoppée)');
  const avantStop = await page.evaluate(() => window.__srInstances.length);
  await page.click('#adeodat-mic');
  await page.waitForTimeout(900);   /* couvre le timer de relance 400 ms */
  const apresStop = await page.evaluate(async () => {
    const avant = window.__srInstances.length;
    await new Promise(r2 => setTimeout(r2, 1000));   /* aucune relance ne doit survenir */
    return { avant, total: window.__srInstances.length,
             continu: window.__v566Libre.continuGet(),
             derniereDemarree: window.__srInstances[window.__srInstances.length - 1].__demarre };
  });
  ok('le toggle 🎤 coupe le mode continu (continuGet=false)',
     apresStop.continu === false);
  ok("AUCUNE relance pendant 1 s (l'arrêt est stable, pas de fantôme)",
     apresStop.total === apresStop.avant, apresStop.avant + ' → ' + apresStop.total);
  ok('la dernière instance SR est arrêtée', apresStop.derniereDemarree === false);

  /* ── 7. propreté ── */
  section('7. Propreté');
  const vraiesErreurs = bruit.filter(t => !/net::|Failed to load resource|theologicus|chat\/completions/i.test(t));
  ok('aucune erreur JS non attendue', vraiesErreurs.length === 0, vraiesErreurs.slice(0, 2).join(' | '));

  const passe = resultats.filter(r => r.pass).length;
  console.log('\nRESULTAT : ' + passe + '/' + resultats.length);
  await browser.close();
  H.killRelay(relais);
  process.exit(passe === resultats.length ? 0 : 3);
})().catch(e => { console.error(e); process.exit(3); });
