/* A quelle PROFONDEUR de chemin l app s initialise-t-elle ?
   On sert le meme fichier depuis 0, 1, 2 niveaux et on regarde si
   detectScriptLang apparait. Cela explique l echec du banc sur bl/. */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WS = require('ws');
const PORT = 8933, CDP = 9472;
const CHROME = 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve('C:/Theologicus');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function test(chemin, etiquette) {
  const srv = http.createServer((q, rp) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/' + chemin;
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rp.writeHead(404); rp.end('404'); return; }
    rp.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(rp);
  });
  const cdpPort = CDP;
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo-dp-'));
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + cdpPort, '--user-data-dir=' + prof, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  let t = null;
  for (let i = 0; i < 60; i++) { await sleep(500); try { const l = await (await fetch('http://127.0.0.1:' + cdpPort + '/json/list')).json(); t = l.find(x => x.type === 'page'); if (t && t.webSocketDebuggerUrl) break; } catch (e) {} }
  const ws = new WS(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
  await new Promise(r => ws.on('open', r));
  let id = 0; const pend = new Map();
  ws.on('message', raw => { const m = JSON.parse(raw.toString()); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const send = (me, pa) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); return r.result && r.result.result ? r.result.result.value : undefined; };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:' + port + '/' + chemin });
  await sleep(9000);
  const url = await ev('location.pathname');
  const d = await ev('typeof detectScriptLang');
  const n = await ev('document.querySelectorAll("script").length');
  console.log('  ' + etiquette.padEnd(30) + ' path=' + String(url).padEnd(46) + ' detectScriptLang=' + String(d).padEnd(9) + ' scripts=' + n);
  ws.close(); ch.kill(); try { srv.close(); } catch (e) {}
  await sleep(300);
}

(async () => {
  console.log('=== A QUELLE PROFONDEUR L APP S INITIALISE-T-ELLE ? ===');
  await test('THEOLOGICUS.html', 'racine (0 niveau)');
  await test('bl/THEOLOGICUS.html', '1 niveau (bl/)');
  await test('.workbuddy-ai/artifacts/_tts/BASELINE_v106.html', 'profond (3 niveaux)');
  process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
