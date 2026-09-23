/* VERIFICATION v108 DANS L APPLICATION REELLE (WebView2).
   On lance l exe avec un dossier de donnees WebView2 DISTINCT, pour ne pas
   perturber la session ouverte de l utilisateur, et on verifie :
     1. l inventaire des voix (doit rester 4, aucune francaise)
     2. que makeUtterance signale l absence de voix (bandeau #v108-voix-manquante)
     3. que l avertissement part aussi dans la console */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

const CDP = 9501;
const EXE = 'C:/Theologicus/_inst_v102/THEOLOGICUS.exe';
const DOSSIER = 'C:/Theologicus/_inst_v102';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const profil = fs.mkdtempSync(path.join(os.tmpdir(), 'theo-wv2-mes-'));
  const env = Object.assign({}, process.env, {
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=' + CDP,
    WEBVIEW2_USER_DATA_FOLDER: profil,
  });

  console.log('=== LANCEMENT (profil WebView2 isole) ===');
  const app = spawn(EXE, [], { cwd: DOSSIER, env: env, stdio: 'ignore' });

  let cible = null;
  for (let i = 0; i < 70; i++) {
    await sleep(700);
    try {
      const l = await (await fetch('http://127.0.0.1:' + CDP + '/json/list')).json();
      cible = l.filter(x => x.type === 'page' && /THEOLOGICUS\.html/i.test(x.url || ''))[0];
      if (cible) break;
    } catch (e) {}
  }
  if (!cible) { console.error('   pas de cible CDP'); try { app.kill(); } catch (e) {} process.exit(1); }
  console.log('   cible : ' + cible.url);

  const ws = new WebSocket(cible.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
  await new Promise(r => ws.on('open', r));
  let id = 0; const pend = new Map(); const logs = [];
  ws.on('message', raw => {
    const m = JSON.parse(raw.toString());
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.consoleAPICalled') {
      logs.push(m.params.args.map(a => a.value !== undefined ? a.value : (a.description || a.type)).join(' '));
    }
  });
  const send = (me, pa) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  const ev = async e => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return '(exc) ' + JSON.stringify(r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description || '').slice(0, 200);
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  await send('Runtime.enable');
  await sleep(3500);

  console.log('');
  console.log('=== 1. VOIX DISPONIBLES (WebView2 reel) ===');
  const v = await ev(`(()=>{
    var l = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
    return { total: l.length, fr: l.filter(function(x){ return /^fr/i.test(x.lang); }).length,
             defaut: (l.filter(function(x){ return x.default; })[0] || {}).name || null };
  })()`);
  console.log('   ' + JSON.stringify(v));

  console.log('');
  console.log('=== 2. L APP SIGNALE-T-ELLE L ABSENCE DE VOIX ? ===');
  const avant = await ev('!!document.getElementById("v108-voix-manquante")');
  console.log('   bandeau avant lecture : ' + avant);

  // On declenche un enonce francais, exactement comme la lecture le ferait.
  const res = await ev(`(()=>{
    var t = 'Très tôt les chrétiens se réunirent pour prier.';
    var u = makeUtterance(t, 'francais');
    return { voix: u && u.voice ? u.voice.name : null, lang: u ? u.lang : null };
  })()`);
  console.log('   enonce : ' + JSON.stringify(res));

  await sleep(600);
  const apres = await ev(`(()=>{
    var b = document.getElementById('v108-voix-manquante');
    if (!b) return { present: false };
    return { present: true, titre: (b.querySelector('div') || {}).textContent || '',
             texte: (b.textContent || '').slice(0, 260) };
  })()`);
  console.log('   bandeau apres lecture : ' + JSON.stringify(apres, null, 1));

  console.log('');
  console.log('=== 3. AVERTISSEMENTS CONSOLE ===');
  const pertinents = logs.filter(l => /AUCUNE VOIX|TTS|hors-langue/i.test(l));
  if (pertinents.length) for (const l of pertinents.slice(0, 8)) console.log('   ' + l.slice(0, 170));
  else console.log('   (aucun)');

  ws.close();
  await sleep(400);
  try { app.kill(); } catch (e) {}
  try { fs.rmSync(profil, { recursive: true, force: true }); } catch (e) {}
  console.log('');
  console.log('   (instance de mesure fermee)');
  await sleep(400);
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
