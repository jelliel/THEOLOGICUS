// Banc v631 — ONGLET MEDIA (bouton 🎬 topbar) + pont OpenMontage.
// A. Avec fetch MOCKÉ (contrat documenté, validé sur serveur réel) : statut
//    affiche les prérequis, le clonage bascule le chip « Installé », le log
//    s'affiche, « Tester les capacités » affiche le JSON.
// B. Sans mock (serveur statique du banc) : le modal s'ouvre et l'absence de
//    serveur local est annoncée PROPREMENT (dégradé), 0 erreur JS.

const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8817;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

const resultats = [];
function ok(nom, cond, detail) {
  resultats.push([!!cond, nom, detail === undefined ? "" : String(detail)]);
  console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`);
  return !!cond;
}

const MOCK = `
  var etat = { installe: false };
  var _fetch = window.fetch;
  window.fetch = function(url, opts) {
    url = String(url || "");
    if (url.indexOf("/media/") === 0) {
      var body = null;
      if (url === "/media/status") {
        body = { ok: true, installe: etat.installe, install_dir: "C:/Users/x/THEOLOGICUS/OpenMontage",
          tools: { python: { ok: true, version: "Python 3.13.14" }, git: { ok: true, version: "git version 2.55.0" },
                   ffmpeg: { ok: true, version: "ffmpeg version 9.0" }, node: { ok: true, version: "v22.22.2" } } };
      } else if (url === "/media/clone") {
        etat.installe = true;
        body = { ok: true, erreur: null, log: "$ git clone --depth 1 ...\\nCloning into ... done." };
      } else if (url === "/media/deps") {
        body = { ok: true, erreur: null, log: "$ pip install -r requirements.txt\\nSuccessfully installed ..." };
      } else if (url === "/media/run") {
        body = { ok: true, erreur: null, log: '$ python -c (tool_registry: envelope)\\n{ "name": "Wan 2.1 T2V (1.3B)" }' };
      }
      return Promise.resolve({ json: function(){ return Promise.resolve(body); } });
    }
    return _fetch.apply(this, arguments);
  };
`;

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v631 — ONGLET MEDIA (topbar) + PONT OPENMONTAGE");
  console.log("=".repeat(72));

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

  async function attendreApp(page) {
    await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 });
    await page.evaluate(() => {
      const o = document.getElementById("auth-overlay"); if (o) o.remove();
      // showWizard(2) est rappelé ~500 ms après l'init si aiConfig absent (IndexedDB
      // non semée) — désarmement EN BOUCLE : l'overlay redevient inactif sous 300 ms
      // et les retries Playwright passent. On retire la classe, jamais le nœud.
      window.__disarmTimer = setInterval(function () {
        const w = document.getElementById("setup-wizard-overlay");
        if (w) w.classList.remove("active");
      }, 300);
    });
  }

  // ── A. page mockée ──
  const pageA = await ctx.newPage();
  const erreursA = [];
  pageA.on("pageerror", e => erreursA.push(String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e)));
  await pageA.addInitScript(() => { 
    try { document.cookie = "key_mistral=sk-test-media; path=/"; } catch (e) {}
    try { localStorage.setItem("theo_debug", "1"); } catch (e) {}
    try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {}
    try {
      window.__diagLog = [];
      const _cl = console.log.bind(console);
      console.log = function () { try { window.__diagLog.push(Array.prototype.map.call(arguments, String).join(' ')); } catch (e) {} return _cl.apply(null, arguments); };
    } catch (e) {}
  });
  await pageA.addInitScript(MOCK);

  try {
    await pageA.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await attendreApp(pageA);
    await pageA.waitForSelector("#media-open-btn", { timeout: 20000 }).catch(() => {});
    const btnLa = await pageA.evaluate(() => !!document.getElementById("media-open-btn"));
    ok("bouton 🎬 présent dans la topbar", btnLa, "media-open-btn=" + btnLa);

    await desarme(pageA);
    await pageA.click("#media-open-btn");
    await pageA.waitForSelector("#media-modal.active", { timeout: 5000 });
    const nbPipes = await pageA.evaluate(() => document.querySelectorAll("#media-modal .media-pipe").length);
    ok("vitrine : 11 pipelines documentés", nbPipes === 11, "pipes=" + nbPipes);
    const nbPrompts = await pageA.evaluate(() => document.querySelectorAll("#media-modal .media-prompts .mp").length);
    ok("vitrine : prompts d'exemple présents", nbPrompts >= 3, "prompts=" + nbPrompts);

    // statut mocké : 4 prérequis + non installé
    await pageA.waitForFunction(() => {
      const z = document.getElementById("media-statut");
      return z && z.querySelectorAll(".media-chip").length >= 5;
    }, null, { timeout: 8000 }).catch(() => {});
    const chips = await pageA.evaluate(() => Array.from(document.querySelectorAll("#media-statut .media-chip")).map(c => c.textContent));
    ok("statut : prérequis + état affichés", chips.length >= 5, JSON.stringify(chips).slice(0, 220));
    ok("statut : python avec version mockée", chips.some(c => c.indexOf("Python 3.13.14") !== -1), "");

    // cloner (mocké) -> chip « Installé » après refresh
    await pageA.click("#media-act-clone");
    await pageA.waitForTimeout(600);
    const logTxt = await pageA.evaluate(() => (document.getElementById("media-log") || {}).textContent || "");
    ok("clonage : log affiché", logTxt.indexOf("Cloning") !== -1, "log=" + logTxt.slice(0, 120));
    const installe = await pageA.evaluate(() => {
      const z = document.getElementById("media-statut");
      return z ? z.textContent.indexOf("Installé") !== -1 : false;
    });
    ok("après clonage : chip « Installé » (rafraîchi)", installe, "");

    // tester les capacités (mocké)
    await pageA.click("#media-act-run");
    await pageA.waitForTimeout(600);
    const logTxt2 = await pageA.evaluate(() => (document.getElementById("media-log") || {}).textContent || "");
    ok("test capacités : JSON registry affiché", logTxt2.indexOf("Wan 2.1") !== -1, "log=" + logTxt2.slice(0, 120));

    ok("A — aucune erreur JS (mock)", erreursA.length === 0, erreursA.slice(0, 3).join(" | "));
  } catch (e) {
    ok("A — banc exécuté sans exception", false, String((e && e.message) || e));
  }

  // ── B. page SANS mock (dégradé propre) ──
  const pageB = await ctx.newPage();
  const erreursB = [];
  pageB.on("pageerror", e => erreursB.push(String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e)));
  await pageB.addInitScript(() => {
    try { document.cookie = "key_mistral=sk-test-media; path=/"; } catch (e) {}
    try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {}
  });
  try {
    await pageB.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await attendreApp(pageB);
    await pageB.waitForSelector("#media-open-btn", { timeout: 20000 }).catch(() => {});
    await pageB.click("#media-open-btn");
    await pageB.waitForSelector("#media-modal.active", { timeout: 5000 });
    await pageB.waitForTimeout(900);
    const logB = await pageB.evaluate(() => (document.getElementById("media-log") || {}).textContent || "");
    ok("B — sans serveur : message de dégradé propre", logB.indexOf("Serveur local indisponible") !== -1, "log=" + logB.slice(0, 140));
    const pipesB = await pageB.evaluate(() => document.querySelectorAll("#media-modal .media-pipe").length);
    ok("B — la vitrine reste lisible (11 pipelines)", pipesB === 11, "pipes=" + pipesB);
    ok("B — aucune erreur JS (dégradé)", erreursB.length === 0, erreursB.slice(0, 3).join(" | "));
  } catch (e) {
    ok("B — banc exécuté sans exception", false, String((e && e.message) || e));
  }

  function desarme(page) {
    return page.evaluate(() => {
      const w = document.getElementById("setup-wizard-overlay");
      if (w) w.classList.remove("active");
    });
  }

  await browser.close();
  serveur.close();

  const reussis = resultats.filter(r => r[0]).length;
  console.log("-".repeat(72));
  console.log(`RESULTAT : ${reussis}/${resultats.length}`);
  console.log("-".repeat(72));
  process.exit(reussis === resultats.length ? 0 : 1);
})();
