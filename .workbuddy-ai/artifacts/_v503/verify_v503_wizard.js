// Banc v503 — WIZARD PAS-À-PAS (visite guidée avec projecteur) dans AI VIDEO.
//
// Vérifie : lanceur dans le panneau, ouverture, 5 étapes, projecteur POSITIONNÉ
// sur le bon contrôle, navigation, textes par étape, bouton « Terminer »,
// sortie, et bascule de mode quand la cible l'exige.
//
// Usage : node verify_v503_wizard.js [--port 8765]

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
  console.log("BANC v503 — WIZARD PAS-À-PAS (VISITE GUIDÉE)");
  console.log(BASE);
  console.log("=".repeat(72));
  if (!await assurerRelais()) { console.log("\nRelais injoignable."); process.exit(2); }

  const optionsNav = Object.assign({ args: ["--no-sandbox", "--no-proxy-server"] },
    process.env.PW_DIR ? { executablePath: path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe") } : {});
  const browser = await chromium.launch(optionsNav);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const erreurs = [];
  const BRUIT = /version\.txt|Failed to load resource|net::ERR|Failed to fetch|401|403|404|Unauthorized|500/i;
  page.on("pageerror", e => erreurs.push(String(e)));
  page.on("console", m => { if (m.type() === "error" && !BRUIT.test(m.text())) erreurs.push("console: " + m.text()); });

  await page.addInitScript(() => {
    try { localStorage.setItem("theologicus_wizard_skipped", "1"); localStorage.setItem("agnes_api_key", "sk-test"); localStorage.setItem("theologicus_onboard_vu", "1"); } catch (e) {}
  });

  section("0. Ouverture de AI VIDEO");
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
  const mb = await page.$("#v159-media-btn");
  if (mb) { await masquerWizard(page); await mb.click({ force: true }); await page.waitForTimeout(300); }
  await masquerWizard(page);
  await page.waitForSelector("#open-aivideo-modal", { state: "visible", timeout: 30000 });
  await page.waitForTimeout(400);
  await masquerWizard(page);
  await page.click("#open-aivideo-modal", { force: true });
  await page.waitForFunction(() => { const f = document.getElementById("aivideo-frame"); const d = f && f.contentDocument; return !!d && !!d.body; }, { timeout: 30000 });
  const evalW = (fn, arg) => page.evaluate(fn, arg);

  section("1. Lanceur + ouverture");
  const lanceur = await evalW(() => {
    const d = document.getElementById("aivideo-frame").contentDocument;
    const b = d.getElementById("tour-btn");
    if (b) b.click();
    return { bouton: !!b, ouvert: d.getElementById("tour").classList.contains("open") };
  });
  ok("le lanceur « Visite guidée » existe dans le panneau", lanceur.bouton);
  ok("le clic ouvre le wizard", lanceur.ouvert);

  section("2. Projecteur positionné sur le bon contrôle");
  const proj = await evalW(() => {
    const d = document.getElementById("aivideo-frame").contentDocument;
    const hole = d.getElementById("tour-hole").getBoundingClientRect();
    const cible = d.querySelector('#api-key-input').getBoundingClientRect();
    const centre = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    const hc = centre(hole), cc = centre(cible);
    return { w: Math.round(hole.width), h: Math.round(hole.height), dx: Math.round(Math.abs(hc.x - cc.x)), dy: Math.round(Math.abs(hc.y - cc.y)), count: d.getElementById("tour-count").textContent, titre: d.getElementById("tour-t").textContent };
  });
  ok("le projecteur a une taille réelle", proj.w > 40 && proj.h > 10, proj.w + "x" + proj.h);
  ok("le projecteur est centré sur la cible (clé Agnes)", proj.dx < 20 && proj.dy < 20, "dx=" + proj.dx + " dy=" + proj.dy);
  ok("le compteur affiche 1 / 5", proj.count === "1 / 5", proj.count);
  ok("le titre de l'étape 1 est correct", /clé Agnes/i.test(proj.titre), proj.titre);

  section("3. Navigation + textes par étape");
  const nav = await evalW(() => {
    const d = document.getElementById("aivideo-frame").contentDocument;
    const w = d.defaultView;
    const titres = [d.getElementById("tour-t").textContent];
    for (let i = 0; i < 4; i++) { d.getElementById("tour-next").click(); titres.push(d.getElementById("tour-t").textContent); }
    const dernier = d.getElementById("tour-next").textContent;
    d.getElementById("tour-prev").click();
    const apresRetour = w.__v503.courant();
    return { titres, dernier, apresRetour, total: w.__v503.total };
  });
  ok("5 étapes", nav.total === 5, "total=" + nav.total);
  ok("les titres changent à chaque étape", new Set(nav.titres).size === 5, JSON.stringify(nav.titres));
  ok("dernier bouton = « Terminer ✓ »", /Terminer/i.test(nav.dernier), nav.dernier);
  ok("« Précédent » recule (4 -> 3)", nav.apresRetour === 3, "courant=" + nav.apresRetour);

  section("4. Bascule de mode quand la cible l'exige");
  const mode = await evalW(() => {
    const d = document.getElementById("aivideo-frame").contentDocument;
    const w = d.defaultView;
    w.__v503.etape(0);
    w.__v503.etape(3);   // étape « scène » : doit passer en mode image
    return { mode: w.__v502.etat.mode };
  });
  ok("l'étape « scène » active le mode image", mode.mode === "image", "mode=" + mode.mode);

  section("5. Terminer + Quitter");
  const fin = await evalW(() => {
    const d = document.getElementById("aivideo-frame").contentDocument;
    const w = d.defaultView;
    w.__v503.etape(4);
    d.getElementById("tour-next").click();   // Terminer
    const apresTerminer = d.getElementById("tour").classList.contains("open");
    d.getElementById("tour-btn").click();
    d.getElementById("tour-skip").click();
    const apresQuitter = d.getElementById("tour").classList.contains("open");
    return { apresTerminer, apresQuitter };
  });
  ok("« Terminer » ferme le wizard", fin.apresTerminer === false);
  ok("« Quitter » ferme le wizard", fin.apresQuitter === false);

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
