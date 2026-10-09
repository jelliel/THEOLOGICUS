// Banc v501 — AI VIDEO : C3 fiches de scène + C4 démarrage rapide / presets.
//
//   C3 : après génération, l'entrée de galerie porte le PROMPT + la DURÉE ;
//        le modal vidéo affiche la fiche complète.
//   C4 : panneau « Démarrage rapide » repliable + rangée de presets qui
//        remplissent le prompt.
//
// Aucune vraie API : le fournisseur vidéo est simulé par un routeur Playwright.
//
// Usage : node verify_v501_fiche_onboard.js [--port 8765]

const path = require("path");
const { spawn, execSync } = require("child_process");
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const { chromium } = require("playwright");

for (const k of ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy", "FTP_PROXY", "ftp_proxy"]) delete process.env[k];
process.env.NO_PROXY = "*"; process.env.no_proxy = "*";

function tuerPort(port) {
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, { stdio: ["ignore", "pipe", "ignore"] }).toString();
    const pids = new Set();
    out.split("\n").forEach(l => { const m = l.match(new RegExp(`:${port}\\s+\\S+\\s+LISTENING\\s+(\\d+)`)); if (m) pids.add(m[1]); });
    pids.forEach(p => { try { execSync(`taskkill /PID ${p} /F`, { stdio: "ignore" }); } catch (e) {} });
  } catch (e) {}
}

const PORT = process.argv.includes("--port") ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8765;
const BASE = `http://127.0.0.1:${PORT}/THEOLOGICUS.html`;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const PY = process.env.PY_BIN || "C:/Users/toshr/.workbuddy-ai/binaries/python/versions/3.13.12/python.exe";
const AUTH_HASH = "ca9cc135dea09c84e670f62659826f1d9d76a633e421cdc54c67ffa20b3a1a96";
const MODELE = "agnes-video-v2.0";

const resultats = [];
function ok(nom, cond, detail) { resultats.push([!!cond, nom, detail === undefined ? "" : String(detail)]); console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`); return !!cond; }
function section(t) { console.log("\n" + t); }
async function masquerWizard(page) { await page.evaluate(() => { const ov = document.getElementById('setup-wizard-overlay'); if (ov) ov.classList.remove('active'); try { localStorage.setItem('theologicus_wizard_skipped', '1'); } catch (e) {} }).catch(() => {}); }

let relais = null;
async function relaisVit() { try { const r = await fetch(`http://127.0.0.1:${PORT}/__theologicus_ping`, { signal: AbortSignal.timeout(3000) }); return r.status === 200; } catch (e) { return false; } }
async function assurerRelais() {
  tuerPort(PORT); await new Promise(r => setTimeout(r, 600));
  console.log("  … lancement de proxy_server.py (port " + PORT + ")");
  relais = spawn(PY, ["-u", "proxy_server.py"], { cwd: RACINE, stdio: "ignore", windowsHide: true });
  for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 500)); if (await relaisVit()) return true; if (relais.exitCode !== null) return false; }
  return false;
}

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v501 — FICHES DE SCÈNE (C3) + DÉMARRAGE RAPIDE/PRESETS (C4)");
  console.log(BASE);
  console.log("=".repeat(72));
  if (!await assurerRelais()) { console.log("\nRelais injoignable."); process.exit(2); }

  const optionsNav = Object.assign({ args: ["--no-sandbox", "--no-proxy-server"] },
    process.env.PW_DIR ? { executablePath: path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe") } : {});
  const browser = await chromium.launch(optionsNav);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const erreurs = [];
  const BRUIT = /version\.txt|Failed to load resource|net::ERR|Failed to fetch|401|403|404|Unauthorized|500/i;
  page.on("pageerror", e => erreurs.push(String(e)));
  page.on("console", m => { if (m.type() === "error" && !BRUIT.test(m.text())) erreurs.push("console: " + m.text()); });

  page.route("**/fake.mp4", async (route) => { await route.fulfill({ status: 200, contentType: "video/mp4", body: "AAAA" }); });
  await page.route("**/proxy/**", async (route) => {
    const u = route.request().url();
    if (u.includes("/fake.mp4")) { await route.fulfill({ status: 200, contentType: "video/mp4", body: "AAAA" }); return; }
    if (/apihub\.agnes-ai\.com/.test(u)) {
      if (u.endsWith("/videos")) { await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ video_id: "v-ok" }) }); return; }
      if (u.includes("/agnesapi")) { await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "succeeded", progress: 100, metadata: { url: "http://127.0.0.1:" + PORT + "/fake.mp4" } }) }); return; }
    }
    await route.continue();
  });

  await page.addInitScript((mod) => {
    try {
      localStorage.setItem("theologicus_wizard_skipped", "1");
      localStorage.setItem("agnes_api_key", "sk-test");
      localStorage.setItem("agnes_selected_model_v1", mod);
      localStorage.setItem("cinema_noir_active_models_v1", JSON.stringify([mod]));
      localStorage.setItem("cinema_noir_gallery_v1", "[]");
      localStorage.setItem("cinema_noir_video_cache_v1", "{}");
    } catch (e) {}
  }, MODELE);

  section("0. Ouverture de AI VIDEO");
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate((h) => {
    const enc = new TextEncoder().encode("remember:" + h);
    return crypto.subtle.digest("SHA-256", enc).then(buf => {
      const tok = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem("theologicus_remember", JSON.stringify({ v: 1, mode: "admin", exp: Date.now() + 86400000 * 30, tok }));
    });
  }, AUTH_HASH);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await masquerWizard(page);
  const mediaBtn = await page.$("#v159-media-btn");
  if (mediaBtn) { await mediaBtn.click(); await page.waitForTimeout(300); }
  await page.waitForSelector("#open-aivideo-modal", { state: "visible", timeout: 30000 });
  await page.waitForTimeout(400);
  await page.click("#open-aivideo-modal");
  await page.waitForFunction(() => { const f = document.getElementById("aivideo-frame"); const d = f && f.contentDocument; return !!d && !!d.body; }, { timeout: 30000 });
  const evalW = (fn, arg) => page.evaluate(fn, arg);

  section("C4. Démarrage rapide + presets");
  const c4a = await evalW(() => {
    const d = document.getElementById("aivideo-frame").contentDocument;
    const qs = d.getElementById("quickstart"); const head = d.getElementById("qs-head");
    const avant = qs.classList.contains("open");
    head.click(); const apres = qs.classList.contains("open");
    head.click(); const apres2 = qs.classList.contains("open");
    return { existe: !!qs, avant, apres, apres2 };
  });
  ok("C4 le panneau « Démarrage rapide » existe", c4a.existe);
  ok("C4 le clic ouvre puis referme le panneau", c4a.apres !== c4a.avant && c4a.apres2 === c4a.avant, JSON.stringify(c4a));
  const c4b = await evalW(() => {
    const d = document.getElementById("aivideo-frame").contentDocument;
    const btns = d.querySelectorAll("#preset-row [data-preset]");
    if (!btns.length) return { n: 0 };
    btns[0].click();
    return { n: btns.length, prompt: d.getElementById("main-prompt").value };
  });
  ok("C4 la rangée de presets existe (5)", c4b.n === 5, "n=" + c4b.n);
  ok("C4 un preset remplit le prompt", (c4b.prompt || "").length > 10, (c4b.prompt || "").slice(0, 50));

  section("C3. Fiche de scène (prompt + durée) après génération");
  const gen = await evalW(async (mod) => {
    const w = document.getElementById("aivideo-frame").contentDocument.defaultView;
    const st = w.__v499.etat;
    st.mode = "video";
    st.activeModels = [mod];
    st.videos = [{ type: "video", dataUri: "data:video/mp4;base64,AAAA", thumbnail: "", id: Date.now(), name: "t.mp4", size: 100 }];
    const p = document.getElementById("aivideo-frame").contentDocument.getElementById("main-prompt-video");
    if (p) { p.value = "une scène de fiche test"; p.dispatchEvent(new Event("input")); }
    await w.startGeneration();
    const g = w.loadGallery();
    const e = g[0] || {};
    return { n: g.length, prompt: e.prompt, dur: e.durationSec };
  }, MODELE);
  ok("C3 une vidéo est en galerie", gen.n >= 1, "n=" + gen.n);
  ok("C3 l'entrée porte le prompt utilisé", /fiche test/.test(gen.prompt || ""), JSON.stringify(gen.prompt));
  ok("C3 l'entrée porte la durée", typeof gen.dur === "number" && gen.dur > 0, "dur=" + gen.dur);

  const fiche = await evalW(() => {
    const d = document.getElementById("aivideo-frame").contentDocument;
    const w = d.defaultView;
    const g = w.loadGallery();
    w.openVideoModal(g[0].id);
    const txt = d.getElementById("vm-info").textContent || "";
    return { txt };
  });
  ok("C3 le modal vidéo affiche la fiche (prompt)", /fiche test/.test(fiche.txt), fiche.txt.slice(0, 80));

  section("D. Propreté");
  ok("aucune erreur JavaScript", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));

  await browser.close();
  if (relais) relais.kill();

  const total = resultats.length;
  const bons = resultats.filter(r => r[0]).length;
  console.log("\n" + "=".repeat(72));
  console.log(`RESULTAT : ${bons}/${total}`);
  if (bons !== total) { console.log("\nÉchecs :"); resultats.filter(r => !r[0]).forEach(r => console.log(`  - ${r[1]}  (${r[2]})`)); }
  console.log("=".repeat(72));
  process.exit(bons === total ? 0 : 1);
})().catch(e => { console.error("\n[EXCEPTION] " + (e && e.stack || e)); if (relais) relais.kill(); process.exit(3); });
