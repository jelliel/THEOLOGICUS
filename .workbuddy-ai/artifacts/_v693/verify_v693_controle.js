/* v693 — PLAN DE CONTRÔLE MCP (bout en bout).

   Démarre le proxy AVEC jeton, charge l'app depuis la même origine, puis :
     - vérifie que les routes sont invisibles SANS jeton ;
     - soumet une commande autorisée et lit le résultat rendu par l'app ;
     - vérifie qu'une commande non listée est REFUSÉE ;
     - parle au serveur MCP stdio réel (initialize + tools/call).

   Contrôle négatif : sur l'ancien build, window.__v693Controle n'existe pas.
*/
const path = require('path'), fs = require('fs'), net = require('net');
const http = require('http'), cp = require('child_process');
const { chromium } = require('playwright');
const RACINE = path.resolve(process.env.BENCH_ROOT || path.resolve(__dirname, '../../..'));
const TOKEN = 'bench-token-v693';
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
function requete(port, chemin, corps, jeton) {
  return new Promise((res, rej) => {
    const data = corps ? JSON.stringify(corps) : null;
    const headers = Object.assign({ 'Content-Type': 'application/json' }, jeton ? { 'X-Theo-Control-Token': jeton } : {});
    // Node envoie un corps chunké sans Content-Length ; le proxy lit Content-Length.
    if (data) headers['Content-Length'] = Buffer.byteLength(data, 'utf8');
    const req = http.request({
      host: '127.0.0.1', port, path: chemin, method: data ? 'POST' : 'GET',
      headers
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

(async () => {
  const port = await portLibre();
  const proxy = cp.spawn(PY, [path.join(RACINE, 'proxy_server.py')], {
    cwd: RACINE,
    env: Object.assign({}, process.env, { THEO_BENCH_PORT: String(port), THEO_CONTROL_TOKEN: TOKEN }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let sortieProxy = '';
  proxy.stderr.on('data', d => { sortieProxy += String(d); });
  proxy.stdout.on('data', d => { sortieProxy += String(d); });
  let pret = false;
  for (let i = 0; i < 200; i++) {
    try { const r = await requete(port, '/__theologicus_ping'); if (r.status === 200) { pret = true; break; } } catch (e) {}
    await pause(150);
  }
  ok('proxy démarré avec le plan de contrôle', pret, pret ? '' : sortieProxy.slice(0, 500));
  if (!pret) { proxy.kill(); console.log('\nBANC V693 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC'); process.exit(1); }

  const sans = await requete(port, '/theo-control/pending');
  ok('routes invisibles SANS jeton', sans.status === 404, 'statut=' + sans.status);
  const avec = await requete(port, '/theo-control/pending', null, TOKEN);
  ok('routes accessibles AVEC jeton', avec.status === 200, 'statut=' + avec.status);

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
  const attendre = ms => page.waitForFunction(() => !!(window.__v693Controle && window.__v693Controle.executer), null, { timeout: ms }).then(() => true).catch(() => false);
  let moduleOk = await attendre(90000);
  if (!moduleOk) { try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 }); } catch (e) {} moduleOk = await attendre(90000); }
  ok('module v693 chargé (contrôle négatif : absent sur l’ancien build)', moduleOk);
  if (!moduleOk) {
    await browser.close(); proxy.kill();
    console.log('\nBANC V693 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC'); process.exit(1);
  }

  const cmds = await page.evaluate(() => window.__v693Controle.commandes);
  ok('liste blanche de 8 commandes', cmds.length === 8, cmds.join(', '));
  ok('aucune commande d’écriture dans la liste blanche',
    !cmds.some(c => /delete|write|set|exec|key|config_set/i.test(c)), cmds.join(', '));

  const soumis = await requete(port, '/theo-control/submit', { command: 'ping', args: {} }, TOKEN);
  const j1 = JSON.parse(soumis.body);
  ok('commande soumise au proxy', soumis.status === 200 && !!j1.id, JSON.stringify(j1));
  let rep = null;
  for (let i = 0; i < 60; i++) {
    const r = await requete(port, '/theo-control/result?id=' + encodeURIComponent(j1.id), null, TOKEN);
    const o = JSON.parse(r.body);
    if (!o.pending) { rep = o; break; }
    await pause(150);
  }
  ok('app exécute la commande et rend le résultat', !!rep && !!rep.result && rep.result.ok === true, JSON.stringify(rep));
  ok('résultat contient le comptage des modules', !!rep && rep.result.modules >= 135, String(rep && rep.result.modules));

  const interdit = await requete(port, '/theo-control/submit', { command: 'delete_all_chats', args: {} }, TOKEN);
  const j2 = JSON.parse(interdit.body);
  let rep2 = null;
  for (let i = 0; i < 40; i++) {
    const r = await requete(port, '/theo-control/result?id=' + encodeURIComponent(j2.id), null, TOKEN);
    const o = JSON.parse(r.body);
    if (!o.pending) { rep2 = o; break; }
    await pause(150);
  }
  ok('commande hors liste blanche REFUSÉE', !!rep2 && /non autorisée/.test(rep2.error || ''), JSON.stringify(rep2));

  /* Serveur MCP réel, en stdio. */
  const entrees = [
    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'theo_ping', arguments: {} } })
  ].join('\n') + '\n';
  const mcp = cp.spawnSync(PY, [path.join(RACINE, 'tools', 'theo_mcp.py')], {
    cwd: RACINE, input: entrees, encoding: 'utf8', timeout: 30000,
    env: Object.assign({}, process.env, { THEO_CONTROL_URL: 'http://127.0.0.1:' + port, THEO_CONTROL_TOKEN: TOKEN })
  });
  const lignes = String(mcp.stdout || '').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
  const init = lignes.find(x => x.id === 1), liste = lignes.find(x => x.id === 2), appel = lignes.find(x => x.id === 3);
  ok('MCP initialize répond', !!init && init.result.protocolVersion === '2024-11-05', JSON.stringify(init && init.result));
  ok('MCP tools/list expose 8 outils', !!liste && liste.result.tools.length === 8, String(liste && liste.result.tools.length));
  let contenu = null;
  try { contenu = JSON.parse(appel.result.content[0].text); } catch (e) {}
  ok('MCP tools/call atteint l’application', !!contenu && !!contenu.result && contenu.result.ok === true, JSON.stringify(contenu));
  ok('aucune erreur JS de page', erreurs.length === 0, erreurs.slice(0, 2).join(' | '));

  await browser.close(); proxy.kill();
  console.log('\nBANC V693 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC');
  process.exit(ko_n ? 1 : 0);
})().catch(e => { console.error('CRASH : ' + (e && e.stack || e)); process.exit(1); });
