// Banc v538 — RÉTENTION DU MAGASIN PARTAGÉ.
//
// Constat mesuré le 2026-10-10 : le magasin partagé faisait 42,6 Mo / 690 clés
// (conversations de 250-650 Ko) et RIEN ne le bornait. Un appareil neuf devait
// le télécharger EN ENTIER.
//
// Ce banc pilote le VRAI relais (proxy_server.py) en HTTP et vérifie :
//   (a) le magasin reste sous le plafond ;
//   (b) l'élagage retire les conversations les PLUS ANCIENNES ;
//   (c) les clés NON-conversation (notes, favoris, surlignages) survivent ;
//   (d) le PLANCHER est respecté (on ne vide pas l'historique) ;
//   (e) l'élagage est COMPTÉ et exposé (jamais silencieux).
//
// ⚠️ Le relais tourne avec un LOCALAPPDATA ISOLÉ (dossier temporaire) ET un
// plafond réduit : le magasin de l'utilisateur n'est ni lu ni pollué, et
// l'élagage est prouvé sans écrire 24 Mo.
//
// Usage : node verify_v538_retention.js [--port 8765]

const path = require("path");
const os = require("os");
const fs = require("fs");
const { spawn, execSync } = require("child_process");
const H = require('../../../tools/bench_common.js');

for (const k of ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy", "ALL_PROXY", "all_proxy", "FTP_PROXY", "ftp_proxy"]) delete process.env[k];
process.env.NO_PROXY = "*"; process.env.no_proxy = "*";

const PORT = process.argv.includes("--port") ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8765;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const PY = process.env.PY_BIN || "C:/Users/toshr/.workbuddy-ai/binaries/python/versions/3.13.12/python.exe";
const EP = `http://127.0.0.1:${PORT}/theologicus-store`;

const PLAFOND = 3 * 1024 * 1024;   /* 3 Mo : le plafond imposé au relais du banc */
const PLANCHER = 5;                /* on garde au moins 5 conversations */
const N_CHATS = 24;                /* 24 × 300 Ko = 7,2 Mo : largement au-dessus */
const KO_PAR_CHAT = 300;

const STORE_DIR = path.join(os.tmpdir(), "theo-banc-v538-" + process.pid);

const resultats = [];
function ok(nom, cond, detail) { resultats.push([!!cond, nom, detail === undefined ? "" : String(detail)]); console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`); return !!cond; }
function section(t) { console.log("\n" + t); }

let relais = null;

async function getStore(since) {
  const r = await fetch(EP + (since !== undefined ? ('?since=' + since) : ''), { headers: { 'Cache-Control': 'no-store' } });
  return r.ok ? await r.json() : null;
}
async function post(entries) {
  const r = await fetch(EP, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries: entries }) });
  return r.ok ? await r.json() : { ok: false, status: r.status };
}
const chatVal = (i) => JSON.stringify({ id: 'ret-' + i, title: 'Conversation ' + i, updated: 1000 + i, messages: [{ role: 'user', content: 'q' + i }, { role: 'assistant', content: 'r'.repeat(KO_PAR_CHAT * 1024) }] });

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v538 — RÉTENTION DU MAGASIN PARTAGÉ");
  console.log(EP);
  console.log("=".repeat(72));
  try { fs.mkdirSync(STORE_DIR, { recursive: true }); } catch (e) {}
  relais = await H.spawnRelay({ port: PORT, localAppData: STORE_DIR, storeMaxBytes: PLAFOND, storeMinChats: PLANCHER });
  if (!relais.child || relais.child.exitCode !== null) { console.log("\nRelais injoignable."); process.exit(2); }

  section("0. Magasin vide au départ");
  let st = await getStore();
  ok("le magasin répond", !!st, JSON.stringify(st && { rev: st.rev, octets: st.octets }));
  ok("il expose sa taille", st && typeof st.octets === 'number', "octets=" + (st && st.octets));
  ok("il expose le cumul d'élagage", st && typeof st.elagage === 'object', JSON.stringify(st && st.elagage));

  section("1. Sous le plafond : rien n'est élagué");
  await post([{ k: 'theo_panel_notes_v1', v: JSON.stringify([{ id: 'n1', note: 'x'.repeat(2000) }]), ts: 10000 },
              { k: 'theo_favorites_v1', v: JSON.stringify([{ ref: 'Gn 1:1' }]), ts: 10000 }]);
  st = await getStore();
  ok("les petites clés sont enregistrées", st.keys['theo_panel_notes_v1'] && st.keys['theo_favorites_v1']);
  ok("aucun élagage sous le plafond", !(st.elagage && st.elagage.n), JSON.stringify(st.elagage));

  section("2. Au-dessus du plafond : élagage des PLUS ANCIENNES");
  const entries = [];
  for (let i = 0; i < N_CHATS; i++) entries.push({ k: 'chat::ret-' + i, v: chatVal(i), ts: 1000 + i });
  const p = await post(entries);
  ok("le POST est accepté", p && p.ok !== false, JSON.stringify(p));
  st = await getStore();
  const chats = Object.keys(st.keys).filter(k => k.indexOf('chat::') === 0);
  console.log("  mesure : octets=" + Math.round(st.octets / 1048576 * 10) / 10 + " Mo  |  chats restants=" + chats.length + "/" + N_CHATS);
  ok("le magasin repasse sous le plafond", st.octets <= PLAFOND, st.octets + " <= " + PLAFOND);
  ok("des conversations ont été élaguées", chats.length < N_CHATS, chats.length + "/" + N_CHATS);
  ok("le PLANCHER est respecté", chats.length >= PLANCHER, "restants=" + chats.length + " >= " + PLANCHER);
  ok("les PLUS ANCIENNES sont parties", !st.keys['chat::ret-0'], "ret-0 present=" + !!st.keys['chat::ret-0']);
  ok("les PLUS RÉCENTES sont gardées", !!st.keys['chat::ret-' + (N_CHATS - 1)]);

  section("3. Les clés NON-conversation survivent");
  ok("les notes d'étude survivent", !!st.keys['theo_panel_notes_v1']);
  ok("les favoris survivent", !!st.keys['theo_favorites_v1']);

  section("4. L'élagage est COMPTÉ (jamais silencieux)");
  const el = st.elagage || {};
  ok("le nombre de conversations retirées est compté", el.n === (N_CHATS - chats.length), "compté=" + el.n + " attendu=" + (N_CHATS - chats.length));
  ok("les octets libérés sont comptés", el.octets > 0, "octets=" + el.octets);
  ok("l'horodatage de l'élagage est présent", !!el.ts, "ts=" + el.ts);
  const reponsePost = p && p.elagage ? p.elagage : {};
  ok("la RÉPONSE du POST annonce l'élagage", (reponsePost.n || 0) > 0, JSON.stringify(reponsePost));

  section("5. Un ajout ensuite n'élague pas plus que nécessaire");
  const avant = (st.elagage || {}).n || 0;
  await post([{ k: 'chat::ret-nouveau', v: JSON.stringify({ id: 'ret-nouveau', messages: [{ role: 'user', content: 'petit' }] }), ts: 99999 }]);
  st = await getStore();
  const apres = (st.elagage || {}).n || 0;
  ok("le magasin reste sous le plafond", st.octets <= PLAFOND, st.octets + " <= " + PLAFOND);
  ok("la nouvelle conversation est là", !!st.keys['chat::ret-nouveau']);
  ok("on n'a pas élagué en masse", (apres - avant) <= 2, "retirés en plus=" + (apres - avant));

  section("6. Le pull incrémental voit la disparition (rev avancée)");
  const inc = await getStore(1);
  ok("un pull incrémental ne renvoie que du neuf", inc && inc.keys && Object.keys(inc.keys).length < Object.keys(st.keys).length,
    "incrémental=" + (inc && Object.keys(inc.keys).length) + " total=" + Object.keys(st.keys).length);
  ok("la révision a avancé", inc.rev > 1, "rev=" + inc.rev);

  section("7. L'application VOIT et MONTRER la rétention");
  /* Le serveur borne le magasin ; l'app doit le dire. Un élagage invisible
     serait indistinguable d'une perte de données. */
  const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
  const { chromium } = require("playwright");
  const AUTH_HASH = "ca9cc135dea09c84e670f62659826f1d9d76a633e421cdc54c67ffa20b3a1a96";
  const optionsNav = Object.assign({ args: ["--no-sandbox", "--no-proxy-server"] },
    process.env.PW_DIR ? { executablePath: path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe") } : {});
  const browser = await chromium.launch(optionsNav);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.addInitScript(() => { try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {} });
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate((h) => {
    const enc = new TextEncoder().encode("remember:" + h);
    return crypto.subtle.digest("SHA-256", enc).then(buf => {
      const tok = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem("theologicus_remember", JSON.stringify({ v: 1, mode: "admin", exp: Date.now() + 86400000 * 30, tok }));
    });
  }, AUTH_HASH);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate(() => { const ov = document.getElementById('setup-wizard-overlay'); if (ov) { ov.classList.remove('active'); ov.style.display = 'none'; } }).catch(() => {});
  await page.waitForFunction(() => {
    const e = window.__theoSync && window.__theoSync.etatServeur && window.__theoSync.etatServeur();
    return !!(e && e.octets);
  }, { timeout: 60000 }).catch(() => {});
  const etat = await page.evaluate(() => (window.__theoSync && window.__theoSync.etatServeur) ? window.__theoSync.etatServeur() : null);
  ok("l'app publie l'état du magasin serveur", !!etat, JSON.stringify(etat));
  ok("elle connaît sa taille", etat && etat.octets > 0, "octets=" + (etat && etat.octets));
  ok("elle connaît l'élagage subi", etat && etat.elagage && etat.elagage.n > 0, JSON.stringify(etat && etat.elagage));

  const ui = await page.evaluate(() => {
    try {
      const b = document.getElementById('open-etude-modal');
      if (!b) return { err: 'bouton ETUDE absent' };
      b.click();
      const t = document.querySelector('#v189-tabs button[data-v="backup"]');
      if (!t) return { err: 'onglet Sauvegarde absent' };
      t.click();
      const el = document.getElementById('v189-sync-srv');
      return { txt: el ? el.textContent : '(bloc absent)' };
    } catch (e) { return { err: String(e) }; }
  });
  ok("le panneau affiche l'état du magasin", !!ui.txt, ui.err || '');
  ok("le texte nomme le magasin serveur", /Magasin serveur/.test(ui.txt || ''), ui.txt);
  ok("le texte explique la rétention", /rétention/.test(ui.txt || ''), ui.txt);
  await browser.close();

  section("8. Rétention AU DÉMARRAGE : un magasin HÉRITÉ est borné au lancement");
  /* C'est le cas réel de l'utilisateur : son magasin faisait 42,6 Mo AVANT le
     correctif. Sans rétention au démarrage, il ne maigrirait qu'au prochain
     POST — donc seulement si un client écrit. */
  if (relais) { H.killRelay(relais); relais = null; }
  await new Promise(r => setTimeout(r, 1500));
  const dir = path.join(STORE_DIR, 'THEOLOGICUS');
  fs.mkdirSync(dir, { recursive: true });
  const gros = { rev: 99, keys: {} };
  for (let i = 0; i < 20; i++) gros.keys['chat::herite-' + i] = { v: chatVal(i), ts: 1000 + i, rev: 1 };
  gros.keys['theo_panel_notes_v1'] = { v: JSON.stringify([{ id: 'n', note: 'x'.repeat(1000) }]), ts: 1000, rev: 1 };
  const fichier = path.join(dir, 'theologicus_store.json');
  fs.writeFileSync(fichier, JSON.stringify(gros), 'utf8');
  const avantKo = Math.round(fs.statSync(fichier).size / 1024);
  ok("un magasin hérité TROP GROS a été posé (" + avantKo + " Ko pour un plafond de " + Math.round(PLAFOND / 1024) + " Ko)",
    avantKo > PLAFOND / 1024, avantKo + " Ko");

  relais = await H.spawnRelay({ port: PORT, localAppData: STORE_DIR, storeMaxBytes: PLAFOND, storeMinChats: PLANCHER });
  if (!relais.child || relais.child.exitCode !== null) {
    ok("le relais redémarre", false);
  } else {
    const st2 = await getStore();
    ok("le magasin est borné DÈS LE DÉMARRAGE", st2.octets <= PLAFOND, st2.octets + " <= " + PLAFOND);
    ok("la rétention au démarrage est COMPTÉE", (st2.elagage || {}).n > 0, JSON.stringify(st2.elagage));
    ok("les notes survivent aussi au démarrage", !!st2.keys['theo_panel_notes_v1']);
    const apresKo = Math.round(fs.statSync(fichier).size / 1024);
    console.log("  fichier : " + avantKo + " Ko -> " + apresKo + " Ko");
    ok("le FICHIER a réellement maigri", apresKo < avantKo, avantKo + " Ko -> " + apresKo + " Ko");
  }

  section("9. Propreté");
  ok("le fichier du magasin existe et est borné", (() => {
    try {
      const n = fs.statSync(fichier).size;
      console.log("  fichier : " + Math.round(n / 1048576 * 10) / 10 + " Mo");
      return n <= PLAFOND * 1.15;    /* marge : le JSON contient aussi les métadonnées */
    } catch (e) { return false; }
  })());

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
