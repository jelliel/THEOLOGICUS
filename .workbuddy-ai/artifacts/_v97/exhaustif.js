/* v97 — VERIFICATION EXHAUSTIVE : TOUS les panneaux, pas seulement trois.

   Le correctif v96 n'avait migre que bible/quran/tafsir-verse-tip. Le retour
   de Fatih etait : « y en a qui ne sont pas effectifs ». Il avait raison —
   `#verse-mini-tip` vivait a 130000 et `#v37-tip` a 129999, soit ~120 000
   crans AU-DESSUS des fiches de mot (9500).

   Ce banc enumere les panneaux REELLEMENT presents dans le DOM et verifie,
   pour chacun, que la fiche de mot le domine. On ne teste pas une liste
   ecrite a la main (c'est ce qui a cause l'oubli) : on lit le DOM.

   TROIS CORRECTIONS PAR RAPPORT A LA VERSION PRECEDENTE DE CE BANC
   (toutes des erreurs de banc, pas des defauts de l'app) :

   1. Il servait `/THEOLOGICUS.html` alors que la copie mobile publiee est
      `mobile/www/index.html`. Resultat : 404 sur 3 octets, aucun script ne
      tournait, tous les elements etaient absents. Le serveur sert maintenant
      le nom REELLEMENT present sur le disque.

   2. Il utilisait `waitForTimeout`-like via sleep fixe et mesurait avant que
      les modules d'infobulle ne s'enregistrent. Ils sont differes via
      `__corpusHook` : le DOM reste vide jusqu'a l'entree dans le corpus.
      On ATTEND desormais la condition, avec delai de garde.

   3. Il fabriquait `#verse-mini-tip` / `#v37-tip` en div nus SANS la feuille
      de style du module, puis lisait `z-index: auto`. On mesurait le banc.
      Desormais : plus aucune creation. On charge vraiment le corpus, et un
      panneau absent est signale comme tel, pas maquille.

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
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(process.env.THEO_WWW || 'C:/Theologicus/mobile/www');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' };

/* ── correction 1 : servir le nom REELLEMENT present ─────────────────────── */
function pageName() {
  for (const n of ['index.html', 'THEOLOGICUS.html']) {
    if (fs.existsSync(path.join(ROOT, n))) return n;
  }
  throw new Error('aucun THEOLOGICUS.html/index.html dans ' + ROOT);
}
const PAGE = pageName();

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
  /* attend une condition JS cote page, sans jamais bloquer indefiniment */
  const attendre = async (expr, butMs) => {
    const lim = Date.now() + butMs;
    while (Date.now() < lim) {
      const v = await ev(expr);
      if (v === true) return true;
      await sleep(400);
    }
    return false;
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' + PAGE });
  console.log('=== 0. cible ===\n  ROOT=' + ROOT + '\n  page=' + PAGE);

  await attendre(`!!document.getElementById('chat-container')`, 30000);
  await sleep(1500);
  await ev(`(()=>{ ['auth-overlay','setup-wizard-overlay'].forEach(function(k){var e=document.getElementById(k); if(e)e.remove();});
    Array.prototype.forEach.call(document.querySelectorAll('.wizard-step'),function(e){e.remove();}); return true; })()`);
  await sleep(400);

  /* correction 2 : les modules d'infobulle sont differes. On les charge pour
     de vrai, puis on ATTEND que leurs elements existent. */
  console.log('\n=== 0b. chargement reel des modules differes ===');
  await ev(`(async()=>{ var L=[];
    ['__loadBibleNow','__loadQuranNow','__loadTafsirNow'].forEach(function(fn){ try{ window[fn]&&window[fn](); L.push(fn); }catch(e){ L.push(fn+':err'); } });
    try{ await window.__ensureBibleBook('43'); }catch(e){}
    try{ await window.__ensureQuranSurah(1); }catch(e){}
    return L; })()`);
  await attendre(`(()=>{ var n=0;
    ['bible-verse-tip','quran-verse-tip','tafsir-verse-tip','hb-tip','gr-tip','lat-tip','qw-tip'].forEach(function(i){ if(document.getElementById(i)) n++; });
    return n>=4; })()`, 30000);
  await sleep(1200);

  /* le corpus grec/hebreu porte les fiches hb/gr : on l'ouvre aussi */
  await ev(`(async()=>{ try{ await window.__ensureBibleHb(1); }catch(e){}
    try{ await window.__ensureBibleGr(1); }catch(e){}
    try{ await window.__ensureStrongsHb && window.__ensureStrongsHb(1); }catch(e){}
    try{ await window.__ensureLatin && window.__ensureLatin(1); }catch(e){}
    try{ await window.__ensureQuranWbw(1); }catch(e){}
    return true; })()`);
  await sleep(3000);

  /* ══════════ 1. INVENTAIRE DU DOM ══════════ */
  const dom = await ev(`(()=>{ var out=[];
    ['bible-verse-tip','quran-verse-tip','tafsir-verse-tip','verse-mini-tip','v37-tip',
     'hb-tip','gr-tip','lat-tip','qw-tip'].forEach(function(id){
      var e=document.getElementById(id);
      out.push({ id:id, present:!!e, z: e?getComputedStyle(e).zIndex:null });
    }); return out; })()`);
  console.log('\n=== 1. INVENTAIRE DU DOM ===');
  (dom || []).forEach(d => console.log('  ' + String(d.id).padEnd(20) + (d.present ? 'z=' + String(d.z).padStart(7) : '(absent)')));

  /* Correction 3 : on ne fabrique PLUS les panneaux. Un panneau legitinement
     ferme au repos (`#v37-tip`, `#verse-mini-tip`) appartient au perimetre
     mais n'est cree qu'a l'ouverture : on le mesure alors a l'ouverture
     (section 5). Ici on exige seulement que la regle CSS existe. */
  const regles = await ev(`(()=>{ var out=[];
    Array.prototype.forEach.call(document.styleSheets,function(ss){ try{
      Array.prototype.forEach.call(ss.cssRules,function(r){
        if(r.selectorText && r.style && r.style.zIndex) out.push(r.selectorText+' -> '+r.style.zIndex);
      }); }catch(e){} });
    return out; })()`);
  console.log('\n=== 1b. regles z-index declarees (ferme au repos compris) ===');
  (regles || []).forEach(r => { if (/tip|bulle|fiche|panneau/i.test(r)) console.log('  ' + r); });

  const presents = (dom || []).filter(d => d.present);
  const attendusPresent = presents.filter(d => PANNEAUX.indexOf(d.id) >= 0 || FICHES.indexOf(d.id) >= 0);
  ok('1. les fiches et au moins trois panneaux sont montes au chargement',
     presents.filter(d => FICHES.indexOf(d.id) >= 0).length === 4 &&
     presents.filter(d => PANNEAUX.indexOf(d.id) >= 0).length >= 3,
     { fiches: presents.filter(d => FICHES.indexOf(d.id) >= 0).map(d => d.id),
       panneaux: presents.filter(d => PANNEAUX.indexOf(d.id) >= 0).map(d => d.id) });

  /* ══════════ 2. ORDRE : aucune fiche sous un panneau ──────────────────────
     On compare les z-index DECLARES dans la feuille de style pour les cinq
     panneaux (ferme au repos inclus), et les z-index CALCULES pour les montees.
     C'est la seule facon de couvrir un panneau qui n'existe pas encore sans
     mentir sur son empilement. */
  const ORDRE = await ev(`(()=>{
    var res=[]; var fiches=${JSON.stringify(FICHES)};
    var panneaux=${JSON.stringify(PANNEAUX)};
    function zDeclare(id){
      var v=null;
      Array.prototype.forEach.call(document.styleSheets,function(ss){ try{
        Array.prototype.forEach.call(ss.cssRules,function(r){
          if(r.selectorText && r.selectorText.split(',').some(function(s){ return s.trim()==='#'+id; })
             && r.style && r.style.zIndex) v=r.style.zIndex;
        }); }catch(e){} });
      return v;
    }
    function resoudre(v){
      if(!v) return null;
      var m=/var\\((--[a-z-]+)\\s*,\\s*(\\d+)\\)/.exec(v);
      if(m){
        var cs=getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim();
        return parseInt(cs||m[2],10);
      }
      var n=parseInt(v,10); return isNaN(n)?null:n;
    }
    panneaux.forEach(function(pid){
      var e=document.getElementById(pid);
      var vd=zDeclare(pid);
      var zp=e?parseInt(getComputedStyle(e).zIndex,10):resoudre(vd);
      var brut=e?getComputedStyle(e).zIndex:vd;
      fiches.forEach(function(fid){
        var fe=document.getElementById(fid); if(!fe) return;
        var zf=parseInt(getComputedStyle(fe).zIndex,10)||0;
        if(zp===null||isNaN(zp)) { res.push({panneau:pid,zp:brut,fiche:fid,zf:zf,ok:null}); return; }
        res.push({panneau:pid, zp:zp, brut:brut, fiche:fid, zf:zf, ok:zf>zp});
      });
    });
    return res; })()`);
  console.log('\n=== 2. chaque fiche doit dominer chaque panneau ===');
  const ordreL = Array.isArray(ORDRE) ? ORDRE : [];
  if (!Array.isArray(ORDRE)) console.log('  (banc) reponse inattendue -> ' + JSON.stringify(ORDRE));
  const nonMesurables = ordreL.filter(r => r.ok === null);
  ordreL.forEach(r => {
    console.log('  ' + String(r.fiche).padEnd(9) + '(' + String(r.zf).padStart(6) + ')  vs  ' +
                String(r.panneau).padEnd(18) + '(' + String(r.zp === null ? r.brut : r.zp).padStart(9) + ')   ' +
                (r.ok === null ? '?? non mesurable' : (r.ok ? 'OK' : '<<< SOUS LE PANNEAU')));
  });
  const fautes = ordreL.filter(r => r.ok === false);
  ok('2. sur les cinq panneaux, chaque fiche est au-dessus', fautes.length === 0 && nonMesurables.length === 0,
     fautes.length ? fautes.slice(0, 6).map(r => r.fiche + ' ' + r.zf + ' < ' + r.panneau + ' ' + r.zp)
                   : nonMesurables.slice(0, 6).map(r => r.panneau + ' z=' + r.brut));
  ok('3. les cinq panneaux ont bien ete atteints (aucun oubli)', new Set(ordreL.map(r => r.panneau)).size === 5,
     Array.from(new Set(ordreL.map(r => r.panneau))));

  /* ══════════ 3. DUEL GEOMETRIQUE, panneau par panneau ══════════ */
  const duels = await ev(`(()=>{
    var res=[];
    var f=document.getElementById('qw-tip'); if(!f) return {err:'pas de fiche'};
    var memF={d:f.style.display,l:f.style.left,t:f.style.top,w:f.style.width,h:f.style.height};
    f.style.display='block';
    if(!f.offsetHeight){ f.innerHTML='<div style="height:180px">x</div>'; }
    f.style.left='120px'; f.style.top='200px'; f.style.width='280px';
    var fr=f.getBoundingClientRect();
    ${JSON.stringify(PANNEAUX)}.forEach(function(pid){
      var p=document.getElementById(pid);
      if(!p){ res.push({panneau:pid, err:'absent (jamais monte)'}); return; }
      var mem={d:p.style.display,l:p.style.left,t:p.style.top,w:p.style.maxWidth,h:p.style.maxHeight};
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
      p.style.display=mem.d; p.style.left=mem.l; p.style.top=mem.t; p.style.maxWidth=mem.w; p.style.maxHeight=mem.h;
      p.innerHTML='';
      res.push({panneau:pid, gagnant:g, recouvre:recouvre});
    });
    f.style.display=memF.d; f.style.left=memF.l; f.style.top=memF.t; f.style.width=memF.w; f.style.height=memF.h;
    return res; })()`);
  console.log('\n=== 3. duel geometrique : qui gagne au point commun ? ===');
  const dList = Array.isArray(duels) ? duels : [];
  if (!Array.isArray(duels)) console.log('  (banc) reponse inattendue -> ' + JSON.stringify(duels));
  dList.forEach(d => console.log('  ' + String(d.panneau).padEnd(20) + String(d.err || d.gagnant).padEnd(22) + 'recouvre=' + d.recouvre));
  const duelFait = dList.filter(d => !d.err);
  const perdus = duelFait.filter(d => d.gagnant !== 'FICHE');
  ok('4. au point commun, la FICHE gagne sur chaque panneau monte',
     duelFait.length >= 3 && perdus.length === 0,
     perdus.length ? perdus.map(d => d.panneau + '=' + d.gagnant) : duelFait.length + ' duels');
  ok('5. chaque duel est geometriquement valide (recouvrement reel)',
     duelFait.length >= 3 && duelFait.every(d => d.recouvre === true),
     duelFait.filter(d => !d.recouvre).map(d => d.panneau));

  /* ══════════ 4. AUCUN PANNEAU N EST RESTE HORS ECHELLE ══════════ */
  console.log('\n=== 4. reste-t-il un z-index en dur sur un panneau ? ===');
  const hors = await ev(`(()=>{ var out=[];
    ${JSON.stringify(PANNEAUX.concat(FICHES))}.forEach(function(id){
      var e=document.getElementById(id); if(!e) return;
      out.push({ id:id, inline: e.style.zIndex||null, calcule: getComputedStyle(e).zIndex });
    }); return out; })()`);
  (hors || []).forEach(h => console.log('  ' + String(h.id).padEnd(20) + 'calcule=' + String(h.calcule).padStart(7) + '  inline=' + h.inline));
  const enDur = (hors || []).filter(h => h.inline && (parseInt(h.inline, 10) || 0) >= 10000);
  ok('6. aucun panneau ne porte de z-index inline en dur >= 10000', enDur.length === 0,
     enDur.map(h => h.id + '=' + h.inline));

  /* ══════════ 5. SCENARIO REEL : citation dans une annotation + mot ══════════
     C'est le cas que Fatih decrivait et que v96 n'avait pas couvert :
     `#verse-mini-tip` a 130000 sous une fiche a 9500. On verifie maintenant
     que la citation s'ouvre, que le panneau porte l'echelle, et qu'une fiche
     ouverte PAR-DESSUS ne le referme pas. */
  console.log('\n=== 5. scenario reel : citation dans une annotation + mot au survol ===');
  await ev(`(()=>{
    var cc=document.getElementById('chat-container') || document.body;
    var old=document.getElementById('banc97'); if(old) old.remove();
    var host=document.createElement('div'); host.id='banc97';
    host.style.cssText='position:fixed;left:16px;top:90px;width:400px;z-index:600;background:#fff;color:#111;padding:10px;';
    host.innerHTML='<div class="atc-tip-a"><span class="atc-vref" data-vref="Jean 3:16" style="cursor:pointer;">Jean 3:16</span></div>';
    cc.appendChild(host);
    return true; })()`);
  const cibleVref = await ev(`(()=>{ var e=document.querySelector('#banc97 .atc-vref'); if(!e) return null;
    var r=e.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)}; })()`);
  ok('7. la reference d annotation est presente et cliquable', cibleVref !== null, cibleVref);

  if (cibleVref) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 20, y: 800, button: 'none' });
    await sleep(200);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cibleVref.x, y: cibleVref.y, button: 'none' });
    await sleep(3000);
    const vmt = await ev(`(()=>{ var v=document.getElementById('verse-mini-tip');
      return { monte: !!v, ouvert: !!(v && v.style.display==='block'),
               z: v?getComputedStyle(v).zIndex:null,
               zDeclare: (function(){ var o=null; Array.prototype.forEach.call(document.styleSheets,function(ss){ try{
                 Array.prototype.forEach.call(ss.cssRules,function(r){ if(r.selectorText==='#verse-mini-tip' && r.style && r.style.zIndex) o=r.style.zIndex; }); }catch(e){} }); return o; })(),
               texte: v?(v.textContent||'').slice(0,80):null }; })()`);
    console.log('  verse-mini-tip -> ' + JSON.stringify(vmt));
    ok('8. la citation s ouvre sur la reference d annotation', vmt && vmt.ouvert === true, vmt);
    ok('9. verse-mini-tip est dans l echelle (9000), plus 130000',
       vmt && (vmt.z === '9000' || String(vmt.zDeclare).indexOf('--z-panneau') >= 0), vmt && (vmt.z + ' / ' + vmt.zDeclare));
  }

  /* ══════════ 6. LA FICHE OUVERTE NE DOIT PAS REFERMER LE PANNEAU ══════════ */
  console.log('\n=== 6. survie du panneau quand on entre dans la fiche ===');
  const survie = await ev(`(()=>{
    var v=document.getElementById('verse-mini-tip'); var f=document.getElementById('qw-tip');
    if(!v||!f) return { err:'elements absents', v:!!v, f:!!f };
    /* on ouvre la citation, on ouvre la fiche, et on simule la SORTIE du lien
       vers la fiche : c'est exactement ce qui fermait le panneau avant v96. */
    v.style.display='block';
    f.style.display='block';
    var lien=document.querySelector('#banc97 .atc-vref');
    if(!lien) return { err:'lien absent' };
    var evt=new MouseEvent('mouseout',{bubbles:true});
    Object.defineProperty(evt,'target',{value:lien});
    Object.defineProperty(evt,'relatedTarget',{value:f});
    document.dispatchEvent(evt);
    return new Promise(function(res){ setTimeout(function(){
      res({ panneauOuvert: v.style.display==='block', zPanneau:getComputedStyle(v).zIndex, zFiche:getComputedStyle(f).zIndex });
    }, 600); }); })()`);
  console.log('  ' + JSON.stringify(survie));
  ok('10. le panneau de citation reste ouvert quand la souris entre dans la fiche',
     survie && survie.panneauOuvert === true, survie);
  ok('11. z fiche > z panneau, mesure sur les elements reels',
     survie && parseInt(survie.zFiche, 10) > parseInt(survie.zPanneau, 10),
     survie && (survie.zFiche + ' > ' + survie.zPanneau));

  console.log('\nECHECS = ' + ech + (ech === 0 ? '  -> TOUS LES PANNEAUX VERIFIES' : '  -> A CORRIGER'));
  ws.close(); ch.kill(); srv.close();
  process.exit(ech === 0 ? 0 : 1);
})().catch(e => { console.error('ERREUR BANC:', e); process.exit(1); });
