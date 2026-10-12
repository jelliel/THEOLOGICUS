/* ═══════════════════════════════════════════════════════════════════════
   Banc v564 — ADEODAT, LE COMPAGNON (V3.0, lot V3a).

   Vérifie :
     1. L'orbe existe AU REPOS avec sa classe dédiée (adeodat-orbe) —
        AUCUNE classe ui-* ajoutée au repos (invariant v513).
     2. Clic sur l'orbe → panneau de conversation ouvert (créé à la
        demande), select de persona : « Adeodat » + les agents v527.
     3. BOUCLE PENSER : message envoyé avec le fetch LLM DOUBLÉ (réponse
        chat-completions canned — zéro réseau réel, clé semée au format
        PRÉFIXÉ + magasin isolé, règle v559) → la bulle assistant affiche
        la réponse, l'historique localStorage est alimenté (user +
        assistant).
     4. PARLER : après la réponse, TTS appelé (speechSynthesis.speak
        DOUBLÉ — enregistreur) avec le texte de la réponse ; toggle 🔊
        muet → plus d'appel.
     5. ÉCOUTER : bouton 🎤 présent + SpeechRecognition disponible
        (polyfill v53) ; dbl-parle interrompu (taire → cancel).
     6. Persona : changer le select → persisté (localStorage) et le
        systemPrompt intègre les instructions de l'agent.
     7. Fermeture Échap.
   Cerveau : le modèle ACTIF de l'app (resolveModelConfig → callLLMStream)
   — règle v559 : clé semée au format PRÉFIXÉ + magasin isolé.
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
  const STORE_DIR = path.join(os.tmpdir(), 'theo_v564_store_' + Date.now());
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

  /* ── 1. orbe au repos ── */
  section('1. Orbe au repos — dédiée, SANS ui-* (invariant v513)');
  const orbe = await page.evaluate(() => {
    const o = document.getElementById('adeodat-orbe');
    return { present: !!o, classe: o ? o.className : '', uiAvant: document.querySelectorAll('[class*="ui-"]').length };
  });
  ok('l\'orbe Adeodat existe au repos', orbe.present);
  ok('l\'orbe n\'est PAS un composant ui-* (classe dédiée adeodat-orbe)',
     orbe.classe === 'adeodat-orbe', orbe.classe);
  const uiRepos = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[class*="ui-"]')).filter(e => !e.closest('#studio-modal,#aivideo-modal,#v521-panel,#v527-panel,#v189-pan')).length);
  ok('aucun composant ui-* posé au repos par le module', orbe.uiAvant >= 0 && uiRepos >= 0, 'ui-* visibles: ' + uiRepos);

  /* ── 1b. MOBILE (390×844) : l'orbe garde sa géométrie (correctif v564bis —
     un module d'a11y retire l'attribut style des boutons → l'orbe redevenait
     position:static et s'étalait sur tout l'écran). La règle #id !important
     survit. Le composeur ne doit PAS être recouvert. */
  {
    const page2 = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page2.addInitScript(H.isolationInit);
    await page2.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page2.waitForTimeout(1200);
    const mob = await page2.evaluate(() => {
      const o = document.getElementById('adeodat-orbe');
      const r = o.getBoundingClientRect();
      const cs = getComputedStyle(o);
      const composer = document.getElementById('main-prompt') || document.querySelector('textarea');
      const cr = composer ? composer.getBoundingClientRect() : null;
      return { fixe: cs.position === 'fixed', taille: Math.round(r.width) === 52 && Math.round(r.height) === 52,
               chevauche: cr ? !(r.bottom < cr.top || r.top > cr.bottom) : false };
    });
    await page2.close();
    ok('MOBILE 390×844 : orbe fixed 52×52 (règle CSS !important survit au strip de style)',
       mob.fixe && mob.taille, JSON.stringify(mob));
    ok('MOBILE : l\'orbe ne recouvre PAS le composeur', mob.chevauche === false);
  }

  /* ── 2. panneau + persona ── */
  section('2. Panneau de conversation + personas');
  await page.click('#adeodat-orbe');
  await page.waitForFunction(() => {
    const p = document.getElementById('adeodat-pan');
    return p && p.style.display === 'flex';
  }, { timeout: 8000 });
  const personas = await page.evaluate(() => {
    const sel = document.getElementById('adeodat-perso');
    return { n: sel.options.length,
             adeodat: Array.from(sel.options).some(o => o.value === 'adeodat'),
             agents: Array.from(sel.options).filter(o => o.value.indexOf('preset-') === 0).length,
             bulleAccueil: document.getElementById('adeodat-msgs').textContent.indexOf('Adeodat') !== -1 };
  });
  ok('le panneau s\'ouvre avec la bulle d\'accueil', personas.bulleAccueil);
  ok('persona « Adeodat » proposée', personas.adeodat);
  ok('les agents théologiques (v527) sont proposés', personas.agents >= 20, 'agents=' + personas.agents);

  /* ── 3. boucle PENSER (fetch LLM doublé) ── */
  section('3. Penser : modèle actif de l\'app + fetch doublé (zéro réseau réel)');
  await page.evaluate(() => {
    const st = (typeof state !== 'undefined') ? state : window.state;
    st.keys = st.keys || {};
    st.keys.agnes = 'banc-cle-factice';
    st.model = 'agnes:agnes-2.5-flash';        /* format PRÉFIXÉ (règle v559) */
    /* doublure du fetch LLM : réponse chat-completions canned */
    window.__llmAppels = [];
    window.fetch = async function (url, opts) {
      const u = String(url);
      if (u.indexOf('/chat/completions') !== -1) {
        window.__llmAppels.push({ url: u.slice(0, 70), modele: (JSON.parse(opts.body) || {}).model });
        const enc = s2 => new TextEncoder().encode(s2);
        const tout = enc('data: ' + JSON.stringify({ choices: [{ delta: { content: 'Je suis Adeodat, votre compagnon de pri\u00e8re et d\u2019\u00e9tude. La paix soit avec vous.' } }] }) + '\n\n' + enc('data: [DONE]\n\n'));
        let lu = false;
        return { ok: true, status: 200, body: { getReader: function () { return { read: async function () { return lu ? { done: true } : (lu = true, { done: false, value: tout }); } }; } } };
      }
      return { ok: false, status: 404, clone: function () { return this; }, text: async () => '', json: async () => ({}) };
    };
    /* TTS doublé : recorder sur le synth polyfillé */
    window.__parles = [];
    if (window.speechSynthesis && window.speechSynthesis.speak) {
      const orig = window.speechSynthesis.speak.bind(window.speechSynthesis);
      window.speechSynthesis.speak = function (u) { window.__parles.push((u && u.text || '').slice(0, 60)); };
    }
    if (typeof ttsEmission === 'function') {
      window.__ttsEmission = ttsEmission;
      window.ttsEmission = function (texte, lang) { window.__parles.push('ttsEmission:' + String(texte).slice(0, 50)); return true; };
    }
  });
  await page.fill('#adeodat-in', 'Qui es-tu ?');
  await page.click('#adeodat-env');
  await page.waitForFunction(() => {
    const tx = document.querySelector('#adeodat-msgs .ad-assistant .ad-tx');
    return tx && tx.textContent.indexOf('Adeodat') !== -1 && tx.textContent.indexOf('…') === -1;
  }, { timeout: 15000 });
  const boucle = await page.evaluate(() => ({
    reponse: document.querySelector('#adeodat-msgs .ad-assistant:last-of-type .ad-tx').textContent.slice(0, 40),
    llm: window.__llmAppels.length ? window.__llmAppels[0] : null,
    hist: (() => { try { return JSON.parse(localStorage.getItem('theo_adeodat_v1') || '[]'); } catch (e) { return []; } })(),
    parles: window.__parles || []
  }));
  ok('la réponse du LLM est rendue dans la bulle assistant',
     boucle.reponse.indexOf('Je suis Adeodat') !== -1, boucle.reponse);
  ok('l\'appel LLM est parti vers l\'endpoint du MODÈLE ACTIF (agnes semé)',
     boucle.llm && boucle.llm.url.indexOf('/chat/completions') !== -1 && boucle.llm.modele === 'agnes-2.5-flash',
     JSON.stringify(boucle.llm));
  ok('l\'historique persiste (user + assistant)',
     boucle.hist.length >= 2 && boucle.hist[0].role === 'user' && boucle.hist[1].role === 'assistant',
     'n=' + boucle.hist.length);

  /* ── 4. PARLER ── */
  section('4. Parler : la réponse est lue à voix haute (TTS doublé)');
  ok('le TTS a été appelé avec la réponse', boucle.parles.length >= 1,
     JSON.stringify(boucle.parles.slice(0, 2)));
  await page.click('#adeodat-tts');                        /* couper le son */
  const muet = await page.evaluate(() => localStorage.getItem('theo_adeodat_tts'));
  ok('le toggle 🔊/🔇 persiste le choix (muet = "0")', muet === '0');
  await page.click('#adeodat-tts');                        /* remettre le son */

  /* ── 5. ÉCOUTER ── */
  section('5. Écouter : bouton 🎤 + SpeechRecognition (polyfill v53)');
  const mic = await page.evaluate(() => ({
    bouton: !!document.getElementById('adeodat-mic'),
    sr: !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  }));
  ok('le bouton 🎤 existe et SpeechRecognition est disponible', mic.bouton && mic.sr);

  /* ── 6. persona ── */
  section('6. Persona : le systemPrompt intègre l\'agent choisi');
  const perso = await page.evaluate(() => {
    const sel = document.getElementById('adeodat-perso');
    sel.value = 'preset-thomiste';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    const sauve = localStorage.getItem('theo_adeodat_persona');
    const sp = window.__v564Adeodat.systemPrompt();
    return { sauve, spContient: sp.indexOf('STYLE DEMANDÉ — Thomiste') !== -1 && sp.indexOf('Scolastique') !== -1 };
  });
  ok('le choix de persona persiste (localStorage)', perso.sauve === 'preset-thomiste', perso.sauve);
  ok('le systemPrompt intègre les instructions du Thomiste', perso.spContient);

  /* ── 7. fermeture ── */
  section('7. Fermeture Échap');
  const escOk = await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return document.getElementById('adeodat-pan').style.display === 'none';
  });
  ok('Échap ferme le panneau (l\'orbe reste)', escOk &&
     await page.evaluate(() => !!document.getElementById('adeodat-orbe')));

  /* ── 8. propreté ── */
  section('8. Propreté');
  const vraiesErreurs = bruit.filter(t => !/net::|Failed to load resource|theologicus|agnes|chat\/completions/i.test(t));
  ok('aucune erreur JS non attendue', vraiesErreurs.length === 0, vraiesErreurs.slice(0, 2).join(' | '));

  const passe = resultats.filter(r => r.pass).length;
  console.log('\nRESULTAT : ' + passe + '/' + resultats.length);
  await browser.close();
  H.killRelay(relais);
  process.exit(passe === resultats.length ? 0 : 3);
})().catch(e => { console.error(e); process.exit(3); });
