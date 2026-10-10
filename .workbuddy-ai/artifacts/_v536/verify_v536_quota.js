// Banc v536b — LE MIROIR localStorage DES CONVERSATIONS EST BORNÉ.
//
// Panne réelle (mesurée le 2026-10-10) : au PREMIER pull du magasin partagé sur
// un profil neuf, theo-sync écrivait TOUTES les conversations dans localStorage
// (mesuré : 79 clés / 5,1 Mo) → saturation du quota (~5 Mo) → toute écriture
// ultérieure de l'utilisateur (notes, surlignages, favoris) échouait.
//
// Le magasin canonique des conversations est IndexedDB ; le miroir localStorage
// n'est qu'un filet pour loadChat. Ce banc verrouille l'invariant :
//   (a) le miroir ne dépasse jamais son budget ;
//   (b) localStorage garde de la place pour les vraies données (une note s'écrit) ;
//   (c) la borne est un PLAFOND, pas un BLOCAGE : les conversations arrivent
//       quand même, dans IndexedDB (qui les contient toutes).
//
// Usage : node verify_v536_quota.js [--port 8765]

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

const SEUIL_SUR = 3500000;   /* 3,5 Mo : au-delà, l'utilisateur n'a plus de marge */

const resultats = [];
function ok(nom, cond, detail) { resultats.push([!!cond, nom, detail === undefined ? "" : String(detail)]); console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`); return !!cond; }
function section(t) { console.log("\n" + t); }

let relais = null;
async function relaisVit() { try { const r = await fetch(`http://127.0.0.1:${PORT}/__theologicus_ping`, { signal: AbortSignal.timeout(3000) }); return r.status === 200; } catch (e) { return false; } }
async function assurerRelais() {
  tuerPort(PORT); await new Promise(r => setTimeout(r, 600));
  console.log("  … lancement de proxy_server.py (port " + PORT + ")");
  relais = spawn(PY, ["-u", "proxy_server.py"], { cwd: RACINE, stdio: "ignore", windowsHide: true });
  for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 500)); if (await relaisVit()) return true; if (relais.exitCode !== null) return false; }
  return false;
}

/* Mesure objective du localStorage (identifie les miroirs de conversation). */
function etatLS() {
  var n = 0, oct = 0, mir = 0, octMir = 0;
  for (var i = 0; i < localStorage.length; i++) {
    var k = localStorage.key(i), v = String(localStorage.getItem(k) || '');
    n++; oct += k.length + v.length;
    if (k.indexOf('theologicus_chat_') === 0) { mir++; octMir += k.length + v.length; }
  }
  return { cles: n, octets: oct, miroirs: mir, octMiroirs: octMir };
}

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v536b — MIROIR localStorage BORNÉ");
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

  section("0. Ouverture (profil neuf) et authentification");
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
  ok("le module de synchronisation est chargé", await page.evaluate(() => !!window.__theoSync));
  ok("il publie l'état de son miroir", await page.evaluate(() => !!(window.__theoSync && window.__theoSync.miroir)));

  section("1. Le premier pull ne sature plus localStorage");
  /* On laisse le temps au pull initial (démarré à 800 ms, répété toutes les 5 s). */
  await page.waitForFunction(() => window.__theoSync.miroir().octets > 0, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(4000);
  const ls = await page.evaluate(etatLS);
  const mi = await page.evaluate(() => window.__theoSync.miroir());
  console.log("  mesure : clés=" + ls.cles + "  total=" + Math.round(ls.octets / 1024) + " Ko"
    + "  |  miroirs=" + ls.miroirs + " (" + Math.round(ls.octMiroirs / 1024) + " Ko)");
  ok("des conversations ont bien été mirées (le filet existe)", ls.miroirs >= 1, "n=" + ls.miroirs);
  ok("le miroir respecte son budget", mi.octets <= mi.budget, mi.octets + " <= " + mi.budget);
  ok("aucune conversation mirée ne dépasse le plafond unitaire",
    await page.evaluate((p) => {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('theologicus_chat_') === 0 && String(localStorage.getItem(k) || '').length > p) return false;
      }
      return true;
    }, mi.plafond), "plafond=" + mi.plafond);
  ok("localStorage garde de la marge pour les vraies données", ls.octets <= SEUIL_SUR,
    Math.round(ls.octets / 1024) + " Ko <= " + Math.round(SEUIL_SUR / 1024) + " Ko");

  section("2. L'utilisateur peut encore enregistrer (la panne d'origine)");
  const ecrit = await page.evaluate(() => {
    try {
      localStorage.setItem('theo_panel_notes_v1', JSON.stringify([
        { id: 'q1', key: 'v167#Gn1', anchor: 'Genèse 1:1', note: 'Note écrite après un pull complet.', ts: 1, type: 'exegetique' }
      ]));
      return 'ok';
    } catch (e) { return e.name + ' : ' + e.message; }
  });
  ok("une note s'enregistre après le pull", ecrit === 'ok', ecrit);
  ok("des surlignages s'enregistrent aussi", await page.evaluate(() => {
    try { localStorage.setItem('theo_panel_marks_v1', JSON.stringify({ 'Genèse 1:1': [{ t: 'x' }] })); return true; }
    catch (e) { return false; }
  }));

  section("3. La borne est un PLAFOND, pas un BLOCAGE (les conversations arrivent)");
  const idb = await page.evaluate(async () => {
    try { const t = await db.getAll('chats'); return Array.isArray(t) ? t.length : -1; } catch (e) { return -2; }
  });
  ok("IndexedDB (magasin canonique) contient des conversations", idb >= 1, "n=" + idb);
  ok("le miroir est un SOUS-ENSEMBLE d'IndexedDB (aucune conversation perdue)",
    idb >= ls.miroirs, "IDB=" + idb + " >= miroirs=" + ls.miroirs);
  ok("des conversations arrivent SANS être mirées (preuve que ce n'est pas un blocage)",
    idb > ls.miroirs, "IDB=" + idb + " > miroirs=" + ls.miroirs);

  section("4. Propreté");
  const quota = erreurs.filter(e => /QuotaExceeded/i.test(e));
  ok("aucune erreur QuotaExceededError", quota.length === 0, quota.slice(0, 2).join(" | "));
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
