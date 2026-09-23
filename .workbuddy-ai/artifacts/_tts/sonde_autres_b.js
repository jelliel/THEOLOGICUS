/* Sonde 8 : d AUTRES usages de \b sont-ils exposes au meme piege ASCII ?
   On teste les motifs construits a partir de noms de livres bibliques
   accentues, et la forme generale \b([\p{L}]{2,})... : le \b de GAUCHE
   devrait aller, mais on mesure au lieu de supposer. */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WebSocket = require('ws');
const PORT = 8934, CDP = 9473;
const CHROME = 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve('C:/Theologicus');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css' };
const serve = () => new Promise(res => {
  const s = http.createServer((q, rp) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/THEOLOGICUS.html';
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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo-b8-'));
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + prof, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  let t = null;
  for (let i = 0; i < 60; i++) { await sleep(500); try { const l = await (await fetch('http://127.0.0.1:' + CDP + '/json/list')).json(); t = l.find(x => x.type === 'page'); if (t && t.webSocketDebuggerUrl) break; } catch (e) {} }
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
  await new Promise(r => ws.on('open', r));
  let id = 0; const pend = new Map();
  ws.on('message', raw => { const m = JSON.parse(raw.toString()); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const send = (me, pa) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  const ev = async e => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return 'EXC: ' + JSON.stringify(r.result.exceptionDetails.exception && r.result.exceptionDetails.exception.description || '').slice(0, 200);
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/THEOLOGICUS.html' });
  await sleep(11000);

  console.log('=== \\b devant un nom de livre ACCENTUE ===');
  const CAS = [
    "Ésaïe 1:2 est cité.",
    "Genèse 1:1 commence la Bible.",
    "Lévitique 19:18 est cité par Jésus.",
    "Deutéronome 6:5 est le grand commandement.",
    "Néhémie 8:10 est cité.",
    "Jérémie 31:33 annonce l alliance.",
    "Éphésiens 2:8 est décisif.",
    "Hébreux 11:1 définit la foi.",
    "Joël 2:28 est cité à la Pentecôte.",
    "Michée 6:8 résume la loi.",
    "Exode 20:3 ouvre le décalogue.",
    "Luc 2:14 est chanté à Noël.",
    "Ainsi Isaïe 7:14 fut relu.",
    "Après Ézéchiel 36:26 vient la promesse.",
  ];
  // On interroge la fonction de normalisation des references, si elle existe.
  const out = await ev(`(()=>{
    const C = ${JSON.stringify(CAS)};
    const res = [];
    for (const t of C) {
      let r = null;
      try { r = (typeof normalizeRefsForSpeech === 'function') ? normalizeRefsForSpeech(t) : null; } catch (e) { r = 'ERR ' + String(e).slice(0,40); }
      res.push({ t: t, r: r });
    }
    return res; })()`);
  if (typeof out === 'string') { console.log('  ' + out); }
  else if (out) {
    for (const x of out) console.log('  ' + (x.r === null ? '(fonction absente)' : (x.r === x.t ? 'inchange   ' : 'TRANSFORME ')) + ' | ' + x.t + (x.r && x.r !== x.t ? '\n        -> ' + x.r : ''));
  }

  console.log('');
  console.log('=== le \\b de gauche tient-il quand le mot PRECEDENT est accentue ? ===');
  const r2 = await ev(`(()=>{
    const RE = /\\b(Ésaïe|Genèse|Jérémie|Hébreux)\\s+(\\d+)\\s*:\\s*(\\d+)/g;
    const tests = [
      'Ainsi Ésaïe 7:14 fut relu.',
      'selon Ésaïe 7:14',
      'dans la Genèse 1:1 tout commence',
      'et Jérémie 31:33 le dit',
      'comme Hébreux 11:1',
    ];
    return tests.map(function(t){ return { t: t, m: t.match(RE) }; }); })()`);
  if (typeof r2 === 'string') console.log('  ' + r2);
  else for (const x of r2) console.log('  ' + (x.m ? 'MATCHE   ' : 'RATE !! ') + ' ' + x.t + (x.m ? '  -> ' + JSON.stringify(x.m) : ''));

  ws.close(); ch.kill(); try { srv.close(); } catch (e) {}
  await sleep(300); process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
