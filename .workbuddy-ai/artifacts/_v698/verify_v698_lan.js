/* v698 — PONT MCP PILOTÉ DEPUIS LE RÉSEAU (Android → PC de bureau).

   Phase 1 — proxy SANS THEO_CONTROL_LAN :
     - un client BOUCLAGE avec jeton passe ;
     - un client RÉSEAU (IP LAN de la machine) est REFUSÉ même avec le jeton.

   Phase 2 — proxy AVEC THEO_CONTROL_LAN=1 :
     - client réseau SANS jeton → refusé ;
     - client réseau AVEC jeton dans l'URL → accepté ;
     - client réseau AVEC jeton dans le CORPS → accepté ;
     - une page chargée SANS proxy (serveur statique nu, comme l'APK) ne voit
       AUCUN pont local : le panneau MCP affiche le formulaire distant ;
     - la page configure le pont distant, le teste, puis EXÉCUTE réellement
       une commande soumise au bureau — de bout en bout.

   Contrôle négatif : sur l'ancien build, le client réseau est refusé même
   avec THEO_CONTROL_LAN=1 (pas de porte réseau du tout).
*/
const path = require('path'), fs = require('fs'), os = require('os'), net = require('net');
const http = require('http'), cp = require('child_process');
const { chromium } = require('playwright');
const RACINE = path.resolve(process.env.BENCH_ROOT || path.resolve(__dirname, '../../..'));
const TOKEN = 'bench-token-v698';
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
function ipLan() {
  const ifs = os.networkInterfaces();
  for (const nom of Object.keys(ifs)) {
    for (const i of ifs[nom] || []) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return null;
}
/* hôte : '127.0.0.1' (bouclage) ou l'IP LAN de la machine (client réseau). */
function requete(hote, port, chemin, corps, jeton) {
  return new Promise((res, rej) => {
    const data = corps ? JSON.stringify(corps) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (jeton) headers['X-Theo-Control-Token'] = jeton;
    if (data) headers['Content-Length'] = Buffer.byteLength(data, 'utf8');
    const req = http.request({ host: hote, port, path: chemin, method: data ? 'POST' : 'GET', headers }, r => {
      let b = ''; r.on('data', d => b += d);
      r.on('end', () => res({ status: r.statusCode, body: b }));
    });
    req.on('error', rej);
    if (data) req.write(data);
    req.end();
  });
}
function ouNull(t) { try { return JSON.parse(t); } catch (e) { return null; } }
const pause = ms => new Promise(r => setTimeout(r, ms));

/* Serveur statique NU : sert le dépôt SANT les routes de contrôle — comme
   un APK qui n'a pas de proxy Python. Aucun jeton n'est injecté. */
function serveurStatique(port) {
  const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript',
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon' };
  return http.createServer((req, res) => {
    let p = decodeURIComponent(req.path || req.url.split('?')[0]);
    if (p === '/') p = '/THEOLOGICUS.html';
    const f = path.join(RACINE, p.replace(/^\/+/, ''));
    if (!f.startsWith(RACINE) || !fs.existsSync(f) || !fs.statSync(f).isFile()) {
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, { 'Content-Type': mime[path.extname(f).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  }).listen(port, '127.0.0.1');
}

(async () => {
  const LAN = ipLan();
  ok('adresse réseau locale disponible', !!LAN, String(LAN));

  /* ── Phase 1 : SANS THEO_CONTROL_LAN ─────────────────────────────────── */
  const port1 = await portLibre();
  const p1 = cp.spawn(PY, [path.join(RACINE, 'proxy_server.py')], {
    cwd: RACINE,
    env: Object.assign({}, process.env, { THEO_BENCH_PORT: String(port1), THEO_CONTROL_TOKEN: TOKEN, THEO_CONTROL_LAN: '' }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let pret1 = false;
  for (let i = 0; i < 200; i++) {
    try { if ((await requete('127.0.0.1', port1, '/__theologicus_ping')).status === 200) { pret1 = true; break; } } catch (e) {}
    await pause(150);
  }
  ok('proxy (sans LAN) démarré', pret1);
  if (LAN) {
    /* Bouclage via l'en-tête : la voie qui existait AVANT v698, pour que le
       contrôle négatif n'échoue QUE sur les nouveautés (réseau + distant). */
    const loc = await requete('127.0.0.1', port1, '/theo-control/status', null, TOKEN);
    ok('bouclage : accepté avec le jeton', loc.status === 200, 'statut=' + loc.status);
    const reseau = await requete(LAN, port1, '/theo-control/status?token=' + encodeURIComponent(TOKEN));
    ok('réseau : REFUSÉ même avec le jeton (défaut intact)', reseau.status === 404, 'statut=' + reseau.status);
  }
  p1.kill();
  await pause(500);

  /* ── Phase 2 : AVEC THEO_CONTROL_LAN=1 ───────────────────────────────── */
  const port2 = await portLibre();
  const p2 = cp.spawn(PY, [path.join(RACINE, 'proxy_server.py')], {
    cwd: RACINE,
    env: Object.assign({}, process.env, { THEO_BENCH_PORT: String(port2), THEO_CONTROL_TOKEN: TOKEN, THEO_CONTROL_LAN: '1' }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let pret2 = false;
  for (let i = 0; i < 200; i++) {
    try { if ((await requete('127.0.0.1', port2, '/__theologicus_ping')).status === 200) { pret2 = true; break; } } catch (e) {}
    await pause(150);
  }
  ok('proxy (avec LAN) démarré', pret2);
  if (!pret2) { p1.kill(); p2.kill(); process.exit(1); }

  if (LAN) {
    const sans = await requete(LAN, port2, '/theo-control/status');
    ok('réseau : refusé SANS jeton', sans.status === 404, 'statut=' + sans.status);
    const mauvais = await requete(LAN, port2, '/theo-control/status?token=mauvais');
    ok('réseau : refusé avec un MAUVAIS jeton', mauvais.status === 404, 'statut=' + mauvais.status);
    const avec = await requete(LAN, port2, '/theo-control/status?token=' + encodeURIComponent(TOKEN));
    ok('réseau : accepté avec le jeton dans l’URL', avec.status === 200, 'statut=' + avec.status);
    const corpsOk = await requete(LAN, port2, '/theo-control/submit', { command: 'ping', args: {}, token: TOKEN });
    const jc = ouNull(corpsOk.body);
    ok('réseau : accepté avec le jeton dans le CORPS', corpsOk.status === 200 && !!(jc && jc.id), JSON.stringify(jc));
  }

  /* ── La page APK : serveur statique nu, aucun pont local ─────────────── */
  const portA = await portLibre();
  const statique = serveurStatique(portA);
  const browser = await chromium.launch(Object.assign({ args: ['--no-sandbox', '--disable-dev-shm-usage'] },
    process.env.PW_DIR ? { executablePath: CHROME } : {}));
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(String(e.message)));
  await page.addInitScript(() => {
    try { localStorage.setItem('theologicus_wizard_skipped', '1'); } catch (e) {}
    try { sessionStorage.setItem('theologicus_auth', 'true'); } catch (e) {}
  });
  await page.goto('http://127.0.0.1:' + portA + '/THEOLOGICUS.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  const attendre = ms => page.waitForFunction(() => !!(window.__v695Mcp && window.__v693Controle), null, { timeout: ms }).then(() => true).catch(() => false);
  let moduleOk = await attendre(90000);
  if (!moduleOk) { try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 }); } catch (e) {} moduleOk = await attendre(90000); }
  ok('modules chargés depuis un serveur sans pont', moduleOk);
  if (!moduleOk) {
    await browser.close(); statique.close(); p2.kill();
    console.log('\nBANC V698 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC'); process.exit(1);
  }

  const local = await page.evaluate(() => ({
    jetonLocal: typeof window.__THEO_CONTROL_TOKEN__ === 'string' && window.__THEO_CONTROL_TOKEN__.length > 0,
    distant: window.__v693Controle.distant ? window.__v693Controle.distant() : null
  }));
  ok('aucun pont local injecté (cas APK)', local.jetonLocal === false && local.distant === null, JSON.stringify(local));

  await page.evaluate(() => window.__v695Mcp.ouvrir());
  await page.waitForFunction(() => {
    const e = document.getElementById('v695-etat');
    return e && e.textContent && e.textContent !== '…';
  }, null, { timeout: 20000 }).catch(() => {});
  const modale = await page.evaluate(() => ({
    etat: (document.getElementById('v695-etat') || {}).textContent || '',
    formulaire: !!document.getElementById('v695-dist-url'),
    jeton: !!document.getElementById('v695-dist-jeton'),
    tester: !!document.getElementById('v695-dist-tester')
  }));
  ok('panneau annonce INACTIF et propose le formulaire distant',
    modale.etat === 'INACTIF' && modale.formulaire && modale.jeton && modale.tester, JSON.stringify(modale));

  /* Configurer le pont distant vers le proxy de bureau (IP LAN → la porte
     réseau est réellement empruntée, pas un contournement bouclage). */
  const hotePont = LAN || '127.0.0.1';
  const urlPont = 'http://' + hotePont + ':' + port2;
  let cfg = null;
  try {
    cfg = await page.evaluate((o) => {
      if (!window.__v695Mcp || typeof window.__v695Mcp.ecrireDistant !== 'function') return null;
      window.__v695Mcp.ecrireDistant({ url: o.url, token: o.token });
      return window.__v693Controle.distant ? window.__v693Controle.distant() : null;
    }, { url: urlPont, token: TOKEN });
  } catch (e) { cfg = null; }
  ok('pont distant enregistré dans l’app', !!(cfg && cfg.url === urlPont && cfg.token === TOKEN), JSON.stringify(cfg));

  let test = null;
  try {
    test = await page.evaluate((o) => {
      if (!window.__v695Mcp || typeof window.__v695Mcp.testerDistant !== 'function') return null;
      return window.__v695Mcp.testerDistant(o.url, o.token);
    }, { url: urlPont, token: TOKEN });
  } catch (e) { test = null; }
  ok('testerDistant() voit le pont de bureau', !!(test && test.ok), JSON.stringify(test));

  /* Fin en bout : une commande soumise au BUREAU est exécutée par l'APK. */
  const soumis = await requete('127.0.0.1', port2, '/theo-control/submit', { command: 'ping', args: {}, token: TOKEN });
  const js = ouNull(soumis.body);
  ok('commande soumise au bureau', soumis.status === 200 && !!(js && js.id), JSON.stringify(js));
  let rep = null;
  for (let i = 0; i < 40; i++) {
    const r = await requete('127.0.0.1', port2, '/theo-control/result?id=' + encodeURIComponent(js.id) + '&token=' + encodeURIComponent(TOKEN));
    const o = ouNull(r.body);
    if (o && !o.pending) { rep = o; break; }
    await pause(200);
  }
  ok('la page APK exécute la commande du bureau',
    !!(rep && rep.result && rep.result.ok === true), JSON.stringify(rep));

  ok('aucune erreur JS de page', erreurs.length === 0, erreurs.slice(0, 2).join(' | '));

  await browser.close();
  statique.close();
  p2.kill();
  console.log('\nBANC V698 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC');
  process.exit(ko_n ? 1 : 0);
})().catch(e => { console.error('CRASH : ' + (e && e.stack || e)); process.exit(1); });
