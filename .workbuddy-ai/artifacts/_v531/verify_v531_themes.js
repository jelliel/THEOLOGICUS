// Banc v531 — INDEX THÉMATIQUE UNIFIÉ.
//
// Vérifie que les quatre corpus thématiques (thèmes croisés, sujets patristiques,
// parallèles coraniques, doctrines) sont RÉUNIS en un index cherchable, que la
// recherche traverse les quatre, que la fiche détaille correctement chaque type
// et que les LIENS CROISÉS fonctionnent.
//
// Usage : node verify_v531_themes.js [--port 8765]

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
  console.log("BANC v531 — INDEX THÉMATIQUE UNIFIÉ");
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
  ok("le module v531 est chargé", await page.evaluate(() => !!window.__v531Themes));
  ok("le bouton « 🗂️ THÈMES » est présent", await page.evaluate(() => !!document.getElementById('open-themes')));

  section("1. Les quatre corpus sont réunis");
  const st = await page.evaluate(() => window.__v531Themes.charge());
  ok("45 thèmes croisés", st.theme === 45, "theme=" + st.theme);
  ok("48 sujets patristiques", st.sujet === 48, "sujet=" + st.sujet);
  ok("221 parallèles coraniques", st.parallele === 221, "parallele=" + st.parallele);
  ok("151 doctrines", st.doctrine === 151, "doctrine=" + st.doctrine);
  ok("soit 465 entrées unifiées", st.total === 465, "total=" + st.total);

  section("2. La recherche TRAVERSE les quatre types");
  const r = await page.evaluate(() => window.__v531Themes.cherche('pardon', 40));
  ok("« pardon » ramène des résultats", r.length >= 5, "n=" + r.length);
  const types = Array.from(new Set(r.map(x => x.type)));
  ok("elle traverse plusieurs types", types.length >= 2, types.join(","));
  ok("le thème « Pardon et miséricorde » est trouvé", r.some(x => x.type === 'theme' && /pardon/i.test(x.titre)), r.filter(x => x.type === 'theme').map(x => x.titre).join(" | "));
  ok("des parallèles coraniques sont trouvés", r.some(x => x.type === 'parallele'), r.filter(x => x.type === 'parallele').length + " parallèle(s)");

  section("3. Recherche insensible aux diacritiques");
  const r2 = await page.evaluate(() => window.__v531Themes.cherche('misericorde', 40));
  ok("« misericorde » (sans accent) trouve aussi", r2.length > 0, "n=" + r2.length);

  section("4. La fiche détaille chaque type");
  const th = await page.evaluate(() => window.__v531Themes.items().filter(x => x.type === 'theme' && /Pardon/i.test(x.titre))[0] || null);
  ok("le thème est retrouvé dans l'index", !!th);
  const f = await page.evaluate((t) => window.__v531Themes.fiche(t), th);
  ok("la fiche affiche la note synthétique", /pardon divin|thème central/i.test(f), (f.match(/class="nt">[^<]{0,70}/) || [""])[0]);
  ok("elle liste les références bibliques", /Mt 6:12/.test(f) && /Ps 103/.test(f));
  ok("les références sont cliquables (vers la synopse)", /data-ref="Mt 6:12"/.test(f));
  const su = await page.evaluate(() => window.__v531Themes.items().filter(x => x.type === 'sujet')[0]);
  const fs = await page.evaluate((t) => window.__v531Themes.fiche(t), su);
  ok("une fiche de sujet patristique cite l'auteur et l'œuvre", /St\.|Saint/.test(fs) && /oeuvres\//.test(fs), (fs.match(/<b>[^<]+<\/b>/) || [""])[0]);

  section("5. Liens croisés (ce qui fait l'« unifié »)");
  const li = await page.evaluate((t) => window.__v531Themes.lies(t, 6), th);
  ok("le thème a des entrées liées", li.length >= 1, "n=" + li.length + " -> " + li.map(x => x.type).join(","));
  const fd = await page.evaluate((t) => window.__v531Themes.fiche(t), th);
  ok("la fiche affiche la section « Lié à »", /Lié à/.test(fd));

  section("6. Le panneau fonctionne");
  await page.evaluate(() => window.__v531Themes.ouvre());
  await page.waitForFunction(() => { const p = document.getElementById('v531-panel'); return p && p.classList.contains('open'); }, { timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll('#v531-panel .li').length > 0, { timeout: 20000 });
  await page.evaluate(() => { const i = document.getElementById('v531-q'); i.value = 'pardon'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  // le champ est débattu (200 ms) : attendre que l'EN-TÊTE reflète la requête
  await page.waitForFunction(() => /résultat/.test(document.getElementById('v531-st').textContent), { timeout: 15000 });
  const ui = await page.evaluate(() => ({ n: document.querySelectorAll('#v531-panel .li').length, st: document.getElementById('v531-st').textContent }));
  ok("la liste affiche les résultats", ui.n >= 5, "n=" + ui.n);
  ok("l'en-tête compte les résultats", /résultat/.test(ui.st), ui.st);
  await page.evaluate(() => { const li = document.querySelector('#v531-panel .li'); if (li) li.click(); });
  await page.waitForTimeout(400);
  const det = await page.evaluate(() => (document.getElementById('v531-detail') || {}).textContent || '');
  ok("cliquer une entrée ouvre sa fiche", det.length > 40, det.slice(0, 70));

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
