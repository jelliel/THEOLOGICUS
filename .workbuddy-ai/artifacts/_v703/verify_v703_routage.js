/* v703 — ROUTAGE ROBUSTE : cooldown des modèles + choix depuis la jauge.
   Vérifie que :
     - un marqueur « indisponible » périmé n'est plus considéré (et est nettoyé) ;
     - un marqueur récent reste actif, avec TTL court/passager et long/abonnement ;
     - une sonde verte fraîche est prioritaire, une sonde rouge fortement pénalisée ;
     - un cache de jauge périmé n'influence plus le choix ;
     - un modèle marqué indisponible est pénalisé ;
     - une reprise réussie efface le marqueur du modèle retenu.
   Contrôle négatif : build pré-v703 → pas d'API jauge(), TTL absent. */
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
  await page.waitForFunction(() => !!window.__v701Reprise, null, { timeout: 45000 });
  await page.waitForTimeout(1200);

  const ttl = await page.evaluate(() => {
    var K = 'theo_modeles_indisponibles', now = Date.now(), out = {};
    function pose(id, ageMin, raison) {
      localStorage.setItem(K, JSON.stringify((() => { var o = JSON.parse(localStorage.getItem(K) || '{}'); o[id] = { ts: Date.now() - ageMin * 60000, raison: raison }; return o; })()));
    }
    pose('mistral-large-2512', 31, 'passager');
    out.passagerExpire = window.estModeleIndisponible('mistral-large-2512');
    out.nettoye = !JSON.parse(localStorage.getItem(K) || '{}')['mistral-large-2512'];
    pose('mistral-large-2512', 3, 'passager');
    out.passagerFrais = window.estModeleIndisponible('mistral-large-2512');
    pose('openai:gpt-4o', 120, 'abonnement');
    out.abonnementEncore = window.estModeleIndisponible('openai:gpt-4o');
    pose('openai:gpt-4o', 25 * 60, 'abonnement');
    out.abonnementExpire = window.estModeleIndisponible('openai:gpt-4o');
    localStorage.removeItem(K);
    return out;
  });
  ok('marqueur passager périmé ignoré et nettoyé', ttl.passagerExpire === false && ttl.nettoye === true, JSON.stringify(ttl));
  ok('marqueur passager récent toujours actif', ttl.passagerFrais === true);
  ok('marqueur abonnement : TTL long (24 h)', ttl.abonnementEncore === true && ttl.abonnementExpire === false);

  const gauge = await page.evaluate(() => {
    var V = window.__v701Reprise;
    state.keys = { mistral: 'k1', openai: 'k2', anthropic: 'k3', gemini: 'k4' };
    state.model = 'mistral-large-2512';
    try { localStorage.removeItem('theo_modeles_indisponibles'); } catch (e) {}
    try { localStorage.removeItem('theologicus_v700_bascule'); } catch (e) {}
    try { localStorage.removeItem('theologicus_v701_reprise'); } catch (e) {}
    localStorage.setItem('theologicus_gauge_last', JSON.stringify({ ts: Date.now(), res: [
      { v: 'openai:gpt-4o', k: 0, ms: 120 },
      { v: 'anthropic:claude-3-5-sonnet-latest', k: 2, ms: 40 },
      { v: 'openai:o3-mini', k: 1, ms: 900 }
    ] }));
    var c = V.candidats('mistral-large-2512', [], false);
    var parId = {}; c.forEach(function (x) { parId[x.id] = x.score; });
    var vert = parId['openai:gpt-4o'], rouge = parId['anthropic:claude-3-5-sonnet-latest'], orange = parId['openai:o3-mini'];
    localStorage.setItem('theologicus_gauge_last', JSON.stringify({ ts: Date.now() - 20 * 60000, res: [
      { v: 'openai:gpt-4o', k: 0, ms: 120 },
      { v: 'anthropic:claude-3-5-sonnet-latest', k: 2, ms: 40 }
    ] }));
    var stale = {}; V.candidats('mistral-large-2512', [], false).forEach(function (x) { stale[x.id] = x.score; });
    localStorage.removeItem('theologicus_gauge_last');
    return { premier: c.length ? c[0].id : '', vert: vert, rouge: rouge, orange: orange,
             staleVert: stale['openai:gpt-4o'], staleRouge: stale['anthropic:claude-3-5-sonnet-latest'] };
  });
  ok('jauge fraîche : le modèle vert est proposé en premier', gauge.premier === 'openai:gpt-4o', JSON.stringify(gauge));
  ok('jauge fraîche : vert boosté, rouge pénalisé', gauge.vert >= 120 && gauge.rouge <= -120, JSON.stringify(gauge));
  ok('cache périmé ignoré (plus de bonus/pénalité)',
     gauge.staleVert !== undefined && gauge.staleVert < 60 && gauge.staleRouge !== undefined && gauge.staleRouge > -100,
     JSON.stringify({vert: gauge.staleVert, rouge: gauge.staleRouge}));

  const dispo = await page.evaluate(() => {
    var V = window.__v701Reprise;
    localStorage.setItem('theo_modeles_indisponibles', JSON.stringify({ 'openai:gpt-4o': { ts: Date.now(), raison: 'passager' } }));
    var avant = {}; V.candidats('mistral-large-2512', [], false).forEach(function (x) { avant[x.id] = x.score; });
    localStorage.removeItem('theo_modeles_indisponibles');
    var apres = {}; V.candidats('mistral-large-2512', [], false).forEach(function (x) { apres[x.id] = x.score; });
    return { avant: avant['openai:gpt-4o'], apres: apres['openai:gpt-4o'] };
  });
  ok('modèle marqué indisponible pénalisé dans le choix',
     dispo.avant !== undefined && dispo.apres !== undefined && dispo.avant < dispo.apres,
     JSON.stringify(dispo));

  const efface = await page.evaluate(async () => {
    var V = window.__v701Reprise;
    localStorage.removeItem('theologicus_gauge_last');
    var liste = V.candidats('mistral-large-2512', [], false);
    var choix = liste[0];
    if (!choix) return { ok: false };
    /* On marque TOUS les candidats : ainsi celui que reprendre() choisira
       est forcément marqué, quel que soit le reordering dû à la pénalité. */
    var marques = {};
    liste.forEach(function (x) { marques[x.id] = { ts: Date.now(), raison: 'passager' }; });
    localStorage.setItem('theo_modeles_indisponibles', JSON.stringify(marques));
    var cfg = resolveModelConfig(state.model);
    var r = await V.reprendre(async function () { return 'ok'; }, null,
      [cfg, [{ role: 'user', content: 'q' }], {}, function () {}], state.model, { status: 403 }, null, false);
    return { ok: !!r, choix: choix.id, encore: window.estModeleIndisponible(choix.id) };
  });
  ok('reprise réussie : le marqueur du modèle retenu est effacé', efface.ok && efface.encore === false, JSON.stringify(efface));

  ok('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));
  console.log('\nBANC V703 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC');
  await browser.close();
  process.exit(ko_n ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
