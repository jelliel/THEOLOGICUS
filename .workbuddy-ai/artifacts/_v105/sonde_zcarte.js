/* #v37-tip (--z-carte 9800) et les fiches de mot (--z-mot 9500) peuvent-elles
   se RECOUVRIR en usage reel ? Si oui, laquelle doit gagner ?
   On ouvre vraiment une fiche de mot par survol d'un mot hebreu, et la carte
   de translitteration par son propre chemin, puis on mesure le recouvrement. */
'use strict';
const http=require('http'), fs=require('fs'), path=require('path'), os=require('os');
const {spawn}=require('child_process'); const WebSocket=require('ws');
const PORT=8909, CDP=9449;
const CHROME='C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT=path.resolve('C:/Theologicus/mobile/www');
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json','.css':'text/css','.png':'image/png','.ico':'image/x-icon'};
const PAGE='index.html', LARGE=921, HAUT=838;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const serve=()=>new Promise(res=>{const s=http.createServer((q,rp)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/'+PAGE;const f=path.join(ROOT,p);if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){rp.writeHead(404);rp.end('404');return;}rp.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream'});fs.createReadStream(f).pipe(rp);});s.listen(PORT,'127.0.0.1',()=>res(s));});
(async()=>{
  const srv=await serve();
  const prof=fs.mkdtempSync(path.join(os.tmpdir(),'theo-zc-'));
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
    var a=document.createElement('span');a.className='bible-ref';a.textContent='Gn 1:1';
    a.style.cssText='position:fixed;left:20px;top:300px;z-index:50000;color:#fff;background:#333;padding:6px;font-size:16px;';
    document.body.appendChild(a);return true;})()`);
  await sleep(1500);
  const b=await ev(`(()=>{var r=document.querySelector('span.bible-ref').getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`);
  await souris(400,700);await sleep(200);await souris(b.x,b.y);await sleep(2500);

  /* On survole un MOT hebreu pour ouvrir sa fiche, puis on ouvre la carte. */
  const mesure=await ev(`(async()=>{
    var p=document.getElementById('bible-verse-tip');
    var mot=p.querySelector('.hb');
    if(!mot) return {sansMot:true, classes:p.className};
    var mr=mot.getBoundingClientRect();
    /* survol reel du mot */
    mot.dispatchEvent(new MouseEvent('mouseover',{bubbles:true,clientX:mr.left+3,clientY:mr.top+3}));
    await new Promise(r=>setTimeout(r,900));
    var fiche=document.querySelector('#hb-tip');
    /* on ouvre la carte de translitteration par son propre chemin */
    var v=document.getElementById('v37-tip');
    var res=(window.__V37&&window.__V37.translit)?window.__V37.translit('bereshit'):null;
    if(res&&window.__V37.show) window.__V37.show(res,null);
    await new Promise(r=>setTimeout(r,500));
    function boite(e){if(!e)return null;var r=e.getBoundingClientRect();return{l:Math.round(r.left),t:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height),z:getComputedStyle(e).zIndex,disp:getComputedStyle(e).display};}
    var fb=boite(fiche), vb=boite(v);
    var out={fiche:fb, carte:vb};
    if(fb&&vb&&fb.w>0&&vb.w>0){
      var ww=Math.min(fb.l+fb.w,vb.l+vb.w)-Math.max(fb.l,vb.l);
      var hh=Math.min(fb.t+fb.h,vb.t+vb.h)-Math.max(fb.t,vb.t);
      out.recouvrement=(ww>0&&hh>0)?{w:ww,h:hh,aire:ww*hh}:null;
      if(out.recouvrement){
        var cx=Math.round(Math.max(fb.l,vb.l)+ww/2), cy=Math.round(Math.max(fb.t,vb.t)+hh/2);
        var e=document.elementFromPoint(cx,cy);
        out.point={x:cx,y:cy};
        out.touche=e?(e.id||String(e.className||'').slice(0,44)||e.tagName):null;
        out.dansFiche=!!(e&&e.closest&&e.closest('#hb-tip'));
        out.dansCarte=!!(e&&e.closest&&e.closest('#v37-tip'));
      }
    }
    return out;})()`);
  console.log(JSON.stringify(mesure,null,1));
  try{ws.close();}catch(e){} try{ch.kill();}catch(e){} try{srv.close();}catch(e){}
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
