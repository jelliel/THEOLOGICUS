// Banc v515 — SYNOPSE : EXPORT / PARTAGE (copier + télécharger en Markdown).
//
// Vérifie que la synopse peut être PARTAGÉE :
//   - bouton « 📋 Copier » -> presse-papiers (Markdown structuré) ;
//   - bouton « ⬇️ Markdown » -> téléchargement d'un .md nommé d'après la réf ;
//   - le texte contient la référence, les versions, leur provenance et le texte ;
//   - en mode « chapitre entier », les versets sont NUMÉROTÉS dans l'export.
//
// Usage : node verify_v515_synopse_export.js [--port 8765]

const path = require("path");
const fs = require("fs");
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
  console.log("BANC v515 — SYNOPSE : EXPORT / PARTAGE");
  console.log(BASE);
  console.log("=".repeat(72));
  if (!await assurerRelais()) { console.log("\nRelais injoignable."); process.exit(2); }

  const optionsNav = Object.assign({ args: ["--no-sandbox", "--no-proxy-server"] },
    process.env.PW_DIR ? { executablePath: path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe") } : {});
  const browser = await chromium.launch(optionsNav);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
    acceptDownloads: true,
  });
  const page = await context.newPage();
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

  section("1. Ouverture de la synopse (Genèse 1:1)");
  await page.evaluate(() => window.__v506Synopse.ouvrir("Genèse 1:1"));
  await page.waitForFunction(() => { const p = document.getElementById('v506-syn'); return p && p.classList.contains('open') && p.querySelectorAll('#v506-c .v').length > 0; }, { timeout: 30000 });
  const btns = await page.evaluate(() => {
    const p = document.getElementById('v506-syn');
    return ['v506-copy', 'v506-export'].map(id => {
      const b = p.querySelector('#' + id);
      return { id: id, present: !!b, uiBtn: !!(b && b.classList.contains('ui-btn')), visible: !!(b && b.offsetParent) };
    });
  });
  ok("le bouton « Copier » existe, visible, en ui-btn", btns[0].present && btns[0].visible && btns[0].uiBtn, JSON.stringify(btns[0]));
  ok("le bouton « Markdown » existe, visible, en ui-btn", btns[1].present && btns[1].visible && btns[1].uiBtn, JSON.stringify(btns[1]));

  section("2. Le texte exporté est structuré (Markdown)");
  const txt = await page.evaluate(() => window.__v506Synopse.texte());
  ok("le texte commence par le titre + la référence", /^# Synopse — Genèse 1:1/.test(txt), JSON.stringify(txt.slice(0, 40)));
  ok("il contient les 4 versions attendues (fr/la/syr/hb)", ["## Français", "## Latin", "## Syriaque", "## Hébreu"].every(x => txt.includes(x)), (txt.match(/^## .*/gm) || []).join(" | "));
  ok("il porte la provenance (Bible de Jérusalem)", /Bible de Jérusalem/.test(txt));
  ok("il contient le texte du verset (« commencement »)", /commencement/i.test(txt));
  ok("il se termine par la signature THEOLOGICUS", /Généré par THEOLOGICUS/.test(txt));

  section("3. Bouton « Copier » -> presse-papiers");
  await page.evaluate(() => document.getElementById('v506-copy').click());
  await page.waitForTimeout(400);
  const fb = await page.evaluate(() => document.getElementById('v506-copy').textContent);
  ok("le bouton confirme la copie (✓ Copié)", /Copi/.test(fb), fb);
  let clip = '';
  try { clip = await page.evaluate(() => navigator.clipboard.readText()); } catch (e) {}
  ok("le presse-papiers contient la synopse", clip.length > 0 && /# Synopse — Genèse 1:1/.test(clip), JSON.stringify(clip.slice(0, 40)));

  section("4. Bouton « Markdown » -> téléchargement d'un fichier .md");
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 15000 }),
    page.evaluate(() => document.getElementById('v506-export').click()),
  ]);
  const nom = download.suggestedFilename();
  ok("le fichier est un .md nommé d'après la référence", /^synopse_.*\.md$/.test(nom), nom);
  let contenu = '';
  try { contenu = fs.readFileSync(await download.path(), "utf8"); } catch (e) { contenu = ""; }
  ok("le fichier téléchargé contient la synopse", /# Synopse — Genèse 1:1/.test(contenu) && /## Français/.test(contenu), JSON.stringify(contenu.slice(0, 40)));

  section("5. En mode « chapitre entier », l'export NUMÉROTE les versets");
  await page.evaluate(() => document.getElementById('v506-mode').click());
  // attendre que le mode soit effectivement rendu (rendu asynchrone)
  try { await page.waitForFunction(() => /\(entier\)/.test(document.getElementById('v506-ref').textContent), { timeout: 15000 }); } catch (e) {}
  await page.waitForTimeout(200);
  const txtCh = await page.evaluate(() => window.__v506Synopse.texte());
  ok("l'export du chapitre porte la mention (entier)", /Genèse 1 \(entier\)/.test(txtCh), (txtCh.split("\n")[0] || ""));
  ok("les versets sont numérotés dans l'export (« 1. »)", /^1\. /m.test(txtCh), (txtCh.match(/^\d+\. .*/m) || [""])[0].slice(0, 50));

  section("6. Non-régression de la navigation (v512)");
  await page.evaluate(() => document.getElementById('v506-next').click());
  await page.waitForTimeout(350);
  const ref = await page.evaluate(() => document.getElementById('v506-ref').textContent);
  ok("Suivant -> Genèse 2 (entier) depuis le mode chapitre", /Genèse 2 \(entier\)/.test(ref), ref);

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
