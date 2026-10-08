/* Banc v484 — intégration du routeur FreeLLMAPI.
   Le routeur est SIMULÉ au niveau réseau, mais fidèlement : catalogue de
   640 entrées (le vrai en publie ~635), en-tête X-Routed-Via, et surtout
   les en-têtes CORS qu'un vrai serveur devrait envoyer. On vérifie que
   l'import est CURÉ (sinon le sélecteur de modèles devient inutilisable),
   que l'échec est DIAGNOSTIQUÉ (un navigateur ne dit jamais « c'est du
   CORS ») et que X-Routed-Via remonte jusqu'à l'interface. */
const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const PORT = 8909; const ROOT = process.env.THEO_ROOT || 'C:/tmp/theoverify';
const PW = process.env.PW_DIR || 'C:/Users/toshr/AppData/Local/ms-playwright';
let pass = 0, total = 0;
const ok = (name, cond, detail) => { total++; console.log(` ${cond ? '[OK] ' : '[ECHEC]'}${name}${cond || detail === undefined ? '' : ' — ' + String(detail).slice(0, 110)}`); if (cond) pass++; };

(async () => {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'THEOLOGICUS.html';
    const f = path.join(ROOT, rel);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) {
      const types = { '.js': 'application/javascript; charset=utf-8', '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8' };
      res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
      return fs.createReadStream(f).pipe(res);
    }
    res.writeHead(404); res.end('nf');
  });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, process.env.PW_DIR ? { executablePath: path.join(PW, 'chromium-1234', 'chrome-win64', 'chrome.exe') } : {}));
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 120)));

  // ── le routeur SIMULÉ ────────────────────────────────────────────────
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    /* sans cet en-tête, le JS de la page ne PEUT PAS lire X-Routed-Via :
       c'est exactement ce que doit faire un vrai serveur. */
    'Access-Control-Expose-Headers': 'X-Routed-Via'
  };
  const CATALOGUE = [];
  for (let i = 0; i < 636; i++) CATALOGUE.push('model-' + String(i).padStart(3, '0'));
  CATALOGUE.push('auto', 'auto:fast', 'auto:smart', 'fusion');
  const appels = { models: [], chat: 0, requeteModels: [] };
  let routeurEnPanne = false;
  await page.route('**/v1/**', async route => {
    const req = route.request();
    if (routeurEnPanne) return route.abort('connectionrefused');
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS, body: '' });
    const url = req.url();
    if (/\/models/.test(url)) {
      appels.models.push(url);
      appels.requeteModels.push(url);
      const dispo = /available=true|execution_status=ready/.test(url);
      const data = (dispo ? CATALOGUE : CATALOGUE).map(id => ({ id, object: 'model' }));
      return route.fulfill({ status: 200, headers: Object.assign({ 'Content-Type': 'application/json' }, CORS), body: JSON.stringify({ object: 'list', data }) });
    }
    if (/\/chat\/completions/.test(url)) {
      appels.chat++;
      return route.fulfill({
        status: 200,
        headers: Object.assign({ 'Content-Type': 'application/json', 'X-Routed-Via': 'groq/llama-3.3-70b-versatile' }, CORS),
        body: JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'pong' } }], usage: { total_tokens: 3 } })
      });
    }
    return route.fulfill({ status: 404, headers: CORS, body: '{}' });
  });

  await page.addInitScript(() => { try { localStorage.setItem('theologicus_wizard_skipped', '1'); } catch (e) {} });
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await page.evaluate(() => { const o = document.getElementById('auth-overlay'); if (o) o.classList.add('hidden'); });
  await page.waitForTimeout(300);

  // 1. le registre
  const reg = await page.evaluate(() => {
    const p = PROVIDERS.filter(x => x.id === 'freellmapi')[0];
    return p ? { id: p.id, label: p.label, base: p.base, format: p.format, models: p.models } : null;
  });
  ok('le registre contient le fournisseur freellmapi', !!reg, JSON.stringify(reg));
  ok('sa base est le routeur local sur le port 3001', /^http:\/\/127\.0\.0\.1:3001\/v1$/.test(String(reg && reg.base)), String(reg && reg.base));
  ok('son format est chat-completions (aucune adaptation du code d’appel)', reg && reg.format === 'chat-completions', String(reg && reg.format));
  ok('les 4 entrées VIRTUELLES du routeur sont proposées',
    reg && JSON.stringify(reg.models) === '["auto","auto:fast","auto:smart","fusion"]', JSON.stringify(reg && reg.models));

  // 2. le chemin d'appel réel
  const cfg = await page.evaluate(() => {
    const c = resolveModelConfig('freellmapi:auto');
    return { model: c.model, endpoint: c.endpoint, format: c.format, providerId: c.providerId };
  });
  ok('« freellmapi:auto » produit EXACTEMENT l’endpoint du routeur',
    cfg.endpoint === 'http://127.0.0.1:3001/v1/chat/completions' && cfg.model === 'auto', JSON.stringify(cfg));

  // 3. le bloc dans l'onglet Fournisseurs
  const bloc = await page.evaluate(async () => {
    document.querySelector('[data-act="param-models"]').click();
    await new Promise(r => setTimeout(r, 900));
    const d = document.getElementById('v484-fla');
    const panneau = document.getElementById('settings-panneau-providers');
    const b = d ? d.getBoundingClientRect() : null;
    return {
      existe: !!d,
      dansProviders: !!(d && panneau && panneau.contains(d)),
      apresListe: !!(d && document.getElementById('providers-list') &&
        (document.getElementById('providers-list').compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING)),
      boutons: ['v484-tester', 'v484-importer'].filter(i => !!document.getElementById(i)).length,
      origine: (document.getElementById('v484-origine') || {}).textContent,
      h: b ? Math.round(b.height) : 0
    };
  });
  ok('le bloc « routeur local » est dans l’onglet Fournisseurs', bloc.existe && bloc.dansProviders, JSON.stringify(bloc));
  ok('il est placé APRÈS la liste des fournisseurs', bloc.apresListe === true, JSON.stringify(bloc));
  ok('les deux actions sont présentes (tester / importer)', bloc.boutons === 2, 'boutons=' + bloc.boutons);
  ok('l’aide CORS nomme l’origine EXACTE de l’app', bloc.origine === `http://127.0.0.1:${PORT}`, String(bloc.origine));

  // 4. TESTER : le routeur répond
  const test1 = await page.evaluate(async () => {
    document.getElementById('v484-tester').click();
    await new Promise(r => setTimeout(r, 1500));
    return { etat: document.getElementById('v484-etat').textContent, derniere: document.getElementById('v484-derniere').textContent, res: window.__fla.etat() };
  });
  ok('« Tester le routeur » annonce le nombre de modèles disponibles',
    /640/.test(test1.etat) && /Routeur opérationnel/.test(test1.etat), test1.etat.slice(0, 130));
  ok('le test prouve la CHAÎNE COMPLÈTE (un vrai appel de complétion est fait)', appels.chat === 1, 'appels chat=' + appels.chat);
  ok('le test interroge /models avec le filtre available=true',
    appels.requeteModels.some(u => /available=true/.test(u)), JSON.stringify(appels.requeteModels));
  ok('X-Routed-Via est CAPTURÉ et affiché (on sait qui a répondu)',
    /groq\/llama-3\.3-70b-versatile/.test(test1.derniere) && /groq\//.test(test1.etat), test1.derniere.slice(0, 140));

  // 5. IMPORT CURÉ : le point critique
  const imp = await page.evaluate(async () => {
    const avant = (state.customModels || []).length;
    document.getElementById('v484-importer').click();
    await new Promise(r => setTimeout(r, 1600));
    const apres = (state.customModels || []).length;
    const fla = (state.customModels || []).filter(m => /3001/.test(String(m.baseUrl)));
    return {
      avant, apres, ajoutes: apres - avant,
      modeles: fla.map(m => m.model).sort(),
      etat: document.getElementById('v484-etat').textContent,
      catalogue: 640
    };
  });
  ok('l’import ajoute un ensemble PLAFONNÉ (pas les 640 entrées du catalogue)',
    imp.ajoutes > 0 && imp.ajoutes <= 12, JSON.stringify({ ajoutes: imp.ajoutes, catalogue: imp.catalogue }));
  ok('les 4 entrées VIRTUELLES sont importées (c’est tout l’intérêt du routeur)',
    ['auto', 'auto:fast', 'auto:smart', 'fusion'].every(v => imp.modeles.indexOf(v) >= 0), JSON.stringify(imp.modeles));
  ok('le message d’import dit ce qui a été fait', /importé/.test(imp.etat), imp.etat.slice(0, 120));

  // 6. les modèles importés rejoignent le sélecteur, groupés
  const sel = await page.evaluate(() => {
    const s = document.getElementById('model-select');
    if (!s) return { trouve: false };
    const groupes = Array.from(s.querySelectorAll('optgroup')).map(g => g.label);
    const opts = Array.from(s.options).map(o => o.value);
    return { trouve: true, groupes, aFla: groupes.some(g => /FreeLLMAPI/i.test(g)), aAuto: opts.some(v => /freellmapi:auto$/.test(v)) };
  });
  ok('les modèles du routeur apparaissent groupés dans le sélecteur', sel.trouve && sel.aFla && sel.aAuto, JSON.stringify(sel).slice(0, 160));

  // 7. le bouton « + Ajouter modèles » est lui aussi plafonné et filtré
  const nbAvant = appels.requeteModels.length;
  const plus = await page.evaluate(async () => {
    /* on vide d'abord les modèles du routeur pour mesurer l'ajout réel */
    state.customModels = (state.customModels || []).filter(m => !/3001/.test(String(m.baseUrl)));
    const b = document.querySelector('.provider-add-models-btn[data-provider="freellmapi"]');
    if (!b) return { bouton: false };
    b.click();
    await new Promise(r => setTimeout(r, 1800));
    const fla = (state.customModels || []).filter(m => /3001/.test(String(m.baseUrl)));
    return { bouton: true, ajoutes: fla.length };
  });
  const urlsPlus = appels.requeteModels.slice(nbAvant);
  ok('« + Ajouter modèles » du routeur est PLAFONNÉ lui aussi (≤ 12)',
    plus.bouton && plus.ajoutes > 0 && plus.ajoutes <= 12, JSON.stringify(plus));
  ok('et il demande au routeur ce qui peut RÉELLEMENT servir (available=true)',
    urlsPlus.some(u => /available=true/.test(u)), JSON.stringify(urlsPlus));

  // 8. ÉCHEC : un routeur injoignable doit être DIAGNOSTIQUÉ, pas subi
  const panne = await page.evaluate(async () => {
    /* on simule ce que fait un navigateur quand CORS bloque : un fetch qui
       rejette un TypeError « Failed to fetch » — jamais « c'est du CORS ». */
    const vrai = window.fetch;
    window.fetch = function () { return Promise.reject(new TypeError('Failed to fetch')); };
    document.getElementById('v484-tester').click();
    await new Promise(r => setTimeout(r, 900));
    const r = {
      etat: document.getElementById('v484-etat').textContent,
      corsVisible: getComputedStyle(document.getElementById('v484-cors')).display !== 'none',
      dernier: window.__fla.etat().dernier
    };
    window.fetch = vrai;
    return r;
  });
  ok('un échec réseau est traduit : la cause CORS est NOMMÉE',
    /CORS/.test(panne.etat) && panne.dernier && panne.dernier.cors === true, panne.etat.slice(0, 140));
  ok('l’encadré d’aide CORS s’ouvre de lui-même', panne.corsVisible === true, String(panne.corsVisible));

  // 9. un vrai appel de chat capture X-Routed-Via par le chemin normal
  const via = await page.evaluate(async () => {
    window.__theoRoutedVia = null;
    const cfg = resolveModelConfig('freellmapi:auto');
    await callLLM(cfg, [{ role: 'user', content: 'ping' }], { max_tokens: 5 });
    return window.__theoRoutedVia;
  });
  ok('un appel de chat normal remonte X-Routed-Via jusqu’à l’interface',
    via && /groq\/llama-3\.3-70b/.test(via.via), JSON.stringify(via));

  ok('aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
  console.log(`RESULTAT : ${pass}/${total}`);
  process.exitCode = pass === total ? 0 : 1;
  await browser.close(); server.close();
})().catch(e => { console.log('EXCEPTION BANC :', e); process.exitCode = 1; process.exit(1); });
