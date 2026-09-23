/* Detecter les voix DANS LE PROFIL REEL de l'utilisateur.
   Le headless a un profil neuf ; l'app est utilisee dans le vrai profil.
   Les voix Google (cloud) dependent du reseau et du profil : c'est la
   difference qui explique un accent anglais en usage reel. */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const WebSocket = require('ws');

const CDP = 9447;
const CHROME = 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const MODE = process.argv[2] || 'neuf';   // 'neuf' | 'reel'
const prof = MODE === 'reel'
  ? 'C:/Users/toshr/AppData/Local/Google/Chrome/User Data'
  : fs.mkdtempSync(path.join(os.tmpdir(), 'theo-voix-'));

const args = ['--remote-debugging-port=' + CDP, '--user-data-dir=' + prof,
  '--no-first-run', '--no-default-browser-check', 'about:blank'];
if (MODE === 'neuf') { args.unshift('--headless=new'); args.splice(3, 0, '--disable-gpu'); }
// Profil reel : Chrome refuse CDP en mode headless sur un profil existant.
// On ouvre une vraie fenetre (elle se ferme a la fin du script).

console.log('profil :', MODE, '(' + prof + ')');
const ch = spawn(CHROME, args, { stdio: 'ignore' });

(async () => {
  let t = null;
  for (let i = 0; i < 80; i++) {
    await sleep(500);
    try { const l = await (await fetch('http://127.0.0.1:' + CDP + '/json/list')).json(); t = l.find(x => x.type === 'page'); if (t && t.webSocketDebuggerUrl) break; } catch (e) {}
  }
  if (!t) { console.log('pas de cible CDP'); ch.kill(); process.exit(1); }
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
  await new Promise(r => ws.on('open', r));
  let id = 0; const pend = new Map();
  ws.on('message', raw => { const m = JSON.parse(raw.toString()); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const send = (me, pa) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  const ev = async e => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return { __err: 'exc' };
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(1500);

  // On force le chargement des voix et on attend voiceschanged.
  const voices = await ev(`(async()=>{
    let v = speechSynthesis.getVoices();
    if (!v.length) { await new Promise(function(r){
      speechSynthesis.addEventListener('voiceschanged', r, { once: true }); setTimeout(r, 6000); });
      v = speechSynthesis.getVoices(); }
    return v.map(function(x){ return { n: x.name, l: x.lang, loc: x.localService }; }); })()`);

  if (Array.isArray(voices)) {
    console.log('total voix :', voices.length);
    const parLangue = {};
    for (const v of voices) { (parLangue[v.l] = parLangue[v.l] || []).push((v.loc ? 'L ' : 'C ') + v.n); }
    for (const k of Object.keys(parLangue).sort()) {
      console.log('  ' + k + ' :');
      for (const n of parLangue[k].slice(0, 4)) console.log('      ' + n);
    }
    const fr = voices.filter(v => /^fr/i.test(v.l));
    console.log('\n>>> VOIX FRANCAISES : ' + fr.length + ' -> ' + JSON.stringify(fr.map(v => v.n + ' (' + v.l + ')')));
    const en = voices.filter(v => /^en/i.test(v.l));
    console.log('>>> VOIX ANGLAISES  : ' + en.length);
  } else console.log('voix illisibles:', JSON.stringify(voices));

  ws.close(); ch.kill();
  await sleep(900); process.exit(0);
})().catch(e => { console.error('ERREUR:', e.message); ch.kill(); process.exit(1); });
