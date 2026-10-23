// Sonde v649 — L'INTERFACE EST-ELLE DEVENUE LENTE ? (mesure du thrashing)
//
// Plainte : « depuis les derniers mise a jour et fixes, l'interface de
// theologicus est devenu tres laggy et lente ».
//
// HYPOTHESE A TESTER (ne pas la croire, la mesurer) :
// `_atcBoxNear(box)` appelle `box.getBoundingClientRect()`, ce qui FORCE un
// reflow synchrone. Il est appele pour CHAQUE message de `state.messages`
// dans `applyShapes`, `applyHighlights` ET `applyMarks` — et ce AVANT tout
// filtre. `_atcSettle` rejoue 4 passes ; le gestionnaire de scroll relance
// un settle toutes les 120 ms. Sur une conversation reelle (100+ messages),
// un mouvement de molette devient donc des centaines de reflows forces, en
// lecture/ecriture entremelees (layout thrashing).
//
// MESURE : on compte les appels a `getBoundingClientRect` (le proxy exact du
// reflow force) pendant un scroll realise, et on chronometre le blocage.
// Comparaison build courant vs build de reference (BENCH_ROOT = _v632/neg_root,
// c'est-a-dire AVANT la refonte de l'ancrage).
//
// Usage :
//   node sonde_perf.js --port N
//   BENCH_ROOT=../_v632/neg_root node sonde_perf.js --port N
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8902;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

const CHAT = "chat-v649-perf";
const NB_MSG = parseInt(process.env.NB_MSG || "60", 10);   // conversation LONGUE
const FIG_PAR_MSG = 2;
const SHAPE_SVG = '<path d="M12 20 C4 13 4 6 9 6 C11 6 12 8 12 8 C12 8 13 6 15 6 C20 6 20 13 12 20 Z" fill="none" stroke="cur" stroke-width="2"/>';

const PARAGRAPHES = [
  "La notion de Kyrios designe la seigneurie divine, et cette designation porte une charge confessionnelle que la Septante avait deja preparee.",
  "Mais avec une hierarchie d economie : le Pere est la source, le Fils est envoye.",
  "Citation cle : Cyrille d Alexandrie, De Adoratione in Spiritu 1.",
  "Le terme grec porte aussi une coloration politique, ce que les traductions anciennes attenuaient.",
  "La tradition syriaque conserve une lecture legerement differente du meme verset.",
  "On notera enfin que la Vulgate suit ici la Septante plutot que l hebreu.",
];

function construireChat() {
  const messages = [{ role: "system", content: "sys", ts: 1 }];
  for (let i = 0; i < NB_MSG; i++) {
    const contenu = [];
    for (let p = 0; p < 6; p++) contenu.push(PARAGRAPHES[(i + p) % PARAGRAPHES.length]);
    contenu.push(""); contenu.push("");
    const shapes = [];
    for (let k = 0; k < FIG_PAR_MSG; k++) {
      shapes.push({
        id: "f-" + i + "-" + k,
        x: 8 + k * 40, y: 10 + k * 110, w: 420, h: 90,
        shape: "Rectangle", color: "#4f8ef7", weight: 1.4, fill: "", rot: 0,
        text: "", note: "note " + i + "-" + k, svg: SHAPE_SVG, ancre: null,
      });
    }
    const marks = [
      { id: "m-" + i + "-a", start: 12, end: 48, color: "#ffd54f", ts: 100 + i },
      { id: "m-" + i + "-b", start: 90, end: 150, color: "#81c784", ts: 200 + i },
    ];
    messages.push({ role: "assistant", content: contenu.join("\n"), ts: 1796000000000 + i * 1000,
                    marks: marks, shapes: shapes, annotations: [] });
  }
  return { id: CHAT, title: "Banc v649 perf", updated: Date.now(), messages: messages };
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
  const errs = [];
  page.on("pageerror", e => errs.push(String((e && e.message) || e)));
  await page.addInitScript(() => { try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {} });

  await page.goto(`http://127.0.0.1:${PORT}/blank.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate(async (chat) => {
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
    localStorage.setItem("theologicus_chat_" + chat.id, JSON.stringify(chat));
    localStorage.setItem("currentChatId", chat.id);
    localStorage.setItem("theo_chat_id", chat.id);
  }, construireChat());

  await page.goto(`http://127.0.0.0:${PORT}/THEOLOGICUS.html`.replace("127.0.0.0", "127.0.0.1"), { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 });
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
  await page.waitForSelector(".atc-figbox", { state: "attached", timeout: 30000 });
  await page.waitForTimeout(2500);

  const nbMsg = await page.evaluate(() => document.querySelectorAll(".message-content").length);
  const nbFig = await page.evaluate(() => document.querySelectorAll(".atc-figbox").length);

  // Instrumenter : compter les reflows forces + les tâches longues.
  await page.evaluate(() => {
    window.__perf = { rect: 0, longtasks: [] };
    const orig = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      window.__perf.rect++;
      return orig.apply(this, arguments);
    };
    try {
      const po = new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          if (e.duration > 50) window.__perf.longtasks.push(Math.round(e.duration));
        }
      });
      po.observe({ entryTypes: ["longtask"] });
    } catch (e) {}
  });

  /* ──────── SCROLL RÉEL : molette + défilement, comme l'utilisateur ──────── */
  const scroll = await page.evaluate(async () => {
    const cc = document.querySelector(".message-content") || document.body;
    const max = cc.scrollHeight;
    const avant = { rect: window.__perf.rect, lt: window.__perf.longtasks.length };
    const t0 = performance.now();
    for (let i = 0; i < 30; i++) {
      cc.scrollTop = Math.round(max * (i + 1) / 30);
      window.dispatchEvent(new Event("scroll"));
      await new Promise(r => requestAnimationFrame(() => r()));
    }
    const duree = performance.now() - t0;
    return {
      duree: Math.round(duree),
      rect: window.__perf.rect - avant.rect,
      longtasks: window.__perf.longtasks.slice(avant.lt),
    };
  });

  /* ──────── SETTLE isolé : ce que coûte UNE séquence complète ──────── */
  const settle = await page.evaluate(async () => {
    if (typeof window.__atcSettle !== "function") {
      return { absent: true, synchrone: 0, rect: 0, total: 0 };
    }
    const avant = window.__perf.rect;
    const t0 = performance.now();
    window.__atcSettle();                       // la vraie fonction, exposée
    const synchrone = performance.now() - t0;
    await new Promise(r => setTimeout(r, 1100)); // laisser les 4 passes
    return {
      absent: false,
      synchrone: Math.round(synchrone),
      rect: window.__perf.rect - avant,
      total: Math.round(performance.now() - t0),
    };
  });

  /* ──────── SAISIE : 100 frappes ──────── */
  const saisie = await page.evaluate(async () => {
    const z = document.querySelector("#composer") || document.querySelector("textarea") ||
              document.querySelector('[contenteditable="true"]');
    if (!z) return null;
    const avant = { rect: window.__perf.rect, lt: window.__perf.longtasks.length };
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) {
      z.value = (z.value || "") + "a";
      z.dispatchEvent(new Event("input", { bubbles: true }));
    }
    const duree = performance.now() - t0;
    await new Promise(r => setTimeout(r, 600));
    return { duree: Math.round(duree), rect: window.__perf.rect - avant.rect,
             longtasks: window.__perf.longtasks.slice(avant.lt) };
  });

  const mem = await page.evaluate(() => performance.memory
    ? { heapMo: Math.round(performance.memory.usedJSHeapSize / 1048576) } : null);

  const lt = scroll.longtasks;
  console.log("=== SONDE PERF v649 — " + (process.env.BENCH_ROOT ? "RÉFÉRENCE (avant refonte ancrage)" : "BUILD COURANT") + " ===");
  console.log("  messages rendus / figures   : " + nbMsg + " / " + nbFig);
  console.log("  ─── SCROLL 30 crans ───");
  console.log("    durée                     : " + scroll.duree + " ms");
  console.log("    getBoundingClientRect     : " + scroll.rect + "   <-- reflows forcés");
  console.log("    tâches longues (>50 ms)   : " + lt.length +
              (lt.length ? "  max " + Math.max.apply(null, lt) + " ms, cumul " + lt.reduce((a, b) => a + b, 0) + " ms" : ""));
  console.log("  ─── UN SETTLE (4 passes) ───");
  if (settle.absent) {
    console.log("    (absent de ce build — `_atcSettle` n'existait pas avant v643)");
  } else {
    console.log("    synchrone                 : " + settle.synchrone + " ms");
    console.log("    getBoundingClientRect     : " + settle.rect);
  }
  console.log("  ─── 100 frappes clavier ───");
  console.log("    durée                     : " + (saisie ? saisie.duree : "n/a") + " ms");
  console.log("    getBoundingClientRect     : " + (saisie ? saisie.rect : "n/a"));
  console.log("    tâches longues            : " + (saisie ? saisie.longtasks.length : "n/a"));
  console.log("  heap JS                     : " + (mem ? mem.heapMo + " Mo" : "n/a"));
  console.log("  erreurs JS                  : " + errs.length + (errs.length ? " — " + errs[0] : ""));

  await browser.close();
  serveur.close();
})().catch(e => { console.error("PLANTAGE :", e); process.exit(2); });
