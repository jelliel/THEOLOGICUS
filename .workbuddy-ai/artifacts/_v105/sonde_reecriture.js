/* Deux questions restees ouvertes :
   (1) #bible-verse-tip a-t-il une poignee APRES le balayage lent, quand on
       ne lui a rien fait subir ?
   (2) #v37-tip perd-il sa poignee quand son contenu est reecrit par le
       module lui-meme (`tip.innerHTML = ...` dans `show()`) ?  C'est le
       scenario REEL : a chaque mot nouveau, `show()` remplace innerHTML et
       DETRUIT la poignee. Si personne ne la remet, l'utilisateur perd le
       deplacement des le deuxieme mot survole. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const PORT = 8898, CDP = 9438;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve('C:/Theologicus/mobile/www');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const serve = () => new Promise(res => { const s = http.createServer((q, rp) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { rp.writeHead(404); rp.end('404'); return; } rp.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rp); }); s.listen(PORT, '127.0.0.1', () => res(s)); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = await serve();
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo105r-'));
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

  const nommer = `(function(){var o={};['bible-verse-tip','quran-verse-tip','tafsir-verse-tip','v37-tip','hb-tip','gr-tip','lat-tip','qw-tip'].forEach(function(i){var e=document.getElementById(i);o[i]=e?(e.querySelector(':scope > .v105-poignee')?'oui':'non'):'absent';});return o;})()`;

  console.log('T0 (au chargement) ', JSON.stringify(await ev(nommer)));

  /* (1) On laisse vivre 15 s SANS RIEN TOUCHER. Le balayage lent doit equiper
     tout ce qui existe. */
  await sleep(15000);
  console.log('T+15s (rien touche) ', JSON.stringify(await ev(nommer)));

  /* Le panneau de verset s'ouvre par survol, puis on regarde. */
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
  const apresSurvol = await ev(nommer);
  console.log('APRES SURVOL        ', JSON.stringify(apresSurvol));
  console.log('  contenu du panneau:', await ev(`(function(){var p=document.getElementById('bible-verse-tip');return p?p.innerHTML.slice(0,120):'absent';})()`));

  /* (2) Le scenario reel : `show()` de v37 reecrit innerHTML a chaque mot. */
  const reecriture = await ev(`(()=>{
    var v=document.getElementById('v37-tip');
    if(!v) return 'absent';
    var avant=!!v.querySelector(':scope > .v105-poignee');
    /* exactement ce que fait show() : */
    v.innerHTML='<div class="v37-lang">Grec ancien</div><div class="v37-orig">λόγος</div><div class="v37-sep"></div><div class="v37-tr">logos</div><div class="v37-hint">translittération phonétique</div>';
    var apres=!!v.querySelector(':scope > .v105-poignee');
    return {avantReecriture:avant, apresReecriture:apres};
  })()`);
  console.log('REECRITURE innerHTML', JSON.stringify(reecriture));

  /* Est-ce que le balayage (ou pointerover) la remet ? */
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 400, y: 400, button: 'none' });
  await sleep(1500);
  console.log('APRES pointerover   ', JSON.stringify(await ev(nommer)));

  ws.close(); ch.kill(); srv.close(); process.exit(0);
})().catch(e => { console.log('CRASH', e); process.exit(1); });
