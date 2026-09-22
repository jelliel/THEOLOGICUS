/* v102 — POURQUOI le repli ne se declenche pas sur fenetre etroite.

   Corrige un defaut du premier jet de ce banc : il appelait __placerFiche sur
   une page ou AUCUN panneau n'etait ouvert. `hote` valait donc `null`, les
   quatre candidats exterieurs n'etaient meme pas construits, et la mesure
   tombait sur une fiche a 0x0. On mesurait le vide.

   Ici on ouvre REELLEMENT le panneau du verset avant chaque essai, a chaque
   taille de fenetre, et on lit la geometrie reelle.

   Objectif : savoir si le repli de hauteur (bande libre >= 140 px) peut
   sauver les fenetres etroites, ou s'il faut un autre mecanisme.
*/
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 8898, CDP = 9438;
const CHROME = 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(process.env.THEO_WWW || 'C:/Theologicus/_inst_v101');
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

(async () => {
  const srv = await serve();
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo102b-'));
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
    if (r.result && r.result.exceptionDetails) return { __err: ((r.result.exceptionDetails.exception || {}).description || '').slice(0, 500) };
    return r.result && r.result.result ? r.result.result.value : undefined;
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/THEOLOGICUS.html' });
  await sleep(9000);
  await ev(`(()=>{ ['auth-overlay','setup-wizard-overlay'].forEach(function(k){var e=document.getElementById(k); if(e)e.remove();});
    Array.prototype.forEach.call(document.querySelectorAll('.wizard-step'),function(e){e.remove();}); return true; })()`);
  await sleep(500);

  /* l'app est chargee au bureau : on injecte la reference une seule fois,
     elle survit aux changements de metriques. */
  await ev(`(async()=>{ await window.__ensureBibleBook('MAT');
    var cc=document.getElementById('chat-container') || document.body;
    var host=document.createElement('div'); host.id='banc';
    host.style.cssText='position:fixed;left:20px;top:70px;width:520px;z-index:500;background:#fff;color:#111;padding:12px;';
    host.innerHTML='<span class="bible-ref" style="cursor:pointer;">Mt 5:22</span>';
    cc.appendChild(host); return true; })()`);
  const ref = await ev(`(()=>{ var e=document.querySelector('#banc .bible-ref'); var r=e.getBoundingClientRect();
    return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)}; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 900, y: 700, button: 'none' });
  await sleep(200);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: ref.x, y: ref.y, button: 'none' });
  await sleep(3500);

  for (const [w, h] of [[984, 765], [784, 705], [584, 605], [500, 665]]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await sleep(900);
    /* le panneau s'est peut-etre referme au changement de metriques : le rouvrir */
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 900, y: 700, button: 'none' });
    await sleep(150);
    const r2 = await ev(`(()=>{ var e=document.querySelector('#banc .bible-ref'); if(!e) return null; var r=e.getBoundingClientRect();
      return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)}; })()`);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r2.x, y: r2.y, button: 'none' });
    await sleep(3000);

    const diag = await ev(`(()=>{
      var p=document.getElementById('bible-verse-tip'), f=document.getElementById('gr-tip');
      var ouvert = !!(p && p.style.display==='block' && p.getBoundingClientRect().width>0);
      if(!ouvert) return {err:'le panneau n est pas ouvert', display:p?p.style.display:null};
      if(!f) return {err:'pas de fiche #gr-tip'};

      var mot=p.querySelectorAll('.gr')[0];
      var mr=mot?mot.getBoundingClientRect():null;

      f.style.maxHeight='';
      /* le VRAI mot, celui sur lequel l utilisateur pose la souris */
      var res = mot ? window.__placerFiche(f, mot) : null;
      var fr=f.getBoundingClientRect();
      var pr=p.getBoundingClientRect();
      function aire(a,b){ var w=Math.min(a.right,b.right)-Math.max(a.left,b.left),
        h=Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top); return (w>0&&h>0)?Math.round(w*h):0; }

      var MARGE=8, ECART=6, vw=window.innerWidth, vh=window.innerHeight;
      var bandes={ haut: Math.round(pr.top-MARGE-ECART),
                   bas:  Math.round((vh-MARGE-ECART)-pr.bottom),
                   gauche: Math.round(pr.left-MARGE-ECART),
                   droite: Math.round((vw-MARGE-ECART)-pr.right) };
      var maxBande=Math.max(bandes.haut,bandes.bas,bandes.gauche,bandes.droite);

      return { vw:vw, vh:vh, pos:f.getAttribute('data-pos'), retour:res,
               fiche:{l:Math.round(fr.left),t:Math.round(fr.top),w:Math.round(fr.width),h:Math.round(fr.height)},
               panneau:{l:Math.round(pr.left),t:Math.round(pr.top),w:Math.round(pr.width),h:Math.round(pr.height)},
               recouvrement: aire(fr,pr),
               mot: mr?{l:Math.round(mr.left),t:Math.round(mr.top)}:null,
               maxH:getComputedStyle(f).maxHeight, bandes:bandes, maxBande:maxBande,
               surfacePanneau: Math.round(pr.width*pr.height) };
    })()`);

    console.log('\n########## ' + w + 'x' + h + ' ##########');
    console.log(JSON.stringify(diag, null, 1));
  }
  await send('Emulation.clearDeviceMetricsOverride');
  ws.close(); ch.kill(); srv.close();
  process.exit(0);
})().catch(e => { console.error('ERREUR BANC:', e); process.exit(1); });
