/* ═══════════════════════════════════════════════════════════════
   SONDE v647-b — POURQUOI v634 SAUTE DE 240 À 301 (fluctuation)

   v634 donne 6/6, 6/6, 4/6 sur trois relances du MÊME build, et à
   l'identique sur le build d'avant : la fluctuation est pré-existante,
   elle n'est pas née du correctif v647.

   Contrat du banc : « la géométrie est IDENTIQUE après 5 rendus ».
   Ce qui casse : le cadre est mesuré à y=240 (position provisoire),
   puis rendu à y=301 plus tard. Le banc attend deux mesures
   consécutives concordantes — mais si le saut arrive APRÈS sa boucle
   d'attente, il mesure trop tôt.

   Hypothèses à départager :
     H1 — le contenu du message grandit TARD (après les passes de
          `_atcSettle` à 0/120/400/900 ms) : l'app ne se replacera
          jamais, c'est un DÉFAUT DE L'APP ;
     H2 — le contenu ne bouge plus, mais une passe de placement
          arrive en retard et corrige 240 -> 301 : DÉFAUT DE L'APP
          aussi, mais de nature différente ;
     H3 — rien ne bouge après la mesure : c'est le BANC qui mesure
          à un instant où la mise en page n'est pas stabilisée.

   Cette sonde journalise, toutes les 100 ms pendant 8 s :
     · y rendu du cadre, scrollHeight et clientHeight du conteneur ;
     · les drapeaux `__atcApplying`, `__atcFigEditing`, `__atcGeste`,
       `__atcStable`, `__atcHauteurCycle`.
   Aucune correction : on regarde.
   ════════════════════════════════════════════════════════════════ */
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8860;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

const CHAT = "chat-v634-idem";
const MSGTS = 1794000000222;
const SHAPE_SVG = '<path d="M12 20 C4 13 4 6 9 6 C11 6 12 8 12 8 C12 8 13 6 15 6 C20 6 20 13 12 20 Z" fill="none" stroke="cur" stroke-width="2"/>';

const TEXTE = [
  "1. Kyrios comme titre christologique",
  "",
  "**Paul de Tarse** utilise *Kyrios* dans ses epitres pour designer Jesus comme Seigneur, et cette designation porte une charge confessionnelle que la Septante avait deja preparee dans son usage du tetragramme rendu par ho kyrios.",
  "",
  "**Methode** :",
  "  1. Analyser Mar Yah dans les Targums.",
  "  2. Etudier Kyrios dans le NT.",
  "  3. Comparer avec la patristique.",
  "",
  "Le Kyrios est le Seigneur des pauvres, pas des oppresseurs.",
].join("\n");

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
  page.on("pageerror", e => console.log("  [pageerror] " + String(e).slice(0, 200)));
  await page.addInitScript(() => { try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {} });

  await page.goto(`http://127.0.0.1:${PORT}/blank.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate(async ({ chatId, texte, msgTs, svg }) => {
    const chat = { id: chatId, title: "Sonde v647b", updated: Date.now(), messages: [
      { role: "system", content: "sys", ts: 1 },
      { role: "assistant", content: texte, ts: msgTs, annotations: [], marks: [], shapes: [
        { id: "fmulti", x: 40, y: 120, w: 420, h: 90, shape: "Rectangle", color: "#4f8ef7",
          weight: 1.2, fill: "", rot: 0, text: "", note: "note idem", svg: svg },
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

  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
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
  await page.waitForSelector('.atc-figbox[data-fig-id="fmulti"]', { state: "attached", timeout: 20000 });

  /* Journal continu, côté page, toutes les 100 ms pendant 8 s. */
  const journal = await page.evaluate(async () => {
    const out = [];
    const t0 = Date.now();
    for (let i = 0; i < 80; i++) {
      const fb = document.querySelector('.atc-figbox[data-fig-id="fmulti"]');
      const b = document.querySelector('.message-content');
      out.push({
        dt: Date.now() - t0,
        y: fb ? Math.round(fb.getBoundingClientRect().top - b.getBoundingClientRect().top + b.scrollTop) : null,
        sh: b ? b.scrollHeight : null,
        ch: b ? b.clientHeight : null,
        ap: !!window.__atcApplying,
        fe: !!window.__atcFigEditing,
        ge: window.__atcGeste || 0,
        st: window.__atcStable,
        hc: JSON.stringify(window.__atcHauteurCycle || {}),
      });
      await new Promise(r => setTimeout(r, 100));
    }
    return out;
  });

  /* le journal est pris dans la page : on l'affiche compactement */
  console.log("  dt(ms) | y   | sh  | ch  | applying | figEditing | stable | hauteurCycle");
  let prec = null;
  for (const j of journal) {
    const cle = [j.y, j.sh, j.ch].join("/");
    const marque = (prec !== null && cle !== prec) ? "   <<< CHANGEMENT" : "";
    console.log("  " + String(j.dt).padStart(5) + " | " + String(j.y).padStart(3) + " | " +
      String(j.sh).padStart(3) + " | " + String(j.ch).padStart(3) + " |    " +
      (j.ap ? "oui" : "non").padEnd(7) + " | " + (j.fe ? "oui" : "non").padEnd(10) + " | " +
      String(j.st).padEnd(6) + " | " + j.hc + marque);
    prec = cle;
  }
  const ys = journal.map(j => j.y).filter(v => v !== null);
  const uniq = Array.from(new Set(ys));
  console.log("\n  SONDE : valeurs distinctes de y = [" + uniq.join(", ") + "]");
  console.log("  SONDE : première mesure stable consécutive = " +
    (() => { for (let i = 1; i < journal.length; i++) { if (journal[i].y === journal[i - 1].y && journal[i].sh === journal[i - 1].sh) return journal[i].dt + "ms (y=" + journal[i].y + ")"; } return "jamais"; })());

  await browser.close();
  serveur.close();
  process.exit(0);
})().catch(e => { console.error("EXCEPTION :", e && e.stack || e); process.exit(1); });
