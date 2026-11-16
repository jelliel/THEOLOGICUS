/* v697 — COMMANDES D'ÉCRITURE (liste blanche bornée).

   Vérifie que :
     - les 5 commandes d'écriture sont ENREGISTRÉES dans la liste blanche ;
     - elles sont exposées par les DEUX transports (HTTP et stdio) ;
     - elles agissent réellement (conversation, canal, routine, voix) ;
     - une commande inconnue ou un identifiant invalide est REFUSÉ ;
     - aucune commande destructrice (suppression, exécution, clé) n'existe ;
     - `send_message` sans clé API échoue proprement, sans planter ni bloquer.

   Contrôle négatif : sur l'ancien build, __v697Ecriture n'existe pas.
*/
const path = require('path'), fs = require('fs'), net = require('net');
const http = require('http'), cp = require('child_process');
const { chromium } = require('playwright');
const RACINE = path.resolve(process.env.BENCH_ROOT || path.resolve(__dirname, '../../..'));
const TOKEN = 'bench-token-v697';
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
function ouNull(txt) { try { return JSON.parse(txt); } catch (e) { return null; } }
/* Le contenu d'un tools/call porte {result: <valeur applicative>} : forme
   établie par v693 et vérifiée par son banc. On la déballe ici. */
function res(contenu) { return (contenu && contenu.result !== undefined) ? contenu.result : contenu; }
const pause = ms => new Promise(r => setTimeout(r, ms));

/* Appel d'un outil via le transport HTTP : c'est le chemin réel du client. */
async function appel(port, outil, args, id) {
  const r = await requete(port, '/mcp', { jsonrpc: '2.0', id: id || 1, method: 'tools/call', params: { name: outil, arguments: args || {} } }, TOKEN);
  const j = ouNull(r.body);
  let contenu = null;
  try { contenu = j && j.result ? JSON.parse(j.result.content[0].text) : null; } catch (e) {}
  return { brut: j, contenu: contenu };
}

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
  let pret = false;
  for (let i = 0; i < 200; i++) {
    try { const r = await requete(port, '/__theologicus_ping'); if (r.status === 200) { pret = true; break; } } catch (e) {}
    await pause(150);
  }
  ok('proxy démarré', pret, pret ? '' : sortie.slice(0, 300));
  if (!pret) { proxy.kill(); console.log('\nBANC V697 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC'); process.exit(1); }

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
  const attendre = ms => page.waitForFunction(() => !!(window.__v697Ecriture && window.__v693Controle && window.__v693Controle.ajouter), null, { timeout: ms }).then(() => true).catch(() => false);
  let moduleOk = await attendre(90000);
  if (!moduleOk) { try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 }); } catch (e) {} moduleOk = await attendre(90000); }
  ok('module v697 chargé (contrôle négatif : absent sur l’ancien build)', moduleOk);
  if (!moduleOk) {
    await browser.close(); proxy.kill();
    console.log('\nBANC V697 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC'); process.exit(1);
  }

  const liste = await page.evaluate(() => window.__v693Controle.commandes);
  const attendu = ['new_conversation', 'send_message', 'activate_channel', 'toggle_routine', 'narrate'];
  ok('les 5 commandes d’écriture sont enregistrées',
    attendu.every(c => liste.indexOf(c) >= 0), liste.join(', '));
  ok('aucune commande destructrice (suppression, exécution, clé)',
    !liste.some(c => /delete|write|set|exec|key|config_set/i.test(c)), liste.join(', '));

  /* Les 8 commandes de lecture seule sont toujours là. */
  const lectureSeule = ['ping', 'list_conversations', 'search_conversations', 'read_conversation',
    'list_channels', 'list_agents', 'list_routines', 'get_config'];
  ok('les 8 commandes de lecture seule sont intactes',
    lectureSeule.every(c => liste.indexOf(c) >= 0), liste.join(', '));

  /* Les outils sont exposés par le transport HTTP ET par le stdio. */
  const listeHttp = await requete(port, '/mcp', { jsonrpc: '2.0', id: 2, method: 'tools/list' }, TOKEN);
  const nomsHttp = ((ouNull(listeHttp.body) || {}).result || {}).tools.map(t => t.name);
  ok('tools/list HTTP expose les 5 nouveaux outils',
    ['theo_new_conversation', 'theo_send_message', 'theo_activate_channel', 'theo_toggle_routine', 'theo_narrate']
      .every(n => nomsHttp.indexOf(n) >= 0), nomsHttp.join(', '));

  const entrees = [
    JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
  ].join('\n') + '\n';
  const mcp = cp.spawnSync(PY, [path.join(RACINE, 'tools', 'theo_mcp.py')], {
    cwd: RACINE, input: entrees, encoding: 'utf8', timeout: 30000,
    env: Object.assign({}, process.env, { THEO_CONTROL_URL: 'http://127.0.0.1:' + port, THEO_CONTROL_TOKEN: TOKEN })
  });
  const lignes = String(mcp.stdout || '').split('\n').filter(Boolean).map(l => ouNull(l)).filter(Boolean);
  const lstd = lignes.find(x => x.id === 2);
  const nomsStd = ((lstd && lstd.result) || {}).tools || [];
  ok('tools/list stdio expose les 5 nouveaux outils',
    ['theo_new_conversation', 'theo_send_message', 'theo_activate_channel', 'theo_toggle_routine', 'theo_narrate']
      .every(n => nomsStd.map(t => t.name).indexOf(n) >= 0), nomsStd.map(t => t.name).join(', '));

  /* Préparation : une routine à basculer, et un espion sur le moteur vocal. */
  const prep = await page.evaluate(async () => {
    window.__v697Spy = [];
    const orig = window.ttsEmission;
    window.ttsEmission = function (t, l) { window.__v697Spy.push(String(t)); return true; };
    window.__v697Restore = function () { window.ttsEmission = orig; };
    let routine = null, e = null;
    try {
      const r = await window.__v692Routines.creer({ nom: 'Routine banc v697', message: 'Question de test', type: 'minutes', minutes: 30 });
      routine = r ? { id: r.id, actif: !!r.actif } : null;
    } catch (err) { e = String(err && err.message || err); }
    return { routine: routine, e: e };
  });
  ok('routine de test créée', !!(prep.routine && prep.routine.id), JSON.stringify(prep));

  /* ── Actions réelles, via le transport HTTP ─────────────────────────── */
  const a1 = await appel(port, 'theo_new_conversation', {}, 11);
  ok('new_conversation crée une conversation',
    !!(res(a1.contenu) && res(a1.contenu).ok && res(a1.contenu).chatId), JSON.stringify(a1.contenu));

  const a2 = await appel(port, 'theo_activate_channel', { id: 'grec' }, 12);
  ok('activate_channel active un canal', !!(res(a2.contenu) && res(a2.contenu).ok && res(a2.contenu).canal === 'grec'),
    JSON.stringify(a2.contenu));

  const a3 = await appel(port, 'theo_activate_channel', { id: 'canal-inexistant' }, 13);
  ok('activate_channel REFUSE un canal inconnu',
    !!(res(a3.contenu) && res(a3.contenu).error && /inconnu/i.test(res(a3.contenu).error)), JSON.stringify(a3.contenu));

  const a4 = await appel(port, 'theo_toggle_routine', { id: prep.routine && prep.routine.id }, 14);
  ok('toggle_routine active la routine',
    !!(res(a4.contenu) && res(a4.contenu).ok && res(a4.contenu).actif === true), JSON.stringify(a4.contenu));

  const a5 = await appel(port, 'theo_toggle_routine', { id: 'rt_inexistant' }, 15);
  ok('toggle_routine REFUSE une routine inconnue',
    !!(res(a5.contenu) && res(a5.contenu).error && /inconnue/i.test(res(a5.contenu).error)), JSON.stringify(a5.contenu));

  const a6 = await appel(port, 'theo_narrate', { texte: 'Bonjour le monde, ici THEOLOGICUS.' }, 16);
  const spy = await page.evaluate(() => { const s = window.__v697Spy.slice(); if (window.__v697Restore) window.__v697Restore(); return s; });
  ok('narrate fait parler le moteur',
    !!(res(a6.contenu) && res(a6.contenu).ok) && spy.length >= 1 && spy[0].indexOf('THEOLOGICUS') >= 0,
    JSON.stringify({ r: a6.contenu, spy: spy }));

  const tEnvoi = Date.now();
  const a7 = await appel(port, 'theo_send_message', { texte: 'Test sans clé API.' }, 17);
  const dureeEnvoi = Date.now() - tEnvoi;
  ok('send_message échoue proprement sans clé API',
    !!(res(a7.contenu) && (res(a7.contenu).ok !== undefined || res(a7.contenu).error !== undefined)) && dureeEnvoi < 12000,
    'durée=' + dureeEnvoi + 'ms ' + JSON.stringify(a7.contenu));

  const a8 = await appel(port, 'theo_supprimer_tout', {}, 18);
  ok('commande inconnue REFUSÉE',
    !!(res(a8.contenu) && res(a8.contenu).error && /autoris/i.test(res(a8.contenu).error)), JSON.stringify(a8.contenu));

  ok('aucune erreur JS de page', erreurs.length === 0, erreurs.slice(0, 2).join(' | '));

  await browser.close(); proxy.kill();
  console.log('\nBANC V697 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC');
  process.exit(ko_n ? 1 : 0);
})().catch(e => { console.error('CRASH : ' + (e && e.stack || e)); process.exit(1); });
