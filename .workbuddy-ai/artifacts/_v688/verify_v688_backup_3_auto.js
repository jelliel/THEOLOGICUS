/* v688 — EXPORT : ne garder que les 3 auto_backups les plus récents.

   Contexte mesuré : un backup de 369,5 Mo contenait 318,9 Mo d'auto_backups
   (7 entrées, chacune une copie complète des conversations). L'utilisateur a
   choisi « garder les 3 dernières ».

   Ce banc PROUVE le comportement réel : on sème 7 entrées dans IndexedDB,
   on appelle window.exportData() et on inspecte le payload réellement envoyé
   à /save-data (fetch intercepté). Sur l'ancien build les 7 passent -> ECHEC.
*/
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = Number(process.env.PORT || 9697);
function trouverRacine() {
  let d = __dirname;
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(d, "THEOLOGICUS.html"))) return d;
    d = path.dirname(d);
  }
  return path.resolve(process.env.BENCH_ROOT || process.cwd());
}
const RACINE = path.resolve(process.env.BENCH_ROOT || trouverRacine());
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

let ok_n = 0, ko_n = 0;
function ok(nom, cond, detail) {
  if (cond) { ok_n++; console.log("[OK]    " + nom + (detail ? "  -- " + detail : "")); }
  else { ko_n++; console.log("[ECHEC] " + nom + (detail ? "  -- " + detail : "")); }
}
const pause = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const APP = path.join(RACINE, "THEOLOGICUS.html");
  if (!fs.existsSync(APP)) { console.error("[ECHEC] app introuvable : " + APP); process.exit(1); }

  const serveur = http.createServer((rq, rs) => {
    let p = decodeURIComponent(rq.url.split("?")[0]);
    if (p === "/") p = "/THEOLOGICUS.html";
    const fp = path.join(RACINE, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      rs.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      fs.createReadStream(fp).pipe(rs);
    } else { rs.writeHead(404); rs.end("404"); }
  });
  await new Promise(r => serveur.listen(PORT, "127.0.0.1", r));

  const browser = await chromium.launch(Object.assign(
    { args: ["--no-sandbox", "--disable-dev-shm-usage"] },
    process.env.PW_DIR ? { executablePath: CHROME } : {}));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", e => erreurs.push(String(e.message)));

  await page.addInitScript(() => {
    try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {}
    try { sessionStorage.setItem("theologicus_auth", "true"); } catch (e) {}
  });
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`,
    { waitUntil: "domcontentloaded", timeout: 90000 });

  const attendre = (ms) => page.waitForFunction(
    () => typeof window.exportData === "function",
    null, { timeout: ms }).then(() => true).catch(() => false);
  let pret = await attendre(90000);
  if (!pret) { try { await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 }); } catch (e) {} pret = await attendre(90000); }
  ok("P0 PRÉMISSE : window.exportData disponible", pret);
  if (!pret) {
    await browser.close(); serveur.close();
    console.log(`\n${ok_n} OK, ${ko_n} ECHEC`); process.exit(1);
  }
  await page.route(u => u.hostname.indexOf("sophiascriptura.com") >= 0, r => r.abort());
  await pause(500);

  /* Sème 7 auto_backups (ts 1000..1006) dans la DB de l'app, intercepte le
     POST /save-data et appelle VRAIMENT exportData(). */
  const capture = await page.evaluate(async () => {
    const open = () => new Promise((res, rej) => {
      const r = indexedDB.open("THEOLOGICUS_AI_DB");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    let db;
    try { db = await open(); } catch (e) { return { erreur: "open DB: " + e }; }

    let tx, st;
    try {
      tx = db.transaction("auto_backups", "readwrite");
      st = tx.objectStore("auto_backups");
    } catch (e) { db.close(); return { erreur: "store absent: " + e }; }
    try {
      st.clear();
      for (let i = 0; i < 7; i++) {
        st.put({ id: "test-" + i, ts: 1000 + i, type: "conversations",
                 json: JSON.stringify({ n: i }) });
      }
      await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    } catch (e) { db.close(); return { erreur: "seed: " + e }; }
    db.close();

    /* Intercepte le fetch : on capture le corps sans rien écrire sur disque. */
    let body = null;
    const orig = window.fetch;
    window.fetch = function (input, init) {
      const u = typeof input === "string" ? input : (input && input.url) || "";
      if (u === "/save-data") {
        body = (init && init.body) || null;
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ path: "backups" }) });
      }
      return orig.apply(window, arguments);
    };
    try { await window.exportData(); } catch (e) { return { erreur: "exportData: " + e, body: body }; }
    window.fetch = orig;
    return { body: body };
  });

  ok("P1 PRÉMISSE : 7 auto_backups semés et export exécuté",
    !capture.erreur, capture.erreur || "");
  ok("P2 un corps a été envoyé à /save-data", !!capture.body);
  if (!capture.body) {
    await browser.close(); serveur.close();
    console.log(`\n${ok_n} OK, ${ko_n} ECHEC`); process.exit(1);
  }

  let req, payload;
  try { req = JSON.parse(capture.body); } catch (e) { req = null; }
  ok("P3 corps JSON valide", !!req);
  /* Petit backup -> chemin « text » brut ; gros -> chunks (ici on est petit). */
  let texte = req && (req.text != null ? req.text : null);
  if (!texte) {
    await browser.close(); serveur.close();
    console.log("[DIAG] pas de champ text (chemin chunk ?) — banc non concluant");
    console.log(`\n${ok_n} OK, ${ko_n} ECHEC`); process.exit(1);
  }
  try { payload = JSON.parse(texte); } catch (e) { payload = null; }
  ok("P4 payload JSON valide", !!payload);

  const autos = (payload && payload.data && payload.data.auto_backups) || [];
  ok("C1 export contient EXACTEMENT 3 auto_backups", autos.length === 3,
     "count=" + autos.length);
  const ts = autos.map(a => Number(a && a.ts)).sort((a, b) => b - a);
  ok("C2 ce sont les 3 PLUS RÉCENTS (ts 1006, 1005, 1004)",
     JSON.stringify(ts) === JSON.stringify([1006, 1005, 1004]), JSON.stringify(ts));
  ok("C3 les autres données du backup sont intactes (chats / localStorage)",
     !!(payload && payload.data && Array.isArray(payload.data.chats) && payload.data.localStorage));
  ok("C4 version/source conservés", !!(payload && payload.version === "2.2" && payload.source === "THEOLOGICUS"));

  ok("C5 aucune erreur JS", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));

  await browser.close(); serveur.close();
  console.log(`\n${ok_n} OK, ${ko_n} ECHEC`);
  process.exit(ko_n ? 1 : 0);
})().catch(e => { console.error("[FATAL] " + (e && e.stack || e)); process.exit(1); });
