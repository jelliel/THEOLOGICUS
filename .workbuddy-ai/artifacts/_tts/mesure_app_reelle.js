/* MESURE DANS L APPLICATION REELLE.
   Jusqu'ici tout etait mesure dans Chrome puis Edge headless. Le seul
   environnement qui compte est WebView2 tel que le lance l exe de l utilisateur.
   On active le debogage distant de WebView2 par variable d environnement, on
   lance C:\Theologicus\_inst_v102\THEOLOGICUS.exe, puis on interroge la page
   VIVANTE : voix disponibles, langue detectee, voix choisie, enonce emis. */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

const CDP = 9500;
const EXE = 'C:/Theologicus/_inst_v102/THEOLOGICUS.exe';
const DOSSIER = 'C:/Theologicus/_inst_v102';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  if (!fs.existsSync(EXE)) { console.error('exe introuvable : ' + EXE); process.exit(1); }

  const env = Object.assign({}, process.env, {
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: '--remote-debugging-port=' + CDP,
  });

  console.log('=== LANCEMENT DE L APPLICATION REELLE ===');
  console.log('   ' + EXE);
  const app = spawn(EXE, [], { cwd: DOSSIER, env: env, stdio: 'ignore', detached: false });
  console.log('   PID ' + app.pid);

  let cibles = null;
  for (let i = 0; i < 60; i++) {
    await sleep(700);
    try {
      const l = await (await fetch('http://127.0.0.1:' + CDP + '/json/list')).json();
      cibles = l.filter(x => x.type === 'page' && /THEOLOGICUS\.html/i.test(x.url || ''));
      if (cibles.length) break;
    } catch (e) {}
  }
  if (!cibles || !cibles.length) {
    console.error('   WebView2 n a pas expose de cible CDP.');
    console.error('   (l app tourne peut-etre deja : une seule instance peut ecouter le port)');
    try { app.kill(); } catch (e) {}
    process.exit(1);
  }
  console.log('   cible : ' + cibles[0].url);

  const ws = new WebSocket(cibles[0].webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
  await new Promise(r => ws.on('open', r));
  let id = 0; const pend = new Map(); const logs = [];
  ws.on('message', raw => {
    const m = JSON.parse(raw.toString());
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.consoleAPICalled') {
      const t = m.params.args.map(a => a.value !== undefined ? a.value : (a.description || a.type)).join(' ');
      if (/TTS|hors-langue|repli|voix/i.test(t)) logs.push(t);
    }
  });
  const send = (me, pa) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  const ev = async e => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return '(exc) ' + JSON.stringify(r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description || '').slice(0, 200);
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  await send('Runtime.enable');
  await sleep(3000);

  console.log('');
  console.log('=== 1. VOIX VUES PAR L APPLICATION (WebView2 reel) ===');
  const v = await ev(`(()=>{
    var l = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
    return {
      total: l.length,
      locales: l.filter(function(x){ return x.localService; }).length,
      fr: l.filter(function(x){ return /^fr/i.test(x.lang); }).map(function(x){ return x.name + ' [' + x.lang + ']' + (x.localService ? ' local' : ' en ligne'); }),
      defaut: (l.filter(function(x){ return x.default; })[0] || {}).name || null,
      defautLang: (l.filter(function(x){ return x.default; })[0] || {}).lang || null
    };
  })()`);
  if (typeof v === 'string') console.log('   ' + v);
  else {
    console.log('   total=' + v.total + '  locales=' + v.locales);
    console.log('   voix par defaut : ' + v.defaut + ' [' + v.defautLang + ']');
    console.log('   voix francaises : ' + v.fr.length);
    for (const n of v.fr) console.log('      ' + n);
    if (!v.fr.length) console.log('      <-- AUCUNE VOIX FRANCAISE');
  }

  console.log('');
  console.log('=== 2. CE QUE L APPLICATION CHOISIT POUR DU FRANCAIS ===');
  const r = await ev(`(()=>{
    var C = ['Très tôt les chrétiens se réunirent pour prier.',
             'Le baptême marque l entrée dans la communauté.',
             'La société médiévale vivait au rythme de la liturgie.',
             'Ce poème liturgique remonte au Moyen Âge.'];
    return C.map(function(t){
      var lang = detectScriptLang(t), vo = null;
      try { vo = getVoiceForLang(lang); } catch(e) {}
      var u = null;
      try { u = makeUtterance(t, lang); } catch(e) {}
      return { t: t, lang: lang,
               voixChoisie: vo ? (vo.name + ' [' + vo.lang + ']') : null,
               enonceVoix: (u && u.voice) ? (u.voice.name + ' [' + u.voice.lang + ']') : null,
               enonceLang: u ? u.lang : null };
    });
  })()`);
  if (typeof r === 'string') console.log('   ' + r);
  else for (const x of r) {
    console.log('   lang=' + String(x.lang).padEnd(9) + ' voix=' + String(x.voixChoisie).padEnd(50));
    console.log('        enonce -> voix=' + String(x.enonceVoix).padEnd(50) + ' lang=' + x.enonceLang);
    console.log('        | ' + x.t.slice(0, 60));
  }

  console.log('');
  console.log('=== 3. JOURNAUX TTS DE LA PAGE ===');
  if (logs.length) for (const l of logs.slice(0, 15)) console.log('   ' + l.slice(0, 160));
  else console.log('   (aucun)');

  ws.close();
  await sleep(500);
  try { app.kill(); } catch (e) {}
  console.log('');
  console.log('   (instance de mesure fermee)');
  await sleep(500);
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
