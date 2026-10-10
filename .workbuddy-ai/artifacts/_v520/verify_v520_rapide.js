// Banc v520 — RECHERCHE INSTANTANÉE CLASSÉE (moteur BM25, tolérant aux fautes).
//
// Vérifie que le moteur :
//   - construit un VRAI index inversé sur toute la Bible (31 000+ versets) ;
//   - CLASSE les résultats (BM25) et met le bon verset en tête ;
//   - est INSENSIBLE aux diacritiques (« eternel » -> « éternel ») ;
//   - TOLÈRE les fautes (« commencemant » -> « commencement ») ;
//   - répond INSTANTANÉMENT (mesuré en ms) ;
//   - surligne les termes et se pilote au CLAVIER (↑ ↓ Entrée Échap).
//
// Usage : node verify_v520_rapide.js [--port 8765]

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
const refs = (res) => res.map(r => r.ref);

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v520 — RECHERCHE INSTANTANÉE CLASSÉE (BM25)");
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
  ok("le module v520 est chargé", await page.evaluate(() => !!window.__v520Rapid));
  ok("le bouton « ⚡ RAPIDE » est présent", await page.evaluate(() => !!document.getElementById('open-rapid')));

  section("1. Ouverture + indexation (construction par tranches, non bloquante)");
  await page.evaluate(() => window.__v520Rapid.ouvrir());
  await page.waitForFunction(() => { const p = document.getElementById('v520-rapid'); return p && p.classList.contains('open'); }, { timeout: 10000 });
  ok("le panneau s'ouvre", true);
  let pret = true;
  try { await page.waitForFunction(() => window.__v520Rapid.etat().pret === true, { timeout: 120000 }); } catch (e) { pret = false; }
  const etat = await page.evaluate(() => window.__v520Rapid.etat());
  ok("l'index est construit (pret)", pret && etat.pret, JSON.stringify(etat));
  ok("il couvre toute la Bible (>= 30 000 versets)", etat.docs >= 30000, "versets=" + etat.docs);
  ok("le vocabulaire indexé est riche (>= 8 000 mots)", etat.mots >= 8000, "mots=" + etat.mots);
  ok("la construction est mesurée en ms", etat.msConstruction > 0, etat.msConstruction.toFixed(0) + " ms");

  section("2. Classement BM25 : le bon verset en tête");
  const r1 = await page.evaluate(() => window.__v520Rapid.requete('Au commencement Dieu créa le ciel et la terre'));
  ok("des résultats sont renvoyés", r1.length > 0, "n=" + r1.length);
  ok("le PREMIER résultat est Genèse 1:1", r1.length > 0 && r1[0].ref === 'Genèse 1:1', r1.slice(0, 3).map(r => r.ref).join(" | "));
  ok("les scores sont décroissants (classement)", r1.every((r, i) => i === 0 || r1[i - 1].score >= r.score));

  section("3. Insensibilité aux diacritiques (« eternel » trouve « éternel »)");
  const r2 = await page.evaluate(() => window.__v520Rapid.requete('eternel'));
  const texte2 = r2.map(r => r.t).join(' ');
  ok("des résultats pour « eternel » (sans accent)", r2.length > 0, "n=" + r2.length);
  ok("le texte contient bien « éternel » (accentué)", /éternel/i.test(texte2), r2.length ? r2[0].ref + " : " + r2[0].t.slice(0, 60) : "");

  section("4. Tolérance aux fautes (« commencemant » -> « commencement »)");
  const r3 = await page.evaluate(() => window.__v520Rapid.requete('commencemant'));
  ok("une faute de frappe renvoie quand même des résultats", r3.length > 0, "n=" + r3.length);
  // BM25 favorise les versets COURTS : on exige que Genèse 1:1 soit présent
  // (le mot a bien été corrigé), pas forcément premier.
  ok("le mot corrigé est trouvé (Genèse 1:1 dans les résultats)", r3.some(r => r.ref === 'Genèse 1:1'), r3.slice(0, 3).map(r => r.ref).join(" | "));

  section("5. Instantanéité (mesurée)");
  await page.evaluate(() => { for (let i = 0; i < 5; i++) window.__v520Rapid.requete('dieu'); });
  const lat = await page.evaluate(() => { const t0 = performance.now(); window.__v520Rapid.requete('lumiere tenebres'); return { ms: performance.now() - t0, interne: window.__v520Rapid.etat().msRequete }; });
  ok("une requête à deux termes répond en < 50 ms", lat.ms < 50, "mesuré=" + lat.ms.toFixed(2) + " ms (interne=" + lat.interne.toFixed(2) + " ms)");

  section("6. Surlignage");
  const hl = await page.evaluate(() => window.__v520Rapid.surligne('Au commencement, Dieu créa le ciel', ['commencement', 'dieu']));
  ok("le terme est encadré par <mark>", /<mark>commencement<\/mark>/.test(hl), hl.slice(0, 90));
  ok("le surlignage est insensible à la casse (« Dieu »)", /<mark>Dieu<\/mark>/.test(hl), hl.slice(0, 120));

  section("7. Interface : saisie, surlignage à l'écran, clavier");
  await page.evaluate(() => { const i = document.getElementById('v520-q'); i.value = 'commencement'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForFunction(() => document.querySelectorAll('#v520-res .r').length > 0, { timeout: 15000 });
  const ui = await page.evaluate(() => ({
    nb: document.querySelectorAll('#v520-res .r').length,
    mark: document.querySelectorAll('#v520-res .r mark').length,
    sel0: (document.querySelector('#v520-res .r.sel') || {}).dataset ? document.querySelector('#v520-res .r.sel').dataset.i : null,
    info: document.getElementById('v520-info').textContent,
  }));
  ok("les résultats s'affichent dans le panneau", ui.nb > 0, "n=" + ui.nb);
  ok("les termes sont surlignés à l'écran", ui.mark > 0, "marks=" + ui.mark);
  ok("le premier résultat est sélectionné", ui.sel0 === '0', "sel=" + ui.sel0);
  ok("la ligne d'info annonce le nombre et le temps", /\d+\s*résultat/.test(ui.info) && /ms/.test(ui.info), ui.info);

  await page.evaluate(() => document.getElementById('v520-q').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
  await page.waitForTimeout(150);
  const sel1 = await page.evaluate(() => { const s = document.querySelector('#v520-res .r.sel'); return s ? s.dataset.i : null; });
  ok("la flèche ↓ déplace la sélection", sel1 === '1', "sel=" + sel1);

  section("8. Entrée ouvre la comparaison (intégration synopse)");
  await page.evaluate(() => document.getElementById('v520-q').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
  await page.waitForFunction(() => { const p = document.getElementById('v506-syn'); return p && p.classList.contains('open'); }, { timeout: 20000 });
  const ouvert = await page.evaluate(() => ({
    rapidFerme: !document.getElementById('v520-rapid').classList.contains('open'),
    ref: document.getElementById('v506-ref').textContent,
  }));
  ok("le panneau rapide se ferme", ouvert.rapidFerme);
  ok("la synopse s'ouvre sur le résultat choisi", /:/.test(ouvert.ref), ouvert.ref);

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
