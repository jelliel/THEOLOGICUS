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
//       quand même, dans IndexedDB (qui les contient toutes) ;
//   (d) le quota n'est JAMAIS atteint (le miroir ne s'arrête pas).
//
// ⚠️ AUTONOMIE — leçon de l'échec CI du 2026-10-10.
// Une première version lisait le magasin PARTAGÉ de la machine : elle passait en
// local (42 Mo, 690 clés) et ÉCHOUAIT en CI, où le runner part d'un magasin VIDE
// (« des conversations ont bien été mirées -- n=0 »). Un banc ne doit pas dépendre
// d'un état local. Celui-ci :
//   • lance le relais avec un LOCALAPPDATA ISOLÉ (dossier temporaire) — le
//     magasin de l'utilisateur n'est ni lu ni pollué ;
//   • REMPLIT lui-même le magasin de N conversations assez grosses pour que la
//     somme dépasse le quota (~5 Mo) : c'est exactement la panne d'origine.
//
// Usage : node verify_v536_quota.js [--port 8765]

const path = require("path");
const os = require("os");
const fs = require("fs");
const { spawn, execSync } = require("child_process");
const H = require('../../../tools/bench_common.js');
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const { chromium } = require("playwright");

for (const k of ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy", "FTP_PROXY", "ftp_proxy"]) delete process.env[k];
process.env.NO_PROXY = "*"; process.env.no_proxy = "*";

const PORT = process.argv.includes("--port") ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8765;
const BASE = `http://127.0.0.1:${PORT}/THEOLOGICUS.html`;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const PY = process.env.PY_BIN || "C:/Users/toshr/.workbuddy-ai/binaries/python/versions/3.13.12/python.exe";
const AUTH_HASH = "ca9cc135dea09c84e670f62659826f1d9d76a633e421cdc54c67ffa20b3a1a96";

const SEUIL_SUR = 3500000;   /* 3,5 Mo : au-delà, l'utilisateur n'a plus de marge */
const N_CHATS = 60;          /* conversations semées dans le magasin */
const KO_PAR_CHAT = 120;     /* 60 × 120 Ko ≈ 7,2 Mo : dépasse le quota (~5 Mo) */
const PREFIXE = "bench-quota-";

/* Magasin ISOLÉ : jamais celui de l'utilisateur. */
const STORE_DIR = path.join(os.tmpdir(), "theo-banc-v536-" + process.pid);

const resultats = [];
function ok(nom, cond, detail) { resultats.push([!!cond, nom, detail === undefined ? "" : String(detail)]); console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`); return !!cond; }
function section(t) { console.log("\n" + t); }

let relais = null;

/* Remplit le magasin partagé : c'est la panne d'origine qu'on veut reproduire. */
async function semerMagasin() {
  const entries = [], t = Date.now();
  for (let i = 0; i < N_CHATS; i++) {
    const v = JSON.stringify({
      id: PREFIXE + i,
      title: 'Conversation de banc ' + i,
      updated: t - i * 1000,
      messages: [
        { role: 'user', content: 'Question ' + i },
        { role: 'assistant', content: 'r'.repeat(KO_PAR_CHAT * 1024) }
      ]
    });
    entries.push({ k: 'chat::' + PREFIXE + i, v: v, ts: t - i });
  }
  const r = await fetch(`http://127.0.0.1:${PORT}/theologicus-store`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries: entries })
  });
  if (!r.ok) return { ok: false, status: r.status };
  const j = await r.json().catch(() => ({}));
  return { ok: true, rev: j && j.rev };
}

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
  try { fs.mkdirSync(STORE_DIR, { recursive: true }); } catch (e) {}
  relais = await H.spawnRelay({ port: PORT, localAppData: STORE_DIR });
  if (!relais.child || relais.child.exitCode !== null) { console.log("\nRelais injoignable."); process.exit(2); }

  section("0. Semis du magasin partagé (la panne d'origine, reproduite)");
  const sem = await semerMagasin();
  ok("le magasin partagé contient les " + N_CHATS + " conversations du banc", sem.ok, JSON.stringify(sem));
  console.log("  (≈ " + Math.round(N_CHATS * KO_PAR_CHAT / 1024) + " Mo semés — de quoi saturer le quota si rien n'est borné)");

  const optionsNav = Object.assign({ args: ["--no-sandbox", "--no-proxy-server"] },
    process.env.PW_DIR ? { executablePath: path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe") } : {});
  const browser = await chromium.launch(optionsNav);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const erreurs = [];
  const BRUIT = /version\.txt|Failed to load resource|net::ERR|Failed to fetch|401|403|404|Unauthorized|\[corpus\]/i;
  page.on("pageerror", e => erreurs.push(String(e)));
  page.on("console", m => { if (m.type() === "error" && !BRUIT.test(m.text())) erreurs.push("console: " + m.text()); });

  await page.addInitScript(() => { try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {} });

  section("1. Ouverture (profil neuf) et authentification");
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

  section("2. Le premier pull ne sature plus localStorage");
  await page.waitForFunction(() => window.__theoSync.miroir().octets > 0, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(5000);
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
  ok("le quota n'a JAMAIS été atteint (le miroir ne s'est pas arrêté)", mi.arrete === false, "arrêté=" + mi.arrete);

  section("3. L'utilisateur peut encore enregistrer (la panne d'origine)");
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

  section("4. La borne est un PLAFOND, pas un BLOCAGE (les conversations arrivent)");
  const idb = await page.evaluate(async () => {
    try {
      const t = await db.getAll('chats');
      return Array.isArray(t) ? t.filter(c => String(c.id).indexOf('bench-quota-') === 0).length : -1;
    } catch (e) { return -2; }
  });
  ok("les " + N_CHATS + " conversations du magasin sont dans IndexedDB", idb >= N_CHATS, "n=" + idb);
  ok("le miroir est un SOUS-ENSEMBLE d'IndexedDB (aucune conversation perdue)",
    idb >= ls.miroirs, "IDB=" + idb + " >= miroirs=" + ls.miroirs);
  ok("des conversations arrivent SANS être mirées (preuve que ce n'est pas un blocage)",
    idb > ls.miroirs, "IDB=" + idb + " > miroirs=" + ls.miroirs);

  section("5. Propreté");
  const quota = erreurs.filter(e => /QuotaExceeded/i.test(e));
  ok("aucune erreur QuotaExceededError", quota.length === 0, quota.slice(0, 2).join(" | "));
  ok("aucune erreur JavaScript", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));

  await browser.close();
  if (relais) H.killRelay(relais);
  try { fs.rmSync(STORE_DIR, { recursive: true, force: true }); } catch (e) {}

  const total = resultats.length;
  const bons = resultats.filter(r => r[0]).length;
  console.log("\n" + "=".repeat(72));
  console.log(`RESULTAT : ${bons}/${total}`);
  if (bons !== total) { console.log("\nÉchecs :"); resultats.filter(r => !r[0]).forEach(r => console.log(`  - ${r[1]}  (${r[2]})`)); }
  console.log("=".repeat(72));
  process.exit(bons === total ? 0 : 1);
})().catch(e => { console.error("\n[EXCEPTION] " + (e && e.stack || e)); if (relais) H.killRelay(relais); process.exit(3); });
