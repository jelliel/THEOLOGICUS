const path=require("path"),http=require("http"),fs=require("fs");
const {chromium}=require("playwright");
const PORT=8870, RACINE="C:/tmp/theoverify";
const PW="C:/Users/toshr/AppData/Local/ms-playwright";
const CHAT="audit-contraste";
(async()=>{
 const s=http.createServer((q,r)=>{let p=decodeURIComponent(q.url.split("?")[0]);if(p==="/")p="/THEOLOGICUS.html";
  const fp=path.join(RACINE,p.replace(/^\/+/,""));
  if(fs.existsSync(fp)&&fs.statSync(fp).isFile()){r.writeHead(200,{"Content-Type":p.endsWith(".html")?"text/html; charset=utf-8":"application/octet-stream","Cache-Control":"no-store"});fs.createReadStream(fp).pipe(r);}
  else{r.writeHead(404);r.end("404");}});
 await new Promise(r=>s.listen(PORT,"127.0.0.1",r));
 const b=await chromium.launch({executablePath:path.join(PW,"chromium-1234","chrome-win64","chrome.exe"),args:["--no-sandbox","--disable-dev-shm-usage"]});
 const c=await b.newContext({viewport:{width:1280,height:820},deviceScaleFactor:1});
 const p=await c.newPage();
 const chat=JSON.stringify({id:CHAT,model:"mistral",title:"Audit",updated:1,fav:false,
  messages:[{role:"user",content:"Question sur la justification.",ts:1790800000000},
            {role:"assistant",content:"La justification est **déclarative** et non infuse.",ts:1790800001000,annotations:[],marks:[]}]});
 await c.addInitScript((e)=>{try{document.cookie="key_mistral=sk-test; path=/";}catch(x){}
  try{if(!localStorage.getItem("__c")){localStorage.setItem("theologicus_chat_audit-contraste",e.chat);
   localStorage.setItem("theologicus_currentChatId","audit-contraste");localStorage.setItem("__c","1");}}catch(x){}},{chat});
 await p.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`,{waitUntil:"domcontentloaded",timeout:90000});
 await p.waitForFunction(()=>typeof window.loadArchiveChat==="function",null,{timeout:90000});
 await p.evaluate(()=>{const o=document.getElementById("auth-overlay");if(o)o.remove();
   const w=document.getElementById("setup-wizard-overlay");if(w)w.classList.remove("active");});
 await p.addStyleTag({content:"#setup-wizard-overlay{display:none !important}"});
 await p.evaluate((id)=>{window.loadArchiveChat(id,-1);},CHAT);
 await p.waitForFunction(()=>document.querySelectorAll("#chat-container .message").length>=2,null,{timeout:60000});
 await p.waitForTimeout(1500);
 const th=await p.evaluate(()=>({theme:document.documentElement.getAttribute("data-theme"),
   bodyBg:getComputedStyle(document.body).backgroundColor,
   msgBg:getComputedStyle(document.querySelector("#chat-container .message.assistant")).backgroundColor,
   msgColor:getComputedStyle(document.querySelector("#chat-container .message.assistant")).color,
   wrapBg:getComputedStyle(document.getElementById("chat-wrap")).backgroundColor}));
 console.log(JSON.stringify(th,null,1));
 await p.screenshot({path:path.join(RACINE,".workbuddy-ai/artifacts/_v126/_presets_bench/apercu_contraste_glass.png")});
 await b.close();s.close();
})();
