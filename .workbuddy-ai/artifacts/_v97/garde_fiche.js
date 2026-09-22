/* v99 — LE GARDE `dansPanneau` NE COUVRE PAS LES FICHES DE MOT.

   Les trois panneaux scripturaires gardent leur ouverture ainsi :

     function dansPanneau(n) { return !!(n && tip.contains(n)); }
     document.addEventListener('mouseout', function (e) {
       const el = e.target.closest('a.bible-ref, span.bible-ref');
       if (!el) return;
       if (dansPanneau(e.relatedTarget)) return;   // « on entre dans le panneau »
       hideTip();
     });

   Or les fiches de mot (#hb-tip, #gr-tip, #lat-tip, #qw-tip) sont creees par
   `document.body.appendChild(tip)` — donc FRERES des panneaux, pas descendants.
   `tip.contains(fiche)` est donc TOUJOURS FAUX, et le garde ne se declenche
   jamais. Consequence : des que la souris quitte le lien pour entrer dans la
   fiche de mot, le panneau se referme et emporte la fiche avec lui.

   Ce n'est PAS le meme defaut que v93 (qui visait le cas ou le mot vit DANS le
   panneau) : ici le mot vit DEHORS. Deux topologies, deux tests.

   Le banc mesure le trajet reel par CDP, avec de VRAIS mouvements de souris :
     lien de reference  ->  mot  ->  fiche de mot
   et verifie a chaque etape que le panneau ET la fiche sont encore ouverts.
*/
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 8891, CDP = 9431;
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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo99-'));
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
  const attendre = async (expr, butMs) => { const lim = Date.now() + butMs; while (Date.now() < lim) { const v = await ev(expr); if (v === true) return true; await sleep(400); } return false; };
  const bouge = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' }); };
  const centre = async sel => ev(`(()=>{ var e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null;
    var r=e.getBoundingClientRect(); if(!r.width||!r.height) return null;
    return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)}; })()`);

  await send('Page.enable'); await send('Runtime.enable');
  console.log('=== cible ===\n  ' + ROOT + ' / ' + PAGE);
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' + PAGE });
  await attendre(`!!document.getElementById('chat-container')`, 30000);
  await sleep(1500);
  await ev(`(()=>{ ['auth-overlay','setup-wizard-overlay'].forEach(function(k){var e=document.getElementById(k); if(e)e.remove();}); return true; })()`);
  await sleep(400);

  await ev(`(async()=>{ try{ window.__loadBibleNow && window.__loadBibleNow(); }catch(e){}
    try{ await window.__ensureBibleBook('43'); }catch(e){}
    try{ await window.__ensureBibleHb(1); }catch(e){}
    try{ await window.__ensureBibleGr(43); }catch(e){}
    return true; })()`);
  await sleep(4500);

  /* ── A. la topologie : la fiche est-elle un descendant du panneau ? ── */
  console.log('\n=== A. topologie DOM (la cause) ===');
  const topo = await ev(`(()=>{ var pan=document.getElementById('bible-verse-tip');
    var out={};
    ['hb-tip','gr-tip','lat-tip','qw-tip'].forEach(function(f){
      var e=document.getElementById(idem(f));
      out[f]={ existe:!!e, parent: e&&e.parentElement? (e.parentElement.id||e.parentElement.tagName):null,
               contenuParPanneau: !!(pan&&e&&pan.contains(e)) };
    });
    function idem(s){ return s; }
    out.panneauParent = pan&&pan.parentElement? (pan.parentElement.id||pan.parentElement.tagName):null;
    return out; })()`);
  console.log('  ' + JSON.stringify(topo, null, 1));
  ok('1. les fiches de mot sont des enfants de BODY, pas du panneau',
     topo && Object.keys(topo).filter(k => topo[k] && topo[k].existe).every(k => topo[k].contenuParPanneau === false),
     topo && Object.keys(topo).filter(k => topo[k] && topo[k].existe).map(k => k + ':parent=' + topo[k].parent));

  /* ── B. le trajet reel lien -> mot -> fiche ── */
  console.log('\n=== B. trajet reel de la souris ===');
  await ev(`(()=>{
    var cc=document.getElementById('chat-container') || document.body;
    var old=document.getElementById('banc99'); if(old) old.remove();
    var h=document.createElement('div'); h.id='banc99';
    h.style.cssText='position:fixed;left:20px;top:140px;width:400px;z-index:600;background:#fff;color:#111;padding:12px;';
    h.innerHTML='<span class="bible-ref" style="cursor:pointer;">Jean 3:16</span>';
    cc.appendChild(h); return true; })()`);
  const pLien = await centre('#banc99 .bible-ref');
  console.log('  lien  -> ' + JSON.stringify(pLien));
  await bouge(5, 5); await sleep(250);
  await bouge(pLien.x, pLien.y); await sleep(3500);

  const etat1 = await ev(`(()=>{ var t=document.getElementById('bible-verse-tip');
    var m=document.querySelector('#bible-verse-tip .gr, #bible-verse-tip .hb');
    return { panneauOuvert: !!(t && getComputedStyle(t).display!=='none'),
             motExiste: !!m,
             motClass: m?m.className:null,
             motRect: m? (function(){var r=m.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),w:Math.round(r.width)};})() : null }; })()`);
  console.log('  sur le lien -> ' + JSON.stringify(etat1));
  ok('2. le panneau s ouvre et porte des mots cliquables',
     etat1 && etat1.panneauOuvert === true && etat1.motExiste === true, etat1);
  ok('3. le mot a une boite non nulle (sinon on ne peut pas le viser)',
     etat1 && etat1.motRect && etat1.motRect.w > 0, etat1 && etat1.motRect);

  if (!etat1 || !etat1.motRect) {
    console.log('\n  >>> impossible de poursuivre : pas de mot mesurable.');
    console.log('ECHECS = ' + ech);
    ws.close(); ch.kill(); srv.close(); process.exit(1);
  }

  /* on va SUR le mot. Attention : pour un verset du NT c'est la fiche GRECQUE
     (`#gr-tip`) qui s'ouvre, pas l'hebraique — viser `#hb-tip` en premier
     faisait echouer un banc precedent alors que l'app etait correcte. */
  await bouge(etat1.motRect.x, etat1.motRect.y); await sleep(1600);
  const etat2 = await ev(`(()=>{ var t=document.getElementById('bible-verse-tip');
    var g=document.getElementById('gr-tip'), h=document.getElementById('hb-tip');
    function st(e){ if(!e) return null;
      var r=e.getBoundingClientRect();
      return { id:e.id, ouvert: getComputedStyle(e).display==='block',
               rect: (r.width&&r.height)? {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)} : null }; }
    var ouverts=[st(g),st(h)].filter(function(x){ return x && x.ouvert; });
    return { panneauOuvert: !!(t && getComputedStyle(t).display!=='none'),
             ficheOuverte: ouverts.length>0,
             ficheId: ouverts.length? ouverts[0].id : null,
             ficheRect: ouverts.length? ouverts[0].rect : null }; })()`);
  console.log('  sur le mot  -> ' + JSON.stringify(etat2));
  ok('4. entrer dans un MOT ne referme pas le panneau', etat2 && etat2.panneauOuvert === true, etat2);
  ok('5. la fiche du mot s ouvre', etat2 && etat2.ficheOuverte === true, etat2);

  /* et maintenant on entre DANS la fiche — le cas que `dansPanneau` rate */
  if (etat2 && etat2.ficheRect) {
    await bouge(etat2.ficheRect.x, etat2.ficheRect.y); await sleep(1200);
    const etat3 = await ev(`(()=>{ var t=document.getElementById('bible-verse-tip');
      var g=document.getElementById('gr-tip'), h=document.getElementById('hb-tip');
      function st(e){ return e? { id:e.id, ouvert:getComputedStyle(e).display==='block' } : null; }
      var ouverts=[st(g),st(h)].filter(function(x){ return x && x.ouvert; });
      return { panneauOuvert: !!(t && getComputedStyle(t).display!=='none'),
               ficheOuverte: ouverts.length>0,
               ficheId: ouverts.length? ouverts[0].id : null }; })()`);
    console.log('  dans la fiche -> ' + JSON.stringify(etat3));
    ok('6. entrer dans la FICHE ne referme pas le panneau (le garde doit couvrir les fiches)',
       etat3 && etat3.panneauOuvert === true, etat3);
    ok('7. la fiche reste ouverte pendant la lecture',
       etat3 && etat3.ficheOuverte === true, etat3);
  }

  console.log('\nECHECS = ' + ech + (ech === 0 ? '  -> LA FICHE SURVIT PARTOUT' : '  -> A CORRIGER'));
  ws.close(); ch.kill(); srv.close();
  process.exit(ech === 0 ? 0 : 1);
})().catch(e => { console.error('ERREUR BANC:', e); process.exit(1); });
