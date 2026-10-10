// Banc v519 — PANNEAU MÉDIA (v159) : MIGRATION au design system (ui-*).
//
// Vérifie que le menu déroulant « MEDIA ▾ » est piloté par les jetons, et le
// PROUVE en remplaçant un jeton. Vérifie aussi qu'il s'ouvre toujours (correctif
// v511 : le panneau ne se ferme plus sur un scroll).
//
// Usage : node verify_v519_panneau_media.js [--port 8765]

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
const norm = (s) => String(s || "").replace(/\s+/g, "");

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v519 — PANNEAU MÉDIA (v159) : MIGRATION AU DESIGN SYSTEM");
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
  ok("le bouton MEDIA existe (v159)", await page.evaluate(() => !!document.getElementById('v159-media-btn')));
  ok("le panneau existe", await page.evaluate(() => !!document.getElementById('v159-media-panel')));

  section("1. Le panneau s'ouvre (correctif v511 : pas de fermeture sur scroll)");
  await page.evaluate(() => document.getElementById('v159-media-btn').click());
  await page.waitForFunction(() => { const p = document.getElementById('v159-media-panel'); return p && p.classList.contains('open'); }, { timeout: 10000 });
  await page.waitForTimeout(200);
  const st = await page.evaluate(() => {
    const p = document.getElementById('v159-media-panel');
    const cs = getComputedStyle(p);
    return {
      open: p.classList.contains('open'), display: cs.display, fond: cs.backgroundColor,
      bordure: cs.borderTopWidth, bordureC: cs.borderTopColor, rayon: cs.borderTopLeftRadius,
      labels: p.querySelectorAll('.v159-lbl').length, btns: p.querySelectorAll('.hud-btn').length,
    };
  });
  ok("le panneau est ouvert (display:flex)", st.open && st.display === 'flex', st.display);
  ok("il a un FOND (jeton --ui-panel)", norm(st.fond) === 'rgb(22,22,31)', st.fond);
  ok("il a une BORDURE de 1px", st.bordure === '1px', st.bordure);
  ok("il a un RAYON (jeton --ui-radius = 10px)", st.rayon === '10px', st.rayon);
  ok("il contient des entrées (hud-btn) et des libellés", st.btns >= 2 && st.labels >= 1, "btns=" + st.btns + " labels=" + st.labels);

  section("2. Le liséré emprunte le jeton --ui-info (bleu « information »)");
  const estBleu = /0\.309804\s+0\.556863\s+0\.968627/.test(st.bordureC) || /rgba?\(79,\s*142,\s*247/.test(st.bordureC);
  ok("la bordure est un mélange de --ui-info", estBleu, st.bordureC);

  section("3. PREUVE d'adoption : remplacer --ui-panel CHANGE le fond du panneau");
  await page.evaluate(() => document.documentElement.style.setProperty('--ui-panel', '#00ff00'));
  await page.waitForTimeout(100);
  const fond2 = await page.evaluate(() => getComputedStyle(document.getElementById('v159-media-panel')).backgroundColor);
  ok("le fond devient VERT quand on remplace le jeton (preuve)", norm(fond2) === 'rgb(0,255,0)', st.fond + ' -> ' + fond2);
  await page.evaluate(() => document.documentElement.style.removeProperty('--ui-panel'));

  section("4. Propreté");
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
