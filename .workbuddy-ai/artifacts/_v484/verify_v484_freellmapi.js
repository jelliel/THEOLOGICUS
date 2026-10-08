/* Banc v484 — intégration du routeur FreeLLMAPI (compatible v486).
   v486 route les appels du routeur via le relais local /fla/<host>:<port>/…
   et les points de santé /freellmapi/status + /freellmapi/start. Ces
   endpoints sont servis par proxy_server.py dans l'app réelle ; ici le banc
   ÉMULE ce relais lui-même (même origine que la page) en se connectant à un
   FAUX routeur FreeLLMAPI réel (un vrai serveur HTTP sur 127.0.0.1:3001).
   On vérifie ainsi la CHAÎNE COMPLÈTE telle que l'app la pratique :
     page → /fla/127.0.0.1:3001/v1/… → relais du banc → faux routeur
   avec catalogue plafonné, en-tête X-Routed-Via, et surtout les en-têtes
   CORS qu'un vrai serveur renvoie. On contrôle que l'import est CURÉ, que
   l'échec est DIAGNOSTIQUÉ (jamais « c'est du CORS » en silence) et que
   X-Routed-Via remonte jusqu'à l'interface. */
const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const PORT = 8909; const ROOT = process.env.THEO_ROOT || 'C:/tmp/theoverify';
const PW = process.env.PW_DIR || 'C:/Users/toshr/AppData/Local/ms-playwright';
const ROUTEUR_PORT = 3001;
let pass = 0, total = 0;
const ok = (name, cond, detail) => { total++; console.log(` ${cond ? '[OK] ' : '[ECHEC]'}${name}${cond || detail === undefined ? '' : ' — ' + String(detail).slice(0, 110)}`); if (cond) pass++; };

/* Compteur d'appels, alimenté par le FAUX routeur (même processus Node).
   Remplace l'ancien page.route sur les chemins /v1/ (glob **) qui etait CONTOURNE par la
   réécriture /fla/ de apiEndpoint en v486. */
const appels = { models: [], chat: 0, requeteModels: [] };
const CATALOGUE = [];
for (let i = 0; i < 636; i++) CATALOGUE.push('model-' + String(i).padStart(3, '0'));
CATALOGUE.push('auto', 'auto:fast', 'auto:smart', 'fusion'); // 640 au total

/* ── faux routeur FreeLLMAPI (vrai serveur sur 127.0.0.1:3001) ────────── */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  /* sans cet en-tête, le JS de la page ne PEUT PAS lire X-Routed-Via :
     c'est exactement ce que doit faire un vrai serveur. */
  'Access-Control-Expose-Headers': 'X-Routed-Via'
};
const routeur = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  const u = req.url.split('?')[0];
  if (u === '/api/ping') {
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, CORS));
    return res.end(JSON.stringify({ status: 'ok' }));
  }
  if (u === '/v1/models') {
    appels.models.push(req.url); appels.requeteModels.push(req.url);
    const data = CATALOGUE.map(id => ({ id, object: 'model' }));
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, CORS));
    return res.end(JSON.stringify({ object: 'list', data }));
  }
  if (u === '/v1/chat/completions') {
    appels.chat++;
    res.writeHead(200, Object.assign({ 'Content-Type': 'application/json', 'X-Routed-Via': 'groq/llama-3.3-70b-versatile' }, CORS));
    return res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'pong' } }], usage: { total_tokens: 3 } }));
  }
  res.writeHead(404, CORS); res.end('{}');
});

/* ── relais du banc (équivalent de proxy_server._fla_proxy) ───────────── */
function relay(req, res, fullUrl) {
  try {
    const rest0 = fullUrl.slice(5);                // retire « /fla »
    /* Garde-fou identique à proxy_server._fla_proxy : si la cible ne commence
       pas par « / », on le remet, sinon rest.slice(1, slash) mange le 1er
       caractère de l'hôte (ex. « 127.0.0.1 » → « 27.0.0.1 »). */
    const rest = rest0.startsWith('/') ? rest0 : ('/' + rest0);
    /* NB : en JS, split('/', 1) limite le NOMBRE d'éléments (contrairement
       au maxsplit de Python) — on découpe donc à la main pour CONSERVER le
       chemin complet (/v1/…) et l'éventuelle query string. */
    const slash = rest.indexOf('/', 1);
    const hostport = slash < 0 ? rest.slice(1) : rest.slice(1, slash);
    const targetPath = slash < 0 ? '/' : rest.slice(slash);
    const m = /^(\[[^\]]+\]|[^\/:]+):(\d+)$/.exec(hostport || '');
    if (!m) { res.writeHead(400); return res.end('cible invalide'); }
    const host = m[1], port = parseInt(m[2], 10);
    /* anti-SSRF : on ne relaie QUE du bouclage (127.*, localhost, ::1). */
    if (!/^(127\.|localhost|::1)/.test(host)) { res.writeHead(400); return res.end('anti-SSRF'); }
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const r = http.request({
        host, port, method: req.method, path: targetPath,
        headers: { 'Content-Type': req.headers['content-type'] || 'application/json',
                   'Authorization': req.headers['authorization'] || 'Bearer local' }
      }, rres => {
        const h = {}; for (const k in rres.headers) if (!/^(connection|transfer-encoding|content-length|keep-alive|upgrade|proxy-authenticate|proxy-authorization|te|trailer)$/i.test(k)) h[k] = rres.headers[k];
        res.writeHead(rres.statusCode, h);
        rres.pipe(res);
      });
      r.on('error', e => { res.writeHead(502); res.end('relais: ' + e); });
      if (chunks.length) r.write(Buffer.concat(chunks));
      r.end();
    });
  } catch (e) { res.writeHead(500); res.end(String(e)); }
}
function flaStatus(req, res) {
  const addr = (new URL(req.url, 'http://x')).searchParams.get('addr') || ('127.0.0.1:' + ROUTEUR_PORT);
  const m = /^(\[[^\]]+\]|[^\/:]+):(\d+)$/.exec(addr || '');
  if (!m) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ addr, running: false, up: false, error: 'addr invalide' })); }
  const host = m[1], port = parseInt(m[2], 10);
  const t0 = Date.now();
  const r = http.request({ host, port, path: '/api/ping', method: 'GET', timeout: 3000 }, rres => {
    let d = ''; rres.on('data', c => d += c); rres.on('end', () => {
      let status = 'ok'; try { status = JSON.parse(d).status || 'ok'; } catch (e) {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ addr, running: true, up: rres.statusCode === 200, status, ms: Date.now() - t0 }));
    });
  });
  r.on('error', e => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ addr, running: false, up: false, error: String((e && e.message) || e).slice(0, 80) })); });
  r.setTimeout(3000, () => r.destroy());
  r.end();
}

/* ── serveur du banc (sert la page + émule le relais proxy) ───────────── */
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url.startsWith('/fla/')) return relay(req, res, req.url);
  if (url === '/freellmapi/status') return flaStatus(req, res);
  if (url === '/freellmapi/start') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: true, deja: true })); }
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'THEOLOGICUS.html';
  const f = path.join(ROOT, rel);
  if (fs.existsSync(f) && fs.statSync(f).isFile()) {
    const types = { '.js': 'application/javascript; charset=utf-8', '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8' };
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
    return fs.createReadStream(f).pipe(res);
  }
  res.writeHead(404); res.end('nf');
});

(async () => {
  await new Promise(r => routeur.listen(ROUTEUR_PORT, '127.0.0.1', r));
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, process.env.PW_DIR ? { executablePath: path.join(PW, 'chromium-1234', 'chrome-win64', 'chrome.exe') } : {}));
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 120)));

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
  ok('les entrées VIRTUELLES SÛRES sont proposées (auto/fusion — les auto:<profil> sont conditionnelles)',
    reg && JSON.stringify(reg.models) === '["auto","fusion"]', JSON.stringify(reg && reg.models));

  // 2. le chemin d'appel réel : resolveModelConfig renvoie l'URL BRUTE du
  //    routeur ; c'est apiEndpoint() (appliqué au moment de l'appel, ex. via
  //    le wrapper ae() du module v484) qui réécrit en /fla/ en conservant /v1.
  //    On teste DONC le résultat de apiEndpoint() sur l'endpoint résolu —
  //    exactement ce que pratique la vraie chaîne d'appel (chat + import).
  const cfg = await page.evaluate(() => {
    const c = resolveModelConfig('freellmapi:auto');
    const ep = (typeof window.apiEndpoint === 'function') ? window.apiEndpoint(c.endpoint) : c.endpoint;
    return { model: c.model, endpoint: ep, raw: c.endpoint, format: c.format, providerId: c.providerId };
  });
  ok('« freellmapi:auto » produit l’endpoint du relais /fla/ (avec /v1 conservé)',
    /\/fla\/127\.0\.0\.1:3001\/v1\/chat\/completions$/.test(cfg.endpoint) && cfg.model === 'auto', JSON.stringify(cfg));

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
  if (await page.evaluate(() => location.protocol === 'file:')) {
    ok('l’aide CORS nomme l’origine EXACTE de l’app (file://)', bloc.origine === await page.evaluate(() => location.origin), String(bloc.origine));
  } else {
    const cors = await page.evaluate(() => (document.getElementById('v484-cors') || {}).textContent || '');
    ok('l’aide CORS explique le relais /fla/ (aucun réglage routeur)', /fla\//.test(cors), cors.slice(0, 90));
  }

  // 4. TESTER : le routeur répond (via relais + faux routeur)
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
  ok('les entrées VIRTUELLES (auto/fusion + auto:<profil> présents) sont importées',
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
  await browser.close(); server.close(); routeur.close();
})().catch(e => { console.log('EXCEPTION BANC :', e); process.exitCode = 1; process.exit(1); });
