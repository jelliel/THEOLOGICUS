// Diagnostic v633 — les figures PERSISTEES ont-elles perdu w/h ?
// On seme un chat comme le vrai store, avec des figures portant ancre mais SANS
// w/h (cas probable apres un cycle save/restore), puis on observe ce qui est
// rendu et ce qui est re-sauvegarde.
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = 8904;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

const CHAT = "chat-diag-0004";
const MSGTS = 1790700000444;
const TEXTE = "**Paul de Tarse** utilise *Kyrios* pour designer Jesus comme Seigneur, titre reserve a YHHW.";
const SVG = '<path d="M4 4 L20 20" fill="none" stroke="cur" stroke-width="2"/>';

// Trois figures : (A) complete, (B) SANS w/h, (C) w/h a 0
const SHAPES = [
  { id: "ok", x: 30, y: 30, w: 200, h: 76, shape: "Rectangle", color: "#4f8ef7", weight: 1.2, fill: "", rot: 0, svg: SVG, text: "" },
  { id: "sans-wh", x: 30, y: 130, shape: "Rectangle", color: "#f9a825", weight: 1.2, fill: "", rot: 0, svg: SVG, text: "" },
  { id: "zero-wh", x: 30, y: 230, w: 0, h: 0, shape: "Rectangle", color: "#e53935", weight: 1.2, fill: "", rot: 0, svg: SVG, text: "" },
];

(async () => {
  const serveur = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/THEOLOGICUS.html";
    const fp = path.join(RACINE, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      res.writeHead(200, { "Content-Type": p.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream", "Cache-Control": "no-store" });
      fs.createReadStream(fp).pipe(res);
    } else { res.writeHead(404); res.end("404"); }
  });
  await new Promise(r => serveur.listen(PORT, "127.0.0.1", r));
  const browser = await chromium.launch(Object.assign({ args: ["--no-sandbox", "--disable-dev-shm-usage"] },
    process.env.PW_DIR ? { executablePath: CHROME } : {}));
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(String(e && e.message || e)));
  await page.addInitScript(() => { try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {} });

  await page.goto(`http://127.0.0.1:${PORT}/blank.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate(async ({ chatId, texte, msgTs, shapes }) => {
    const chat = { id: chatId, title: "Diag", updated: Date.now(), messages: [
      { role: "system", content: "sys", ts: 1 },
      { role: "assistant", content: texte, ts: msgTs, annotations: [], marks: [], shapes: shapes },
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
  }, { chatId: CHAT, texte: TEXTE, msgTs: MSGTS, shapes: SHAPES });

  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 });
  await page.evaluate(() => {
    const o = document.getElementById("auth-overlay"); if (o) o.remove();
    window.__d = setInterval(function () { const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active"); }, 250);
  });
  await page.evaluate(async (id) => { try { await window.loadChat(id); } catch (e) {} try { window.renderMessages(); } catch (e) {} }, CHAT);
  await page.waitForTimeout(2000);

  const out = await page.evaluate(({ msgTs, chatId }) => {
    const box = document.getElementById("mc-" + msgTs);
    const rendus = Array.from(document.querySelectorAll(".atc-figbox")).map(function (e) {
      const cs = getComputedStyle(e), r = e.getBoundingClientRect();
      return { id: e.dataset.figId,
               inlineW: e.style.width, inlineH: e.style.height,
               renduW: Math.round(r.width), renduH: Math.round(r.height),
               l: e.style.left, t: e.style.top };
    });
    let persiste = null;
    try {
      const ls = localStorage.getItem("theologicus_chat_" + chatId);
      if (ls) persiste = JSON.parse(ls).messages.slice(-1)[0].shapes.map(function (s) {
        return { id: s.id, x: s.x, y: s.y, w: s.w, h: s.h, hasAncre: !!s.ancre };
      });
    } catch (e) {}
    return { rendus: rendus, persiste: persiste, existsBox: !!box };
  }, { msgTs: MSGTS, chatId: CHAT });

  console.log(JSON.stringify(out, null, 1));
  console.log("ERREURS JS:", JSON.stringify(errs.slice(0, 4)));
  await browser.close();
  serveur.close();
})();
