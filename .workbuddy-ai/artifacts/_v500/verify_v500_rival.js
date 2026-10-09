// Banc v500 — RIVALISER (AI VIDEO) : succès, gratuité, élégance.
//
//   A) succès    : A1 repli multi-modèle vidéo, A3 pré-vol quota, A4 échec->action,
//                  A5 assainissement du prompt ;
//   B) gratuité  : B1 quota visible partout, B2 rotation de clés, B3 anti-gaspillage ;
//   C) élégance  : C1 barre de phases + ETA, C2 galerie enrichie.
//
// Aucune vraie API : le fournisseur vidéo est simulé par un routeur Playwright
// (le modèle de repli réussit, le modèle primaire échoue en 500).
//
// Usage : node verify_v500_rival.js [--port 8765]

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
const REPLI = "agnes-video-v2.0";
const PRIMAIRE = "agnes-video-v1.9-test";   // modèle choisi qui ÉCHOUERA (500)

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
  console.log("BANC v500 — RIVALISER (AI VIDEO) : succès / gratuité / élégance");
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

  const cpt = { modeles: [] };
  page.route("**/fake.mp4", async (route) => { await route.fulfill({ status: 200, contentType: "video/mp4", body: "AAAA" }); });
  await page.route("**/proxy/**", async (route) => {
    const u = route.request().url();
    if (u.includes("/fake.mp4")) { await route.fulfill({ status: 200, contentType: "video/mp4", body: "AAAA" }); return; }
    if (/apihub\.agnes-ai\.com/.test(u)) {
      if (u.endsWith("/videos")) {
        let body = {}; try { body = JSON.parse(route.request().postData() || "{}"); } catch (e) {}
        cpt.modeles.push(body.model || '?');
        if (body.model === REPLI) { await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ video_id: "repli-ok" }) }); return; }
        await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "boom modele primaire" }) }); return;
      }
      if (u.includes("/agnesapi")) { await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "succeeded", progress: 100, metadata: { url: "http://127.0.0.1:" + PORT + "/fake.mp4" } }) }); return; }
    }
    await route.continue();
  });

  await page.addInitScript((prim) => {
    try {
      localStorage.setItem("theologicus_wizard_skipped", "1");
      localStorage.setItem("agnes_api_key", "k1,k2");            // B2 : 2 clés
      localStorage.setItem("agnes_selected_model_v1", prim);     // modèle primaire qui échoue
      localStorage.setItem("cinema_noir_active_models_v1", JSON.stringify([prim]));
      localStorage.setItem("cinema_noir_video_cache_v1", "{}");
    } catch (e) {}
  }, PRIMAIRE);

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

  section("A5. Assainissement du prompt");
  const ap = await evalW(() => {
    const w = document.getElementById("aivideo-frame").contentDocument.defaultView;
    const sale = "a\u0001b   c\n\n\n\nd";
    const long = "x".repeat(9000);
    return { propre: w.__v500.assainirPrompt(sale), cap: w.__v500.assainirPrompt(long).length };
  });
  ok("A5 les caractères de contrôle et espaces multiples sont nettoyés", ap.propre === "a b c\n\nd", JSON.stringify(ap.propre));
  ok("A5 le prompt est plafonné (4000)", ap.cap === 4000, "len=" + ap.cap);

  section("A1/A4. Repli vidéo + classement d'échec");
  const a1 = await evalW(() => {
    const w = document.getElementById("aivideo-frame").contentDocument.defaultView;
    return { repli: w.__v500.VIDEO_REPLI, cls: w.classerEchec("HTTP 401 unauthorized") };
  });
  ok("A1 le modèle de repli est défini (agnes-video-v2.0)", a1.repli === "agnes-video-v2.0", a1.repli);
  ok("A4 un 401 est classé « clé Agnes refusée »", /clé Agnes refusée/i.test(a1.cls), a1.cls);

  section("B2. Rotation de clés");
  const b2 = await evalW(() => {
    const w = document.getElementById("aivideo-frame").contentDocument.defaultView;
    const n = w.__v500.clesAgnes().length;
    const k1 = w.getApiKey();
    w.__v500.rotation();
    const k2 = w.getApiKey();
    return { n, k1, k2 };
  });
  ok("B2 deux clés sont détectées", b2.n === 2, "n=" + b2.n);
  ok("B2 la première clé est utilisée", b2.k1 === "k1", b2.k1);
  ok("B2 après rotation, la seconde clé est utilisée", b2.k2 === "k2", b2.k2);

  section("B3. Anti-gaspillage (cache)");
  const b3 = await evalW(() => {
    const w = document.getElementById("aivideo-frame").contentDocument.defaultView;
    const h = w.__v500.hash("un prompt|agnes-video-v2.0|153");
    w.__v500.cacheSet(h, "vid_42");
    return { h, relu: w.__v500.cacheGet(h) };
  });
  ok("B3 le hash est stable et le cache persiste", b3.relu === "vid_42", "hash=" + b3.h + " -> " + b3.relu);

  section("A3/B1. Quota gratuit");
  const q = await evalW(() => {
    const w = document.getElementById("aivideo-frame").contentDocument.defaultView;
    const jour = new Date().toISOString().slice(0, 10);
    localStorage.setItem("theologicus_video_quota", JSON.stringify({ jour: jour, secondes: 480 }));
    return { reste: w.__v500.quotaRestant() };
  });
  ok("A3 le quota restant est calculé (500 - 480 = 20)", Math.round(q.reste) === 20, "reste=" + q.reste);
  const b1 = await evalW(() => { const d = document.getElementById("aivideo-frame").contentDocument; const e = d.getElementById("quota-global"); return e ? e.textContent : ""; });
  ok("B1 le quota gratuit est affiché dans l'en-tête", /gratuite/i.test(b1), b1.slice(0, 60));

  section("C1. Barre de phases + sonde de file");
  const c1 = await evalW(() => {
    const d = document.getElementById("aivideo-frame").contentDocument;
    return { phases: d.querySelectorAll("#phase-bar .phase-step").length, fileBtn: !!d.getElementById("file-check-btn"), fileStatus: !!d.getElementById("file-status") };
  });
  ok("C1 la barre de phases existe (4 étapes)", c1.phases === 4, "étapes=" + c1.phases);
  ok("A2 le bouton de sonde de file existe", c1.fileBtn);
  ok("A2 l'indicateur de file existe", c1.fileStatus);

  section("A1 (fonctionnel). Repli vidéo réel sur le modèle fiable");
  const gen = await evalW(async (prim) => {
    const w = document.getElementById("aivideo-frame").contentDocument.defaultView;
    const st = w.__v499.etat;
    st.mode = "video";
    st.activeModels = [prim];
    st.videos = [{ type: "video", dataUri: "data:video/mp4;base64,AAAA", thumbnail: "", id: Date.now(), name: "t.mp4", size: 100 }];
    const p = document.getElementById("aivideo-frame").contentDocument.getElementById("main-prompt-video");
    if (p) { p.value = "une scène de repli"; p.dispatchEvent(new Event("input")); }
    await w.startGeneration();
    const d = document.getElementById("aivideo-frame").contentDocument;
    return { phases: d.querySelectorAll("#phase-bar .phase-step.done").length };
  }, PRIMAIRE);
  ok("A1 le modèle primaire a bien été tenté", cpt.modeles.indexOf(PRIMAIRE) >= 0, "modèles=" + JSON.stringify(cpt.modeles));
  ok("A1 le repli agnes-video-v2.0 a été utilisé", cpt.modeles.indexOf(REPLI) >= 0, "modèles=" + JSON.stringify(cpt.modeles));
  ok("C1 la barre de phases progresse (étapes « done »)", gen.phases >= 1, "done=" + gen.phases);

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
