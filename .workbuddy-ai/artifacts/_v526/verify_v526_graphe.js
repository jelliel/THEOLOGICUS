// Banc v526 — GRAPHE DE RÉFÉRENCES CROISÉES.
//
// Vérifie que le module construit réellement l'index « référence -> sources qui
// la citent » à partir des corpus présents (Valtorta, parallèles coraniques,
// thèmes), que les résultats sont JUSTES (Genèse 1:1 = 3 types), et que le
// bouton « 🔗 Cité par » de la synopse l'ouvre.
//
// Usage : node verify_v526_graphe.js [--port 8765]

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
const types = (l) => Array.from(new Set(l.map(x => x.type))).sort().join(",");

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v526 — GRAPHE DE RÉFÉRENCES CROISÉES");
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
  await page.waitForTimeout(1200);
  ok("le module v526 est chargé", await page.evaluate(() => !!window.__v526Graphe));

  section("1. Construction de l'index (corpus réellement lus)");
  const st = await page.evaluate(() => window.__v526Graphe.charge());
  ok("les citations Valtorta sont indexées", st.valtorta >= 1200, "valtorta=" + st.valtorta);
  ok("les parallèles coraniques sont indexés", st.coran >= 200, "coran=" + st.coran);
  ok("les thèmes croisés sont indexés", st.theme >= 140, "theme=" + st.theme);
  ok("l'index couvre des milliers de références", st.refs >= 8000, "refs=" + st.refs);

  section("2. Genèse 1:1 est cité par les TROIS types de sources");
  const g = await page.evaluate(() => window.__v526Graphe.citePar('Genèse 1:1'));
  ok("trois citations trouvées", g.length === 3, "n=" + g.length + " -> " + types(g));
  ok("les trois types sont présents", types(g) === 'coran,theme,valtorta', types(g));
  ok("chaque citation porte un titre", g.every(x => x.titre && x.titre.length > 2));

  section("3. Ex 3:14 : plusieurs citations, dont un parallèle coranique nommé");
  const e = await page.evaluate(() => window.__v526Graphe.citePar('Ex 3:14'));
  ok("au moins 8 citations", e.length >= 8, "n=" + e.length);
  ok("un parallèle coranique est présent", e.some(x => x.type === 'coran'), types(e));
  const coran = e.find(x => x.type === 'coran') || {};
  ok("il nomme la sourate (Coran 2:255)", /Coran\s*2:255/.test(coran.titre || ''), coran.titre);
  ok("il porte le texte biblique en regard", /Je suis/.test(coran.extrait || ''), coran.extrait);

  section("4. Jean 3:16 et une référence invalide");
  const j = await page.evaluate(() => window.__v526Graphe.citePar('Jean 3:16'));
  ok("Jean 3:16 est cité (Valtorta)", j.length >= 2 && j.every(x => x.type === 'valtorta'), "n=" + j.length + " -> " + types(j));
  ok("les épisodes portent un lien externe", j.some(x => /^https?:/.test(x.lien || '')));
  const bad = await page.evaluate(() => window.__v526Graphe.citePar('Zeus 1:1'));
  ok("une référence non biblique ne renvoie rien", bad.length === 0, "n=" + bad.length);

  section("5. Le panneau affiche le réseau");
  await page.evaluate(() => window.__v526Graphe.ouvre('Genèse 1:1'));
  await page.waitForFunction(() => { const p = document.getElementById('v526-panel'); return p && p.classList.contains('open'); }, { timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll('#v526-panel .it').length > 0, { timeout: 15000 });
  const ui = await page.evaluate(() => ({
    titre: document.getElementById('v526-t').textContent,
    st: document.getElementById('v526-st').textContent,
    items: document.querySelectorAll('#v526-panel .it').length,
    secs: document.querySelectorAll('#v526-panel .sec').length,
    liens: document.querySelectorAll('#v526-panel a.go').length,
  }));
  ok("le titre porte la référence", /Genèse 1:1/.test(ui.titre), ui.titre);
  ok("le compteur annonce 3 citations", /3 citation/.test(ui.st), ui.st);
  ok("les 3 sources sont listées", ui.items === 3, "items=" + ui.items);
  ok("elles sont groupées par type", ui.secs === 3, "sections=" + ui.secs);
  ok("les sources Valtorta ont un lien sortant", ui.liens >= 1, "liens=" + ui.liens);

  section("6. Intégration : le bouton « 🔗 Cité par » de la synopse");
  await page.evaluate(() => window.__v526Graphe.fermer());
  await page.evaluate(() => window.__v506Synopse.ouvrir('Genèse 1:1'));
  await page.waitForFunction(() => { const p = document.getElementById('v506-syn'); return p && p.classList.contains('open'); }, { timeout: 20000 });
  ok("le bouton existe dans la synopse", await page.evaluate(() => !!document.getElementById('v506-reseau')));
  await page.evaluate(() => document.getElementById('v506-reseau').click());
  await page.waitForFunction(() => { const p = document.getElementById('v526-panel'); return p && p.classList.contains('open'); }, { timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll('#v526-panel .it').length > 0, { timeout: 15000 });
  const ref = await page.evaluate(() => document.getElementById('v526-t').textContent);
  ok("le clic ouvre le réseau sur la référence affichée", /Genèse 1:1/.test(ref), ref);

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
