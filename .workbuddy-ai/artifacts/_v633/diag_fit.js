// Diagnostic : que lit _ancFit pour une figure semee a (x,y) arbitraire ?
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = 8834;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");
const CHAT = "chat-v633-diag";
const MSGTS = 1790800000222;

const TEXTE = [
  "1. Kyrios comme titre christologique",
  "",
  "**Paul de Tarse** utilise *Kyrios* dans ses epitres pour designer Jesus comme Seigneur.",
  "",
  "**Methode** :",
  "  1. Analyser Mar Yah dans les Targums.",
  "  2. Etudier Kyrios dans le NT.",
  "  3. Comparer avec la patristique.",
  "",
  "Le Kyrios est le Seigneur des pauvres, pas des oppresseurs.",
  "",
  "2. Kyrios et la confession de foi",
].join("\n");

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

  const browser = await chromium.launch(Object.assign({ args: ["--no-sandbox"] },
    process.env.PW_DIR ? { executablePath: CHROME } : {}));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", e => console.log("  [pageerror] " + e.message));
  await page.addInitScript(() => { try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {} });

  await page.goto(`http://127.0.0.1:${PORT}/blank.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate(async ({ chatId, texte, msgTs }) => {
    const chat = { id: chatId, title: "diag", updated: Date.now(), messages: [
      { role: "system", content: "sys", ts: 1 },
      { role: "assistant", content: texte, ts: msgTs, annotations: [], marks: [], shapes: [
        { id: "fsans", x: 0, y: 0, w: 200, h: 60, shape: "Carré", color: "#4f8ef7",
          weight: 1.2, fill: "", rot: 0, text: "", note: "n",
          svg: '<path d="M12 20 C4 13 4 6 9 6 C11 6 12 8 12 8 C12 8 13 6 15 6 C20 6 20 13 12 20 Z" fill="none" stroke="cur" stroke-width="2"/>' },
      ] },
    ] };
    await new Promise((res2, rej) => {
      const r = indexedDB.open("THEOLOGICUS_AI_DB");
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains("chats")) d.createObjectStore("chats", { keyPath: "id" });
        if (!d.objectStoreNames.contains("settings")) d.createObjectStore("settings", { keyPath: "id" });
      };
      r.onsuccess = () => {
        const db = r.result;
        const tx = db.transaction(["chats", "settings"], "readwrite");
        tx.objectStore("chats").put(chat);
        tx.objectStore("settings").put({ id: "currentChatId", value: chatId });
        tx.oncomplete = () => res2(); tx.onerror = () => rej(tx.error);
      };
      r.onerror = () => rej(r.error);
    });
    localStorage.setItem("theologicus_chat_" + chatId, JSON.stringify(chat));
    localStorage.setItem("currentChatId", chatId);
    localStorage.setItem("theo_chat_id", chatId);
  }, { chatId: CHAT, texte: TEXTE, msgTs: MSGTS });

  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 });
  await page.evaluate(() => {
    const o = document.getElementById("auth-overlay"); if (o) o.remove();
    setInterval(function () { const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active"); }, 250);
  });
  await page.evaluate(async (id) => { try { await window.loadChat(id); } catch (e) {} try { window.renderMessages(); } catch (e) {} }, CHAT);
  await page.waitForSelector('.atc-figbox[data-fig-id="fsans"]', { state: "attached", timeout: 20000 });
  await page.waitForTimeout(1500);

  const d = await page.evaluate(() => {
    const fb = document.querySelector('.atc-figbox[data-fig-id="fsans"]');
    const box = document.querySelector(".message-content");
    const c = JSON.parse(localStorage.getItem("theologicus_chat_chat-v633-diag") || "null");
    const sh = c && c.messages.slice(-1)[0].shapes.find(s => s.id === "fsans");
    // etat EN MEMOIRE
    const st = window.__atcState ? window.__atcState() : null;
    let memShape = null;
    try {
      const m0 = st.messages.filter(m => m.role === "assistant").slice(-1)[0];
      memShape = (m0.shapes || []).find(s => s.id === "fsans") || null;
    } catch (e) {}
    // texte canonique
    const nodes = window.__ANC ? window.__ANC.noeuds(box) : [];
    let canon = ""; nodes.forEach(n => canon += n.nodeValue);
    const ancre = sh && sh.ancre ? sh.ancre : null;
    return {
      boxRect: box ? { l: Math.round(box.getBoundingClientRect().left), t: Math.round(box.getBoundingClientRect().top) } : null,
      figRect: fb ? { l: Math.round(fb.getBoundingClientRect().left), t: Math.round(fb.getBoundingClientRect().top), w: Math.round(fb.getBoundingClientRect().width), h: Math.round(fb.getBoundingClientRect().height) } : null,
      style: fb ? { left: fb.style.left, top: fb.style.top, w: fb.style.width, h: fb.style.height } : null,
      ancrePersistee: ancre,
      memShape: memShape ? { x: memShape.x, y: memShape.y, w: memShape.w, h: memShape.h, ancre: memShape.ancre || null } : null,
      canonLen: canon.length,
      canonAtAncre: ancre ? canon.slice(ancre.start, ancre.end) : null,
      txtAtAncre: ancre && ancre.texte ? canon.indexOf(ancre.texte) : -1,
    };
  });
  console.log(JSON.stringify(d, null, 2));
  await browser.close();
  serveur.close();
})();
