// Banc v525 — VÉRIFICATEUR DE CITATIONS.
//
// Le prompt exige des références, mais rien ne vérifiait qu'elles EXISTENT ni
// que le texte cité correspond. Ce banc vérifie que :
//   - une référence INEXISTANTE est signalée (❌) ;
//   - une citation DÉFORMÉE est signalée (non conforme) ;
//   - une citation EXACTE est confirmée ;
//   - le verdict est apposé sur le message et le détail s'ouvre au clic.
//
// Usage : node verify_v525_verif.js [--port 8765]

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

const MSG = '<div class="message-content">'
  + 'Selon <span class="bible-ref">Genèse 1:1</span>, « Au commencement, Dieu créa le ciel et la terre. » '
  + 'Par ailleurs <span class="bible-ref">Jean 99:99</span> affirme une chose étonnante. '
  + 'Enfin <span class="bible-ref">Jean 3:16</span> : « Dieu est amour et lumière pour toujours. »'
  + '</div>';

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v525 — VÉRIFICATEUR DE CITATIONS");
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
  await page.waitForTimeout(3000);   // laisser l'app finir son init (sinon renderMessages ecrase l'injection)
  ok("le module v525 est chargé", await page.evaluate(() => !!window.__v525Verif));
  ok("le résolveur de versets local est disponible", await page.evaluate(() => typeof window.fetchVerse === 'function'));

  section("1. Comparaison citation / verset local");
  await page.evaluate(() => window.__ensureBibleBook('1'));   // fetchVerse est SYNCHRONE : charger d'abord
  const cmp = await page.evaluate(() => {
    const v = window.fetchVerse('Genèse 1:1');
    return {
      local: v ? v.text : '',
      exact: window.__v525Verif.compare('Au commencement, Dieu créa le ciel et la terre.', v ? v.text : ''),
      diff: window.__v525Verif.compare('Dieu est amour et lumière pour toujours.', v ? v.text : ''),
    };
  });
  ok("le verset local est bien lu", /commencement/i.test(cmp.local), cmp.local.slice(0, 60));
  ok("une citation conforme est reconnue (exact)", cmp.exact === 'exact', cmp.exact);
  ok("une citation déformée est reconnue (different)", cmp.diff === 'different', cmp.diff);

  section("2. Extraction de la citation");
  const ext = await page.evaluate(() => window.__v525Verif.extraitCitation(', « Au commencement, Dieu créa le ciel et la terre. » puis'));
  ok("le segment entre guillemets est extrait", /Au commencement/.test(ext), JSON.stringify(ext));

  section("3. Vérification d'un message complet (3 références)");
  const r = await page.evaluate(async (msg) => {
    const c = document.getElementById('chat-container');
    const el = document.createElement('div');
    el.className = 'message assistant';
    el.innerHTML = msg;
    c.appendChild(el);
    return await window.__v525Verif.prepareEtVerifie(el);
  }, MSG);
  ok("les 3 références sont analysées", r && r.total === 3, JSON.stringify(r && { total: r.total, i: r.introuvables, nc: r.nonConformes, c: r.conformes }));
  ok("la référence INEXISTANTE est signalée", r && r.introuvables === 1, "introuvables=" + (r && r.introuvables));
  ok("la citation DÉFORMÉE est signalée", r && r.nonConformes === 1, "nonConformes=" + (r && r.nonConformes));
  ok("la citation EXACTE est confirmée", r && r.conformes === 1, "conformes=" + (r && r.conformes));
  const details = await page.evaluate((res) => window.__v525Verif.verdict(res), r);
  ok("le verdict alerte sur les problèmes", /⚠/.test(details.txt) && /INTROUVABLE/i.test(details.txt) && /NON CONFORME/i.test(details.txt), details.txt);

  section("4. Le verdict est apposé automatiquement (observation)");
  try { await page.waitForFunction(() => document.querySelectorAll('#chat-container .message.assistant .v525-verdict').length > 0, { timeout: 25000 }); } catch (e) {}
  const badge = await page.evaluate(() => {
    const b = document.querySelector('#chat-container .message.assistant .v525-verdict');
    return b ? { txt: b.textContent, cls: b.className } : null;
  });
  ok("un verdict est apposé sur le message", !!badge, badge && badge.txt);
  ok("il est de type « alerte »", !!badge && /warn/.test(badge.cls), badge && badge.cls);

  section("5. Le détail s'ouvre au clic");
  await page.evaluate(() => { const b = document.querySelector('#chat-container .v525-verdict'); if (b) b.click(); });
  await page.waitForFunction(() => { const p = document.getElementById('v525-panel'); return p && p.classList.contains('open'); }, { timeout: 10000 });
  const pan = await page.evaluate(() => {
    const l = document.getElementById('v525-l');
    return { items: l.querySelectorAll('.it').length, txt: l.textContent };
  });
  ok("le panneau détaille les 3 références", pan.items === 3, "items=" + pan.items);
  ok("il distingue introuvable et non conforme", /introuvable/i.test(pan.txt) && /non conforme/i.test(pan.txt));
  ok("il montre le texte LOCAL du verset", /commencement/i.test(pan.txt));

  section("6. Un message irréprochable est validé");
  const r2 = await page.evaluate(async () => {
    const c = document.getElementById('chat-container');
    const el = document.createElement('div');
    el.className = 'message assistant';
    el.innerHTML = '<div class="message-content">Comme le dit <span class="bible-ref">Genèse 1:1</span> : « Au commencement, Dieu créa le ciel et la terre. » Voilà.</div>';
    c.appendChild(el);
    return await window.__v525Verif.prepareEtVerifie(el);
  });
  ok("aucune anomalie détectée", r2 && r2.introuvables === 0 && r2.nonConformes === 0, JSON.stringify(r2 && { i: r2.introuvables, nc: r2.nonConformes }));
  const v2 = await page.evaluate((res) => window.__v525Verif.verdict(res), r2);
  ok("le verdict est positif (✅)", /✅/.test(v2.txt), v2.txt);

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
