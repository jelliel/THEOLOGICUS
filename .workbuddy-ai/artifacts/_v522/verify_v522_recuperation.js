// Banc v522 — RÉCUPÉRATION des conversations effacées AVANT la corbeille.
//
// Principe : avant v521, l'effacement était définitif dans IndexedDB, MAIS le
// miroir localStorage 'theologicus_chat_<id>' n'était jamais supprimé. Ce banc
// vérifie qu'on peut RETROUVER et RESTAURER ces conversations « orphelines »,
// et qu'une conversation encore présente n'est PAS proposée à tort.
//
// Usage : node verify_v522_recuperation.js [--port 8765]

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

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v522 — RÉCUPÉRATION DES CONVERSATIONS ORPHELINES");
  console.log(BASE);
  console.log("=".repeat(72));
  if (!await assurerRelais()) { console.log("\nRelais injoignable."); process.exit(2); }

  const optionsNav = Object.assign({ args: ["--no-sandbox", "--no-proxy-server"] },
    process.env.PW_DIR ? { executablePath: path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe") } : {});
  const browser = await chromium.launch(optionsNav);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("dialog", d => d.accept());
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
  ok("le module est chargé (orphelins exporté)", await page.evaluate(() => !!(window.__v521Corbeille && window.__v521Corbeille.orphelins)));

  section("1. Simuler une conversation effacée AVANT la corbeille (miroir orphelin)");
  await page.evaluate(() => {
    localStorage.setItem('theologicus_chat_orphan-1', JSON.stringify({
      id: 'orphan-1', title: 'Conversation perdue', updated: Date.now() - 86400000,
      messages: [{ role: 'user', content: 'Souviens-toi de ceci' }, { role: 'assistant', content: 'Oui, je m’en souviens' }],
    }));
  });
  ok("le miroir orphelin n'est PAS dans les Archives", !(await inChats(page, 'orphan-1')));
  const orph = await page.evaluate(() => window.__v521Corbeille.orphelins());
  ok("il est DÉTECTÉ comme récupérable", orph.some(o => o.id === 'orphan-1'), "n=" + orph.length);
  const o1 = orph.find(o => o.id === 'orphan-1') || {};
  ok("son titre est lu", (o1.chat || {}).title === 'Conversation perdue', (o1.chat || {}).title);
  ok("son nombre de messages est lu", o1.msgs === 2, "msgs=" + o1.msgs);

  section("2. Une conversation ENCORE PRÉSENTE n'est pas proposée à tort");
  await page.evaluate(() => db.put('chats', { id: 'vivante-1', title: 'Bien vivante', messages: [{ role: 'user', content: 'ok' }], updated: Date.now() }));
  await page.evaluate(() => {
    localStorage.setItem('theologicus_chat_vivante-1', JSON.stringify({ id: 'vivante-1', title: 'Bien vivante', messages: [{ role: 'user', content: 'ok' }], updated: Date.now() }));
  });
  const orph2 = await page.evaluate(() => window.__v521Corbeille.orphelins());
  ok("la conversation existante est EXCLUE", !orph2.some(o => o.id === 'vivante-1'), "n=" + orph2.length);
  ok("seule l'orpheline reste", orph2.length === 1 && orph2[0].id === 'orphan-1', orph2.map(o => o.id).join(", "));

  section("3. Le panneau Corbeille affiche la section « récupérables »");
  await page.evaluate(() => window.__v521Corbeille.ouvrir());
  await page.waitForFunction(() => document.querySelectorAll('#v521-panel [data-recup]').length > 0, { timeout: 15000 });
  const ui = await page.evaluate(() => ({
    sec: (document.querySelector('#v521-panel .sec') || {}).textContent || '',
    recup: document.querySelectorAll('#v521-panel [data-recup]').length,
    titre: (document.querySelector('#v521-panel [data-recup]') ? document.querySelector('#v521-panel [data-recup]').closest('.it').querySelector('.tt').textContent : ''),
    st: document.getElementById('v521-st').textContent,
  }));
  ok("la section « Conversations récupérables » est présente", /récupérables/i.test(ui.sec), ui.sec.slice(0, 60));
  ok("un bouton « Récupérer » est proposé", ui.recup === 1, "n=" + ui.recup);
  ok("le titre de la conversation perdue s'affiche", /Conversation perdue/.test(ui.titre), ui.titre);
  ok("l'en-tête compte les récupérables", /1 récupérable/.test(ui.st), ui.st);

  section("4. « Récupérer » remet la conversation dans les Archives");
  await page.evaluate(() => document.querySelector('#v521-panel [data-recup]').click());
  await page.waitForTimeout(700);
  ok("elle est de retour dans les Archives", await inChats(page, 'orphan-1'));
  const arch = await page.evaluate(() => { const l = document.querySelector('.archives-list'); return l ? l.textContent : ''; });
  ok("elle apparaît dans la liste des Archives", /Conversation perdue/.test(arch), arch.slice(0, 50));
  const orph3 = await page.evaluate(() => window.__v521Corbeille.orphelins());
  ok("elle n'est plus listée comme récupérable", !orph3.some(o => o.id === 'orphan-1'), "n=" + orph3.length);

  section("5. « ✕ » supprime la copie de secours (sans toucher aux Archives)");
  await page.evaluate(() => db.delete('chats', 'vivante-1'));
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__v521Corbeille.rendre());
  await page.waitForFunction(() => document.querySelectorAll('#v521-panel [data-oubli]').length > 0, { timeout: 10000 });
  const avant = await page.evaluate(() => !!localStorage.getItem('theologicus_chat_vivante-1'));
  ok("la copie existe avant", avant);
  await page.evaluate(() => document.querySelector('#v521-panel [data-oubli]').click());
  await page.waitForTimeout(400);
  const apres = await page.evaluate(() => !!localStorage.getItem('theologicus_chat_vivante-1'));
  ok("la copie de secours est supprimée", !apres);
  ok("elle n'est PAS ressuscitée dans les Archives", !(await inChats(page, 'vivante-1')));

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
