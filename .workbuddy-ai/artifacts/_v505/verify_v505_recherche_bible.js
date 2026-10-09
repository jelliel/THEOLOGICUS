// Banc v505 — RECHERCHE BIBLIQUE (Niveau 2) dans la « Recherche globale ».
//
// Vérifie le nouveau moteur « 📖 Bible — versets » : plein texte des 66 livres,
// INSENSIBLE aux diacritiques, avec SURLIGNAGE du terme et référence cliquable.
//
// Usage : node verify_v505_recherche_bible.js [--port 8765]

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

// Tape une requête dans la recherche globale et attend le groupe Bible.
async function chercher(page, q) {
  await page.evaluate((q) => {
    const i = document.getElementById('v180-qin'); if (!i) return;
    i.value = q; i.dispatchEvent(new Event('input', { bubbles: true }));
  }, q);
  try {
    // On attend que le SURLIGNAGE reflète la requête courante (le debounce de
    // 260 ms laissait lire les résultats PRÉCÉDENTS — piège vécu au 1er run).
    await page.waitForFunction((qq) => {
      const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const b = document.getElementById('v180-body');
      const det = b && Array.from(b.querySelectorAll('details.v180-g')).find(d => /Bible — versets/.test(d.textContent));
      if (!det) return false;
      const m = det.querySelector('mark');
      return !!m && norm(m.textContent).indexOf(norm(qq)) >= 0;
    }, q, { timeout: 30000 });
  } catch (e) {}
  return page.evaluate(() => {
    const b = document.getElementById('v180-body');
    const det = Array.from(b.querySelectorAll('details.v180-g')).find(d => /Bible — versets/.test(d.textContent));
    if (!det) return { trouve: false };
    const go = det.querySelector('.v180-go[data-bref]');
    const mark = det.querySelector('mark');
    return {
      trouve: true,
      nb: det.querySelectorAll('.v180-r').length,
      ref: go ? go.dataset.bref : '',
      mark: mark ? mark.textContent : '',
      texte: det.textContent.slice(0, 200),
    };
  });
}

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v505 — RECHERCHE BIBLIQUE (plein texte des 66 livres)");
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
  const ouvert = await page.evaluate(() => {
    const b = document.getElementById('open-gsearch'); if (b) b.click();
    const p = document.getElementById('v180-gs'); return !!p && p.classList.contains('open');
  });
  ok("la recherche globale s'ouvre", ouvert);
  ok("l'en-tête annonce la Bible", await page.evaluate(() => /Bible/.test((document.getElementById('v180-head') || {}).textContent || '')));

  section("1. Recherche « commencement » -> moteur Bible");
  const r1 = await chercher(page, "commencement");
  ok("le groupe « 📖 Bible — versets » apparaît", r1.trouve, JSON.stringify(r1).slice(0, 120));
  ok("des versets sont trouvés", (r1.nb || 0) >= 1, "n=" + r1.nb);
  ok("Genèse 1:1 figure parmi les résultats", /Genèse 1:1/.test(r1.texte), (r1.ref || ""));

  section("2. Surlignage du terme (<mark>)");
  ok("le terme est surligné dans le verset", /commencement/i.test(r1.mark || ""), "mark=" + r1.mark);

  section("3. Insensibilité aux diacritiques");
  const r2 = await chercher(page, "eternel");
  ok("« eternel » (sans accent) trouve des versets", r2.trouve && (r2.nb || 0) >= 1, "n=" + r2.nb);
  ok("le surlignage porte sur « éternel » (accentué, texte réel)", /éternel/i.test(r2.mark || ""), "mark=" + r2.mark);

  section("4. Référence cliquable -> fiche de verset (v446)");
  const pop = await page.evaluate(async () => {
    const b = document.getElementById('v180-body');
    const det = Array.from(b.querySelectorAll('details.v180-g')).find(d => /Bible — versets/.test(d.textContent));
    const go = det && det.querySelector('.v180-go[data-bref]');
    if (!go) return { clic: false };
    go.click();
    await new Promise(r => setTimeout(r, 1500));
    const p = document.getElementById('v446-ref-pop');
    return { clic: true, bref: go.dataset.bref, popup: !!p && p.style.display === 'block' && /Bible/.test(p.textContent) };
  });
  ok("un bouton « ouvrir » porte une référence biblique", pop.clic && /:/.test(pop.bref || ''), pop.bref);
  ok("la fiche de verset s'ouvre au clic", pop.popup);

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
