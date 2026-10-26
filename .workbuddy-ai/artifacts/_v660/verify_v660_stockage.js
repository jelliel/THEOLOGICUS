// Banc v660 — STOCKAGE AUTO-RÉPARATEUR (Archives + configuration).
//
// Symptômes rapportés : « erreurs de chargement » quand on clique sur
// Archives, et configuration (clé API…) à refaire à chaque relance.
//
// Causes :
//  1. app.py laissait pywebview utiliser %APPDATA%\pywebview, profil PARTAGÉ
//     par toutes les applis pywebview -> verrou/corruption possible.
//  2. THEOLOGICUS.html n'ouvrait IndexedDB qu'UNE fois au démarrage ; un échec
//     était seulement journalisé -> db.conn indéfini pour toute la session ->
//     db.getAll jette -> « Erreur de chargement » dans Archives.
//
// Correctif testé ici (côté HTML) : db.ensure() rouvre la base à la demande
// (3 tentatives), et getAll/get/put/delete passent par ensure().
//
// SCÉNARIO : on sème une conversation, puis on patche indexedDB.open pour
// faire ÉCHOUER les 3 premières ouvertures (celles du démarrage), puis on
// ouvre Archives. Avec le correctif, le clic déclenche une nouvelle tentative
// qui réussit -> la conversation apparaît. Sans le correctif (build HEAD),
// Archives affiche « Erreur de chargement ».
//
// CONTRAT
//   A. la conversation semée est bien dans IndexedDB ;
//   B. les 3 ouvertures de démarrage ont échoué (prémisse : la panne simulée
//      a bien eu lieu) ;
//   C. Archives affiche la conversation (pas « Erreur de chargement ») ;
//   D. aucune erreur JavaScript non gérée.
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8981;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

const CHAT = "chat-v660-db";
const MSGTS = 1797000000666;

const res = [];
function ok(nom, cond, detail) {
  res.push([!!cond, nom, detail === undefined ? "" : String(detail)]);
  console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`);
}

(async () => {
  const serveur = http.createServer((req, rq) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/THEOLOGICUS.html";
    const fp = path.join(SERVI, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      rq.writeHead(200, { "Content-Type": p.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream", "Cache-Control": "no-store" });
      fs.createReadStream(fp).pipe(rq);
    } else { rq.writeHead(404); rq.end("404"); }
  });
  await new Promise(r => serveur.listen(PORT, "127.0.0.1", r));
  const browser = await chromium.launch(Object.assign({ args: ["--no-sandbox", "--disable-dev-shm-usage"] },
    process.env.PW_DIR ? { executablePath: CHROME } : {}));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errJs = [];
  page.on("pageerror", e => errJs.push(String((e && e.message) || e)));
  await page.addInitScript(() => { try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {} });

  /* 1) semer une conversation (page neutre, IndexedDB non patché) */
  await page.goto(`http://127.0.0.1:${PORT}/blank.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate(async ({ chatId, msgTs }) => {
    const chat = { id: chatId, title: "Conversation v660", updated: Date.now(), messages: [
      { role: "system", content: "sys", ts: 1 },
      { role: "assistant", content: "Contenu de la conversation semée pour le banc v660.", ts: msgTs, annotations: [], marks: [], shapes: [] },
    ] };
    await new Promise((res2, rej) => {
      const r = indexedDB.open("THEOLOGICUS_AI_DB");
      r.onupgradeneeded = () => { const d = r.result;
        if (!d.objectStoreNames.contains("chats")) d.createObjectStore("chats", { keyPath: "id" });
        if (!d.objectStoreNames.contains("settings")) d.createObjectStore("settings", { keyPath: "id" }); };
      r.onsuccess = () => { const db = r.result; const tx = db.transaction(["chats","settings"],"readwrite");
        tx.objectStore("chats").put(chat); tx.objectStore("settings").put({ id:"currentChatId", value: chatId });
        tx.oncomplete = () => { db.close(); res2(); }; tx.onerror = () => rej(tx.error); };
      r.onerror = () => rej(r.error);
    });
  }, { chatId: CHAT, msgTs: MSGTS });

  /* A. la conversation est bien semée */
  const seme = await page.evaluate(async (chatId) => {
    const idb = await new Promise((ok2) => { const r = indexedDB.open("THEOLOGICUS_AI_DB");
      r.onsuccess = () => { const db = r.result; const g = db.transaction(["chats"],"readonly").objectStore("chats").get(chatId);
        g.onsuccess = () => { ok2(g.result || null); db.close(); }; g.onerror = () => ok2(null); }; r.onerror = () => ok2(null); });
    return !!(idb && idb.id === chatId);
  }, CHAT);
  ok("A. conversation semée dans IndexedDB", seme, seme ? "ok" : "absente");

  /* 2) patcher indexedDB.open : les 3 PREMIÈRES ouvertures échouent
     (celles du démarrage = les 3 tentatives de db.ensure), ensuite normal. */
  await page.addInitScript(() => {
    const vrai = indexedDB.open.bind(indexedDB);
    let n = 0;
    window.__dbOuvertures = 0; window.__dbEchecs = 0;
    indexedDB.open = function (...args) {
      n++; window.__dbOuvertures = n;
      if (n <= 3) {
        window.__dbEchecs++;
        const faux = {};
        setTimeout(() => {
          try { if (faux.onblocked) faux.onblocked(); } catch (e) {}
          try { if (faux.onerror) faux.onerror({ target: { error: new Error('échec simulé (banc v660)') } }); } catch (e) {}
        }, 0);
        return faux;
      }
      return vrai(...args);
    };
  });

  /* 3) charger l'app : le démarrage échoue 3 fois (panne simulée) */
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 });
  await page.evaluate(() => {
    const o = document.getElementById("auth-overlay"); if (o) o.remove();
    if (!window.__dw) window.__dw = setInterval(function () {
      const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active");
    }, 250);
  });
  await page.waitForTimeout(1500);   // laisser les 3 tentatives de démarrage échouer

  /* B. prémisse : les 3 ouvertures de démarrage ont échoué */
  const dem = await page.evaluate(() => ({ n: window.__dbOuvertures, echecs: window.__dbEchecs }));
  ok("B. panne simulée : les 3 ouvertures de démarrage ont échoué",
     dem.n >= 3 && dem.echecs >= 3, JSON.stringify(dem));

  /* 4) cliquer sur Archives : doit se réparer tout seul */
  await page.evaluate(() => {
    const b = document.getElementById("archives-btn");
    if (b) b.click();
  });
  await page.waitForTimeout(1500);

  /* C. la liste contient la conversation, sans message d'erreur */
  const arch = await page.evaluate(() => {
    const pan = document.getElementById("archives-panel");
    const txt = pan ? pan.innerText : "";
    return {
      items: pan ? pan.querySelectorAll(".archive-item").length : -1,
      erreur: /Erreur de chargement/.test(txt),
      apercu: txt.replace(/\s+/g, " ").slice(0, 120),
      ouvertures: window.__dbOuvertures,
    };
  });
  ok("C. Archives affiche la conversation (pas d'« Erreur de chargement »)",
     arch.items >= 1 && !arch.erreur,
     `items=${arch.items} erreur=${arch.erreur} ouvertures=${arch.ouvertures} | ${arch.apercu}`);

  /* D. hygiène */
  ok("D. aucune erreur JavaScript non gérée", errJs.length === 0, errJs.slice(0, 2).join(" | "));

  const bons = res.filter(r => r[0]).length;
  console.log(`\n${bons}/${res.length} — ${bons === res.length ? "OK" : "ECHEC"}`);
  await browser.close(); serveur.close();
  process.exit(bons === res.length ? 0 : 1);
})().catch(e => { console.error("EXCEPTION :", e && e.stack || e); process.exit(2); });
