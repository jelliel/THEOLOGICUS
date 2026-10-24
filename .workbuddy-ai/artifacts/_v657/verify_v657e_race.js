// Banc v657e — COURSE DE REPARATION (cas sans ancre, 99,7 % du store).
//
// _ancFit lit le TEXTE SOUS la position PIXEL courante de la figure pour creer
// l'ancre. Sur un demarrage a froid, les cartes Wikipédia se re-telechargent
// (cache vide) : la mise en page REFLUE pendant que la premiere repair passe.
// Si la repair s'execute ALORS QUE des cartes sont deja inserees (ou pas
// encore), le texte sous la figure differe -> ancre differente -> position
// differente a CHAQUE demarrage = « deplacements aleatoires ».
//
// On injecte UNE carte en TETE de message a un instant VARIABLE (100/300/600 ms)
// qui chevauche les passes de repair (0/120/400/900 ms). Si la position finale
// de la figure varie entre les 3 runs -> course reproductible.
//
// CONTRAT
//   A. figure sans ancre posee ;
//   B. position finale IDENTIQUE sur 3 runs malgre l'instant d'injection
//      variable de la carte (determinisme de la repair) ;
//   C. ancre finalement identique entre runs ;
//   D. aucune erreur JS.
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const BASE_PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 9673;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

const MSGTS = 1795000003656;
const SHAPE_SVG = '<path d="M12 20 C4 13 4 6 9 6 C11 6 12 8 12 8 C12 8 13 6 15 6 C20 6 20 13 12 20 Z" fill="none" stroke="cur" stroke-width="2"/>';
const TEXTE = [
  "1. Kyrios comme titre christologique",
  "",
  "**Paul de Tarse** utilise *Kyrios* dans ses epitres pour designer Jesus comme Seigneur, et cette designation porte une charge confessionnelle que la Septante avait deja preparee.",
  "",
  "**Methode** : analyser Mar Yah dans les Targums, etudier Kyrios dans le NT, comparer avec la patristique.",
  "",
  "Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
  "Ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
  "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.",
  "Excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum.",
  "Le Kyrios est le Seigneur des pauvres, pas des oppresseurs.",
].join("\n");

const res = [];
function ok(nom, cond, detail) {
  res.push([!!cond, nom, detail === undefined ? "" : String(detail)]);
  console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`);
}

function makeServe(port) {
  const s = http.createServer((req, rq) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/THEOLOGICUS.html";
    const fp = path.join(SERVI, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      rq.writeHead(200, { "Content-Type": p.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream", "Cache-Control": "no-store" });
      fs.createReadStream(fp).pipe(rq);
    } else { rq.writeHead(404); rq.end("404"); }
  });
  return new Promise(r => s.listen(port, "127.0.0.1", r)).then(() => s);
}

async function seed(page, chatId) {
  await page.evaluate(async ({ chatId, texte, msgTs, svg }) => {
    const chat = { id: chatId, title: "Banc v657e", updated: Date.now(), messages: [
      { role: "system", content: "sys", ts: 1 },
      { role: "assistant", content: texte, ts: msgTs, annotations: [], marks: [], shapes: [
        { id: "frace", x: 40, y: 300, w: 420, h: 90, shape: "Rectangle", color: "#4f8ef7",
          weight: 1.2, fill: "", rot: 0, text: "", note: "note race", svg: svg },
      ] },
    ] };
    await new Promise((res2, rej) => {
      const r = indexedDB.open("THEOLOGICUS_AI_DB");
      r.onupgradeneeded = () => { const d = r.result;
        if (!d.objectStoreNames.contains("chats")) d.createObjectStore("chats", { keyPath: "id" });
        if (!d.objectStoreNames.contains("settings")) d.createObjectStore("settings", { keyPath: "id" }); };
      r.onsuccess = () => { const db = r.result; const tx = db.transaction(["chats","settings"],"readwrite");
        tx.objectStore("chats").put(chat); tx.objectStore("settings").put({ id:"currentChatId", value: chatId });
        tx.oncomplete = () => res2(); tx.onerror = () => rej(tx.error); };
      r.onerror = () => rej(r.error);
    });
    localStorage.setItem("theologicus_chat_" + chatId, JSON.stringify(chat));
    localStorage.setItem("currentChatId", chatId);
    localStorage.setItem("theo_chat_id", chatId);
  }, { chatId, texte: TEXTE, msgTs: MSGTS, svg: SHAPE_SVG });
}

async function injecterCarteTete(page) {
  // Carte NEUTRE (pas de data-wiki) : elle reflue la page a l'injection, comme
  // une carte Wikipedia chargee en asynchrone, mais elle ne declenche PAS le
  // pipeline de cartes de l'app (qui genererait un contenu final non
  // deterministe et masquerait la course reelle de repair). On teste ainsi
  // UNIQUEMENT la robustesse de _ancFit face a un reflue a instant variable.
  return await page.evaluate(() => {
    const mc = document.querySelector(".message-content");
    if (!mc) return false;
    const fig = document.createElement("div");
    fig.className = "sim-race-card";
    fig.style.cssText = "display:flex;gap:12px;align-items:flex-start;margin:10px 0 2px;padding:10px;border:1px solid rgba(79,142,247,.25);border-radius:12px;max-width:560px;";
    fig.innerHTML = '<div style="flex:0 0 auto;width:190px;height:170px;background:#0a0f18;border-radius:8px;"></div><div>Carte course (neutre, reflue la page a instant variable).</div>';
    mc.insertBefore(fig, mc.firstElementChild);
    return true;
  });
}

async function calme(page, minMs) {
  const t0 = Date.now(); let prec = null, n = 0;
  for (let i = 0; i < 60; i++) {
    const cur = await page.evaluate(() => {
      const mc = document.querySelector(".message-content");
      const fb = document.querySelector('.atc-figbox[data-fig-id="frace"]');
      if (!mc || !fb) return null;
      const rmc = mc.getBoundingClientRect();
      return { cadre: Math.round(fb.getBoundingClientRect().top - rmc.top), h: Math.round(mc.scrollHeight) };
    });
    if (cur && prec && cur.cadre === prec.cadre && cur.h === prec.h) n++; else n = 0;
    prec = cur;
    if (n >= 4 && Date.now() - t0 >= (minMs || 3000)) break;
    await page.waitForTimeout(250);
  }
  return prec;
}

async function lire(page, chatId) {
  return await page.evaluate(async (chatId) => {
    const fb = document.querySelector('.atc-figbox[data-fig-id="frace"]');
    const mc = document.querySelector(".message-content");
    const cadre = fb ? Math.round(fb.getBoundingClientRect().top - mc.getBoundingClientRect().top) : null;
    const idb = await new Promise((ok2) => { const r = indexedDB.open("THEOLOGICUS_AI_DB");
      r.onsuccess = () => { const tx = r.result.transaction(["chats"],"readonly"); const g = tx.objectStore("chats").get(chatId);
        g.onsuccess = () => ok2(g.result); g.onerror = () => ok2(null); }; r.onerror = () => ok2(null); });
    const m = idb && idb.messages ? idb.messages.find(x => x.shapes && x.shapes.length) : null;
    const f = m ? m.shapes[0] : null;
    return { cadre, ancre: f && f.ancre ? { start: f.ancre.start, end: f.ancre.end } : null };
  }, chatId);
}

(async () => {
  const INJECT_MS = [100, 300, 600];   // instants variables chevauchant les passes de repair
  const browser = await chromium.launch(Object.assign({ args: ["--no-sandbox", "--disable-dev-shm-usage"] },
    process.env.PW_DIR ? { executablePath: CHROME } : {}));
  const serveurs = [];
  const resultats = [];
  for (let run = 0; run < INJECT_MS.length; run++) {
    const port = BASE_PORT + run;
    const serveur = await makeServe(port); serveurs.push(serveur);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    const errJs = []; page.on("pageerror", e => errJs.push(String((e && e.message) || e)));
    await page.addInitScript(() => { try { localStorage.setItem("theologicus_wizard_skipped","1"); } catch(e){}
      try { localStorage.removeItem("theologicus_mssfig_v1"); } catch(e){} });
    const chatId = "chat-v657e-run" + run;
    await page.goto(`http://127.0.0.1:${port}/blank.html`, { waitUntil: "domcontentloaded" });
    await seed(page, chatId);
    await page.goto(`http://127.0.0.1:${port}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 120000 });
    await page.evaluate(() => { const o = document.getElementById("auth-overlay"); if (o) o.remove();
      if (!window.__dw) window.__dw = setInterval(function(){ const w=document.getElementById("setup-wizard-overlay"); if(w) w.classList.remove("active"); }, 250); });
    await page.evaluate(async (id) => { try { await window.loadChat(id); } catch(e){} try { window.renderMessages(); } catch(e){} }, chatId);
    await page.waitForSelector('.atc-figbox[data-fig-id="frace"]', { state: "attached", timeout: 30000 });
    // Injecter la carte a l'instant VARIABLE (course avec la repair).
    await page.waitForTimeout(INJECT_MS[run]);
    await injecterCarteTete(page);
    console.log(`  [run ${run}] carte inseree a t=${INJECT_MS[run]} ms`);
    const e = await calme(page, 4000);
    const lu = await lire(page, chatId);
    resultats.push({ run, cadre: e ? e.cadre : null, ancre: lu.ancre, err: errJs });
    await ctx.close();
  }
  await browser.close();
  serveurs.forEach(s => s.close());

  ok("A. figure sans ancre posee sur les 3 runs", resultats.every(r => r.cadre !== null),
     "cadres = " + resultats.map(r => r.cadre).join(", "));
  const cadres = resultats.map(r => r.cadre);
  const det = cadres.every(c => c === cadres[0]);
  ok("B. position finale IDENTIQUE malgre l'instant d'injection variable (pas de course)",
     det, "cadres y = " + cadres.join(", ") + (det ? " (deterministe)" : " (DIVERGENT => course reproductible)"));
  const ancres = resultats.map(r => r.ancre ? (r.ancre.start + ".." + r.ancre.end) : "null");
  const ancreDet = ancres.every(a => a === ancres[0]);
  ok("C. ancre finalement identique entre runs", ancreDet, "ancores = " + ancres.join(", "));
  ok("D. aucune erreur JS", resultats.every(r => r.err.length === 0), resultats.map(r => r.err.length).join("/"));

  const total = res.length, bons = res.filter(r => r[0]).length;
  console.log(`\n  ${bons}/${total} — ${bons === total ? "OK" : "ECHEC"}`);
  process.exit(bons === total ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
