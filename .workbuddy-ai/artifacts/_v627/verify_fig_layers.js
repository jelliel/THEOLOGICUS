// Banc v627 — CALQUES DE FIGURES (premier plan / arrière-plan).
// Seed 2 figures superposées. Sélectionne fg-1, clique « Premier plan »,
// vérifie que son z-index devient > fg-2, puis après RELOAD que le z persiste.

const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8803;
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
      role: "assistant", content: "Deux coeurs superposés.", ts: MSG_TS, marks: [], shapes: [
        { id: "fg-1", x: 20, y: 20, w: 160, h: 96, shape: "Cœur", color: "#4f8ef7", weight: 1.2, fill: "", rot: 0, text: "", ancre: null, svg: SHAPE_SVG },
        { id: "fg-2", x: 60, y: 60, w: 160, h: 96, shape: "Cœur", color: "#e53935", weight: 1.2, fill: "", rot: 0, text: "", ancre: null, svg: SHAPE_SVG }
      ]
    }
  ], title: "Banc calques", updated: 1, fav: false,
});

const resultats = [];
function ok(nom, cond, detail) {
  resultats.push([!!cond, nom, detail === undefined ? "" : String(detail)]);
  console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`);
  return !!cond;
}

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v627 — CALQUES FIGURES (premier plan / arriere-plan)");
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
    try { document.cookie = "key_mistral=sk-test-fgl; path=/"; } catch (e) {}
    try { localStorage.setItem("theo_debug", "1"); } catch (e) {}
    try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {}
    try {
      window.__diagLog = [];
      const _cl = console.log.bind(console);
      console.log = function () { try { window.__diagLog.push(Array.prototype.map.call(arguments, String).join(' ')); } catch (e) {} return _cl.apply(null, arguments); };
    } catch (e) {}
    try {
      if (!localStorage.getItem("__fgl_seeded")) {
        const c = JSON.parse(corps);
        localStorage.setItem("theologicus_chat_" + chatId, JSON.stringify(c));
        localStorage.setItem("theologicus_currentChatId", chatId);
        localStorage.setItem("__fgl_seeded", "1");
      }
    } catch (e) {}
  }, { corps: CORPS, chatId: CHAT_ID });

  async function attendreApp() {
    await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 });
    await page.evaluate(() => {
      const o = document.getElementById("auth-overlay"); if (o) o.remove();
      /* v629/v631 — NE PAS retirer setup-wizard-overlay : une course avec
         initWizardEvents (DOMContentLoaded) coupe l'init -> chat jamais rendu
         (flaky CI constate). Desarmement EN BOUCLE : la classe "active" saute
         sous 300 ms, les retries Playwright passent, le noeud reste en place. */
      window.__disarmTimer = setInterval(function () {
        const w = document.getElementById("setup-wizard-overlay");
        if (w) w.classList.remove("active");
      }, 300);
      document.querySelectorAll(".setup-wizard-overlay, .onboarding-overlay, #setup-wizard-overlay").forEach(function(o){ o.remove(); });
    });
  }
  function zOf(figId){ return page.evaluate((id) => {
    const fb = document.querySelector('.atc-figbox[data-fig-id="' + id + '"]');
    if (!fb) return null;
    return getComputedStyle(fb).zIndex;
  }, figId); }

  try {
    await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await attendreApp();
    await page.waitForFunction((ts) => !!document.getElementById("mc-" + ts), MSG_TS, { timeout: 60000 });
    await page.waitForFunction(() => document.querySelectorAll('.atc-figbox').length === 2, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(500);

    const nb = await page.evaluate(() => document.querySelectorAll('.atc-figbox').length);
    ok("2 figures rendues", nb === 2, "nb=" + nb);
    const z1a = await zOf("fg-1"), z2a = await zOf("fg-2");
    ok("z initial identique (defaut)", z1a === z2a, "z1=" + z1a + " z2=" + z2a);

    // sélectionne fg-1 via sa poignée
    await page.click('.atc-figbox[data-fig-id="fg-1"] .fb-grip');
    await page.waitForSelector('.fig-tools', { timeout: 5000 });
    await page.waitForSelector('.fig-tools button[title^="Premier plan"]', { timeout: 5000 });

    // premier plan
    await page.click('.fig-tools button[title^="Premier plan"]');
    // laisser le save se terminer (leading flush + trailing 350ms + IndexedDB)
    await page.waitForTimeout(1200);
    const z1b = await zOf("fg-1"), z2b = await zOf("fg-2");
    ok("fg-1 passe devant fg-2 (z1 > z2)", parseInt(z1b,10) > parseInt(z2b,10), "z1=" + z1b + " z2=" + z2b);

    // persistance après reload
    await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
    await attendreApp();
    await page.waitForFunction((ts) => !!document.getElementById("mc-" + ts), MSG_TS, { timeout: 60000 });
    await page.waitForFunction(() => document.querySelectorAll('.atc-figbox').length === 2, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(500);
    const z1c = await zOf("fg-1"), z2c = await zOf("fg-2");
    ok("fg-1 reste devant après reload (z persisté)", parseInt(z1c,10) > parseInt(z2c,10), "z1=" + z1c + " z2=" + z2c);

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
