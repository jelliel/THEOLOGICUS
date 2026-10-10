// Banc v517 — RECHERCHE GLOBALE : MIGRATION au design system (ui-*).
//
// Preuve FORTE : on REMPLACE un jeton (--ui-info, --ui-info-ink) et on vérifie
// que le panneau change — un style en dur ne pourrait pas réagir. Vérifie aussi
// les surfaces (--ui-panel) et la non-régression de la recherche biblique.
//
// Usage : node verify_v517_recherche_design.js [--port 8765]

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
  console.log("BANC v517 — RECHERCHE GLOBALE : MIGRATION AU DESIGN SYSTEM");
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

  section("0. Ouverture de l'application + recherche globale");
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
  await page.evaluate(() => { const b = document.getElementById('open-gsearch'); if (b) b.click(); });
  await page.waitForFunction(() => { const p = document.getElementById('v180-gs'); return p && p.classList.contains('open'); }, { timeout: 20000 });
  ok("la recherche globale s'ouvre", true);

  section("1. Les jetons « information » sont définis (11/11)");
  const j = await page.evaluate(() => window.__v509Design.audit());
  ok("les 11 jetons --ui-* sont calculés", j.jetons === j.jetonsTotal, j.jetons + "/" + j.jetonsTotal);
  const info = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ui-info').trim());
  ok("--ui-info est le bleu « information »", /4f8ef7/i.test(info), info);

  section("2. Le panneau emprunte sa surface au jeton --ui-panel");
  const fond = await page.evaluate(() => getComputedStyle(document.getElementById('v180-box')).backgroundColor);
  ok("le fond de la boîte est celui de --ui-panel", norm(fond) === 'rgb(22,22,31)', fond);

  section("3. PREUVE d'adoption : remplacer --ui-info CHANGE la bordure du panneau");
  const bordAvant = await page.evaluate(() => getComputedStyle(document.getElementById('v180-head')).borderBottomColor);
  await page.evaluate(() => document.documentElement.style.setProperty('--ui-info', '#00ff00'));
  await page.waitForTimeout(100);
  const bordApres = await page.evaluate(() => getComputedStyle(document.getElementById('v180-head')).borderBottomColor);
  // color-mix produit une valeur color(srgb r g b / a) ; on accepte aussi rgba().
  const estBleu = (s) => /0\.309804\s+0\.556863\s+0\.968627/.test(s) || /rgba?\(79,\s*142,\s*247/.test(s);
  const estVert = (s) => /color\(srgb\s+0\s+1\s+0/.test(s) || /rgba?\(0,\s*255,\s*0/.test(s);
  ok("la bordure d'en-tête était bleutée (mélange du jeton)", estBleu(bordAvant), bordAvant);
  ok("après remplacement du jeton, la bordure devient VERTE (preuve)", estVert(bordApres), bordAvant + ' -> ' + bordApres);
  await page.evaluate(() => document.documentElement.style.removeProperty('--ui-info'));

  section("4. PREUVE : remplacer --ui-info-ink CHANGE le texte d'en-tête");
  const txtAvant = await page.evaluate(() => getComputedStyle(document.getElementById('v180-head')).color);
  await page.evaluate(() => document.documentElement.style.setProperty('--ui-info-ink', '#ff00ff'));
  await page.waitForTimeout(100);
  const txtApres = await page.evaluate(() => getComputedStyle(document.getElementById('v180-head')).color);
  ok("le texte était bleu clair (jeton --ui-info-ink)", norm(txtAvant) === 'rgb(214,228,255)', txtAvant);
  ok("après remplacement du jeton, le texte devient MAGENTA (preuve)", norm(txtApres) === 'rgb(255,0,255)', txtAvant + ' -> ' + txtApres);
  await page.evaluate(() => document.documentElement.style.removeProperty('--ui-info-ink'));

  section("5. Non-régression : la recherche biblique fonctionne toujours");
  await page.evaluate(() => { const i = document.getElementById('v180-qin'); i.value = 'commencement'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForFunction(() => { const b = document.getElementById('v180-body'); return b && /Bible — versets/.test(b.textContent); }, { timeout: 30000 });
  const groupe = await page.evaluate(() => {
    const b = document.getElementById('v180-body');
    const btn = Array.from(b.querySelectorAll('[data-syn]')).find(x => x.dataset.syn === 'Genèse 1:1');
    return { bible: /Bible — versets/.test(b.textContent), syn: !!btn };
  });
  ok("le groupe « Bible — versets » est présent", groupe.bible);
  ok("un résultat porte le bouton Synopse (v506)", groupe.syn);

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
