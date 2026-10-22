// Diagnostic — le timeout de v627 vient-il de la course du wizard ?
// On rejoue la SEQUENCE EXACTE du banc (suppression du noeud wizard)
// et on observe si le message apparaît, plusieurs fois de suite, à froid.
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = 8898;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

const CHAT_ID = "chat-fgl-0001";
const MSG_TS = 1790500000555;
const SHAPE_SVG = '<path d="M12 20 C4 13 4 6 9 6 C11 6 12 8 12 8 C12 8 13 6 15 6 C20 6 20 13 12 20 Z" fill="none" stroke="cur" stroke-width="2"/>';
const CORPS = JSON.stringify({
  id: CHAT_ID, model: "mistral", messages: [
    { role: "user", content: "Deux figures.", ts: MSG_TS - 1 },
    { role: "assistant", content: "Deux coeurs.", ts: MSG_TS, marks: [], shapes: [
      { id: "fg-1", x: 20, y: 20, w: 160, h: 96, shape: "Coeur", color: "#4f8ef7", weight: 1.2, fill: "", rot: 0, text: "", ancre: null, svg: SHAPE_SVG },
      { id: "fg-2", x: 60, y: 60, w: 160, h: 96, shape: "Coeur", color: "#e53935", weight: 1.2, fill: "", rot: 0, text: "", ancre: null, svg: SHAPE_SVG }
    ] }
  ], title: "Banc calques", updated: 1, fav: false,
});

// VARIANTE : "supprime" = supprime le noeud wizard (ce que fait v627),
//            "garde"   = ne touche pas au noeud (desarmement seul).
const VARIANTE = process.env.VARIANTE || "supprime";
const ESSAIS = parseInt(process.env.ESSAIS || "6", 10);

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
  const browser = await chromium.launch(Object.assign({ args: ["--no-sandbox", "--disable-dev-shm-usage"] }, process.env.PW_DIR ? { executablePath: CHROME } : {}));

  let echecs = 0;
  for (let n = 1; n <= ESSAIS; n++) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on("pageerror", e => errs.push(String(e && e.message || e)));

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

    const t0 = Date.now();
    let verdict;
    try {
      await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 });
      await page.evaluate((supprime) => {
        const o = document.getElementById("auth-overlay"); if (o) o.remove();
        window.__disarmTimer = setInterval(function () {
          const w = document.getElementById("setup-wizard-overlay");
          if (w) w.classList.remove("active");
        }, 300);
        if (supprime) {
          document.querySelectorAll(".setup-wizard-overlay, .onboarding-overlay, #setup-wizard-overlay")
            .forEach(function (o2) { o2.remove(); });
        }
      }, VARIANTE === "supprime");
      await page.waitForFunction((ts) => !!document.getElementById("mc-" + ts), MSG_TS, { timeout: 45000 });
      const nf = await page.evaluate(() => document.querySelectorAll(".atc-figbox").length);
      verdict = "OK figbox=" + nf + " ms=" + (Date.now() - t0);
    } catch (e) {
      echecs++;
      const diag = await page.evaluate((ts) => ({
        msg: document.querySelectorAll(".message").length,
        ids: Array.from(document.querySelectorAll('[id^="mc-"]')).map(e => e.id).slice(-4),
        cur: (function () { try { return localStorage.getItem("theologicus_currentChatId"); } catch (e) { return null; } })(),
        overlay: !!document.getElementById("setup-wizard-overlay"),
      }), MSG_TS).catch(() => ({ err: "evaluate impossible" }));
      verdict = "ECHEC " + String(e && e.message || e).split("\n")[0] + " diag=" + JSON.stringify(diag);
    }
    console.log(`#${n} [${VARIANTE}] ${verdict}  pageerrors=${errs.length} ${errs.length ? JSON.stringify(errs.slice(0,2)) : ""}`);
    await ctx.close();
  }
  await browser.close();
  serveur.close();
  console.log(`BILAN [${VARIANTE}] : ${echecs}/${ESSAIS} echec(s)`);
})();
