/* Sonde TTS — quelles voix le navigateur expose-t-il REELLEMENT ?
   On ne devine pas le probleme de prononciation : on liste les voix. */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WebSocket = require('ws');

const PORT = 8901, CDP = 9441;
const CHROME = 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve('C:/Theologicus');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' };

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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo-tts-'));
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP,
    '--user-data-dir=' + prof, '--no-first-run', '--disable-gpu',
    '--window-size=1400,900', 'about:blank'], { stdio: 'ignore' });

  let t = null;
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    try {
      const l = await (await fetch('http://127.0.0.1:' + CDP + '/json/list')).json();
      t = l.find(x => x.type === 'page');
      if (t && t.webSocketDebuggerUrl) break;
    } catch (e) {}
  }
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
  await new Promise(r => ws.on('open', r));
  let id = 0; const pend = new Map();
  ws.on('message', raw => {
    const m = JSON.parse(raw.toString());
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  });
  const send = (me, pa) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  const ev = async e => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return { __err: ((r.result.exceptionDetails.exception || {}).description || '').slice(0, 500) };
    return r.result && r.result.result ? r.result.result.value : undefined;
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' + PAGE });
  await sleep(11000);

  console.log('=== TOUTES LES VOIX EXPOSEES PAR LE NAVIGATEUR ===');
  const voices = await ev(`(()=>{ const v = window.speechSynthesis ? speechSynthesis.getVoices() : [];
    return { n: v.length, list: v.map(x => ({ name: x.name, lang: x.lang, local: x.localService })) }; })()`);
  if (voices && voices.list) {
    console.log('total:', voices.n);
    for (const v of voices.list) console.log('  ', (v.lang || '??').padEnd(7), '|', v.local ? 'local ' : 'cloud ', '|', v.name);
  } else { console.log('  (aucune / erreur)', JSON.stringify(voices)); }

  console.log('\n=== CE QUE L APP RESOUT POUR CHAQUE LANGUE ===');
  const resolu = await ev(`(()=>{
    const out = {};
    ['francais','arabe','hebreu','grec','anglais'].forEach(function(l){
      try {
        const v = getVoiceForLang(l);
        out[l] = v ? (v.name + ' (' + v.lang + ')') : 'AUCUNE';
      } catch(e) { out[l] = 'err: ' + e.message; }
    });
    return out;
  })()`);
  console.log(JSON.stringify(resolu, null, 2));

  console.log('\n=== TEST DE LA CHAINE DE SEGMENTATION ===');
  const seg = await ev(`(()=>{
    if (typeof splitByLanguage !== 'function') return { err: 'splitByLanguage absente' };
    const cas = [
      { t: 'Le mot \\u05d9\\u05b0\\u05d4\\u05d5\\u05b9\\u05e9\\u05bb\\u05c1\\u05e2\\u05b7 signifie Josue.', n: 'hebreu+vocalisation' },
      { t: 'Exode 24:12 \\u05d5\\u05b7\\u05d9\\u05b9\\u05d0\\u05de\\u05b6\\u05e8 \\u05d9\\u05b0\\u05d4\\u05d5\\u05b8\\u05d4', n: 'ref + hebreu' },
      { t: 'Coran 20:12 \\u0648\\u064e\\u0625\\u0650\\u0646\\u0651\\u0650\\u064a \\u0644\\u064e\\u0623\\u064e\\u0646\\u064e\\u0627 \\u0631\\u064e\\u0628\\u0651\\u064f\\u0643\\u064e', n: 'ref + arabe' },
      { t: 'Sanhedrin 98b', n: 'reference seule' },
      { t: 'Yahv\\u00e9 dit \\u00e0 Mo\\u00efse', n: 'francais accentue' }
    ];
    return cas.map(function(c){
      const s = splitByLanguage(c.t);
      return { n: c.n, segs: s.map(function(x){ return { lang: x.lang, txt: x.text.slice(0,45) }; }) };
    });
  })()`);
  console.log(JSON.stringify(seg, null, 2));

  console.log('\n=== MODE DE LECTURE COURANT ===');
  const mode = await ev(`(()=>({ mode: (typeof readLangMode!=='undefined'?readLangMode:'?'),
     sel: (document.getElementById('read-lang-select')||{}).value || null }))()`);
  console.log(JSON.stringify(mode));

  ws.close(); ch.kill();
  try { srv.close(); } catch (e) {}
  await sleep(400);
  process.exit(0);
})().catch(e => { console.error('ERREUR:', e.message); process.exit(1); });
