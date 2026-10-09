// Banc v510 — RECHERCHE BIBLIQUE MULTILINGUE.
//
// Vérifie : sélecteur de version (fr/la/gr/syr/hb), recherche plein texte dans
// la version choisie, libellé de version dans chaque résultat, et texte de la
// langue attendue (latin, grec nettoyé des balises strong).
//
// Usage : node verify_v510_bible_multilingue.js [--port 8765]

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

// Change la version, tape la requête, attend un résultat portant le libellé.
async function chercher(page, ver, q, libelle) {
  await page.evaluate((v) => { const s = document.getElementById('v180-bibver'); if (s) { s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); } }, ver);
  await page.waitForTimeout(400);
  await page.evaluate((q) => { const i = document.getElementById('v180-qin'); if (i) { i.value = q; i.dispatchEvent(new Event('input', { bubbles: true })); } }, q);
  try {
    await page.waitForFunction((lib) => {
      const b = document.getElementById('v180-body');
      const det = b && Array.from(b.querySelectorAll('details.v180-g')).find(d => /Bible — versets/.test(d.textContent));
      return !!det && det.textContent.indexOf(lib) >= 0 && det.querySelectorAll('.v180-r').length > 0;
    }, libelle, { timeout: 45000 });
  } catch (e) {}
  return page.evaluate(() => {
    const b = document.getElementById('v180-body');
    const det = Array.from(b.querySelectorAll('details.v180-g')).find(d => /Bible — versets/.test(d.textContent));
    if (!det) return { trouve: false };
    const r = det.querySelector('.v180-r');
    return {
      trouve: true,
      nb: det.querySelectorAll('.v180-r').length,
      titre: r.querySelector('b').textContent,
      texte: (r.querySelector('.v167-sn') || {}).textContent || '',
      syn: !!r.querySelector('[data-syn]'),
    };
  });
}

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v510 — RECHERCHE BIBLIQUE MULTILINGUE");
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
  await page.waitForTimeout(400);

  section("1. Sélecteur de version");
  const sel = await page.evaluate(() => {
    const s = document.getElementById('v180-bibver');
    return s ? { n: s.options.length, valeurs: Array.from(s.options).map(o => o.value), defaut: s.value } : { n: 0 };
  });
  ok("le sélecteur existe avec 5 versions", sel.n === 5, "n=" + sel.n + " -> " + (sel.valeurs || []).join(","));
  ok("les versions attendues (fr,la,gr,syr,hb)", (sel.valeurs || []).join(",") === "fr,la,gr,syr,hb", (sel.valeurs || []).join(","));
  ok("la version par défaut est le français", sel.defaut === 'fr', sel.defaut);

  section("2. Recherche en FRANÇAIS (défaut)");
  const fr = await chercher(page, "fr", "commencement", "Français");
  ok("résultats en français", fr.trouve && fr.nb >= 1, "n=" + fr.nb);
  ok("le résultat porte le libellé « Français »", /Français/.test(fr.titre || ''), fr.titre);

  section("3. Recherche en LATIN (Vulgate)");
  const la = await chercher(page, "la", "principio", "Latin");
  ok("résultats en latin", la.trouve && la.nb >= 1, "n=" + la.nb);
  ok("le résultat porte le libellé « Latin »", /Latin/.test(la.titre || ''), la.titre);
  ok("le texte est bien latin (« principio »)", /principio/i.test(la.texte || ''), (la.texte || '').slice(0, 60));

  section("4. Recherche en GREC (NT)");
  const gr = await chercher(page, "gr", "θεος", "Grec");
  ok("résultats en grec", gr.trouve && gr.nb >= 1, "n=" + gr.nb);
  ok("le résultat porte le libellé « Grec »", /Grec/.test(gr.titre || ''), gr.titre);
  ok("le texte contient des caractères grecs", /[\u0370-\u03FF\u1F00-\u1FFF]/.test(gr.texte || ''), (gr.texte || '').slice(0, 50));
  ok("le texte grec est nettoyé (aucun « | »)", !/\|/.test(gr.texte || ''), (gr.texte || '').slice(0, 50));

  section("5. La synopse reste disponible sur chaque résultat");
  ok("un bouton « Synopse » est présent", gr.syn);

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
