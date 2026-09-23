/* QUI referme le panneau quand la souris va de la poignee vers (5,5) ?
   On instrumente les TROIS chemins de fermeture connus (hideTip bible,
   closeTip, hideTip quran/tafsir) et on journalise la pile d'appel. */
'use strict';
const http=require('http'), fs=require('fs'), path=require('path'), os=require('os');
const {spawn}=require('child_process'); const WebSocket=require('ws');
const PORT=8901, CDP=9441;
const CHROME='C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT=path.resolve('C:/Theologicus/mobile/www');
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json','.css':'text/css','.png':'image/png','.ico':'image/x-icon'};
const PAGE='index.html', LARGE=921, HAUT=838;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const serve=()=>new Promise(res=>{const s=http.createServer((q,rp)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/'+PAGE;const f=path.join(ROOT,p);if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){rp.writeHead(404);rp.end('404');return;}rp.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream'});fs.createReadStream(f).pipe(rp);});s.listen(PORT,'127.0.0.1',()=>res(s));});
(async()=>{
  const srv=await serve();
  const prof=fs.mkdtempSync(path.join(os.tmpdir(),'theo-qf-'));
  const ch=spawn(CHROME,['--headless=new','--remote-debugging-port='+CDP,'--user-data-dir='+prof,'--no-first-run','--disable-gpu','--window-size='+LARGE+','+HAUT,'about:blank'],{stdio:'ignore'});
  let t=null;
  for(let i=0;i<60;i++){await sleep(500);try{const l=await(await fetch('http://127.0.0.1:'+CDP+'/json/list')).json();t=l.find(x=>x.type==='page');if(t&&t.webSocketDebuggerUrl)break;}catch(e){}}
  const ws=new WebSocket(t.webSocketDebuggerUrl,{perMessageDeflate:false,maxPayload:64*1024*1024});
  await new Promise(r=>ws.on('open',r));
  let id=0;const pend=new Map();
  ws.on('message',raw=>{const m=JSON.parse(raw.toString());if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}});
  const send=(me,pa)=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method:me,params:pa||{}}));});
  const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.result&&r.result.exceptionDetails)return{__err:((r.result.exceptionDetails.exception||{}).description||'').slice(0,400)};return r.result&&r.result.result?r.result.result.value:undefined;};
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

    /* INSTRUMENTATION : on trace les mutations de style du panneau et les
       evenements qui les precedent. */
    window.__LOG105=[];
    var p=document.getElementById('bible-verse-tip');
    window.__muts=0;
    var mo=new MutationObserver(function(ms){
      ms.forEach(function(m){
        window.__muts++;
        window.__LOG105.push({t:Date.now()%100000, quoi:'MUT', attrs:m.attributeName,
          val:(m.target.style && m.attributeName ? m.target.style.getPropertyValue(m.attributeName) : null),
          pile:(new Error()).stack.split('\n').slice(1,5).map(function(s){return s.trim().slice(0,110);})});
      });
    });
    mo.observe(p,{attributes:true,attributeFilter:['style']});

    ['mouseover','mouseout','pointerover','pointerout','pointerdown','pointerup','click'].forEach(function(k){
      document.addEventListener(k,function(e){
        var tg=e.target;
        var d=tg?(tg.id?('#'+tg.id):(String(tg.className||'').slice(0,30)||tg.tagName)):'?';
        if(/bible-verse-tip|v105|bible-ref|hb-tip/.test(d) || (e.relatedTarget && /bible-verse-tip|v105|bible-ref|hb-tip/.test(String(e.relatedTarget.className||'')+String(e.relatedTarget.id||'')))){
          window.__LOG105.push({t:Date.now()%100000,quoi:k,cible:d,
            rel:e.relatedTarget?(e.relatedTarget.id?('#'+e.relatedTarget.id):(String(e.relatedTarget.className||'').slice(0,30)||e.relatedTarget.tagName)):null});
        }
      },true);
    });
    return true;})()`);
  await sleep(600);
  await ev(`(async()=>{try{if(window.__loadBibleNow)window.__loadBibleNow();}catch(e){}
    for(var i=0;i<40;i++){if(window.__corpusReady&&window.__corpusReady.bible)break;await new Promise(r=>setTimeout(r,250));}
    var a=document.createElement('span');a.className='bible-ref';a.textContent='Is 66:24';
    a.style.cssText='position:fixed;left:20px;top:482px;z-index:50000;color:#fff;background:#333;padding:6px;font-size:16px;';
    document.body.appendChild(a);return true;})()`);
  await sleep(1500);
  const b=await ev(`(()=>{var r=document.querySelector('span.bible-ref').getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`);
  await souris(300,700);await sleep(150);await souris(b.x,b.y);await sleep(3000);

  /* On pose la bulle la ou la poignee est atteignable, puis on va sur la poignee. */
  const pos=await ev(`(async()=>{
    var p=document.getElementById('bible-verse-tip');
    p.style.display='block'; p.style.opacity='1'; p.classList.remove('v105-posee'); p.style.pointerEvents='';
    await new Promise(r=>setTimeout(r,250));
    window.__V105.balayer();
    var g=p.querySelector(':scope > .v105-poignee'); if(g) g.style.opacity='1';
    window.__V105.poser(p, window.innerWidth-380, 90);
    await new Promise(r=>setTimeout(r,140));
    var gr=g.getBoundingClientRect();
    window.__LOG105.length=0;
    return {x:Math.round(gr.left+gr.width/2), y:Math.round(gr.top+gr.height/2)};})()`);

  console.log('--- variante A : depart vers (5,5) SANS toucher la poignee ---');
  await ev('window.__LOG105.length=0; window.__muts=0;');
  await souris(5,5); await sleep(700);
  console.log('A', JSON.stringify(await ev('({muts:window.__muts, etat:(function(){var p=document.getElementById("bible-verse-tip");return{disp:p.style.display,opac:p.style.opacity};})()})')));

  console.log('--- variante B : on repose, on va SUR la poignee, puis on part ---');
  await ev(`(async()=>{var p=document.getElementById('bible-verse-tip');
    p.style.display='block'; p.style.opacity='1'; p.classList.remove('v105-posee'); p.style.pointerEvents='';
    await new Promise(r=>setTimeout(r,250)); window.__V105.balayer();
    var g=p.querySelector(':scope > .v105-poignee'); if(g) g.style.opacity='1';
    window.__V105.poser(p, window.innerWidth-380, 90);
    await new Promise(r=>setTimeout(r,140));
    window.__LOG105.length=0; window.__muts=0; return true;})()`);
  await souris(pos.x, pos.y); await sleep(250);
  console.log('B1 sur la poignee', JSON.stringify(await ev('({muts:window.__muts, etat:(function(){var p=document.getElementById("bible-verse-tip");return{disp:p.style.display,opac:p.style.opacity};})()})')));
  await souris(5,5); await sleep(700);

  const log=await ev(`({log:(window.__LOG105||[]).slice(0,40), muts:window.__muts,
    etat:(function(){var p=document.getElementById('bible-verse-tip');return{disp:p.style.display,opac:p.style.opacity};})()})`);
  console.log(JSON.stringify(log,null,1));
  try{ws.close();}catch(e){} try{ch.kill();}catch(e){} try{srv.close();}catch(e){}
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
