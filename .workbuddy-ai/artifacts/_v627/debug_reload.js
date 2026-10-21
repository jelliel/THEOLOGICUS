const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");
const PORT = 8807;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");
const CHAT_ID = "chat-fgl-0001";
const MSG_TS = 1790500000555;
const SHAPE_SVG = '<path d="M12 20 C4 13 4 6 9 6 C11 6 12 8 12 8 C12 8 13 6 15 6 C20 6 20 13 12 20 Z" fill="none" stroke="cur" stroke-width="2"/>';
const CORPS = JSON.stringify({ id: CHAT_ID, model:"mistral", messages:[
  { role:"user", content:"Deux figures.", ts: MSG_TS-1 },
  { role:"assistant", content:"Deux coeurs superposés.", ts: MSG_TS, marks:[], shapes:[
    { id:"fg-1", x:20,y:20,w:160,h:96, shape:"Cœur", color:"#4f8ef7", weight:1.2, fill:"", rot:0, text:"", ancre:null, svg:SHAPE_SVG },
    { id:"fg-2", x:60,y:60,w:160,h:96, shape:"Cœur", color:"#e53935", weight:1.2, fill:"", rot:0, text:"", ancre:null, svg:SHAPE_SVG } ] }
], title:"Banc calques", updated:1, fav:false });
(async () => {
  const serveur = http.createServer((req,res)=>{ let p=decodeURIComponent(req.url.split("?")[0]); if(p==="/")p="/THEOLOGICUS.html"; const fp=path.join(RACINE,p.replace(/^\/+/,"")); if(fs.existsSync(fp)&&fs.statSync(fp).isFile()){res.writeHead(200,{"Content-Type":p.endsWith(".html")?"text/html; charset=utf-8":"application/octet-stream","Cache-Control":"no-store"});fs.createReadStream(fp).pipe(res);}else{res.writeHead(404);res.end("404");} });
  await new Promise(r=>serveur.listen(PORT,"127.0.0.1",r));
  const browser = await chromium.launch(Object.assign({args:["--no-sandbox","--disable-dev-shm-usage"]}, process.env.PW_DIR?{executablePath:CHROME}:{}));
  const ctx = await browser.newContext({viewport:{width:1440,height:900}});
  const page = await ctx.newPage();
  await ctx.addInitScript(({corps,chatId})=>{ try{document.cookie="key_mistral=sk-test; path=/";}catch(e){} try{localStorage.setItem("theo_debug","1");}catch(e){} try{localStorage.setItem("theologicus_wizard_skipped","1");}catch(e){} try{if(!localStorage.getItem("__fgl_seeded")){const c=JSON.parse(corps);localStorage.setItem("theologicus_chat_"+chatId,JSON.stringify(c));localStorage.setItem("theologicus_currentChatId",chatId);localStorage.setItem("__fgl_seeded","1");}}catch(e){} },{corps:CORPS,chatId:CHAT_ID});
  async function diag(label){ const d = await page.evaluate((ts)=>{ let shapes=null, msgCount=null, parseErr=null; try{ const c=JSON.parse(localStorage.getItem("theologicus_chat_chat-fgl-0001")); msgCount=(c.messages||[]).length; const m=(c.messages||[]).find(x=>x.ts===ts); shapes=m?JSON.stringify(m.shapes):"(no msg)"; }catch(e){ parseErr=String(e); } return { cur: localStorage.getItem("theologicus_currentChatId"), hasMC: !!document.getElementById("mc-"+ts), fig: document.querySelectorAll(".atc-figbox").length, wiz: (document.getElementById("setup-wizard-overlay")||{}).className||"(none)", rm: typeof window.renderMessages, msgCount: msgCount, shapes: shapes, parseErr: parseErr }; }, MSG_TS); console.log(label, JSON.stringify(d)); }
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`,{waitUntil:"domcontentloaded",timeout:90000});
  await page.waitForFunction(()=>typeof window.renderMessages==="function",null,{timeout:90000});
  await page.evaluate(()=>{ ["auth-overlay","setup-wizard-overlay"].forEach(id=>{const o=document.getElementById(id);if(o)o.remove();}); });
  await page.waitForFunction((ts)=>!!document.getElementById("mc-"+ts),MSG_TS,{timeout:30000}).catch(()=>{});
  await page.waitForTimeout(500); await diag("AVANT front-click");
  try {
    await page.click('.atc-figbox[data-fig-id="fg-1"] .fb-grip');
    await page.waitForSelector('.fig-tools', { timeout: 5000 });
    await page.click('.fig-tools button[title^="Premier plan"]');
    await page.waitForTimeout(400);
  } catch(e){ console.log("CLICK ERR:", String(e && e.message || e).slice(0,200)); }
  await diag("APRES front-click");
  await page.reload({waitUntil:"domcontentloaded",timeout:90000});
  await page.waitForFunction(()=>typeof window.renderMessages==="function",null,{timeout:90000});
  await page.evaluate(()=>{ ["auth-overlay","setup-wizard-overlay"].forEach(id=>{const o=document.getElementById(id);if(o)o.remove();}); });
  await page.waitForTimeout(2500); await diag("APRES reload (2.5s)");
  await page.waitForTimeout(4000); await diag("APRES reload (6.5s)");
  const errs = [];
  page.on("pageerror", e => errs.push(String(e)));
  console.log("pageerrors:", errs.length ? errs.join(" | ") : "(none)");
  await browser.close(); serveur.close();
})();
