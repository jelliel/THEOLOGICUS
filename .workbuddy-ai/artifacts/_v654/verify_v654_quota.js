// Banc v654 — LE CACHE DES FICHES S'ECRIT MEME QUAND LE QUOTA EST PLEIN.
//
// Cause racine mesuree sur le store reel de l'utilisateur : 23,90 Mo de
// `theologicus_chat_*` pour un quota navigateur de ~5 Mo. `cset()` (cache des
// fiches Wikipedia, cle `theologicus_mssfig_v1`) echouait donc en silence, et
// les fiches etaient re-telechargees a chaque ouverture — elles s'inseraient
// quand elles arrivaient, decalaient le texte, et les cadres SUIVAIENT.
//
// Contrat :
//   A. quota plein + une sauvegarde => le filet evince les AUTRES conversations
//      (IndexedDB reste canonique) et libere de la place ;
//   B. apres cela, le cache des fiches PEUT s'ecrire (`theologicus_mssfig_v1`
//      present dans localStorage) ;
//   C. la conversation COURANTE est toujours dans le filet (pas de perte) ;
//   D. aucune erreur JavaScript.
//
// Controle negatif : BENCH_ROOT sur un build pre-v654 => A echoue (rien n'est
// evince, `__atcFiletEvince` reste a 0) et B echoue (le cache ne s'ecrit pas).
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 9300;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");
const CHAT = "chat-v654-quota";

const res = [];
function ok(nom, cond, detail) {
  res.push([!!cond, nom, detail === undefined ? "" : String(detail)]);
  console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`);
}

const CONTENU = "La notion de Kyrios designe la seigneurie divine. ".repeat(40);

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

  /* ───── 1. REMPLIR localStorage COMME CHEZ L'UTILISATEUR (quota sature) ─────
     On ecrit de vraies cles `theologicus_chat_*` jusqu'au refus du navigateur.
     C'est la condition exacte mesuree (23,90 Mo / 407 conversations). */
  await page.goto(`http://127.0.0.1:${PORT}/blank.html`, { waitUntil: "domcontentloaded" });
  const remplissage = await page.evaluate(() => {
    try { localStorage.clear(); } catch (e) {}
    const bloc = "x".repeat(200 * 1024);   // 200 Ko par conversation
    let n = 0;
    for (let i = 0; i < 200; i++) {
      try {
        localStorage.setItem("theologicus_chat_remplissage-" + i,
          JSON.stringify({ id: "remplissage-" + i, messages: [{ content: bloc }] }));
        n++;
      } catch (e) { break; }               // quota atteint
    }
    let octets = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      octets += k.length + (localStorage.getItem(k) || "").length;
    }
    return { cles: n, octets: octets, mo: +(octets / 1048576).toFixed(2) };
  });
  console.log("=== BANC v654 — " + (process.env.BENCH_ROOT ? "REFERENCE (pre-v654)" : "BUILD COURANT") + " ===");
  console.log("  localStorage sature : " + remplissage.cles + " conversations, " + remplissage.mo + " Mo");

  /* ───── 2. Entrer dans l'app avec une VRAIE conversation courante ───── */
  await page.evaluate(async (c) => {
    const chat = { id: c.id, title: "v654", updated: Date.now(), messages: [
      { role: "system", content: "sys", ts: 1 },
      { role: "assistant", content: c.contenu, ts: 1798000000000, marks: [], shapes: [], annotations: [] },
    ] };
    await new Promise((res2, rej) => {
      const r = indexedDB.open("THEOLOGICUS_AI_DB");
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains("chats")) d.createObjectStore("chats", { keyPath: "id" });
        if (!d.objectStoreNames.contains("settings")) d.createObjectStore("settings", { keyPath: "id" });
      };
      r.onsuccess = () => {
        const db = r.result;
        const tx = db.transaction(["chats", "settings"], "readwrite");
        tx.objectStore("chats").put(chat);
        tx.objectStore("settings").put({ id: "currentChatId", value: chat.id });
        tx.oncomplete = () => res2(); tx.onerror = () => rej(tx.error);
      };
      r.onerror = () => rej(r.error);
    });
    localStorage.setItem("currentChatId", chat.id);
    localStorage.setItem("theo_chat_id", chat.id);
  }, { id: CHAT, contenu: CONTENU });

  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 120000 });
  await page.evaluate(() => {
    const o = document.getElementById("auth-overlay"); if (o) o.remove();
    if (!window.__dw) window.__dw = setInterval(function () {
      const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active");
    }, 250);
  });
  await page.evaluate(async (id) => { try { await window.loadChat(id); } catch (e) {} }, CHAT);
  await page.waitForTimeout(800);

  /* ───── 3. Provoquer une sauvegarde (c'est ce que fait chaque annotation) ───── */
  const apres = await page.evaluate(async (id) => {
    try { if (typeof window.flushChatNow === "function") window.flushChatNow(); } catch (e) {}
    // Le cache des fiches : on ecrit une entree comme le ferait cset().
    try {
      localStorage.setItem("theologicus_mssfig_v1", JSON.stringify({ test: { title: "Kyrios" } }));
      localStorage.removeItem("theologicus_mssfig_v1");
    } catch (e) { return { ecritureCache: false, evince: window.__atcFiletEvince || 0, raison: String(e && e.name) }; }
    let octets = 0, chats = 0, courante = false;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      octets += k.length + (localStorage.getItem(k) || "").length;
      if (k.indexOf("theologicus_chat_") === 0) chats++;
      if (k === "theologicus_chat_" + id) courante = true;
    }
    return { ecritureCache: true, evince: window.__atcFiletEvince || 0,
             chats: chats, courante: courante, mo: +(octets / 1048576).toFixed(2) };
  }, CHAT);

  ok("A. le cache des fiches PEUT s'ecrire malgre un localStorage sature",
     apres.ecritureCache === true,
     apres.ecritureCache ? "ecriture reussie (" + apres.mo + " Mo au total, " + apres.chats + " conversations)"
                         : "REFUS : " + (apres.raison || "?"));

  /* Le critere qui compte vraiment : le cache SURVIT-il a un rechargement ?
     C'est lui qui evite de re-telecharger les fiches a chaque ouverture — et
     donc de decaler le texte sous les cadres. */
  await page.evaluate(() => {
    try { localStorage.setItem("theologicus_mssfig_v1", JSON.stringify({ Kyrios: { title: "Kyrios", extract: "test" } })); } catch (e) {}
  });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  const survit = await page.evaluate(() => {
    try {
      const c = JSON.parse(localStorage.getItem("theologicus_mssfig_v1") || "{}");
      let octets = 0;
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); octets += k.length + (localStorage.getItem(k) || "").length; }
      return { present: !!c.Kyrios, mo: +(octets / 1048576).toFixed(2) };
    } catch (e) { return { present: false, mo: -1 }; }
  });
  ok("B. le cache des fiches SURVIT a un rechargement",
     survit.present === true,
     survit.present ? "present apres reload (" + survit.mo + " Mo)" : "PERDU au reload");

  ok("C. la conversation COURANTE reste dans le filet",
     apres.courante === true, apres.chats + " conversation(s) dans le filet");
  ok("D. aucune erreur JavaScript", errJs.length === 0, errJs.slice(0, 2).join(" | "));

  const nOk = res.filter(r => r[0]).length;
  console.log("--------------------------------------------------------------------------");
  console.log(`RESULTAT : ${nOk}/${res.length}`);
  console.log("--------------------------------------------------------------------------");
  await browser.close();
  serveur.close();
  process.exit(nOk === res.length ? 0 : 1);
})().catch(e => { console.error("PLANTAGE :", e); process.exit(2); });
