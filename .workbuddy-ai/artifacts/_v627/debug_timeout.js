// Diagnostic — pourquoi le banc v627 ne voit jamais #mc-<ts> ?
// Aucun jugement de résultat : on observe et on imprime.
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = 8899;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

const CHAT_ID = "chat-fgl-0001";
const MSG_TS = 1790500000555;
const SHAPE_SVG = '<path d="M12 20 C4 13 4 6 9 6 C11 6 12 8 12 8 C12 8 13 6 15 6 C20 6 20 13 12 20 Z" fill="none" stroke="cur" stroke-width="2"/>';
const CORPS = JSON.stringify({
  id: CHAT_ID, model: "mistral", messages: [
    { role: "user", content: "Deux figures.", ts: MSG_TS - 1 },
    {
      role: "assistant", content: "Deux coeurs superposes.", ts: MSG_TS, marks: [], shapes: [
        { id: "fg-1", x: 20, y: 20, w: 160, h: 96, shape: "Coeur", color: "#4f8ef7", weight: 1.2, fill: "", rot: 0, text: "", ancre: null, svg: SHAPE_SVG },
        { id: "fg-2", x: 60, y: 60, w: 160, h: 96, shape: "Coeur", color: "#e53935", weight: 1.2, fill: "", rot: 0, text: "", ancre: null, svg: SHAPE_SVG }
      ]
    }
  ], title: "Banc calques", updated: 1, fav: false,
});

(async () => {
  const serveur = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/THEOLOGICUS.html";
    const fp = path.join(SERVI, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      res.writeHead(200, { "Content-Type": p.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream", "Cache-Control": "no-store" });
      fs.createReadStream(fp).pipe(res);
    } else { res.writeHead(404); res.end("404"); }
  });
  await new Promise(r => serveur.listen(PORT, "127.0.0.1", r));

  const browser = await chromium.launch(Object.assign({ args: ["--no-sandbox", "--disable-dev-shm-usage"] }, process.env.PW_DIR ? { executablePath: CHROME } : {}));
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", e => erreurs.push(String(e)));
  page.on("console", m => { if (m.type() === "error") erreurs.push("console: " + m.text()); });

  await ctx.addInitScript(({ corps, chatId }) => {
    try { document.cookie = "key_mistral=sk-test-fgl; path=/"; } catch (e) {}
    try { localStorage.setItem("theo_debug", "1"); } catch (e) {}
    try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {}
    try {
      if (!localStorage.getItem("__fgl_seeded")) {
        const c = JSON.parse(corps);
        localStorage.setItem("theologicus_chat_" + chatId, JSON.stringify(c));
        localStorage.setItem("theologicus_currentChatId", chatId);
        localStorage.setItem("__fgl_seeded", "1");
      }
    } catch (e) {}
  }, { corps: CORPS, chatId: CHAT_ID });

  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 });
  console.log("renderMessages present");

  await page.evaluate(() => {
    const o = document.getElementById("auth-overlay"); if (o) o.remove();
    window.__disarmTimer = setInterval(function () {
      const w = document.getElementById("setup-wizard-overlay");
      if (w) w.classList.remove("active");
    }, 300);
  });

  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(1000);
    const etat = await page.evaluate((ts) => {
      const msgs = document.querySelectorAll(".message");
      const ids = [];
      document.querySelectorAll('[id^="mc-"]').forEach(function (e) { ids.push(e.id); });
      return {
        msgCount: msgs.length,
        ids: ids.slice(-6),
        cible: !!document.getElementById("mc-" + ts),
        figbox: document.querySelectorAll(".atc-figbox").length,
        theoFig: document.querySelectorAll(".theo-fig").length,
        chatWrap: !!document.getElementById("chat-wrap"),
        curChat: (function () { try { return localStorage.getItem("theologicus_currentChatId"); } catch (e) { return null; } })(),
        lsKeys: (function () {
          try { return Object.keys(localStorage).filter(function (k) { return k.indexOf("theologicus_chat") === 0; }).length; }
          catch (e) { return -1; }
        })(),
      };
    }, MSG_TS);
    console.log(`t=${i + 1}s ` + JSON.stringify(etat));
    if (etat.cible) break;
  }

  console.log("ERREURS: " + JSON.stringify(erreurs.slice(0, 8), null, 1));
  await browser.close();
  serveur.close();
})();
