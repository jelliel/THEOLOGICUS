// Banc v528 — CONSEIL DE MODÈLES (délibération + analyse des divergences).
//
// Preuve centrale : on INTERCEPTE les requêtes réellement envoyées et on vérifie
// qu'il y a bien 3 appels au MÊME prompt système vers 3 MODÈLES DIFFÉRENTS, puis
// 1 appel d'ANALYSE qui demande explicitement convergences et divergences.
//
// Usage : node verify_v528_conseil.js [--port 8765]

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

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v528 — CONSEIL DE MODÈLES");
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

  const corps = [];
  await page.route("**/proxy/**", async (route) => {
    try { const b = route.request().postData(); if (b && b.indexOf('"messages"') >= 0) corps.push(b); } catch (e) {}
    await route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Réponse simulée du modèle.' } }] }) });
  });

  await page.addInitScript(() => {
    try {
      localStorage.setItem("theologicus_wizard_skipped", "1");
      localStorage.setItem("agnes_api_key", "sk-test");
      localStorage.setItem("mistral_api_key_v1", "sk-test");
    } catch (e) {}
  });

  section("0. Ouverture de l'application");
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
  await page.waitForTimeout(1500);
  ok("le module v528 est chargé", await page.evaluate(() => !!window.__v528Conseil));
  ok("le bouton « 🧠 CONSEIL » est présent", await page.evaluate(() => !!document.getElementById('open-conseil')));

  section("1. Le panneau propose trois modèles");
  await page.evaluate(() => window.__v528Conseil.ouvre());
  await page.waitForFunction(() => { const p = document.getElementById('v528-panel'); return p && p.classList.contains('open'); }, { timeout: 15000 });
  const cfg = await page.evaluate(() => {
    const v = (id) => (document.getElementById(id) || {}).value;
    return { n1: document.getElementById('v528-m1').options.length, m1: v('v528-m1'), m2: v('v528-m2'), m3: v('v528-m3'), total: MODELS.length };
  });
  ok("les sélecteurs sont peuplés depuis MODELS", cfg.n1 === cfg.total && cfg.n1 > 3, "options=" + cfg.n1);
  ok("les trois modèles proposés sont DISTINCTS", cfg.m1 && cfg.m2 && cfg.m3 && cfg.m1 !== cfg.m2 && cfg.m2 !== cfg.m3 && cfg.m1 !== cfg.m3, [cfg.m1, cfg.m2, cfg.m3].join(" | "));

  section("2. Délibération : 3 modèles + 1 analyse (interception réelle)");
  // pré-chauffer l'index du RAG (les appels du conseil sont ancrés : v523)
  await page.evaluate(() => window.__v520Rapid.prete());
  await page.waitForFunction(() => window.__v520Rapid.etat().pret === true, { timeout: 120000 });
  // ENVIRONNEMENT COHERENT : resolveModelConfig retombe sur Agnes quand aucune cle
  // Mistral n'est configuree (comportement VOULU de l'app) -> les trois modeles
  // seraient alors tous « agnes-2.5-flash ». On pose donc une cle Mistral pour que
  // le conseil porte bien sur trois fournisseurs/modeles distincts.
  await page.evaluate(() => {
    try {
      state.apiKey = 'sk-test-mistral';
      state.keys = state.keys || {};
      state.keys.mistral = 'sk-test-mistral';
    } catch (e) {}
  });
  corps.length = 0;
  await page.evaluate(([m1, m2, m3]) => window.__v528Conseil.delibere('Qui est Dieu selon la Bible ?', [m1, m2, m3]), [cfg.m1, cfg.m2, cfg.m3]);
  await page.waitForTimeout(800);
  const chat = corps.filter(b => /RÈGLES DE VÉRIFICATION/.test(b));
  const ana = corps.filter(b => /CONVERGENCES/.test(b) && /DIVERGENCES/.test(b));
  ok("trois appels aux modèles ont été émis", chat.length === 3, "n=" + chat.length + " (total corps=" + corps.length + ")");
  const modeles = chat.map(b => { try { return JSON.parse(b).model; } catch (e) { return '?'; } });
  ok("ils visent TROIS modèles différents", new Set(modeles).size === 3, modeles.join(" | "));
  ok("ils portent la MÊME question", chat.every(b => /Qui est Dieu selon la Bible/.test(b)));
  ok("ils sont ANCRÉS sur les sources (bloc RAG présent)", chat.every(b => /PASSAGES PERTINENTS/.test(b)), "ancrés=" + chat.filter(b => /PASSAGES PERTINENTS/.test(b)).length + "/3");
  ok("un appel d'ANALYSE a été émis", ana.length === 1, "n=" + ana.length);
  ok("il demande convergences ET divergences", ana.length === 1 && /CONVERGENCES/.test(ana[0]) && /DIVERGENCES/.test(ana[0]));
  ok("il exige la position de CHAQUE modèle", ana.length === 1 && /position de CHAQUE modèle/.test(ana[0]));
  ok("il n'est PAS pollué par le RAG (pas de bloc passages)", ana.length === 1 && !/PASSAGES PERTINENTS/.test(ana[0]));

  section("3. Affichage des réponses et de l'analyse");
  const ui = await page.evaluate(() => ({
    cols: document.querySelectorAll('#v528-panel .col').length,
    pre: document.querySelectorAll('#v528-panel .col pre').length,
    an: !!document.querySelector('#v528-panel .an'),
    anTxt: (document.querySelector('#v528-panel .an pre') || {}).textContent || '',
    st: document.getElementById('v528-st').textContent,
  }));
  ok("trois colonnes de réponses", ui.cols === 3, "cols=" + ui.cols);
  ok("chaque colonne affiche sa réponse", ui.pre === 3, "pre=" + ui.pre);
  ok("le bloc d'analyse est affiché", ui.an);
  ok("l'analyse porte le texte du modèle", /Réponse simulée/.test(ui.anTxt), ui.anTxt.slice(0, 50));
  ok("l'en-tête annonce 3/3 réponses", /3\/3/.test(ui.st), ui.st);

  section("4. Une réponse peut être versée au chat");
  const avant = await page.evaluate(() => (state.messages || []).length);
  await page.evaluate(() => { const b = document.querySelector('#v528-panel [data-garde="0"]'); if (b) b.click(); });
  await page.waitForTimeout(400);
  const apres = await page.evaluate(() => (state.messages || []).length);
  ok("la réponse choisie est ajoutée à la conversation", apres === avant + 1, avant + " -> " + apres);

  section("5. Propreté");
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
