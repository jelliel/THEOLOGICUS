// Banc v530 — CONCORDANCE MULTI-CORPUS.
//
// Vérifie que la concordance INDEXE réellement les corpus, COMPTE correctement
// (chiffres vérifiés hors ligne), est insensible aux diacritiques, et révèle le
// contraste attendu : la traduction coranique dit « Allah », la Bible « Dieu ».
//
// Usage : node verify_v530_concordance.js [--port 8765]

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
const occDe = (res, id) => { const r = res.find(x => x.corpus === id); return r ? r.occ : -1; };

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v530 — CONCORDANCE MULTI-CORPUS");
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
  ok("le module v530 est chargé", await page.evaluate(() => !!window.__v530Conc));
  ok("le bouton « 🔢 CONCORDANCE » est présent", await page.evaluate(() => !!document.getElementById('open-concordance')));
  ok("quatre corpus sont proposés", await page.evaluate(() => window.__v530Conc.corpus.length) === 4);

  section("1. Indexation réelle du Coran");
  const t0 = Date.now();
  await page.evaluate(() => window.__v530Conc.indexe('coran'));
  const etat1 = await page.evaluate(() => window.__v530Conc.etat());
  ok("le Coran est indexé", etat1.indexes.indexOf('coran') >= 0, etat1.indexes.join(","));
  ok("tous ses versets sont là (>= 6200)", etat1.tailles.coran >= 6200, "versets=" + etat1.tailles.coran + " en " + Math.round((Date.now() - t0) / 1000) + "s");

  section("2. Comptage EXACT (chiffres vérifiés hors ligne)");
  const c1 = await page.evaluate(() => window.__v530Conc.compte('Allah'));
  ok("« Allah » dans le Coran ≈ 2 890", Math.abs(occDe(c1, 'coran') - 2890) <= 20, "occ=" + occDe(c1, 'coran'));
  const c2 = await page.evaluate(() => window.__v530Conc.compte('miséricordieux'));
  ok("« miséricordieux » ≈ 181", Math.abs(occDe(c2, 'coran') - 181) <= 5, "occ=" + occDe(c2, 'coran'));
  const c3 = await page.evaluate(() => window.__v530Conc.compte('misericordieux'));
  ok("insensible aux diacritiques (sans accent = même résultat)", occDe(c3, 'coran') === occDe(c2, 'coran'), occDe(c2, 'coran') + " vs " + occDe(c3, 'coran'));

  section("3. Indexation de la Bible, puis CONTRASTE entre corpus");
  await page.evaluate(() => window.__v530Conc.indexe('bible'));
  const etat2 = await page.evaluate(() => window.__v530Conc.etat());
  ok("la Bible est indexée (>= 30 000 versets)", etat2.tailles.bible >= 30000, "versets=" + etat2.tailles.bible);
  const d1 = await page.evaluate(() => window.__v530Conc.compte('Dieu'));
  ok("« Dieu » dans la Bible ≈ 4 361", Math.abs(occDe(d1, 'bible') - 4361) <= 60, "occ=" + occDe(d1, 'bible'));
  ok("« Dieu » est bien plus rare dans le Coran (traduction par « Allah »)", occDe(d1, 'coran') >= 0 && occDe(d1, 'coran') < 400, "coran=" + occDe(d1, 'coran'));
  const a1 = await page.evaluate(() => window.__v530Conc.compte('Allah'));
  ok("« Allah » est ABSENT de la Bible", occDe(a1, 'bible') === 0, "bible=" + occDe(a1, 'bible'));
  ok("« Allah » reste massif dans le Coran", occDe(a1, 'coran') > 2500, "coran=" + occDe(a1, 'coran'));

  section("4. Le panneau affiche les résultats par corpus");
  await page.evaluate(() => window.__v530Conc.ouvre());
  await page.waitForFunction(() => { const p = document.getElementById('v530-panel'); return p && p.classList.contains('open'); }, { timeout: 15000 });
  await page.evaluate(() => { const i = document.getElementById('v530-q'); i.value = 'Allah'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForFunction(() => document.querySelectorAll('#v530-panel .cc').length > 0, { timeout: 15000 });
  const ui = await page.evaluate(() => ({
    cartes: document.querySelectorAll('#v530-panel .cc').length,
    premier: (document.querySelector('#v530-panel .cc .ch') || {}).textContent || '',
    compte: (document.querySelector('#v530-panel .cc .cn') || {}).textContent || '',
    exemples: document.querySelectorAll('#v530-panel .cc .ex').length,
    st: document.getElementById('v530-st').textContent,
  }));
  ok("les corpus indexés sont listés avec leur comptage", ui.cartes === 2, "cartes=" + ui.cartes + " (" + ui.premier.trim() + ")");
  ok("le compteur est affiché", /×/.test(ui.compte), ui.compte.trim());
  ok("des passages d'exemple sont montrés", ui.exemples > 0, "exemples=" + ui.exemples);
  ok("l'en-tête totalise les occurrences", /\d+ occurrence/.test(ui.st), ui.st);

  section("5. Export du tableau");
  const tab = await page.evaluate(() => window.__v530Conc.texteTableau('Allah', window.__v530Conc.compte('Allah')));
  ok("le tableau exportable nomme les corpus", /Coran/.test(tab) && /Bible/.test(tab), tab.split("\n").slice(2, 4).join(" | "));
  ok("il porte les chiffres", /2\s?8\d\d/.test(tab));

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
