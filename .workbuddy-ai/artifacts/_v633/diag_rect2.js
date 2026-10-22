// Diagnostic v633 — QUE MESURE le re-ancrage sur la structure REELLE ?
// On charge le vrai fichier, on rend le message de la capture, puis on appelle
// __ANC.rect / __ANC.resolve sur des ancres representatives, et on compare au
// cadre effectivement rendu.
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = 8903;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

const CHAT = "chat-diag-0003";
const MSGTS = 1790700000333;

const TEXTE = [
  "1. Kyrios comme titre christologique",
  "",
  "**Paul de Tarse** utilise *Kyrios* (17 fois dans ses epitres) pour designer **Jesus comme Seigneur**, titre habituellement reserve a YHHW.",
  "",
  "- **Sources paralleles** : Phil 2,11 ; 1 Co 12,3 ; Rm 10,9",
  "- **Philippiens 2,11** :",
  "  > Et a ce nom, tout genou flechira, au ciel, sur la terre et sous la terre ; et toute langue confessera que Jesus-Christ est Seigneur.",
  "- **1 Corinthiens 12,3** :",
  "  > Personne ne peut dire «Jesus est Seigneur», si ce n'est par l'Esprit Saint.",
  "",
  "2. Kyrios et la confession de foi (Rom 10,9)",
  "",
  "- Structure parallele :",
  "- **Ancien Testament** : Confession de YHHW comme Adonai (Dt 6,4 ; Is 45,23).",
  "- **Nouveau Testament** : Confession de Jesus comme Kyrios (Rom 10,9 ; Phil 2,11).",
].join("\n");

// mots a tester : simples, dans une puce, dans une citation, en fin de ligne
const CIBLES = ["Kyrios", "Paul de Tarse", "Sources paralleles", "Philippiens 2,11",
                "flechira", "Esprit Saint", "Structure parallele", "confession de foi"];

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
  const errs = [];
  page.on("pageerror", e => errs.push(String(e && e.message || e)));
  await page.addInitScript(() => { try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {} });

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
  await page.evaluate(async (id) => { try { await window.loadChat(id); } catch (e) {} try { window.renderMessages(); } catch (e) {} }, CHAT);
  await page.waitForTimeout(2000);

  const out = await page.evaluate(({ msgTs, cibles }) => {
    const box = document.getElementById("mc-" + msgTs);
    if (!box) return { err: "message absent" };
    if (!window.__ANC) return { err: "__ANC absent" };
    const nodes = window.__ANC.noeuds(box);
    let full = "";
    for (let i = 0; i < nodes.length; i++) full += nodes[i].nodeValue;
    const res = cibles.map(function (c) {
      const i = full.indexOf(c);
      if (i < 0) return { mot: c, absent: true };
      let r = null, t = null;
      try { r = window.__ANC.rect(box, i, i + c.length); } catch (e) { t = String(e); }
      return { mot: c, idx: i, rect: r, err: t };
    });
    return {
      nodes: nodes.length, len: full.length,
      scrollW: box.scrollWidth, clientW: box.clientWidth,
      scrollH: box.scrollHeight, clientH: box.clientHeight,
      res: res,
    };
  }, { msgTs: MSGTS, cibles: CIBLES });

  if (out.err) { console.log("ERREUR:", out.err); }
  else {
    console.log("noeuds=" + out.nodes + " longueur=" + out.len +
      " boite " + out.clientW + "x" + out.clientH + " (contenu " + out.scrollW + "x" + out.scrollH + ")");
    for (const r of out.res) {
      if (r.absent) { console.log(`  ${r.mot} -> ABSENT du texte canonique`); continue; }
      if (r.err) { console.log(`  ${r.mot} -> EXCEPTION ${r.err}`); continue; }
      if (!r.rect) { console.log(`  ${r.mot} -> rect NULL (idx ${r.idx})`); continue; }
      console.log(`  ${r.mot} -> x=${Math.round(r.rect.x)} y=${Math.round(r.rect.y)} w=${Math.round(r.rect.w)} h=${Math.round(r.rect.h)}`);
    }
  }
  console.log("ERREURS JS:", JSON.stringify(errs.slice(0, 4)));
  await browser.close();
  serveur.close();
})();
