/* Pourquoi le FRANCAIS sort-il en ANGLAIS ?
   La video montre du texte francais lu avec un accent anglais.
   On capture, pour du texte purement francais, la voix REELLEMENT utilisee. */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WebSocket = require('ws');

const PORT = 8906, CDP = 9446;
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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo-tts6-'));
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP,
    '--user-data-dir=' + prof, '--no-first-run', '--disable-gpu',
    '--window-size=1500,900', 'about:blank'], { stdio: 'ignore' });
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

  await ev(`(()=>{ window.__CAP=[];
    const orig = speechSynthesis.speak.bind(speechSynthesis);
    speechSynthesis.speak = function(u){ window.__CAP.push({ text:(u.text||'').slice(0,70),
      lang:u.lang, voice:u.voice?(u.voice.name+' ('+u.voice.lang+')'):'AUCUNE',
      rate:u.rate, pitch:u.pitch }); try{orig(u);}catch(e){} };
    return true; })()`);

  const phrases = [
    "Voici les citations littérales des exégètes musulmans sur ce verset.",
    "Problème : Ce verset ordonne de ne pas associer quiconque à l'adoration d'Allah.",
    "D'après Ibn Abi Hatim et Al-Wahidi, le verset initial était :",
    "La lecture est-elle correcte ?",
    "Voilà pourquoi cette traduction a été changée, et l'analyse critique.",
    "Le Seigneur a dit à Moïse : Je suis celui qui suis."
  ];

  console.log('=== TEXTE 100% FRANCAIS : quelle voix ? ===\n');
  for (const p of phrases) {
    await ev(`window.__CAP=[]`);
    await ev(`(()=>{ try{ speakText(${JSON.stringify(p)}); return 1; } catch(e){ return e.message; } })()`);
    await sleep(1100);
    const cap = await ev(`window.__CAP`);
    console.log('SOURCE : ' + p);
    if (Array.isArray(cap)) for (const c of cap) {
      const voixFr = /fr/i.test(c.lang) ? 'FR' : (/en/i.test(c.lang) ? 'ANGLAIS !!' : c.lang);
      console.log('   [' + voixFr + '] lang=' + c.lang + '  voix=' + c.voice);
      console.log('        parle: ' + JSON.stringify(c.text));
    }
    console.log('');
  }

  console.log('\n=== ETAT DE LA VOIX FR EN CACHE ===');
  console.log(JSON.stringify(await ev(`(()=>({
    best: _bestFrVoice ? (_bestFrVoice.name + ' (' + _bestFrVoice.lang + ')') : null,
    readLangMode: (typeof readLangMode !== 'undefined' ? readLangMode : '?'),
    ttsEnabled: (typeof ttsEnabled !== 'undefined' ? ttsEnabled : '?'),
    nbVoix: refreshVoices().length
  }))()`), null, 1));

  console.log('\n=== getVoiceForLang("francais") vs _validFrVoice() ===');
  console.log(JSON.stringify(await ev(`(()=>{
    const a = getVoiceForLang('francais'); const b = _validFrVoice();
    return { getVoiceForLang: a ? a.name+' ('+a.lang+')' : null,
             _validFrVoice:  b ? b.name+' ('+b.lang+')' : null }; })()`), null, 1));

  ws.close(); ch.kill();
  try { srv.close(); } catch (e) {}
  await sleep(400); process.exit(0);
})().catch(e => { console.error('ERREUR:', e.message); process.exit(1); });
