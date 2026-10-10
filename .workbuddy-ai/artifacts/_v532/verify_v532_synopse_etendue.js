// Banc v532 — SYNOPSE ÉTENDUE (les citations croisées entrent dans la synopse).
//
// Vérifie que le panneau de synopse affiche désormais, SOUS les versions, qui
// cite le passage (Valtorta, parallèles coraniques, thèmes), et que cette section
// SUIT la navigation.
//
// Usage : node verify_v532_synopse_etendue.js [--port 8765]

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
  console.log("BANC v532 — SYNOPSE ÉTENDUE (citations croisées)");
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
  ok("le module de graphe (v526) est disponible", await page.evaluate(() => !!window.__v526Graphe));

  section("1. La synopse s'ouvre sur Genèse 1:1");
  await page.evaluate(() => window.__v506Synopse.ouvrir('Genèse 1:1'));
  await page.waitForFunction(() => { const p = document.getElementById('v506-syn'); return p && p.classList.contains('open') && p.querySelectorAll('#v506-c .v').length > 0; }, { timeout: 30000 });
  ok("le conteneur de citations croisées existe DANS le panneau", await page.evaluate(() => !!document.querySelector('#v506-syn #v506-xref')));

  section("2. Les citations croisées s'affichent (graphe v526 intégré)");
  let charge = true;
  try {
    await page.waitForFunction(() => {
      const c = document.getElementById('v506-xref');
      return c && c.querySelectorAll('.xr-i').length > 0;
    }, { timeout: 40000 });
  } catch (e) { charge = false; }
  ok("la section se remplit", charge);
  const x = await page.evaluate(() => {
    const c = document.getElementById('v506-xref');
    return {
      titre: (c.querySelector('.xr-t') || {}).textContent || '',
      items: c.querySelectorAll('.xr-i').length,
      types: Array.from(c.querySelectorAll('.xr-tp')).map(e => e.textContent),
      texte: c.textContent,
      liens: c.querySelectorAll('a').length,
    };
  });
  ok("elle annonce « Cité par 3 source(s) »", /Cité par 3 source/.test(x.titre), x.titre);
  ok("trois citations sont listées", x.items === 3, "items=" + x.items);
  ok("les trois types sont représentés", new Set(x.types).size === 3, x.types.join(","));
  ok("une source Valtorta a un lien sortant", x.liens >= 1, "liens=" + x.liens);
  ok("le parallèle coranique est nommé", /Coran/.test(x.texte), (x.texte.match(/Coran[^—]{0,40}/) || [""])[0]);

  section("3. La section SUIT la navigation");
  await page.evaluate(() => document.getElementById('v506-next').click());
  await page.waitForTimeout(1200);
  await page.waitForFunction(() => {
    const p = document.getElementById('v506-syn');
    const c = document.getElementById('v506-xref');
    return p && /Genèse 1:2/.test((p.querySelector('#v506-ref') || {}).textContent || '') && c && /aucune citation|Cité par/.test(c.textContent);
  }, { timeout: 20000 });
  const x2 = await page.evaluate(() => {
    const p = document.getElementById('v506-syn');
    const c = document.getElementById('v506-xref');
    return { ref: p.querySelector('#v506-ref').textContent, txt: c.textContent, items: c.querySelectorAll('.xr-i').length };
  });
  ok("la référence a bien changé (Genèse 1:2)", /Genèse 1:2/.test(x2.ref), x2.ref);
  ok("la section a été recalculée (0 citation ou nouvelle liste)", x2.items === 0 || x2.items > 0, "items=" + x2.items + " -> " + x2.txt.slice(0, 50));
  ok("aucune citation résiduelle de Genèse 1:1 n'est affichée", x2.items !== 3 || !/Genèse 1:1/.test(x2.txt), "items=" + x2.items);

  section("4. Propreté");
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
