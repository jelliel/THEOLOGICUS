// Banc v657b — LE CAS REEL : 99,7 % des figures du store N'ONT PAS d'ancre.
// Elles sont reparees par _ancFit, qui lit le TEXTE SOUS la position PIXEL
// courante de la figure. Si l'ancre reparee n'est PAS persidee, chaque
// redemarrage la re-derive a partir de f.x/f.y, or f.x/f.y n'est persiste
// QUE quand une ancre existe (ligne 30084) — donc la figure se re-ancre sur
// le texte qui se trouve sous ses pixels AU MOMENT du rendu, ce qui depend
// du chargement asynchrone des cartes Wikipédia => position ALEATOIRE.
//
// CONTRAT
//   A. premisse : figure sans ancre posee ;
//   B. apres le 1er rendu, une ancre a ete CREE (reparation) ET PERSISTEE
//      (presente dans le store APRES un reload) ;
//   C. la position de la figure est DETERMINISTE sur 3 redemarrages
//      (vrais reload, cache vide simule) ;
//   D. l'ancre persitee est stable (meme start/end apres chaque reload) ;
//   E. aucune erreur JS.
//
// Controle negatif : si l'ancre reparee n'est pas persidee, B ECHOUE ou C
// montre des positions DIVERGENTES entre redemarrages.
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 9672;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

const CHAT = "chat-v657b-noanchor";
const MSGTS = 1795000002656;
const SHAPE_SVG = '<path d="M12 20 C4 13 4 6 9 6 C11 6 12 8 12 8 C12 8 13 6 15 6 C20 6 20 13 12 20 Z" fill="none" stroke="cur" stroke-width="2"/>';

const TEXTE = [
  "1. Kyrios comme titre christologique",
  "",
  "**Paul de Tarse** utilise *Kyrios* dans ses epitres pour designer Jesus comme Seigneur, et cette designation porte une charge confessionnelle.",
  "",
  "**Methode** : analyser Mar Yah dans les Targums, etudier Kyrios dans le NT, comparer avec la patristique.",
  "",
  "Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
  "Ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.",
  "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.",
  "Le Kyrios est le Seigneur des pauvres, pas des oppresseurs.",
].join("\n");

const res = [];
function ok(nom, cond, detail) {
  res.push([!!cond, nom, detail === undefined ? "" : String(detail)]);
  console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`);
}

function serve() {
  const s = http.createServer((req, rq) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/THEOLOGICUS.html";
    const fp = path.join(SERVI, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      rq.writeHead(200, { "Content-Type": p.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream", "Cache-Control": "no-store" });
      fs.createReadStream(fp).pipe(rq);
    } else { rq.writeHead(404); rq.end("404"); }
  });
  return new Promise(r => s.listen(PORT, "127.0.0.1", r)).then(() => s);
}

async function seed(page) {
  await page.evaluate(async ({ chatId, texte, msgTs, svg }) => {
    // Figure SANS ancre : seulement x/y/w/h (cas reel de 99,7 % du store).
    const chat = { id: chatId, title: "Banc v657b", updated: Date.now(), messages: [
      { role: "system", content: "sys", ts: 1 },
      { role: "assistant", content: texte, ts: msgTs, annotations: [], marks: [], shapes: [
        { id: "fnoanchor", x: 40, y: 300, w: 420, h: 90, shape: "Rectangle", color: "#4f8ef7",
          weight: 1.2, fill: "", rot: 0, text: "", note: "note noanchor", svg: svg },
      ] },
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
        tx.objectStore("settings").put({ id: "currentChatId", value: chatId });
        tx.oncomplete = () => res2(); tx.onerror = () => rej(tx.error);
      };
      r.onerror = () => rej(r.error);
    });
    localStorage.setItem("theologicus_chat_" + chatId, JSON.stringify(chat));
    localStorage.setItem("currentChatId", chatId);
    localStorage.setItem("theo_chat_id", chatId);
  }, { chatId: CHAT, texte: TEXTE, msgTs: MSGTS, svg: SHAPE_SVG });
}

async function ouvrir(page, attendre) {
  await page.evaluate(async (id) => {
    try { await window.loadChat(id); } catch (e) {}
    try { window.renderMessages(); } catch (e) {}
  }, CHAT);
  await page.waitForSelector('.atc-figbox[data-fig-id="fnoanchor"]', { state: "attached", timeout: 30000 });
  // Calme reel : 4 mesures identiques + >= 3 s.
  const t0 = Date.now();
  let prec = null, n = 0;
  for (let i = 0; i < 60; i++) {
    const cur = await page.evaluate(() => {
      const mc = document.querySelector(".message-content");
      const fb = document.querySelector('.atc-figbox[data-fig-id="fnoanchor"]');
      if (!mc || !fb) return null;
      const rmc = mc.getBoundingClientRect();
      return { cadre: Math.round(fb.getBoundingClientRect().top - rmc.top), h: Math.round(mc.scrollHeight) };
    });
    if (cur && prec && cur.cadre === prec.cadre && cur.h === prec.h) n++; else n = 0;
    prec = cur;
    if (n >= 4 && Date.now() - t0 >= (attendre || 3000)) break;
    await page.waitForTimeout(250);
  }
  return prec;
}

async function posEtAncre(page) {
  return await page.evaluate(async (chatId) => {
    const fb = document.querySelector('.atc-figbox[data-fig-id="fnoanchor"]');
    const mc = document.querySelector(".message-content");
    const cadre = fb ? Math.round(fb.getBoundingClientRect().top - mc.getBoundingClientRect().top) : null;
    const idb = await new Promise((ok2) => {
      const r = indexedDB.open("THEOLOGICUS_AI_DB");
      r.onsuccess = () => {
        const tx = r.result.transaction(["chats"], "readonly");
        const g = tx.objectStore("chats").get(chatId);
        g.onsuccess = () => ok2(g.result); g.onerror = () => ok2(null);
      };
      r.onerror = () => ok2(null);
    });
    const m = idb && idb.messages ? idb.messages.find(x => x.shapes && x.shapes.length) : null;
    const f = m ? m.shapes[0] : null;
    return { cadre, ancre: f && f.ancre ? { start: f.ancre.start, end: f.ancre.end } : null, fx: f ? f.x : null, fy: f ? f.y : null };
  }, CHAT);
}

(async () => {
  const serveur = await serve();
  const browser = await chromium.launch(Object.assign({ args: ["--no-sandbox", "--disable-dev-shm-usage"] },
    process.env.PW_DIR ? { executablePath: CHROME } : {}));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errJs = [];
  page.on("pageerror", e => errJs.push(String((e && e.message) || e)));
  await page.addInitScript(() => {
    try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {}
    try { localStorage.removeItem("theologicus_mssfig_v1"); } catch (e) {} // cache vide simule
  });

  await page.goto(`http://127.0.0.1:${PORT}/blank.html`, { waitUntil: "domcontentloaded" });
  await seed(page);
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 120000 });
  await page.evaluate(() => {
    const o = document.getElementById("auth-overlay"); if (o) o.remove();
    if (!window.__dw) window.__dw = setInterval(function () {
      const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active");
    }, 250);
  });

  const e0 = await ouvrir(page, 3000);
  ok("A. premisse : figure sans ancre posee et calme", !!e0 && e0.cadre > 0, e0 ? `cadre y=${e0.cadre}` : "absente");

  const apres1 = await posEtAncre(page);
  ok("B1. une ancre a ete CREEE par reparation", !!apres1.ancre, apres1.ancre ? `start=${apres1.ancre.start}..${apres1.ancre.end}` : "ancre absente en memoire");

  // Reload #1 : l'ancre doit avoir ete PERSISTEE.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 120000 });
  await page.evaluate(() => {
    const o = document.getElementById("auth-overlay"); if (o) o.remove();
    if (!window.__dw) window.__dw = setInterval(function () { const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active"); }, 250);
  });
  const e1 = await ouvrir(page, 3000);
  const apres2 = await posEtAncre(page);
  ok("B. l'ancre reparee est PERSISTEE (presente apres reload)", !!apres2.ancre, apres2.ancre ? `start=${apres2.ancre.start}..${apres2.ancre.end}` : "ancre PERDUE au reload");

  // Reload #2 + #3 : position doit etre DETERMINISTE.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 120000 });
  await page.evaluate(() => { const o = document.getElementById("auth-overlay"); if (o) o.remove(); if (!window.__dw) window.__dw = setInterval(function () { const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active"); }, 250); });
  const e2 = await ouvrir(page, 3000);
  const apres3 = await posEtAncre(page);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 120000 });
  await page.evaluate(() => { const o = document.getElementById("auth-overlay"); if (o) o.remove(); if (!window.__dw) window.__dw = setInterval(function () { const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active"); }, 250); });
  const e3 = await ouvrir(page, 3000);
  const apres4 = await posEtAncre(page);

  const positions = [e0 && e0.cadre, e1 && e1.cadre, e2 && e2.cadre, e3 && e3.cadre];
  const deterministe = positions.every(p => p === positions[0]);
  ok("C. position DETERMINISTE sur 4 chargements (3 reloads)", deterministe,
     "cadres y = " + positions.join(", "));

  const ancres = [apres1.ancre, apres2.ancre, apres3.ancre, apres4.ancre];
  const ancreStable = ancres.every(a => a && ancres[0] && a.start === ancres[0].start && a.end === ancres[0].end);
  ok("D. ancre stable a travers les reloads", ancreStable,
     "ancores start = " + ancres.map(a => a ? a.start : "null").join(", "));

  ok("E. aucune erreur JavaScript", errJs.length === 0, errJs.slice(0, 2).join(" | "));

  const total = res.length, bons = res.filter(r => r[0]).length;
  console.log(`\n  ${bons}/${total} — ${bons === total ? "OK" : "ECHEC"}`);
  await browser.close();
  serveur.close();
  process.exit(bons === total ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
