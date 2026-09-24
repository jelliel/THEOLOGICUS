/* Sonde minimale : pourquoi Runtime.evaluate ne repond-il pas ?
   On imprime TOUT ce que Chrome envoie, pour voir si la reponse arrive et sous
   quelle forme, au lieu de supposer. */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = 8933, CDP = 9483;
const CHROME = 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve('C:/Theologicus');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };

(async () => {
  const srv = http.createServer((q, rp) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/THEOLOGICUS.html';
    const f = path.join(ROOT, p);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { rp.writeHead(404); rp.end('404'); return; }
    rp.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(rp);
  });
  await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
  console.log('serveur de fichiers pret');

  const t = spawn('taskkill', ['/F', '/IM', 'chrome.exe'], { stdio: 'ignore' });
  await new Promise(r => t.on('exit', r).on('error', r));
  await sleep(1500);
  const profil = path.join(ROOT, '.workbuddy-ai', 'artifacts', '_tts', 'profil-probe');
  try { fs.rmSync(profil, { recursive: true, force: true }); } catch (e) {}

  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP,
    '--user-data-dir=' + profil, '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-gpu', '--window-size=1500,900', 'about:blank'], { stdio: 'ignore' });
  chrome.on('error', e => console.log('spawn chrome : ' + e.message));

  let cible = null;
  for (let i = 0; i < 40 && !cible; i++) {
    await sleep(500);
    try {
      const ctl = new AbortController(); const m = setTimeout(() => ctl.abort(), 3000);
      const l = await (await fetch('http://127.0.0.1:' + CDP + '/json/list', { signal: ctl.signal })).json();
      clearTimeout(m);
      cible = l.find(x => x.type === 'page' && x.webSocketDebuggerUrl);
    } catch (e) {}
  }
  if (!cible) { console.log('CDP indisponible'); process.exit(1); }
  console.log('cible : ' + cible.url);

  const ws = new WebSocket(cible.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise((res, rej) => {
    const m = setTimeout(() => rej(new Error('ws open timeout')), 10000);
    ws.on('open', () => { clearTimeout(m); res(); });
    ws.on('error', e => { clearTimeout(m); rej(e); });
  });
  console.log('websocket ouvert');

  ws.on('message', raw => {
    const s = raw.toString();
    console.log('<< ' + (s.length > 300 ? s.slice(0, 300) + '…' : s));
  });

  const envoyer = (id, method, params) => { console.log('>> ' + method + ' (id ' + id + ')'); ws.send(JSON.stringify({ id, method, params: params || {} })); };

  envoyer(100, 'Page.enable');
  await sleep(1000);
  envoyer(101, 'Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/THEOLOGICUS.html' });
  await sleep(6000);
  envoyer(102, 'Runtime.enable');
  await sleep(1500);
  envoyer(103, 'Runtime.evaluate', { expression: '1+1', returnByValue: true });
  await sleep(2500);
  envoyer(104, 'Runtime.evaluate', { expression: 'typeof detectScriptLang', returnByValue: true });
  await sleep(2500);
  envoyer(105, 'Runtime.evaluate', { expression: 'document.readyState', returnByValue: true, userGesture: true });
  await sleep(3000);

  console.log('--- fin de sonde ---');
  try { ws.close(); } catch (e) {}
  try { chrome.kill(); } catch (e) {}
  try { srv.close(); } catch (e) {}
  process.exit(0);
})();
