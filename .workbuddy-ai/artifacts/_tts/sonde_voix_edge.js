/* Quelles voix WebView2 expose-t-il REELLEMENT sur ce poste Windows ?
   Le correctif v107 a ete mesure dans CHROME (qui telecharge les voix Google).
   WebView2, lui, n'utilise que la pile Edge/Microsoft. On mesure donc avec
   EDGE, dont WebView2 partage le moteur : c'est le seul inventaire pertinent
   pour l'application Windows. */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WebSocket = require('ws');

const PORT = 8950, CDP = 9490;
const EDGE = 'C://Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = path.resolve('C:/Theologicus');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css' };
const PAGE = 'THEOLOGICUS.html';
const serve = () => new Promise(res => {
  const s = http.createServer((q, rp) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/' + PAGE;
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rp.writeHead(404); rp.end('404'); return; }
    rp.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(rp);
  });
  s.listen(PORT, '127.0.0.1', () => res(s));
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const srv = await serve();
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo-edge-'));
  const ch = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + CDP,
    '--user-data-dir=' + prof, '--no-first-run', '--disable-gpu',
    '--window-size=1400,900', 'about:blank'], { stdio: 'ignore' });
  let t = null;
  for (let i = 0; i < 80; i++) {
    await sleep(500);
    try { const l = await (await fetch('http://127.0.0.1:' + CDP + '/json/list')).json(); t = l.find(x => x.type === 'page'); if (t && t.webSocketDebuggerUrl) break; } catch (e) {}
  }
  if (!t) { console.error('Edge ne repond pas au CDP'); process.exit(1); }
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
  await new Promise(r => ws.on('open', r));
  let id = 0; const pend = new Map();
  ws.on('message', raw => { const m = JSON.parse(raw.toString()); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const send = (me, pa) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  const ev = async e => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return '(exc) ' + JSON.stringify(r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description || '').slice(0, 160);
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' + PAGE });
  await sleep(12000);

  console.log('=== VOIX EXPOSEES PAR EDGE (= moteur de WebView2) ===');
  const voix = await ev(`(()=>{
    const v = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
    return v.map(function(x){ return { n: x.name, l: x.lang, loc: x.localService, def: x.default }; });
  })()`);
  if (typeof voix === 'string') { console.log('  ' + voix); }
  else {
    console.log('   total : ' + voix.length);
    console.log('');
    for (const v of voix) {
      console.log('   ' + String(v.l).padEnd(9) + ' ' + String(v.n).padEnd(40) + (v.loc ? 'local ' : 'en ligne') + (v.def ? '  [defaut]' : ''));
    }
    const fr = voix.filter(v => /^fr/i.test(v.l));
    console.log('');
    console.log('   VOIX FRANCAISES : ' + fr.length + (fr.length ? '  -> ' + fr.map(v => v.n).join(', ') : '   <-- AUCUNE'));
  }

  console.log('');
  console.log('=== ce que l app obtient pour une phrase francaise ===');
  const r = await ev(`(()=>{
    const C = ['Très tôt les chrétiens se réunirent pour prier.',
               'Le baptême marque l entrée dans la communauté.',
               'La société médiévale vivait au rythme de la liturgie.'];
    return C.map(function(t){
      var lang = detectScriptLang(t), v = null;
      try { v = getVoiceForLang(lang); } catch(e) {}
      return { t: t, lang: lang, voix: v ? (v.name + ' [' + v.lang + ']') : null };
    });
  })()`);
  if (typeof r === 'string') console.log('  ' + r);
  else for (const x of r) console.log('   lang=' + String(x.lang).padEnd(9) + ' voix=' + String(x.voix).padEnd(34) + ' | ' + x.t.slice(0, 38));

  // Que fait makeUtterance quand getVoiceForLang rend null ?
  console.log('');
  console.log('=== l utterance part-elle SANS voix (= voix par defaut du moteur) ? ===');
  const u = await ev(`(()=>{
    try {
      var utt = makeUtterance('Très tôt les chrétiens se réunirent pour prier.', 'francais');
      if (!utt) return '(makeUtterance a rendu null)';
      return { voix: utt.voice ? (utt.voice.name + ' [' + utt.voice.lang + ']') : null, lang: utt.lang };
    } catch(e) { return 'ERR ' + String(e).slice(0,120); }
  })()`);
  console.log('   ' + JSON.stringify(u));
  ws.close(); ch.kill();
  try { srv.close(); } catch (e) {}
  await sleep(300); process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
