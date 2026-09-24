/* Deuxieme sonde : reproduit EXACTEMENT l'ordre du banc, pour trancher entre
   « Runtime.enable doit venir apres la navigation » et autre chose.
   Scenario A : Page.enable -> Runtime.enable -> navigate -> evaluate (le banc)
   Scenario B : Page.enable -> navigate -> Runtime.enable -> evaluate (la sonde 1)
   On affiche uniquement les messages d'id et les erreurs. */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = 8934, CDP = 9484;
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

  const t = spawn('taskkill', ['/F', '/IM', 'chrome.exe'], { stdio: 'ignore' });
  await new Promise(r => t.on('exit', r).on('error', r));
  await sleep(1500);

  async function scenario(nom, enableAvant) {
    console.log('\n===== ' + nom + ' =====');
    const profil = path.join(ROOT, '.workbuddy-ai', 'artifacts', '_tts', 'profil-sonde-' + (enableAvant ? 'A' : 'B'));
    try { fs.rmSync(profil, { recursive: true, force: true }); } catch (e) {}
    const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP,
      '--user-data-dir=' + profil, '--no-first-run', '--no-default-browser-check',
      '--disable-extensions', '--disable-gpu', '--window-size=1500,900', 'about:blank'], { stdio: 'ignore' });

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
    if (!cible) { console.log('CDP indisponible'); return; }

    const ws = new WebSocket(cible.webSocketDebuggerUrl, { perMessageDeflate: false });
    await new Promise((res, rej) => {
      const m = setTimeout(() => rej(new Error('ws timeout')), 10000);
      ws.on('open', () => { clearTimeout(m); res(); });
      ws.on('error', e => { clearTimeout(m); rej(e); });
    });

    let n = 0;
    const pend = new Map();
    ws.on('message', raw => {
      const m = JSON.parse(raw.toString());
      if (m.id) console.log('<< id ' + m.id + ' ' + (m.error ? 'ERREUR ' + JSON.stringify(m.error) : 'ok'));
      if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    });
    const send = (me, pa) => new Promise(res => { const i = ++n; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });

    await send('Page.enable');
    if (enableAvant) await send('Runtime.enable');
    await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/THEOLOGICUS.html' });
    await sleep(7000);
    if (!enableAvant) await send('Runtime.enable');
    await sleep(1200);

    // Exactement l'appel du banc : le PREMIER evaluate de la session porte l'id 1.
    const n1 = ++n;
    const p = new Promise(res => pend.set(n1, res));
    ws.send(JSON.stringify({ id: n1, method: 'Runtime.evaluate', params: { expression: 'document.readyState', awaitPromise: false, returnByValue: true, userGesture: true } }));
    const r = await Promise.race([p, sleep(8000).then(() => 'PAS DE REPONSE (8 s)')]);
    console.log('   resultat evaluate id ' + n1 + ' : ' + JSON.stringify(r));

    try { ws.close(); } catch (e) {}
    try { chrome.kill(); } catch (e) {}
    await sleep(1500);
  }

  await scenario('A — Runtime.enable AVANT navigate (ordre du banc)', true);
  await scenario('B — Runtime.enable APRES navigate (ordre de la sonde 1)', false);

  console.log('\n--- fin ---');
  try { srv.close(); } catch (e) {}
  process.exit(0);
})();
