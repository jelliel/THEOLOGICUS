// Diagnostic v649 — quel element defile, et le scroll declenche-t-il un settle ?
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8950;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

const CHAT = "chat-v649-diag";
const NB_MSG = 60;
const SVG = '<path d="M12 20 C4 13 4 6 9 6 C11 6 12 8 12 8 C12 8 13 6 15 6 C20 6 20 13 12 20 Z" fill="none" stroke="cur" stroke-width="2"/>';
const PAR = [
  "La notion de Kyrios designe la seigneurie divine, et cette designation porte une charge confessionnelle que la Septante avait deja preparee.",
  "Mais avec une hierarchie d economie : le Pere est la source, le Fils est envoye.",
  "Citation cle : Cyrille d Alexandrie, De Adoratione in Spiritu 1.",
];

function chat() {
  const messages = [{ role: "system", content: "sys", ts: 1 }];
  for (let i = 0; i < NB_MSG; i++) {
    const c = [];
    for (let p = 0; p < 6; p++) c.push(PAR[(i + p) % PAR.length]);
    c.push(""); c.push("");
    messages.push({ role: "assistant", content: c.join("\n"), ts: 1796000000000 + i * 1000,
      marks: [], shapes: [{ id: "f-" + i, x: 8, y: 10, w: 420, h: 90, shape: "Rectangle",
        color: "#4f8ef7", weight: 1.4, fill: "", rot: 0, text: "", note: "n", svg: SVG, ancre: null }],
      annotations: [] });
  }
  return { id: CHAT, title: "diag", updated: Date.now(), messages: messages };
}

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
  const browser = await chromium.launch(Object.assign({ args: ["--no-sandbox", "--disable-dev-shm-usage"] },
    process.env.PW_DIR ? { executablePath: CHROME } : {}));
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.addInitScript(() => { try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {} });
  await page.goto(`http://127.0.0.1:${PORT}/blank.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate(async (c) => {
    await new Promise((res2, rej) => {
      const r = indexedDB.open("THEOLOGICUS_AI_DB");
      r.onupgradeneeded = () => { const d = r.result;
        if (!d.objectStoreNames.contains("chats")) d.createObjectStore("chats", { keyPath: "id" });
        if (!d.objectStoreNames.contains("settings")) d.createObjectStore("settings", { keyPath: "id" }); };
      r.onsuccess = () => { const db = r.result; const tx = db.transaction(["chats", "settings"], "readwrite");
        tx.objectStore("chats").put(c); tx.objectStore("settings").put({ id: "currentChatId", value: c.id });
        tx.oncomplete = () => res2(); }; r.onerror = () => rej(r.error); });
    localStorage.setItem("theologicus_chat_" + c.id, JSON.stringify(c));
    localStorage.setItem("currentChatId", c.id); localStorage.setItem("theo_chat_id", c.id);
  }, chat());
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 });
  await page.evaluate(() => {
    const o = document.getElementById("auth-overlay"); if (o) o.remove();
    if (!window.__dw) window.__dw = setInterval(function () {
      const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active"); }, 250);
  });
  await page.evaluate(async (id) => { try { await window.loadChat(id); } catch (e) {} try { window.renderMessages(); } catch (e) {} }, CHAT);
  await page.waitForSelector(".atc-figbox", { state: "attached", timeout: 30000 });
  await page.waitForTimeout(2500);

  // 1. Qui defile ?
  const conteneurs = await page.evaluate(() => {
    const out = [];
    const tous = Array.from(document.querySelectorAll("*"));
    for (const el of tous) {
      if (el.scrollHeight > el.clientHeight + 50) {
        const st = getComputedStyle(el);
        if (/(auto|scroll)/.test(st.overflowY)) {
          out.push({ sel: el.id ? "#" + el.id : (el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : el.tagName),
                     tag: el.tagName, sh: el.scrollHeight, ch: el.clientHeight, top: el.scrollTop });
        }
      }
    }
    return { elements: out.slice(0, 12), nbTotal: out.length,
             docScroll: document.scrollingElement ? document.scrollingElement.tagName : null,
             winSH: document.documentElement.scrollHeight, winCH: document.documentElement.clientHeight };
  });
  console.log("=== CONTENEURS DE DEFILEMENT ===");
  console.log("  document.scrollingElement :", conteneurs.docScroll,
              "| scrollHeight", conteneurs.winSH, "clientHeight", conteneurs.winCH);
  conteneurs.elements.forEach(e => console.log("   " + e.sel + " (" + e.tag + ") sh=" + e.sh + " ch=" + e.ch + " top=" + e.top));

  // 2. Le scroll declenche-t-il un settle ? On compte les rects ET les settles.
  const mesure = await page.evaluate(async () => {
    window.__p = { rect: 0, settle: 0, apply: 0 };
    const orig = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () { window.__p.rect++; return orig.apply(this, arguments); };
    if (typeof window.__atcSettle === "function") {
      const os = window.__atcSettle;
      window.__atcSettle = function () { window.__p.settle++; return os.apply(this, arguments); };
    }
    // Le vrai declencheur interne est `_atcScheduleApply` (closure) : on le
    // detecte par l'effet — un apply qui suit un scroll.
    const sc = document.scrollingElement || document.documentElement;
    const avant = { r: window.__p.rect, s: window.__p.settle };
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) {
      sc.scrollTop = Math.round(sc.scrollHeight * (i + 1) / 12);
      await new Promise(r => setTimeout(r, 150));   // > throttle 120 ms
    }
    return { rect: window.__p.rect - avant.r, settle: window.__p.settle - avant.s,
             duree: Math.round(performance.now() - t0), top: sc.scrollTop };
  });
  console.log("=== SCROLL via document.scrollingElement (10 pas de 150 ms) ===");
  console.log("  scrollTop final        :", mesure.top);
  console.log("  settles observes       :", mesure.settle);
  console.log("  getBoundingClientRect  :", mesure.rect);
  console.log("  duree                  :", mesure.duree + " ms");

  await browser.close(); serveur.close();
})().catch(e => { console.error("PLANTAGE :", e); process.exit(2); });
