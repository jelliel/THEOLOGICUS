/* v104 — REPRODUIT LA GEOMETRIE DE LA CAPTURE (921x838) :
   panneau du verset hebreu ouvert, survol d'un mot, et on mesure si la
   fiche recouvre le panneau (et qui peint au-dessus au point de recouvrement).

   La capture de l'utilisateur (Screenshot 2026-09-22 204216.png, 921x838)
   montre la fiche #hb-tip qui chevauche le panneau #bible-verse-tip : la
   partie encadree en orange (le panneau) est « derriere » la fiche. On veut
   la fiche placee HORS du panneau, comme le pretendent v101/v102. */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 8894, CDP = 9434;
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
let ech = 0; const ok = (n, c, d) => { if (!c) ech++; console.log((c ? 'OK    ' : 'ECHEC ') + n + (d !== undefined ? '  -> ' + JSON.stringify(d) : '')); };

(async () => {
  const srv = await serve();
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo104-'));
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + prof, '--no-first-run', '--disable-gpu', '--window-size=921,838', 'about:blank'], { stdio: 'ignore' });
  let t = null;
  for (let i = 0; i < 60; i++) { await sleep(500); try { const l = await (await fetch('http://127.0.0.1:' + CDP + '/json/list')).json(); t = l.find(x => x.type === 'page'); if (t && t.webSocketDebuggerUrl) break; } catch (e) {} }
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
  await new Promise(r => ws.on('open', r));
  let id = 0; const pend = new Map();
  ws.on('message', raw => { const m = JSON.parse(raw.toString()); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const send = (me, pa) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  const ev = async e => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return { __err: ((r.result.exceptionDetails.exception || {}).description || '').slice(0, 200) };
    return r.result && r.result.result ? r.result.result.value : undefined;
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 921, height: 838, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' + PAGE });
  await sleep(8000);
  await ev(`(()=>{['auth-overlay','setup-wizard-overlay'].forEach(function(k){var e=document.getElementById(k);if(e)e.remove();});var b=document.getElementById('theo-maj-bandeau');if(b)b.remove();if(window.__theoMaj)window.__theoMaj.verifierEtAfficher=function(){return Promise.resolve(null);};window.__supprBandeau=setInterval(function(){var x=document.getElementById('theo-maj-bandeau');if(x)x.remove();},80);return true;})()`);
  await sleep(600);
  await ev(`(async()=>{try{if(window.__loadBibleNow)window.__loadBibleNow();}catch(e){}
    for(var i=0;i<40;i++){if(window.__corpusReady&&window.__corpusReady.bible)break;await new Promise(r=>setTimeout(r,250));}
    var a=document.createElement('span');a.className='bible-ref';a.textContent='Is 66:24';
    a.style.cssText='position:fixed;left:20px;top:482px;z-index:50000;color:#fff;background:#333;padding:6px;font-size:16px;';
    document.body.appendChild(a);return true;})()`);
  await sleep(1500);

  const b = await ev(`(()=>{var r=document.querySelector('span.bible-ref').getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 300, y: 700, button: 'none' });
  await sleep(150);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: b.x, y: b.y, button: 'none' });
  await sleep(2500);

  const etat0 = await ev(`(()=>{var p=document.getElementById('bible-verse-tip');return{visible:p.style.display==='block',mots:p.querySelectorAll('.hb').length,rect:(function(){var r=p.getBoundingClientRect();return{l:Math.round(r.left),t:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)};})()};})()`);
  console.log('PANNEAU', JSON.stringify(etat0));
  ok('1. panneau ouvert avec mots hebreux', etat0.visible === true && etat0.mots >= 1, etat0);

  const w = await ev(`(()=>{var m=document.querySelector('#bible-verse-tip .hb');var r=m.getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`);
  console.log('WORD coords', JSON.stringify(w), 'elementFromPoint=', await ev(`(function(){var el=document.elementFromPoint(${w.x},${w.y});return el?(el.className||el.id||el.tagName):'null';})()`));
  await ev(`(()=>{window.__log=[];document.addEventListener('mouseout',function(e){window.__log.push('OUT '+(e.target.className||e.target.id||e.target.tagName)+' -> '+(e.relatedTarget?(e.relatedTarget.className||e.relatedTarget.id||e.relatedTarget.tagName):'null'));},true);document.addEventListener('mouseover',function(e){window.__log.push('OVER '+(e.target.className||e.target.id||e.target.tagName));},true);return true;})()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: w.x, y: w.y, button: 'none' });
  await sleep(1500);
  console.log('LOG', JSON.stringify(await ev(`window.__log`)));

  const hote = await ev(`(()=>{
    var p=document.getElementById('bible-verse-tip');
    var mot=document.querySelector('#bible-verse-tip .hb');
    if(!p||!mot) return 'absent';
    var pr=p.getBoundingClientRect(), mr=mot.getBoundingClientRect();
    var dedans = pr.left<=mr.left && pr.right>=mr.right && pr.top<=mr.top && pr.bottom>=mr.bottom;
    return {panneau:{l:Math.round(pr.left),t:Math.round(pr.top),r:Math.round(pr.right),b:Math.round(pr.bottom)},
            mot:{l:Math.round(mr.left),t:Math.round(mr.top),r:Math.round(mr.right),b:Math.round(mr.bottom)},
            motDedansPanneau:dedans, panneauDisplay:p.style.display};
  })()`);
  console.log('HOTE', JSON.stringify(hote));
  const m = await ev(`(()=>{
    var p=document.getElementById('bible-verse-tip');
    var h=document.getElementById('hb-tip');
    var pr=p.getBoundingClientRect(), hr=h.getBoundingClientRect();
    var rec=!(hr.right<=pr.left||hr.left>=pr.right||hr.bottom<=pr.top||hr.top>=pr.bottom);
    // surface de recouvrement
    var ov=0; if(rec){var ww=Math.min(hr.right,pr.right)-Math.max(hr.left,pr.left);var hh=Math.min(hr.bottom,pr.bottom)-Math.max(hr.top,pr.top);ov=ww*hh;}
    var cx=Math.round((Math.max(hr.left,pr.left)+Math.min(hr.right,pr.right))/2);
    var cy=Math.round((Math.max(hr.top,pr.top)+Math.min(hr.bottom,pr.bottom))/2);
    var el=document.elementFromPoint(cx,cy);
    return {panneau:p.style.display, fiche:h.style.display,
            pos:h.getAttribute('data-pos'),
            panneauRect:{l:Math.round(pr.left),t:Math.round(pr.top),w:Math.round(pr.width),h:Math.round(pr.height)},
            ficheRect:{l:Math.round(hr.left),t:Math.round(hr.top),w:Math.round(hr.width),h:Math.round(hr.height)},
            recouvre:rec, surfaceRecouvre:ov,
            hrBottom:Math.round(hr.bottom), prTop:Math.round(pr.top),
            auCentreRecouvre:el?(el.id||el.className||el.tagName):null,
            zPanneau:getComputedStyle(p).zIndex, zFiche:getComputedStyle(h).zIndex};
  })()`);
  console.log('MESURE', JSON.stringify(m, null, 1));
  ok('2. la fiche ne recouvre PAS le panneau (capture v104)', m.recouvre === false, { pos: m.pos, surface: m.surfaceRecouvre });
  ok('3. au point de recouvrement, c est le panneau qui est cache', m.recouvre === false || m.auCentreRecouvre === 'hb-tip', m.auCentreRecouvre);

  /* ══ 4. CAS LIMITE v104 : le panneau est pousse CONTRE LE BAS de l'ecran,
     donc aucune bande libre en dessous, et le mot est au ras du bord. C'est
     exactement la geometrie de la capture (IS 66:24 bas de page). Avant le
     correctif, `hote` pouvait etre null (mot non strictement contenu) et la
     reduction etait sautee -> fiche DESSUS le panneau. On exige 0 recouvrement. */
  await ev(`(()=>{var p=document.getElementById('bible-verse-tip');
    p.style.top=(window.innerHeight-p.offsetHeight-4)+'px';return true;})()`);
  await sleep(300);
  const wb = await ev(`(()=>{var ms=document.querySelectorAll('#bible-verse-tip .hb');var m=ms[ms.length-1];var r=m.getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5, button: 'none' });
  await sleep(200);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: wb.x, y: wb.y, button: 'none' });
  await sleep(1500);
  const mb2 = await ev(`(()=>{
    var p=document.getElementById('bible-verse-tip'); if(p.style.display==='none')return{panneauFerme:true};
    var h=document.getElementById('hb-tip'); if(h.style.display!=='block')return{ficheFermee:true};
    var pr=p.getBoundingClientRect(), hr=h.getBoundingClientRect();
    var rec=!(hr.right<=pr.left||hr.left>=pr.right||hr.bottom<=pr.top||hr.top>=pr.bottom);
    return {pos:h.getAttribute('data-pos'), recouvre:rec,
            panneau:{t:Math.round(pr.top),b:Math.round(pr.bottom)},
            fiche:{t:Math.round(hr.top),b:Math.round(hr.bottom),h:Math.round(hr.height)},
            dansEcran:hr.top>=-1&&hr.bottom<=window.innerHeight+1};
  })()`);
  console.log('CAS LIMITE BAS', JSON.stringify(mb2));
  ok('4. panneau contre le bas : la fiche ne le recouvre pas', mb2 && mb2.recouvre === false, mb2);
  ok('5. la fiche reste entierement dans l ecran', mb2 && mb2.dansEcran === true, mb2);

  ws.close(); ch.kill(); srv.close(); process.exit(ech ? 1 : 0);
})().catch(e => { console.log('CRASH', e); process.exit(1); });
