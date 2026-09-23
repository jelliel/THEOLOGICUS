/* Qui remet #bible-verse-tip a 0,0 pendant le drag ?
   On observe les mutations de style et les appels de placement. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const PORT = 8900, CDP = 9440;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve('C:/Theologicus/mobile/www');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const serve = () => new Promise(res => { const s = http.createServer((q, rp) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { rp.writeHead(404); rp.end('404'); return; } rp.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rp); }); s.listen(PORT, '127.0.0.1', () => res(s)); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = await serve();
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo105z-'));
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + prof, '--no-first-run', '--disable-gpu', '--window-size=921,838', 'about:blank'], { stdio: 'ignore' });
  let t = null;
  for (let i = 0; i < 60; i++) { await sleep(500); try { const l = await (await fetch('http://127.0.0.1:' + CDP + '/json/list')).json(); t = l.find(x => x.type === 'page'); if (t && t.webSocketDebuggerUrl) break; } catch (e) {} }
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
  await new Promise(r => ws.on('open', r));
  let id = 0; const pend = new Map();
  ws.on('message', raw => { const m = JSON.parse(raw.toString()); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const send = (me, pa) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.result && r.result.exceptionDetails) return { __err: ((r.result.exceptionDetails.exception || {}).description || '').slice(0, 400) }; return r.result && r.result.result ? r.result.result.value : undefined; };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 921, height: 838, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.html' });
  await sleep(9000);
  await ev(`(()=>{['auth-overlay','setup-wizard-overlay'].forEach(function(k){var e=document.getElementById(k);if(e)e.remove();});var b=document.getElementById('theo-maj-bandeau');if(b)b.remove();if(window.__theoMaj)window.__theoMaj.verifierEtAfficher=function(){return Promise.resolve(null);};setInterval(function(){var x=document.getElementById('theo-maj-bandeau');if(x)x.remove();},80);return true;})()`);
  await sleep(500);
  await ev(`(async()=>{try{if(window.__loadBibleNow)window.__loadBibleNow();}catch(e){}
    for(var i=0;i<40;i++){if(window.__corpusReady&&window.__corpusReady.bible)break;await new Promise(r=>setTimeout(r,250));}
    var a=document.createElement('span');a.className='bible-ref';a.textContent='Is 66:24';
    a.style.cssText='position:fixed;left:20px;top:482px;z-index:50000;color:#fff;background:#333;padding:6px;font-size:16px;';
    document.body.appendChild(a);return true;})()`);
  await sleep(2000);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 300, y: 700, button: 'none' });
  await sleep(200);
  const bb = await ev(`(()=>{var r=document.querySelector('span.bible-ref').getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: bb.x, y: bb.y, button: 'none' });
  await sleep(2500);
  console.log('ETAT NATUREL =', JSON.stringify(await ev(`(()=>{var p=document.getElementById('bible-verse-tip');var r=p.getBoundingClientRect();return{l:Math.round(r.left),t:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height),inlineL:p.style.left,inlineT:p.style.top};})()`)));

  /* On pose la bulle a 60/383 et on REGARDE ce qui la remet a 0,0. */
  const obs = await ev(`(()=>{
    var p=document.getElementById('bible-verse-tip');
    window.__mut=[];
    var mo=new MutationObserver(function(ms){
      ms.forEach(function(m){
        if(m.attributeName==='style') window.__mut.push({t:Date.now(), left:p.style.left, top:p.style.top, cls:p.className, stack:(new Error().stack||'').split('\\n').slice(1,4).join(' | ')});
      });
    });
    mo.observe(p,{attributes:true,attributeFilter:['style','class']});
    window.__poser=window.__V105.poser;
    window.__V105.poser(p,60,383);
    return {apresPose:{l:Math.round(p.getBoundingClientRect().left),t:Math.round(p.getBoundingClientRect().top),inlineL:p.style.left,inlineT:p.style.top}};
  })()`);
  console.log('APRES POSE FORCEE =', JSON.stringify(obs));
  await sleep(1200);
  console.log('MUTATIONS apres 1.2 s =', JSON.stringify(await ev(`window.__mut.slice(0,8)`)));
  console.log('ETAT =', JSON.stringify(await ev(`(()=>{var p=document.getElementById('bible-verse-tip');var r=p.getBoundingClientRect();return{l:Math.round(r.left),t:Math.round(r.top),inlineL:p.style.left,inlineT:p.style.top};})()`)));

  ws.close(); ch.kill(); srv.close(); process.exit(0);
})().catch(e => { console.log('CRASH', e); process.exit(1); });
