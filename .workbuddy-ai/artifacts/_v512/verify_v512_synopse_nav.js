// Banc v512 — SYNOPSE : NAVIGATION (verset précédent/suivant, chapitre entier).
//
// Vérifie que la synopse (v506) sait désormais NAVIGUER :
//   - verset suivant / précédent, y compris en FRANCHISSANT les bornes de
//     chapitre (dernier verset d'un chapitre -> premier du suivant) ;
//   - mode « chapitre entier » (toutes les versions, tous les versets) ;
//   - la référence courante s'affiche et se met à jour ;
//   - le bandeau de navigation adopte le DESIGN SYSTEM (composants ui-*).
//
// Usage : node verify_v512_synopse_nav.js [--port 8765]

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

// Ouvre la synopse d'une référence par l'API du module (déterministe).
async function ouvrirSyn(page, ref) {
  await page.evaluate((r) => { window.__v506Synopse.ouvrir(r); }, ref);
  await page.waitForFunction(() => {
    const p = document.getElementById('v506-syn');
    return p && p.classList.contains('open') && p.querySelectorAll('#v506-c .v').length > 0;
  }, { timeout: 30000 });
}
async function etat(page) {
  return page.evaluate(() => {
    const p = document.getElementById('v506-syn');
    return {
      ouvert: p.classList.contains('open'),
      titre: p.querySelector('#v506-t').textContent,
      ref: p.querySelector('#v506-ref').textContent,
      mode: p.querySelector('#v506-mode').textContent,
      navBtns: ['v506-prev', 'v506-next', 'v506-mode'].map(id => {
        const b = p.querySelector('#' + id);
        return { id: id, uiBtn: !!(b && b.classList.contains('ui-btn')), visible: !!(b && b.offsetParent) };
      }),
      versions: p.querySelectorAll('#v506-c .v').length,
      vv: p.querySelectorAll('#v506-c .v .vv').length,
    };
  });
}
async function suivant(page) { await page.evaluate(() => document.getElementById('v506-next').click()); await page.waitForTimeout(350); }
async function precedent(page) { await page.evaluate(() => document.getElementById('v506-prev').click()); await page.waitForTimeout(350); }
async function bascule(page) { await page.evaluate(() => document.getElementById('v506-mode').click()); await page.waitForTimeout(350); }
// Le rendu des versions est ASYNCHRONE (5 scripts, dont un 404 grec hors NT) :
// attendre l'état attendu plutôt qu'un délai fixe (sinon flaky).
async function attendre(page, pred, timeout = 20000) { try { await page.waitForFunction(pred, { timeout }); } catch (e) {} }

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v512 — SYNOPSE : NAVIGATION");
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
  ok("le module de synopse est chargé", await page.evaluate(() => !!window.__v506Synopse));

  section("1. Ouverture sur Genèse 1:1 — bandeau de navigation");
  await ouvrirSyn(page, "Genèse 1:1");
  const e1 = await etat(page);
  ok("la synopse s'ouvre", e1.ouvert);
  ok("la référence courante est Genèse 1:1", /Genèse 1:1/.test(e1.ref), e1.ref);
  ok("les 3 boutons de navigation existent et sont visibles", e1.navBtns.every(b => b.visible), JSON.stringify(e1.navBtns));
  ok("le bandeau adopte le design system (composants ui-btn)", e1.navBtns.every(b => b.uiBtn), JSON.stringify(e1.navBtns.map(b => b.id + '=' + b.uiBtn)));

  section("2. Verset SUIVANT");
  await suivant(page);
  await attendre(page, () => document.querySelectorAll('#v506-syn #v506-c .v').length >= 4);
  const e2 = await etat(page);
  ok("la référence devient Genèse 1:2", /Genèse 1:2/.test(e2.ref), e2.ref);
  ok("le contenu est re-rendu (blocs présents)", e2.versions >= 4, "versions=" + e2.versions);

  section("3. Verset PRÉCÉDENT (retour)");
  await precedent(page);
  const e3 = await etat(page);
  ok("la référence revient à Genèse 1:1", /Genèse 1:1/.test(e3.ref), e3.ref);

  section("4. Précédent au tout début NE franchit PAS la borne (Genèse 1:1)");
  await precedent(page);
  const e4 = await etat(page);
  ok("on reste sur Genèse 1:1 (aucun chapitre avant)", /Genèse 1:1/.test(e4.ref), e4.ref);

  section("5. Franchissement de borne : dernier verset -> chapitre suivant");
  await ouvrirSyn(page, "Genèse 1:31");
  const e5a = await etat(page);
  ok("départ sur Genèse 1:31", /Genèse 1:31/.test(e5a.ref), e5a.ref);
  await suivant(page);
  const e5b = await etat(page);
  ok("Genèse 1:31 + Suivant -> Genèse 2:1", /Genèse 2:1/.test(e5b.ref), e5b.ref);

  section("6. Franchissement inverse : premier verset -> chapitre précédent");
  await precedent(page);
  const e6 = await etat(page);
  ok("Genèse 2:1 - Précédent -> dernier verset de Genèse 1", /Genèse 1:(2[0-9]|3[0-9])/.test(e6.ref), e6.ref);

  section("7. Mode « chapitre entier »");
  await ouvrirSyn(page, "Genèse 1:1");
  const avant = await etat(page);
  await bascule(page);
  await attendre(page, () => document.querySelectorAll('#v506-syn #v506-c .v .vv').length >= 31);
  const e7 = await etat(page);
  ok("le mode bascule vers « chapitre entier »", /entier/.test(e7.ref), e7.ref);
  ok("le bouton propose le retour « verset seul »", /[Vv]erset seul/.test(e7.mode), e7.mode);
  ok("le chapitre entier affiche TOUS les versets (>= 31)", e7.vv >= 31, "vv=" + e7.vv + " (avant=" + avant.vv + ")");
  await bascule(page);
  const e7b = await etat(page);
  ok("retour au mode verset (référence ponctuelle)", /Genèse 1:1$/.test(e7b.ref), e7b.ref);

  section("8. Navigation en mode chapitre (chapitre suivant)");
  await bascule(page);                       // -> chapitre entier
  await suivant(page);                       // -> Genèse 2 (entier)
  await attendre(page, () => document.querySelectorAll('#v506-syn #v506-c .v .vv').length >= 20);
  const e8 = await etat(page);
  ok("chapitre entier + Suivant -> Genèse 2 (entier)", /Genèse 2 \(entier\)/.test(e8.ref), e8.ref);
  ok("le chapitre 2 contient des versets", e8.vv >= 20, "vv=" + e8.vv);

  section("9. Fermeture");
  const ferme = await page.evaluate(() => { window.__v506Synopse.fermer(); const p = document.getElementById('v506-syn'); return !p || !p.classList.contains('open'); });
  ok("la synopse se ferme", ferme);

  section("10. Propreté");
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
