/* v701 — REPRISE SANS INTERRUPTION.
   Vérifie qu'après un échec HTTP (y compris après un début de flux),
   l'application relance LA MÊME question sur un autre modèle, efface
   la bulle interrompue et affiche une bulle d'information visible.
   Contrôle négatif : build sans v701 → module absent, échec propre. */
const path = require('path');
const { chromium } = require('playwright');
const RACINE = path.resolve(process.env.BENCH_ROOT || path.resolve(__dirname, '../../..'));
const HTML = 'file:///' + path.join(RACINE, 'THEOLOGICUS.html').replace(/\\/g, '/');
let ok_n = 0, ko_n = 0;
function ok(nom, cond, detail) {
  if (cond) { ok_n++; console.log('[OK]    ' + nom + (detail ? '  -- ' + detail : '')); }
  else { ko_n++; console.log('[ECHEC] ' + nom + (detail ? '  -- ' + detail : '')); }
}

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(String(e.message)));
  await page.addInitScript(() => {
    try { localStorage.setItem('theologicus_wizard_skipped', '1'); } catch (e) {}
    try { sessionStorage.setItem('theologicus_auth', 'true'); } catch (e) {}
  });
  await page.goto(HTML, { waitUntil: 'domcontentloaded', timeout: 90000 });
  let charge = false;
  try { await page.waitForFunction(() => !!window.__v701Reprise, null, { timeout: 45000 }); charge = true; } catch (e) {}
  ok('module v701 chargé (contrôle négatif : absent sur l’ancien build)', charge);
  if (!charge) {
    console.log('\nBANC V701 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC');
    await browser.close(); process.exit(1);
  }
  await page.waitForTimeout(1200);

  const base = await page.evaluate(() => {
    document.querySelectorAll('.v701-bulle').forEach(function (b) { b.remove(); });
    try { localStorage.removeItem('theologicus_v701_reprise'); } catch (e) {}
    state.apiKey = 'bench-key-0123456789';
    state.keys = { mistral: 'bench-key-0123456789', openai: 'bench-openai-key-0123' };
    state.model = 'mistral-large-2512';
    /* On neutralise le repli v700 pour tester la reprise v701. */
    try { localStorage.setItem('theologicus_v700_bascule', JSON.stringify({ failed: 'mistral-large-2512', vers: 'mistral-large-2512', ts: Date.now() })); } catch (e) {}
    return {
      css: !!document.getElementById('v701-reprise-css'),
      v700Bloque: window.__v700Bascule.choisir('mistral-large-2512') === null,
      candidats402: window.__v701Reprise.candidats('mistral-large-2512', [], true).map(function (x) { return x.id; }),
      candidats403: window.__v701Reprise.candidats('mistral-large-2512', [], false).length
    };
  });
  ok('feuille de style de la bulle injectée', base.css);
  ok('repli v700 neutralisé pour isoler v701', base.v700Bloque);
  ok('402 ne propose qu’un AUTRE fournisseur',
     base.candidats402.length > 0 && base.candidats402.every(function (id) { return /^[a-z]+:/.test(id); }),
     base.candidats402.slice(0, 4).join(', '));
  ok('403 propose plusieurs modèles', base.candidats403 >= 2, String(base.candidats403));

  /* ── échec HTTP : reprise de la MÊME question + bulle visible ── */
  const reprise = await page.evaluate(async () => {
    var appels = [];
    var vraiFetch = window.fetch;
    window.fetch = async function (url, init) {
      var corps = JSON.parse(init.body || '{}');
      appels.push({ messages: corps.messages, model: corps.model });
      if (appels.length === 1) {
        return new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403, headers: { 'content-type': 'application/json' } });
      }
      return { ok: true, status: 200, headers: { get: function () { return null; } },
        body: { getReader: function () { return { read: async function () { return { done: true, value: undefined }; } }; } } };
    };
    var cfg = resolveModelConfig(state.model);
    var messages = [{ role: 'system', content: 'SYSTEM v701' }, { role: 'user', content: 'MA QUESTION EXACTE' }];
    var chunks = 0, err = null;
    try { await window.callLLMStream(cfg, messages, {}, function () { chunks++; }); }
    catch (e) { err = String((e && e.message) || e); }
    window.fetch = vraiFetch;
    var bulles = Array.prototype.map.call(document.querySelectorAll('.v701-bulle'), function (b) { return b.textContent; });
    return { err: err, appels: appels, chunks: chunks, modele: state.model, bulles: bulles,
             anti: window.__v701Reprise.anti(),
             identique: appels.length === 2 && JSON.stringify(appels[0].messages) === JSON.stringify(appels[1].messages) };
  });
  ok('403 : aucune erreur remontée, réponse reprise', reprise.err === null, reprise.err || '');
  ok('403 : la MÊME question est renvoyée au second modèle', reprise.identique,
     JSON.stringify({ premier: reprise.appels[0] && reprise.appels[0].model, second: reprise.appels[1] && reprise.appels[1].model }));
  ok('403 : bulle d’information visible avec mention de reprise',
     reprise.bulles.length >= 1 && /reprise de la même question/i.test(reprise.bulles[0]), reprise.bulles.join(' | ').slice(0, 160));
  ok('403 : modèle actif basculé et marqué anti-boucle',
     reprise.modele.indexOf(':') > 0 && reprise.appels[1].model &&
       reprise.modele.indexOf(reprise.appels[1].model) !== -1 && reprise.anti.vers === reprise.modele,
     JSON.stringify({modele: reprise.modele, anti: reprise.anti}));

  /* ── coupure APRÈS un début de flux : nouvelle bulle de réponse ── */
  const miFlux = await page.evaluate(async () => {
    try { localStorage.removeItem('theologicus_v701_reprise'); } catch (e) {}
    try { localStorage.removeItem('theologicus_v700_bascule'); } catch (e) {}
    var ancienne = window._createStreamDiv();
    var oldContent = ancienne.content;
    oldContent.textContent = 'DEBUT DE REPONSE COUPEE';
    var oldDiv = ancienne.div;
    var V = window.__v701Reprise;
    var cfg = resolveModelConfig(state.model);
    var messages = [{ role: 'user', content: 'MA QUESTION EXACTE' }];
    var tentatives = [];
    var fake = async function (c, msgs, opts, cb) {
      tentatives.push({ c: c, msgs: msgs });
      if (tentatives.length === 1) { if (cb) cb('morceau', 'morceau'); var e = new Error('403'); e.status = 403; throw e; }
      if (cb) cb('REPONSE REPRISE', 'REPONSE REPRISE');
      return 'REPONSE REPRISE';
    };
    var r = await V.reprendre(fake, null, [cfg, messages, {}, function () {}], state.model, { status: 403 }, oldDiv, true);
    var assistant = document.querySelectorAll('#chat-container .message.assistant');
    return { ok: !!r, valeur: r && r.valeur, tentatives: tentatives.length,
             messagesIdentiques: JSON.stringify(tentatives[0] && tentatives[0].msgs) === JSON.stringify(tentatives[1] && tentatives[1].msgs),
             ancienneRetiree: !oldDiv.parentNode,
             derniere: assistant.length ? assistant[assistant.length - 1].textContent : '',
             bulles: document.querySelectorAll('.v701-bulle').length };
  });
  ok('coupure en cours de flux : reprise réussie', miFlux.ok && miFlux.valeur === 'REPONSE REPRISE', JSON.stringify(miFlux.valeur));
  ok('coupure en cours de flux : même question renvoyée', miFlux.messagesIdentiques && miFlux.tentatives === 2);
  ok('coupure en cours de flux : ancienne bulle effacée, nouvelle réponse affichée',
     miFlux.ancienneRetiree && /REPONSE REPRISE/.test(miFlux.derniere), miFlux.derniere.slice(0, 80));
  ok('coupure en cours de flux : bulle d’information ouverte', miFlux.bulles >= 1, String(miFlux.bulles));

  ok('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));
  console.log('\nBANC V701 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC');
  await browser.close();
  process.exit(ko_n ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
