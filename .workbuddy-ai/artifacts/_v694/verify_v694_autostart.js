/* v694 — DÉMARRAGE AUTOMATIQUE DU PONT MCP.

   Démarre le proxy SANS THEO_CONTROL_TOKEN, avec un LOCALAPPDATA isolé :
     - un jeton est généré et persisté au 1er lancement ;
     - la configuration client est déposée avec le port RÉEL ;
     - les routes exigent le jeton, l'app reçoit le même jeton injecté ;
     - une commande circule de bout en bout (HTTP + client MCP stdio) ;
     - le jeton survit à un redémarrage.

   Contrôle négatif : sur l'ancien build (v693), aucun fichier n'est créé.
*/
const path = require('path'), fs = require('fs'), os = require('os');
const net = require('net'), http = require('http'), cp = require('child_process');
const { chromium } = require('playwright');
const RACINE = path.resolve(process.env.BENCH_ROOT || path.resolve(__dirname, '../../..'));
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
    const headers = { 'Content-Type': 'application/json' };
    if (jeton) headers['X-Theo-Control-Token'] = jeton;
    if (data) headers['Content-Length'] = Buffer.byteLength(data, 'utf8');
    const req = http.request({ host: '127.0.0.1', port, path: chemin, method: data ? 'POST' : 'GET', headers }, r => {
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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'theov694-'));
  const donnees = path.join(tmp, 'THEOLOGICUS');
  const fichierJeton = path.join(donnees, 'theologicus_control.json');
  const fichierConfig = path.join(donnees, 'theologicus_mcp.json');
  // 🔴 Effacer toute valeur héritée : c'est le cas « utilisateur normal ».
  const envProxy = Object.assign({}, process.env, {
    THEO_BENCH_PORT: String(port), LOCALAPPDATA: tmp, THEO_CONTROL_TOKEN: ''
  });
  const demarrer = () => cp.spawn(PY, [path.join(RACINE, 'proxy_server.py')], {
    cwd: RACINE, env: envProxy, stdio: ['ignore', 'pipe', 'pipe']
  });
  let proxy = demarrer(), sortie = '';
  const cap = p => { p.stderr.on('data', d => { sortie += String(d); }); p.stdout.on('data', d => { sortie += String(d); }); };
  cap(proxy);
  const pret = async () => {
    for (let i = 0; i < 200; i++) {
      try { if ((await requete(port, '/__theologicus_ping')).status === 200) return true; } catch (e) {}
      await pause(150);
    }
    return false;
  };
  const prepret = await pret();
  ok('proxy démarré SANS jeton explicite', prepret, prepret ? '' : sortie.slice(0, 400));
  if (!prepret) { proxy.kill(); console.log('\nBANC V694 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC'); process.exit(1); }

  ok('fichier de jeton créé automatiquement', fs.existsSync(fichierJeton));
  ok('configuration MCP créée automatiquement', fs.existsSync(fichierConfig));
  if (!fs.existsSync(fichierJeton) || !fs.existsSync(fichierConfig)) {
    proxy.kill();
    console.log('\nBANC V694 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC');
    process.exit(1);
  }
  let jeton = '', cfg = null, donneesJeton = null;
  try { donneesJeton = JSON.parse(fs.readFileSync(fichierJeton, 'utf8')); jeton = donneesJeton.token || ''; } catch (e) {}
  try { cfg = JSON.parse(fs.readFileSync(fichierConfig, 'utf8')); } catch (e) {}
  ok('jeton aléatoire d’au moins 32 caractères', jeton.length >= 32, 'longueur=' + jeton.length);
  const srv = cfg && cfg.mcpServers && cfg.mcpServers.theologicus;
  ok('config : URL avec le port RÉEL', !!srv && srv.env.THEO_CONTROL_URL === 'http://127.0.0.1:' + port,
    String(srv && srv.env.THEO_CONTROL_URL));
  ok('config : même jeton que le proxy', !!srv && srv.env.THEO_CONTROL_TOKEN === jeton);
  ok('config : chemin du client MCP existant',
    !!srv && Array.isArray(srv.args) && fs.existsSync(srv.args[0]), String(srv && srv.args && srv.args[0]));

  const sans = await requete(port, '/theo-control/pending');
  ok('routes invisibles SANS jeton', sans.status === 404, 'statut=' + sans.status);
  const avec = await requete(port, '/theo-control/pending', null, jeton);
  ok('routes actives AVEC le jeton auto', avec.status === 200, 'statut=' + avec.status);

  const html = await requete(port, '/THEOLOGICUS.html');
  ok('jeton auto injecté dans la page servie',
    html.status === 200 && html.body.indexOf('window.__THEO_CONTROL_TOKEN__=') >= 0 && html.body.indexOf(jeton) >= 0);

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
  ok('module v693 chargé avec le jeton auto', moduleOk);
  if (!moduleOk) {
    await browser.close(); proxy.kill();
    console.log('\nBANC V694 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC'); process.exit(1);
  }

  const soumis = await requete(port, '/theo-control/submit', { command: 'ping', args: {} }, jeton);
  const j1 = JSON.parse(soumis.body);
  ok('commande acceptée avec le jeton auto', soumis.status === 200 && !!j1.id, JSON.stringify(j1));
  let rep = null;
  for (let i = 0; i < 60; i++) {
    const r = await requete(port, '/theo-control/result?id=' + encodeURIComponent(j1.id), null, jeton);
    const o = JSON.parse(r.body);
    if (!o.pending) { rep = o; break; }
    await pause(150);
  }
  ok('app exécute avec le jeton auto', !!rep && !!rep.result && rep.result.ok === true, JSON.stringify(rep));

  /* Client MCP réel, avec les valeurs lues DANS le fichier de configuration. */
  const entrees = [
    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'theo_ping', arguments: {} } })
  ].join('\n') + '\n';
  const mcp = cp.spawnSync(PY, [srv.args[0]], {
    cwd: RACINE, input: entrees, encoding: 'utf8', timeout: 30000,
    env: Object.assign({}, process.env, srv.env)
  });
  const lignes = String(mcp.stdout || '').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
  const init = lignes.find(x => x.id === 1), appel = lignes.find(x => x.id === 2);
  ok('client MCP démarre depuis la config', !!init && init.result.protocolVersion === '2024-11-05');
  let contenu = null;
  try { contenu = JSON.parse(appel.result.content[0].text); } catch (e) {}
  ok('client MCP atteint l’application', !!contenu && !!contenu.result && contenu.result.ok === true, JSON.stringify(contenu));
  ok('aucune erreur JS de page', erreurs.length === 0, erreurs.slice(0, 2).join(' | '));

  /* Persistance : redémarrage avec le même dossier de données. */
  await browser.close();
  proxy.kill();
  await pause(600);
  proxy = demarrer(); cap(proxy);
  const repret = await pret();
  ok('proxy redémarré', repret);
  let jeton2 = '';
  try { jeton2 = (JSON.parse(fs.readFileSync(fichierJeton, 'utf8')).token) || ''; } catch (e) {}
  ok('jeton STABLE après redémarrage', jeton2 === jeton && jeton2.length >= 32);
  const apres = await requete(port, '/theo-control/pending', null, jeton2);
  ok('jeton persisté toujours accepté', apres.status === 200, 'statut=' + apres.status);

  proxy.kill();
  console.log('\nBANC V694 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC');
  process.exit(ko_n ? 1 : 0);
})().catch(e => { console.error('CRASH : ' + (e && e.stack || e)); process.exit(1); });
