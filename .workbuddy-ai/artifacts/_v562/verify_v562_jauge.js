/* ═══════════════════════════════════════════════════════════════════════
   Banc v562 — JAUGE DE COMPATIBILITÉ des modèles personnalisés (AI VIDEO).

   La jauge sonde 4 niveaux (endpoint / modèle listé / image / vidéo) avec
   des requêtes VOLONTAIREMENT incomplètes (prompt vide → 400/422 sans
   rien générer). Le banc DOUBLE window.fetch (aucun réseau réel) et
   vérifie, scénario par scénario :
     1. tout-OK (models 200 listé, images 400, videos 422) → 4/4,
        verdict « VIDÉO COMPATIBLE » + bouton « 🎥 Activer ».
     2. videos 404 → 3/4, verdict « IMAGE seulement », pas de bouton.
     3. models 401 → endpoint « clé », 0/4, verdict « clé refusée ».
     4. videos 503 queue_full → vidéo « saturée » (présente) → 4/4.
     5. réseau rejeté → 0/4, verdict « injoignable ».
     6. Rendu : 4 segments colorés, barre de score, verdict textuel.
     7. Flux RÉEL : formulaire rempli → bouton « Mesurer » → jauge rendue
        → clic « 🎥 Activer pour la vidéo » → cmSave (chemin réel) →
        localStorage + cm-video-choice alimenté → la GÉNÉRATION utilisera
        ce modèle (customModelsVideo, contrat existant).
     8. Pastille 📏 sur chaque carte enregistrée (remplit + mesure).
   Magasin isolé (localAppData) — règle v559.
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

/* doublure de réponse fetch */
function rep(code, corps) {
  const texte = typeof corps === 'string' ? corps : JSON.stringify(corps || {});
  return {
    ok: code >= 200 && code < 400, status: code,
    clone: function () { return { text: async () => texte }; },
    text: async () => texte,
    json: async () => JSON.parse(texte)
  };
}

(async () => {
  const port = await H.pickFreePort();
  const STORE_DIR = path.join(os.tmpdir(), 'theo_v562_store_' + Date.now());
  try { fs.mkdirSync(STORE_DIR, { recursive: true }); } catch (e) {}
  const relais = await H.spawnRelay({ port, localAppData: STORE_DIR });
  const BASE = 'http://127.0.0.1:' + port + '/ai-video.html';
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const bruit = [];
  page.on('pageerror', e => bruit.push(String(e)));
  await page.addInitScript(H.isolationInit);
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1200);
  /* l'assistant v502 s'ouvre sur profil neuf et intercepte les clics — fermer */
  await page.evaluate(() => {
    const o = document.getElementById('onboard');
    if (o) { o.classList.remove('open'); document.body.style.overflow = ''; }
    try { if (typeof obFerme === 'function') obFerme(); } catch (e) {}
  });
  await page.waitForTimeout(150);

  section('1. Module v562 présent, panneau jauge injecté dans le formulaire CM');
  ok('__v562Jauge exposé (mesurer/rendre/verdict/activerVideo)',
     await page.evaluate(() => {
       const j = window.__v562Jauge;
       return !!j && typeof j.mesurer === 'function' && typeof j.rendre === 'function' &&
              typeof j.verdict === 'function' && typeof j.activerVideo === 'function';
     }));
  ok('le panneau #cm-jauge est injecté dans .cm-form (bouton + zone résultat)',
     await page.evaluate(() =>
       !!document.querySelector('.cm-form #cm-jauge') &&
       !!document.getElementById('cm-jauge-btn') && !!document.getElementById('cm-jauge-res')));

  /* scénarios — window.fetch doublé (aucune requête réelle) */
  const OPTS = { endpoint: 'https://api.exemple.com/v1', apiKey: 'cle-banc', modelId: 'mon-modele-video' };
  function stubber(scenario) {
    return function () {
      window.__reelles = 0;
      const vraiFetch = window.fetch;
      window.__vraiFetch = vraiFetch;
      window.fetch = async function (url, opts) {
        const u = String(url);
        if (u.indexOf('/models') !== -1 && u.indexOf('strong') === -1) {
          if (scenario.models === 401) return rep(401, { error: 'bad key' });
          if (scenario.models === 0) { window.__reelles++; return vraiFetch(url, opts); }
          return rep(200, { data: [{ id: 'mon-modele-video' }, { id: 'autre' }] });
        }
        if (u.indexOf('/images/generations') !== -1) return rep(scenario.image || 400, { error: 'prompt required' });
        if (u.indexOf('/videos') !== -1) {
          if (scenario.videos === 404) return rep(404, { error: 'not found' });
          if (scenario.videos === 503) return rep(503, 'queue_full — try later');
          if (scenario.videos === 422) return rep(422, { error: 'prompt required' });
          return rep(scenario.videos || 422, { error: 'prompt required' });
        }
        window.__reelles++;
        return vraiFetch(url, opts);
      };
    };
  }

  section('2. Scénario tout-OK → 4/4, verdict VIDÉO COMPATIBLE');
  const A = await page.evaluate(async (o) => {
    const j = window.__v562Jauge;
    window.fetch = async function (url) {
      const u = String(url);
      if (u.indexOf('/models') !== -1) return { ok: true, status: 200, clone: function () { return this; }, text: async () => JSON.stringify({ data: [{ id: o.modelId }, { id: 'autre' }] }) };
      if (u.indexOf('/images/generations') !== -1) return { ok: false, status: 400, clone: function () { return this; }, text: async () => 'prompt required' };
      if (u.indexOf('/videos') !== -1) return { ok: false, status: 422, clone: function () { return this; }, text: async () => 'prompt required' };
      return { ok: false, status: 404, clone: function () { return this; }, text: async () => '' };
    };
    return await j.mesurer(o);
  }, OPTS);
  ok('score 4/4', A.score === 4, 'score=' + A.score);
  ok('endpoint ok · modèle listé · image ok · vidéo ok',
     A.endpoint === 'ok' && A.modele === 'ok' && A.image === 'ok' && A.video === 'ok',
     JSON.stringify([A.endpoint, A.modele, A.image, A.video]));
  const vA = await page.evaluate((r) => window.__v562Jauge.verdict(r), A);
  ok('verdict « VIDÉO COMPATIBLE »', vA.ok === true && /VIDÉO COMPATIBLE/.test(vA.txt), vA.txt.slice(0, 60));
  const renduA = await page.evaluate((r) => window.__v562Jauge.rendre(r), A);
  ok('le rendu porte 4 segments, la barre 100 % et le bouton « 🎥 Activer »',
     (renduA.match(/border-radius:5px/g) || []).length === 4 &&
     renduA.indexOf('width:100%') !== -1 && renduA.indexOf('cm-jauge-activer') !== -1);

  section('3. Scénario videos 404 → 3/4, IMAGE seulement');
  const B = await page.evaluate(async (o) => {
    const j = window.__v562Jauge;
    window.fetch = async function (url) {
      const u = String(url);
      if (u.indexOf('/models') !== -1) return { ok: true, status: 200, clone: function () { return this; }, text: async () => JSON.stringify({ data: [{ id: o.modelId }] }) };
      if (u.indexOf('/images/generations') !== -1) return { ok: false, status: 400, clone: function () { return this; }, text: async () => 'x' };
      if (u.indexOf('/videos') !== -1) return { ok: false, status: 404, clone: function () { return this; }, text: async () => 'not found' };
      return { ok: false, status: 404, clone: function () { return this; }, text: async () => '' };
    };
    const r = await j.mesurer(o);
    const v = j.verdict(r);
    const rendu = j.rendre(r);
    return { r: { score: r.score, video: r.video, image: r.image }, verdict: v, aBouton: rendu.indexOf('cm-jauge-activer') !== -1 };
  }, OPTS);
  ok('vidéo ABSENTE (404) : score 3/4, image ok', B.r.score === 3 && B.r.video === 'non' && B.r.image === 'ok',
     'score=' + B.r.score + ' video=' + B.r.video);
  ok('verdict « IMAGE seulement », SANS bouton d\'activation vidéo',
     B.verdict.ok === false && /IMAGE seulement/.test(B.verdict.txt) && B.aBouton === false, B.verdict.txt.slice(0, 50));

  section('4. Scénarios clé refusée / file saturée / réseau');
  const C = await page.evaluate(async (o) => {
    const j = window.__v562Jauge;
    window.fetch = async function () { return { ok: false, status: 401, clone: function () { return this; }, text: async () => 'unauthorized' }; };
    const r = await j.mesurer(o);
    return { endpoint: r.endpoint, score: r.score, verdict: j.verdict(r).txt };
  }, OPTS);
  ok('models 401 → endpoint « clé », 0/4, verdict clé refusée',
     C.endpoint === 'cle' && C.score === 0 && /refusée/i.test(C.verdict), C.verdict.slice(0, 50));
  const D = await page.evaluate(async (o) => {
    const j = window.__v562Jauge;
    window.fetch = async function (url) {
      const u = String(url);
      if (u.indexOf('/models') !== -1) return { ok: true, status: 200, clone: function () { return this; }, text: async () => JSON.stringify({ data: [{ id: o.modelId }] }) };
      if (u.indexOf('/images/generations') !== -1) return { ok: false, status: 400, clone: function () { return this; }, text: async () => 'x' };
      if (u.indexOf('/videos') !== -1) return { ok: false, status: 503, clone: function () { return this; }, text: async () => 'queue_full — try later' };
      return { ok: false, status: 404, clone: function () { return this; }, text: async () => '' };
    };
    const r = await j.mesurer(o);
    return { score: r.score, video: r.video, ok: j.verdict(r).ok };
  }, OPTS);
  ok('videos 503 queue_full → vidéo « saturée » mais COMPATIBLE (4/4)',
     D.score === 4 && D.video === 'sature' && D.ok === true, 'video=' + D.video);
  const E = await page.evaluate(async (o) => {
    const j = window.__v562Jauge;
    window.fetch = async function () { throw new Error('net down'); };
    const r = await j.mesurer(o);
    return { score: r.score, endpoint: r.endpoint, verdict: j.verdict(r).txt };
  }, OPTS);
  ok('réseau rejeté → 0/4, verdict « injoignable »',
     E.score === 0 && E.endpoint === 'ko' && /injoignable/.test(E.verdict), E.verdict.slice(0, 40));

  /* ── flux réel : formulaire → mesurer → activer ── */
  section('5. Flux RÉEL : mesurer depuis le formulaire, activer pour la vidéo');
  await page.fill('#cm-endpoint', 'https://api.exemple.com/v1');
  await page.fill('#cm-key', 'cle-banc');
  await page.fill('#cm-model-input', 'mon-modele-video');
  await page.evaluate(() => {
    /* doublure fetch pour CE flux : tout-OK (aucun réseau réel) */
    window.fetch = async function (url) {
      const u = String(url);
      if (u.indexOf('/models') !== -1) return { ok: true, status: 200, clone: function () { return this; }, text: async () => JSON.stringify({ data: [{ id: 'mon-modele-video' }] }) };
      if (u.indexOf('/images/generations') !== -1) return { ok: false, status: 400, clone: function () { return this; }, text: async () => 'x' };
      if (u.indexOf('/videos') !== -1) return { ok: false, status: 422, clone: function () { return this; }, text: async () => 'x' };
      return { ok: false, status: 404, clone: function () { return this; }, text: async () => '' };
    };
  });
  await page.click('#cm-jauge-btn');
  await page.waitForFunction(() =>
    document.getElementById('cm-jauge-res').textContent.indexOf('VIDÉO COMPATIBLE') !== -1, { timeout: 15000 });
  ok('le bouton « Mesurer » du formulaire rend la jauge (verdict vidéo)',
     await page.evaluate(() =>
       document.querySelectorAll('#cm-jauge-res div[style*="border-radius:5px"]').length >= 4 &&
       !!document.getElementById('cm-jauge-activer')));
  await page.click('#cm-jauge-activer');
  await page.waitForTimeout(600);
  const actif = await page.evaluate(() => {
    let liste = [];
    try { liste = JSON.parse(localStorage.getItem('cinema_noir_custom_models_v2') || '[]'); } catch (e) {}
    const c = liste.find(x => x.id === 'mon-modele-video');
    const sel = document.getElementById('cm-video-choice');
    return {
      enregistre: !!c, video: c && c.video, adapter: c && c.adapter, endpoint: c && c.endpoint,
      cochee: document.getElementById('cm-video').checked,
      dansSelect: sel ? Array.from(sel.options).some(o => o.value === (c && c.uid)) : false,
      choix: (typeof state !== 'undefined' ? state : window.state).cmVideoChoice
    };
  });
  ok('« 🎥 Activer » enregistre le modèle via cmSave (video:true, agnes)',
     actif.enregistre && actif.video === true && actif.adapter === 'agnes' &&
     actif.endpoint === 'https://api.exemple.com/v1', JSON.stringify(actif.endpoint));
  ok('la case « 🎥 Vidéo » est cochée et le modèle est listé dans cm-video-choice',
     actif.cochee && actif.dansSelect);

  section('6. Pastille 📏 sur les cartes enregistrées');
  const pastille = await page.evaluate(() => {
    const carte = document.querySelector('#cm-grid [data-cm-uid]');
    const b = carte && carte.querySelector('[data-cm-jauge]');
    return { carte: !!carte, bouton: !!b };
  });
  ok('chaque carte enregistrée porte la pastille 📏 (remplit + mesure)',
     pastille.carte && pastille.bouton);

  section('7. Propreté');
  ok('aucune erreur JS non attendue', bruit.length === 0, bruit.slice(0, 2).join(' | '));

  const passe = resultats.filter(r => r.pass).length;
  console.log('\nRESULTAT : ' + passe + '/' + resultats.length);
  await browser.close();
  H.killRelay(relais);
  process.exit(passe === resultats.length ? 0 : 3);
})().catch(e => { console.error(e); process.exit(3); });
