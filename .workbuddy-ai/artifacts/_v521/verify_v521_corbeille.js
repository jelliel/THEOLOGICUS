// Banc v521 — CORBEILLE DES CONVERSATIONS (restaurer une conversation effacée).
//
// Vérifie que :
//   - « Effacer » DÉPLACE la conversation dans la corbeille (au lieu de détruire) ;
//   - la corbeille est persistée (localStorage theo_chats_trash_v1) et comptée ;
//   - le panneau liste les conversations supprimées avec leur date ;
//   - « Restaurer » la remet dans les Archives ; « Définitif »/« Vider » l'efface.
//
// Usage : node verify_v521_corbeille.js [--port 8765]

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
const inChats = (page, id) => page.evaluate((i) => db.getAll('chats').then(a => a.some(c => c.id === i)), id);
const trash = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('theo_chats_trash_v1') || '[]'); } catch (e) { return []; } });
const semer = (page, id, titre) => page.evaluate(([i, t]) => db.put('chats', { id: i, title: t, messages: [{ role: 'user', content: 'Bonjour' }, { role: 'assistant', content: 'Salut' }], updated: Date.now() }), [id, titre]);

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v521 — CORBEILLE DES CONVERSATIONS");
  console.log(BASE);
  console.log("=".repeat(72));
  if (!await assurerRelais()) { console.log("\nRelais injoignable."); process.exit(2); }

  const optionsNav = Object.assign({ args: ["--no-sandbox", "--no-proxy-server"] },
    process.env.PW_DIR ? { executablePath: path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe") } : {});
  const browser = await chromium.launch(optionsNav);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("dialog", d => d.accept());   // confirmer les suppressions
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
  await page.waitForTimeout(900);
  ok("le module v521 est chargé", await page.evaluate(() => !!window.__v521Corbeille));
  ok("le bouton « 🗑 CORBEILLE » est présent", await page.evaluate(() => !!document.getElementById('open-corbeille')));
  ok("la base IndexedDB est accessible au banc", await page.evaluate(() => typeof db !== 'undefined' && !!db.conn));
  ok("la corbeille démarre vide", (await trash(page)).length === 0, "n=" + (await trash(page)).length);

  section("1. Effacer DÉPLACE vers la corbeille (au lieu de détruire)");
  await semer(page, 'test-trash-1', 'Conversation à sauver');
  ok("la conversation existe dans les Archives", await inChats(page, 'test-trash-1'));
  await page.evaluate(() => window.deleteArchiveChat('test-trash-1'));
  await page.waitForTimeout(400);
  ok("elle n'est PLUS dans les Archives", !(await inChats(page, 'test-trash-1')));
  const t1 = await trash(page);
  ok("elle EST dans la corbeille", t1.some(c => c.id === 'test-trash-1'), "n=" + t1.length);
  ok("le titre est conservé", (t1[0] || {}).title === 'Conversation à sauver', (t1[0] || {}).title);
  ok("les messages sont conservés", ((t1[0] || {}).messages || []).length === 2, "msgs=" + (((t1[0] || {}).messages || []).length));
  ok("la date de mise en corbeille est enregistrée", !!(t1[0] || {})._trashTs, String((t1[0] || {})._trashTs));
  ok("le bouton HUD affiche le compteur", /\(1\)/.test(await page.evaluate(() => document.getElementById('open-corbeille').textContent)), await page.evaluate(() => document.getElementById('open-corbeille').textContent));

  section("2. Le panneau liste la conversation supprimée");
  await page.evaluate(() => window.__v521Corbeille.ouvrir());
  await page.waitForFunction(() => { const p = document.getElementById('v521-panel'); return p && p.classList.contains('open'); }, { timeout: 10000 });
  const ui = await page.evaluate(() => ({
    items: document.querySelectorAll('#v521-panel .it').length,
    titre: (document.querySelector('#v521-panel .tt') || {}).textContent || '',
    date: (document.querySelector('#v521-panel .mt') || {}).textContent || '',
    st: document.getElementById('v521-st').textContent,
  }));
  ok("une conversation est listée", ui.items === 1, "items=" + ui.items);
  ok("son titre s'affiche", /Conversation à sauver/.test(ui.titre), ui.titre);
  ok("la date de suppression s'affiche", /supprimée le/.test(ui.date), ui.date);
  ok("le compteur du panneau est juste", /1 dans la corbeille/.test(ui.st), ui.st);

  section("3. « Restaurer » remet la conversation dans les Archives");
  await page.evaluate(() => document.querySelector('#v521-panel [data-rest]').click());
  await page.waitForTimeout(600);
  ok("elle est de retour dans les Archives", await inChats(page, 'test-trash-1'));
  ok("la corbeille est vide", (await trash(page)).length === 0, "n=" + (await trash(page)).length);
  const arch = await page.evaluate(() => { const l = document.querySelector('.archives-list'); return l ? l.textContent : ''; });
  ok("elle réapparaît dans la liste des Archives", /Conversation à sauver/.test(arch), arch.slice(0, 60));

  section("4. « Définitif » efface pour de bon");
  await page.evaluate(() => window.deleteArchiveChat('test-trash-1'));
  await page.waitForTimeout(400);
  ok("de nouveau dans la corbeille", (await trash(page)).length === 1);
  await page.evaluate(() => document.querySelector('#v521-panel [data-purge]').click());
  await page.waitForTimeout(400);
  const tr4 = await trash(page);
  ok("retirée de la corbeille", tr4.length === 0, "n=" + tr4.length + " ids=" + tr4.map(c => c.id).join(","));
  ok("et ABSENTE des Archives", !(await inChats(page, 'test-trash-1')));

  section("5. « Vider la corbeille »");
  await semer(page, 'test-trash-2', 'Deuxième');
  await semer(page, 'test-trash-3', 'Troisième');
  await page.evaluate(() => window.deleteArchiveChat('test-trash-2'));
  await page.evaluate(() => window.deleteArchiveChat('test-trash-3'));
  await page.waitForTimeout(400);
  ok("deux conversations dans la corbeille", (await trash(page)).length === 2, "n=" + (await trash(page)).length);
  await page.evaluate(() => window.__v521Corbeille.vider());
  await page.waitForTimeout(400);
  ok("la corbeille est vidée", (await trash(page)).length === 0, "n=" + (await trash(page)).length);
  ok("aucune n'est revenue dans les Archives", !(await inChats(page, 'test-trash-2')) && !(await inChats(page, 'test-trash-3')));

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
