/* v709 — CLÉS API DANS LES SAUVEGARDES.
   Vérifie que l'export manuel et le backup auto de fermeture embarquent
   les clés, et qu'une restauration remet conversations + clé Mistral.
   Contrôle négatif : build pré-v709 → module absent. */
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
  });
  await page.goto(HTML, { waitUntil: 'domcontentloaded', timeout: 90000 });
  let charge = false;
  try { await page.waitForFunction(() => !!window.__v709Keys, null, { timeout: 45000 }); charge = true; } catch (e) {}
  ok('module v709 chargé (contrôle négatif : absent sur l’ancien build)', charge);
  if (!charge) {
    console.log('\nBANC V709 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC');
    await browser.close(); process.exit(1);
  }
  await page.waitForTimeout(1200);

  const collecte = await page.evaluate(() => {
    state.keys = { mistral: 'CLE_MISTRAL_TEST', openai: 'CLE_OPENAI_TEST' };
    state.apiKey = 'CLE_MISTRAL_TEST';
    localStorage.setItem('agnes_api_key', 'CLE_AGNES_TEST');
    const c = window.__v709Keys.collecter();
    return { mistral: c.mistral, providers: c.providers, agnes: c.local.agnes_api_key };
  });
  ok('collecte : clé Mistral et fournisseurs',
     collecte.mistral === 'CLE_MISTRAL_TEST' && collecte.providers.mistral === 'CLE_MISTRAL_TEST' &&
     collecte.providers.openai === 'CLE_OPENAI_TEST', JSON.stringify(collecte.providers));
  ok('collecte : clé annexe du localStorage', collecte.agnes === 'CLE_AGNES_TEST', String(collecte.agnes));

  const source = await page.evaluate(() => ({
    export: String(exportData).indexOf('apiKeys') !== -1,
    fermeture: String(window.sauvegardeFermeture).indexOf('__v709Keys') !== -1 ||
               String(window.sauvegardeFermeture).indexOf('apiKeys') !== -1
  }));
  // v604 garde sa logique dans une closure : on vérifie le backup produit plus bas.
  ok('export manuel patché pour embarquer apiKeys', source.export);

  const auto = await page.evaluate(async () => {
    try {
      await db.put('chats', { id: 'v709-chat-test', ts: 2000000000000, role: 'user', content: 'conversation témoin' });
      await window.sauvegardeFermeture(true);
      const liste = await window.listerAutoBackups();
      const dernier = liste.slice().sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); })[0];
      const j = JSON.parse(dernier.json);
      return { chats: (j.data.chats || []).some(function (c) { return c.id === 'v709-chat-test'; }),
               cle: j.data.apiKeys && j.data.apiKeys.mistral };
    } catch (e) { return { err: String(e && e.message || e) }; }
  });
  ok('backup auto de fermeture : conversations + clé',
     auto.chats === true && auto.cle === 'CLE_MISTRAL_TEST', JSON.stringify(auto));

  const rest = await page.evaluate(async () => {
    window.confirm = function () { return false; };
    state.keys = {}; state.apiKey = '';
    try { localStorage.removeItem('agnes_api_key'); } catch (e) {}
    const payload = {
      version: '2.3', source: 'THEOLOGICUS',
      data: {
        chats: [{ id: 'v709-restaure', ts: 2000000000001, role: 'user', content: 'question restaurée' }],
        apiKeys: { providers: { mistral: 'CLE_MISTRAL_RESTAUREE', openai: 'CLE_OPENAI_RESTAUREE' },
                   mistral: 'CLE_MISTRAL_RESTAUREE',
                   local: { agnes_api_key: 'CLE_AGNES_RESTAUREE' } }
      }
    };
    const f = new File([JSON.stringify(payload)], 'backup.json', { type: 'application/json' });
    await importData(f);
    await new Promise(function (r) { setTimeout(r, 250); });
    const cfg = await db.get('app_config', 'main');
    const chat = await db.get('chats', 'v709-restaure');
    return { mistral: state.apiKey, providers: state.keys,
             idb: cfg && cfg.keys && cfg.keys.mistral,
             agnes: localStorage.getItem('agnes_api_key'), chat: !!chat };
  });
  ok('restauration : conversation revenue', rest.chat === true);
  ok('restauration : clé Mistral active sans ressaisie',
     rest.mistral === 'CLE_MISTRAL_RESTAUREE' && rest.idb === 'CLE_MISTRAL_RESTAUREE', JSON.stringify(rest));
  ok('restauration : autres clés et clé annexe revenue',
     rest.providers.openai === 'CLE_OPENAI_RESTAUREE' && rest.agnes === 'CLE_AGNES_RESTAUREE',
     JSON.stringify({ openai: rest.providers.openai, agnes: rest.agnes }));

  const avert = await page.evaluate(() => !!document.getElementById('v709-avert'));
  ok('avertissement « clés en clair » affiché dans GESTION DES DONNÉES', avert);
  ok('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));

  console.log('\nBANC V709 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC');
  await browser.close();
  process.exit(ko_n ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
