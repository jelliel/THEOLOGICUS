// Banc v502 — ASSISTANT GUIDÉ (onboarding vidéo) dans AI VIDEO.
//
// Vérifie : bouton d'ouverture, 5 étapes + progression, navigation, contenus
// (clé+test, modes, durée, presets), liste de contrôle « réussite assurée »
// (qui débloque le lancement), fermeture, et ouverture automatique au 1er usage.
//
// Usage : node verify_v502_onboarding.js [--port 8765]

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

const resultats = [];
function ok(nom, cond, detail) { resultats.push([!!cond, nom, detail === undefined ? "" : String(detail)]); console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`); return !!cond; }
function section(t) { console.log("\n" + t); }
async function masquerWizard(page) { await page.evaluate(() => { const ov = document.getElementById('setup-wizard-overlay'); if (ov) { ov.classList.remove('active'); ov.style.display = 'none'; } try { localStorage.setItem('theologicus_wizard_skipped', '1'); } catch (e) {} }).catch(() => {}); }

let relais = null;
async function relaisVit() { try { const r = await fetch(`http://127.0.0.1:${PORT}/__theologicus_ping`, { signal: AbortSignal.timeout(3000) }); return r.status === 200; } catch (e) { return false; } }
async function assurerRelais() {
  tuerPort(PORT); await new Promise(r => setTimeout(r, 600));
  console.log("  … lancement de proxy_server.py (port " + PORT + ")");
  relais = spawn(PY, ["-u", "proxy_server.py"], { cwd: RACINE, stdio: "ignore", windowsHide: true });
  for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 500)); if (await relaisVit()) return true; if (relais.exitCode !== null) return false; }
  return false;
}

async function ouvrirAIVideo(page) {
  await masquerWizard(page);
  const mb = await page.$("#v159-media-btn");
  if (mb) { await masquerWizard(page); await mb.click({ force: true }); await page.waitForTimeout(300); }
  await masquerWizard(page);
  await page.waitForSelector("#open-aivideo-modal", { state: "visible", timeout: 30000 });
  await page.waitForTimeout(400);
  await masquerWizard(page);
  await page.click("#open-aivideo-modal", { force: true });
  await page.waitForFunction(() => { const f = document.getElementById("aivideo-frame"); const d = f && f.contentDocument; return !!d && !!d.body; }, { timeout: 30000 });
}

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v502 — ASSISTANT GUIDÉ (ONBOARDING VIDÉO)");
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

  await page.addInitScript(() => {
    try {
      localStorage.setItem("theologicus_wizard_skipped", "1");
      localStorage.setItem("agnes_api_key", "sk-test");
    } catch (e) {}
  });

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
  // On marque le guide « déjà vu » AVANT d'ouvrir le studio (pas d'auto-ouverture
  // pendant les tests) ; le test d'auto-ouverture l'effacera plus loin.
  await page.evaluate(() => { try { localStorage.setItem("theologicus_onboard_vu", "1"); } catch (e) {} });
  await ouvrirAIVideo(page);
  const evalW = (fn, arg) => page.evaluate(fn, arg);
  const D = () => page.evaluate(() => document.getElementById("aivideo-frame").contentDocument);

  section("1. Bouton + structure (5 étapes)");
  const structure = await evalW(() => {
    const d = document.getElementById("aivideo-frame").contentDocument;
    const btn = d.getElementById("ob-open-btn");
    if (btn) btn.click();
    return { bouton: !!btn, ouvert: d.getElementById("onboard").classList.contains("open"), dots: d.querySelectorAll("#ob-steps .ob-dot").length, panes: d.querySelectorAll("#ob-body .ob-pane").length };
  });
  ok("le bouton « Guide » existe", structure.bouton);
  ok("le clic ouvre l'assistant", structure.ouvert);
  ok("5 points de progression", structure.dots === 5, "dots=" + structure.dots);
  ok("5 panneaux d'étape", structure.panes === 5, "panes=" + structure.panes);

  section("2. Navigation (Suivant / Précédent)");
  const nav = await evalW(() => {
    const d = document.getElementById("aivideo-frame").contentDocument;
    const w = d.defaultView;
    const s0 = w.__v502.courant();
    d.getElementById("ob-next").click(); const s1 = w.__v502.courant();
    d.getElementById("ob-next").click(); const s2 = w.__v502.courant();
    d.getElementById("ob-prev").click(); const s3 = w.__v502.courant();
    return { s0, s1, s2, s3, pane: d.querySelector('.ob-pane.on').dataset.pane };
  });
  ok("Suivant avance (0 -> 1 -> 2)", nav.s0 === 0 && nav.s1 === 1 && nav.s2 === 2, JSON.stringify(nav));
  ok("Précédent recule (2 -> 1)", nav.s3 === 1, "s3=" + nav.s3);

  section("3. Étape 1 : clé + test");
  const cle = await evalW(() => {
    const d = document.getElementById("aivideo-frame").contentDocument;
    const w = d.defaultView;
    w.__v502.etape(1);
    return { input: !!d.getElementById("ob-key"), val: d.getElementById("ob-key").value, test: !!d.getElementById("ob-test") };
  });
  ok("champ de clé présent et prérempli", cle.input && cle.val.length > 0, "val=" + cle.val);
  ok("bouton « Tester » présent", cle.test);

  section("4. Étape 2 : modes + durée");
  const plan = await evalW(() => {
    const d = document.getElementById("aivideo-frame").contentDocument;
    const w = d.defaultView;
    w.__v502.etape(2);
    const modes = d.querySelectorAll("#ob-modes [data-mode]");
    modes[1].click();   // « Vidéo de départ »
    const od = d.getElementById("ob-duration");
    return { n: modes.length, mode: w.__v502.etat.mode, opts: od.options.length, sync: od.value === d.getElementById("duration-select").value };
  });
  ok("3 types de génération proposés", plan.n === 3, "n=" + plan.n);
  ok("choisir un mode le répercute (state.mode)", plan.mode === "video", "mode=" + plan.mode);
  ok("le sélecteur de durée est synchronisé", plan.opts > 3 && plan.sync, "opts=" + plan.opts + " sync=" + plan.sync);

  section("5. Étape 3 : presets");
  const pres = await evalW(() => {
    const d = document.getElementById("aivideo-frame").contentDocument;
    const w = d.defaultView;
    w.__v502.etape(3);
    const btns = d.querySelectorAll("#ob-presets [data-preset]");
    if (btns.length) btns[0].click();
    return { n: btns.length, prompt: d.getElementById("ob-prompt").value };
  });
  ok("les presets sont proposés (5)", pres.n === 5, "n=" + pres.n);
  ok("un preset remplit la scène", (pres.prompt || "").length > 10, (pres.prompt || "").slice(0, 40));

  section("6. Étape 4 : liste de contrôle « réussite assurée »");
  const chkKo = await evalW(() => {
    const d = document.getElementById("aivideo-frame").contentDocument;
    const w = d.defaultView;
    d.getElementById("ob-prompt").value = "";       // scène vide
    w.__v502.etape(4);
    return { n: d.querySelectorAll("#ob-checks li").length, disabled: d.getElementById("ob-next").disabled };
  });
  ok("4 points de contrôle affichés", chkKo.n === 4, "n=" + chkKo.n);
  ok("scène vide -> lancement bloqué", chkKo.disabled === true, "disabled=" + chkKo.disabled);
  const chkOk = await evalW(() => {
    const d = document.getElementById("aivideo-frame").contentDocument;
    const w = d.defaultView;
    d.getElementById("ob-prompt").value = "un renard traverse une forêt enneigée au crépuscule";
    w.__v502.checks();
    return { disabled: d.getElementById("ob-next").disabled, ko: d.querySelectorAll("#ob-checks li.ko").length, ok: d.querySelectorAll("#ob-checks li.ok").length };
  });
  ok("scène décrite -> lancement débloqué", chkOk.disabled === false, "disabled=" + chkOk.disabled);
  ok("les points essentiels passent au vert", chkOk.ko === 0, "ko=" + chkOk.ko + " ok=" + chkOk.ok);

  section("7. Fermeture + ouverture automatique au 1er usage");
  const ferm = await evalW(() => {
    const d = document.getElementById("aivideo-frame").contentDocument;
    d.getElementById("ob-close").click();
    return { ouvert: d.getElementById("onboard").classList.contains("open"), vu: localStorage.getItem("theologicus_onboard_vu") };
  });
  ok("la fermeture referme l'assistant", ferm.ouvert === false);
  ok("le guide est marqué comme vu", ferm.vu === "1", "vu=" + ferm.vu);

  // Nouveau « premier usage » : on efface le drapeau et on recharge.
  await page.evaluate(() => { try { localStorage.removeItem("theologicus_onboard_vu"); } catch (e) {} });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await ouvrirAIVideo(page);
  await page.waitForTimeout(1600);
  const auto = await evalW(() => {
    const d = document.getElementById("aivideo-frame").contentDocument;
    return { ouvert: d.getElementById("onboard").classList.contains("open") };
  });
  ok("l'assistant s'ouvre tout seul au premier usage", auto.ouvert);

  section("8. Propreté");
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
