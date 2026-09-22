'use strict';
const http=require('http'),fs=require('fs'),path=require('path'),os=require('os');
const {spawn}=require('child_process');const WebSocket=require('ws');
const PORT=8899,CDP=9439;
const CHROME='C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT=path.resolve(process.env.THEO_WWW||'C:/Theologicus/mobile/www');
const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json','.css':'text/css'};
const PAGE=['index.html','THEOLOGICUS.html'].find(n=>fs.existsSync(path.join(ROOT,n)));
const serve=()=>new Promise(res=>{const s=http.createServer((q,rp)=>{let p=q.url.split('?')[0];if(p==='/')p='/'+PAGE;const f=path.join(ROOT,p);if(!fs.existsSync(f)){rp.writeHead(404);rp.end('4');return;}rp.writeHead(200,{'Content-Type':MIME[path.extname(f).toLowerCase()]||'application/octet-stream'});fs.createReadStream(f).pipe(rp);});s.listen(PORT,'127.0.0.1',()=>res(s));});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{const srv=await serve();const prof=fs.mkdtempSync(path.join(os.tmpdir(),'thp-'));
const ch=spawn(CHROME,['--headless=new','--remote-debugging-port='+CDP,'--user-data-dir='+prof,'--no-first-run','--disable-gpu','--window-size=1200,800','about:blank'],{stdio:'ignore'});
let t=null;for(let i=0;i<60;i++){await sleep(500);try{const l=await(await fetch('http://127.0.0.1:'+CDP+'/json/list')).json();t=l.find(x=>x.type==='page');if(t&&t.webSocketDebuggerUrl)break;}catch(e){}}
const ws=new WebSocket(t.webSocketDebuggerUrl,{perMessageDeflate:false,maxPayload:64*1024*1024});
await new Promise(r=>ws.on('open',r));let id=0;const pend=new Map();
ws.on('message',raw=>{const m=JSON.parse(raw.toString());if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}});
const send=(me,pa)=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method:me,params:pa||{}}));});
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result&&r.result.result?r.result.result.value:undefined;};
await send('Page.enable');await send('Runtime.enable');
await send('Page.navigate',{url:'http://127.0.0.1:'+PORT+'/'+PAGE});await sleep(6000);
const out=await ev(`(function(){
  var res={feuilles:[],trouve:null};
  for(var i=0;i<document.styleSheets.length;i++){
    var ss=document.styleSheets[i];var id=(ss.ownerNode&&ss.ownerNode.id)||'(sans id)';
    var n=0;try{n=ss.cssRules.length;}catch(e){n=-1;}
    res.feuilles.push(id+' : '+n+' regles');
    if(id==='v6-ui-css'){
      var ms=[];
      for(var j=0;j<ss.cssRules.length;j++){
        var r=ss.cssRules[j];
        if(r.type===4) ms.push((r.conditionText||r.media.mediaText)+' ['+r.cssRules.length+' regles]');
      }
      res.trouve={total:ss.cssRules.length,medias:ms};
    }
  }
  var el=document.getElementById('v6-ui-css');
  res.elExiste=!!el;
  res.longueurTexte=el?el.textContent.length:0;
  res.contient901=el?el.textContent.indexOf('min-width:901px')>-1:false;
  res.contient268=el?el.textContent.indexOf('-268px')>-1:false;
  return res;})()`);
console.log('feuilles de style :');out.feuilles.forEach(f=>console.log('   '+f));
console.log('');
console.log('v6-ui-css : '+JSON.stringify(out.trouve,null,0));
console.log('element existe      : '+out.elExiste);
console.log('longueur texte      : '+out.longueurTexte);
console.log('texte contient 901  : '+out.contient901);
console.log('texte contient -268 : '+out.contient268);
ws.close();ch.kill();srv.close();setTimeout(()=>process.exit(0),300);})().catch(e=>{console.log('FATAL '+e.message);process.exit(1);});
