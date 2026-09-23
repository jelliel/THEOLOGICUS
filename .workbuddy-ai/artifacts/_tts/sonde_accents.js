/* Sonde 4 : POURQUOI "thèse" (accentue) declenche-t-elle la regle anglaise ?
   Hypothese : les accents sont retires AVANT detectScriptLang (par cleanMd ou
   par la normalisation NFD), donc "thèse" -> "these" -> mot anglais.
   On mesure : (a) le texte recu, (b) sa forme NFD, (c) chaque etape. */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WebSocket = require('ws');

const PORT = 8915, CDP = 9456;
const CHROME = 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve('C:/Theologicus');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo-ray4-'));
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
    if (r.result && r.result.exceptionDetails) return { __err: JSON.stringify(r.result.exceptionDetails).slice(0, 300) };
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' + PAGE });
  await sleep(11000);

  console.log('=== "thèse" : d ou vient le faux positif ? ===');
  const r = await ev(`(()=>{
    const src = "Cette thèse a été soutenue devant la faculté de théologie.";
    const out = {};
    out.brut = src;
    out.codePoints_these = Array.from("thèse").map(function(c){ return c.codePointAt(0).toString(16); });
    out.nfd = src.normalize('NFD');
    out.nfd_codePoints = Array.from(src.normalize('NFD')).slice(0,12).map(function(c){ return c.codePointAt(0).toString(16); });
    out.detect_brut = detectScriptLang(src);
    out.detect_nfd = detectScriptLang(src.normalize('NFD'));
    out.cleanMd = (typeof cleanMd === 'function') ? cleanMd(src) : '(cleanMd absent)';
    out.detect_clean = (typeof cleanMd === 'function') ? detectScriptLang(cleanMd(src)) : 'n/a';
    // le mot "thèse" seul
    out.detect_mot_these = detectScriptLang("thèse");
    out.detect_mot_these_nfd = detectScriptLang("thèse".normalize('NFD'));
    // sans accent
    out.detect_mot_these_plat = detectScriptLang("these");
    return out; })()`);
  console.log(JSON.stringify(r, null, 1));

  console.log('');
  console.log('=== la regex \u00e9tudie-t-elle la cha\u00eene NFD ? ===');
  const r2 = await ev(`(()=>{
    const englishWords = /\\b(the|and|of|in|to|for|with|on|at|by|from|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|could|should|may|might|shall|can|need|dare|ought|used|this|that|these|those|I|you|he|she|it|we|they|me|him|her|us|them|my|your|his|its|our|their|mine|yours|hers|ours|theirs|what|which|who|whom|whose|where|when|why|how|all|each|every|both|few|more|most|other|some|such|no|not|only|own|same|so|than|too|very|just|because|as|until|while|of|at|by|for|with|about|against|between|through|during|before|after|above|below|to|from|up|down|in|out|on|off|over|under|again|further|then|once|here|there|when|where|why|how|all|any|both|each|few|more|most|other|some|such|no|nor|not|only|own|same|so|than|too|very|s|t|can|will|just|don|should|now)\\b/i;
    const acc = "thèse";
    const nfd = acc.normalize('NFD');
    return {
      sur_accentue: englishWords.test(acc),
      sur_nfd: englishWords.test(nfd),
      mots_nfd: nfd.match(englishWords),
      explosion_these: Array.from(nfd).map(function(c){ return c + '(U+' + c.codePointAt(0).toString(16).toUpperCase() + ')'; }),
    }; })()`);
  console.log(JSON.stringify(r2, null, 1));

  ws.close(); ch.kill();
  try { srv.close(); } catch (e) {}
  await sleep(400); process.exit(0);
})().catch(e => { console.error('ERREUR:', e.message); process.exit(1); });
