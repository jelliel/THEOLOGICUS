/* Pourquoi les segments arabes ne partent-ils PAS au moteur en file reelle ?
   On instrumente speak() ET on journalise les onend/onerror. */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WebSocket = require('ws');

const PORT = 8904, CDP = 9444;
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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo-tts4-'));
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP,
    '--user-data-dir=' + prof, '--no-first-run', '--disable-gpu',
    '--window-size=1400,900', 'about:blank'], { stdio: 'ignore' });
  let t = null;
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    try { const l = await (await fetch('http://127.0.0.1:' + CDP + '/json/list')).json(); t = l.find(x => x.type === 'page'); if (t && t.webSocketDebuggerUrl) break; } catch (e) {}
  }
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
  await new Promise(r => ws.on('open', r));
  let id = 0; const pend = new Map();
  ws.on('message', raw => { const m = JSON.parse(raw.toString()); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const send = (me, pa) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  const ev = async e => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return { __err: ((r.result.exceptionDetails.exception || {}).description || '').slice(0, 400) };
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' + PAGE });
  await sleep(11000);

  // Journal complet : speak + onend + onerror, horodate.
  await ev(`(()=>{ window.__LOG = [];
    const orig = speechSynthesis.speak.bind(speechSynthesis);
    speechSynthesis.speak = function(u){
      window.__LOG.push({ t: Date.now(), ev: 'SPEAK', text: (u.text||'').slice(0,50), lang: u.lang,
                          voice: u.voice ? u.voice.name : 'AUCUNE' });
      // Enrober les gestionnaires pour voir s'ils sont APPELES.
      const onEnd = u.onend, onErr = u.onerror;
      u.onend = function(e){ window.__LOG.push({ t: Date.now(), ev: 'ONEND', text: (u.text||'').slice(0,50) }); if (onEnd) try{onEnd(e);}catch(x){} };
      u.onerror = function(e){ window.__LOG.push({ t: Date.now(), ev: 'ONERROR', text: (u.text||'').slice(0,50), err: (e&&e.error)||'?' }); if (onErr) try{onErr(e);}catch(x){} };
      try { orig(u); } catch(e) {} };
    window.__CAP = window.__LOG;
    return true; })()`);

  const AR = '\u0645\u064e\u0627 \u0634\u064e\u064a\u0652\u0621\u064d';
  const PHR = 'Un scribe a remplace ' + AR + ' par \u0623\u064e\u062d\u064e\u062f\u064b\u0627 creant une ambiguite.';
  console.log('phrase :', PHR);
  await ev(`(()=>{ try { speakText(${JSON.stringify(PHR)}); return 'ok'; } catch(e){ return 'err: '+e.message; } })()`);
  await sleep(9000);

  const log = await ev(`window.__LOG`);
  console.log('\n=== JOURNAL ===');
  if (Array.isArray(log)) {
    const t0 = log.length ? log[0].t : 0;
    for (const l of log) {
      console.log('  +' + String(l.t - t0).padStart(5) + 'ms', l.ev.padEnd(8), '[' + (l.lang || '-') + ']',
                  (l.err ? 'ERR=' + l.err + ' ' : ''), JSON.stringify(l.text || ''));
    }
  } else console.log(JSON.stringify(log));

  console.log('\n=== ETAT FINAL ===');
  console.log(JSON.stringify(await ev(`(()=>({ isSpeaking: (typeof isSpeaking!=='undefined'?isSpeaking:'?'),
    queueLen: speechSynthesis.pending ? speechSynthesis.pending : 'n/a' }))()`)));

  ws.close(); ch.kill();
  try { srv.close(); } catch (e) {}
  await sleep(400); process.exit(0);
})().catch(e => { console.error('ERREUR:', e.message); process.exit(1); });
