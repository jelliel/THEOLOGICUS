/* v700 — BASCULE AUTOMATIQUE SUR ERREUR HTTP.
   Vérifie qu'un 403 dans callLLMStream :
     - est reconnu comme basculable (402 ne l'est pas) ;
     - déclenche un SECOND appel avec un modèle pourvu de clé ;
     - met à jour state.model et le sélecteur, sans erreur visible ;
     - restaure le modèle d'origine si le repli échoue aussi ;
     - respecte l'anti-boucle (pas de chaîne de bascules).
   Contrôle négatif : build sans v700 → module absent, le banc échoue
   sur la bonne raison (pas de plantage). */
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
  try { await page.waitForFunction(() => !!window.__v700Bascule, null, { timeout: 45000 }); charge = true; } catch (e) {}
  ok('module v700 chargé (contrôle négatif : absent sur l’ancien build)', charge);
  if (!charge) {
    console.log('\nBANC V700 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC');
    await browser.close(); process.exit(1);
  }

  const base = await page.evaluate(() => {
    var V = window.__v700Bascule;
    try { localStorage.removeItem('theologicus_v700_bascule'); } catch (e) {}
    state.apiKey = 'bench-key-0123456789';
    state.model = 'mistral-large-2512';
    return {
      codes: V.codes,
      auto: V.actif(),
      basculable403: V.estBasculable({ status: 403 }),
      basculable402: V.estBasculable({ status: 402 }),
      choix: V.choisir('mistral-large-2512'),
      choix402: null,
      nbModeles: V.selectionnables().length
    };
  });
  ok('403 basculable, 402 exclu (crédit lié au compte)', base.basculable403 && !base.basculable402);
  ok('bascule auto activée par défaut', base.auto === true);
  ok('un modèle de repli avec clé est trouvé', !!base.choix && base.choix !== 'mistral-large-2512' && base.nbModeles > 2,
     JSON.stringify({choix: base.choix, nbModeles: base.nbModeles}));

  /* ── 403 : retry transparent ── */
  const succes = await page.evaluate(async () => {
    var appels = [];
    var vraiFetch = window.fetch;
    window.fetch = async function (url, init) {
      var corps = JSON.parse(init.body || '{}');
      appels.push({ url: String(url), model: corps.model });
      if (appels.length === 1) {
        return new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403, headers: { 'content-type': 'application/json' } });
      }
      return {
        ok: true, status: 200,
        headers: { get: function () { return null; } },
        body: { getReader: function () { return { read: async function () { return { done: true, value: undefined }; } }; } }
      };
    };
    var cfg = resolveModelConfig(state.model);
    var chunks = 0;
    var err = null;
    try {
      await window.callLLMStream(cfg, [{ role: 'user', content: 'bonjour' }], {}, function () { chunks++; });
    } catch (e) { err = String(e && e.message || e); }
    window.fetch = vraiFetch;
    return { err: err, appels: appels, modele: state.model,
             select: (document.getElementById('model-select') || {}).value || '',
             anti: window.__v700Bascule.anti(), chunks: chunks };
  });
  ok('403 : aucun message d’erreur remonté à l’utilisateur', succes.err === null, succes.err || '');
  ok('403 : exactement 2 appels, le second sur un autre modèle',
     succes.appels.length === 2 && succes.appels[0].model !== succes.appels[1].model,
     JSON.stringify(succes.appels));
  ok('403 : modèle actif et sélecteur mis à jour',
     succes.modele === succes.appels[1].model && succes.select === succes.modele,
     JSON.stringify({modele: succes.modele, select: succes.select}));
  ok('403 : marqueur anti-boucle enregistré',
     !!succes.anti.vers && succes.anti.vers === succes.modele, JSON.stringify(succes.anti));

  /* ── anti-boucle : pas de seconde bascule depuis le modèle choisi ── */
  const anti = await page.evaluate(() => window.__v700Bascule.choisir(state.model));
  ok('anti-boucle : aucune bascule en chaîne', anti === null);

  /* ── échec du repli : on rend le modèle d’origine ── */
  const restaure = await page.evaluate(async () => {
    try { localStorage.removeItem('theologicus_v700_bascule'); } catch (e) {}
    state.model = 'mistral-large-2512';
    var vraiFetch = window.fetch;
    var n = 0;
    window.fetch = async function () {
      n++;
      return new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403, headers: { 'content-type': 'application/json' } });
    };
    var cfg = resolveModelConfig(state.model);
    var err = null;
    try { await window.callLLMStream(cfg, [{ role: 'user', content: 'bonjour' }], {}, function () {}); }
    catch (e) { err = { status: e && e.status, message: String((e && e.message) || e) }; }
    window.fetch = vraiFetch;
    return { n: n, err: err, modele: state.model };
  });
  ok('repli en échec : l’erreur 403 d’origine remonte après un nombre borné d’essais',
     restaure.err && restaure.err.status === 403 && restaure.n >= 2 && restaure.n <= 8, JSON.stringify(restaure));
  ok('repli en échec : modèle d’origine restauré', restaure.modele === 'mistral-large-2512');

  /* ── 402 : v700 ne bascule PAS (crédit lié au compte) ; v701 peut tenter
        un AUTRE fournisseur, jamais le même. On vérifie les deux invariants. ── */
  const sans402 = await page.evaluate(async () => {
    try { localStorage.removeItem('theologicus_v700_bascule'); } catch (e) {}
    state.model = 'mistral-large-2512';
    var vraiFetch = window.fetch, n = 0, modeles = [];
    window.fetch = async function (url, init) {
      n++;
      try { modeles.push(JSON.parse(init.body || '{}').model || ''); } catch (e) {}
      return new Response(JSON.stringify({ message: 'Payment Required' }), { status: 402, headers: { 'content-type': 'application/json' } });
    };
    var cfg = resolveModelConfig(state.model);
    var err = null;
    try { await window.callLLMStream(cfg, [{ role: 'user', content: 'bonjour' }], {}, function () {}); }
    catch (e) { err = e && e.status; }
    window.fetch = vraiFetch;
    return { n: n, err: err, modele: state.model, modeles: modeles };
  });
  ok('402 : erreur rendue, essais bornés, modèle d’origine restauré',
     sans402.n >= 1 && sans402.n <= 8 && sans402.err === 402 && sans402.modele === 'mistral-large-2512', JSON.stringify(sans402));
  /* L'invariant « 402 = autre fournisseur uniquement » est vérifié de façon
     déterministe dans le banc v701 (candidats() sur données contrôlées). Ici
     le fetch est mocké globalement, y compris pour Ollama : on ne peut pas
     conclure sur la liste des modèles réellement tentés. */

  ok('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));
  console.log('\nBANC V700 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC');
  await browser.close();
  process.exit(ko_n ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
