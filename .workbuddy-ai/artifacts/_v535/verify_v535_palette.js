// Banc v535 — PALETTE DE COMMANDES.
//
// Vérifie que la palette INDEXE automatiquement les boutons existants, que la
// recherche porte aussi sur les INFOBULLES, et qu'une entrée EXÉCUTE réellement
// l'action (le panneau visé s'ouvre).
//
// Usage : node verify_v535_palette.js [--port 8765]

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
  console.log("BANC v535 — PALETTE DE COMMANDES");
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
  await page.waitForTimeout(1500);
  ok("le module v535 est chargé", await page.evaluate(() => !!window.__v535Palette));
  ok("le bouton « ⌘ PALETTE » est présent", await page.evaluate(() => !!document.getElementById('open-palette')));

  section("1. Indexation automatique des boutons existants");
  const n = await page.evaluate(() => window.__v535Palette.recharge());
  ok("au moins 30 actions indexées", n >= 30, "n=" + n);
  const ids = await page.evaluate(() => window.__v535Palette.entrees().map(e => e.id));
  ['open-gsearch', 'open-diag', 'open-corbeille', 'open-concordance', 'open-themes', 'open-notes', 'open-presets', 'open-sources', 'open-conseil'].forEach(function (id) {
    ok("l'action « " + id + " » est indexée", ids.indexOf(id) >= 0);
  });

  section("2. Recherche par libellé");
  const r1 = await page.evaluate(() => window.__v535Palette.cherche('corbeille', 40).map(e => e.id));
  ok("« corbeille » trouve la corbeille", r1.indexOf('open-corbeille') >= 0, r1.slice(0, 4).join(","));
  const r2 = await page.evaluate(() => window.__v535Palette.cherche('concordance', 40).map(e => e.id));
  ok("« concordance » trouve la concordance", r2.indexOf('open-concordance') >= 0, r2.slice(0, 4).join(","));
  const r3 = await page.evaluate(() => window.__v535Palette.cherche('agent', 40).map(e => e.id));
  ok("« agent » trouve les agents pré-réglés", r3.indexOf('open-presets') >= 0, r3.slice(0, 5).join(","));

  section("3. Recherche par INFOBULLE (le sens, pas seulement le libellé)");
  const r4 = await page.evaluate(() => window.__v535Palette.cherche('restaurer une conversation', 40).map(e => e.id));
  ok("« restaurer une conversation » trouve la corbeille", r4.indexOf('open-corbeille') >= 0, r4.slice(0, 4).join(","));
  const r5 = await page.evaluate(() => window.__v535Palette.cherche('edition provenance', 40).map(e => e.id));
  ok("« edition provenance » trouve les sources", r5.indexOf('open-sources') >= 0, r5.slice(0, 4).join(","));

  section("4. Insensibilité aux diacritiques et recherche vide");
  const r6 = await page.evaluate(() => window.__v535Palette.cherche('modele', 40).map(e => e.id));
  const r7 = await page.evaluate(() => window.__v535Palette.cherche('modèle', 40).map(e => e.id));
  ok("« modele » et « modèle » donnent le même résultat", r6.length === r7.length && r6.length > 0, r6.length + " vs " + r7.length);
  const r8 = await page.evaluate(() => window.__v535Palette.cherche('', 40).length);
  ok("une recherche vide propose des actions", r8 >= 10, "n=" + r8);

  section("5. Raccourci Ctrl+Maj+P");
  await page.keyboard.press('Control+Shift+P');
  await page.waitForFunction(() => { const p = document.getElementById('v535-panel'); return p && p.classList.contains('open'); }, { timeout: 10000 });
  ok("le raccourci ouvre la palette", true);
  const ui = await page.evaluate(() => ({ items: document.querySelectorAll('#v535-panel .it').length, focus: document.activeElement && document.activeElement.id }));
  ok("la liste est peuplée", ui.items >= 10, "items=" + ui.items);
  ok("le champ a le focus", ui.focus === 'v535-q', ui.focus);

  section("6. Navigation clavier");
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(150);
  ok("↓ déplace la sélection", (await page.evaluate(() => window.__v535Palette.selection())) === 1, "sel=" + (await page.evaluate(() => window.__v535Palette.selection())));

  section("7. Exécution réelle d'une action");
  await page.fill('#v535-q', 'corbeille');
  await page.waitForTimeout(300);
  const sel0 = await page.evaluate(() => (window.__v535Palette.resultats()[0] || {}).id);
  ok("la corbeille est en tête des résultats", sel0 === 'open-corbeille', String(sel0));
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => { const p = document.getElementById('v521-panel'); return p && p.classList.contains('open'); }, { timeout: 15000 });
  ok("Entrée a bien ouvert le panneau Corbeille", true);
  ok("la palette s'est refermée", await page.evaluate(() => !document.getElementById('v535-panel').classList.contains('open')));

  section("8. Échap ferme la palette");
  await page.keyboard.press('Control+Shift+P');
  await page.waitForFunction(() => document.getElementById('v535-panel').classList.contains('open'), { timeout: 10000 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  ok("Échap ferme", await page.evaluate(() => !document.getElementById('v535-panel').classList.contains('open')));

  section("9. Propreté");
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
