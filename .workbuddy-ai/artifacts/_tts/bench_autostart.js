/* ============================================================================
   Banc — le demarrage AUTOMATIQUE, de bout en bout, sur l'exe installe.

   Ce que ce banc repond exactement : « quand je lance THEOLOGICUS, le serveur
   Supertonic demarre-t-il tout seul ? » — la demande de l'utilisateur.

   Ce qui etait deja prouve, et ce qui ne l'etait pas
   --------------------------------------------------
   `verifie_exe.py` prouve que les ROUTES existent et que `st_start()` marche
   quand on l'appelle a la main. Cela ne prouve PAS la chaine reelle :
   chargement de la page -> ttsCablerParametres() -> ttsSupertonicDemarrageAuto()
   -> POST /supertonic/start -> service pret.

   On teste donc sur l'EXE INSTALLE, pas sur un serveur de fichiers : lance en
   mode `THEOLOGICUS_NO_WINDOW=1`, il sert l'application ET les routes du proxy
   sur le meme port — exactement la configuration que voit l'utilisateur.
   Un simple serveur de fichiers ne pourrait pas repondre a /supertonic/status
   et le banc passerait a cote du vrai chemin.

   Precaution indispensable : on ARRETE le service avant de commencer. S'il
   tournait deja, le banc serait vert sans rien prouver.

   Usage : node .workbuddy-ai/artifacts/_tts/bench_autostart.js [chemin/exe]
   ============================================================================ */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const ROOT = path.resolve('C:/Theologicus');
const EXE = process.argv[2] || path.join(ROOT, '_inst_v102', 'THEOLOGICUS.exe');
const APPORT = 8951;        // l'exe sert l'app + les routes
const SPORT = 8091;         // port du service Supertonic (ST_PORT)
const CDP = 9487;
const CHROME = 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe';

const sleep = ms => new Promise(r => setTimeout(r, ms));
let ech = 0;
const ok = (n, c, d) => { if (!c) ech++; console.log((c ? 'OK    ' : 'ECHEC ') + n + (d !== undefined ? '  -> ' + JSON.stringify(d) : '')); };

let exe = null, chrome = null, ws = null, requeteCDP = null;

const requeteHttp = (port, chemin, methode) => new Promise(res => {
  const rq = http.request({ host: '127.0.0.1', port, path: chemin, method: methode || 'GET', timeout: 30000 }, r => {
    let d = '';
    r.on('data', c => d += c);
    r.on('end', () => res({ status: r.statusCode, corps: d }));
  });
  rq.on('error', e => res({ status: null, corps: e.message }));
  rq.on('timeout', () => { rq.destroy(); res({ status: null, corps: 'timeout' }); });
  rq.end();
});

const statut = async () => {
  const r = await requeteHttp(APPORT, '/supertonic/status');
  if (r.status !== 200) return null;
  try { return JSON.parse(r.corps); } catch (e) { return null; }
};

const attendre = async (predicat, ms, pas) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await predicat()) return true;
    await sleep(pas || 1000);
  }
  return false;
};

const tuerChrome = () => new Promise(res => {
  const t = spawn('taskkill', ['/F', '/IM', 'chrome.exe'], { stdio: 'ignore' });
  t.on('exit', () => res()); t.on('error', () => res());
});

(async () => {
  try {
    console.log('--- Demarrage automatique du service, sur l exe installe ---');
    console.log('exe : ' + EXE + '\n');
    ok('l exe existe', fs.existsSync(EXE));
    if (!fs.existsSync(EXE)) throw new Error('exe absent');

    // 1) Lancer l'exe en mode serveur seul (sert l'app ET les routes).
    const env = Object.assign({}, process.env, { THEOLOGICUS_NO_WINDOW: '1' });
    exe = spawn(EXE, ['--port', String(APPORT)], { cwd: path.dirname(EXE), env });
    exe.on('error', e => console.log('ERREUR spawn exe : ' + e.message));

    const monte = await attendre(async () => (await statut()) !== null, 40000, 700);
    ok('l exe sert les routes du proxy', monte);
    if (!monte) throw new Error('routes injoignables sur ' + APPORT);

    // 2) Etat AVANT : rien ne doit tourner, sinon le banc ne prouve rien.
    await requeteHttp(APPORT, '/supertonic/stop', 'POST');
    await sleep(1500);
    const avant = await statut();
    console.log('etat avant : ' + JSON.stringify({ running: avant.running, ready: avant.ready, script: avant.script, deps: avant.deps }));
    ok('le service est ARRETE avant le test (sinon rien n est prouve)', avant.running === false);
    ok('le script du service est livre avec l app', avant.script === true);
    ok('les dependances Python sont disponibles', avant.deps === true, avant.python);

    // 3) Charger l'application dans un vrai Chrome : le demarrage auto doit partir.
    await tuerChrome();
    await sleep(1500);
    const profil = path.join(ROOT, '.workbuddy-ai', 'artifacts', '_tts', 'profil-autostart');
    try { fs.rmSync(profil, { recursive: true, force: true }); } catch (e) {}
    chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP,
      '--user-data-dir=' + profil, '--no-first-run', '--no-default-browser-check',
      '--disable-extensions', '--disable-gpu', '--window-size=1500,900', 'about:blank'], { stdio: 'ignore' });

    let cible = null;
    for (let i = 0; i < 40; i++) {
      await sleep(500);
      try {
        const ctl = new AbortController();
        const min = setTimeout(() => ctl.abort(), 3000);
        const l = await (await fetch('http://127.0.0.1:' + CDP + '/json/list', { signal: ctl.signal })).json();
        clearTimeout(min);
        cible = l.find(x => x.type === 'page' && x.webSocketDebuggerUrl);
        if (cible) break;
      } catch (e) {}
    }
    if (!cible) throw new Error('Chrome/CDP indisponible');
    ws = new WebSocket(cible.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
    await new Promise((res, rej) => {
      const min = setTimeout(() => rej(new Error('WebSocket CDP : pas de reponse apres 10 s')), 10000);
      ws.on('open', () => { clearTimeout(min); res(); });
      ws.on('error', e => { clearTimeout(min); rej(new Error('WebSocket CDP : ' + e.message)); });
    });

    let n = 0; const pend = new Map(); const attentes = [];
    ws.setMaxListeners(0);
    ws.on('message', raw => {
      let m; try { m = JSON.parse(raw.toString()); } catch (e) { return; }
      if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
      if (m.method) attentes.slice().forEach(f => { if (f.m === m.method) { attentes.splice(attentes.indexOf(f), 1); f.r(m.params); } });
    });
    // UN SEUL compteur d'identifiants (piege du banc v109).
    requeteCDP = (me, pa) => new Promise((res, rej) => {
      const i = ++n;
      const min = setTimeout(() => { pend.delete(i); rej(new Error(me + ' sans reponse')); }, 25000);
      pend.set(i, m => { clearTimeout(min); if (m.error) return rej(new Error(me + ' : ' + JSON.stringify(m.error))); res(m.result); });
      ws.send(JSON.stringify({ id: i, method: me, params: pa || {} }));
    });
    const guetter = (me, ms) => new Promise((res, rej) => {
      const f = { m: me, r: res }; attentes.push(f);
      setTimeout(() => { const k = attentes.indexOf(f); if (k >= 0) { attentes.splice(k, 1); rej(new Error(me + ' jamais recu')); } }, ms || 30000);
    });
    await requeteCDP('Page.enable');
    await requeteCDP('Runtime.enable');

    const t0 = Date.now();
    const charge = guetter('Page.loadEventFired', 60000).catch(() => null);
    await requeteCDP('Page.navigate', { url: 'http://127.0.0.1:' + APPORT + '/THEOLOGICUS.html' });
    await charge;
    ok('l application est chargee dans le navigateur', true, Math.round((Date.now() - t0)) + ' ms');

    // 4) L'application a-t-elle lance le service TOUTE SEULE ?
    console.log('\nattente du demarrage automatique (le modele ONNX se charge)...');
    let etat = null;
    const parti = await attendre(async () => {
      etat = await statut();
      return etat && etat.running === true;
    }, 150000, 2000);

    if (etat) console.log('etat apres  : ' + JSON.stringify({ running: etat.running, ready: etat.ready, external: etat.external }));
    ok('l application a demarre le service sans intervention', parti);
    if (!parti) throw new Error('le service n a jamais demarre');

    // `ready` exige loaded:true : un port ouvert n'est pas un service pret.
    const pret = await attendre(async () => {
      etat = await statut();
      return etat && etat.ready === true;
    }, 150000, 2000);
    ok('le service est PRET (modele charge, pas seulement un port ouvert)', pret);

    // 5) Le service rend-il vraiment de l'audio ?
    const wav = await new Promise(res => {
      const rq = http.get({ host: '127.0.0.1', port: SPORT, path: '/tts?text=Bonjour&lang=fr&voice=F1', timeout: 90000 }, r => {
        const morceaux = [];
        r.on('data', c => morceaux.push(c));
        r.on('end', () => res({ status: r.statusCode, buf: Buffer.concat(morceaux) }));
      });
      rq.on('error', e => res({ status: null, buf: Buffer.from(e.message) }));
      rq.on('timeout', () => { rq.destroy(); res({ status: null, buf: Buffer.from('timeout') }); });
    });
    ok('synthese reelle : HTTP 200', wav.status === 200, wav.status);
    ok('synthese reelle : en-tete RIFF', wav.buf.slice(0, 4).toString() === 'RIFF', wav.buf.slice(0, 4).toString());
    ok('synthese reelle : audio non vide', wav.buf.length > 20000, wav.buf.length + ' octets');

    // 6) Arret propre.
    await requeteHttp(APPORT, '/supertonic/stop', 'POST');
    await sleep(2500);
    const fin = await statut();
    ok('arret : le service ne tourne plus', fin && fin.running === false);

  } catch (e) {
    ech++; console.log('\nERREUR BANC : ' + e.message);
  } finally {
    try { await requeteHttp(APPORT, '/supertonic/stop', 'POST'); } catch (e) {}
    try { if (ws) ws.close(); } catch (e) {}
    try { if (chrome) chrome.kill(); } catch (e) {}
    try { if (exe) exe.kill(); } catch (e) {}
  }
  console.log('\n==================================================');
  console.log('VERDICT : ' + ech + ' echec(s)');
  console.log('==================================================');
  process.exit(ech ? 1 : 0);
})();
