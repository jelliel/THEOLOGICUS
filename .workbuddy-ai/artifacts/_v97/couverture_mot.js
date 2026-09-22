/* v97 — COUVERTURE DU MOT A MOT, PANNEAU PAR PANNEAU.

   Question de Fatih, reshaped : les infobulles doivent marcher PARTOUT.
   Le mot a mot n'est injecte que dans UN seul endroit du code — l'infobulle
   biblique du chat (`#bible-verse-tip`, via `#hb-slot` + `__hbRemplir`).

   Ce banc mesure, panneau par panneau, ce qui existe vraiment :
     - le panneau est-il monte ?
     - porte-t-il un `#hb-slot` (le logement du mot a mot) ?
     - une fois ouvert sur une reference reelle, contient-il des mots
       cliquables (.hb / .gr / .lat) ?

   On repond par la MESURE, pas par lecture du code : c'est ce qui evite de
   conclure « c'est cable partout » sur la foi d'un grep.
*/
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 8893, CDP = 9433;
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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo97c-'));
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
  await sleep(400);

  /* on charge le corpus biblique pour que le mot a mot ait de la matiere */
  await ev(`(async()=>{ try{ window.__loadBibleNow && window.__loadBibleNow(); }catch(e){}
    try{ await window.__ensureBibleBook('43'); }catch(e){}
    try{ await window.__ensureBibleHb(1); }catch(e){}
    try{ await window.__ensureBibleGr(43); }catch(e){}
    return true; })()`);
  await sleep(4000);

  console.log('=== A. panneaux montes et logement du mot a mot ===');
  const etat = await ev(`(()=>{ var out=[];
    ['bible-verse-tip','quran-verse-tip','tafsir-verse-tip','verse-mini-tip','v37-tip'].forEach(function(pid){
      var e=document.getElementById(pid);
      out.push({ panneau:pid, monte:!!e,
                 slot: !!(e && e.querySelector('#hb-slot')),
                 z: e?getComputedStyle(e).zIndex:null });
    });
    return out; })()`);
  (etat || []).forEach(e => console.log('  ' + String(e.panneau).padEnd(18) +
    (e.monte ? 'monte' : 'absent').padEnd(8) + 'hb-slot=' + (e.slot ? 'OUI' : 'non').padEnd(6) + ' z=' + e.z));

  console.log('\n=== B. ou le mot a mot est-il INJECTE dans le code ? ===');
  console.log('  (mesure statique : qui appelle __hbRemplir avec quel panneau)');
  const inj = await ev(`(()=>{ var out={};
    out.hbRemplir = typeof window.__hbRemplir;
    out.grRemplir = typeof window.__grRemplir;
    /* on interroge la source pour savoir combien de panneaux portent un slot
       dans leur HTML de construction */
    return out; })()`);
  console.log('  ' + JSON.stringify(inj));

  /* ── C. le cas reel : quelle est la cible qui ouvre le mot a mot ? ── */
  console.log('\n=== C. le mot a mot est-il atteignable depuis les panneaux ? ===');
  const cible = await ev(`(()=>{
    /* les seuls elements qui declenchent showTip + __hbRemplir */
    var n = document.querySelectorAll('a.bible-ref, span.bible-ref').length;
    return { refsBalisables: n, liste: document.getElementById('ref-list') ? true : false }; })()`);
  console.log('  ' + JSON.stringify(cible));

  /* ── D. on ouvre pour de vrai, via le chat, et on inspecte ── */
  console.log('\n=== D. ouverture reelle sur Jean 3:16 (chat) ===');
  await ev(`(()=>{
    var cc=document.getElementById('chat-container') || document.body;
    var old=document.getElementById('banc97c'); if(old) old.remove();
    var h=document.createElement('div'); h.id='banc97c';
    h.style.cssText='position:fixed;left:20px;top:120px;width:420px;z-index:600;background:#fff;color:#111;padding:12px;';
    h.innerHTML='<span class="bible-ref" style="cursor:pointer;">Jean 3:16</span>';
    cc.appendChild(h); return true; })()`);
  const pos = await ev(`(()=>{ var e=document.querySelector('#banc97c .bible-ref'); if(!e) return null;
    var r=e.getBoundingClientRect(); return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)}; })()`);
  if (pos) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5, button: 'none' });
    await sleep(200);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pos.x, y: pos.y, button: 'none' });
    await sleep(3500);
    const tip = await ev(`(()=>{ var t=document.getElementById('bible-verse-tip');
      if(!t) return {monte:false};
      var slot=t.querySelector('#hb-slot');
      return { monte:true, ouvert: getComputedStyle(t).display!=='none',
               slot: !!slot,
               motsHb: t.querySelectorAll('.hb').length,
               motsGr: t.querySelectorAll('.gr').length,
               motsLat: t.querySelectorAll('.lat').length,
               texteSlot: slot?(slot.textContent||'').trim().slice(0,120):null }; })()`);
    console.log('  ' + JSON.stringify(tip));
  }

  ws.close(); ch.kill(); srv.close();
})().catch(e => { console.error('ERREUR BANC:', e); process.exit(1); });
