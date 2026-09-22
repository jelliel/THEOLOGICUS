/* v101 — VERIFICATION SUR LA COPIE INSTALLEE.

   Ce banc ne teste pas la source : il teste ce que l'INSTALLEUR a depose.
   C'est la seule mesure qui prouve que l'utilisateur recevra le correctif v101
   (la fiche de mot ne recouvre plus le panneau du verset).

   Ce qui est mesure, et qui est NOUVEAU par rapport a _v96/installe.js :
     - le mot a mot est dans le panneau, donc on mesure le PANNEAU, pas la fiche ;
     - on compte la fraction de la SURFACE du panneau qui n'est plus atteignable
       (un elementFromPoint sur une grille rend autre chose que le panneau) ;
     - l'assertion porte sur 0 % cache, pas sur « le panneau est ouvert ».

   Le sandbox ne peut pas lancer THEOLOGICUS.exe : on sert le dossier INSTALLE.
*/
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 8896, CDP = 9436;
const CHROME = 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(process.env.THEO_WWW || 'C:/Theologicus/_inst_test');
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

(async () => {
  const srv = await serve();
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo101i-'));
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

  console.log('=== 0. c est bien la copie INSTALLEE ===');
  console.log('racine service -> ' + ROOT);
  const ver = await ev(`(()=>{ try { return { version: window.__THEO_VERSION__ || null,
    title: document.title, html: Math.round(document.documentElement.outerHTML.length) }; } catch(e){ return {err:String(e)}; } })()`);
  console.log('page -> ' + JSON.stringify(ver));

  await ev(`(()=>{ ['auth-overlay','setup-wizard-overlay'].forEach(function(k){var e=document.getElementById(k); if(e)e.remove();});
    Array.prototype.forEach.call(document.querySelectorAll('.wizard-step'),function(e){e.remove();}); return true; })()`);
  await sleep(500);

  /* ── 1. le helper de placement est VIVANT (le defaut v101 etait sa mort) ── */
  const helper = await ev(`typeof window.__placerFiche`);
  console.log('\n=== 1. le helper de placement ===');
  console.log('typeof window.__placerFiche -> ' + JSON.stringify(helper));
  ok('1. window.__placerFiche est publie (une erreur de syntaxe l avait tue en v101)',
     helper === 'function', helper);

  /* ── 2. les cinq panneaux sont dans l echelle, pas en litteral ── */
  const z = await ev(`(()=>{ var r=getComputedStyle(document.documentElement); return {
    panneau: r.getPropertyValue('--z-panneau').trim(), mot: r.getPropertyValue('--z-mot').trim(),
    motCSS: r.getPropertyValue('--z-mot').trim()|0, panneauCSS: r.getPropertyValue('--z-panneau').trim()|0 }; })()`);
  console.log('\n=== 2. echelle z dans l app installee ===');
  console.log('Z -> ' + JSON.stringify(z));
  ok('2. l echelle est presente dans l installation (mot 9500 > panneau 9000)',
     z && z.motCSS === 9500 && z.panneauCSS === 9000, z);

  /* ── 3. ouvrir le panneau biblique ── */
  await ev(`(async()=>{ await window.__ensureBibleBook('MAT');
    var cc=document.getElementById('chat-container') || document.body;
    var host=document.createElement('div'); host.id='banc';
    host.style.cssText='position:fixed;left:20px;top:70px;width:520px;z-index:500;background:#fff;color:#111;padding:12px;';
    host.innerHTML='<span class="bible-ref" style="cursor:pointer;">Mt 5:22</span>';
    cc.appendChild(host); return true; })()`);
  const ref = await ev(`(()=>{ var e=document.querySelector('#banc .bible-ref'); if(!e) return null; var r=e.getBoundingClientRect();
    return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)}; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 900, y: 700, button: 'none' });
  await sleep(200);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: ref.x, y: ref.y, button: 'none' });
  await sleep(3500);
  const ouvert = await ev(`(()=>{ var p=document.getElementById('bible-verse-tip');
    return !!(p && p.style.display==='block' && p.querySelectorAll('.gr').length); })()`);
  ok('3. le panneau biblique s ouvre avec sa ligne de mots grecs', ouvert === true, ouvert);

  /* ── 4. LE COEUR DU v101 : survoler le mot, puis compter le panneau cache ── */
  const GRILLE = `(()=>{
    var p=document.getElementById('bible-verse-tip'); if(!p) return {err:'pas de panneau'};
    var r=p.getBoundingClientRect(); if(r.width<20||r.height<20) return {err:'panneau trop petit'};
    var N=0, total=0, autres={};
    for(var y=r.top; y<r.bottom; y+=8){ for(var x=r.left; x<r.right; x+=8){
      if(x<1||y<1||x>window.innerWidth-1||y>window.innerHeight-1) continue;
      total++;
      var el=document.elementFromPoint(Math.round(x),Math.round(y));
      var dedans = el && el.closest ? !!el.closest('#bible-verse-tip') : false;
      if(!dedans){ N++;
        var q = el && el.closest ? (el.closest('#gr-tip')?'FICHE-GR':(el.closest('#hb-tip')?'FICHE-HB':(el.closest('#lat-tip')?'FICHE-LAT':'autre'))) : 'aucun';
        autres[q]=(autres[q]||0)+1; } } }
    return { total:total, caches:N, pct: total? Math.round(100*N/total):null,
             boite:{l:Math.round(r.left),t:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)}, autres:autres };
  })()`;

  const avant = await ev(GRILLE);
  console.log('\n=== 4. panneau au repos (aucune fiche ouverte) ===');
  console.log('grille -> ' + JSON.stringify(avant));
  ok('4. le panneau est entierement atteignable au repos',
     avant && avant.caches === 0, avant);

  let apresMot = null, pos = null;
  if (ouvert) {
    /* survoler le PREMIER mot grec : la fiche doit s'ouvrir, et le panneau
       doit rester lisible. On passe par un mouseover synthetique : un mot de
       ~20x18 px est rate par Input.dispatchMouseEvent (piege verifie). */
    await ev(`(()=>{ var p=document.getElementById('bible-verse-tip');
      var m=p.querySelectorAll('.gr')[0];
      m.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,clientX:m.getBoundingClientRect().left+2,clientY:m.getBoundingClientRect().top+2}));
      return true; })()`);
    await sleep(2500);
    apresMot = await ev(`(()=>{ var p=document.getElementById('bible-verse-tip'), f=document.getElementById('gr-tip');
      var fr=f?f.getBoundingClientRect():null, pr=p?p.getBoundingClientRect():null;
      function aire(a,b){ if(!a||!b) return 0; var w=Math.min(a.right,b.right)-Math.max(a.left,b.left),
        h=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top); return (w>0&&h>0)?Math.round(w*h):0; }
      return { panneauOuvert: !!(p&&p.style.display==='block'), ficheOuverte: !!(f&&f.style.display==='block'),
               ficheZ: f?getComputedStyle(f).zIndex:null, panneauZ: p?getComputedStyle(p).zIndex:null,
               fiche: fr?{l:Math.round(fr.left),t:Math.round(fr.top),w:Math.round(fr.width),h:Math.round(fr.height)}:null,
               panneau: pr?{l:Math.round(pr.left),t:Math.round(pr.top),w:Math.round(pr.width),h:Math.round(pr.height)}:null,
               recouvrement: aire(fr,pr), dataPos: f?f.getAttribute('data-pos'):null,
               translit: (f&&f.textContent)?f.textContent.slice(0,60):null }; })()`);
  }
  console.log('\n=== 5. survol du mot grec, sur la copie INSTALLEE ===');
  console.log('APRES -> ' + JSON.stringify(apresMot));
  ok('5. le panneau NE se referme PAS au survol du mot', apresMot && apresMot.panneauOuvert === true, apresMot);
  ok('6. la fiche du mot grec s ouvre', apresMot && apresMot.ficheOuverte === true, apresMot);
  ok('7. fiche (9500) au-dessus du panneau (9000)',
     apresMot && apresMot.ficheZ === '9500' && apresMot.panneauZ === '9000', apresMot);
  ok('8. la fiche ne recouvre PAS le panneau (aire = 0)',
     apresMot && apresMot.recouvrement === 0, apresMot && apresMot.recouvrement);
  ok('9. la fiche a ete placee HORS du panneau par le helper',
     apresMot && /^hors-/.test(String(apresMot.dataPos)), apresMot && apresMot.dataPos);

  const avecFiche = await ev(GRILLE);
  console.log('\n=== 6. panneau pendant que la fiche est ouverte ===');
  console.log('grille -> ' + JSON.stringify(avecFiche));
  ok('10. ZERO pourcent du panneau est cache par la fiche',
     avecFiche && avecFiche.caches === 0, avecFiche);

  /* ── 7. la translitteration est reellement rendue ── */
  ok('11. la fiche porte du contenu (translitteration/lemme)',
     apresMot && apresMot.translit && apresMot.translit.trim().length > 3, apresMot && apresMot.translit);

  /* ── 8. trois tailles de fenetre, meme exigence ── */
  console.log('\n=== 7. autres tailles de fenetre ===');
  for (const [w, h] of [[784, 705], [584, 605], [500, 665]]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await sleep(700);
    await ev(`(()=>{ var p=document.getElementById('bible-verse-tip');
      var m=p&&p.querySelectorAll('.gr')[0];
      if(m) m.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));
      return true; })()`);
    await sleep(1200);
    const g = await ev(GRILLE);
    const f = await ev(`(()=>{ var f=document.getElementById('gr-tip'); if(!f) return null;
      var r=f.getBoundingClientRect(); return {pos:f.getAttribute('data-pos'),h:Math.round(r.height)}; })()`);
    console.log(`  ${w}x${h} -> caches=${g && g.caches}/${g && g.total} (${g && g.pct}%)  fiche=${JSON.stringify(f)}`);
    ok(`11.${w}  aucun recouvrement du panneau a ${w}x${h}`, g && g.caches === 0, g);
  }
  await send('Emulation.clearDeviceMetricsOverride');

  console.log('\nECHECS = ' + ech + (ech === 0 ? '  -> INSTALLATION VERIFIEE' : '  -> A CORRIGER'));
  ws.close(); ch.kill(); srv.close();
  process.exit(ech === 0 ? 0 : 1);
})().catch(e => { console.error('ERREUR BANC:', e); process.exit(1); });
