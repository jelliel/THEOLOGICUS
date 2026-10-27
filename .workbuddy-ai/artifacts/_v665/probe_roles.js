/* Sonde : que voit-on par RÔLE accessible ? (arbre CDP, comme openbot) */
const path=require("path"),http=require("http"),fs=require("fs");
const {chromium}=require("playwright");
const PORT=9452, RACINE=path.resolve(__dirname,"..","..","..");
const ROLES=new Set(["button","checkbox","combobox","link","listbox","menuitem","option","radio","searchbox","slider","spinbutton","switch","tab","textbox","treeitem"]);
(async()=>{
const srv=http.createServer((rq,rs)=>{let p=decodeURIComponent(rq.url.split("?")[0]);if(p==="/")p="/ai-video.html";
 const fp=path.join(RACINE,p.replace(/^\/+/,""));if(fs.existsSync(fp)&&fs.statSync(fp).isFile()){rs.writeHead(200,{"Content-Type":"text/html; charset=utf-8"});fs.createReadStream(fp).pipe(rs);}else{rs.writeHead(404);rs.end("404");}});
await new Promise(r=>srv.listen(PORT,"127.0.0.1",r));
const b=await chromium.launch({executablePath:"C:/Users/toshr/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe",args:["--no-sandbox"]});
const ctx=await b.newContext({viewport:{width:1400,height:950}});
const pg=await ctx.newPage();
await pg.goto(`http://127.0.0.1:${PORT}/ai-video.html`,{waitUntil:"domcontentloaded"});
await pg.waitForTimeout(1500);
const cdp=await ctx.newCDPSession(pg);
await cdp.send("Accessibility.enable");
const {nodes}=await cdp.send("Accessibility.getFullAXTree");
const vus=nodes.filter(n=>n.role&&ROLES.has(n.role.value)&&!n.ignored)
  .map(n=>({role:n.role.value,name:(n.name&&n.name.value||"").trim()}));
console.log("noeuds AX =",nodes.length,"| actionnables non ignores =",vus.length);
console.log("SANS NOM =",vus.filter(v=>!v.name).length);
const parRole={};vus.forEach(v=>parRole[v.role]=(parRole[v.role]||0)+1);
console.log("par role",JSON.stringify(parRole));
console.log("--- 20 premiers nommes ---");
vus.filter(v=>v.name).slice(0,20).forEach(v=>console.log("  ",v.role,"|",JSON.stringify(v.name).slice(0,55)));
for(const [r,n] of [["button","Générer"],["button","Arrêter"],["textbox","clé"],["button","Archives"]]){
  try{console.log("critique",r,n,"->",await pg.getByRole(r,{name:n,exact:false}).count());}catch(e){console.log("critique",r,n,"ERR",String(e.message).slice(0,90));}
}
await b.close();srv.close();
})().catch(e=>{console.error("EX",e);process.exit(2);});
