/* v99c — POURQUOI le garde tient-il, alors que `tip.contains(fiche)` est faux ?

   Le banc `garde_fiche.js` montre que la fiche survit. Mais le code dit :

     if (dansPanneau(e.relatedTarget)) return;   // tip.contains(...) -> false
     hideTip();

   Donc soit `mouseout` ne se declenche pas du tout quand on sort du lien pour
   entrer dans la fiche, soit il se declenche mais un autre `mouseover` rouvre
   aussitot. Il faut savoir LEQUEL : cette difference decide si le code est
   fragile (un simple reordonnancement des blocs le casserait) ou robuste.

   On instrumente les deux ecouteurs reels et on enregistre la sequence.
*/
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 8889, CDP = 9429;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(process.env.THEO_WWW || 'C:/Theologicus/mobile/www');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' };
const PAGE = ['index.html', 'THEOLOGICUS.html'].find(n => fs.existsSync(path.join(ROOT, n)));
const serve = () => new Promise(res => {
  const s = http.createServer((q, rp) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/' + PAGE;
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rp.writeHead(404); rp.end('404'); return; }
    rp.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(rp);
  });
  s.listen(PORT, '127.0.0.1', () => res(s));
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const srv = await serve();
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo99c-'));
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + prof, '--no-first-run', '--disable-gpu', '--window-size=1200,900', 'about:blank'], { stdio: 'ignore' });
  let t = null;
  for (let i = 0; i < 60; i++) { await sleep(500); try { const l = await (await fetch('http://127.0.0.1:' + CDP + '/json/list')).json(); t = l.find(x => x.type === 'page'); if (t && t.webSocketDebuggerUrl) break; } catch (e) {} }
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
  await new Promise(r => ws.on('open', r));
  let id = 0; const pend = new Map();
  ws.on('message', raw => { const m = JSON.parse(raw.toString()); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const send = (me, pa) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  const ev = async e => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return { __err: ((r.result.exceptionDetails.exception || {}).description || '').slice(0, 400) };
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  const attendre = async (expr, butMs) => { const lim = Date.now() + butMs; while (Date.now() < lim) { const v = await ev(expr); if (v === true) return true; await sleep(300); } return false; };
  const bouge = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' }); };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' + PAGE });
  await attendre(`!!document.getElementById('chat-container')`, 30000);
  await sleep(1200);
  await ev(`(()=>{ ['auth-overlay','setup-wizard-overlay'].forEach(function(k){var e=document.getElementById(k); if(e)e.remove();}); return true; })()`);
  await sleep(300);

  await ev(`(async()=>{ try{ window.__loadBibleNow && window.__loadBibleNow(); }catch(e){}
    try{ await window.__ensureBibleBook('43'); }catch(e){}
    try{ await window.__ensureBibleGr(43); }catch(e){}
    return true; })()`);
  await sleep(4000);

  /* on instrumente : chaque mouseout du lien et chaque mouseover sont traces */
  await ev(`(()=>{
    window.__trace99 = [];
    function d(n){ if(!n) return 'null'; if(n===window) return 'window'; if(n===document) return 'document';
      if(n.nodeType===1) return (n.tagName.toLowerCase()+(n.id?'#'+n.id:'')+(n.className&&typeof n.className==='string'?'.'+n.className.split(' ')[0]:''));
      return 'noeud'+n.nodeType; }
    document.addEventListener('mouseout', function(e){
      var t=e.target, r=e.relatedTarget;
      if(t && t.closest && t.closest('a.bible-ref, span.bible-ref'))
        window.__trace99.push({ev:'mouseout', de:d(t), vers:d(r)});
    }, true);
    document.addEventListener('mouseover', function(e){
      var t=e.target, r=e.relatedTarget;
      if(t && t.closest && (t.closest('a.bible-ref, span.bible-ref') || t.closest('.gr,.hb') || t.closest('#gr-tip,#hb-tip')))
        window.__trace99.push({ev:'mouseover', sur:d(t), de:d(r)});
    }, true);
    return true; })()`);

  await ev(`(()=>{
    var cc=document.getElementById('chat-container') || document.body;
    var old=document.getElementById('banc99c'); if(old) old.remove();
    var h=document.createElement('div'); h.id='banc99c';
    h.style.cssText='position:fixed;left:20px;top:140px;width:400px;z-index:600;background:#fff;color:#111;padding:12px;';
    h.innerHTML='<span class="bible-ref" style="cursor:pointer;">Jean 3:16</span>';
    cc.appendChild(h); return true; })()`);
  const p = await ev(`(()=>{ var e=document.querySelector('#banc99c .bible-ref');
    var r=e.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)}; })()`);

  await bouge(5, 5); await sleep(200);
  await bouge(p.x, p.y); await sleep(3000);
  const mot = await ev(`(()=>{ var t=document.getElementById('bible-verse-tip');
    var m=t?t.querySelector('.gr,.hb'):null; if(!m) return null;
    var r=m.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}; })()`);
  console.log('  mot -> ' + JSON.stringify(mot));

  await ev(`window.__trace99.push({ev:'--- vers le MOT ---'}); true`);
  await bouge(mot.x, mot.y); await sleep(1400);
  const f = await ev(`(()=>{ var g=document.getElementById('gr-tip');
    if(!g || getComputedStyle(g).display!=='block') return null;
    var r=g.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}; })()`);
  console.log('  fiche -> ' + JSON.stringify(f));

  await ev(`window.__trace99.push({ev:'--- vers la FICHE ---'}); true`);
  await bouge(f.x, f.y); await sleep(1400);
  await ev(`window.__trace99.push({ev:'--- fin ---'}); true`);

  const trace = await ev(`window.__trace99`);
  console.log('\n=== SEQUENCE REELLE DES EVENEMENTS ===');
  (trace || []).forEach(x => {
    if (x.ev && x.ev.indexOf('---') === 0) { console.log('  ' + x.ev); return; }
    console.log('  ' + String(x.ev).padEnd(10) + ' ' + JSON.stringify(x).slice(0, 160));
  });

  const etatFinal = await ev(`(()=>{ var t=document.getElementById('bible-verse-tip'), g=document.getElementById('gr-tip');
    return { panneau: t?getComputedStyle(t).display!=='none':null, fiche: g?getComputedStyle(g).display==='block':null }; })()`);
  console.log('\n  etat final -> ' + JSON.stringify(etatFinal));

  ws.close(); ch.kill(); srv.close();
})().catch(e => { console.error('ERREUR BANC:', e); process.exit(1); });
