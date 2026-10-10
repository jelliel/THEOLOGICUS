// Banc v516 — SYNOPSE : LIEN PROFOND (#synopse=…) — partage par URL.
//
// Vérifie qu'une comparaison se PARTAGE par URL :
//   - ouvrir l'app avec #synopse=Jean 3:16 ouvre la synopse sur cette réf ;
//   - le hash SUIT la référence (navigation, changement de mode) ;
//   - changer le hash (hashchange) ouvre la nouvelle référence ;
//   - le hash encode le mode « chapitre ».
//
// Usage : node verify_v516_synopse_lien.js [--port 8765]

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
async function attendreSyn(page) {
  await page.waitForFunction(() => { const p = document.getElementById('v506-syn'); return p && p.classList.contains('open') && p.querySelectorAll('#v506-c .v').length > 0; }, { timeout: 30000 });
}
async function refSyn(page) { return page.evaluate(() => { const p = document.getElementById('v506-syn'); return p.querySelector('#v506-ref').textContent; }); }
async function hash(page) { return page.evaluate(() => location.hash); }

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v516 — SYNOPSE : LIEN PROFOND (#synopse=…)");
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

  section("1. Ouvrir l'app avec un lien profond #synopse=Jean 3:16");
  await page.goto(BASE + "#synopse=" + encodeURIComponent("Jean 3:16"), { waitUntil: "domcontentloaded", timeout: 60000 });
  await masquerWizard(page);
  await attendreSyn(page);
  ok("la synopse s'ouvre automatiquement depuis le lien", true);
  ok("la référence est Jean 3:16", /Jean 3:16/.test(await refSyn(page)), await refSyn(page));
  const noms = await page.evaluate(() => Array.from(document.querySelectorAll('#v506-syn #v506-c .v .vh')).map(x => x.textContent));
  ok("le grec est présent (NT) — la comparaison est complète", noms.includes("Grec"), noms.join(", "));

  section("2. Le hash reflète la référence affichée");
  ok("le hash porte #synopse=Jean 3:16", /^#synopse=Jean%203%3A16$/i.test(await hash(page)), await hash(page));

  section("3. Naviguer met à jour le lien profond");
  await page.evaluate(() => document.getElementById('v506-next').click());
  await page.waitForTimeout(400);
  ok("Suivant -> Jean 3:17", /Jean 3:17/.test(await refSyn(page)), await refSyn(page));
  ok("le hash suit -> #synopse=Jean 3:17", /Jean%203%3A17/i.test(await hash(page)), await hash(page));

  section("4. Le mode « chapitre entier » est encodé dans le lien");
  await page.evaluate(() => document.getElementById('v506-mode').click());
  await page.waitForTimeout(400);
  ok("le hash encode &mode=chapitre", /mode=chapitre/i.test(await hash(page)), await hash(page));

  section("5. Changer le hash OUVRE la nouvelle référence (hashchange)");
  await page.evaluate(() => { location.hash = '#synopse=' + encodeURIComponent('Genèse 1:1'); });
  // Attendre la RÉFÉRENCE ET le rechargement des versions (l'AT a l'hébreu,
  // absent du contenu précédent) : le rendu est asynchrone.
  await page.waitForFunction(() => {
    const p = document.getElementById('v506-syn');
    if (!p || !/Genèse 1:1/.test(p.querySelector('#v506-ref').textContent)) return false;
    return Array.from(p.querySelectorAll('#v506-c .v .vh')).some(x => x.textContent === 'Hébreu');
  }, { timeout: 25000 });
  ok("la nouvelle référence Genèse 1:1 est affichée", /Genèse 1:1/.test(await refSyn(page)), await refSyn(page));
  const noms2 = await page.evaluate(() => Array.from(document.querySelectorAll('#v506-syn #v506-c .v .vh')).map(x => x.textContent));
  ok("l'hébreu est présent (AT) — comparaison rechargée", noms2.includes("Hébreu"), noms2.join(", "));

  section("6. Un lien invalide ne casse rien");
  await page.evaluate(() => { location.hash = '#synopse=n%27importe%20quoi%20%3A%3A'; });
  await page.waitForTimeout(600);
  ok("l'app reste saine (pas d'erreur, réf inchangée)", /Genèse 1:1/.test(await refSyn(page)), await refSyn(page));

  section("7. Propreté");
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
