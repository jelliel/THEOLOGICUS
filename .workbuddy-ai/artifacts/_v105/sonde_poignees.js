/* Pourquoi #bible-verse-tip et #v37-tip n'ont-elles PAS de poignee, alors
   que #quran-verse-tip, #tafsir-verse-tip et les quatre fiches en ont ?
   On instrumente le balayage et on lit l'etat du registre `connus`. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const PORT = 8897, CDP = 9437;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve('C:/Theologicus/mobile/www');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const serve = () => new Promise(res => { const s = http.createServer((q, rp) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { rp.writeHead(404); rp.end('404'); return; } rp.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rp); }); s.listen(PORT, '127.0.0.1', () => res(s)); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = await serve();
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo105q-'));
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

  /* 1. L'API __V37 : quelles cles expose-t-elle vraiment ? */
  const clesV37 = await ev(`window.__V37 ? Object.keys(window.__V37) : 'ABSENT'`);
  console.log('CLES __V37 =', JSON.stringify(clesV37));

  /* 2. Qui a une poignee, et qui a ete vu par le balayage ? */
  const etat = await ev(`(()=>{
    var out={};
    ['bible-verse-tip','quran-verse-tip','tafsir-verse-tip','verse-mini-tip','v37-tip','hb-tip','gr-tip','lat-tip','qw-tip'].forEach(function(id){
      var e=document.getElementById(id);
      if(!e){out[id]='absent';return;}
      var g=e.querySelector(':scope > .v105-poignee');
      out[id]={poignee:!!g, enfants:e.children.length,
               hote:e.classList.contains('v105-hote'),
               rang:Array.prototype.indexOf.call(document.body.children,e),
               position:getComputedStyle(e).position,
               premiersEnfants:Array.prototype.slice.call(e.children,0,4).map(function(c){return c.className||c.tagName;})};
    });
    return out;
  })()`);
  console.log('ETAT =', JSON.stringify(etat, null, 1));

  /* 3. On relance le balayage a la main et on regarde ce qui se passe. */
  const relance = await ev(`(()=>{
    if(!window.__V105) return 'pas d api';
    var avant={}; ['bible-verse-tip','v37-tip'].forEach(function(id){var e=document.getElementById(id);avant[id]=e?e.querySelectorAll(':scope > .v105-poignee').length:'absent';});
    window.__V105.balayer();
    var apres={}; ['bible-verse-tip','v37-tip'].forEach(function(id){var e=document.getElementById(id);apres[id]=e?e.querySelectorAll(':scope > .v105-poignee').length:'absent';});
    return {avant:avant,apres:apres};
  })()`);
  console.log('BALAYAGE =', JSON.stringify(relance));

  /* 4. On force la poignee a la main sur #v37-tip : est-ce que ca echoue ? */
  const force = await ev(`(()=>{
    var v=document.getElementById('v37-tip');
    if(!v) return 'absent';
    try { v.appendChild(document.createElement('div')); } catch(e){ return 'appendKO:'+e.message; }
    var d=v.lastElementChild; d.className='v105-poignee';
    return {ok:true, position:getComputedStyle(v).position, nbEnfants:v.children.length};
  })()`);
  console.log('FORCE =', JSON.stringify(force));

  /* 5. Le selecteur :scope fonctionne-t-il sur ces elements ? */
  const sel = await ev(`(()=>{
    var out={};
    ['bible-verse-tip','v37-tip','quran-verse-tip'].forEach(function(id){
      var e=document.getElementById(id);
      if(!e){out[id]='absent';return;}
      var a=e.querySelectorAll(':scope > .v105-poignee').length;
      var b=e.querySelectorAll('.v105-poignee').length;
      out[id]={scope:a,desc:b};
    });
    return out;
  })()`);
  console.log('SELECTEUR =', JSON.stringify(sel));

  /* 6. #v105-deplacer-css est-elle bien dans la feuille ? */
  const css = await ev(`(()=>{
    var s=document.getElementById('v105-deplacer-css');
    var off=document.getElementById('v105-deplacer-off-css');
    return {plaque:!!s, off:!!off, plaqueEnFeuille:!!(s&&s.sheet), offEnFeuille:!!(off&&off.sheet),
            regles: s&&s.sheet? s.sheet.cssRules.length : null};
  })()`);
  console.log('CSS =', JSON.stringify(css));
  ws.close(); ch.kill(); srv.close(); process.exit(0);
})().catch(e => { console.log('CRASH', e); process.exit(1); });
