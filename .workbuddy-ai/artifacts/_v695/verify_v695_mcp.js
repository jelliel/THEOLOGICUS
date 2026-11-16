/* v695 — PONT MCP VISIBLE + TRANSPORT HTTP (bout en bout).

   Phase A (sans navigateur) :
     - le transport HTTP /mcp répond, et REFUSE sans jeton ou avec mauvais jeton ;
     - /theo-control/status ne VIDE PAS la file des commandes ;
     - la configuration expose les deux variantes (stdio + http).

   Phase B (avec l'application ouverte) :
     - le module v695 est chargé, le bouton est dans le panneau Archives et
       ABSENT de .header-controls (v597/v598) ;
     - la modale s'ouvre et annonce le pont ACTIF avec le bon port ;
     - un tools/call HTTP atteint réellement l'application.
*/
const path = require('path'), fs = require('fs'), net = require('net');
const http = require('http'), cp = require('child_process');
const { chromium } = require('playwright');
const RACINE = path.resolve(process.env.BENCH_ROOT || path.resolve(__dirname, '../../..'));
const TOKEN = 'bench-token-v695';
const PY = process.env.PY_BIN || 'python';
const PW = process.env.PW_DIR || 'C:/Users/toshr/AppData/Local/ms-playwright';
const CHROME = path.join(PW, 'chromium-1234', 'chrome-win64', 'chrome.exe');
let ok_n = 0, ko_n = 0;
function ok(nom, cond, detail) {
  if (cond) { ok_n++; console.log('[OK]    ' + nom + (detail ? '  -- ' + detail : '')); }
  else { ko_n++; console.log('[ECHEC] ' + nom + (detail ? '  -- ' + detail : '')); }
}
function portLibre() {
  return new Promise(res => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}
function requete(port, chemin, corps, jeton, methode) {
  return new Promise((res, rej) => {
    const data = corps ? JSON.stringify(corps) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (jeton) headers['X-Theo-Control-Token'] = jeton;
    if (data) headers['Content-Length'] = Buffer.byteLength(data, 'utf8');
    const req = http.request({
      host: '127.0.0.1', port, path: chemin,
      method: methode || (data ? 'POST' : 'GET'), headers
    }, r => {
      let b = ''; r.on('data', d => b += d);
      r.on('end', () => res({ status: r.statusCode, body: b }));
    });
    req.on('error', rej);
    if (data) req.write(data);
    req.end();
  });
}
const pause = ms => new Promise(r => setTimeout(r, ms));
/* 🔴 Réponses non-JSON (page HTML servie par défaut) ne doivent pas faire
   planter le banc : sur l'ancien build, POST /mcp n'existe pas et tombe
   sur le service des fichiers. Le contrôle négatif doit ÉCHOUER, pas
   planter — sinon il ne prouve rien. */
function ouNull(txt) { try { return JSON.parse(txt); } catch (e) { return null; } }

(async () => {
  const port = await portLibre();
  const proxy = cp.spawn(PY, [path.join(RACINE, 'proxy_server.py')], {
    cwd: RACINE,
    env: Object.assign({}, process.env, { THEO_BENCH_PORT: String(port), THEO_CONTROL_TOKEN: TOKEN }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let sortie = '';
  proxy.stderr.on('data', d => { sortie += String(d); });
  proxy.stdout.on('data', d => { sortie += String(d); });
  const pret = async () => {
    for (let i = 0; i < 200; i++) {
      try { if ((await requete(port, '/__theologicus_ping')).status === 200) return true; } catch (e) {}
      await pause(150);
    }
    return false;
  };
  ok('proxy démarré', await pret(), sortie.slice(0, 300));
  if (!await pret()) { proxy.kill(); process.exit(1); }

  /* ── Phase A : transport HTTP, sans application ouverte ─────────────── */
  const sansJeton = await requete(port, '/mcp', { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
  ok('transport HTTP refusé SANS jeton', sansJeton.status === 404, 'statut=' + sansJeton.status);
  const mauvais = await requete(port, '/mcp', { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, 'mauvais-jeton');
  ok('transport HTTP refusé avec MAUVAIS jeton', mauvais.status === 404, 'statut=' + mauvais.status);

  const init = await requete(port, '/mcp', { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, TOKEN);
  const ji = ouNull(init.body);
  ok('MCP HTTP initialize répond', init.status === 200 && !!(ji && ji.result) && ji.result.protocolVersion === '2024-11-05',
    JSON.stringify(ji && ji.result));

  const liste = await requete(port, '/mcp', { jsonrpc: '2.0', id: 2, method: 'tools/list' }, TOKEN);
  const jl = ouNull(liste.body);
  /* 🔴 PRÉSENCE des outils de lecture seule, pas un décompte : la liste
     s'enrichit (v697), mais les 8 de base doivent toujours être exposés. */
  const outilsBase = ['theo_ping', 'theo_list_conversations', 'theo_search_conversations',
    'theo_read_conversation', 'theo_list_channels', 'theo_list_agents',
    'theo_list_routines', 'theo_get_config'];
  const nomsOutils = (jl && jl.result && jl.result.tools || []).map(t => t.name);
  ok('MCP HTTP expose les 8 outils de lecture seule', outilsBase.every(n => nomsOutils.indexOf(n) >= 0),
    nomsOutils.join(', '));

  /* 🔴 /theo-control/status ne doit PAS vider la file. */
  await requete(port, '/theo-control/submit', { command: 'ping', args: {} }, TOKEN);
  const st = await requete(port, '/theo-control/status', null, TOKEN);
  const js = ouNull(st.body);
  ok('status : pont actif et port réel', !!(js && js.ok) && js.port === port, JSON.stringify(js));
  ok('status : compte la file sans la vider', !!(js && js.en_attente === 1), 'en_attente=' + (js && js.en_attente));
  const reste = await requete(port, '/theo-control/pending', null, TOKEN);
  const jr = ouNull(reste.body);
  ok('la commande est TOUJOURS en file après status',
    !!(jr && jr.commands) && jr.commands.length === 1 && jr.commands[0].command === 'ping', JSON.stringify(jr));
  const reste2 = await requete(port, '/theo-control/pending', null, TOKEN);
  const jr2 = ouNull(reste2.body);
  ok('pending la retire (et status ne l’avait pas fait)',
    !!(jr2 && jr2.commands) && jr2.commands.length === 0, JSON.stringify(jr2));

  const cfgRep = await requete(port, '/theo-control/config', null, TOKEN);
  const cfg = ouNull(cfgRep.body);
  const srv = (cfg && cfg.mcpServers) || {};
  const stdio = srv.theologicus;
  const httpv = srv['theologicus-http'];
  ok('config : variante stdio avec le jeton',
    !!(stdio && stdio.env) && stdio.env.THEO_CONTROL_TOKEN === TOKEN && Array.isArray(stdio.args) && stdio.args.length === 1);
  ok('config : variante HTTP (sans Python) avec le jeton',
    !!httpv && httpv.type === 'http' && httpv.url === 'http://127.0.0.1:' + port + '/mcp' &&
    httpv.headers['X-Theo-Control-Token'] === TOKEN, JSON.stringify(httpv));

  /* Sans application ouverte, l'appel doit expirer proprement (pas bloquer). */
  const t0 = Date.now();
  const sansApp = await requete(port, '/mcp', { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'theo_ping', arguments: {} } }, TOKEN);
  const duree = Date.now() - t0;
  const jsa = ouNull(sansApp.body);
  ok('tools/call sans application expire proprement',
    duree < 25000 && !!(jsa && jsa.result) && /delai|expir/i.test(jsa.result.content[0].text),
    'durée=' + duree + 'ms ' + JSON.stringify(jsa && jsa.result && jsa.result.content[0].text));

  /* ── Phase B : l'application ouverte ─────────────────────────────────── */
  const browser = await chromium.launch(Object.assign({ args: ['--no-sandbox', '--disable-dev-shm-usage'] },
    process.env.PW_DIR ? { executablePath: CHROME } : {}));
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(String(e.message)));
  await page.addInitScript(() => {
    try { localStorage.setItem('theologicus_wizard_skipped', '1'); } catch (e) {}
    try { sessionStorage.setItem('theologicus_auth', 'true'); } catch (e) {}
  });
  await page.goto('http://127.0.0.1:' + port + '/THEOLOGICUS.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  const attendre = ms => page.waitForFunction(() => !!(window.__v695Mcp && window.__v693Controle), null, { timeout: ms }).then(() => true).catch(() => false);
  let moduleOk = await attendre(90000);
  if (!moduleOk) { try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 }); } catch (e) {} moduleOk = await attendre(90000); }
  ok('module v695 chargé (contrôle négatif : absent sur l’ancien build)', moduleOk);
  if (!moduleOk) {
    await browser.close(); proxy.kill();
    console.log('\nBANC V695 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC'); process.exit(1);
  }

  const placement = await page.evaluate(() => {
    const b = document.getElementById('v695-btn');
    if (!b) return { existe: false };
    return {
      existe: true,
      dansHeader: !!document.querySelector('.header-controls #v695-btn'),
      dansArchives: !!document.querySelector('#archives-panel #v695-btn'),
      texte: b.textContent
    };
  });
  ok('bouton MCP présent', placement.existe && placement.texte === 'MCP', JSON.stringify(placement));
  ok('bouton MCP dans le panneau Archives', placement.dansArchives === true);
  ok('bouton MCP ABSENT de .header-controls (v597/v598)', placement.dansHeader === false);

  await page.evaluate(() => window.__v695Mcp.ouvrir());
  await page.waitForFunction(() => {
    const e = document.getElementById('v695-etat');
    return e && e.textContent && e.textContent !== '…';
  }, null, { timeout: 20000 }).catch(() => {});
  const modale = await page.evaluate(() => {
    const m = document.getElementById('v695-modal');
    const e = document.getElementById('v695-etat');
    const champs = document.getElementById('v695-champs');
    return {
      ouverte: !!(m && m.style.display === 'flex'),
      etat: e ? e.textContent : '',
      texte: champs ? champs.textContent : ''
    };
  });
  ok('modale ouverte', modale.ouverte === true);
  ok('modale annonce le pont ACTIF', modale.etat === 'ACTIF', 'etat=' + modale.etat);
  ok('modale affiche le port réel', modale.texte.indexOf(String(port)) >= 0, modale.texte.slice(0, 120));

  const copie = await page.evaluate(async () => {
    const cfg = await window.__v695Mcp.configuration();
    return cfg;
  });
  ok('configuration lisible depuis l’app',
    !!copie && !!copie.mcpServers && !!copie.mcpServers['theologicus-http'] &&
    copie.mcpServers['theologicus-http'].headers['X-Theo-Control-Token'] === TOKEN,
    JSON.stringify(copie && copie.mcpServers && copie.mcpServers['theologicus-http']));

  /* tools/call HTTP, pour de vrai, contre l'application ouverte. */
  const appel = await requete(port, '/mcp', { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'theo_ping', arguments: {} } }, TOKEN);
  const jc = ouNull(appel.body);
  let contenu = null;
  try { contenu = JSON.parse(jc.result.content[0].text); } catch (e) { contenu = null; }
  ok('tools/call HTTP atteint l’application', !!contenu && !!contenu.result && contenu.result.ok === true,
    JSON.stringify(contenu));
  ok('aucune erreur JS de page', erreurs.length === 0, erreurs.slice(0, 2).join(' | '));

  await browser.close(); proxy.kill();
  console.log('\nBANC V695 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC');
  process.exit(ko_n ? 1 : 0);
})().catch(e => { console.error('CRASH : ' + (e && e.stack || e)); process.exit(1); });
