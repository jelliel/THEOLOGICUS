// Banc v513 — MIGRATION AU DESIGN SYSTEM (ui-*).
//
// Vérifie que le design system (v509) n'est plus seulement DÉFINI mais ADOPTÉ :
//   - les jetons (--ui-*) sont réellement calculés par le navigateur ;
//   - deux modules réels les utilisent : la synopse (v512, boutons ui-btn) et
//     le diagnostic (v507, jetons + ui-btn + ui-row) ;
//   - le composant .ui-btn applique bien son style (rayon, curseur) ;
//   - un AUDITEUR (__v509Design.audit) mesure l'adoption (nombre d'usages).
//
// Usage : node verify_v513_design_adoption.js [--port 8765]

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
  console.log("BANC v513 — MIGRATION AU DESIGN SYSTEM (ui-*)");
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
  await page.waitForTimeout(600);
  ok("le module de design system est chargé", await page.evaluate(() => !!window.__v509Design));

  section("1. Jetons réellement définis (calculés par le navigateur)");
  const j = await page.evaluate(() => window.__v509Design.audit());
  ok("les 9 jetons --ui-* sont définis", j.jetons === j.jetonsTotal, j.jetons + "/" + j.jetonsTotal);
  const accent = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ui-accent').trim());
  ok("--ui-accent vaut bien la couleur or", /e5c15a/i.test(accent), accent);
  const ray = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ui-radius-sm').trim());
  ok("--ui-radius-sm est défini", !!ray, ray);

  section("2. Aucune adoption AVANT ouverture des panneaux (mesure de base)");
  const base0 = await page.evaluate(() => window.__v509Design.audit().usages);
  ok("aucun composant ui-* dans le DOM au repos", base0 === 0, "usages=" + base0);

  section("3. La synopse (v512) ADOPTE les composants ui-btn");
  await page.evaluate(() => window.__v506Synopse.ouvrir("Genèse 1:1"));
  await page.waitForFunction(() => { const p = document.getElementById('v506-syn'); return p && p.classList.contains('open'); }, { timeout: 30000 });
  const synBtn = await page.evaluate(() => {
    const p = document.getElementById('v506-syn');
    const b = p.querySelector('#v506-next');
    const cs = getComputedStyle(b);
    return { uiBtn: b.classList.contains('ui-btn'), rayon: cs.borderRadius, curseur: cs.cursor, usages: window.__v509Design.audit().usages };
  });
  ok("les boutons de la synopse portent ui-btn", synBtn.uiBtn);
  ok("le style du composant s'applique (rayon = 6px)", synBtn.rayon === '6px', synBtn.rayon);
  ok("le curseur est « pointer » (composant bouton)", synBtn.curseur === 'pointer', synBtn.curseur);
  ok("l'auditeur compte les usages de la synopse (>= 3)", synBtn.usages >= 3, "usages=" + synBtn.usages);

  section("4. Le diagnostic (v507) ADOPTE jetons + ui-btn + ui-row");
  await page.evaluate(() => window.__v507Diag.ouvrir());
  await page.waitForFunction(() => { const p = document.getElementById('v507-diag'); return p && p.classList.contains('open'); }, { timeout: 30000 });
  await page.waitForTimeout(400);
  const diag = await page.evaluate(() => {
    const p = document.getElementById('v507-diag');
    const retest = p.querySelector('#v507-retest');
    const barre = p.querySelector('.btns');
    const b = p.querySelector('.b');
    const csB = getComputedStyle(b);
    return {
      retestUiBtn: retest.classList.contains('ui-btn'),
      barreUiRow: barre.classList.contains('ui-row'),
      rayonPanneau: csB.borderTopLeftRadius,
      bordurePanneau: csB.borderTopWidth,
      usages: window.__v509Design.audit().usages,
    };
  });
  ok("le bouton « Re-tester » porte ui-btn", diag.retestUiBtn);
  ok("la barre d'actions porte ui-row", diag.barreUiRow);
  ok("le panneau emprunte son rayon au jeton (--ui-radius = 10px)", diag.rayonPanneau === '10px', diag.rayonPanneau);
  ok("le panneau emprunte sa bordure au jeton (1px)", diag.bordurePanneau === '1px', diag.bordurePanneau);
  ok("l'auditeur voit les deux modules (usages >= 6)", diag.usages >= 6, "usages=" + diag.usages);

  section("5. Le diagnostic reste fonctionnel après migration");
  // Les sondes (corpus/Ollama) sont asynchrones : attendre qu'elles aboutissent.
  try { await page.waitForFunction(() => document.querySelectorAll('#v507-c .d-l').length >= 18, { timeout: 25000 }); } catch (e) {}
  const lignes = await page.evaluate(() => document.querySelectorAll('#v507-c .d-l').length);
  ok("les lignes de diagnostic sont toujours rendues (>= 18)", lignes >= 18, "lignes=" + lignes);

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
