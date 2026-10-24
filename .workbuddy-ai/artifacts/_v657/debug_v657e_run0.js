// Debug cible : v657e run 0 (carte inseree a t=100ms) — pourquoi l'ancre diverge.
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");
const PORT = 9731;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");
const MSGTS = 1795000003656;
const SHAPE_SVG = '<path d="M12 20 C4 13 4 6 9 6 C11 6 12 8 12 8 C12 8 13 6 15 6 C20 6 20 13 12 20 Z" fill="none" stroke="cur" stroke-width="2"/>';
const TEXTE = [
  "1. Kyrios comme titre christologique", "",
  "**Paul de Tarse** utilise *Kyrios* dans ses epitres pour designer Jesus comme Seigneur, et cette designation porte une charge confessionnelle que la Septante avait deja preparee.",
  "", "**Methode** : analyser Mar Yah dans les Targums, etudier Kyrios dans le NT, comparer avec la patristique.", "",
  "Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
  "Ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
  "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.",
  "Excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum.",
  "Le Kyrios est le Seigneur des pauvres, pas des oppresseurs.",
].join("\n");
const CHAT = "chat-dbg-v657e-run0";
const INJECT_MS = parseInt(process.env.INJECT_MS || "100", 10);

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
  await page.addInitScript(() => { try { localStorage.setItem("theologicus_wizard_skipped","1"); } catch(e){} try { localStorage.removeItem("theologicus_mssfig_v1"); } catch(e){} });
  await page.goto(`http://127.0.0.1:${PORT}/blank.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate(async ({ chatId, texte, msgTs, svg }) => {
    const chat = { id: chatId, title:"dbg", updated:Date.now(), messages:[
      { role:"system", content:"sys", ts:1 },
      { role:"assistant", content:texte, ts:msgTs, annotations:[], marks:[], shapes:[
        { id:"frace", x:40, y:300, w:420, h:90, shape:"Rectangle", color:"#4f8ef7", weight:1.2, fill:"", rot:0, text:"", note:"note race", svg:svg },
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
  await page.waitForSelector('.atc-figbox[data-fig-id="frace"]', { state:"attached", timeout:20000 });
  // injecter la carte a INJECT_MS
  await page.waitForTimeout(INJECT_MS);
  await page.evaluate(() => {
    const mc = document.querySelector(".message-content");
    const fig = document.createElement("div");
    fig.className = "sim-race-card";
    fig.style.cssText = "display:flex;gap:12px;align-items:flex-start;margin:10px 0 2px;padding:10px;border:1px solid rgba(79,142,247,.25);border-radius:12px;max-width:560px;";
    fig.innerHTML = '<div style="flex:0 0 auto;width:190px;height:170px;background:#0a0f18;border-radius:8px;"></div><div>Carte course (neutre)</div>';
    mc.insertBefore(fig, mc.firstElementChild);
  });
  console.log("carte inseree a t=" + INJECT_MS + "ms");
  // marquer fonts.ready
  await page.evaluate(() => { window.__fontsResolved = false; if (document.fonts && document.fonts.ready) document.fonts.ready.then(()=>{ window.__fontsResolved = true; window.__fontsT = Date.now(); }); });

  let prevFit = 0, prevCardH = -1;
  for (let k = 0; k < 40; k++) {
    await page.waitForTimeout(150);
    const s = await page.evaluate(() => {
      const d = window.__atcDbg ? JSON.parse(JSON.stringify(window.__atcDbg)) : null;
      const fb = document.querySelector('.atc-figbox[data-fig-id="frace"]');
      const box = document.querySelector(".message-content");
      const fr = fb && box ? fb.getBoundingClientRect() : null;
      const br = box ? box.getBoundingClientRect() : null;
      const card = document.querySelector('.theo-fig[data-wiki="simrace"]');
      const cardH = card ? Math.round(card.getBoundingClientRect().height) : null;
      const cardInner = card ? card.innerHTML.length : null;
      return {
        dbg: d,
        fit: d ? d.fit : null,
        fitFail: d ? d.fitFail : null,
        stable: d ? d.stable : null,
        noAncre: d ? d.noAncre : null,
        fonts: document.fonts ? document.fonts.status : "n/a",
        fontsResolved: window.__fontsResolved === true,
        cardH, cardInner,
        fbY: fr && br ? Math.round(fr.top - br.top) : null,
        boxH: box ? Math.round(box.scrollHeight) : null,
      };
    });
    const marqueur = [];
    if (s.fit !== prevFit) marqueur.push(">>> FIT++ (" + s.fit + ")");
    if (s.cardH !== prevCardH) marqueur.push("cardH " + prevCardH + "->" + s.cardH);
    prevFit = s.fit; prevCardH = s.cardH;
    console.log(`t=${(k+1)*150}ms fit=${s.fit} fitFail=${s.fitFail} stable=${s.stable} noAncre=${s.noAncre} fonts=${s.fonts} res=${s.fontsResolved} cardH=${s.cardH} fbY=${s.fbY} boxH=${s.boxH} ${marqueur.join(" ")}`);
    if (k > 0 && s.fit !== null && s.fit > 0) {
      // une fois l'ancre creee, attendre un peu puis lire l'ancre
      if (k >= 8) break;
    }
  }
  const dom = await page.evaluate(() => {
    const mc = document.querySelector(".message-content");
    if (!mc) return "no mc";
    const enfants = Array.from(mc.children).map(c => ({ tag: c.tagName, cls: (c.className||"").toString().slice(0,40), h: Math.round(c.getBoundingClientRect().height) }));
    return { n: enfants.length, enfants };
  });
  console.log("DOM mc: " + JSON.stringify(dom));
  const ancre = await page.evaluate(async (cid) => {
    const idb = await new Promise((ok)=>{const r=indexedDB.open("THEOLOGICUS_AI_DB"); r.onsuccess=()=>{const db=r.result; const tx=db.transaction(["chats"],"readonly"); const g=tx.objectStore("chats").get(cid); g.onsuccess=()=>ok(g.result||null); g.onerror=()=>ok(null);}; r.onerror=()=>ok(null);});
    const m = idb && idb.messages ? idb.messages.slice(-1)[0].shapes.find(s=>s.id==="frace") : null;
    return m && m.ancre ? {start:m.ancre.start,end:m.ancre.end,ow:m.ancre.ow,oh:m.ancre.oh} : null;
  }, CHAT);
  console.log("ANCRE FINALE = " + JSON.stringify(ancre));
  await browser.close(); serveur.close(); process.exit(0);
})().catch(e=>{ console.error(e); process.exit(2); });
