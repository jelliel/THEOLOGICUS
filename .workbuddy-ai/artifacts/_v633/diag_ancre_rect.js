// Diagnostic — QUE MESURE _ancRect pour une ancre normale ?
// On charge le vrai fichier, on rend un message proche de la capture, puis on
// appelle les fonctions REELLES du produit sur des ancres representatives.
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = 8901;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

const CHAT = "chat-diag-0001";
const MSGTS = 1790700000111;

// Texte reproduisant la structure de la capture (titre, puces, sources, citations)
const TEXTE = [
  "1. Kyrios comme titre christologique",
  "",
  "**Paul de Tarse** utilise *Kyrios* (17 fois dans ses épîtres) pour désigner **Jésus comme Seigneur**, titre habituellement réservé à YHHW.",
  "",
  "- **Sources parallèles** : Phil 2,11 ; 1 Co 12,3 ; Rm 10,9",
  "- **Philippiens 2,11** :",
  "  > « Et à ce nom, tout genou fléchira, au ciel, sur la terre et sous la terre ; et toute langue confessera que Jésus-Christ est Seigneur (Κύριος), à la gloire de Dieu le Père. »",
  "- **1 Corinthiens 12,3** :",
  "  > « Personne ne peut dire «Jésus est Seigneur» (Κύριος Ἰησοῦς), si ce n'est par l'Esprit Saint. »",
  "",
  "2. Kyrios et la confession de foi (Rom 10,9)",
].join("\n");

(async () => {
  const serveur = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/THEOLOGICUS.html";
    const fp = path.join(RACINE, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      res.writeHead(200, { "Content-Type": p.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream", "Cache-Control": "no-store" });
      fs.createReadStream(fp).pipe(res);
    } else { res.writeHead(404); res.end("404"); }
  });
  await new Promise(r => serveur.listen(PORT, "127.0.0.1", r));

  const browser = await chromium.launch(Object.assign({ args: ["--no-sandbox", "--disable-dev-shm-usage"] },
    process.env.PW_DIR ? { executablePath: CHROME } : {}));
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {}
  });

  await page.goto(`http://127.0.0.1:${PORT}/blank.html`, { waitUntil: "domcontentloaded" });
  await page.evaluate(async ({ chatId, texte, msgTs }) => {
    const chat = { id: chatId, title: "Diag", updated: Date.now(), messages: [
      { role: "system", content: "sys", ts: 1 },
      { role: "assistant", content: texte, ts: msgTs, annotations: [], marks: [], shapes: [] },
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
  }, { chatId: CHAT, texte: TEXTE, msgTs: MSGTS });

  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 });
  await page.evaluate(() => {
    const o = document.getElementById("auth-overlay"); if (o) o.remove();
    window.__d = setInterval(function () { const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active"); }, 250);
  });
  await page.evaluate(async (id) => {
    try { await window.loadChat(id); } catch (e) {}
    try { window.renderMessages(); } catch (e) {}
  }, CHAT);
  await page.waitForSelector(".message-content", { timeout: 20000 });
  await page.waitForTimeout(1500);

  const out = await page.evaluate((msgTs) => {
    const box = document.getElementById("mc-" + msgTs);
    if (!box) return { err: "message absent" };
    // concatener les noeuds texte canoniques, comme le produit
    const vis = typeof noeudsTexteVisibles === "function" ? noeudsTexteVisibles(box) : null;
    let full = "", n = 0;
    if (vis) for (let i = 0; i < vis.length; i++) { full += vis[i].nodeValue; n++; }
    // chercher des mots cles et interroger _ancRect
    const cibles = ["Paul de Tarse", "Kyrios", "Sources parallèles", "Rédemption", "Esprit Saint", "17 fois"];
    const res = [];
    for (const c of cibles) {
      const i = full.indexOf(c);
      if (i < 0) { res.push({ mot: c, absent: true }); continue; }
      let r = null;
      try { r = _ancRect(box, i, i + c.length); } catch (e) { res.push({ mot: c, throw: String(e) }); continue; }
      res.push({ mot: c, idx: i, rect: r });
    }
    // etat des figures existantes
    const figs = Array.from(box.querySelectorAll(".atc-figbox")).map(function (e) {
      const s = getComputedStyle(e);
      return { id: e.dataset.figId, ex: s.position, w: s.width, h: s.height, l: s.left, t: s.top, vis: s.visibility, disp: s.display };
    });
    return { nodes: n, len: full.length, extrait: full.slice(0, 120), res: res, figs: figs };
  }, MSGTS);

  console.log(JSON.stringify(out, null, 1));
  await browser.close();
  serveur.close();
})();
