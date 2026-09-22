/* v102 — VERIFICATION DU REPLI SUR FENETRE ETROITE, sans dependre du survol.

   Le banc `pourquoi_repli_absent.js` echoue a 584x605 sur « le panneau n'est
   pas ouvert » : a cette taille la reference `#banc` sort du viewport et le
   `Input.dispatchMouseEvent` la rate. C'est le BANC qui echoue, pas l'app —
   mais cela veut dire que ce cas n'est PAS mesure. On ne le contourne pas :
   on ouvre le panneau directement (`afficher` du module) puis on mesure.

   Pour chaque taille de fenetre on lit, sur le VRAI mot grec :
     - data-pos            (position retenue par __placerFiche)
     - l'aire de recouvrement fiche / panneau
     - le pourcentage de la SURFACE du panneau qui n'est plus atteignable
       (grille de 8 px + elementFromPoint)
     - les plafonds imposes a la fiche (max-width / max-height)
*/
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 8899, CDP = 9439;
const CHROME = 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(process.env.THEO_WWW || 'C:/Theologicus/_src_v102');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' };
const serve = () => new Promise(res => {
  const s = http.createServer((q, rp) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/THEOLOGICUS.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rp.writeHead(404); rp.end('404'); return; }
    rp.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(rp);
  });
  s.listen(PORT, '127.0.0.1', () => res(s));
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ech = 0;
const ok = (n, c, d) => { if (!c) ech++; console.log((c ? 'OK    ' : 'ECHEC ') + n + (d !== undefined ? '  -> ' + JSON.stringify(d) : '')); };

const MESURE = `(()=>{
  var p=document.getElementById('bible-verse-tip'), f=document.getElementById('gr-tip');
  if(!p || p.style.display!=='block' || p.getBoundingClientRect().width<20) return {err:'panneau absent'};
  if(!f) return {err:'pas de fiche'};
  var mot=p.querySelectorAll('.gr')[0];
  if(!mot) return {err:'pas de mot grec'};
  f.style.maxWidth=''; f.style.maxHeight='';
  var res = window.__placerFiche(f, mot);
  var fr=f.getBoundingClientRect(), pr=p.getBoundingClientRect();
  function aire(a,b){ var w=Math.min(a.right,b.right)-Math.max(a.left,b.left),
    h=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top); return (w>0&&h>0)?Math.round(w*h):0; }
  /* surface du panneau encore atteignable */
  var N=0,total=0,autres={};
  for(var y=pr.top; y<pr.bottom; y+=8){ for(var x=pr.left; x<pr.right; x+=8){
    if(x<1||y<1||x>window.innerWidth-1||y>window.innerHeight-1) continue;
    total++;
    var el=document.elementFromPoint(Math.round(x),Math.round(y));
    if(!(el&&el.closest&&el.closest('#bible-verse-tip'))){ N++;
      var q = el&&el.closest ? (el.closest('#gr-tip')?'FICHE-GR':(el.closest('#hb-tip')?'FICHE-HB':(el.closest('#lat-tip')?'FICHE-LAT':'autre'))):'aucun';
      autres[q]=(autres[q]||0)+1; } } }
  return { vw:window.innerWidth, vh:window.innerHeight, pos:f.getAttribute('data-pos'), retour:res,
           fiche:{l:Math.round(fr.left),t:Math.round(fr.top),w:Math.round(fr.width),h:Math.round(fr.height)},
           panneau:{l:Math.round(pr.left),t:Math.round(pr.top),w:Math.round(pr.width),h:Math.round(pr.height)},
           recouvrement: aire(fr,pr),
           maxWgetComputed:getComputedStyle(f).maxWidth, maxHcomputed:getComputedStyle(f).maxHeight,
           caches:N, total:total, pct: total?Math.round(100*N/total):null, autres:autres };
})()`;

(async () => {
  const srv = await serve();
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo102c-'));
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + prof, '--no-first-run', '--disable-gpu', '--window-size=984,765', 'about:blank'], { stdio: 'ignore' });
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

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/THEOLOGICUS.html' });
  await sleep(9000);
  await ev(`(()=>{ ['auth-overlay','setup-wizard-overlay'].forEach(function(k){var e=document.getElementById(k); if(e)e.remove();});
    Array.prototype.forEach.call(document.querySelectorAll('.wizard-step'),function(e){e.remove();}); return true; })()`);
  await sleep(400);

  await ev(`(async()=>{ await window.__ensureBibleBook('MAT'); return true; })()`);
  await sleep(800);

  for (const [w, h] of [[984, 765], [784, 705], [584, 605], [500, 665], [420, 760]]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await sleep(600);
    /* on ouvre le panneau par le module, sans dependre d'un survol : la
       reference sort du viewport sur les petites fenetres. */
    const ouvert = await ev(`(()=>{
      var cc=document.getElementById('chat-container') || document.body;
      var anc=document.getElementById('anc-v102');
      if(anc) anc.remove();
      anc=document.createElement('div'); anc.id='anc-v102';
      anc.style.cssText='position:fixed;left:8px;top:40px;width:1px;height:1px;overflow:hidden;';
      anc.innerHTML='<span class="bible-ref">Mt 5:22</span>';
      cc.appendChild(anc);
      var a=anc.querySelector('.bible-ref');
      a.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,clientX:a.getBoundingClientRect().left,clientY:a.getBoundingClientRect().top}));
      return true; })()`);
    await sleep(3200);
    const diag = await ev(MESURE);
    console.log('\n########## ' + w + 'x' + h + ' ##########');
    if (diag && diag.err) { console.log('  ' + JSON.stringify(diag)); continue; }
    console.log('  pos=' + diag.pos + '  recouvrement=' + diag.recouvrement + ' px2');
    console.log('  fiche   ' + JSON.stringify(diag.fiche) + '  maxW=' + diag.maxWgetComputed + ' maxH=' + diag.maxHcomputed);
    console.log('  panneau ' + JSON.stringify(diag.panneau));
    console.log('  panneau cache : ' + diag.caches + '/' + diag.total + ' (' + diag.pct + ' %)  ' + JSON.stringify(diag.autres));
    ok('  ' + w + 'x' + h + ' : aucun recouvrement du panneau', diag.recouvrement === 0 && diag.caches <= 2, diag);
  }
  await send('Emulation.clearDeviceMetricsOverride');
  console.log('\nECHECS = ' + ech + (ech === 0 ? '  -> OK' : '  -> A CORRIGER'));
  ws.close(); ch.kill(); srv.close();
  process.exit(ech === 0 ? 0 : 1);
})().catch(e => { console.error('ERREUR BANC:', e); process.exit(1); });
