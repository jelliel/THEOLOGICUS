// Banc v529 — APPARAT & PROVENANCE DES SOURCES.
//
// Vérifie que : le registre couvre les corpus, chaque provenance est renseignée,
// ce qui N'EST PAS documenté est signalé comme tel (jamais inventé), le panneau
// liste tout, et surtout que le bloc RAG NOMME désormais l'édition citée.
//
// Usage : node verify_v529_sources.js [--port 8765]

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
  console.log("BANC v529 — APPARAT & PROVENANCE DES SOURCES");
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
  ok("le module v529 est chargé", await page.evaluate(() => !!window.__v529Sources));
  ok("le bouton « ℹ️ SOURCES » est présent", await page.evaluate(() => !!document.getElementById('open-sources')));

  section("1. Le registre couvre les corpus");
  const reg = await page.evaluate(() => window.__v529Sources.sources.map(s => ({ id: s.id, prov: s.prov, langue: s.langue })));
  ok("au moins 15 corpus documentés", reg.length >= 15, "n=" + reg.length);
  ok("chaque entrée porte une provenance non vide", reg.every(s => s.prov && s.prov.length > 10));
  ok("chaque entrée porte une langue", reg.every(s => s.langue && s.langue.length > 2));
  const ids = reg.map(s => s.id);
  ['bible', 'biblelt', 'biblehb', 'biblegr', 'syriaque', 'quran', 'tafsir', 'denzinger', 'valtorta', 'somme'].forEach(function (k) {
    ok("le corpus « " + k + " » est documenté", ids.indexOf(k) >= 0);
  });

  section("2. Provenances exactes (vérifiées sur les fichiers)");
  const p = await page.evaluate(() => ({
    bible: window.__v529Sources.provenanceDe('bible'),
    vulgate: window.__v529Sources.provenanceDe('biblelt'),
    hb: window.__v529Sources.provenanceDe('biblehb'),
    gr: window.__v529Sources.provenanceDe('biblegr'),
    dz: window.__v529Sources.provenanceDe('denzinger'),
    vlt: window.__v529Sources.provenanceDe('valtorta'),
  }));
  ok("Bible : Jérusalem 1973", /Bible de Jérusalem/.test(p.bible) && /1973/.test(p.bible), p.bible);
  ok("Vulgate : Clémentine 1592", /Clémentine/.test(p.vulgate) && /1592/.test(p.vulgate), p.vulgate);
  ok("Hébreu : BHS", /BHS/.test(p.hb), p.hb);
  ok("Grec : Nestle-Aland", /Nestle-Aland/.test(p.gr), p.gr);
  ok("Denzinger : 11e éd. Bannwart 1911", /Bannwart/.test(p.dz) && /1911/.test(p.dz), p.dz);
  ok("Valtorta : édition CEV", /CEV/.test(p.vlt), p.vlt);

  section("3. HONNÊTETÉ : ce qui n'est pas documenté est SIGNALÉ, jamais inventé");
  const inc = await page.evaluate(() => ({
    quran: window.__v529Sources.provenanceDe('quran'),
    tafsir: window.__v529Sources.provenanceDe('tafsir'),
    somme: window.__v529Sources.provenanceDe('somme'),
  }));
  ok("Coran : traduction non sourcée signalée", /PAS documentée/i.test(inc.quran), inc.quran);
  ok("Tafsir : édition non documentée signalée", /non documentée/i.test(inc.tafsir), inc.tafsir);
  ok("Somme : édition non documentée signalée", /non documentée/i.test(inc.somme), inc.somme);

  section("4. Le panneau liste et exporte");
  await page.evaluate(() => window.__v529Sources.ouvrir());
  await page.waitForFunction(() => { const p = document.getElementById('v529-panel'); return p && p.classList.contains('open'); }, { timeout: 15000 });
  const ui = await page.evaluate(() => ({
    items: document.querySelectorAll('#v529-panel .it').length,
    liens: document.querySelectorAll('#v529-panel a.go').length,
    incertains: document.querySelectorAll('#v529-panel .un').length,
  }));
  ok("tous les corpus sont listés", ui.items === reg.length, "items=" + ui.items + " / " + reg.length);
  ok("les sources en ligne sont liées", ui.liens >= 5, "liens=" + ui.liens);
  ok("les provenances incertaines sont mises en évidence", ui.incertains >= 3, "marqués=" + ui.incertains);
  const cred = await page.evaluate(() => window.__v529Sources.texteCredits());
  ok("les crédits exportables citent la Bible de Jérusalem", /Bible de Jérusalem/.test(cred));
  ok("ils mentionnent l'archive.org du Denzinger", /archive\.org/.test(cred));

  section("5. Le bloc RAG NOMME désormais l'édition citée");
  const bloc = await page.evaluate(() => window.__v523Rag.blocContexte([{ ref: 'Genèse 1:1', t: 'Au commencement, Dieu créa le ciel et la terre.' }]));
  ok("le bloc porte l'édition", /Bible de Jérusalem/.test(bloc), (bloc.match(/Édition :[^\n]*/) || [""])[0]);
  ok("la consigne demande de NOMMER l'édition", /NOMME l'édition/i.test(bloc));
  ok("le passage lui-même est intact", /Genèse 1:1/.test(bloc) && /Au commencement/.test(bloc));

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
