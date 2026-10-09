// Banc v507 — PANNEAU DE DIAGNOSTIC (Niveau 3, expérience).
//
// Vérifie : bouton HUD + raccourci clavier, ouverture, sondes (version, corpus,
// stockage, IA, quota), lignes ✅/❌, re-sonde, copie, fermeture.
//
// Usage : node verify_v507_diagnostic.js [--port 8765]

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

async function lire(page) {
  return page.evaluate(() => {
    const p = document.getElementById('v507-diag');
    const lignes = Array.from(p.querySelectorAll('#v507-c .d-l')).map(l => ({
      ic: l.querySelector('.d-ic').textContent,
      nom: l.querySelector('.d-n').textContent,
      det: l.querySelector('.d-d').textContent,
      ko: l.classList.contains('ko'),
    }));
    return { ouvert: p.classList.contains('open'), titre: (p.querySelector('h3') || {}).textContent || '', lignes, st: (p.querySelector('#v507-st') || {}).textContent || '' };
  });
}
function trouver(lignes, nom) { return lignes.find(l => (l.nom || '').indexOf(nom) >= 0) || {}; }

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v507 — PANNEAU DE DIAGNOSTIC");
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

  await page.addInitScript(() => { try { localStorage.setItem("theologicus_wizard_skipped", "1"); localStorage.setItem("agnes_api_key", "sk-test-diagnostic"); } catch (e) {} });

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
  await page.waitForTimeout(700);

  section("1. Bouton HUD + ouverture + sondes");
  const bouton = await page.evaluate(() => !!document.getElementById('open-diag'));
  ok("le bouton « 🩺 DIAGNOSTIC » existe", bouton);
  await page.evaluate(() => { const b = document.getElementById('open-diag'); if (b) b.click(); });
  await page.waitForFunction(() => {
    const p = document.getElementById('v507-diag');
    return p && p.classList.contains('open') && p.querySelectorAll('#v507-c .d-l').length >= 18;
  }, { timeout: 25000 });
  const d = await lire(page);
  ok("le panneau s'ouvre", d.ouvert);
  ok("le titre est « 🩺 Diagnostic »", /Diagnostic/.test(d.titre), d.titre);
  ok("au moins 18 lignes de diagnostic", d.lignes.length >= 18, "n=" + d.lignes.length);

  section("2. Corpus (présence vérifiée en direct)");
  const bib = trouver(d.lignes, 'Bible (français)');
  const cor = trouver(d.lignes, 'Coran');
  const vul = trouver(d.lignes, 'Vulgate');
  ok("la Bible est présente", bib.ic === '✅', JSON.stringify(bib));
  ok("le Coran est présent", cor.ic === '✅', JSON.stringify(cor));
  ok("la Vulgate est présente", vul.ic === '✅', JSON.stringify(vul));

  section("3. Stockage / IA / quota");
  ok("ligne localStorage présente", !!trouver(d.lignes, 'localStorage').nom, JSON.stringify(trouver(d.lignes, 'localStorage')));
  ok("ligne IndexedDB présente", !!trouver(d.lignes, 'IndexedDB').nom);
  ok("ligne Réseau présente", !!trouver(d.lignes, 'Réseau').nom);
  const agnes = trouver(d.lignes, 'Clé Agnes');
  ok("la clé Agnes est détectée (masquée)", agnes.ic === '✅' && /••••/.test(agnes.det || ''), JSON.stringify(agnes));
  ok("ligne Ollama présente", !!trouver(d.lignes, 'Ollama').nom, JSON.stringify(trouver(d.lignes, 'Ollama')));
  ok("ligne quota vidéo présente", !!trouver(d.lignes, 'Quota vidéo').nom);

  section("4. Version");
  ok("la version est affichée", !!(trouver(d.lignes, 'Version').det || '').length, JSON.stringify(trouver(d.lignes, 'Version')));

  section("5. Re-sonde + raccourci clavier + fermeture");
  const res = await page.evaluate(async () => {
    document.getElementById('v507-retest').click();
    await new Promise(r => setTimeout(r, 1200));
    return document.querySelectorAll('#v507-c .d-l').length;
  });
  ok("« Re-tester » relance les sondes", res >= 18, "n=" + res);
  await page.evaluate(() => { document.getElementById('v507-x').click(); });
  ok("le panneau se ferme", await page.evaluate(() => !document.getElementById('v507-diag').classList.contains('open')));
  await page.keyboard.down('Control'); await page.keyboard.down('Alt'); await page.keyboard.press('KeyD'); await page.keyboard.up('Alt'); await page.keyboard.up('Control');
  await page.waitForTimeout(500);
  ok("le raccourci Ctrl+Alt+D rouvre le panneau", await page.evaluate(() => document.getElementById('v507-diag').classList.contains('open')));

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
