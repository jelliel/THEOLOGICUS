// Banc v625 — NON-RÉGRESSION du throttle MutationObserver (setTimeout 60ms -> rAF).
//
// Le observer sur `cc` appelle applyHighlights/applyMarks/applyShapes. La
// coalescence passe de setTimeout(60) à requestAnimationFrame. Le comportement
// observable (les figures/surlignages sont (ré)appliqués après une mutation du
// DOM) doit rester IDENTIQUE. Ce banc garde ça :
//   1. seed d'une figure (heart) -> applyShapes la rend au chargement.
//   2. on VIDE le conteneur de figures puis on provoque une mutation dans cc
//      (append d'un noeud) -> le observer DOIT se ré-déclencher et re-rendre
//      la figure. Si le refactor avait cassé le observer (erreur/var indéfinie),
//      la figure NE reviendrait PAS.
//   3. aucune erreur JS.

const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8799;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

const CHAT_ID = "chat-raf-0001";
const MSG_TS = 1790500000999;
const SHAPE_SVG = '<path d="M12 20 C4 13 4 6 9 6 C11 6 12 8 12 8 C12 8 13 6 15 6 C20 6 20 13 12 20 Z" fill="none" stroke="cur" stroke-width="2"/>';
const CORPS = JSON.stringify({
  id: CHAT_ID, model: "mistral", messages: [
    { role: "user", content: "Montre une figure.", ts: MSG_TS - 1 },
    {
      role: "assistant", content: "Voici un coeur.", ts: MSG_TS, marks: [], shapes: [
        { id: "fg-1", x: 20, y: 20, w: 160, h: 96, shape: "Cœur", color: "#4f8ef7", weight: 1.2, fill: "", rot: 0, text: "", ancre: null, svg: SHAPE_SVG }
      ]
    }
  ], title: "Banc rAF", updated: 1, fav: false,
});

const resultats = [];
function ok(nom, cond, detail) {
  resultats.push([!!cond, nom, detail === undefined ? "" : String(detail)]);
  console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`);
  return !!cond;
}

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v625 — THROTTLE MutationObserver -> rAF (non-régression)");
  console.log("=".repeat(72));
  if (SERVI !== RACINE) console.log(`  [info] copie servie (contrôle négatif) : ${SERVI}`);

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

  await ctx.addInitScript(({ corps, chatId }) => {
    try { document.cookie = "key_mistral=sk-test-mistral-raf; path=/"; } catch (e) {}
    try { localStorage.setItem("theo_debug", "1"); } catch (e) {}
    try {
      window.__diagLog = [];
      const _cl = console.log.bind(console);
      console.log = function () { try { window.__diagLog.push(Array.prototype.map.call(arguments, String).join(' ')); } catch (e) {} return _cl.apply(null, arguments); };
    } catch (e) {}
    try {
      if (!localStorage.getItem("__raf_seeded")) {
        const c = JSON.parse(corps);
        localStorage.setItem("theologicus_chat_" + chatId, JSON.stringify(c));
        localStorage.setItem("theologicus_currentChatId", chatId);
        localStorage.setItem("__raf_seeded", "1");
      }
    } catch (e) {}
  }, { corps: CORPS, chatId: CHAT_ID });

  async function attendreApp() {
    await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 });
    await page.evaluate(() => { const o = document.getElementById("auth-overlay"); if (o) o.remove(); });
  }

  try {
    await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await attendreApp();
    await page.waitForFunction((ts) => !!document.getElementById("mc-" + ts), MSG_TS, { timeout: 60000 });
    await page.waitForTimeout(900);

    // 1. figure rendue au chargement
    const figAvant = await page.evaluate(() => document.querySelectorAll(".atc-figbox").length);
    ok("figure rendue au chargement (applyShapes)", figAvant === 1, "figCount=" + figAvant);

    // 2. on vide le conteneur de figures, puis mutation dans cc -> re-render
    await page.evaluate(() => {
      document.querySelectorAll(".atc-figbox").forEach(n => n.remove());
      const cc = document.getElementById("chat-container") || document.querySelector(".chat-container");
      if (cc) { const d = document.createElement("div"); d.className = "__raf_probe"; d.textContent = "probe"; cc.appendChild(d); }
    });
    await page.waitForTimeout(500); // quelques frames -> le observer (rAF) doit re-appliquer

    const figApres = await page.evaluate(() => document.querySelectorAll(".atc-figbox").length);
    ok("figure re-rendue après mutation (observer ré-déclenché)", figApres === 1, "figCount=" + figApres);

    // 3. aucune erreur JS
    ok("aucune erreur JS", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
  } catch (e) {
    ok("banc exécuté sans exception", false, String((e && e.message) || e));
  } finally {
    await browser.close();
    serveur.close();
  }

  const reussis = resultats.filter(r => r[0]).length;
  console.log("-".repeat(72));
  console.log(`RESULTAT : ${reussis}/${resultats.length}`);
  console.log("-".repeat(72));
  process.exit(reussis === resultats.length ? 0 : 1);
})();
