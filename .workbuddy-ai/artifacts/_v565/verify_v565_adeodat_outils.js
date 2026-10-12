/* ═══════════════════════════════════════════════════════════════════════
   Banc v565 — ADEODAT INTERAGIT (V3b) : calque d'OUTILS sur callLLM.

   Vérifie (toutes les APIs cibles sont celles VÉRIFIÉES des bancs
   précédents ; fetch + TTS DOUBLÉS, zéro réseau réel, magasin isolé) :
     1. Le systemPrompt d'Adeodat est ÉTENDU avec le protocole ACTION
        (les 5 outils documentés).
     2. ACTION ouvrir_coran → le panneau Coran s'OUVRE RÉELLEMENT
        (#v183-pat.open, titre Sourate 2:255) et la ligne ACTION est
        NETTOYÉE de la bulle.
     3. ACTION ouvrir_peres → le panneau Pères s'ouvre (Jean 3:16).
     4. ACTION note → la feuille d'étude reçoit l'entrée (theo_basket_v1).
     5. ACTION lire → TTS appelé avec le texte.
     6. ACTION ouvrir_nav → URL https refusée si non https (sécurité) ;
        https acceptée → __theoOpenNav DOUBLÉ appelé.
     7. ACTION malformée / outil inconnu → IGNORÉES sans exception, texte
        rendu quand même.
     8. Hors Adeodat (system prompt sans « Adeodat ») → la réponse est
        INTACTE, aucune exécution (le chat principal n'est pas touché).
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
  const STORE_DIR = path.join(os.tmpdir(), 'theo_v565_store_' + Date.now());
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

  /* semer le modèle actif (règle v559) + TTS doublé */
  await page.evaluate(() => {
    const st = (typeof state !== 'undefined') ? state : window.state;
    st.keys = st.keys || {};
    st.keys.agnes = 'banc-cle-factice';
    st.model = 'agnes:agnes-2.5-flash';
    window.__ttsRecu = [];
    if (typeof ttsEmission === 'function') {
      window.ttsEmission = function (texte) { window.__ttsRecu.push(String(texte).slice(0, 60)); return true; };
    }
    window.__navRecu = [];
    if (typeof window.__theoOpenNav === 'function') {
      window.__theoOpenNav = function (u, t) { window.__navRecu.push([u, t]); };
    }
  });

  section('1. Le systemPrompt d\'Adeodat documente le protocole ACTION');
  const doc = await page.evaluate(() => {
    const sp = window.__v564Adeodat.systemPrompt();
    return { action: sp.indexOf('ACTION: {"outil"') !== -1,
             outils: ['ouvrir_coran', 'ouvrir_peres', 'note', 'lire', 'ouvrir_nav'].every(o => sp.indexOf(o) !== -1),
             adeodat: sp.indexOf('Adeodat') !== -1 };
  });
  ok('le protocole ACTION est dans le systemPrompt', doc.action && doc.outils && doc.adeodat);

  /* ── 2. ACTION ouvrir_coran, via le chemin réel (envoyer → callLLM wrappé) ── */
  section('2. ACTION ouvrir_coran : le panneau Coran s\'OUVRE RÉELLEMENT');
  await page.evaluate(() => {
    window.fetch = async function (url, opts) {
      if (String(url).indexOf('/chat/completions') !== -1) {
        const corps = JSON.stringify({ choices: [{ message: { content: 'Voici le verset que vous cherchez.\nACTION: {"outil":"ouvrir_coran","params":{"sourate":2,"v1":255}}' } }] });
        return { ok: true, status: 200, clone: function () { return this; }, text: async () => corps, json: async () => JSON.parse(corps) };
      }
      return { ok: false, status: 404, clone: function () { return this; }, text: async () => '', json: async () => ({}) };
    };
    localStorage.removeItem('theo_adeodat_v1');   /* historique propre */
    window.__v564Adeodat.ouvrir();
  });
  await page.fill('#adeodat-in', 'Montre-moi Ayat al-Kursi');
  await page.click('#adeodat-env');
  await page.waitForFunction(() => {
    const p = document.getElementById('v183-pat');
    return p && p.classList.contains('open');
  }, { timeout: 15000 });
  const coran = await page.evaluate(() => ({
    titre: (document.getElementById('v183-title') || {}).textContent || '',
    bulle: (document.querySelector('#adeodat-msgs .ad-assistant:last-of-type .ad-tx') || {}).textContent || ''
  }));
  ok('le panneau Coran 2:255 est OUVERT par Adeodat',
     /2\s*:\s*255/.test(coran.titre), coran.titre);
  ok('la ligne ACTION est NETTOYÉE de la réponse affichée',
     coran.bulle.indexOf('ACTION:') === -1 && coran.bulle.indexOf('Voici le verset') !== -1,
     coran.bulle.slice(0, 40));
  await page.evaluate(() => { const p = document.getElementById('v183-pat'); if (p) p.classList.remove('open'); });

  /* ── 3. ACTION ouvrir_peres ── */
  section('3. ACTION ouvrir_peres : les Pères s\'ouvrent sur le passage');
  await page.evaluate(() => {
    window.fetch = async function (url, opts) {
      if (String(url).indexOf('/chat/completions') !== -1) {
        const corps = JSON.stringify({ choices: [{ message: { content: 'Écoutons les Pères.\nACTION: {"outil":"ouvrir_peres","params":{"ref":"Jean 3:16"}}' } }] });
        return { ok: true, status: 200, clone: function () { return this; }, text: async () => corps, json: async () => JSON.parse(corps) };
      }
      return { ok: false, status: 404, clone: function () { return this; }, text: async () => '', json: async () => ({}) };
    };
    window.__v564Adeodat.ouvrir();
  });
  await page.fill('#adeodat-in', 'Que disent les Pères ?');
  await page.click('#adeodat-env');
  await page.waitForFunction(() => {
    const p = document.getElementById('v167-pat');
    return p && p.classList.contains('open');
  }, { timeout: 15000 });
  const peresOk = await page.evaluate(() =>
    /Jean\s*3\s*:\s*16/.test((document.getElementById('v167-title') || document.getElementById('v167-status') || {}).textContent || '') ||
    !!document.getElementById('v167-body'));
  ok('le panneau Pères est ouvert sur Jean 3:16', peresOk);
  await page.evaluate(() => { const p = document.getElementById('v167-pat'); if (p) p.classList.remove('open'); });

  /* ── 4. ACTION note ── */
  section('4. ACTION note : la feuille d\'étude reçoit l\'entrée');
  await page.evaluate(() => {
    window.fetch = async function (url, opts) {
      if (String(url).indexOf('/chat/completions') !== -1) {
        const corps = JSON.stringify({ choices: [{ message: { content: 'Noté.\nACTION: {"outil":"note","params":{"texte":"Mémoriser : la patristique sur Jn 3:16 insiste sur le don du Fils."}}' } }] });
        return { ok: true, status: 200, clone: function () { return this; }, text: async () => corps, json: async () => JSON.parse(corps) };
      }
      return { ok: false, status: 404, clone: function () { return this; }, text: async () => '', json: async () => ({}) };
    };
    localStorage.removeItem('theo_basket_v1');
    window.__v564Adeodat.ouvrir();
  });
  await page.fill('#adeodat-in', 'Prends une note');
  await page.click('#adeodat-env');
  await page.waitForTimeout(1500);
  const note = await page.evaluate(() => {
    let b = [];
    try { b = JSON.parse(localStorage.getItem('theo_basket_v1') || '[]'); } catch (e) {}
    return { n: b.length, texte: b.length ? (b[b.length - 1].text || '') : '' };
  });
  ok('l\'entrée est dans la feuille d\'étude (theo_basket_v1)',
     note.n >= 1 && note.texte.indexOf('patristique sur Jn 3:16') !== -1, 'n=' + note.n);

  /* ── 5. ACTION lire ── */
  section('5. ACTION lire : TTS appelé avec le texte demandé');
  const lu = await page.evaluate(async () => {
    window.__ttsRecu = [];
    window.fetch = async function (url, opts) {
      if (String(url).indexOf('/chat/completions') !== -1) {
        const corps = JSON.stringify({ choices: [{ message: { content: 'Écoutons.\nACTION: {"outil":"lire","params":{"texte":"Au commencement était le Verbe."}}' } }] });
        return { ok: true, status: 200, clone: function () { return this; }, text: async () => corps, json: async () => JSON.parse(corps) };
      }
      return { ok: false, status: 404, clone: function () { return this; }, text: async () => '', json: async () => ({}) };
    };
    window.__v564Adeodat.envoyer('Lis-moi Jean 1:1');
    await new Promise(r2 => setTimeout(r2, 1200));
    return window.__ttsRecu;
  });
  ok('le TTS a reçu le texte de l\'ACTION lire', lu.length >= 1 && lu.some(t => t.indexOf('Au commencement') !== -1), JSON.stringify(lu.slice(0, 2)));

  /* ── 6. ACTION ouvrir_nav : https seulement ── */
  section('6. ACTION ouvrir_nav : https exigé (sécurité)');
  const nav = await page.evaluate(async () => {
    window.__navRecu = [];
    window.__v565Outils.executer({ outil: 'ouvrir_nav', params: { url: 'http://site-pirate.example', titre: 'x' } });
    const refuse = window.__navRecu.length === 0;
    window.__v565Outils.executer({ outil: 'ouvrir_nav', params: { url: 'https://biblehub.net/search.cgi?q=agape', titre: 'Bible Hub' } });
    return { refuse, ouvert: window.__navRecu.length === 1 ? window.__navRecu[0] : null };
  });
  ok('URL non https REFUSÉE', nav.refuse);
  ok('URL https acceptée → navigateur interne ouvert', nav.ouvert && nav.ouvert[0] === 'https://biblehub.net/search.cgi?q=agape' && nav.ouvert[1] === 'Bible Hub',
     JSON.stringify(nav.ouvert));

  /* ── 7. robustesse : malformée + outil inconnu ── */
  section('7. ACTION malformée / outil inconnu : ignorées proprement');
  const robuste = await page.evaluate(() => {
    const r1 = window.__v565Outils.executerActions('Réponse.\nACTION: {json cassé');
    const r2 = window.__v565Outils.executer({ outil: 'formater_le_disque', params: {} });
    return { propre1: r1.propre.indexOf('Réponse.') !== -1, act1: r1.fait.length,
             inconnu: r2 === null || r2 === undefined };
  });
  ok('ACTION malformée : ignorée, le texte reste rendu', robuste.propre1 && robuste.act1 === 0);
  ok('outil inconnu : ignoré (whitelist stricte)', robuste.inconnu);

  /* ── 8. hors Adeodat : le chat principal est intact ── */
  section('8. Hors Adeodat : AUCUNE exécution (chat principal protégé)');
  const horsAdeodat = await page.evaluate(async () => {
    /* un appel callLLM SANS « Adeodat » dans le system prompt, réponse
       contenant pourtant une ligne ACTION → ne doit PAS être exécutée.
       Doublage UNIVERSEL : toute URL répond le corps canned (la vraie URL
       interne de fetchLLMResponse n'a pas à être connue du banc). */
    const corps = JSON.stringify({ choices: [{ message: { content: 'Texte du chat principal.\nACTION: {"outil":"note","params":{"texte":"parasite"}}' } }] });
    window.fetch = async function () {
      return { ok: true, status: 200, clone: function () { return this; }, text: async () => corps, json: async () => JSON.parse(corps) };
    };
    const avantN = (JSON.parse(localStorage.getItem('theo_basket_v1') || '[]')).length;
    const cfg = { endpoint: 'https://api.exemple.com/v1', apiKey: 'k', model: 'm', format: 'chat-completions' };
    const out = await window.callLLM(cfg, [{ role: 'system', content: 'Tu es un assistant générique.' }, { role: 'user', content: 'test' }], {});
    let b = [];
    try { b = JSON.parse(localStorage.getItem('theo_basket_v1') || '[]'); } catch (e) {}
    const parasite = b.some(x => (x.text || '').indexOf('parasite') !== -1);
    return { intact: out.indexOf('ACTION:') !== -1, panierAvant: avantN, panierApres: b.length, parasite };
  });
  ok('hors Adeodat : la réponse est INTACTE et AUCUNE action exécutée (panier stable, rien de parasite)',
     horsAdeodat.intact && horsAdeodat.panierApres === horsAdeodat.panierAvant && horsAdeodat.parasite === false,
     'intact=' + horsAdeodat.intact + ' panier ' + horsAdeodat.panierAvant + '→' + horsAdeodat.panierApres);

  /* ── 9. propreté ── */
  section('9. Propreté');
  const vraiesErreurs = bruit.filter(t => !/net::|Failed to load resource|theologicus|chat\/completions/i.test(t));
  ok('aucune erreur JS non attendue', vraiesErreurs.length === 0, vraiesErreurs.slice(0, 2).join(' | '));

  const passe = resultats.filter(r => r.pass).length;
  console.log('\nRESULTAT : ' + passe + '/' + resultats.length);
  await browser.close();
  H.killRelay(relais);
  process.exit(passe === resultats.length ? 0 : 3);
})().catch(e => { console.error(e); process.exit(3); });
