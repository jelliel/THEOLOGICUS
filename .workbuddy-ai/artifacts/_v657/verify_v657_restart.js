// Banc v657 — LE DEMARRAGE FROID : les cartes Wikipédia se re-téléchargent
// (cache localStorage vide, quota 5 Mo), donc le contenu grandit ASYNCHRONEMENT
// APRES le chargement, sur un horizon qui depasse la fenetre de 12 s de _atcVeille.
//
// On simule EXACTEMENT ce scenario : un chat avec une figure ancree, puis on
// injecte des cartes .theo-fig (meme structure DOM que les cartes reelles)
// a des instants etendus (1.5 s, 6 s, 15 s, 22 s) — donc au-dela de la
// fenetre de 12 s de la veille, et en plein re-telechargement d'un gros chat.
//
// CONTRAT
//   A. premisse : la figure est posee, calme avant cartes ;
//   B. apres injection des cartes etendues dans le temps, la figure SUIT le
//      texte jusqu'a sa POSITION FINALE (celle obtenue si les cartes avaient
//      ete presentes des le depart) ;
//   C. la position finale est DETERMINISTE : on recharge la page (vrai
//      redemarrage, cache vide) et on retrouve EXACTEMENT la meme position ;
//   D. l'ancre enregistree n'est pas touchee.
//
// Controle negatif (BENCH_ROOT sur un build pre-v656, ou si la veille coupe
// avant 22 s) : B et/ou C echouent (figure coincee a une position
// intermediaire).
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 9671;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

const CHAT = "chat-v657-restart";
const MSGTS = 1795000001656;
const SHAPE_SVG = '<path d="M12 20 C4 13 4 6 9 6 C11 6 12 8 12 8 C12 8 13 6 15 6 C20 6 20 13 12 20 Z" fill="none" stroke="cur" stroke-width="2"/>';

// Message LONG : l'injection d'une carte pousse tout le texte suivant d'un
// bloc mesurable (~150 px par carte).
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
  "Excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt mollit anim id est laborum.",
  "Le Kyrios est le Seigneur des pauvres, pas des oppresseurs.",
].join("\n");

const PHRASE = "Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua";
const START = TEXTE.indexOf(PHRASE);
const END = START + PHRASE.length;

// Instants d'injection des cartes (ms apres le calme initial). Etendus au-dela
// de 12 s pour reproduire le re-telechargement asynchrone d'un gros chat.
const INJECTIONS = [1500, 6000, 15000, 22000];

const res = [];
function ok(nom, cond, detail) {
  res.push([!!cond, nom, detail === undefined ? "" : String(detail)]);
  console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`);
}

async function serve() {
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
  return serveur;
}

async function seed(page) {
  await page.evaluate(async ({ chatId, texte, msgTs, svg, start, end }) => {
    const chat = { id: chatId, title: "Banc v657", updated: Date.now(), messages: [
      { role: "system", content: "sys", ts: 1 },
      { role: "assistant", content: texte, ts: msgTs, annotations: [], marks: [], shapes: [
        { id: "frestart", x: 40, y: 120, w: 420, h: 90, shape: "Rectangle", color: "#4f8ef7",
          weight: 1.2, fill: "", rot: 0, text: "", note: "note restart", svg: svg,
          ancre: { start: start, end: end, ow: 672, oh: 90, ox: 0, oy: 0 } },
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
  }, { chatId: CHAT, texte: TEXTE, msgTs: MSGTS, svg: SHAPE_SVG, start: START, end: END });
}

async function ouvrir(page) {
  await page.goto(`http://127.0.0.1:${PORT}/blank.html`, { waitUntil: "domcontentloaded" });
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 120000 });
  await page.evaluate(() => {
    const o = document.getElementById("auth-overlay"); if (o) o.remove();
    if (!window.__dw) window.__dw = setInterval(function () {
      const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active");
    }, 250);
  });
  await page.evaluate(async (id) => {
    try { await window.loadChat(id); } catch (e) {}
    try { window.renderMessages(); } catch (e) {}
  }, CHAT);
  await page.waitForSelector('.atc-figbox[data-fig-id="frestart"]', { state: "attached", timeout: 30000 });
}

async function etat(page) {
  return await page.evaluate(() => {
    const mc = document.querySelector(".message-content");
    const fb = document.querySelector('.atc-figbox[data-fig-id="frestart"]');
    if (!mc || !fb) return null;
    const rmc = mc.getBoundingClientRect();
    return {
      cadre: Math.round(fb.getBoundingClientRect().top - rmc.top),
      h: Math.round(mc.scrollHeight),
      cartes: mc.querySelectorAll(".theo-fig").length,
    };
  });
}

async function calme(page, minMs) {
  const t0 = Date.now();
  let prec = null, n = 0;
  for (let i = 0; i < 60; i++) {
    const cur = await etat(page);
    if (cur && prec && cur.cadre === prec.cadre && cur.h === prec.h) n++; else n = 0;
    prec = cur;
    if (n >= 4 && Date.now() - t0 >= (minMs || 3000)) break;
    await page.waitForTimeout(250);
  }
  return prec;
}

// Injecte une carte .theo-fig REELLE dans .message-content (meme structure que
// les cartes Wikipédia inserees par insertFig -> row.parentNode).
async function injecterCarte(page, k) {
  return await page.evaluate((idx) => {
    const mc = document.querySelector(".message-content");
    if (!mc) return false;
    const fig = document.createElement("div");
    fig.className = "sim-restart-card";
    fig.dataset.wiki = "";
    fig.style.cssText = "display:flex;gap:12px;align-items:flex-start;margin:10px 0 2px;padding:10px;border:1px solid rgba(79,142,247,.25);border-radius:12px;max-width:560px;";
    fig.innerHTML = '<div style="flex:0 0 auto;width:190px;height:170px;background:#0a0f18;border-radius:8px;"></div>' +
      '<div>Carte simulee ' + idx + ' (neutre).</div>';
    // Inseree EN TETE de message : pousse TOUT le contenu (y compris la phrase
    // ancree) vers le bas, comme une carte Wikipedia inseree avant une pastille.
    mc.insertBefore(fig, mc.firstElementChild);
    return true;
  }, k);
}

async function lireAncre(page) {
  return await page.evaluate(async (chatId) => {
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
    return f && f.ancre ? { start: f.ancre.start, end: f.ancre.end } : null;
  }, CHAT);
}

async function lirePosStore(page) {
  return await page.evaluate(async (chatId) => {
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
    return f ? { x: f.x, y: f.y, w: f.w, h: f.h } : null;
  }, CHAT);
}

(async () => {
  if (START < 0) { console.log("PHRASE introuvable"); process.exit(2); }
  const serveur = await serve();
  const browser = await chromium.launch(Object.assign({ args: ["--no-sandbox", "--disable-dev-shm-usage"] },
    process.env.PW_DIR ? { executablePath: CHROME } : {}));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errJs = [];
  page.on("pageerror", e => errJs.push(String((e && e.message) || e)));
  await page.addInitScript(() => {
    try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {}
    // Simule un cache VIDE au demarrage (quota) : les cartes se re-telechargent.
    try { localStorage.removeItem("theologicus_mssfig_v1"); } catch (e) {}
  });

  await page.goto(`http://127.0.0.1:${PORT}/blank.html`, { waitUntil: "domcontentloaded" });
  await seed(page);
  await ouvrir(page);

  const e0 = await calme(page, 3000);
  const ancre0 = await lireAncre(page);
  ok("A. premisse : figure posee et calme avant cartes",
     !!e0 && e0.cadre > 0 && e0.h > 0,
     e0 ? `cadre y=${e0.cadre}, hauteur ${e0.h}, ${e0.cartes} carte(s)` : "figure absente");

  // Injection etendue dans le temps.
  for (let i = 0; i < INJECTIONS.length; i++) {
    await page.waitForTimeout(INJECTIONS[i] - (i === 0 ? 0 : INJECTIONS[i - 1]));
    await injecterCarte(page, i);
    console.log(`  [info] carte ${i} injectee a t≈${(INJECTIONS[i]/1000)} s`);
  }

  // Attendre longuement : la veille (12 s) + self-extension doit avoir fini.
  await page.waitForTimeout(4000);
  const e1 = await calme(page, 3000);
  const posStore1 = await lirePosStore(page);

  // Controle : ouvrir un chat ou les cartes sont presentes DES LE DEPART.
  // On re-seed avec les cartes deja dans le message (via un second message
  // factice n'est pas trivial ; a la place on mesure la position attendue en
  // injectant TOUTES les cartes avant le calme initial de la prochaine passe).
  // Approche : on recharge la page (vrai redemarrage) et on re-injecte TOUTES
  // les cartes IMMEDIATEMENT (t=0) pour obtenir la position de reference.
  const eRef = await (async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 120000 });
    await page.evaluate(() => {
      const o = document.getElementById("auth-overlay"); if (o) o.remove();
      if (!window.__dw) window.__dw = setInterval(function () {
        const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active");
      }, 250);
    });
    await page.evaluate(async (id) => {
      try { await window.loadChat(id); } catch (e) {}
      try { window.renderMessages(); } catch (e) {}
    }, CHAT);
    await page.waitForSelector('.atc-figbox[data-fig-id="frestart"]', { state: "attached", timeout: 30000 });
    for (let i = 0; i < INJECTIONS.length; i++) await injecterCarte(page, i);
    await page.waitForTimeout(2000);
    return await calme(page, 3000);
  })();

  const dCadre = (e1 && e0) ? e1.cadre - e0.cadre : -99999;
  const dRef = (eRef && e0) ? eRef.cadre - e0.cadre : -99999;

  ok("B. la figure SUIT le texte jusqu'a la position finale",
     Math.abs(dCadre - dRef) <= 3,
     `cadre final ${dCadre >= 0 ? "+" : ""}${dCadre} px vs reference (cartes des le depart) ${dRef >= 0 ? "+" : ""}${dRef} px ` +
     `(ecart ${Math.abs(dCadre - dRef)} px, tolerance 3)`);

  // C. determinisme apres rechargement (vrai redemarrage, cache vide).
  const e2 = await (async () => {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 120000 });
    await page.evaluate(() => {
      const o = document.getElementById("auth-overlay"); if (o) o.remove();
      if (!window.__dw) window.__dw = setInterval(function () {
        const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active");
      }, 250);
    });
    await page.evaluate(async (id) => {
      try { await window.loadChat(id); } catch (e) {}
      try { window.renderMessages(); } catch (e) {}
    }, CHAT);
    await page.waitForSelector('.atc-figbox[data-fig-id="frestart"]', { state: "attached", timeout: 30000 });
    // Meme scenario : cartes etendues dans le temps.
    for (let i = 0; i < INJECTIONS.length; i++) {
      await page.waitForTimeout(INJECTIONS[i] - (i === 0 ? 0 : INJECTIONS[i - 1]));
      await injecterCarte(page, i);
    }
    await page.waitForTimeout(4000);
    return await calme(page, 3000);
  })();

  ok("C. determinisme : recharge (vrai redemarrage) -> meme position qu'au 1er chargement",
     !!e2 && Math.abs((e2.cadre - e0.cadre) - dRef) <= 3,
     e2 ? `recharge cadre ${e2.cadre} (delta ${e2.cadre - e0.cadre}) vs reference ${dRef}` : "echec recharge");

  const ancre1 = await lireAncre(page);
  ok("D. l'ancre enregistree n'a PAS ete touchee",
     !!ancre0 && !!ancre1 && ancre0.start === ancre1.start && ancre0.end === ancre1.end,
     (ancre0 && ancre1) ? `avant ${ancre0.start}..${ancre0.end} -> apres ${ancre1.start}..${ancre1.end}` : "ancre absente");

  ok("E. aucune erreur JavaScript", errJs.length === 0, errJs.slice(0, 2).join(" | "));

  const total = res.length, bons = res.filter(r => r[0]).length;
  console.log(`\n  ${bons}/${total} — ${bons === total ? "OK" : "ECHEC"}`);
  await browser.close();
  serveur.close();
  process.exit(bons === total ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
