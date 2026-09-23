/* Capture de preuve : le panneau de verset ouvert, la carte de translitteration
   PAR-DESSUS (le defaut encadre en jaune), et la poignee visible. */
'use strict';
const http=require('http'), fs=require('fs'), path=require('path'), os=require('os');
const {spawn}=require('child_process'); const WebSocket=require('ws');
const PORT=8911, CDP=9451;
const CHROME='C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT=path.resolve('C:/Theologicus/mobile/www');
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json','.css':'text/css','.png':'image/png','.ico':'image/x-icon'};
const PAGE='index.html', LARGE=921, HAUT=838;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const serve=()=>new Promise(res=>{const s=http.createServer((q,rp)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/'+PAGE;const f=path.join(ROOT,p);if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){rp.writeHead(404);rp.end('404');return;}rp.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream'});fs.createReadStream(f).pipe(rp);});s.listen(PORT,'127.0.0.1',()=>res(s));});
(async()=>{
  const srv=await serve();
  const prof=fs.mkdtempSync(path.join(os.tmpdir(),'theo-cap-'));
  const ch=spawn(CHROME,['--headless=new','--remote-debugging-port='+CDP,'--user-data-dir='+prof,'--no-first-run','--disable-gpu','--window-size='+LARGE+','+HAUT,'about:blank'],{stdio:'ignore'});
  let t=null;
  for(let i=0;i<60;i++){await sleep(500);try{const l=await(await fetch('http://127.0.0.1:'+CDP+'/json/list')).json();t=l.find(x=>x.type==='page');if(t&&t.webSocketDebuggerUrl)break;}catch(e){}}
  const ws=new WebSocket(t.webSocketDebuggerUrl,{perMessageDeflate:false,maxPayload:64*1024*1024});
  await new Promise(r=>ws.on('open',r));
  let id=0;const pend=new Map();
  ws.on('message',raw=>{const m=JSON.parse(raw.toString());if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}});
  const send=(me,pa)=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method:me,params:pa||{}}));});
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.result&&r.result.exceptionDetails)return{__err:((r.result.exceptionDetails.exception||{}).description||'').slice(0,300)};return r.result&&r.result.result?r.result.result.value:undefined;};
  const souris=async(x,y,type,buttons)=>{await send('Input.dispatchMouseEvent',{type:type||'mouseMoved',x:Math.round(x),y:Math.round(y),button:(type==='mousePressed'||type==='mouseReleased')?'left':'none',buttons:buttons!==undefined?buttons:(type==='mousePressed'?1:0),clickCount:1});};

  await send('Page.enable');await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:LARGE,height:HAUT,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://127.0.0.1:'+PORT+'/'+PAGE});
  await sleep(9000);
  await ev(`(()=>{
    ['auth-overlay','setup-wizard-overlay','welcome-banner','theo-maj-bandeau'].forEach(function(k){var e=document.getElementById(k);if(e)e.remove();});
    if(window.__theoMaj)window.__theoMaj.verifierEtAfficher=function(){return Promise.resolve(null);};
    if(!document.getElementById('v105-bench-css')){var st=document.createElement('style');st.id='v105-bench-css';
      st.textContent='.welcome-banner,.v12-welcome{pointer-events:none !important;visibility:hidden !important;}#theo-maj-bandeau{pointer-events:none !important;visibility:hidden !important;}';
      document.head.appendChild(st);}
    window.__supprBandeau=setInterval(function(){var x=document.getElementById('theo-maj-bandeau');if(x)x.remove();
      document.querySelectorAll('.v12-welcome').forEach(function(e){e.style.pointerEvents='none';e.style.visibility='hidden';});},200);
    return true;})()`);
  await sleep(600);
  await ev(`(async()=>{try{if(window.__loadBibleNow)window.__loadBibleNow();}catch(e){}
    for(var i=0;i<40;i++){if(window.__corpusReady&&window.__corpusReady.bible)break;await new Promise(r=>setTimeout(r,250));}
    var a=document.createElement('span');a.className='bible-ref';a.textContent='Jn 3:16';
    a.style.cssText='position:fixed;left:60px;top:300px;z-index:50000;color:#fff;background:#333;padding:6px;font-size:16px;';
    document.body.appendChild(a);return true;})()`);
  await sleep(1500);
  const b=await ev(`(()=>{var r=document.querySelector('span.bible-ref').getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`);
  await souris(500,700);await sleep(200);await souris(b.x,b.y);await sleep(2500);

  /* On ouvre la carte de translitteration PAR-DESSUS le panneau : c'est le cas
     de la capture utilisateur (encadre jaune). */
  await ev(`(()=>{
    var p=document.getElementById('bible-verse-tip');
    var v=document.getElementById('v37-tip');
    if(!v) return false;
    v.innerHTML='<div class="v37-lang">Hébreu biblique</div>'
      +'<div class="v37-orig" dir="auto">בְּרֵאשִׁית</div>'
      +'<div class="v37-sep"></div><div class="v37-tr">bereshit</div>'
      +'<div class="v37-hint">translittération phonétique</div>';
    var pr=p.getBoundingClientRect();
    v.style.display='block'; v.style.opacity='1'; v.style.transform='none';
    v.style.left=Math.round(pr.left+40)+'px'; v.style.top=Math.round(pr.top+40)+'px';
    v.style.right='auto'; v.style.bottom='auto'; v.style.pointerEvents='auto';
    return true;})()`);
  await sleep(700);
  const r=await send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync('C:/Theologicus/.workbuddy-ai/artifacts/_v105/preuve_carte_devant.png', Buffer.from(r.result.data,'base64'));
  const etat=await ev(`(function(){var v=document.getElementById('v37-tip');var p=document.getElementById('bible-verse-tip');
    var vr=v.getBoundingClientRect();
    var cx=Math.round(vr.left+vr.width/2), cy=Math.round(vr.top+vr.height/2);
    var e=document.elementFromPoint(cx,cy);
    var g=p.querySelector(':scope > .v105-poignee');
    return {zCarte:getComputedStyle(v).zIndex, zPanneau:getComputedStyle(p).zIndex, zFiche:getComputedStyle(document.querySelector('#hb-tip')||document.body).zIndex,
      touche:e?(e.id||String(e.className||'').slice(0,40)):null, dansCarte:!!(e&&e.closest('#v37-tip')),
      poignee:!!g, poigneeRect:(function(){if(!g)return null;var r=g.getBoundingClientRect();return{l:Math.round(r.left),t:Math.round(r.top),w:Math.round(r.width)};})()};})()`);
  console.log(JSON.stringify(etat,null,1));
  try{ws.close();}catch(e){} try{ch.kill();}catch(e){} try{srv.close();}catch(e){}
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
