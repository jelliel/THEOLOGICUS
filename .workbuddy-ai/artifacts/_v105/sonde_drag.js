/* Le drag echoue-t-il vraiment ? On instrumente les evenements de pointeur
   recus par la poignee de #bible-verse-tip, avec de VRAIS evenements CDP. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const PORT = 8899, CDP = 9439;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve('C:/Theologicus/mobile/www');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const serve = () => new Promise(res => { const s = http.createServer((q, rp) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { rp.writeHead(404); rp.end('404'); return; } rp.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rp); }); s.listen(PORT, '127.0.0.1', () => res(s)); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = await serve();
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo105d-'));
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
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 300, y: 700, button: 'none' });
  await sleep(200);
  const bb = await ev(`(()=>{var r=document.querySelector('span.bible-ref').getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: bb.x, y: bb.y, button: 'none' });
  await sleep(2500);

  /* On instrumente la poignee : on enregistre CHAQUE evenement recu. */
  const prep = await ev(`(()=>{
    var p=document.getElementById('bible-verse-tip');
    p.classList.remove('v105-posee'); p.style.pointerEvents='';
    window.__V105.balayer();
    var g=p.querySelector(':scope > .v105-poignee');
    if(!g) return {sansPoignee:true};
    g.style.opacity='1';
    window.__ev=[]; window.__dragState={tire:false,capture:null,bouge:false};
    ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture','click'].forEach(function(t){
      g.addEventListener(t,function(e){ window.__ev.push(t+'@'+Math.round(e.clientX)+','+Math.round(e.clientY)); },false);
    });
    var r=g.getBoundingClientRect();
    var pr=p.getBoundingClientRect();
    return { prise:{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)},
             poigneeRect:{l:Math.round(r.left),t:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)},
             bulle:{l:Math.round(pr.left),t:Math.round(pr.top)},
             gauche:Math.round(r.left), hautPoignee:Math.round(r.top) };
  })()`);
  console.log('PREP =', JSON.stringify(prep));
  if (!prep || !prep.prise) { console.log('pas de prise'); ws.close(); ch.kill(); srv.close(); process.exit(0); }

  const P = prep.prise;
  const el0 = await ev(`(()=>{var e=document.elementFromPoint(${P.x},${P.y});return e?(e.id||e.className||e.tagName):null;})()`);
  console.log('elementFromPoint sur la prise =', JSON.stringify(el0));

  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: P.x, y: P.y, button: 'none' });
  await sleep(150);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: P.x, y: P.y, button: 'left', buttons: 1, clickCount: 1 });
  await sleep(150);
  for (let i = 1; i <= 6; i++) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: P.x + 20 * i, y: P.y + 15 * i, button: 'left', buttons: 1 });
    await sleep(80);
  }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: P.x + 120, y: P.y + 90, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(600);

  console.log('EVENEMENTS =', JSON.stringify(await ev(`window.__ev`)));
  console.log('ETAT =', JSON.stringify(await ev(`(()=>{
    var p=document.getElementById('bible-verse-tip');var r=p.getBoundingClientRect();
    return {bulle:{l:Math.round(r.left),t:Math.round(r.top)}, pe:getComputedStyle(p).pointerEvents,
            posee:p.classList.contains('v105-posee'), memento:window.__V105.lirePosition('bible-verse-tip'),
            exact: {dl:Math.round(r.left)-${prep.bulle.l}, dt:Math.round(r.top)-${prep.bulle.t}}};
  })()`)));

  /* Deuxieme essai : on reprend la poignee APRES le deplacement. */
  const prep2 = await ev(`(()=>{
    var p=document.getElementById('bible-verse-tip');var g=p.querySelector(':scope > .v105-poignee');
    var r=g.getBoundingClientRect();return {prise:{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}};
  })()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: prep2.prise.x, y: prep2.prise.y, button: 'none' });
  await sleep(150);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: prep2.prise.x, y: prep2.prise.y, button: 'left', buttons: 1, clickCount: 1 });
  await sleep(150);
  for (let i = 1; i <= 5; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: prep2.prise.x - 12 * i, y: prep2.prise.y - 10 * i, button: 'left', buttons: 1 }); await sleep(80); }
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: prep2.prise.x - 60, y: prep2.prise.y - 50, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(600);
  console.log('APRES 2e DRAG =', JSON.stringify(await ev(`(()=>{var p=document.getElementById('bible-verse-tip');var r=p.getBoundingClientRect();return{l:Math.round(r.left),t:Math.round(r.top),memento:window.__V105.lirePosition('bible-verse-tip')};})()`)));

  ws.close(); ch.kill(); srv.close(); process.exit(0);
})().catch(e => { console.log('CRASH', e); process.exit(1); });
