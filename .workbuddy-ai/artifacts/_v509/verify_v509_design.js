// Banc v509 — DESIGN SYSTEM UNIFIÉ (Niveau 3, item 6).
//
// Vérifie que les JETONS sont définis (variables CSS sur :root) et que les
// COMPOSANTS communs (.ui-btn, .ui-panel, .ui-card, .ui-badge) rendent avec les
// valeurs des jetons (accent, rayon, bordure).
//
// Usage : node verify_v509_design.js [--port 8765]

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
  console.log("BANC v509 — DESIGN SYSTEM UNIFIÉ (jetons + composants)");
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

  section("1. Jetons (variables CSS sur :root)");
  const jetons = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const noms = ['--ui-accent', '--ui-ink', '--ui-panel', '--ui-border', '--ui-radius', '--ui-space-3', '--ui-font'];
    const out = {};
    noms.forEach(n => out[n] = (cs.getPropertyValue(n) || '').trim());
    return { style: !!document.getElementById('v509-tokens'), out };
  });
  ok("la feuille de jetons est injectée (#v509-tokens)", jetons.style);
  ok("--ui-accent défini", /#e5c15a/i.test(jetons.out['--ui-accent'] || ''), jetons.out['--ui-accent']);
  ok("--ui-ink défini", (jetons.out['--ui-ink'] || '').length > 0, jetons.out['--ui-ink']);
  ok("--ui-panel défini", (jetons.out['--ui-panel'] || '').length > 0, jetons.out['--ui-panel']);
  ok("--ui-radius défini (10px)", /10px/.test(jetons.out['--ui-radius'] || ''), jetons.out['--ui-radius']);
  ok("--ui-space-3 défini", (jetons.out['--ui-space-3'] || '').length > 0, jetons.out['--ui-space-3']);

  section("2. Composants rendus avec les jetons");
  const comp = await page.evaluate(() => {
    const hote = document.createElement('div');
    hote.style.position = 'absolute'; hote.style.left = '-9999px'; hote.style.top = '0';
    hote.innerHTML = '<button class="ui-btn primary">OK</button><div class="ui-panel">P</div><span class="ui-badge">B</span><div class="ui-card">C</div>';
    document.body.appendChild(hote);
    const btn = hote.querySelector('.ui-btn');
    const pan = hote.querySelector('.ui-panel');
    const badge = hote.querySelector('.ui-badge');
    const card = hote.querySelector('.ui-card');
    const csBtn = getComputedStyle(btn), csPan = getComputedStyle(pan), csBadge = getComputedStyle(badge), csCard = getComputedStyle(card);
    return {
      btnBgImage: csBtn.backgroundImage, btnBgColor: csBtn.backgroundColor, btnRadius: csBtn.borderRadius,
      panRadius: csPan.borderRadius, panBg: csPan.backgroundColor, panShadow: csPan.boxShadow,
      badgeColor: csBadge.color, cardBg: csCard.backgroundColor,
    };
  });
  ok(".ui-btn.primary utilise le dégradé de l'accent", /229,\s*193,\s*90/.test(comp.btnBgImage + comp.btnBgColor), comp.btnBgImage.slice(0, 60));
  ok(".ui-panel a le rayon du jeton (10px)", comp.panRadius === '10px', comp.panRadius);
  ok(".ui-panel a une ombre", comp.panShadow && comp.panShadow !== 'none', comp.panShadow.slice(0, 40));
  ok(".ui-badge prend la couleur d'accent", /229,\s*193,\s*90/.test(comp.badgeColor), comp.badgeColor);
  ok(".ui-card a un fond de panneau", comp.cardBg && comp.cardBg !== 'rgba(0, 0, 0, 0)', comp.cardBg);

  section("3. Propreté");
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
