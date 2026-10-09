// Banc v499 — BOOSTER LE FLUX / LA GÉNÉRATION VIDÉO (AI VIDEO).
//
// Vérifie les 7 améliorations annoncées (dont #6 = déjà en place depuis v455) :
//   #1 cadence ADAPTATIVE (20-90 s) au lieu de la pause fixe de 62 s ;
//   #2 polling à BACKOFF (5,8,12,18,25 s) au lieu de 10 s fixes ;
//   #3 détection de SATURATION (429 consécutifs -> cadence au max) ;
//   #4 cache de TIMING (médiane des 10 dernières) + ETA ;
//   #5 FILE à concurrence (createQueue) + réglage UI #video-parallel ;
//   #6 assemblage long-vidéo CÔTÉ SERVEUR (/montage) — déjà en place (v455) ;
//   #7 REPRISE automatique des tâches en attente.
//
// Aucune vraie API : endpoint vidéo perso simulé par un routeur Playwright.
//
// Usage : node verify_v499_flux.js [--port 8765]

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
const FAUX = "https://custom.test/v1";
const FAUX_HOTE = "custom.test";

const resultats = [];
function ok(nom, cond, detail) {
  resultats.push([!!cond, nom, detail === undefined ? "" : String(detail)]);
  console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`);
  return !!cond;
}
function section(t) { console.log("\n" + t); }
async function masquerWizard(page) {
  await page.evaluate(() => {
    const ov = document.getElementById('setup-wizard-overlay'); if (ov) ov.classList.remove('active');
    try { localStorage.setItem('theologicus_wizard_skipped', '1'); } catch (e) {}
  }).catch(() => {});
}

let relais = null;
async function relaisVit() { try { const r = await fetch(`http://127.0.0.1:${PORT}/__theologicus_ping`, { signal: AbortSignal.timeout(3000) }); return r.status === 200; } catch (e) { return false; } }
async function assurerRelais() {
  tuerPort(PORT); await new Promise(r => setTimeout(r, 600));
  console.log("  … lancement de proxy_server.py (port " + PORT + ")");
  relais = spawn(PY, ["-u", "proxy_server.py"], { cwd: RACINE, stdio: "ignore", windowsHide: true });
  for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 500)); if (await relaisVit()) return true; if (relais.exitCode !== null) return false; }
  return false;
}

function armerRouteur(page, cpt) {
  // La vidéo « terminée » pointe vers fake.mp4 : on la sert aussi (sinon le
  // téléchargement tenterait le vrai réseau et traînerait).
  page.route("**/fake.mp4", async (route) => {
    await route.fulfill({ status: 200, contentType: "video/mp4", body: "AAAA" });
  });
  return page.route("**/proxy/**", async (route) => {
    const u = route.request().url();
    if (u.includes(FAUX_HOTE)) {
      if (u.endsWith("/videos")) { cpt.video++; await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ video_id: "fake-vid-1" }) }); return; }
      if (u.includes("/agnesapi")) { await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "succeeded", progress: 100, metadata: { url: "https://custom.test/v1/fake.mp4" } }) }); return; }
    }
    await route.continue();
  });
}

const MODELES = [{ uid: "cm_vid", name: "Mon Vidéo", endpoint: FAUX, apiKey: "ck", id: "vid-1", image: false, video: true, adapter: "agnes" }];

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v499 — FLUX / GÉNÉRATION VIDÉO (AI VIDEO)");
  console.log(BASE);
  console.log("=".repeat(72));
  if (!await assurerRelais()) { console.log("\nRelais injoignable."); process.exit(2); }

  const optionsNav = Object.assign({ args: ["--no-sandbox", "--no-proxy-server"] },
    process.env.PW_DIR ? { executablePath: path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe") } : {});
  const browser = await chromium.launch(optionsNav);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const erreurs = [];
  const BRUIT = /version\.txt|Failed to load resource|net::ERR|Failed to fetch|401|403|404|Unauthorized/i;
  page.on("pageerror", e => erreurs.push(String(e)));
  page.on("console", m => { if (m.type() === "error" && !BRUIT.test(m.text())) erreurs.push("console: " + m.text()); });

  await page.addInitScript((m) => {
    try {
      localStorage.setItem("theologicus_wizard_skipped", "1");
      localStorage.setItem("agnes_api_key", "sk-test-agnes");
      localStorage.setItem("cinema_noir_custom_models_v2", JSON.stringify(m));
      localStorage.setItem("cinema_noir_cm_choice_v1", JSON.stringify({ image: "", video: "cm_vid" }));
      localStorage.setItem("cinema_noir_cadence_v1", "20000");   // borne basse : pause courte si déclenchée
      localStorage.removeItem("cinema_noir_timing_v1");
    } catch (e) {}
  }, MODELES);

  const cpt = { video: 0 };
  await armerRouteur(page, cpt);

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

  const W = () => page.evaluate(() => document.getElementById("aivideo-frame").contentDocument.defaultView);
  // helper : exécute une expression dans la fenêtre de l'iframe
  const evalW = (fn, arg) => page.evaluate(fn, arg);

  section("1. #1 Cadence adaptative (bornes, succès, saturation)");
  const cad0 = await evalW(() => { const w = document.getElementById("aivideo-frame").contentDocument.defaultView; return w.__v499 ? w.__v499.cadence() : null; });
  ok("la cadence apprise est dans [20 s, 90 s]", cad0 >= 20000 && cad0 <= 90000, "cadence=" + cad0 + "ms");
  const cadUp = await evalW(() => {
    const w = document.getElementById("aivideo-frame").contentDocument.defaultView;
    const avant = w.__v499.cadence();
    w.__v499.saturer(); w.__v499.saturer();
    return { avant, apres: w.__v499.cadence(), sat: w.__v499.saturation(), seuil: w.__v499.seuil };
  });
  ok("#3 deux 429 consécutifs font MONTER la cadence", cadUp.apres > cadUp.avant, cadUp.avant + " -> " + cadUp.apres);
  ok("#3 la saturation est détectée (>= seuil)", cadUp.sat >= cadUp.seuil, "saturation=" + cadUp.sat + " seuil=" + cadUp.seuil);
  const cadDown = await evalW(() => {
    const w = document.getElementById("aivideo-frame").contentDocument.defaultView;
    const avant = w.__v499.cadence();
    w.__v499.succes();
    return { avant, apres: w.__v499.cadence(), sat: w.__v499.saturation() };
  });
  ok("#1 un succès fait BAISSER la cadence", cadDown.apres < cadDown.avant, cadDown.avant + " -> " + cadDown.apres);
  ok("#3 un succès remet la saturation à zéro", cadDown.sat === 0, "saturation=" + cadDown.sat);

  section("2. #2 Backoff + #4 cache de timing");
  const bk = await evalW(() => { const w = document.getElementById("aivideo-frame").contentDocument.defaultView; return w.__v499.backoff; });
  ok("#2 le backoff de polling est [5,8,12,18,25]", Array.isArray(bk) && bk.join(",") === "5,8,12,18,25", JSON.stringify(bk));
  const tim = await evalW(() => {
    const w = document.getElementById("aivideo-frame").contentDocument.defaultView;
    w.__v499.enregistrer("job", 5000); w.__v499.enregistrer("job", 7000); w.__v499.enregistrer("job", 6000);
    const med = w.__v499.timing("job", -1);
    const ls = JSON.parse(localStorage.getItem("cinema_noir_timing_v1") || "{}");
    return { med, n: (ls.job || []).length };
  });
  ok("#4 la médiane des durées est apprise (6000)", tim.med === 6000, "médiane=" + tim.med);
  ok("#4 le cache de timing est persisté", tim.n === 3, "mesures=" + tim.n);

  section("3. #5 File à concurrence + réglage UI");
  const sel = await evalW(() => { const d = document.getElementById("aivideo-frame").contentDocument; const s = d.getElementById("video-parallel"); return s ? s.options.length : 0; });
  ok("#5 le sélecteur #video-parallel existe (4 niveaux)", sel === 4, "options=" + sel);
  const file = await evalW(async () => {
    const w = document.getElementById("aivideo-frame").contentDocument.defaultView;
    let enVol = 0, max = 0, finis = 0;
    const file = w.__v499.file(2, 30);
    const taches = [];
    for (let i = 0; i < 6; i++) {
      taches.push(file.add(async () => {
        enVol++; max = Math.max(max, enVol);
        await new Promise(r => setTimeout(r, 60));
        enVol--; finis++;
      }));
    }
    await Promise.all(taches);
    return { max, finis };
  });
  ok("#5 la file respecte la concurrence max (<= 2)", file.max <= 2 && file.max >= 1, "max en vol=" + file.max);
  ok("#5 toutes les tâches de la file sont exécutées", file.finis === 6, "finies=" + file.finis);

  section("4. #4/#1/#5 génération réelle (endpoint perso simulé, 1 job)");
  const gen = await evalW(async () => {
    const w = document.getElementById("aivideo-frame").contentDocument.defaultView;
    const st = w.__v499.etat;
    st.mode = "video";
    st.videos = [{ type: "video", dataUri: "data:video/mp4;base64,AAAA", thumbnail: "", id: Date.now(), name: "t.mp4", size: 100 }];
    st.activeModels = [];
    const p = document.getElementById("aivideo-frame").contentDocument.getElementById("main-prompt-video");
    if (p) { p.value = "une scène test"; p.dispatchEvent(new Event("input")); }
    await w.startGeneration();
    const ls = JSON.parse(localStorage.getItem("cinema_noir_timing_v1") || "{}");
    return { job: (ls.job || []).length, video: (ls.video || []).length, cadence: w.__v499.cadence() };
  });
  ok("la génération vidéo a atteint l'endpoint perso (/videos)", cpt.video >= 1, "appels video=" + cpt.video);
  ok("#4 la durée du job est enregistrée", gen.job >= 1, "job=" + gen.job);
  ok("#4 la durée du polling est enregistrée", gen.video >= 1, "video=" + gen.video);

  section("5. #7 Reprise automatique des tâches en attente");
  await evalW(() => { localStorage.setItem("agnes_pending_tasks_v1", JSON.stringify([{ videoId: "pend-1", modelId: "agnes-video-v2.0", label: "reste", addedAt: Date.now() }])); });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await masquerWizard(page);
  const mb2 = await page.$("#v159-media-btn");
  if (mb2) { await mb2.click(); await page.waitForTimeout(300); }
  await page.waitForSelector("#open-aivideo-modal", { state: "visible", timeout: 30000 });
  await page.waitForTimeout(400);
  await page.click("#open-aivideo-modal");
  await page.waitForFunction(() => { const f = document.getElementById("aivideo-frame"); const d = f && f.contentDocument; return !!d && !!d.body; }, { timeout: 30000 });
  await page.waitForTimeout(3500);
  const reprise = await evalW(() => {
    const d = document.getElementById("aivideo-frame").contentDocument;
    return (d.getElementById("log-body") || {}).textContent || "";
  });
  ok("#7 la reprise automatique est déclenchée au chargement", /Reprise automatique/i.test(reprise), (reprise.match(/Reprise automatique[^\n]*/) || [""])[0].slice(0, 80));

  section("6. Propreté");
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
