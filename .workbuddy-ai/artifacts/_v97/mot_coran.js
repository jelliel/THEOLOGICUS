/* v97 — LES PANNEAUX CORAN/TAFSIR ONT-ILS LE MOT A MOT ?

   Mesure decisive. `#hb-slot` n'existe dans le HTML QUE du panneau biblique
   (l. 20474). Le Coran a son propre panneau (`#quran-verse-tip`) et le Tafsir
   le sien (`#tafsir-verse-tip`), construits ailleurs.

   Question : quand on survole une reference coranique, le panneau s'ouvre-t-il
   avec ou sans la ligne de mots cliquables ? On mesure, on ne suppose pas.
*/
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 8892, CDP = 9432;
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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo97q-'));
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

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' + PAGE });
  await attendre(`!!document.getElementById('chat-container')`, 30000);
  await sleep(1500);
  await ev(`(()=>{ ['auth-overlay','setup-wizard-overlay'].forEach(function(k){var e=document.getElementById(k); if(e)e.remove();}); return true; })()`);

  /* corpus coran + tafsir + mot a mot coranique */
  await ev(`(async()=>{ try{ window.__loadQuranNow && window.__loadQuranNow(); }catch(e){}
    try{ window.__loadTafsirNow && window.__loadTafsirNow(); }catch(e){}
    try{ await window.__ensureQuranSurah(1); }catch(e){}
    try{ await window.__ensureTafsirSurah(1); }catch(e){}
    try{ await window.__ensureQuranWbw(1); }catch(e){}
    return true; })()`);
  await sleep(5000);

  console.log('=== panneaux coran/tafsir : mot a mot present ? ===');
  const etat = await ev(`(()=>{ var out=[];
    ['quran-verse-tip','tafsir-verse-tip'].forEach(function(pid){
      var e=document.getElementById(pid);
      out.push({ panneau:pid, monte:!!e,
                 slotQw: !!(e && e.querySelector('#qw-slot')),
                 slotHb: !!(e && e.querySelector('#hb-slot')),
                 z: e?getComputedStyle(e).zIndex:null });
    });
    out.push({ qwMots: typeof window.__qwMots, qwRemplir: typeof window.__qwRemplir,
               qwCorpus: !!(window.__quranWbw || window.__quranWBW) });
    return out; })()`);
  (etat || []).forEach(e => console.log('  ' + JSON.stringify(e)));

  console.log('\n=== ouverture reelle sur une reference CORANIQUE ===');
  await ev(`(()=>{
    var cc=document.getElementById('chat-container') || document.body;
    var old=document.getElementById('banc97q'); if(old) old.remove();
    var h=document.createElement('div'); h.id='banc97q';
    h.style.cssText='position:fixed;left:20px;top:120px;width:420px;z-index:600;background:#fff;color:#111;padding:12px;';
    h.innerHTML='<span class="quran-ref" style="cursor:pointer;">Sourate 1:1</span>';
    cc.appendChild(h); return true; })()`);
  const pos = await ev(`(()=>{ var e=document.querySelector('#banc97q .quran-ref'); if(!e) return null;
    var r=e.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2), txt:e.textContent.trim()}; })()`);
  console.log('  cible -> ' + JSON.stringify(pos));
  if (pos) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5, button: 'none' });
    await sleep(200);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x, y: pos.y, button: 'none' });
    await sleep(4000);
    const tip = await ev(`(()=>{ var t=document.getElementById('quran-verse-tip');
      if(!t) return {monte:false};
      return { monte:true, ouvert: getComputedStyle(t).display!=='none',
               z: getComputedStyle(t).zIndex,
               mots: t.querySelectorAll('.qw, .ar, .mot').length,
               classesMots: Array.from(new Set(Array.prototype.slice.call(t.querySelectorAll('span[class]'),0,40).map(function(s){return s.className;}))).join(' | '),
               texte: (t.textContent||'').replace(/\\s+/g,' ').trim().slice(0,160) }; })()`);
    console.log('  ' + JSON.stringify(tip, null, 1));
  }

  /* et le tafsir */
  console.log('\n=== ouverture reelle sur une reference TAFSIR ===');
  await ev(`(()=>{ var e=document.querySelector('#banc97q .quran-ref'); if(e){ e.className='tafsir-ref'; e.textContent='Tafsir Ibn Kathir 1:1'; } return true; })()`);
  const pos2 = await ev(`(()=>{ var e=document.querySelector('#banc97q .tafsir-ref'); if(!e) return null;
    var r=e.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2), txt:e.textContent.trim()}; })()`);
  console.log('  cible -> ' + JSON.stringify(pos2));
  if (pos2) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5, button: 'none' });
    await sleep(200);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos2.x, y: pos2.y, button: 'none' });
    await sleep(4000);
    const tip2 = await ev(`(()=>{ var t=document.getElementById('tafsir-verse-tip');
      if(!t) return {monte:false};
      return { monte:true, ouvert: getComputedStyle(t).display!=='none', z:getComputedStyle(t).zIndex,
               mots: t.querySelectorAll('.qw, .ar, .mot').length,
               texte: (t.textContent||'').replace(/\\s+/g,' ').trim().slice(0,140) }; })()`);
    console.log('  ' + JSON.stringify(tip2, null, 1));
  }

  ws.close(); ch.kill(); srv.close();
})().catch(e => { console.error('ERREUR BANC:', e); process.exit(1); });
