// Banc v508 — ACCESSIBILITÉ DES PANNEAUX (Niveau 3, item 7).
//
// Vérifie : rôle ARIA (dialog + aria-modal + aria-label), déplacement du focus
// dans le panneau à l'ouverture, RESTITUTION du focus à la fermeture, fermeture
// par Échap, et PIÈGE À TABULATION (Tab boucle dans le panneau).
//
// Usage : node verify_v508_a11y.js [--port 8765]

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
  console.log("BANC v508 — ACCESSIBILITÉ DES PANNEAUX");
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

  await page.addInitScript(() => { try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {} });

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

  section("1. Recherche globale : rôle ARIA + focus à l'ouverture");
  await page.evaluate(() => { const b = document.getElementById('open-gsearch'); b.focus(); b.click(); });
  await page.waitForTimeout(500);
  const a = await page.evaluate(() => {
    const p = document.getElementById('v180-gs');
    return {
      role: p.getAttribute('role'), modal: p.getAttribute('aria-modal'), label: p.getAttribute('aria-label'),
      focusDedans: p.contains(document.activeElement), actif: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : '',
    };
  });
  ok("role=dialog", a.role === 'dialog', a.role);
  ok("aria-modal=true", a.modal === 'true', a.modal);
  ok("aria-label présent", !!a.label, a.label);
  ok("le focus entre dans le panneau", a.focusDedans, "actif=" + a.actif);

  section("2. Piège à tabulation");
  const piege = await page.evaluate(() => {
    const p = document.getElementById('v180-gs');
    const sel = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const f = Array.prototype.filter.call(p.querySelectorAll(sel), x => x.offsetParent !== null);
    return { n: f.length, premier: f[0] ? (f[0].id || f[0].tagName) : '', dernier: f[f.length - 1] ? (f[f.length - 1].id || f[f.length - 1].tagName) : '' };
  });
  // Place le focus sur le DERNIER focusable, puis Tab : doit boucler sur le PREMIER.
  const boucle = await page.evaluate(() => {
    const p = document.getElementById('v180-gs');
    const sel = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const f = Array.prototype.filter.call(p.querySelectorAll(sel), x => x.offsetParent !== null);
    f[f.length - 1].focus();
    return f[0].id || f[0].tagName;
  });
  await page.keyboard.press('Tab');
  await page.waitForTimeout(120);
  const apresTab = await page.evaluate(() => document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : '');
  ok("le panneau a plusieurs éléments focusables", piege.n >= 2, "n=" + piege.n);
  ok("Tab sur le dernier ramène au premier (piège actif)", apresTab === boucle, "attendu=" + boucle + " obtenu=" + apresTab);

  section("3. Échap ferme + focus restitué");
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const apresEsc = await page.evaluate(() => ({
    ouvert: document.getElementById('v180-gs').classList.contains('open'),
    actif: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : '',
  }));
  ok("Échap ferme le panneau", !apresEsc.ouvert);
  ok("le focus est RESTITUÉ au bouton d'origine", apresEsc.actif === 'open-gsearch', "actif=" + apresEsc.actif);

  section("4. Diagnostic : rôle ARIA + Échap");
  await page.evaluate(() => { const b = document.getElementById('open-diag'); b.focus(); b.click(); });
  await page.waitForTimeout(700);
  const d = await page.evaluate(() => {
    const p = document.getElementById('v507-diag');
    return { role: p.getAttribute('role'), modal: p.getAttribute('aria-modal'), label: p.getAttribute('aria-label'), focusDedans: p.contains(document.activeElement) };
  });
  ok("diagnostic : role=dialog + aria-modal", d.role === 'dialog' && d.modal === 'true', JSON.stringify(d));
  ok("diagnostic : aria-label présent", !!d.label, d.label);
  ok("diagnostic : le focus entre dans le panneau", d.focusDedans);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  ok("diagnostic : Échap ferme", await page.evaluate(() => !document.getElementById('v507-diag').classList.contains('open')));

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
