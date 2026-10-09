// Banc v506 — SYNOPSE MULTI-VERSIONS + PROVENANCE (Niveau 2, consolidation).
//
// Vérifie : le bouton « 📊 Synopse » d'un résultat biblique ouvre un panneau
// comparant les versions disponibles (français, latin, grec, syriaque, hébreu)
// AVEC leur provenance (édition · langue · datation). Les textes grec/hébreu
// strong-taggés sont nettoyés (pas de « | »).
//
// Usage : node verify_v506_synopse.js [--port 8765]

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

// Ouvre la synopse d'une référence en passant par la recherche (bouton réel).
async function synopse(page, requete, ref) {
  await page.evaluate((q) => {
    const i = document.getElementById('v180-qin'); if (i) { i.value = q; i.dispatchEvent(new Event('input', { bubbles: true })); }
  }, requete);
  await page.waitForFunction((rf) => {
    const b = document.getElementById('v180-body');
    return !!b && !!Array.from(b.querySelectorAll('[data-syn]')).find(x => x.dataset.syn === rf);
  }, ref, { timeout: 30000 });
  await page.evaluate((rf) => {
    const b = document.getElementById('v180-body');
    const btn = Array.from(b.querySelectorAll('[data-syn]')).find(x => x.dataset.syn === rf);
    if (btn) btn.click();
  }, ref);
  await page.waitForFunction(() => {
    const p = document.getElementById('v506-syn');
    return p && p.classList.contains('open') && p.querySelectorAll('#v506-c .v').length > 0;
  }, { timeout: 30000 });
  return page.evaluate(() => {
    const p = document.getElementById('v506-syn');
    return {
      ouvert: p.classList.contains('open'),
      titre: p.querySelector('#v506-t').textContent,
      versions: Array.from(p.querySelectorAll('#v506-c .v')).map(v => ({
        nom: v.querySelector('.vh').textContent,
        prov: v.querySelector('.vp').textContent,
        texte: v.querySelector('.vt').textContent,
      })),
    };
  });
}

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v506 — SYNOPSE MULTI-VERSIONS + PROVENANCE");
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

  section("0. Ouverture de l'application + recherche globale");
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
  await page.evaluate(() => { const b = document.getElementById('open-gsearch'); if (b) b.click(); });
  ok("la recherche globale s'ouvre", await page.evaluate(() => { const p = document.getElementById('v180-gs'); return !!p && p.classList.contains('open'); }));

  section("1. Synopse d'une référence de l'AT — Genèse 1:1");
  const s1 = await synopse(page, "commencement", "Genèse 1:1");
  ok("le panneau de synopse s'ouvre", s1.ouvert);
  ok("le titre porte la référence", /Genèse 1:1/.test(s1.titre), s1.titre);
  ok("au moins 4 versions (fr, la, syr, hb)", s1.versions.length >= 4, "n=" + s1.versions.length + " -> " + s1.versions.map(v => v.nom).join(", "));
  const noms1 = s1.versions.map(v => v.nom);
  ok("le français est présent", noms1.includes("Français"));
  ok("le latin (Vulgate) est présent", noms1.includes("Latin"));
  ok("l'hébreu est présent (AT)", noms1.includes("Hébreu"));

  section("2. Provenance affichée (édition · langue · datation)");
  const fr = s1.versions.find(v => v.nom === "Français") || {};
  const la = s1.versions.find(v => v.nom === "Latin") || {};
  ok("provenance FR = Bible de Jérusalem", /Bible de Jérusalem/.test(fr.prov || ""), fr.prov);
  ok("provenance LA = Vulgate Clémentine", /Vulgate Clémentine/.test(la.prov || ""), la.prov);
  ok("toutes les versions portent une provenance (2 séparateurs ·)", s1.versions.every(v => (v.prov || "").split("·").length >= 3), JSON.stringify(s1.versions.map(v => v.prov)));

  section("3. Texte hébreu nettoyé (pas de balises strong)");
  const hb = s1.versions.find(v => v.nom === "Hébreu") || {};
  ok("l'hébreu contient des caractères hébreux", /[\u0590-\u05FF]/.test(hb.texte || ""), (hb.texte || "").slice(0, 40));
  ok("l'hébreu n'expose PAS les balises strong (aucun « | »)", !/\|/.test(hb.texte || ""), (hb.texte || "").slice(0, 60));

  section("4. Synopse d'une référence du NT — Jean 3:16");
  // Appel direct : la recherche « par mot » s'arrête à 40 résultats (remplis par
  // l'AT), donc un mot du NT n'y figure pas. On teste ici la synopse elle-même.
  await page.evaluate(() => { if (window.__v506Synopse) window.__v506Synopse.fermer(); });
  await page.evaluate(() => { window.__v506Synopse.ouvrir("Jean 3:16"); });
  await page.waitForFunction(() => {
    const p = document.getElementById('v506-syn');
    return p && p.classList.contains('open') && p.querySelectorAll('#v506-c .v').length > 0;
  }, { timeout: 30000 });
  const s2 = await page.evaluate(() => {
    const p = document.getElementById('v506-syn');
    return { versions: Array.from(p.querySelectorAll('#v506-c .v')).map(v => ({ nom: v.querySelector('.vh').textContent, prov: v.querySelector('.vp').textContent, texte: v.querySelector('.vt').textContent })) };
  });
  const noms2 = s2.versions.map(v => v.nom);
  ok("le grec est présent (NT)", noms2.includes("Grec"), noms2.join(", "));
  const gr = s2.versions.find(v => v.nom === "Grec") || {};
  ok("le grec est nettoyé (aucun « | »)", gr.texte && !/\|/.test(gr.texte), (gr.texte || "").slice(0, 60));
  ok("l'hébreu est ABSENT du NT (pas de faux bloc)", !noms2.includes("Hébreu"), noms2.join(", "));

  section("5. Fermeture");
  const ferme = await page.evaluate(() => {
    if (window.__v506Synopse) window.__v506Synopse.fermer();
    const p = document.getElementById('v506-syn');
    return !p || !p.classList.contains('open');
  });
  ok("la synopse se ferme", ferme);

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
