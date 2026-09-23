/* Pourquoi `poser(p,500,120)` donne-t-il (0,0) ?
   On lit l'etat AVANT / APRES l'ecriture, et on cherche qui ecrase. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const PORT = 8901, CDP = 9441;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve('C:/Theologicus/mobile/www');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const serve = () => new Promise(res => { const s = http.createServer((q, rp) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { rp.writeHead(404); rp.end('404'); return; } rp.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rp); }); s.listen(PORT, '127.0.0.1', () => res(s)); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = await serve();
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo105w-'));
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

  /* On ouvre le panneau par survol reel puis on pose. */
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 300, y: 700, button: 'none' });
  await sleep(200);
  const bb = await ev(`(()=>{var r=document.querySelector('span.bible-ref').getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: bb.x, y: bb.y, button: 'none' });
  await sleep(2500);

  const r1 = await ev(`(()=>{
    var p=document.getElementById('bible-verse-tip');
    var av={l:Math.round(p.getBoundingClientRect().left),t:Math.round(p.getBoundingClientRect().top),
            iL:p.style.left,iT:p.style.top, w:p.offsetWidth,h:p.offsetHeight, disp:p.style.display};
    window.__V105.poser(p,500,120);
    var ap={l:Math.round(p.getBoundingClientRect().left),t:Math.round(p.getBoundingClientRect().top),
            iL:p.style.left,iT:p.style.top, w:p.offsetWidth,h:p.offsetHeight};
    /* un tick plus tard, au cas ou un autre code ecrase */
    return {avant:av, apres:ap};
  })()`);
  console.log('POSE  =', JSON.stringify(r1, null, 1));
  await sleep(800);
  console.log('APRES 0.8 s =', JSON.stringify(await ev(`(()=>{var p=document.getElementById('bible-verse-tip');return{l:Math.round(p.getBoundingClientRect().left),t:Math.round(p.getBoundingClientRect().top),iL:p.style.left,iT:p.style.top};})()`)));

  /* Est-ce que `poser` lui-meme borne mal ? On lit ses calculs. */
  const calc = await ev(`(()=>{
    var p=document.getElementById('bible-verse-tip');
    var w=p.offsetWidth||0,h=p.offsetHeight||0;
    var vw=window.innerWidth,vh=window.innerHeight;
    return {offsetW:w, offsetH:h, vw:vw, vh:vh,
            maxL:Math.max(4,vw-Math.min(w,vw)-4), maxT:Math.max(4,vh-Math.min(h,vh)-4),
            posVoulue:{l:500,t:120},
            resultatL:Math.round(Math.min(Math.max(4,500),Math.max(4,vw-Math.min(w,vw)-4))),
            resultatT:Math.round(Math.min(Math.max(4,120),Math.max(4,vh-Math.min(h,vh)-4)))};
  })()`);
  console.log('CALCUL =', JSON.stringify(calc));

  /* Le panneau est-il en position:fixed ? si oui left/top sont relatifs au
     viewport. S'il est static/relative, left/top n'ont pas le meme sens. */
  console.log('STYLE =', JSON.stringify(await ev(`(()=>{var p=document.getElementById('bible-verse-tip');var cs=getComputedStyle(p);return{position:cs.position,display:cs.display,left:cs.left,top:cs.top,transform:cs.transform};})()`)));
  ws.close(); ch.kill(); srv.close(); process.exit(0);
})().catch(e => { console.log('CRASH', e); process.exit(1); });
