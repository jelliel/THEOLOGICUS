// Sonde v651b — LA REPARATION D'ANCRE EST-ELLE DETERMINISTE QUAND LE CONTENU
// S'INSERE ENCORE ?
//
// Hypothese : dans une vraie conversation, des fiches (`.theo-fig`) et des
// puces de sources (`.theo-src-chips`) s'inserent APRES le rendu. `_ancFit`
// repare une figure sans ancre en lisant « le texte couvert par sa boite ».
// Si la mise en page n'est pas encore stable, ce texte n'est pas le bon — et
// comme la reparation est PERSISTEE, elle fige une ancre fausse. A l'ouverture
// suivante, le contenu etant peut-etre deja en cache, la reparation tombe sur
// un AUTRE texte : le cadre change d'emplacement.
//
// Test : on ouvre DEUX fois la meme conversation, en insérant le meme bloc de
// contenu asynchrone, mais a des MOMENTS differents par rapport au rendu.
//   ouverture A : rendu -> on laisse reparer -> on insere le bloc
//   ouverture B : rendu -> on insere le bloc tout de suite -> on laisse reparer
// Si les positions finales divergent, la reparation depend du MOMENT, et c'est
// le defaut.
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 9010;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

const CHAT = "chat-v651b-repair";
const SHAPE_SVG = '<path d="M12 20 C4 13 4 6 9 6 C11 6 12 8 12 8 C12 8 13 6 15 6 C20 6 20 13 12 20 Z" fill="none" stroke="cur" stroke-width="2"/>';

// Une seule figure, dans un message long : c'est le cas le plus lisible.
const TEXTE = [
  "La notion de Kyrios designe la seigneurie divine, et cette designation porte une charge confessionnelle que la Septante avait deja preparee.",
  "Mais avec une hierarchie d economie : le Pere est la source, le Fils est envoye.",
  "Citation cle : Cyrille d Alexandrie, De Adoratione in Spiritu 1.",
  "Le terme grec porte aussi une coloration politique, ce que les traductions anciennes attenuaient.",
].join("\n");

const FIG = { id: "frep", x: 8, y: 12, w: 420, h: 84, shape: "Rectangle",
  color: "#4f8ef7", weight: 1.4, fill: "", rot: 0, text: "", note: "note rep", svg: SHAPE_SVG, ancre: null };

const chat = { id: CHAT, title: "v651b", updated: Date.now(), messages: [
  { role: "system", content: "sys", ts: 1 },
  { role: "assistant", content: TEXTE, ts: 1797100000000, marks: [], shapes: [FIG], annotations: [] },
] };

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

  async function semer() {
    await page.goto(`http://127.0.0.1:${PORT}/blank.html`, { waitUntil: "domcontentloaded" });
    await page.evaluate(async (c) => {
      await new Promise((res2, rej) => {
        const r = indexedDB.open("THEOLOGICUS_AI_DB");
        r.onupgradeneeded = () => { const d = r.result;
          if (!d.objectStoreNames.contains("chats")) d.createObjectStore("chats", { keyPath: "id" });
          if (!d.objectStoreNames.contains("settings")) d.createObjectStore("settings", { keyPath: "id" }); };
        r.onsuccess = () => { const db = r.result; const tx = db.transaction(["chats", "settings"], "readwrite");
          tx.objectStore("chats").put(c); tx.objectStore("settings").put({ id: "currentChatId", value: c.id });
          tx.oncomplete = () => res2(); }; r.onerror = () => rej(r.error); });
      localStorage.setItem("theologicus_chat_" + c.id, JSON.stringify(c));
      localStorage.setItem("currentChatId", c.id); localStorage.setItem("theo_chat_id", c.id);
    }, c0);
  }
  // Remet le store a l'etat NEUF (figure sans ancre) entre les deux essais.
  const c0 = chat;

  async function entrer() {
    await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 });
    await page.evaluate(() => {
      const o = document.getElementById("auth-overlay"); if (o) o.remove();
      if (!window.__dw) window.__dw = setInterval(function () {
        const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active"); }, 250);
    });
  }
  async function rendre() {
    await page.evaluate(async (id) => {
      try { await window.loadChat(id); } catch (e) {}
      try { window.renderMessages(); } catch (e) {}
    }, CHAT);
    await page.waitForSelector('.atc-figbox[data-fig-id="' + FIG.id + '"]', { state: "attached", timeout: 30000 });
  }
  // Le bloc asynchrone : une fiche qui pousse le texte vers le bas.
  async function insererFiche() {
    return await page.evaluate(() => {
      const b = document.querySelector(".message-content");
      if (!b) return false;
      const d = document.createElement("div");
      d.className = "theo-fig";
      d.textContent = "FICHE WIKIPEDIA — Kyrios — article long qui pousse tout le texte vers le bas. ".repeat(6);
      b.insertBefore(d, b.firstChild);
      return true;
    });
  }
  async function stabiliser() {
    let prec = null, calme = 0;
    for (let i = 0; i < 40; i++) {
      const cur = await page.evaluate((id) => {
        const fb = document.querySelector('.atc-figbox[data-fig-id="' + id + '"]');
        return fb ? [fb.offsetLeft, fb.offsetTop, fb.offsetWidth, fb.offsetHeight] : null;
      }, FIG.id);
      const sig = JSON.stringify(cur);
      if (prec === sig) calme++; else calme = 0;
      prec = sig;
      if (calme >= 4) break;
      await page.waitForTimeout(250);
    }
    return JSON.parse(prec || "null");
  }
  async function ancreStore() {
    return await page.evaluate(async (chatId) => {
      const idb = await new Promise((ok) => {
        const r = indexedDB.open("THEOLOGICUS_AI_DB");
        r.onsuccess = () => { const tx = r.result.transaction(["chats"], "readonly");
          const g = tx.objectStore("chats").get(chatId);
          g.onsuccess = () => ok(g.result); g.onerror = () => ok(null); };
        r.onerror = () => ok(null);
      });
      const m = idb && idb.messages ? idb.messages.find(x => x.shapes && x.shapes.length) : null;
      const f = m ? m.shapes[0] : null;
      return f && f.ancre ? { start: f.ancre.start, end: f.ancre.end, ox: f.ancre.ox, oy: f.ancre.oy,
                              texte: String(f.ancre.texte || "").slice(0, 60) } : null;
    }, CHAT);
  }

  /* ═══ ESSAI A : on laisse reparer AVANT d'inserer la fiche ═══ */
  await semer();
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await entrer();
  await rendre();
  await page.waitForTimeout(1200);          // la reparation a le temps de se faire
  const aAvantFiche = await stabiliser();
  const ancreA1 = await ancreStore();
  await insererFiche();
  await page.waitForTimeout(1500);
  const aApresFiche = await stabiliser();
  const ancreA2 = await ancreStore();

  /* ═══ ESSAI B : la fiche est la AVANT que la reparation ne se fasse ═══ */
  await semer();                             // remet la figure sans ancre
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await entrer();
  await page.evaluate(async (id) => {
    try { await window.loadChat(id); } catch (e) {}
  }, CHAT);
  // On insere la fiche avant que renderMessages n'ait fini de placer.
  await page.evaluate(() => {
    const b = document.querySelector(".message-content");
    if (b) {
      const d = document.createElement("div");
      d.className = "theo-fig";
      d.textContent = "FICHE WIKIPEDIA — Kyrios — article long qui pousse tout le texte vers le bas. ".repeat(6);
      b.insertBefore(d, b.firstChild);
    }
  });
  await page.evaluate(() => { try { window.renderMessages(); } catch (e) {} });
  await page.waitForSelector('.atc-figbox[data-fig-id="' + FIG.id + '"]', { state: "attached", timeout: 30000 });
  await page.waitForTimeout(2000);
  const bApres = await stabiliser();
  const ancreB = await ancreStore();

  const R = (x) => x ? "[" + x.join(", ") + "]" : "null";
  console.log("=== SONDE v651b — la reparation depend-elle du MOMENT ? ===");
  console.log("  A. fiche inseree APRES la reparation");
  console.log("     position avant fiche : " + R(aAvantFiche));
  console.log("     position apres fiche : " + R(aApresFiche));
  console.log("     ancre avant : " + JSON.stringify(ancreA1));
  console.log("     ancre apres : " + JSON.stringify(ancreA2));
  console.log("  B. fiche deja presente AU MOMENT de la reparation");
  console.log("     position finale      : " + R(bApres));
  console.log("     ancre                : " + JSON.stringify(ancreB));
  const memeAncre = !!ancreA2 && !!ancreB &&
    ancreA2.start === ancreB.start && ancreA2.end === ancreB.end;
  const memeTexte = !!ancreA2 && !!ancreB && ancreA2.texte === ancreB.texte;
  console.log("  --- verdict ---");
  console.log("  ancre identique dans les deux cas : " + (memeAncre ? "OUI" : "NON"));
  console.log("  texte ancre identique            : " + (memeTexte ? "OUI" : "NON"));
  if (!memeTexte && ancreA2 && ancreB) {
    console.log("    A : \"" + ancreA2.texte + "\"");
    console.log("    B : \"" + ancreB.texte + "\"");
  }
  console.log("  erreurs JS : " + errs.length + (errs.length ? " — " + errs[0] : ""));

  await browser.close();
  serveur.close();
})().catch(e => { console.error("PLANTAGE :", e); process.exit(2); });
