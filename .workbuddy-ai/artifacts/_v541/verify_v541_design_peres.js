// Banc v541 — PANNEAU PÈRES (v167) MIGRÉ AU DESIGN SYSTEM (Axe 3, lot C1).
//
// Banc de CARACTÉRISATION d'abord (ouvre le panneau sur un verset, prouve
// qu'il rend du contenu / un état, bouton de fermeture, titre), puis vérifie
// la migration : le chrome utilise les jetons --ui-* et le bouton porte ui-btn.
//
// ⚠️ Écrit AVANT la migration (TDD) : les assertions de jetons échouent d'abord,
// puis passent une fois le panneau migré. Une régression de caractérisation
// après migration = vrai défaut.
//
// Usage : node verify_v541_design_peres.js [--port 8765]

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

let relais = null;
async function relaisVit() { try { const r = await fetch(`http://127.0.0.1:${PORT}/__theologicus_ping`, { signal: AbortSignal.timeout(3000) }); return r.status === 200; } catch (e) { return false; } }
async function assurerRelais() {
  tuerPort(PORT); await new Promise(r => setTimeout(r, 1500));
  console.log("  … lancement de proxy_server.py (port " + PORT + ")");
  relais = spawn(PY, ["-u", "proxy_server.py"], { cwd: RACINE, stdio: "ignore", windowsHide: true });
  for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 500)); if (await relaisVit()) return true; if (relais.exitCode !== null) return false; }
  return false;
}

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v541 — PANNEAU PÈRES MIGRÉ AU DESIGN SYSTEM");
  console.log(BASE);
  console.log("=".repeat(72));
  if (!await assurerRelais()) { console.log("\nRelais injoignable."); process.exit(2); }

  const optionsNav = Object.assign({ args: ["--no-sandbox", "--no-proxy-server"] },
    process.env.PW_DIR ? { executablePath: path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe") } : {});
  const browser = await chromium.launch(optionsNav);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const erreurs = [];
  const BRUIT = /version\.txt|Failed to load resource|net::ERR|Failed to fetch|401|403|404|Unauthorized|\[corpus\]|jspdf|html2canvas/i;
  page.on("pageerror", e => erreurs.push(String(e)));
  page.on("console", m => { if (m.type() === "error" && !BRUIT.test(m.text())) erreurs.push("console: " + m.text()); });
  page.on("dialog", d => d.accept());

  await page.addInitScript(() => {
    try {
      localStorage.setItem("theologicus_wizard_skipped", "1");
      localStorage.setItem("theo_sync_on_v1", "0");   /* isolation */
    } catch (e) {}
  });

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
  await page.evaluate(() => { const ov = document.getElementById('setup-wizard-overlay'); if (ov) { ov.classList.remove('active'); ov.style.display = 'none'; } }).catch(() => {});
  await page.waitForTimeout(1200);
  ok("l'API d'ouverture des Pères existe", await page.evaluate(() => typeof window.__v167OpenPanel === 'function'));

  section("1. CARACTÉRISATION : le panneau fonctionne");
  const usagesAvant = await page.evaluate(() => window.__v509Design ? window.__v509Design.audit().usages : -1);
  await page.evaluate(() => window.__v167OpenPanel("Jn 3:16"));
  await page.waitForFunction(() => {
    const p = document.getElementById('v167-pat');
    return p && p.classList.contains('open');
  }, { timeout: 20000 });
  /* le corps se remplit en asynchrone (corpus à la demande) */
  await page.waitForFunction(() => document.querySelectorAll('#v167-body .v167-item').length > 0 || (document.getElementById('v167-body') && document.getElementById('v167-body').childElementCount > 0) || (document.getElementById('v167-status') && document.getElementById('v167-status').textContent.length > 0), { timeout: 30000 }).catch(() => {});
  const car = await page.evaluate(() => ({
    titre: (document.getElementById('v167-title') || {}).textContent || '',
    items: document.querySelectorAll('#v167-body .v167-item').length,
    enfants: document.getElementById('v167-body') ? document.getElementById('v167-body').childElementCount : 0,
    statut: (document.getElementById('v167-status') || {}).textContent || '',
    close: !!document.getElementById('v167-close')
  }));
  ok("le titre annonce les Pères", /Pères/.test(car.titre), car.titre);
  ok("le bouton de fermeture existe", car.close);
  ok("le panneau a rendu du contenu (extraits ou état)", car.items > 0 || car.enfants > 0 || car.statut.length > 0, "items=" + car.items + " enfants=" + car.enfants + " statut=" + car.statut.length);

  section("2. MIGRATION : le chrome utilise les jetons --ui-*");
  const tok = await page.evaluate(() => {
    function resoudre(prop, expr) {
      const s = document.createElement('div');
      s.style.position = 'absolute'; s.style.left = '-9999px';
      s.style[prop] = expr;
      document.body.appendChild(s);
      const v = getComputedStyle(s)[prop];
      s.remove();
      return v;
    }
    const box = document.getElementById('v167-box');
    const head = document.getElementById('v167-head');
    const csBox = getComputedStyle(box);
    const csHead = getComputedStyle(head);
    return {
      uiPanel: resoudre('backgroundColor', 'var(--ui-panel)'),
      bgBox: csBox.backgroundColor,
      uiBorder: resoudre('borderTopColor', 'var(--ui-border)'),
      bordureBox: csBox.borderTopColor,
      uiAccent: resoudre('color', 'var(--ui-accent)'),
      couleurHead: csHead.color,
      clsBox: box.className,
      clsClose: (document.getElementById('v167-close') || {}).className || '',
      usages: window.__v509Design ? window.__v509Design.audit().usages : -1
    };
  });
  console.log("  jeton --ui-panel=" + tok.uiPanel + "  fond du panneau=" + tok.bgBox);
  ok("#v167-box porte la classe ui-panel", /\bui-panel\b/.test(tok.clsBox), tok.clsBox);
  ok("le fond du panneau est le jeton --ui-panel", tok.bgBox === tok.uiPanel, tok.bgBox + " vs " + tok.uiPanel);
  ok("la bordure du panneau est le jeton --ui-border", tok.bordureBox === tok.uiBorder, tok.bordureBox + " vs " + tok.uiBorder);
  ok("le titre utilise le jeton --ui-accent", tok.couleurHead === tok.uiAccent, tok.couleurHead + " vs " + tok.uiAccent);
  ok("la fermeture porte ui-btn", /\bui-btn\b/.test(tok.clsClose), tok.clsClose);
  ok("l'auditeur voit des composants ui-* en plus", tok.usages > usagesAvant, "avant=" + usagesAvant + " après=" + tok.usages);

  section("3. La migration n'a RIEN cassé");
  const apres = await page.evaluate(() => ({
    titre: (document.getElementById('v167-title') || {}).textContent || '',
    items: document.querySelectorAll('#v167-body .v167-item').length,
    enfants: document.getElementById('v167-body') ? document.getElementById('v167-body').childElementCount : 0
  }));
  ok("le titre est intact", /Pères/.test(apres.titre), apres.titre);
  ok("le contenu est intact", apres.items === car.items && apres.enfants === car.enfants, car.items + "/" + car.enfants + " -> " + apres.items + "/" + apres.enfants);
  /* fermeture */
  await page.evaluate(() => document.getElementById('v167-close').click());
  await page.waitForTimeout(300);
  ok("le panneau se ferme toujours", await page.evaluate(() => !document.getElementById('v167-pat').classList.contains('open')));

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
