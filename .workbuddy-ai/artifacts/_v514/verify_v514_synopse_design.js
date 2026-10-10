// Banc v514 — MIGRATION de la SYNOPSE au design system (ui-*).
//
// Preuve FORTE de l'adoption des jetons : on REMPLACE un jeton (--ui-accent,
// --ui-panel-2) et on vérifie que le panneau CHANGE de couleur. Un style codé
// en dur ne pourrait PAS réagir. Vérifie aussi les composants .ui-card (blocs
// de version) et .ui-badge (décompte), + la non-régression de la navigation.
//
// Usage : node verify_v514_synopse_design.js [--port 8765]

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
  console.log("BANC v514 — SYNOPSE : MIGRATION AU DESIGN SYSTEM (ui-*)");
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

  section("1. Ouverture de la synopse (Genèse 1:1)");
  const base0 = await page.evaluate(() => window.__v509Design.audit().usages);
  ok("aucun usage ui-* au repos", base0 === 0, "usages=" + base0);
  await page.evaluate(() => window.__v506Synopse.ouvrir("Genèse 1:1"));
  await page.waitForFunction(() => { const p = document.getElementById('v506-syn'); return p && p.classList.contains('open') && p.querySelectorAll('#v506-c .v').length > 0; }, { timeout: 30000 });

  section("2. Composants adoptés : ui-card (blocs) et ui-badge (décompte)");
  const comp = await page.evaluate(() => {
    const p = document.getElementById('v506-syn');
    const cartes = p.querySelectorAll('#v506-c .v');
    return {
      nbCartes: cartes.length,
      toutesUiCard: Array.from(cartes).every(v => v.classList.contains('ui-card')),
      badge: !!p.querySelector('#v506-s .ui-badge'),
      badgeTexte: (p.querySelector('#v506-s .ui-badge') || {}).textContent || '',
      usages: window.__v509Design.audit().usages,
    };
  });
  ok("les blocs de version portent ui-card", comp.nbCartes >= 4 && comp.toutesUiCard, "cartes=" + comp.nbCartes);
  ok("le décompte est un ui-badge", comp.badge, comp.badgeTexte);
  ok("le badge annonce le nombre de versions", /\d+\s*version/i.test(comp.badgeTexte), comp.badgeTexte);
  ok("l'auditeur compte les usages de la synopse (>= 8)", comp.usages >= 8, "usages=" + comp.usages);

  section("3. PREUVE d'adoption : remplacer un jeton CHANGE le panneau");
  // On force --ui-accent à un rouge vif : si le titre utilisait une couleur en
  // dur, il resterait doré. S'il suit le jeton, il devient rouge.
  const accentAvant = await page.evaluate(() => getComputedStyle(document.querySelector('#v506-syn h3')).color);
  await page.evaluate(() => document.documentElement.style.setProperty('--ui-accent', '#ff0000'));
  await page.waitForTimeout(80);
  const accentApres = await page.evaluate(() => getComputedStyle(document.querySelector('#v506-syn h3')).color);
  ok("le titre était doré (jeton --ui-accent)", norm(accentAvant) === 'rgb(229,193,90)', accentAvant);
  ok("après remplacement du jeton, le titre devient ROUGE (preuve)", norm(accentApres) === 'rgb(255,0,0)', accentAvant + ' -> ' + accentApres);
  await page.evaluate(() => document.documentElement.style.removeProperty('--ui-accent'));

  // Idem pour le fond des cartes : --ui-panel-2 (composant ui-card).
  const fondAvant = await page.evaluate(() => getComputedStyle(document.querySelector('#v506-c .v.ui-card')).backgroundColor);
  await page.evaluate(() => document.documentElement.style.setProperty('--ui-panel-2', '#00ff00'));
  await page.waitForTimeout(80);
  const fondApres = await page.evaluate(() => getComputedStyle(document.querySelector('#v506-c .v.ui-card')).backgroundColor);
  ok("le fond de carte était celui du jeton --ui-panel-2", norm(fondAvant) === 'rgb(26,26,40)', fondAvant);
  ok("après remplacement du jeton, le fond devient VERT (preuve)", norm(fondApres) === 'rgb(0,255,0)', fondAvant + ' -> ' + fondApres);
  await page.evaluate(() => document.documentElement.style.removeProperty('--ui-panel-2'));

  section("4. Non-régression de la navigation (v512)");
  await page.evaluate(() => document.getElementById('v506-next').click());
  await page.waitForTimeout(350);
  const ref = await page.evaluate(() => document.getElementById('v506-ref').textContent);
  ok("Suivant -> Genèse 1:2 (navigation intacte)", /Genèse 1:2/.test(ref), ref);

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
