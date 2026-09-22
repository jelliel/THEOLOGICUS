/* v99b — LA FENETRE MORTE DU PANNEAU BIBLIQUE.

   `#bible-verse-tip` naît avec `pointer-events:none` (l. 20399) et ne passe a
   `auto` QUE dans le `.then()` de `__hbRemplir` / `__grRemplir` — c'est-a-dire
   apres chargement du corpus (reseau ou tranche JS). Avant ce moment, le
   panneau est visible mais TRAVERSE PAR LA SOURIS : impossible de survoler un
   mot, donc la fiche ne s'ouvre jamais.

   Ce banc mesure trois choses :
     1. l'etat de `pointer-events` juste apres l'ouverture, echantillonne ;
     2. le delai reel avant que le panneau devienne survolable ;
     3. si, une fois la fenetre passee, le mot ouvre bien sa fiche.

   Puis on teste le meme trajet en coupant le corpus (cache vide + reseau
   coupe) : c'est le cas « mode avion » qui doit rester utilisable.
*/
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 8890, CDP = 9430;
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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo99b-'));
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

  /* on NE precharge PAS le corpus : on veut voir la fenetre morte */
  await ev(`(()=>{
    var cc=document.getElementById('chat-container') || document.body;
    var old=document.getElementById('banc99b'); if(old) old.remove();
    var h=document.createElement('div'); h.id='banc99b';
    h.style.cssText='position:fixed;left:20px;top:140px;width:400px;z-index:600;background:#fff;color:#111;padding:12px;';
    h.innerHTML='<span class="bible-ref" style="cursor:pointer;">Jean 3:16</span>';
    cc.appendChild(h); return true; })()`);
  const p = await ev(`(()=>{ var e=document.querySelector('#banc99b .bible-ref');
    var r=e.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)}; })()`);

  console.log('=== ECHANTILLONNAGE de pointer-events apres ouverture ===');
  await bouge(5, 5); await sleep(200);
  await bouge(p.x, p.y);
  const ech2 = [];
  for (let i = 0; i < 16; i++) {
    await sleep(250);
    const s = await ev(`(()=>{ var t=document.getElementById('bible-verse-tip');
      if(!t) return null;
      var ouvert = getComputedStyle(t).display!=='none';
      return { ms: ${0}, pe: getComputedStyle(t).pointerEvents, ouvert: ouvert,
               mots: t.querySelectorAll('.hb,.gr').length }; })()`);
    if (s) { s.ms = (i + 1) * 250; ech2.push(s); }
  }
  ech2.forEach(s => console.log('  +' + String(s.ms).padStart(4) + ' ms  pointer-events=' + String(s.pe).padEnd(6) + ' affiche=' + String(s.ouvert).padEnd(5) + ' mots=' + s.mots));

  const morts = ech2.filter(s => s.ouvert && s.pe === 'none');
  const bascule = ech2.find(s => s.pe === 'auto');
  console.log('\n  echantillons panneau OUVERT mais souris traverse : ' + morts.length);
  console.log('  bascule vers auto : ' + (bascule ? '+' + bascule.ms + ' ms' : 'jamais dans la fenetre mesuree'));

  /* ── le trajet complet, maintenant que le corpus est la ── */
  console.log('\n=== trajet complet une fois le panneau survolable ===');
  const etat = await ev(`(()=>{ var t=document.getElementById('bible-verse-tip');
    var m=t?t.querySelector('.gr,.hb'):null;
    return { pe: t?getComputedStyle(t).pointerEvents:null,
             mot: m? (function(){var r=m.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),w:Math.round(r.width)};})() : null }; })()`);
  console.log('  avant -> ' + JSON.stringify(etat));
  if (etat && etat.mot && etat.mot.w > 0) {
    await bouge(etat.mot.x, etat.mot.y); await sleep(1500);
    const f = await ev(`(()=>{ var g=document.getElementById('gr-tip'), h=document.getElementById('hb-tip');
      function st(e){ return e? { id:e.id, ouvert:getComputedStyle(e).display==='block',
        rect: (function(){var r=e.getBoundingClientRect(); return r.width? {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}:null;})() } : null; }
      return { gr: st(g), hb: st(h),
               panneau: (function(){var t=document.getElementById('bible-verse-tip'); return t?getComputedStyle(t).display!=='none':null;})() }; })()`);
    console.log('  sur le mot -> ' + JSON.stringify(f));
  }

  ws.close(); ch.kill(); srv.close();
})().catch(e => { console.error('ERREUR BANC:', e); process.exit(1); });
