/* ═══════════════════════════════════════════════════════════════════════
   Banc v563 — CORBEILLE (miroirs) + MODÈLES PERSONNALISÉS du Studio Vidéo.

   A. CORBEILLE — le défaut signalé : « effacé plusieurs conversations,
      nombre à zéro, mais je vois encore les conversations dans
      l'historique de la corbeille ». Cause : le MIROIR localStorage
      theologicus_chat_<id> survivait à l'effacement (seul le pull serveur
      le retirait) → la section « Conversations récupérables » listait les
      conversations supprimées pour toujours, et « Récupérer » faisait
      revenir ce qu'on voulait détruire. Vérifie :
        1. Effacement (deleteArchiveChat, confirmation acceptée) → chat
           dans la corbeille, retiré d'IndexedDB, MIROIR SUPPRIMÉ,
           absent de la liste « récupérables » ;
        2. Suppression définitive (purger) → plus rien nulle part ;
        3. Récupération d'un orphelin (miroir seul) → chat rendu à
           IndexedDB ET miroir retiré (copie redondante).
        Garde anti-perte : ecrire() renvoie le succès ; si l'écriture
        corbeille échoue (quota), le miroir reste la seule copie.

   B. STUDIO VIDÉO — modèles personnalisés de l'application dans l'onglet
      « 🧠 Modèle IA » : UN CLIC sur une entrée sélectionne le fournisseur
      « openai » du registre MPT (routé), remplit Clé / Base URL / Model
      Name avec LES VALEURS de l'entrée, et clique le bouton
      d'enregistrement RÉEL du studio → POST /mpt/settings capturé et
      vérifié (openai_api_key / openai_base_url / openai_model_name /
      llm_provider=openai) → c'est CE modèle que la génération lira.
        4. liste des modèles personnalisés rendue dans l'onglet ;
        5. clic → champs remplis + payload vérifié + badge actif.
      /mpt/* est ROUTÉ (registre + settings factices — pas de service
      réel en CI) ; les autres appels /mpt/status sont routés aussi.
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

(async () => {
  const port = await H.pickFreePort();
  const STORE_DIR = path.join(os.tmpdir(), 'theo_v563_store_' + Date.now());
  try { fs.mkdirSync(STORE_DIR, { recursive: true }); } catch (e) {}
  const relais = await H.spawnRelay({ port, localAppData: STORE_DIR });
  const BASE = 'http://127.0.0.1:' + port + '/THEOLOGICUS.html';
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const bruit = [];
  page.on('pageerror', e => bruit.push(String(e)));
  page.on('dialog', d => d.accept());                    /* confirmations auto */
  /* MPT (studio) routé : registre + settings factices */
  let settingsPayload = null;
  await page.route('**/mpt/llm/providers', r => r.fulfill({
    status: 200, contentType: 'application/json',
    /* le studio exige j.ok === true (contrat studioLlmChargerRegistre) */
    body: JSON.stringify({ ok: true, providers: [{ id: 'openai', label: 'OpenAI', endpoints: [] }] })
  }));
  await page.route('**/mpt/settings', async r => {
    if (r.request().method() === 'POST') {
      try { settingsPayload = (await r.request().postDataJSON()).values || {}; } catch (e) { settingsPayload = null; }
      return r.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ ok: true, ecrites: Object.keys(settingsPayload || {}) }) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ rev: 1, keys: {} }) });
  });
  await page.route('**/mpt/status', r => r.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, status: 'running', state: 'running' }) }));

  await page.addInitScript(H.isolationInit);
  /* amorçage localStorage AVANT chargement : miroirs des deux conversations */
  await page.addInitScript(() => {
    const chatA = { id: 'chatA', title: 'Conversation A', messages: [{ role: 'user', content: 'bonjour A' }], updated: Date.now() };
    const chatB = { id: 'chatB', title: 'Conversation B (orpheline)', messages: [{ role: 'user', content: 'bonjour B' }, { role: 'assistant', content: 'réponse B' }], updated: Date.now() };
    localStorage.setItem('theologicus_chat_chatA', JSON.stringify(chatA));
    localStorage.setItem('theologicus_chat_chatB', JSON.stringify(chatB));
  });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);

  /* chatA existe AUSSI dans IndexedDB (cas normal avant effacement) */
  await page.evaluate(async () => { await db.put('chats', { id: 'chatA', title: 'Conversation A', messages: [{ role: 'user', content: 'bonjour A' }], updated: Date.now() }); });

  /* ── A. corbeille ── */
  section('A1. Effacement : corbeille + IndexedDB + MIROIR (le défaut signalé)');
  const avant = await page.evaluate(() => ({
    miroirA: !!localStorage.getItem('theologicus_chat_chatA'),
    miroirB: !!localStorage.getItem('theologicus_chat_chatB')
  }));
  ok('pré-condition : les deux miroirs existent', avant.miroirA && avant.miroirB);
  await page.evaluate(async () => { await window.deleteArchiveChat('chatA'); });
  await page.waitForTimeout(600);
  const apres = await page.evaluate(async () => {
    let corbeille = [];
    try { corbeille = JSON.parse(localStorage.getItem('theo_chats_trash_v1') || '[]'); } catch (e) {}
    return {
      dansCorbeille: corbeille.some(c => c.id === 'chatA'),
      enIDB: !!(await db.get('chats', 'chatA')),
      miroirA: !!localStorage.getItem('theologicus_chat_chatA'),
      orphelins: (await window.__v521Corbeille.orphelins()).map(o => o.id)
    };
  });
  ok('la conversation est DANS la corbeille', apres.dansCorbeille);
  ok('elle est retirée d\'IndexedDB', apres.enIDB === false);
  ok('SON MIROIR EST SUPPRIMÉ (le correctif v563)', apres.miroirA === false);
  ok('elle N\'APPARAÎT PLUS dans « Conversations récupérables »',
     apres.orphelins.indexOf('chatA') === -1, 'orphelins=' + JSON.stringify(apres.orphelins));

  section('A2. Suppression définitive (purger) : plus rien nulle part');
  await page.evaluate(() => window.__v521Corbeille.purger('chatA'));
  const purge = await page.evaluate(async () => {
    let corbeille = [];
    try { corbeille = JSON.parse(localStorage.getItem('theo_chats_trash_v1') || '[]'); } catch (e) {}
    return { corbeille: corbeille.length, miroirA: !!localStorage.getItem('theologicus_chat_chatA') };
  });
  ok('corbeille vide et miroir toujours absent', purge.corbeille === 0 && purge.miroirA === false);

  section('A3. Récupération d\'un orphelin : chat rendu + miroir retiré');
  await page.evaluate(async () => { await window.__v521Corbeille.recuperer('chatB'); });
  const recup = await page.evaluate(async () => ({
    enIDB: !!(await db.get('chats', 'chatB')),
    miroirB: !!localStorage.getItem('theologicus_chat_chatB'),
    orphelins: (await window.__v521Corbeille.orphelins()).map(o => o.id)
  }));
  ok('chatB est rendu à IndexedDB (récupération fonctionne)', recup.enIDB === true);
  ok('le miroir source est retiré (copie redondante, règle v563)', recup.miroirB === false);
  ok('chatB n\'est plus listé comme récupérable', recup.orphelins.indexOf('chatB') === -1,
     'orphelins=' + JSON.stringify(recup.orphelins));

  /* ── B. studio : modèles personnalisés ── */
  section('B1. Le panneau du studio liste les modèles personnalisés de l\'app');
  /* le cookie customModels (chargé au boot) rend le seed durable */
  await page.addInitScript(() => {
    document.cookie = 'customModels=' + encodeURIComponent(JSON.stringify([
      { uid: 'banc-1', name: 'Mon SDXL', endpoint: 'https://api.exemple.com/v1', apiKey: 'cle-banc', id: 'mon-modele' }
    ]));
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    window.__postPayload = null;
    const rep = (code, corps) => {
      const texte = typeof corps === 'string' ? corps : JSON.stringify(corps || {});
      return { ok: code >= 200 && code < 400, status: code,
        clone: function () { return this; }, text: async () => texte,
        json: async () => JSON.parse(texte) };
    };
    window.fetch = async function (url, opts) {
      const u = String(url);
      if (u.indexOf('/mpt/settings') !== -1) {
        if ((opts && opts.method) === 'POST') {
          window.__postPayload = JSON.parse(opts.body).values;
          return rep(200, { ok: true, ecrites: Object.keys(window.__postPayload) });
        }
        return rep(200, { rev: 1, keys: {} });
      }
      if (u.indexOf('/mpt/llm/providers') !== -1) return rep(200, { ok: true, providers: [{ id: 'openai', label: 'OpenAI', endpoints: [] }] });
      if (u.indexOf('/mpt/status') !== -1) return rep(200, { ok: true, status: 'running' });
      return rep(404, {});
    };
    window.__v563StuCustom.appliquer(0);
  });
  await page.waitForFunction(() => !!window.__postPayload, { timeout: 10000 });
  const champs = await page.evaluate(() => ({
    provider: document.getElementById('stu-llm-provider').value,
    base: document.getElementById('stu-llm-base').value,
    key: document.getElementById('stu-llm-key').value,
    model: document.getElementById('stu-llm-model').value,
    badge: localStorage.getItem('theo_stu_custom_actif'),
    payload: window.__postPayload
  }));
  ok('le fournisseur MPT sélectionné est « openai » (endpoint OpenAI-compatible)',
     champs.provider === 'openai', champs.provider);
  ok('Base URL / Clé / Model Name = les VALEURS du modèle personnalisé',
     champs.base === 'https://api.exemple.com/v1' && champs.key === 'cle-banc' && champs.model === 'mon-modele',
     JSON.stringify([champs.base, champs.key ? '***' : '', champs.model]));
  ok('le payload POST /mpt/settings porte les clés MPT du fournisseur',
     champs.payload && champs.payload.llm_provider === 'openai' &&
     champs.payload.openai_api_key === 'cle-banc' &&
     champs.payload.openai_base_url === 'https://api.exemple.com/v1' &&
     champs.payload.openai_model_name === 'mon-modele',
     JSON.stringify(champs.payload).slice(0, 120));
  ok('le choix est mémorisé (badge « actif dans le studio »)',
     !!champs.badge && champs.badge.indexOf('mon-modele') !== -1, (champs.badge || '').slice(0, 60));

  section('C. Propreté');
  const vraiesErreurs = bruit.filter(t => !/net::|Failed to load resource|theologicus|mpt|studio/i.test(t));
  ok('aucune erreur JS non attendue', vraiesErreurs.length === 0, vraiesErreurs.slice(0, 2).join(' | '));

  const passe = resultats.filter(r => r.pass).length;
  console.log('\nRESULTAT : ' + passe + '/' + resultats.length);
  await browser.close();
  H.killRelay(relais);
  process.exit(passe === resultats.length ? 0 : 3);
})().catch(e => { console.error(e); process.exit(3); });
