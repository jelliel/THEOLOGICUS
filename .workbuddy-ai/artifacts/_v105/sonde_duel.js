/* Sonde : QUI gagne reellement entre #v37-tip et #bible-verse-tip ?
   On ne devine pas : on lit z-index calcule, ordre DOM, contexte
   d'empilement des ancetres, et on resout par elementFromPoint. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const PORT = 8896, CDP = 9436;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve('C:/Theologicus/mobile/www');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
const serve = () => new Promise(res => { const s = http.createServer((q, rp) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html'; const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { rp.writeHead(404); rp.end('404'); return; } rp.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' }); fs.createReadStream(f).pipe(rp); }); s.listen(PORT, '127.0.0.1', () => res(s)); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = await serve();
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo105p-'));
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

  const r = await ev(`(()=>{
    function decrire(el,label){
      if(!el) return {label:label, absent:true};
      var cs=getComputedStyle(el);
      /* profondeur dans le corps */
      var d=0,n=el; while(n&&n!==document.body){d++;n=n.parentElement;}
      /* ancetres qui creent un contexte d'empilement */
      var ctx=[],m=el.parentElement,p=0;
      while(m&&m!==document.documentElement&&p<20){
        var s=getComputedStyle(m);
        var raisons=[];
        if(s.position!=='static'&&s.zIndex!=='auto') raisons.push('z:'+s.zIndex);
        if(s.transform!=='none') raisons.push('transform');
        if(s.filter!=='none') raisons.push('filter');
        if(parseFloat(s.opacity)<1) raisons.push('opacity:'+s.opacity);
        if(s.isolation==='isolate') raisons.push('isolation');
        if(s.willChange&&/transform|opacity|filter/.test(s.willChange)) raisons.push('will-change');
        if(raisons.length) ctx.push((m.id?('#'+m.id):m.tagName)+'['+raisons.join(',')+']');
        m=m.parentElement;p++;
      }
      return {label:label, id:el.id, z:cs.zIndex, pos:cs.position, disp:cs.display,
              op:cs.opacity, tf:cs.transform.slice(0,40), pe:cs.pointerEvents,
              inlineZ:el.style.zIndex||null, inlineLeft:el.style.left||null,
              profondeur:d, ordre:Array.prototype.indexOf.call(document.body.children,el),
              contexteEmpilement:ctx,
              ecran:cs.display!=='none'};
    }
    var v=document.getElementById('v37-tip'), b=document.getElementById('bible-verse-tip');
    var out={ avant:{ v37:decrire(v,'v37'), bible:decrire(b,'bible')} };

    /* On force les DEUX a l'ecran, a la meme place, APRES avoir rempli la
       carte comme le ferait le module (sinon elle mesure 148x23). */
    var pr=b.getBoundingClientRect();
    if(b.style.display==='none'){ b.style.display='block'; b.style.opacity='1'; }
    pr=b.getBoundingClientRect();
    v.style.display='block'; v.style.opacity='1'; v.style.transform='none';
    v.innerHTML='<div class="v37-lang">Hébreu biblique</div><div class="v37-orig">בְּרֵאשִׁית</div><div class="v37-sep"></div><div class="v37-tr">bereshit</div><div class="v37-hint">translittération</div>';
    v.style.left=Math.round(pr.left+30)+'px'; v.style.top=Math.round(pr.top+30)+'px';
    v.style.right='auto'; v.style.bottom='auto';
    /* pointer-events:auto pour que elementFromPoint puisse l'atteindre */
    v.style.pointerEvents='auto';

    var vr=v.getBoundingClientRect();
    var ww=Math.min(vr.right,pr.right)-Math.max(vr.left,pr.left);
    var hh=Math.min(vr.bottom,pr.bottom)-Math.max(vr.top,pr.top);
    var cx=Math.round(Math.max(vr.left,pr.left)+ww/2), cy=Math.round(Math.max(vr.top,pr.top)+hh/2);
    var el=document.elementFromPoint(cx,cy);
    var chaine=[],n=el,g=0; while(n&&g<6){chaine.push(n.id?('#'+n.id):(n.className?('.'+String(n.className).split(' ')[0]):n.tagName));n=n.parentElement;g++;}
    out.apres={ v37:decrire(v,'v37'), bible:decrire(b,'bible'),
                recouvrement:Math.round(ww*hh), point:{x:cx,y:cy},
                touche:el?(el.id||el.className||el.tagName):null, chaine:chaine };
    return out;
  })()`);
  console.log(JSON.stringify(r, null, 1));
  ws.close(); ch.kill(); srv.close(); process.exit(0);
})().catch(e => { console.log('CRASH', e); process.exit(1); });
