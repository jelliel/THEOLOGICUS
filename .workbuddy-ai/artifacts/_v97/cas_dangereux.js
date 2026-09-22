/* v99e — LE SEUL CAS QUI FERAIT TOMBER LE PANNEAU, ET SI IL EXISTE VRAIMENT.

   Deux hypotheses testees jusqu'ici, deux echecs :
     - le garde `dansPanneau` est inerte (prouve par la trace : aucun mouseout
       n'est emis vers la fiche) ;
     - deplacer la fiche loin du mot ne casse rien (aucun mouseout emis non
       plus : sortir du mot va vers le vide, pas depuis le lien).

   Le seul scenario qui produirait un `mouseout` depuis le LIEN avec une fiche
   pour `relatedTarget` est celui ou la fiche RECOUVRE LE LIEN lui-meme, et ou
   la souris va du lien vers la fiche. Alors :
     - target  = le lien       -> le gestionnaire s'execute
     - relatedTarget = la fiche -> tip.contains(fiche) = FAUX
     - hideTip() appele        -> panneau ferme, fiche orpheline

   Reste a savoir si `__placerFiche` peut reellement poser une fiche sur un
   lien de reference. On ne le suppose pas : on enumere les positions que le
   placement v94 accepte, mot par mot, et on regarde si l'une d'elles recouvre
   le lien qui a ouvert le panneau.
*/
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 8887, CDP = 9427;
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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo99e-'));
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

  /* ── A. la garde est-elle seulement ATTEIGNABLE ? On la sonde直接. ── */
  console.log('=== A. le corps du gestionnaire est-il atteignable ? ===');
  await ev(`(()=>{
    window.__t99e = { mouseoutSortantDuLien: 0, avecFichePourCible: 0 };
    document.addEventListener('mouseout', function(e){
      var t=e.target;
      if(t && t.closest && t.closest('a.bible-ref, span.bible-ref')){
        window.__t99e.mouseoutSortantDuLien++;
        var r=e.relatedTarget;
        if(r && r.closest && (r.closest('#gr-tip')||r.closest('#hb-tip')||r.closest('#lat-tip')||r.closest('#qw-tip')))
          window.__t99e.avecFichePourCible++;
      }
    }, true);
    return true; })()`);

  /* ── B. que fait __placerFiche quand le mot est juste SOUS le lien ? ──
     C'est la configuration dangereuse : le mot est dans le panneau, sous le
     lien. La fiche est placee par rapport au MOT ; si elle choisit « au-dessus »,
     elle atterrit sur le lien. */
  console.log('\n=== B. enumeration des placements de __placerFiche ===');
  const placements = await ev(`(()=>{
    if (typeof window.__placerFiche !== 'function') return {err:'__placerFiche absent'};
    /* On fabrique un mot factice placeholder EN HAUT de l'ecran, la ou la fiche
       n'aura pas la place de passer dessous : le helper devra choisir une autre
       position, possiblement par-dessus des elements situes plus haut. */
    var f=document.createElement('div'); f.id='probe-fiche';
    f.style.cssText='position:fixed;width:300px;height:200px;background:#123;color:#fff;z-index:9500;';
    f.innerHTML='x'.repeat(10);
    document.body.appendChild(f);
    var mot=document.createElement('span'); mot.id='probe-mot';
    mot.style.cssText='position:fixed;left:300px;top:60px;width:40px;height:14px;background:#f00;display:inline-block;z-index:1;';
    document.body.appendChild(mot);
    window.__placerFiche(f, mot);
    var r=f.getBoundingClientRect(), m=mot.getBoundingClientRect();
    var recouvre = !(r.right<=m.left||r.left>=m.right||r.bottom<=m.top||r.top>=m.bottom);
    var out={ pos: f.getAttribute('data-pos'),
              fiche:{l:Math.round(r.left),t:Math.round(r.top),r:Math.round(r.right),b:Math.round(r.bottom)},
              mot:{l:Math.round(m.left),t:Math.round(m.top),r:Math.round(m.right),b:Math.round(m.bottom)},
              recouvreLeMot:recouvre };
    f.remove(); mot.remove();
    return out; })()`);
  console.log('  ' + JSON.stringify(placements));
  ok('1. le placement ne pose JAMAIS la fiche sur son mot',
     placements && placements.recouvreLeMot === false, placements);

  /* ── C. le trajet reel, en visant un mot TRES PROCHE du lien ── */
  console.log('\n=== C. trajet sur un mot proche du lien, avec mesure des mouseout ===');
  await ev(`(()=>{
    var cc=document.getElementById('chat-container') || document.body;
    var old=document.getElementById('banc99e'); if(old) old.remove();
    var h=document.createElement('div'); h.id='banc99e';
    h.style.cssText='position:fixed;left:20px;top:300px;width:400px;z-index:600;background:#fff;color:#111;padding:12px;';
    h.innerHTML='<span class="bible-ref" style="cursor:pointer;">Jean 3:16</span>';
    cc.appendChild(h); return true; })()`);
  const p = await ev(`(()=>{ var e=document.querySelector('#banc99e .bible-ref');
    var r=e.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)}; })()`);
  await bouge(5, 5); await sleep(200);
  await bouge(p.x, p.y); await sleep(3000);

  /* on balaie les mots du panneau et, pour chacun, on va du lien vers le mot
     en notant si un mouseout « dangereux » (cible = fiche) est emis */
  const mots = await ev(`(()=>{ var t=document.getElementById('bible-verse-tip');
    if(!t) return [];
    return Array.prototype.slice.call(t.querySelectorAll('.gr,.hb')).slice(0,6).map(function(m,i){
      var r=m.getBoundingClientRect(); return {i:i, x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)}; }); })()`);
  console.log('  mots visables : ' + mots.length);

  let dangereux = 0, ouvertApres = 0;
  for (const m of mots) {
    await bouge(5, 5); await sleep(200);
    await bouge(p.x, p.y); await sleep(1000);
    await bouge(m.x, m.y); await sleep(700);
    const f = await ev(`(()=>{ var g=document.getElementById('gr-tip'), h=document.getElementById('hb-tip');
      function rect(e){ if(!e||getComputedStyle(e).display!=='block') return null; var r=e.getBoundingClientRect();
        return r.width? {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}:null; }
      return { gr:rect(g), hb:rect(h) }; })()`);
    const cible = f.gr || f.hb;
    if (cible) {
      await bouge(cible.x, cible.y); await sleep(700);
      const encore = await ev(`(()=>{ var t=document.getElementById('bible-verse-tip');
        return t?getComputedStyle(t).display!=='none':null; })()`);
      if (encore) ouvertApres++;
    }
  }
  const t99 = await ev(`window.__t99e`);
  console.log('  ' + JSON.stringify(t99));
  console.log('  mots ou le panneau est reste ouvert : ' + ouvertApres + '/' + mots.length);
  ok('2. aucun mouseout du lien n a eu une fiche pour cible', t99 && t99.avecFichePourCible === 0, t99);
  ok('3. le panneau reste ouvert sur tous les mots testes',
     mots.length > 0 && ouvertApres === mots.length, { ouvertApres: ouvertApres, total: mots.length });

  console.log('\nECHECS = ' + ech + (ech === 0 ? '  -> AUCUNE FRAGILITE DEMONTREE' : ''));
  ws.close(); ch.kill(); srv.close();
})().catch(e => { console.error('ERREUR BANC:', e); process.exit(1); });
