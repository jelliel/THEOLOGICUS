/* v98 — LE PANNEAU ☷ RÉFÉRENCES DOIT RÉSOUDRE SES CITATIONS.

   Avant : `renderRefs` écrit les descriptions via `.textContent`, donc aucune
   reference n'y est balisee. « Saint Cyprien de Carthage (251) » reste du
   texte mort, alors que la meme chaine dans un message du chat devient bleue
   et cliquable.

   Ce banc verifie trois choses, dans cet ordre :
     1. le module v98 est monte et a branche son interception ;
     2. apres rendu du panneau, des references SONT balisees ;
     3. le survol d'une de ces references resout REELLEMENT la citation
        (et non : on l'a juste coloree en bleu).
*/
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 8894, CDP = 9434;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(process.env.THEO_WWW || 'C:/Theologicus/mobile/www');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' };
const pageName = () => ['index.html', 'THEOLOGICUS.html'].find(n => fs.existsSync(path.join(ROOT, n)));
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

(async () => {
  const srv = await serve();
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo98-'));
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
  const attendre = async (expr, butMs) => {
    const lim = Date.now() + butMs;
    while (Date.now() < lim) { const v = await ev(expr); if (v === true) return true; await sleep(400); }
    return false;
  };

  await send('Page.enable'); await send('Runtime.enable');
  console.log('=== cible ===\n  ' + ROOT + ' / ' + PAGE);
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' + PAGE });
  await attendre(`!!document.getElementById('chat-container')`, 30000);
  await sleep(1800);
  await ev(`(()=>{ ['auth-overlay','setup-wizard-overlay'].forEach(function(k){var e=document.getElementById(k); if(e)e.remove();}); return true; })()`);
  await sleep(400);

  /* ── 1. le module est monte et branche ── */
  console.log('\n=== 1. module v98 ===');
  const mod = await ev(`(()=>{
    var l=document.getElementById('ref-list');
    return { script: !!document.getElementById('v98-refs-panneau'),
             api: typeof window.__v98RefsPanneau,
             listePresente: !!l,
             branche: !!(l && l.getAttribute('data-v98-refs-panneau')==='1'),
             colorizeurGlobal: typeof window.colorizeSchemaRefs,
             colorizeurNu: (function(){ try { return typeof colorizeSchemaRefs; } catch(e){ return 'throw'; } })() }; })()`);
  console.log('  ' + JSON.stringify(mod));
  ok('1. le bloc v98 est present', mod && mod.script === true, mod && mod.script);
  ok('2. l API v98 est exposee', mod && mod.api === 'object', mod && mod.api);
  ok('3. la liste des references est branchee', mod && mod.branche === true, mod && mod.branche);
  ok('4. le coloriseur de references est joignable', mod && mod.colorizeurGlobal === 'function', mod && mod.colorizeurGlobal);

  /* ── 2. on ouvre le panneau et on compte les references balisees ── */
  console.log('\n=== 2. rendu du panneau ===');
  await ev(`(()=>{ var b=document.getElementById('references-btn'); if(b) b.click(); return true; })()`);
  await sleep(1500);
  const rendu = await ev(`(()=>{ var l=document.getElementById('ref-list');
    if(!l) return {err:'pas de liste'};
    var items=l.querySelectorAll('.ref-item');
    var refs=l.querySelectorAll('.ref-item-desc .bible-ref, .ref-item-desc .quran-ref, .ref-item-desc .tafsir-ref');
    var toutes=l.querySelectorAll('.bible-ref, .quran-ref, .tafsir-ref');
    var ex=[];
    Array.prototype.slice.call(refs,0,6).forEach(function(r){ ex.push(r.textContent.trim()); });
    return { items: items.length, refsDansDesc: refs.length, refsTotal: toutes.length,
             nbDesc: l.querySelectorAll('.ref-item-desc').length, exemples: ex }; })()`);
  console.log('  ' + JSON.stringify(rendu));
  ok('5. la liste contient des documents', rendu && rendu.items > 20, rendu && rendu.items);
  ok('6. des citations sont balisees dans les descriptions', rendu && rendu.refsDansDesc > 0, rendu && rendu.refsDansDesc);

  /* ── 3. la resolution est REELLE, pas seulement l habillage ── */
  console.log('\n=== 3. resolution locale des citations balisees ===');
  const resol = await ev(`(()=>{ var l=document.getElementById('ref-list');
    if(!l) return {err:'pas de liste'};
    var refs=l.querySelectorAll('.ref-item-desc .bible-ref');
    if(!refs.length) return {err:'aucune reference biblique', n:0};
    var out=[], okN=0;
    Array.prototype.forEach.call(refs,function(r){
      var txt=(r.textContent||'').trim();
      var v=null; try{ v=window.__parseBibleRef?window.__parseBibleRef(txt):null; }catch(e){ v='err'; }
      if(v) okN++;
      if(out.length<8) out.push({ txt:txt, resolu: v? (v.book||v.b||v.ref||JSON.stringify(v).slice(0,60)) : null });
    });
    return { n:refs.length, resolus:okN, echantillon:out }; })()`);
  console.log('  ' + JSON.stringify(resol, null, 1));
  ok('7. chaque citation balisee a une resolution locale',
     resol && resol.n > 0 && resol.resolus === resol.n,
     resol && (resol.resolus + '/' + resol.n));

  /* ── 4. une reference RESOLUE doit pouvoir ouvrir une infobulle ── */
  console.log('\n=== 4. une citation du panneau ouvre-t-elle une infobulle ? ===');
  const cible = await ev(`(()=>{ var l=document.getElementById('ref-list');
    var r=l?l.querySelector('.ref-item-desc .bible-ref'):null;
    if(!r) return null;
    r.scrollIntoView({block:'center'});
    var b=r.getBoundingClientRect();
    if(!b.width||!b.height) return null;
    return { x:Math.round(b.left+b.width/2), y:Math.round(b.top+b.height/2), txt:r.textContent.trim() }; })()`);
  console.log('  cible -> ' + JSON.stringify(cible));
  if (cible) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5, button: 'none' });
    await sleep(250);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cible.x, y: cible.y, button: 'none' });
    await sleep(2600);
    const tip = await ev(`(()=>{ var out={};
      ['bible-verse-tip','quran-verse-tip'].forEach(function(k){
        var e=document.getElementById(k);
        out[k]= e? { monte:true, ouvert: getComputedStyle(e).display!=='none', z:getComputedStyle(e).zIndex,
                     texte:(e.textContent||'').slice(0,60) } : { monte:false };
      }); return out; })()`);
    console.log('  ' + JSON.stringify(tip));
    const ouvert = tip && ((tip['bible-verse-tip'] || {}).ouvert || (tip['quran-verse-tip'] || {}).ouvert);
    ok('8. le survol d une citation du panneau ouvre le panneau de verset', ouvert === true, tip);
  } else {
    ok('8. une citation cible a pu etre trouvee dans le panneau', false, cible);
  }

  console.log('\nECHECS = ' + ech + (ech === 0 ? '  -> PANNEAU REFERENCES CABLE' : '  -> A CORRIGER'));
  ws.close(); ch.kill(); srv.close();
  process.exit(ech === 0 ? 0 : 1);
})().catch(e => { console.error('ERREUR BANC:', e); process.exit(1); });
