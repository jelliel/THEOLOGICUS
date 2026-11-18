/* v704 — POOL DE CLÉS OPT-IN.
   Vérifie qu'une clé de rechange est essayée SUR LE MÊME MODÈLE avant
   toute bascule de modèle, que la clé active est persistée, qu'un
   cooldown est posé après échec, qu'aucune clé n'apparaît dans les
   messages, et que le champ UI vit dans PARAMÈTRES (pas .header-controls).
   Contrôle négatif : build pré-v704 → module absent. */
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
  try { await page.waitForFunction(() => !!window.__v704Keys, null, { timeout: 45000 }); charge = true; } catch (e) {}
  ok('module v704 chargé (contrôle négatif : absent sur l’ancien build)', charge);
  if (!charge) {
    console.log('\nBANC V704 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC');
    await browser.close(); process.exit(1);
  }
  await page.waitForTimeout(1800);

  const ui = await page.evaluate(() => {
    var b = document.getElementById('v704-pool');
    return { present: !!b, header: !!(b && b.closest('.header-controls')),
      textarea: !!(b && b.querySelector('textarea#v704-keys')),
      select: !!(b && b.querySelector('select#v704-prov')),
      provider: b ? b.querySelector('select#v704-prov').value : '' };
  });
  ok('champ pool présent dans PARAMÈTRES, pas dans .header-controls',
     ui.present && !ui.header && ui.textarea && ui.select, JSON.stringify(ui));
  ok('fournisseur par défaut = Gemini', ui.provider === 'gemini', ui.provider);

  const base = await page.evaluate(() => {
    var V = window.__v704Keys;
    var pool = { gemini: ['CLE_UN', 'CLE_DEUX', 'CLE_TROIS'], openai: ['SEULE'] };
    V.ecrirePool(pool);
    localStorage.removeItem('theologicus_key_etat_v1');
    return { codes: V.codes, disponibleAvant: V.disponible('gemini', 'CLE_DEUX'),
      pool: V.lirePool().gemini.length,
      uneSeule: V.tourner !== undefined };
  });
  ok('codes de rotation = 402/403/429',
     [402, 403, 429].every(function (c) { return base.codes.indexOf(c) !== -1; }));
  ok('pool enregistré et clé disponible avant échec', base.pool === 3 && base.disponibleAvant);

  /* ── API pure : même modèle, clé suivante ── */
  const pur = await page.evaluate(async () => {
    var V = window.__v704Keys, msgs = [], toasts = [];
    var vraiToast = window.toast;
    window.toast = function (m) { toasts.push(String(m)); };
    state.model = 'gemini:gemini-1.5-flash';
    var cfg = resolveModelConfig(state.model);
    state.keys.gemini = 'CLE_UN'; cfg.apiKey = 'CLE_UN';
    var appels = [];
    var fake = async function (c) {
      appels.push({ model: c.model, key: c.apiKey });
      if (appels.length === 1) { var e = new Error('429'); e.status = 429; throw e; }
      return 'OK ROTATION';
    };
    var r = await V.tourner(fake, null, [cfg, [{ role: 'user', content: 'q' }], {}, function () {}], cfg, { status: 429 });
    window.toast = vraiToast;
    return { ok: !!r, valeur: r && r.valeur, rang: r && r.rang, appels: appels,
             cleActive: state.keys.gemini, toasts: toasts };
  });
  ok('rotation API : réussite avec la clé suivante', pur.ok && pur.valeur === 'OK ROTATION' && pur.rang === 2, JSON.stringify(pur.valeur));
  ok('rotation API : MÊME modèle, clé différente',
     pur.appels.length === 2 && pur.appels[0].model === pur.appels[1].model && pur.appels[0].key !== pur.appels[1].key,
     JSON.stringify(pur.appels));
  ok('rotation API : clé active mise à jour', pur.cleActive === pur.appels[1].key, pur.cleActive);
  /* `toast` est un const de script : le remplacer sur window n'intercepte
     pas les appels nus. On vérifie donc le TEXTE que le module produit. */
  var avisTexte = await page.evaluate(function () { return window.__v704Keys.avis(2, 3); });
  ok('aucune clé secrète dans le message utilisateur',
     !!avisTexte && !/CLE_UN|CLE_DEUX|CLE_TROIS/.test(avisTexte), avisTexte);

  /* ── cooldown après échec ── */
  const cd = await page.evaluate(() => {
    var V = window.__v704Keys;
    V.marquer('gemini', 'CLE_DEUX', 429);
    var a = V.disponible('gemini', 'CLE_DEUX');
    V.marquer('gemini', 'CLE_TROIS', 403);
    return { apres429: a, apres403: V.disponible('gemini', 'CLE_TROIS') };
  });
  ok('cooldown posé après 429 et 403', cd.apres429 === false && cd.apres403 === false, JSON.stringify(cd));

  /* ── chemin réel : fetch 429 puis 200, même modèle ── */
  const reel = await page.evaluate(async () => {
    var V = window.__v704Keys;
    V.ecrirePool({ gemini: ['CLE_UN', 'CLE_DEUX', 'CLE_TROIS'] });
    localStorage.removeItem('theologicus_key_etat_v1');
    state.keys.gemini = 'CLE_UN'; state.model = 'gemini:gemini-1.5-flash';
    var appels = [], vraiFetch = window.fetch;
    window.fetch = async function (url, init) {
      var h = (init && init.headers) || {}, key = h.Authorization || h.authorization || '';
      appels.push({ model: JSON.parse(init.body || '{}').model || '', key: String(key) });
      if (appels.length === 1) return new Response(JSON.stringify({ message: 'quota' }),
        { status: 429, headers: { 'content-type': 'application/json' } });
      return { ok: true, status: 200, headers: { get: function () { return null; } },
        body: { getReader: function () { return { read: async function () { return { done: true, value: undefined }; } }; } } };
    };
    var cfg = resolveModelConfig(state.model), err = null;
    try { await window.callLLMStream(cfg, [{ role: 'user', content: 'question' }], {}, function () {}); }
    catch (e) { err = String((e && e.message) || e); }
    window.fetch = vraiFetch;
    return { err: err, appels: appels, cleActive: state.keys.gemini };
  });
  ok('chemin réel : aucune erreur remontée après rotation', reel.err === null, reel.err || '');
  ok('chemin réel : 2 appels, même modèle, clés différentes',
     reel.appels.length === 2 && reel.appels[0].model === reel.appels[1].model &&
       reel.appels[0].key !== reel.appels[1].key, JSON.stringify(reel.appels));

  /* ── pool d'une seule clé = pas de rotation ── */
  const seul = await page.evaluate(async () => {
    var V = window.__v704Keys;
    V.ecrirePool({ gemini: ['UNIQUE'] });
    state.keys.gemini = 'UNIQUE'; state.model = 'gemini:gemini-1.5-flash';
    var cfg = resolveModelConfig(state.model);
    var r = await V.tourner(async function () { return 'jamais'; }, null,
      [cfg, [], {}, function () {}], cfg, { status: 429 });
    V.ecrirePool({});
    return r;
  });
  ok('une seule clé : aucune rotation (comportement inchangé)', seul === null);

  ok('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));
  console.log('\nBANC V704 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC');
  await browser.close();
  process.exit(ko_n ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
