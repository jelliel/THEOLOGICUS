/* ═══════════════════════════════════════════════════════════════════════
   Banc v570 — ADEODAT MICRO FIABLE (V3f) : le micro ne vit QUE panneau
   ouvert, se suspend quand Adeodat parle, ne réagit qu'aux FINALS, et le
   bouton 🎤 dit la VÉRITÉ (défauts corrigés, constats utilisateur) :
     1. ORBE → panneau + session SR démarrée + bouton micro ⏺ (état réel).
     2. RÉSULTAT PARTIEL IGNORÉ (le polyfill Android pousse des partiels ;
        l'ancien moteur les envoyait chacun → réponses en rafale) ; le
        FINAL, lui, part bien à Adeodat.
     3. PENDANT LA RÉPONSE (TTS en cours) : micro SUSPENDU (aucune
        instance démarrée), puis REPRISE automatique quand la file TTS
        est vidange — plus de boucle d'écho micro→TTS→micro.
     4. FERMETURE du panneau : session ARRÊTÉE et AUCUNE relance pendant
        1,5 s — plus de micro « en permanence en arrière-plan » (bips
        système répétés constatés sur APK).
     5. RÉOUVERTURE par l'orbe : la session repart (micro vivant).
     6. FANTÔME WINDOWS : un start() en échec ne laisse PLUS de session
        fantôme — l'échec est toasté et un essai ultérieur REPART.
     7. Toggle 🎤 : arrêt stable (aucune relance fantôme pendant 1 s).
   SR/TTS/fetch DOUBLÉS, magasin isolé (règle v559). ════════════════════ */
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
  const STORE_DIR = path.join(os.tmpdir(), 'theo_v570_store_' + Date.now());
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

  /* modèle actif semé (règle v559) + TTS LENT (fenêtre de pause mesurable)
     + fetch LLM doublé (2 phrases) + toasts enregistrés */
  await page.evaluate(() => {
    const st = (typeof state !== 'undefined') ? state : window.state;
    st.keys = st.keys || {};
    st.keys.agnes = 'banc-cle-factice';
    st.model = 'agnes:agnes-2.5-flash';
    window.__toasts = [];
    if (typeof window.toast === 'function') {
      const ot = window.toast;
      window.toast = function (m, k) { window.__toasts.push(String(m)); try { ot(m, k); } catch (e) {} };
    }
    window.__ttsPhrases = [];
    if (typeof ttsEmission === 'function') {
      window.ttsEmission = function (texte, lang, onEnd, onErr) {
        window.__ttsPhrases.push(String(texte).slice(0, 50));
        if (typeof onEnd === 'function') setTimeout(onEnd, 400);   /* LENT : pause observable */
        return true;
      };
    }
    localStorage.removeItem('theo_adeodat_v1');
    window.__llmReq = null;
    const enc = s2 => new TextEncoder().encode(s2);
    window.fetch = async function (url, opts) {
      if (String(url).indexOf('/chat/completions') !== -1) {
        window.__llmReq = JSON.parse(opts.body);
        const parts = [];
        ['Première phrase complète. ', 'Deuxième phrase plus longue, avec détails.'].forEach(function (m) {
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

  /* ── 1. orbe = panneau + session + ⏺ ── */
  section('1. Orbe : panneau + session SR + bouton ⏺ (état RÉEL du micro)');
  await page.evaluate(() => {
    window.__srInstances = [];
    window.__srFail = false;
    window.SpeechRecognition = function () {
      const self = this;
      this.lang = ''; this.continuous = false; this.interimResults = false;
      this.__demarre = false;
      window.__srInstances.push(self);
      this.start = function () {
        if (window.__srFail) throw new Error('boom-micro');
        self.__demarre = true;
      };
      this.stop = function () { self.__demarre = false; };
      this.abort = function () {};
    };
    window.webkitSpeechRecognition = window.SpeechRecognition;
    document.getElementById('adeodat-orbe').click();
  });
  await page.waitForFunction(() => {
    const p = document.getElementById('adeodat-pan');
    return p && p.style.display === 'flex' && window.__srInstances.length >= 1 &&
           window.__srInstances[0].__demarre;
  }, { timeout: 10000 });
  const etat1 = await page.evaluate(() => ({
    micro: document.getElementById('adeodat-mic').textContent,
    active: window.__v566Libre.continuGet()
  }));
  ok('la session démarre avec le panneau (orbe = écoute directe)', etat1.active === true);
  ok('le bouton micro affiche ⏺ PENDANT l\'écoute (état réel)', etat1.micro === '⏺', etat1.micro);

  /* ── 2. partiel ignoré, final envoyé ── */
  section('2. Partiel IGNORÉ, final envoyé (polyfill Android)');
  await page.evaluate(() => {
    const inst = window.__srInstances[window.__srInstances.length - 1];
    inst.onresult({ results: [{ isFinal: false, 0: { transcript: 'Qui' } }] });          /* partiel */
    inst.onresult({ results: [{ isFinal: false, 0: { transcript: 'Qui es' } }] });       /* partiel */
  });
  await page.waitForTimeout(500);
  const partiel = await page.evaluate(() => document.querySelectorAll('#adeodat-msgs .ad-user').length);
  ok('les RÉSULTATS PARTIELS ne déclenchent AUCUN envoi', partiel === 0, 'bulles user=' + partiel);
  await page.evaluate(() => {
    const inst = window.__srInstances[window.__srInstances.length - 1];
    inst.onresult({ results: [{ isFinal: true, 0: { transcript: 'Qui es-tu ?' } }] });   /* FINAL */
  });
  await page.waitForFunction(() => {
    const tx = document.querySelector('#adeodat-msgs .ad-assistant:last-of-type .ad-tx');
    return tx && tx.textContent.indexOf('Première phrase') !== -1;
  }, { timeout: 15000 });
  const finalEnvoye = await page.evaluate(() => {
    const users = document.querySelectorAll('#adeodat-msgs .ad-user');
    const d = users[users.length - 1];
    return d ? d.querySelector('.ad-tx').textContent : '';
  });
  ok('le résultat FINAL part à Adeodat (bulle user)', finalEnvoye === 'Qui es-tu ?', JSON.stringify(finalEnvoye));

  /* ── 3. micro suspendu pendant la réponse, repris après ── */
  section('3. Micro SUSPENDU pendant le TTS, REPRISE à la vidange de la file');
  await page.waitForTimeout(250);   /* le TTS (400 ms/phrase) est en cours */
  const pendant = await page.evaluate(() => ({
    n: window.__srInstances.length,
    demarre: window.__srInstances.map(i => i.__demarre)
  }));
  ok('aucune instance active pendant que Adeodat parle (microPause)',
     pendant.n >= 1 && pendant.demarre.every(d => d === false), JSON.stringify(pendant));
  await page.waitForFunction(() => {
    const n = window.__srInstances.length;
    return n >= 2 && window.__srInstances[n - 1].__demarre === true;
  }, { timeout: 6000 });
  const reprise = await page.evaluate(() => ({
    n: window.__srInstances.length,
    derniere: window.__srInstances[window.__srInstances.length - 1].__demarre,
    micro: document.getElementById('adeodat-mic').textContent
  }));
  ok('la session REPREND automatiquement après la réponse (microReprendre)',
     reprise.derniere === true, JSON.stringify(reprise));
  ok('le bouton micro repasse à ⏺ après la reprise', reprise.micro === '⏺', reprise.micro);

  /* ── 4. fermeture : arrêt + AUCUNE relance en arrière-plan ── */
  section('4. Fermeture du panneau : session arrêtée, ZÉRO relance (anti-bips APK)');
  await page.click('#adeodat-x');
  await page.waitForTimeout(1500);
  const ferme = await page.evaluate(() => ({
    n: window.__srInstances.length,
    derniere: window.__srInstances[window.__srInstances.length - 1].__demarre,
    panneau: document.getElementById('adeodat-pan').style.display,
    micro: document.getElementById('adeodat-mic').textContent,
    active: window.__v566Libre.continuGet()
  }));
  ok('aucune NOUVELLE instance après fermeture (1,5 s sans relance)', ferme.n === reprise.n, 'instances=' + ferme.n);
  ok('la dernière instance est ARRÊTÉE (plus de micro en arrière-plan)', ferme.derniere === false);
  ok('le bouton micro retombe à 🎤', ferme.micro === '🎤', ferme.micro);
  ok('le panneau est fermé, la préférence continue conservée',
     ferme.panneau === 'none' && ferme.active === true, JSON.stringify(ferme));

  /* ── 5. réouverture : la session repart ── */
  section('5. Réouverture par l\'orbe : micro vivant à nouveau');
  await page.click('#adeodat-orbe');
  await page.waitForFunction(() => {
    const n = window.__srInstances.length;
    return n >= 3 && window.__srInstances[n - 1].__demarre === true;
  }, { timeout: 10000 });
  const rouvert = await page.evaluate(() => ({
    n: window.__srInstances.length,
    micro: document.getElementById('adeodat-mic').textContent
  }));
  ok('la session est relancée à la réouverture', rouvert.n >= 3, 'instances=' + rouvert.n);
  ok('le bouton micro affiche ⏺ à la réouverture', rouvert.micro === '⏺', rouvert.micro);

  /* ── 6. fantôme Windows : échec de start signalé + session réarmée ── */
  section('6. start() en échec : PAS de session fantôme, reprise possible');
  await page.click('#adeodat-mic');                       /* toggle off */
  await page.evaluate(() => { window.__toasts.length = 0; window.__srFail = true; });
  const nAvantFantome = await page.evaluate(() => window.__srInstances.length);
  await page.evaluate(() => { window.__v566Libre.continuSet(true); });   /* start va ÉCHOUER */
  await page.waitForTimeout(400);
  const fantome = await page.evaluate(() => ({
    n: window.__srInstances.length,
    derniere: window.__srInstances[window.__srInstances.length - 1].__demarre,
    toasts: window.__toasts.join(' | ')
  }));
  ok('l\'échec de start est SIGNALÉ (toast « Micro indisponible »)',
     /Micro indisponible/.test(fantome.toasts), fantome.toasts.slice(0, 90));
  ok('aucune instance laissée « démarrée » à tort (pas de session fantôme)',
     fantome.derniere === false, JSON.stringify(fantome.derniere));
  await page.evaluate(() => { window.__srFail = false; });
  await page.click('#adeodat-mic');                       /* off */
  await page.click('#adeodat-mic');                       /* on → doit REPARTIR */
  await page.waitForFunction(() => {
    const n = window.__srInstances.length;
    return n > nAvantFantome && window.__srInstances[n - 1].__demarre === true;
  }, { timeout: 6000 }).catch(() => {});
  const repris = await page.evaluate(() => {
    const n = window.__srInstances.length;
    return { n, demarre: n ? window.__srInstances[n - 1].__demarre : false };
  });
  ok('après l\'échec, la session REPART (micro réarmé)', repris.demarre === true, JSON.stringify(repris));

  /* ── 7. toggle 🎤 : arrêt stable ── */
  section('7. Toggle 🎤 : arrêt stable, aucune relance fantôme');
  await page.click('#adeodat-mic');                       /* off */
  await page.waitForTimeout(1000);
  const stop = await page.evaluate(() => ({
    active: window.__v566Libre.continuGet(),
    n: window.__srInstances.length,
    micro: document.getElementById('adeodat-mic').textContent
  }));
  ok('continuGet = false après toggle', stop.active === false);
  ok('aucune relance pendant 1 s (arrêt propre)', stop.n === repris.n, stop.n + ' vs ' + repris.n);
  ok('le bouton micro affiche 🎤', stop.micro === '🎤', stop.micro);

  /* ── 8. propreté ── */
  section('8. Propreté');
  const vraiesErreurs = bruit.filter(t => !/net::|Failed to load resource|theologicus|chat\/completions/i.test(t));
  ok('aucune erreur JS non attendue', vraiesErreurs.length === 0, vraiesErreurs.slice(0, 2).join(' | '));

  const passe = resultats.filter(r => r.pass).length;
  console.log('\nRESULTAT : ' + passe + '/' + resultats.length);
  await browser.close();
  H.killRelay(relais);
  process.exit(passe === resultats.length ? 0 : 3);
})().catch(e => { console.error(e); process.exit(3); });
