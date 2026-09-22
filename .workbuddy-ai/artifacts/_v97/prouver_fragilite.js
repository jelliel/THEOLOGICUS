/* v99d — LE GARDE EST-IL INERTE ? On le prouve.

   La trace montre : de `span.gr` vers `div.gr-lig` (dans la fiche), AUCUN
   `mouseout` n'est emis. Le corps du gestionnaire n'est donc jamais atteint,
   et `dansPanneau(e.relatedTarget)` n'est jamais evalue.

   Le panneau survit aujourd'hui parce que la fiche RECOUVRE le mot (le
   placement v94 interdit de poser la fiche SUR son mot, mais elle reste
   contigue, donc la souris passe d'un element a l'autre sans traverser un
   tiers). Ce n'est pas le garde qui protege : c'est la geometrie.

   Pourquoi c'est un vrai risque et pas une subtilite :
   le jour ou la fiche cesse de recouvrir le mot — texte plus long, ecran
   etroit, zoom, fiche repositionnee — un `mouseout` aura lieu, `relatedTarget`
   sera la FICHE, `tip.contains(fiche)` sera FAUX, et le panneau se refermera
   en emportant la fiche que l'utilisateur est en train de lire.

   Ce banc reproduit cette situation a volonte : on ECARTE la fiche du mot
   (donc plus de recouvrement), puis on refait le trajet. Si le panneau tombe,
   la fragilite est demontree et le correctif justifie.
*/
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 8888, CDP = 9428;
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
let ech = 0;
const ok = (n, c, d) => { if (!c) ech++; console.log((c ? 'OK    ' : 'ECHEC ') + n + (d !== undefined ? '  -> ' + JSON.stringify(d) : '')); };

(async () => {
  const srv = await serve();
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo99d-'));
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

  /* on trace les mouseout sortant du LIEN uniquement */
  await ev(`(()=>{
    window.__t99d = [];
    document.addEventListener('mouseout', function(e){
      var t=e.target;
      if(t && t.closest && t.closest('a.bible-ref, span.bible-ref')){
        var r=e.relatedTarget;
        var dans = !!(r && r.closest && (r.closest('#gr-tip') || r.closest('#hb-tip') ||
                    r.closest('#lat-tip') || r.closest('#qw-tip')));
        window.__t99d.push({ de: t.className, vers: r ? (r.tagName.toLowerCase()+(r.id?'#'+r.id:'')+(r.className&&typeof r.className==='string'?'.'+String(r.className).split(' ')[0]:'')) : 'null',
                             versEstUneFiche: dans });
      }
    }, true);
    return true; })()`);

  await ev(`(()=>{
    var cc=document.getElementById('chat-container') || document.body;
    var old=document.getElementById('banc99d'); if(old) old.remove();
    var h=document.createElement('div'); h.id='banc99d';
    h.style.cssText='position:fixed;left:20px;top:140px;width:400px;z-index:600;background:#fff;color:#111;padding:12px;';
    h.innerHTML='<span class="bible-ref" style="cursor:pointer;">Jean 3:16</span>';
    cc.appendChild(h); return true; })()`);

  /* ══ CAS 1 : trajet normal (fiche contigue au mot) ══ */
  console.log('=== CAS 1 : trajet normal, fiche laissee a son placement v94 ===');
  const p = await ev(`(()=>{ var e=document.querySelector('#banc99d .bible-ref');
    var r=e.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)}; })()`);
  await bouge(5, 5); await sleep(200);
  await bouge(p.x, p.y); await sleep(3000);
  const mot = await ev(`(()=>{ var t=document.getElementById('bible-verse-tip');
    var m=t?t.querySelector('.gr,.hb'):null; if(!m) return null;
    var r=m.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}; })()`);
  await bouge(mot.x, mot.y); await sleep(1400);
  const f1 = await ev(`(()=>{ var g=document.getElementById('gr-tip');
    if(!g||getComputedStyle(g).display!=='block') return null;
    var r=g.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}; })()`);
  await bouge(f1.x, f1.y); await sleep(1200);
  const fin1 = await ev(`(()=>{ var t=document.getElementById('bible-verse-tip'), g=document.getElementById('gr-tip');
    return { panneau: t?getComputedStyle(t).display!=='none':null, fiche: g?getComputedStyle(g).display==='block':null,
             sorties: window.__t99d.slice() }; })()`);
  console.log('  etat -> ' + JSON.stringify({ panneau: fin1.panneau, fiche: fin1.fiche }));
  console.log('  mouseout sortant du lien : ' + JSON.stringify(fin1.sorties));
  ok('1. cas normal : la fiche survit', fin1.panneau === true && fin1.fiche === true, fin1);

  /* ══ CAS 2 : on ECARTE la fiche du mot (plus de recouvrement) ══ */
  console.log('\n=== CAS 2 : la fiche est ECARTEE du mot (aucun recouvrement) ===');
  await ev(`(()=>{
    window.__t99d = [];
    /* on force la fiche loin du mot : entre les deux, il y a du vide */
    var g=document.getElementById('gr-tip');
    if(g){ var old=g.style.transition; g.style.transition='none'; g.style.left='820px'; g.style.top='560px'; }
    return true; })()`);
  /* on repart du lien pour refaire le trajet dans les memes conditions */
  await bouge(5, 5); await sleep(300);
  await bouge(p.x, p.y); await sleep(2500);
  const mot2 = await ev(`(()=>{ var t=document.getElementById('bible-verse-tip');
    var m=t?t.querySelector('.gr,.hb'):null; if(!m) return null;
    var r=m.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}; })()`);
  await bouge(mot2.x, mot2.y); await sleep(1200);
  /* on remet la fiche ecartee (au cas ou afficher() l'a replacee) */
  const f2 = await ev(`(()=>{ var g=document.getElementById('gr-tip');
    if(!g) return null;
    var old=g.style.transition; g.style.transition='none'; g.style.left='820px'; g.style.top='560px';
    var r=g.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}; })()`);
  console.log('  fiche ecartee -> ' + JSON.stringify(f2));
  ok('2. la fiche est bien ouverte avant le deplacement vers elle',
     !!(await ev(`(()=>{var g=document.getElementById('gr-tip');return !!g && getComputedStyle(g).display==='block';})()`)));

  await bouge(f2.x, f2.y); await sleep(1400);
  const fin2 = await ev(`(()=>{ var t=document.getElementById('bible-verse-tip'), g=document.getElementById('gr-tip');
    return { panneau: t?getComputedStyle(t).display!=='none':null, fiche: g?getComputedStyle(g).display==='block':null,
             sorties: window.__t99d.slice() }; })()`);
  console.log('  etat -> ' + JSON.stringify({ panneau: fin2.panneau, fiche: fin2.fiche }));
  console.log('  mouseout sortant du lien : ' + JSON.stringify(fin2.sorties));

  const unSorti = fin2.sorties && fin2.sorties.length > 0;
  console.log('\n  >>> un mouseout a bien ete emis : ' + unSorti);
  if (unSorti) {
    console.log('  >>> relatedTarget etait une fiche de mot : ' + JSON.stringify(fin2.sorties.map(s => s.versEstUneFiche)));
  }
  ok('3. la fragilite est DEMONTREE : sans recouvrement, le panneau se referme',
     fin2.panneau === false, { panneau: fin2.panneau, fiche: fin2.fiche });
  ok('4. et il emporte la fiche que l utilisateur lisait', fin2.fiche === false, fin2.fiche);

  console.log('\nECHECS = ' + ech);
  ws.close(); ch.kill(); srv.close();
})().catch(e => { console.error('ERREUR BANC:', e); process.exit(1); });
