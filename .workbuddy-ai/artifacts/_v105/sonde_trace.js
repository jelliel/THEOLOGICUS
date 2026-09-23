/* On rejoue le bloc de drag du BANC et on trace l'etat a chaque pas. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const PORT = 8902, CDP = 9442;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve('C:/Theologicus/mobile/www');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const serve = () => new Promise(res => { const s = http.createServer((q, rp) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { rp.writeHead(404); rp.end('404'); return; } rp.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rp); }); s.listen(PORT, '127.0.0.1', () => res(s)); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = await serve();
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo105t-'));
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + prof, '--no-first-run', '--disable-gpu', '--window-size=921,838', 'about:blank'], { stdio: 'ignore' });
  let t = null;
  for (let i = 0; i < 60; i++) { await sleep(500); try { const l = await (await fetch('http://127.0.0.1:' + CDP + '/json/list')).json(); t = l.find(x => x.type === 'page'); if (t && t.webSocketDebuggerUrl) break; } catch (e) {} }
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
  await new Promise(r => ws.on('open', r));
  let id = 0; const pend = new Map();
  ws.on('message', raw => { const m = JSON.parse(raw.toString()); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const send = (me, pa) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.result && r.result.exceptionDetails) return { __err: ((r.result.exceptionDetails.exception || {}).description || '').slice(0, 400) }; return r.result && r.result.result ? r.result.result.value : undefined; };
  const souris = async (x, y, type, boutons) => { await send('Input.dispatchMouseEvent', { type: type || 'mouseMoved', x: Math.round(x), y: Math.round(y), button: (type === 'mousePressed' || type === 'mouseReleased') ? 'left' : 'none', buttons: boutons !== undefined ? boutons : (type === 'mousePressed' ? 1 : 0), clickCount: 1 }); };
  const sonde = async (tag) => {
    const v = await ev(`(()=>{var p=document.getElementById('bible-verse-tip');
      return {iL:p.style.left,iT:p.style.top,l:Math.round(p.getBoundingClientRect().left),t:Math.round(p.getBoundingClientRect().top),
              disp:p.style.display,posee:p.classList.contains('v105-posee'),pe:p.style.pointerEvents,memo:window.__V105.lirePosition('bible-verse-tip')};})()`);
    console.log(tag.padEnd(22), JSON.stringify(v));
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 921, height: 838, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.html' });
  await sleep(9000);
  await ev(`(()=>{['auth-overlay','setup-wizard-overlay'].forEach(function(k){var e=document.getElementById(k);if(e)e.remove();});var b=document.getElementById('theo-maj-bandeau');if(b)b.remove();if(window.__theoMaj)window.__theoMaj.verifierEtAfficher=function(){return Promise.resolve(null);};
    if(!document.getElementById('v105-bench-css')){
      var st=document.createElement('style'); st.id='v105-bench-css';
      st.textContent='.welcome-banner,.v12-welcome{pointer-events:none !important;visibility:hidden !important;}#theo-maj-bandeau{pointer-events:none !important;visibility:hidden !important;}';
      document.head.appendChild(st);
    }setInterval(function(){var x=document.getElementById('theo-maj-bandeau');if(x)x.remove();},80);return true;})()`);
  await sleep(500);
  await ev(`(async()=>{try{if(window.__loadBibleNow)window.__loadBibleNow();}catch(e){}
    for(var i=0;i<40;i++){if(window.__corpusReady&&window.__corpusReady.bible)break;await new Promise(r=>setTimeout(r,250));}
    var a=document.createElement('span');a.className='bible-ref';a.textContent='Is 66:24';
    a.style.cssText='position:fixed;left:20px;top:482px;z-index:50000;color:#fff;background:#333;padding:6px;font-size:16px;';
    document.body.appendChild(a);return true;})()`);
  await sleep(2000);
  await souris(300, 700); await sleep(200);
  const bb = await ev(`(()=>{var r=document.querySelector('span.bible-ref').getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`);
  await souris(bb.x, bb.y); await sleep(2500);

  /* On reproduit EXACTEMENT le bloc avantDrag du banc. */
  const avant = await ev(`(async()=>{
    var p=document.getElementById('bible-verse-tip');
    p.style.display='block'; p.style.opacity='1';
    p.classList.remove('v105-posee');
    p.style.pointerEvents='';
    await new Promise(r=>setTimeout(r,250));
    window.__V105.balayer();
    window.__V105.poser(p, 60, Math.round(window.innerHeight*0.45));
    await new Promise(r=>setTimeout(r,120));
    var g=p.querySelector(':scope > .v105-poignee');
    g.style.opacity='1';
    var pr=p.getBoundingClientRect(), gr=g.getBoundingClientRect();
    return { prise:{x:Math.round(gr.left+gr.width/2), y:Math.round(gr.top+gr.height/2)},
             bulle:{l:Math.round(pr.left),t:Math.round(pr.top)}, pe:getComputedStyle(p).pointerEvents };
  })()`);
  console.log('AVANT DRAG =', JSON.stringify(avant));
  await sonde('juste avant souris');

  const P = avant.prise, dx = 120, dy = 90;
  await souris(P.x, P.y); await sleep(120); await sonde('apres mouseMoved');
  await souris(P.x, P.y, 'mousePressed', 1); await sleep(120); await sonde('apres mousePressed');
  for (let i = 1; i <= 6; i++) { await souris(P.x + dx * i / 6, P.y + dy * i / 6, 'mouseMoved', 1); await sleep(60); }
  await sonde('apres les moves');
  await souris(P.x + dx, P.y + dy, 'mouseReleased', 0); await sleep(500);
  await sonde('apres release');

  /* Le piege : ou est le pointeur par rapport au panneau et au ref ? */
  console.log('ref rect  =', JSON.stringify(await ev(`(()=>{var r=document.querySelector('span.bible-ref').getBoundingClientRect();return{l:Math.round(r.left),t:Math.round(r.top),b:Math.round(r.bottom)};})()`)));
  console.log('elementFromPoint(prise) =', JSON.stringify(await ev(`(function(){var e=document.elementFromPoint(${P.x},${P.y});return e?(e.id||e.className||e.tagName):null;})()`)));
  ws.close(); ch.kill(); srv.close(); process.exit(0);
})().catch(e => { console.log('CRASH', e); process.exit(1); });
