'use strict';
const http=require('http'),fs=require('fs'),path=require('path'),os=require('os');
const {spawn}=require('child_process');const WebSocket=require('ws');
const PORT=8895,CDP=9435;
const CHROME='C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT=path.resolve(process.env.THEO_WWW||'C:/Theologicus/mobile/www');
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json','.css':'text/css','.png':'image/png','.ico':'image/x-icon'};
const PAGE=['index.html','THEOLOGICUS.html'].find(n=>fs.existsSync(path.join(ROOT,n)));
const serve=()=>new Promise(res=>{const s=http.createServer((q,rp)=>{let p=decodeURIComponent(q.url.split('?')[0]);if(p==='/')p='/'+PAGE;const f=path.join(ROOT,p);if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){rp.writeHead(404);rp.end('404');return;}rp.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream'});fs.createReadStream(f).pipe(rp);});s.listen(PORT,'127.0.0.1',()=>res(s));});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
const srv=await serve();
const prof=fs.mkdtempSync(path.join(os.tmpdir(),'theo105-'));
const ch=spawn(CHROME,['--headless=new','--remote-debugging-port='+CDP,'--user-data-dir='+prof,'--no-first-run','--disable-gpu','--window-size=921,838','about:blank'],{stdio:'ignore'});
let t=null;for(let i=0;i<60;i++){await sleep(500);try{const l=await(await fetch('http://127.0.0.1:'+CDP+'/json/list')).json();t=l.find(x=>x.type==='page');if(t&&t.webSocketDebuggerUrl)break;}catch(e){}}
const ws=new WebSocket(t.webSocketDebuggerUrl,{perMessageDeflate:false,maxPayload:64*1024*1024});
await new Promise(r=>ws.on('open',r));
let id=0;const pend=new Map();
ws.on('message',raw=>{const m=JSON.parse(raw.toString());if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}});
const send=(me,pa)=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method:me,params:pa||{}}));});
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.result&&r.result.exceptionDetails)return{__err:((r.result.exceptionDetails.exception||{}).description||'').slice(0,200)};return r.result&&r.result.result?r.result.result.value:undefined;};
await send('Page.enable');await send('Runtime.enable');
await send('Page.navigate',{url:'http://127.0.0.1:'+PORT+'/'+PAGE});
await sleep(8000);
const info=await ev(`(function(){
  var b=document.getElementById('theo-maj-bandeau');
  var out={present:!!b, innerHeight:window.innerHeight, innerWidth:window.innerWidth};
  if(b){var r=b.getBoundingClientRect();out.rect={l:Math.round(r.left),t:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)};out.z=getComputedStyle(b).zIndex;out.pe=getComputedStyle(b).pointerEvents;}
  // tous les elements de premier niveau a z>=9000 et leur rect
  out.hauts=[];
  ['bible-verse-tip','hb-tip','quran-verse-tip','verse-mini-tip','v37-tip','gr-tip','lat-tip','qw-tip','theo-maj-bandeau','atc-bubble','atc-tip'].forEach(function(id){
    var e=document.getElementById(id); if(!e)return; var cs=getComputedStyle(e);
    if(cs.display==='none')return; var r=e.getBoundingClientRect();
    if(r.width<=0||r.height<=0)return;
    out.hauts.push({id:id,z:cs.zIndex,t:Math.round(r.top),b:Math.round(r.bottom),l:Math.round(r.left),rr:Math.round(r.right)});
  });
  return out;
})()`);
console.log(JSON.stringify(info,null,1));
ws.close();ch.kill();srv.close();process.exit(0);
})().catch(e=>{console.log('CRASH',e);process.exit(1);});
