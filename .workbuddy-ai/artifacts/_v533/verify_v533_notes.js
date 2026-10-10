// Banc v533 — NOTES TYPÉES.
//
// Vérifie qu'on peut TYPER les notes d'étude existantes (sans casser leur format),
// les FILTRER par type avec compteurs, et les EXPORTER — le tout persisté.
//
// Usage : node verify_v533_notes.js [--port 8765]

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
const enBase = (page, id) => page.evaluate((i) => {
  const a = JSON.parse(localStorage.getItem('theo_panel_notes_v1') || '[]');
  const n = a.find(x => x.id === i); return n ? (n.type || '') : null;
}, id);

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v533 — NOTES TYPÉES");
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
  await page.waitForTimeout(1200);
  ok("le module v533 est chargé", await page.evaluate(() => !!window.__v533Notes));
  ok("le bouton « 🏷️ NOTES » est présent", await page.evaluate(() => !!document.getElementById('open-notes')));
  ok("six types sont proposés", await page.evaluate(() => window.__v533Notes.TYPES.length) === 6);

  section("1. Jeu d'essai : trois notes, dont une déjà typée");
  await page.evaluate(() => {
    localStorage.setItem('theo_panel_notes_v1', JSON.stringify([
      { id: 'pn-1', key: 'v167#Gn1', anchor: 'Au commencement, Dieu créa', note: 'Le verbe baraʾ n\'est utilisé qu\'avec Dieu comme sujet.', ts: 1000, type: 'doctrinal' },
      { id: 'pn-2', key: 'v183#2:255', anchor: 'Allah, le Vivant', note: 'Comparer avec Ex 3:14 sur le nom divin.', ts: 2000 },
      { id: 'pn-3', key: '', anchor: '', note: 'Penser à vérifier la datation de ce concile.', ts: 3000 },
    ]));
  });
  const st = await page.evaluate(() => window.__v533Notes.stats());
  ok("trois notes recensées", st.total === 3, "total=" + st.total);
  ok("une note doctrinale", st.doctrinal === 1, "doctrinal=" + st.doctrinal);
  ok("deux notes sans type", st.sans === 2, "sans=" + st.sans);

  section("2. Filtrage par type");
  const f1 = await page.evaluate(() => window.__v533Notes.filtre('doctrinal'));
  ok("le filtre doctrinal isole la bonne note", f1.length === 1 && f1[0].id === 'pn-1', "n=" + f1.length);
  const f2 = await page.evaluate(() => window.__v533Notes.filtre('sans'));
  ok("le filtre « sans type » isole les deux autres", f2.length === 2, "n=" + f2.length);
  const f3 = await page.evaluate(() => window.__v533Notes.filtre(''));
  ok("sans filtre, on voit tout", f3.length === 3, "n=" + f3.length);

  section("3. Typer une note (persisté, sans casser le format)");
  const okType = await page.evaluate(() => window.__v533Notes.definiType('pn-2', 'exegetique'));
  ok("l'affectation réussit", okType === true);
  ok("le type est écrit dans localStorage", (await enBase(page, 'pn-2')) === 'exegetique', String(await enBase(page, 'pn-2')));
  const n2 = await page.evaluate(() => JSON.parse(localStorage.getItem('theo_panel_notes_v1')).find(x => x.id === 'pn-2'));
  ok("le reste de la note est intact (ancre + texte)", /Allah, le Vivant/.test(n2.anchor) && /Ex 3:14/.test(n2.note), n2.anchor);
  await page.evaluate(() => window.__v533Notes.definiType('pn-2', ''));
  ok("on peut aussi RETIRER un type", (await enBase(page, 'pn-2')) === '');
  await page.evaluate(() => window.__v533Notes.definiType('pn-2', 'exegetique'));

  section("4. Export typé");
  const ex = await page.evaluate(() => window.__v533Notes.texteExport('doctrinal'));
  ok("l'export nomme le type", /Doctrinal/.test(ex) && /\[.*Doctrinal\]/.test(ex), ex.split("\n")[0]);
  ok("il contient le texte de la note", /baraʾ/.test(ex));
  ok("il contient l'ancre citée", /Au commencement/.test(ex));
  const exAll = await page.evaluate(() => window.__v533Notes.texteExport(''));
  ok("l'export complet compte les notes", /3 note\(s\)/.test(exAll), (exAll.match(/THEOLOGICUS — .*/) || [""])[0]);

  section("5. Le panneau : liste, filtres et sélecteurs");
  await page.evaluate(() => window.__v533Notes.ouvre());
  await page.waitForFunction(() => { const p = document.getElementById('v533-panel'); return p && p.classList.contains('open'); }, { timeout: 15000 });
  const ui = await page.evaluate(() => ({
    items: document.querySelectorAll('#v533-panel .it').length,
    selects: document.querySelectorAll('#v533-panel select[data-id]').length,
    chips: document.querySelectorAll('#v533-panel .cfg [data-f]').length,
    st: document.getElementById('v533-st').textContent,
  }));
  ok("les trois notes sont listées", ui.items === 3, "items=" + ui.items);
  ok("chaque note a son sélecteur de type", ui.selects === 3, "selects=" + ui.selects);
  ok("les filtres proposent les types présents + « sans type »", ui.chips >= 4, "chips=" + ui.chips);
  ok("l'en-tête compte les notes", /3 note/.test(ui.st), ui.st);

  section("6. Changer le type DEPUIS le panneau");
  await page.selectOption('#v533-panel select[data-id="pn-3"]', 'historique');
  await page.waitForTimeout(500);
  ok("le changement est persisté", (await enBase(page, 'pn-3')) === 'historique', String(await enBase(page, 'pn-3')));
  const st2 = await page.evaluate(() => window.__v533Notes.stats());
  // pn-1 doctrinal, pn-2 exegetique (typé en section 3), pn-3 historique -> plus aucune sans type
  ok("les compteurs se mettent à jour", st2.historique === 1 && st2.exegetique === 1 && st2.sans === 0, JSON.stringify({ h: st2.historique, e: st2.exegetique, s: st2.sans }));

  section("7. Filtre depuis le panneau");
  await page.evaluate(() => { const b = document.querySelector('#v533-panel .cfg [data-f="exegetique"]'); if (b) b.click(); });
  await page.waitForTimeout(400);
  const ui2 = await page.evaluate(() => ({ items: document.querySelectorAll('#v533-panel .it').length, st: document.getElementById('v533-st').textContent }));
  ok("le filtre réduit la liste à une note", ui2.items === 1, "items=" + ui2.items);
  ok("l'en-tête signale le filtre", /filtre actif/.test(ui2.st), ui2.st);

  section("8. Propreté");
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
