// Debug rapide : charge le scenario v634 et lit les compteurs _atcDbg.
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");
const PORT = 8891;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");
const MSGTS = 1794000000222;
const SHAPE_SVG = '<path d="M12 20 C4 13 4 6 9 6 C11 6 12 8 12 8 C12 8 13 6 15 6 C20 6 20 13 12 20 Z" fill="none" stroke="cur" stroke-width="2"/>';
const TEXTE = [
  "1. Kyrios comme titre christologique","",
  "**Paul de Tarse** utilise *Kyrios* dans ses epitres pour designer Jesus comme Seigneur, et cette designation porte une charge confessionnelle que la Septante avait deja preparee dans son usage du tetragramme rendu par ho kyrios.",
  "","**Methode** :","  1. Analyser Mar Yah dans les Targums.","  2. Etudier Kyrios dans le NT.","  3. Comparer avec la patristique.","","Le Kyrios est le Seigneur des pauvres, pas des oppresseurs."
].join("\n");
const CHAT = "chat-dbg-v634";

(async () => {
  const serveur = http.createServer((req, rq) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/THEOLOGICUS.html";
    const fp = path.join(SERVI, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      rq.writeHead(200, { "Content-Type": p.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream", "Cache-Control": "no-store" });
      fs.createReadStream(fp).pipe(rq);
    } else { rq.writeHead(404); rq.end("404"); }
  });
  await new Promise(r => serveur.listen(PORT, "127.0.0.1", r));
  const browser = await chromium.launch(Object.assign({ args: ["--no-sandbox", "--disable-dev-shm-usage"] }, process.env.PW_DIR ? { executablePath: CHROME } : {}));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", e => console.log("PAGEERR", String(e && e.message || e)));
  await page.addInitScript(() => { try { localStorage.setItem("theologicus_wizard_skipped","1"); } catch(e){} });
  await page.goto(`http://127.0.0.1:${PORT}/blank.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate(async ({ chatId, texte, msgTs, svg }) => {
    const chat = { id: chatId, title:"dbg", updated:Date.now(), messages:[
      { role:"system", content:"sys", ts:1 },
      { role:"assistant", content:texte, ts:msgTs, annotations:[], marks:[], shapes:[
        { id:"fmulti", x:40, y:120, w:420, h:90, shape:"Rectangle", color:"#4f8ef7", weight:1.2, fill:"", rot:0, text:"", note:"note", svg:svg },
      ] },
    ]};
    await new Promise((res2,rej)=>{ const r=indexedDB.open("THEOLOGICUS_AI_DB");
      r.onupgradeneeded=()=>{const d=r.result; if(!d.objectStoreNames.contains("chats"))d.createObjectStore("chats",{keyPath:"id"}); if(!d.objectStoreNames.contains("settings"))d.createObjectStore("settings",{keyPath:"id"});};
      r.onsuccess=()=>{const db=r.result; const tx=db.transaction(["chats","settings"],"readwrite"); tx.objectStore("chats").put(chat); tx.objectStore("settings").put({id:"currentChatId",value:chatId}); tx.oncomplete=()=>res2(); tx.onerror=()=>rej(tx.error);}; r.onerror=()=>rej(r.error);});
    localStorage.setItem("theologicus_chat_"+chatId, JSON.stringify(chat));
    localStorage.setItem("currentChatId", chatId); localStorage.setItem("theo_chat_id", chatId);
  }, { chatId:CHAT, texte:TEXTE, msgTs:MSGTS, svg:SHAPE_SVG });
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil:"domcontentloaded", timeout:90000 });
  await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 });
  await page.evaluate(() => { const o=document.getElementById("auth-overlay"); if(o)o.remove();
    if(!window.__dw) window.__dw=setInterval(()=>{const w=document.getElementById("setup-wizard-overlay"); if(w)w.classList.remove("active");},250); });
  await page.evaluate(async (id) => { try { await window.loadChat(id); } catch(e){} try { window.renderMessages(); } catch(e){} }, CHAT);
  await page.waitForSelector('.atc-figbox[data-fig-id="fmulti"]', { state:"attached", timeout:20000 });
  for (const ms of [500, 1000, 2000, 4000, 6000]) {
    await page.waitForTimeout(ms === 500 ? 500 : (ms - (ms===1000?500:0)));
    const dbg = await page.evaluate(() => {
      const d = window.__atcDbg ? JSON.parse(JSON.stringify(window.__atcDbg)) : null;
      const fb = document.querySelector('.atc-figbox[data-fig-id="fmulti"]');
      const box = document.querySelector('.message-content');
      let rect = null;
      if (fb && box) { const fr = fb.getBoundingClientRect(), br = box.getBoundingClientRect();
        rect = { l: Math.round(fr.left-br.left), t: Math.round(fr.top-br.top), w: Math.round(fr.width), h: Math.round(fr.height) }; }
      return { dbg: d, rect, boxH: box ? Math.round(box.scrollHeight) : null };
    });
    const ancre = await page.evaluate(async (cid) => {
      const idb = await new Promise((ok)=>{const r=indexedDB.open("THEOLOGICUS_AI_DB"); r.onsuccess=()=>{const db=r.result; const tx=db.transaction(["chats"],"readonly"); const g=tx.objectStore("chats").get(cid); g.onsuccess=()=>ok(g.result||null); g.onerror=()=>ok(null);}; r.onerror=()=>ok(null);});
      const m = idb && idb.messages ? idb.messages.slice(-1)[0].shapes.find(s=>s.id==="fmulti") : null;
      return m && m.ancre ? {start:m.ancre.start,end:m.ancre.end} : null;
    }, CHAT);
    console.log(`t~${ms}ms  dbg=${JSON.stringify(dbg.dbg)}  rect=${JSON.stringify(dbg.rect)}  boxH=${dbg.boxH}  ancre=${JSON.stringify(ancre)}`);
    if (ms === 2000) {
      const probe = await page.evaluate(() => {
        const box = document.querySelector('.message-content');
        const fb = document.querySelector('.atc-figbox[data-fig-id="fmulti"]');
        if (!box || !fb) return 'no box/fb';
        const fr = fb.getBoundingClientRect();
        const br = box.getBoundingClientRect();
        const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, null);
        const nodes = []; let n;
        while ((n = walker.nextNode())) nodes.push(n);
        const info = nodes.slice(0, 8).map(nd => {
          const rng = document.createRange(); rng.selectNodeContents(nd);
          const r = rng.getClientRects()[0];
          if (!r) return { t: nd.textContent.slice(0,12), r: null };
          return { t: nd.textContent.slice(0,12), x: Math.round(r.left-br.left), y: Math.round(r.top-br.top), w: Math.round(r.width), h: Math.round(r.height) };
        });
        return { nNodes: nodes.length, fig: { x: Math.round(fr.left-br.left), y: Math.round(fr.top-br.top), w: Math.round(fr.width), h: Math.round(fr.height) }, premiers: info };
      });
      console.log("   PROBE: " + JSON.stringify(probe));
    }
  }
  await browser.close(); serveur.close(); process.exit(0);
})().catch(e=>{ console.error(e); process.exit(2); });
