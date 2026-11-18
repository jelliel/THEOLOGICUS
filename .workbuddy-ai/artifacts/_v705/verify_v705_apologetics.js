/* v705 — APOLOGETICS.WIKI DANS THEOLOGICUS.
   Vérifie : bouton hors .header-controls, modale, clé stockée sans être
   affichée, appel de lecture SANS Authorization, appel d'écriture AVEC
   Authorization Bearer, bloc de contexte borné, dégradation silencieuse.
   Contrôle négatif : build pré-v705 → module absent. */
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
  try { await page.waitForFunction(() => !!window.__v705Apologetics, null, { timeout: 45000 }); charge = true; } catch (e) {}
  ok('module v705 chargé (contrôle négatif : absent sur l’ancien build)', charge);
  if (!charge) {
    console.log('\nBANC V705 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC');
    await browser.close(); process.exit(1);
  }
  await page.waitForTimeout(1600);

  const ui = await page.evaluate(() => {
    var b = document.getElementById('v705-btn'), m = document.getElementById('v705-modal');
    return { bouton: !!b, archives: !!(b && b.closest('#archives-panel')),
      header: !!(b && b.closest('.header-controls')), modale: !!m,
      chan: !!(m && m.querySelector('#v705-key')) };
  });
  ok('bouton dans ARCHIVES, jamais dans .header-controls', ui.bouton && ui.archives && !ui.header, JSON.stringify(ui));
  ok('modale avec champ clé présente', ui.modale && ui.chan);

  const key = await page.evaluate(() => {
    var V = window.__v705Apologetics;
    V.keyEcrire('aw_bench_cle_secrete_123');
    var lue = V.keyLire();
    document.getElementById('v705-key').value = '';
    var visible = document.body.textContent.indexOf('aw_bench_cle_secrete_123') !== -1;
    return { lue: lue, visible: visible };
  });
  ok('clé stockée et jamais affichée dans le DOM', key.lue === 'aw_bench_cle_secrete_123' && key.visible === false);

  const lecture = await page.evaluate(async () => {
    var V = window.__v705Apologetics, vus = [];
    var vraiFetch = window.fetch;
    window.fetch = async function (url, init) {
      vus.push({ url: String(url), auth: (init.headers && init.headers.Authorization) || '' });
      return { ok: true, text: async function () {
        return JSON.stringify({ jsonrpc: '2.0', id: 1, result: { content: [
          { type: 'text', text: '1. What Is the Trinity? — https://apologetics.wiki/christianity/the-trinity' }
        ] } });
      } };
    };
    var r = await V.call('find_articles_for_claim', { text: 'Trinity', limit: 2 }, false);
    window.fetch = vraiFetch;
    return { reponse: r, appels: vus };
  });
  ok('lecture MCP sans clé et réponse reçue',
     lecture.appels.length === 1 && lecture.appels[0].auth === '' && /What Is the Trinity/.test(lecture.reponse),
     JSON.stringify(lecture));

  const ecriture = await page.evaluate(async () => {
    var V = window.__v705Apologetics, vus = [];
    var vraiFetch = window.fetch;
    window.fetch = async function (url, init) {
      vus.push({ auth: (init.headers && init.headers.Authorization) || '' });
      return { ok: true, text: async function () {
        return JSON.stringify({ jsonrpc: '2.0', id: 2, result: { content: [
          { type: 'text', text: 'gate.verdict: accept — suggestion queued' }
        ] } });
      } };
    };
    var r = await V.call('suggest_topic', { title: 'Sujet de test' }, true);
    window.fetch = vraiFetch;
    return { reponse: r, appels: vus };
  });
  ok('écriture MCP avec en-tête Bearer', ecriture.appels.length === 1 &&
     ecriture.appels[0].auth === 'Bearer aw_bench_cle_secrete_123' &&
     /queued/.test(ecriture.reponse), JSON.stringify(ecriture));

  const ctx = await page.evaluate(async () => {
    var V = window.__v705Apologetics, n = 0;
    var vraiFetch = window.fetch;
    window.fetch = async function () {
      n++;
      return { ok: true, text: async function () {
        return JSON.stringify({ result: { content: [{ type: 'text', text: 'Réponse sourcée https://apologetics.wiki/x' }] } });
      } };
    };
    var rien = await V.contexte('quel temps fait-il à Paris ?');
    var bloc = await V.contexte('Jésus et la Trinité');
    window.fetch = vraiFetch;
    return { n: n, rien: rien, bloc: bloc && bloc.bloc };
  });
  ok('sujet non théologique : aucun appel, aucun bloc', ctx.n === 1 && ctx.rien === null, JSON.stringify({n: ctx.n}));
  ok('sujet théologique : bloc sourcé injectable et borné',
     !!ctx.bloc && /APOLOGETICS\.WIKI/.test(ctx.bloc) && /apologetics\.wiki/.test(ctx.bloc) && ctx.bloc.length <= 4500,
     (ctx.bloc || '').slice(0, 160));

  ok('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));
  console.log('\nBANC V705 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC');
  await browser.close();
  process.exit(ko_n ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
