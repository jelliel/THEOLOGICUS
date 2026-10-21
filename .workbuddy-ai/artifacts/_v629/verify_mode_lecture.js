// Banc v629 — MODE LECTURE (bouton 📖 flottant).
// 1. Le bouton existe ; clic -> body.theo-read, header + pet + nav-bar masqués.
// 2. Reload -> le mode est RESTAURÉ (préférence persistée).
// 3. 2e clic -> mode OFF, header redevient visible.
// Seed AVEC une marque pour que la nav bar v626 soit visible avant le mode.

const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8811;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

const CHAT_ID = "chat-lect-0001";
const MSG_TS = 1790500001333;
const CORPS = JSON.stringify({
  id: CHAT_ID, model: "mistral", messages: [
    { role: "user", content: "Parle-moi.", ts: MSG_TS - 1 },
    { role: "assistant", content: "La sagesse commence par le silence.", ts: MSG_TS, marks: [{ id: "mL1", text: "sagesse", color: "yellow" }] }
  ], title: "Banc lecture", updated: 1, fav: false,
});

const resultats = [];
function ok(nom, cond, detail) {
  resultats.push([!!cond, nom, detail === undefined ? "" : String(detail)]);
  console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`);
  return !!cond;
}

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v629 — MODE LECTURE (toggle + persistance)");
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
  page.on("pageerror", e => erreurs.push(String(e && e.stack ? e.stack.split("\n").slice(0, 4).join(" | ") : e)));

  await ctx.addInitScript(({ corps, chatId }) => {
    try { document.cookie = "key_mistral=sk-test-lect; path=/"; } catch (e) {}
    try { localStorage.setItem("theo_debug", "1"); } catch (e) {}
    try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {}
    try { localStorage.setItem("theo_pets", "1"); } catch (e) {} /* arme le pet (v584 lit localStorage) */
    try {
      window.__diagLog = [];
      const _cl = console.log.bind(console);
      console.log = function () { try { window.__diagLog.push(Array.prototype.map.call(arguments, String).join(' ')); } catch (e) {} return _cl.apply(null, arguments); };
    } catch (e) {}
    try {
      if (!localStorage.getItem("__lect_seeded")) {
        const c = JSON.parse(corps);
        localStorage.setItem("theologicus_chat_" + chatId, JSON.stringify(c));
        localStorage.setItem("theologicus_currentChatId", chatId);
        localStorage.setItem("__lect_seeded", "1");
      }
    } catch (e) {}
  }, { corps: CORPS, chatId: CHAT_ID });

  async function attendreApp() {
    await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 });
    await page.evaluate(() => {
      // NE PAS retirer setup-wizard-overlay : avec theologicus_wizard_skipped=1 il
      // reste inerte (pas de .active -> pointer-events:none), et le retirer trop tôt
      // crée une course avec initWizardEvents (DOMContentLoaded) -> TypeError onclick.
      const o = document.getElementById("auth-overlay"); if (o) o.remove();
    });
  }
  // visibilité EFFECTIVE (display none, y compris via classe body.theo-read)
  const visible = (sel) => page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    return getComputedStyle(el).display !== "none" && !!el.offsetParent !== false ? (getComputedStyle(el).display !== "none") : (getComputedStyle(el).display !== "none");
  }, sel);

  try {
    await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await attendreApp();
    await page.waitForFunction((ts) => !!document.getElementById("mc-" + ts), MSG_TS, { timeout: 60000 });
    await page.waitForSelector("#theo-read-toggle", { timeout: 30000 });
    await page.waitForFunction(() => !!document.getElementById("v584-pet"), null, { timeout: 15000 }).catch(() => {});
    await page.waitForFunction(() => !!document.querySelector('#chat-container [data-mark-id]'), null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(600);

    const t0 = await visible("#v6-topbar");
    ok("topbar v6 visible avant le mode", t0 === true, "display-visible=" + t0);
    const navVisible = await visible("#atc-nav-bar");
    ok("nav bar v626 visible avant le mode (seed avec marque)", navVisible === true, "display-visible=" + navVisible);

    // règle CSS du pet : le VRAI #v584-pet n'existe que pendant les flux/agents
    // (onAgent, scrutateur 600 ms, state module-scoped non exposé) — on prouve
    // donc le SÉLECTEUR avec un hôte factice au même id.
    await page.evaluate(() => {
      if (document.getElementById("v584-pet")) return;
      const h = document.createElement("div");
      h.id = "v584-pet"; h.className = "v584-pet";
      h.setAttribute("data-face", "droite");
      document.body.appendChild(h);
    });
    await page.waitForTimeout(100);
    const petExiste = await page.evaluate(() => !!document.getElementById("v584-pet"));
    const petVisAv = await visible("#v584-pet");
    ok("hôte pet (factice, même id) présent et visible", petExiste && petVisAv === true, "existe=" + petExiste + " visible=" + petVisAv);

    // 1. activation
    await page.click("#theo-read-toggle");
    await page.waitForTimeout(250);
    const cls1 = await page.evaluate(() => document.body.classList.contains("theo-read"));
    ok("clic -> body.theo-read", cls1, "classe=" + cls1);
    const h1 = await visible("#v6-topbar");
    ok("topbar masquée en mode lecture", h1 === false, "display-visible=" + h1);
    const p1 = await visible("#v584-pet");
    ok("pet masqué en mode lecture", petExiste ? (p1 === false) : true, "petExiste=" + petExiste + " display-visible=" + p1);
    // réversibilité sera prouvée au clic OFF (même hôte factice toujours présent)
    const n1 = await visible("#atc-nav-bar");
    ok("nav bar masquée en mode lecture", n1 === false, "display-visible=" + n1);
    const st = await page.evaluate(() => localStorage.getItem("theo_mode_lecture"));
    ok("préférence persistée (=1)", st === "1", "theo_mode_lecture=" + st);

    // 2. restauration après reload
    await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
    await attendreApp();
    await page.waitForFunction(() => document.body.classList.contains("theo-read"), null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(600);
    const cls2 = await page.evaluate(() => document.body.classList.contains("theo-read"));
    ok("mode restauré après reload", cls2, "classe=" + cls2);
    const h2 = await visible("#v6-topbar");
    ok("topbar toujours masquée après reload", h2 === false, "display-visible=" + h2);

    // 3. désactivation — recréer l'hôte factice (le reload a fait un DOM neuf)
    await page.evaluate(() => {
      if (document.getElementById("v584-pet")) return;
      const h = document.createElement("div");
      h.id = "v584-pet"; h.className = "v584-pet";
      document.body.appendChild(h);
    });
    await page.click("#theo-read-toggle");
    await page.waitForTimeout(250);
    const cls3 = await page.evaluate(() => document.body.classList.contains("theo-read"));
    ok("2e clic -> mode OFF", !cls3, "classe=" + cls3);
    const h3 = await visible("#v6-topbar");
    ok("topbar redevient visible", h3 === true, "display-visible=" + h3);
    const p3 = await visible("#v584-pet");
    ok("pet (hôte factice) redevient visible au OFF", p3 === true, "display-visible=" + p3);

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
