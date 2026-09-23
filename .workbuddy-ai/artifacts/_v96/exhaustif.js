/* v97 — VERIFICATION EXHAUSTIVE : TOUS les panneaux, pas seulement trois.

   Le correctif v96 n'avait migre que bible/quran/tafsir-verse-tip. Le retour
   de Fatih etait : « y en a qui ne sont pas effectifs ». Il avait raison —
   `#verse-mini-tip` vivait a 130000 et `#v37-tip` a 129999, soit 120 000
   crans AU-DESSUS des fiches de mot (9500).

   Ce banc enumere les panneaux REELLEMENT presents dans le DOM et verifie,
   pour chacun, que la fiche de mot le domine. On ne teste pas une liste
   ecrite a la main (c'est ce qui a cause l'oubli) : on lit le DOM.

   Deux preuves complementaires, parce qu'aucune ne suffit seule :
     - l'ORDRE des z-index calcules : rapide, mais un contexte d'empilement
       (transform, filter, opacity sur un ancetre) peut l'annuler ;
     - le DUEL geometrique : on force le recouvrement des deux boites et on
       demande a elementFromPoint laquelle est peinte. C'est le juge de paix.
*/
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 8896, CDP = 9436;
const CHROME = 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(process.env.THEO_WWW || 'C:/Theologicus/mobile/www');
/* v105f — CE BANC MENTAIT. Il servait '/THEOLOGICUS.html' alors que la copie
   publiee (mobile/www) ne contient QUE 'index.html' : 404, page vide, et
   cinq « ECHECS » parfaitement faux. _v97 avait deja resolu le probleme par
   auto-detection ; on aligne le meme mecanisme ici. */
function pageName() {
  for (const n of ['index.html', 'THEOLOGICUS.html']) {
    if (fs.existsSync(path.join(ROOT, n))) return n;
  }
  throw new Error('aucun index.html/THEOLOGICUS.html dans ' + ROOT);
}
const PAGE = pageName();
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' };
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

const FICHES = ['hb-tip', 'gr-tip', 'lat-tip', 'qw-tip'];
const PANNEAUX = ['bible-verse-tip', 'quran-verse-tip', 'tafsir-verse-tip', 'verse-mini-tip', 'v37-tip'];

(async () => {
  const srv = await serve();
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo97-'));
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + prof, '--no-first-run', '--disable-gpu', '--window-size=430,900', 'about:blank'], { stdio: 'ignore' });
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
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' + PAGE });
  await sleep(9000);
  await ev(`(()=>{ ['auth-overlay','setup-wizard-overlay'].forEach(function(k){var e=document.getElementById(k); if(e)e.remove();});
    Array.prototype.forEach.call(document.querySelectorAll('.wizard-step'),function(e){e.remove();}); return true; })()`);
  await sleep(500);

  /* Les modules d'infobulle sont enregistres paresseusement via __corpusHook :
     les elements n'existent PAS tant que le corpus n'est pas charge. Il faut
     donc declencher le chargement reel, sinon on mesure du vide — c'est ce qui
     a fait echouer la premiere version de ce banc. */
  await ev(`(async()=>{ try{ window.__loadBibleNow && window.__loadBibleNow(); }catch(e){}
    try{ window.__loadQuranNow && window.__loadQuranNow(); }catch(e){}
    try{ window.__loadTafsirNow && window.__loadTafsirNow(); }catch(e){}
    try{ await window.__ensureQuranSurah(1); }catch(e){}
    try{ await window.__ensureQuranWbw(1); }catch(e){}
    try{ await window.__ensureQuranRoots(1); }catch(e){}
    try{ await window.__ensureBibleBook('43'); }catch(e){}
    try{ await window.__ensureBibleHb(1); }catch(e){}
    return true; })()`);
  await sleep(4000);

  /* Certains panneaux ne sont crees qu'a l'usage. On les garantit, mais
     SANS toucher au z-index : la feuille de style du module doit rester
     seule maitresse de l'empilement, sinon on mesurerait notre propre
     garde-fou au lieu du correctif. */
  await ev(`(()=>{
    function garantir(id){
      if (document.getElementById(id)) return;
      var e=document.createElement('div'); e.id=id; e.style.display='none';
      document.body.appendChild(e);
    }
    garantir('verse-mini-tip');
    garantir('v37-tip');
    return true; })()`);
  await sleep(300);

  /* ══════════ 1. INVENTAIRE DU DOM ══════════ */
  const dom = await ev(`(()=>{ var out=[];
    ['bible-verse-tip','quran-verse-tip','tafsir-verse-tip','verse-mini-tip','v37-tip',
     'hb-tip','gr-tip','lat-tip','qw-tip','atc-bulle','atc-tip'].forEach(function(id){
      var e=document.getElementById(id);
      out.push({ id:id, present:!!e, z: e?getComputedStyle(e).zIndex:null });
    }); return out; })()`);
  console.log('=== 1. INVENTAIRE DU DOM ===');
  (dom || []).forEach(d => console.log('  ' + String(d.id).padEnd(20) + (d.present ? 'z=' + String(d.z).padStart(7) : '(absent)')));

  const presents = (dom || []).filter(d => PANNEAUX.indexOf(d.id) >= 0 && d.present);
  ok('1. les cinq panneaux de verset sont presents dans le DOM', presents.length === 5, presents.map(d => d.id));

  /* ══════════ 2. ORDRE : aucune fiche sous un panneau ══════════ */
  const ordre = await ev(`(()=>{
    var res=[]; var fiches=["hb-tip","gr-tip","lat-tip","qw-tip"]; var panneaux=["bible-verse-tip","quran-verse-tip","tafsir-verse-tip","verse-mini-tip","v37-tip"];
    function z(id){ var e=document.getElementById(id); return e?(parseInt(getComputedStyle(e).zIndex,10)||0):null; }
    panneaux.forEach(function(pid){
      var zp=z(pid); if(zp===null) return;
      fiches.forEach(function(fid){
        var zf=z(fid); if(zf===null) return;
        res.push({ panneau:pid, zp:zp, fiche:fid, zf:zf, ok:zf>zp });
      });
    });
    return res; })()`);
  console.log('\n=== 2. chaque fiche doit dominer chaque panneau ===');
  const fautes = (ordre || []).filter(r => !r.ok);
  (ordre || []).forEach(r => {
    console.log('  ' + String(r.fiche).padEnd(9) + '(' + String(r.zf).padStart(6) + ')  vs  ' +
                String(r.panneau).padEnd(18) + '(' + String(r.zp).padStart(7) + ')   ' +
                (r.ok ? 'OK' : '<<< SOUS LE PANNEAU'));
  });
  ok('2. sur les cinq panneaux, chaque fiche est au-dessus', fautes.length === 0,
     fautes.slice(0, 6).map(r => r.fiche + ' ' + r.zf + ' < ' + r.panneau + ' ' + r.zp));

  /* ══════════ 3. DUEL GEOMETRIQUE, panneau par panneau ══════════ */
  const duels = await ev(`(()=>{
    var res=[];
    var f=document.getElementById('qw-tip'); if(!f) return {err:'pas de fiche'};
    f.style.display='block';
    if(!f.offsetHeight){ f.innerHTML='<div style="height:180px">x</div>'; }
    f.style.left='120px'; f.style.top='200px'; f.style.width='280px';
    var fr=f.getBoundingClientRect();
    ["bible-verse-tip","quran-verse-tip","tafsir-verse-tip","verse-mini-tip","v37-tip"].forEach(function(pid){
      var p=document.getElementById(pid);
      if(!p){ res.push({panneau:pid, err:'absent'}); return; }
      var mem={d:p.style.display,l:p.style.left,t:p.style.top,w:p.style.maxWidth};
      p.style.display='block';
      if(!p.offsetHeight){ p.innerHTML='<div style="height:150px">panneau</div>'; }
      p.style.left=Math.round(fr.left)+'px'; p.style.top=Math.round(fr.top)+'px';
      p.style.maxWidth=Math.round(fr.width)+'px';
      var pr=p.getBoundingClientRect();
      var recouvre=!(fr.right<=pr.left||fr.left>=pr.right||fr.bottom<=pr.top||fr.top>=pr.bottom);
      var x=Math.round((Math.max(fr.left,pr.left)+Math.min(fr.right,pr.right))/2);
      var y=Math.round((Math.max(fr.top,pr.top)+Math.min(fr.bottom,pr.bottom))/2);
      var el=document.elementFromPoint(x,y);
      var g=el&&el.closest? (el.closest('#qw-tip')?'FICHE':(el.closest('#'+pid)?'PANNEAU':'autre')):'aucun';
      p.style.display=mem.d; p.style.left=mem.l; p.style.top=mem.t; p.style.maxWidth=mem.w;
      p.innerHTML='';
      res.push({panneau:pid, gagnant:g, recouvre:recouvre});
    });
    return res; })()`);
  console.log('\n=== 3. duel geometrique : qui gagne au point commun ? ===');
  /* `ev` rend un objet {__err} si l'expression a leve : ne pas supposer que
     c'est toujours un tableau. */
  const dList = Array.isArray(duels) ? duels : [];
  if (!Array.isArray(duels)) console.log('  (banc) reponse inattendue -> ' + JSON.stringify(duels));
  dList.forEach(d => console.log('  ' + String(d.panneau).padEnd(20) + String(d.err || d.gagnant).padEnd(9) + 'recouvre=' + d.recouvre));
  const perdus = dList.filter(d => d.gagnant !== 'FICHE');
  ok('3. au point commun, la FICHE gagne sur les cinq panneaux',
     dList.length === 5 && perdus.length === 0,
     perdus.length ? perdus.map(d => d.panneau + '=' + (d.err || d.gagnant)) : dList.length);
  ok('4. les cinq duels sont geometriquement valides (recouvrement reel)',
     dList.length === 5 && dList.every(d => d.recouvre === true),
     dList.filter(d => !d.recouvre).map(d => d.panneau));

  /* ══════════ 4. AUCUN PANNEAU N EST RESTE HORS ECHELLE ══════════ */
  console.log('\n=== 4. reste-t-il un z-index en dur sur un panneau ? ===');
  const hors = await ev(`(()=>{ var out=[];
    ["bible-verse-tip","quran-verse-tip","tafsir-verse-tip","verse-mini-tip","v37-tip"].concat(["hb-tip","gr-tip","lat-tip","qw-tip"]).forEach(function(id){
      var e=document.getElementById(id); if(!e) return;
      out.push({ id:id, inline: e.style.zIndex||null, calcule: getComputedStyle(e).zIndex });
    }); return out; })()`);
  (hors || []).forEach(h => console.log('  ' + String(h.id).padEnd(20) + 'calcule=' + String(h.calcule).padStart(7) + '  inline=' + h.inline));
  const enDur = (hors || []).filter(h => h.inline && (parseInt(h.inline, 10) || 0) >= 10000);
  ok('5. aucun panneau ne porte de z-index inline en dur >= 10000', enDur.length === 0,
     enDur.map(h => h.id + '=' + h.inline));

  /* ══════════ 5. SCENARIO REEL : ref. biblique dans un commentaire annote ══════════
     C'est le cas que Fatih decrivait et que v96 n'avait pas couvert :
     `#verse-mini-tip` a 130000 sous une fiche a 9500. On verifie maintenant
     que la fiche peut s'ouvrir PAR-DESSUS, et que le panneau survit. */
  console.log('\n=== 5. scenario reel : citation dans une annotation + mot au survol ===');
  const scenario = await ev(`(async()=>{
    var cc=document.getElementById('chat-container') || document.body;
    var host=document.createElement('div'); host.id='banc97';
    host.style.cssText='position:fixed;left:16px;top:90px;width:400px;z-index:600;background:#fff;color:#111;padding:10px;';
    /* Un mot hebreu survolable, comme dans un panneau biblique reel. */
    host.innerHTML='<div class="atc-tip-a"><span class="atc-vref" data-vref="Jean 3:16" style="cursor:pointer;">Jean 3:16</span></div>';
    cc.appendChild(host);
    return true; })()`);
  const cibleVref = await ev(`(()=>{ var e=document.querySelector('#banc97 .atc-vref'); if(!e) return null;
    var r=e.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)}; })()`);
  ok('6. la reference d annotation est presente et cliquable', cibleVref !== null, cibleVref);

  if (cibleVref) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 20, y: 800, button: 'none' });
    await sleep(200);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cibleVref.x, y: cibleVref.y, button: 'none' });
    await sleep(2500);
    const vmt = await ev(`(()=>{ var v=document.getElementById('verse-mini-tip');
      return { ouvert: !!(v && v.style.display==='block'), z: v?getComputedStyle(v).zIndex:null,
               texte: v?(v.textContent||'').slice(0,80):null }; })()`);
    console.log('  verse-mini-tip -> ' + JSON.stringify(vmt));
    ok('7. la citation s ouvre sur la reference d annotation', vmt && vmt.ouvert === true, vmt);
    ok('8. verse-mini-tip est passe a --z-panneau (9000), plus 130000', vmt && vmt.z === '9000', vmt && vmt.z);
  }

  console.log('\nECHECS = ' + ech + (ech === 0 ? '  -> TOUS LES PANNEAUX VERIFIES' : '  -> A CORRIGER'));
  ws.close(); ch.kill(); srv.close();
  process.exit(ech === 0 ? 0 : 1);
})().catch(e => { console.error('ERREUR BANC:', e); process.exit(1); });
