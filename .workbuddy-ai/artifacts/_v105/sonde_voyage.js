/* LE VRAI PARCOURS UTILISATEUR, en coordonnees reelles :
   1. survol de la reference -> le panneau s'ouvre ;
   2. la souris VOYAGE du lien jusqu'a la poignee, par petits pas ;
   3. on tire la poignee.
   Question : a quel pas le panneau meurt-il, et pourquoi ?
   On enregistre, a chaque pas, l'etat du panneau ET ce qui est sous le point. */
'use strict';
const http=require('http'), fs=require('fs'), path=require('path'), os=require('os');
const {spawn}=require('child_process'); const WebSocket=require('ws');
const PORT=8905, CDP=9445;
const CHROME='C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT=path.resolve('C:/Theologicus/mobile/www');
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json','.css':'text/css','.png':'image/png','.ico':'image/x-icon'};
const PAGE='index.html', LARGE=921, HAUT=838;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const serve=()=>new Promise(res=>{const s=http.createServer((q,rp)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/'+PAGE;const f=path.join(ROOT,p);if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){rp.writeHead(404);rp.end('404');return;}rp.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream'});fs.createReadStream(f).pipe(rp);});s.listen(PORT,'127.0.0.1',()=>res(s));});
(async()=>{
  const srv=await serve();
  const prof=fs.mkdtempSync(path.join(os.tmpdir(),'theo-vg-'));
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
    var a=document.createElement('span');a.className='bible-ref';a.textContent='Is 66:24';
    a.style.cssText='position:fixed;left:20px;top:482px;z-index:50000;color:#fff;background:#333;padding:6px;font-size:16px;';
    document.body.appendChild(a);return true;})()`);
  await sleep(1500);

  /* ETAPE 1 : survol REEL de la reference, comme un utilisateur. */
  const refPos=await ev(`(()=>{var r=document.querySelector('span.bible-ref').getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`);
  await souris(300,700); await sleep(200);
  await souris(refPos.x, refPos.y); await sleep(1200);

  const etatApresSurvol=await ev(`(function(){var p=document.getElementById('bible-verse-tip');
    if(!p)return{absent:true}; var r=p.getBoundingClientRect();
    var g=p.querySelector(':scope > .v105-poignee');
    return {disp:p.style.display,opac:p.style.opacity,rect:{l:Math.round(r.left),t:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)},
      poignee:g?(function(){var gr=g.getBoundingClientRect();return{l:Math.round(gr.left),t:Math.round(gr.top),w:Math.round(gr.width),h:Math.round(gr.height)};})():null};})()`);
  console.log('APRES SURVOL REF', JSON.stringify(etatApresSurvol));
  console.log('REF', JSON.stringify(refPos));

  if(!etatApresSurvol || !etatApresSurvol.poignee){console.log('pas de poignee');try{ws.close();ch.kill();srv.close();}catch(e){} return;}

  const P0={x:refPos.x,y:refPos.y};
  const P1={x:Math.round(etatApresSurvol.poignee.l+etatApresSurvol.poignee.w/2), y:Math.round(etatApresSurvol.poignee.t+etatApresSurvol.poignee.h/2)};

  /* ETAPE 2 : voyage par pas de 1/8e, avec mesure apres chaque pas. */
  console.log('VOYAGE de', JSON.stringify(P0), 'vers la poignee', JSON.stringify(P1));
  for(let i=1;i<=8;i++){
    const x=P0.x+(P1.x-P0.x)*i/8, y=P0.y+(P1.y-P0.y)*i/8;
    await souris(x,y); await sleep(120);
    const st=await ev(`(function(){var p=document.getElementById('bible-verse-tip');
      var e=document.elementFromPoint(${Math.round(x)},${Math.round(y)});
      return {disp:p.style.display, sous:(e?(e.id||String(e.className||'').slice(0,36)||e.tagName):null)};})()`);
    console.log('  pas '+i+' ('+Math.round(x)+','+Math.round(y)+')', JSON.stringify(st));
  }

  /* ETAPE 3 : on tente le drag. */
  const st3=await ev(`(function(){var p=document.getElementById('bible-verse-tip');var e=document.elementFromPoint(${P1.x},${P1.y});
    return {disp:p.style.display, sous:(e?(e.id||String(e.className||'').slice(0,36)||e.tagName):null)};})()`);
  console.log('AVANT TIR', JSON.stringify(st3));
  await souris(P1.x,P1.y,'mousePressed',1); await sleep(150);
  for(let i=1;i<=6;i++){await souris(P1.x-120*i/6, P1.y+90*i/6, 'mouseMoved',1); await sleep(70);}
  await souris(P1.x-120, P1.y+90, 'mouseReleased',0); await sleep(500);
  const fin=await ev(`(function(){var p=document.getElementById('bible-verse-tip');var r=p.getBoundingClientRect();
    return {style:{l:p.style.left,t:p.style.top},rect:{l:Math.round(r.left),t:Math.round(r.top)},posee:p.classList.contains('v105-posee'),
      memo:window.__V105.lirePosition('bible-verse-tip')};})()`);
  console.log('APRES TIR', JSON.stringify(fin));
  try{ws.close();}catch(e){} try{ch.kill();}catch(e){} try{srv.close();}catch(e){}
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
