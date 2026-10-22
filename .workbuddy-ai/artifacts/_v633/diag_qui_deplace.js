// Diagnostic : QUI deplace une figure sans ancre ? On observe style.left.
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = 8835;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");
const CHAT = "chat-v633-diag2";

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
  page.on("console", m => { const t = m.text(); if (t.indexOf("[TRACE]") === 0) console.log("  " + t); });
  page.on("pageerror", e => console.log("  [pageerror] " + e.message));
  await page.addInitScript(() => { try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {} });

  await page.goto(`http://127.0.0.1:${PORT}/blank.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate(async ({ chatId, texte }) => {
    const chat = { id: chatId, title: "diag2", updated: Date.now(), messages: [
      { role: "system", content: "sys", ts: 1 },
      { role: "assistant", content: texte, ts: 1790800000333, annotations: [], marks: [], shapes: [
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
  }, { chatId: CHAT, texte: TEXTE });

  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 });
  await page.evaluate(() => {
    const o = document.getElementById("auth-overlay"); if (o) o.remove();
    setInterval(function () { const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active"); }, 250);
  });

  // on arme l'observation AVANT le rendu
  await page.evaluate(() => {
    window.__tr = [];
    const snap = (ou) => {
      const fb = document.querySelector('.atc-figbox[data-fig-id="fsans"]');
      window.__tr.push(ou + " :: " + (fb ? fb.style.left + "/" + fb.style.top + " " + fb.style.width + "x" + fb.style.height : "absent"));
    };
    snap("t0-init");
    const mo = new MutationObserver(() => snap("mutation"));
    const boot = setInterval(() => {
      const fb = document.querySelector('.atc-figbox[data-fig-id="fsans"]');
      if (fb) { clearInterval(boot); mo.observe(fb, { attributes: true, attributeFilter: ["style"] }); snap("attache"); }
    }, 30);
    // on trace les fonctions cles
    const wrap = (nom) => {
      try {
        const f = window[nom];
        if (typeof f !== "function") { window.__tr.push("PAS DE " + nom); return; }
        window[nom] = function () { window.__tr.push("APPEL " + nom); const r = f.apply(this, arguments); window.__tr.push("FIN " + nom); return r; };
      } catch (e) { window.__tr.push("ERREUR wrap " + nom); }
    };
    ["applyShapes", "_ancPlace", "_ancFit"].forEach(wrap);
  });

  await page.evaluate(async (id) => { try { await window.loadChat(id); } catch (e) {} try { window.renderMessages(); } catch (e) {} }, CHAT);
  await page.waitForTimeout(2500);

  const tr = await page.evaluate(() => window.__tr);
  console.log("TRACE :");
  tr.forEach(t => console.log("  " + t));
  await browser.close();
  serveur.close();
})();
