// Banc v626 — NAVIGATION DES SURLIGNAGES DE CONVERSATION.
// Seed 2 surlignages (text-based, applyMarks les enveloppe au chargement),
// puis vérifie : compteur = 2, prev/next change la cible active, panneau liste
// a 2 entrées, aucune erreur JS.

const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8801;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

const CHAT_ID = "chat-nav-0001";
const MSG_TS = 1790500000777;
const CONTENU = "Le Seigneur est miséricordieux envers tous, et il exerce son jugement avec justice. La miséricorde précède le jugement.";
const CORPS = JSON.stringify({
  id: CHAT_ID, model: "mistral", messages: [
    { role: "user", content: "Parle-moi.", ts: MSG_TS - 1 },
    {
      role: "assistant", content: CONTENU, ts: MSG_TS, marks: [
        { id: "m1", text: "miséricorde", color: "yellow" },
        { id: "m2", text: "jugement", color: "green" }
      ]
    }
  ], title: "Banc nav", updated: 1, fav: false,
});

const resultats = [];
function ok(nom, cond, detail) {
  resultats.push([!!cond, nom, detail === undefined ? "" : String(detail)]);
  console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`);
  return !!cond;
}

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v626 — NAVIGATION SURLIGNAGES (prev/next + panneau)");
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
    try { document.cookie = "key_mistral=sk-test-nav; path=/"; } catch (e) {}
    try { localStorage.setItem("theo_debug", "1"); } catch (e) {}
    try {
      window.__diagLog = [];
      const _cl = console.log.bind(console);
      console.log = function () { try { window.__diagLog.push(Array.prototype.map.call(arguments, String).join(' ')); } catch (e) {} return _cl.apply(null, arguments); };
    } catch (e) {}
    try {
      if (!localStorage.getItem("__nav_seeded")) {
        const c = JSON.parse(corps);
        localStorage.setItem("theologicus_chat_" + chatId, JSON.stringify(c));
        localStorage.setItem("theologicus_currentChatId", chatId);
        localStorage.setItem("__nav_seeded", "1");
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
    // les 2 marques rendues + module nav initialisé
    await page.waitForFunction(() => document.querySelectorAll('#chat-container [data-mark-id]:not([data-panel-mark])').length === 2, null, { timeout: 30000 }).catch(() => {});
    await page.waitForFunction(() => typeof window.__atcNavCount === "function" && window.__atcNavCount() === 2, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(400);

    const nbMarks = await page.evaluate(() => document.querySelectorAll('#chat-container [data-mark-id]:not([data-panel-mark])').length);
    ok("2 surlignages rendus (applyMarks)", nbMarks === 2, "nb=" + nbMarks);
    const count0 = await page.evaluate(() => window.__atcNavCount());
    ok("nav : compteur = 2", count0 === 2, "count=" + count0);

    // prev/next
    await page.evaluate(() => window.__atcNavGo(1));
    await page.waitForTimeout(150);
    const id1 = await page.evaluate(() => window.__atcNavActiveId());
    const txt1 = await page.evaluate(() => document.getElementById("atc-nav-bar").querySelector(".atc-nav-count").textContent);
    ok("nav : next -> cible active définie", !!id1, "active=" + id1 + " count=" + txt1);
    ok("nav : compteur affiche 1/2", txt1 === "1/2", "count=" + txt1);

    await page.evaluate(() => window.__atcNavGo(1));
    await page.waitForTimeout(150);
    const id2 = await page.evaluate(() => window.__atcNavActiveId());
    const txt2 = await page.evaluate(() => document.getElementById("atc-nav-bar").querySelector(".atc-nav-count").textContent);
    ok("nav : next encore -> 2e cible différente", id2 && id2 !== id1, "active=" + id2 + " count=" + txt2);
    ok("nav : compteur affiche 2/2", txt2 === "2/2", "count=" + txt2);

    // prev boucle
    await page.evaluate(() => window.__atcNavGo(-1));
    await page.waitForTimeout(150);
    const id3 = await page.evaluate(() => window.__atcNavActiveId());
    ok("nav : prev revient à la 1re cible", id3 === id1, "active=" + id3);

    // panneau liste
    await page.evaluate(() => window.__atcNavOpen());
    await page.waitForTimeout(300);
    const items = await page.evaluate(() => document.querySelectorAll("#atc-nav-panel.open .anp-item").length);
    ok("nav : panneau liste a 2 entrées", items === 2, "items=" + items);

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
