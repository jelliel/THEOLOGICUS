/* Le bouton ✕ (9x9 px) est-il REELLEMENT cliquable, et son clic atteint-il
   `liberer` ? On mesure le rectangle, la cible au centre, et l'effet. */
'use strict';
const http=require('http'), fs=require('fs'), path=require('path'), os=require('os');
const {spawn}=require('child_process'); const WebSocket=require('ws');
const PORT=8907, CDP=9447;
const CHROME='C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT=path.resolve('C:/Theologicus/mobile/www');
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json','.css':'text/css','.png':'image/png','.ico':'image/x-icon'};
const PAGE='index.html', LARGE=921, HAUT=838;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const serve=()=>new Promise(res=>{const s=http.createServer((q,rp)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/'+PAGE;const f=path.join(ROOT,p);if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){rp.writeHead(404);rp.end('404');return;}rp.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream'});fs.createReadStream(f).pipe(rp);});s.listen(PORT,'127.0.0.1',()=>res(s));});
(async()=>{
  const srv=await serve();
  const prof=fs.mkdtempSync(path.join(os.tmpdir(),'theo-x-'));
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
    window.__XLOG=[];
    document.addEventListener('click',function(e){var tg=e.target;
      window.__XLOG.push({cible:tg?(tg.id||String(tg.className||'').slice(0,40)||tg.tagName):null});},true);
    return true;})()`);
  await sleep(600);
  await ev(`(async()=>{try{if(window.__loadBibleNow)window.__loadBibleNow();}catch(e){}
    for(var i=0;i<40;i++){if(window.__corpusReady&&window.__corpusReady.bible)break;await new Promise(r=>setTimeout(r,250));}
    var a=document.createElement('span');a.className='bible-ref';a.textContent='Is 66:24';
    a.style.cssText='position:fixed;left:20px;top:482px;z-index:50000;color:#fff;background:#333;padding:6px;font-size:16px;';
    document.body.appendChild(a);return true;})()`);
  await sleep(1500);
  const b=await ev(`(()=>{var r=document.querySelector('span.bible-ref').getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`);
  await souris(300,700);await sleep(200);await souris(b.x,b.y);await sleep(1500);

  /* On pose la bulle BIEN a l'ecran, poignee comprise. */
  const info=await ev(`(async()=>{
    var p=document.getElementById('bible-verse-tip');
    p.style.display='block'; p.style.opacity='1'; p.style.pointerEvents='';
    window.__V105.poser(p, 200, 200);
    /* On reproduit l'etat LAISSE PAR LE DRAG : .v105-posee et pointer-events:auto. */
    p.classList.add('v105-posee'); p.style.pointerEvents='auto';
    await new Promise(r=>setTimeout(r,250));
    window.__V105.balayer();
    await new Promise(r=>setTimeout(r,150));
    var g=p.querySelector(':scope > .v105-poignee');
    if(!g) return {sansPoignee:true};
    var x=g.querySelector('.v105-x');
    if(!x) return {sansX:true, img:g.innerHTML.slice(0,200)};
    var xr=x.getBoundingClientRect(), gr=g.getBoundingClientRect();
    return {poignee:{l:Math.round(gr.left),t:Math.round(gr.top),w:Math.round(gr.width),h:Math.round(gr.height)},
      x:{l:Math.round(xr.left),t:Math.round(xr.top),w:Math.round(xr.width),h:Math.round(xr.height),
         pe:getComputedStyle(x).pointerEvents}};})()`);
  console.log('INFO', JSON.stringify(info));
  if(info && info.x){
    const cx=Math.round(info.x.l+info.x.w/2), cy=Math.round(info.x.t+info.x.h/2);
    const sous=await ev(`(function(){var e=document.elementFromPoint(${cx},${cy});
      return {i:e?(e.id||String(e.className||'').slice(0,50)||e.tagName):null, estX:!!(e&&e.classList&&e.classList.contains('v105-x'))};})()`);
    console.log('SOUS LE CENTRE DU X', JSON.stringify(sous), 'point', cx, cy);
    await ev('window.__XLOG=[]');
    await souris(cx,cy); await sleep(120);
    await souris(cx,cy,'mousePressed',1); await sleep(120);
    await souris(cx,cy,'mouseReleased',0); await sleep(500);
    const apres=await ev(`(function(){var p=document.getElementById('bible-verse-tip');
      return {left:p.style.left,top:p.style.top,posee:p.classList.contains('v105-posee'),
        memo:window.__V105.lirePosition('bible-verse-tip'), log:window.__XLOG};})()`);
    console.log('APRES CLIC X', JSON.stringify(apres));
  }
  try{ws.close();}catch(e){} try{ch.kill();}catch(e){} try{srv.close();}catch(e){}
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
