// Sonde v651 — DEUX PLAINTES, MESUREES.
//
//   1. « ca saccade enormement quand je scroll, surtout si dans cette
//      conversation j'ai fait plein d'encadrements » -> le cout doit croitre
//      avec le NOMBRE DE FIGURES, pas seulement avec le nombre de messages.
//      (v649 n'a traite que le cout par MESSAGE.)
//   2. « les encadrements ne sont jamais respectes, ca change d'emplacement a
//      chaque ouverture » -> la geometrie doit etre IDENTIQUE d'une ouverture
//      a l'autre. On mesure sur 3 ouvertures successives.
//
// Le semis reproduit l'etat REEL du store : des figures SANS ancre (99,7 % du
// store mesure en v633), que `_ancFit` repare en lisant le texte couvert. Si la
// reparation n'est pas deterministe, le cadre se pose sur un texte different a
// chaque ouverture — exactement le symptome decrit.
//
// Usage :
//   node sonde_positions.js [--port N]
//   BENCH_ROOT=../_v648/neg_root node sonde_positions.js --port N
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 9001;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

const CHAT = "chat-v651-positions";
const NB_MSG = parseInt(process.env.NB_MSG || "10", 10);
const FIG_PAR_MSG = parseInt(process.env.FIG_PAR_MSG || "3", 10);   // 30 figures
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
        x: 8, y: 12 + k * 100, w: 420, h: 84,
        shape: "Rectangle", color: "#4f8ef7", weight: 1.4, fill: "", rot: 0,
        text: "", note: "note " + i + "-" + k, svg: SHAPE_SVG,
        ancre: null,          // <-- etat REEL du store : aucune ancre
      });
    }
    messages.push({ role: "assistant", content: contenu.join("\n"), ts: 1797000000000 + i * 1000,
                    marks: [], shapes: shapes, annotations: [] });
  }
  return { id: CHAT, title: "Sonde v651", updated: Date.now(), messages: messages };
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

  // Semis unique, puis on n'y touche plus : toute variation ulterieure vient
  // du RENDU, pas du semis.
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

  async function entrerDansApp() {
    await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 });
    await page.evaluate(() => {
      const o = document.getElementById("auth-overlay"); if (o) o.remove();
      if (!window.__dw) window.__dw = setInterval(function () {
        const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active");
      }, 250);
    });
  }
  // Stabilisation reelle : 5 mesures identiques espacees de 250 ms.
  async function stabiliser() {
    let prec = null, calme = 0;
    for (let i = 0; i < 40; i++) {
      const cur = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll(".atc-figbox").forEach(function (fb) {
          out.push([fb.getAttribute("data-fig-id"), fb.offsetLeft, fb.offsetTop, fb.offsetWidth, fb.offsetHeight]);
        });
        out.sort(function (a, b) { return String(a[0]).localeCompare(String(b[0])); });
        return out;
      });
      const sig = JSON.stringify(cur);
      if (prec === sig) calme++; else calme = 0;
      prec = sig;
      if (calme >= 4) break;
      await page.waitForTimeout(250);
    }
    return JSON.parse(prec || "[]");
  }
  // Etat des ancres DANS LE STORE : la reparation est-elle persistee ?
  async function ancresStore() {
    return await page.evaluate(async (chatId) => {
      const idb = await new Promise((ok) => {
        const r = indexedDB.open("THEOLOGICUS_AI_DB");
        r.onsuccess = () => {
          const tx = r.result.transaction(["chats"], "readonly");
          const g = tx.objectStore("chats").get(chatId);
          g.onsuccess = () => ok(g.result); g.onerror = () => ok(null);
        };
        r.onerror = () => ok(null);
      });
      if (!idb || !idb.messages) return null;
      let total = 0, avec = 0, ex = null;
      for (const m of idb.messages) {
        if (!m.shapes) continue;
        for (const f of m.shapes) {
          total++;
          if (f.ancre) { avec++; if (!ex) ex = { id: f.id, start: f.ancre.start, end: f.ancre.end,
                                                 ox: f.ancre.ox, oy: f.ancre.oy,
                                                 texte: String(f.ancre.texte || "").slice(0, 40) }; }
        }
      }
      return { total: total, avec: avec, ex: ex };
    }, CHAT);
  }
  async function ouvrir() {
    await page.evaluate(async (id) => {
      try { await window.loadChat(id); } catch (e) {}
      try { window.renderMessages(); } catch (e) {}
    }, CHAT);
    await page.waitForSelector(".atc-figbox", { state: "attached", timeout: 30000 });
    return await stabiliser();
  }

  /* ─────────── OUVERTURE 1 ─────────── */
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await entrerDansApp();
  const o1 = await ouvrir();
  const nbFig = o1.length;
  const a1 = await ancresStore();

  /* ─────────── SCROLL : cout avec beaucoup de figures ─────────── */
  const scroll = await page.evaluate(async () => {
    window.__r = 0;
    const orig = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () { window.__r++; return orig.apply(this, arguments); };
    let cc = document.querySelector("#chat-container");
    if (!cc || cc.scrollHeight <= cc.clientHeight + 50) {
      cc = Array.from(document.querySelectorAll("*")).find(function (el) {
        return el.scrollHeight > el.clientHeight + 50 && /(auto|scroll)/.test(getComputedStyle(el).overflowY);
      }) || document.scrollingElement;
    }
    const max = cc.scrollHeight - cc.clientHeight;
    const avant = window.__r;
    const t0 = performance.now();
    for (let i = 0; i < 10; i++) {
      cc.scrollTop = Math.round(max * (i + 1) / 12);
      await new Promise(r => setTimeout(r, 150));
    }
    return { rect: window.__r - avant, duree: Math.round(performance.now() - t0), max: max };
  });

  /* ─────────── OUVERTURES 2 et 3 : la geometrie doit etre IDENTIQUE ─────────── */
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await entrerDansApp();
  const o2 = await ouvrir();
  const a2 = await ancresStore();

  await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await entrerDansApp();
  const o3 = await ouvrir();
  const a3 = await ancresStore();

  /* ─────────── Analyse ─────────── */
  function comparer(a, b, etiquette) {
    const ma = new Map(a.map(r => [r[0], r]));
    const bouges = [];
    for (const r of b) {
      const p = ma.get(r[0]);
      if (!p) continue;
      const d = [r[1] - p[1], r[2] - p[2], r[3] - p[3], r[4] - p[4]];
      if (d.some(v => Math.abs(v) > 1)) bouges.push({ id: r[0], d: d, avant: [p[1], p[2], p[3], p[4]], apres: [r[1], r[2], r[3], r[4]] });
    }
    const maxd = bouges.reduce((m, x) => Math.max(m, Math.abs(x.d[0]), Math.abs(x.d[1])), 0);
    console.log("  " + etiquette + " : " + bouges.length + "/" + b.length + " figure(s) deplacee(s)" +
                (bouges.length ? ", ecart max " + maxd + " px" : ""));
    return { bouges: bouges, maxd: maxd };
  }

  console.log("=== SONDE v651 — " + (process.env.BENCH_ROOT ? "REFERENCE" : "BUILD COURANT") + " ===");
  console.log("  figures rendues : " + nbFig + "  (" + NB_MSG + " messages x " + FIG_PAR_MSG + ")");
  console.log("  SCROLL 10 crans : " + scroll.rect + " reflows, " + scroll.duree + " ms  (" +
              (nbFig ? (scroll.rect / nbFig).toFixed(1) : "?") + " reflows par figure)");
  console.log("  --- ancres dans le store (la reparation est-elle persistee ?) ---");
  [["ouverture 1", a1], ["ouverture 2", a2], ["ouverture 3", a3]].forEach(function (x) {
    const v = x[1];
    console.log("    " + x[0] + " : " + (v ? v.avec + "/" + v.total + " figures avec ancre" : "store illisible"));
  });
  if (a1 && a1.ex) console.log("    exemple : " + JSON.stringify(a1.ex));
  console.log("  --- stabilite de la position entre ouvertures ---");
  const c12 = comparer(o1, o2, "ouverture 1 -> 2");
  const c23 = comparer(o2, o3, "ouverture 2 -> 3");
  const c13 = comparer(o1, o3, "ouverture 1 -> 3");
  if (c13.bouges.length) {
    console.log("  exemples (id : avant -> apres) :");
    c13.bouges.slice(0, 6).forEach(x => {
      console.log("    " + x.id + " : " + JSON.stringify(x.avant) + " -> " + JSON.stringify(x.apres));
    });
  }
  console.log("  erreurs JS : " + errs.length + (errs.length ? " — " + errs[0] : ""));

  await browser.close();
  serveur.close();
})().catch(e => { console.error("PLANTAGE :", e); process.exit(2); });
