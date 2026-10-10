// Banc v536 — DOSSIER DE PASSAGE (étude unifiée).
//
// Vérifie que le dossier rassemble RÉELLEMENT, en un document : le texte dans les
// versions disponibles AVEC leur provenance, qui cite le passage, les thèmes liés
// et les notes de l'utilisateur.
//
// Usage : node verify_v536_dossier.js [--port 8765]

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
  console.log("BANC v536 — DOSSIER DE PASSAGE");
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
  ok("le module v536 est chargé", await page.evaluate(() => !!window.__v536Dossier));
  ok("le bouton « 📚 DOSSIER » est présent", await page.evaluate(() => !!document.getElementById('open-dossier')));

  section("1. Composition sur Genèse 1:1 (AT)");
  const d = await page.evaluate(() => window.__v536Dossier.compose('Genèse 1:1'));
  ok("le dossier est composé", !!d, d ? d.ref : 'null');
  ok("les versions de l'AT sont là (fr, la, syr, hb)", d.versions.length === 4, d.versions.map(v => v.nom).join(","));
  ok("le français est présent", d.versions.some(v => v.nom === 'Français'));
  ok("le grec est ABSENT (AT) — pas de faux bloc", !d.versions.some(v => v.nom === 'Grec'));
  const fr = d.versions.find(v => v.nom === 'Français') || {};
  ok("le texte français est correct", /Au commencement, Dieu créa/.test(fr.texte), fr.texte.slice(0, 60));
  ok("la PROVENANCE accompagne le texte", /Bible de Jérusalem/.test(fr.prov || ''), fr.prov);
  ok("l'hébreu est nettoyé (aucun « | »)", !/\|/.test((d.versions.find(v => v.nom === 'Hébreu') || {}).texte || ''));

  section("2. Qui cite le passage (graphe v526)");
  ok("trois citations croisées", d.citations.length === 3, "n=" + d.citations.length + " -> " + d.citations.map(x => x.type).join(","));
  ok("un parallèle coranique est cité", d.citations.some(x => x.type === 'coran'));

  section("3. Thèmes liés et notes de l'utilisateur");
  ok("au moins un thème lié au verset", d.themes.length >= 1, d.themes.map(t => t.label).join(" | "));
  await page.evaluate(() => {
    localStorage.setItem('theo_panel_notes_v1', JSON.stringify([
      { id: 'n1', key: 'v167#Gn1', anchor: 'Genèse 1:1 — Au commencement', note: 'Le verbe baraʾ n\'a que Dieu comme sujet.', ts: 1, type: 'exegetique' },
      { id: 'n2', key: '', anchor: '', note: 'Note sans rapport avec le passage.', ts: 2 },
    ]));
  });
  const d2 = await page.evaluate(() => window.__v536Dossier.compose('Genèse 1:1'));
  ok("la note mentionnant le passage est reprise", d2.notes.length === 1 && /baraʾ/.test(d2.notes[0].note), "n=" + d2.notes.length);
  ok("la note sans rapport est écartée", !d2.notes.some(n => /sans rapport/.test(n.note)));

  section("4. Le document Markdown");
  const t = await page.evaluate(() => window.__v536Dossier.texte(window.__v536Dossier.dernier()));
  ok("le titre porte la référence", /^# Dossier — Genèse 1:1/.test(t), t.split("\n")[0]);
  ok("il a une section Texte avec le nombre de versions", /## Texte \(4 version/.test(t), (t.match(/## Texte[^\n]*/) || [""])[0]);
  ok("il a la section « Cité par »", /## Cité par \(3\)/.test(t));
  ok("il a la section « Thèmes liés »", /## Thèmes liés/.test(t));
  ok("il a la section « Mes notes »", /## Mes notes \(1\)/.test(t));
  ok("la provenance figure dans le document", /Bible de Jérusalem/.test(t));

  section("5. Composition sur Jean 3:16 (NT)");
  const d3 = await page.evaluate(() => window.__v536Dossier.compose('Jean 3:16'));
  const noms = d3.versions.map(v => v.nom);
  ok("le grec est présent (NT)", noms.indexOf('Grec') >= 0, noms.join(","));
  ok("l'hébreu est ABSENT du NT", noms.indexOf('Hébreu') < 0, noms.join(","));
  ok("le texte grec est nettoyé", !/\|/.test((d3.versions.find(v => v.nom === 'Grec') || {}).texte || ''));

  section("6. Le panneau affiche le dossier");
  await page.evaluate(() => window.__v536Dossier.ouvre('Genèse 1:1'));
  await page.waitForFunction(() => {
    const o = document.getElementById('v536-out');
    return o && /# Dossier/.test(o.textContent);
  }, { timeout: 40000 });
  const ui = await page.evaluate(() => ({
    pre: !!document.querySelector('#v536-out pre'),
    txt: (document.querySelector('#v536-out') || {}).textContent || '',
    ref: document.getElementById('v536-ref').value,
  }));
  ok("le dossier est rendu dans le panneau", ui.pre);
  ok("il contient le texte du verset", /Au commencement/.test(ui.txt));
  ok("le champ reprend la référence", /Genèse 1:1/.test(ui.ref), ui.ref);

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
