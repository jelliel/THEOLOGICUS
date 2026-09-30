// Sonde minimale : (1) l'override de console.log est-il bien en place ?
// (2) les lignes [DIAG] de l'app remontent-elles ? (3) l'annotation écrite
// est-elle relue ? On lit localStorage + IndexedDB APRÈS rechargement.
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = 8799;
const RACINE = path.resolve(__dirname, "..", "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHAT_ID = "chat-drift-0001";
const MSG_TS = 1790500000001;
const CONTENU = "1. Il cite Hénoc comme témoignage non **canonique** mais utile pour réfuter les hérésies (docét**isme**, marcion**isme**).";

const CORPS = JSON.stringify({
  id: CHAT_ID, model: "mistral", messages: [
    { role: "user", content: "Tertullien a-t-il dit cela ?", ts: MSG_TS - 1 },
    { role: "assistant", content: CONTENU, ts: MSG_TS, annotations: [] },
  ], title: "sonde", updated: 1, fav: false,
});

(async () => {
  const serveur = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/THEOLOGICUS.html";
    const fp = path.join(SERVI, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      res.writeHead(200, { "Content-Type": p.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream", "Cache-Control": "no-store" });
      fs.createReadStream(fp).pipe(res);
    } else { res.writeHead(404); res.end("404"); }
  });
  await new Promise(r => serveur.listen(PORT, "127.0.0.1", r));
  const browser = await chromium.launch({ executablePath: path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe"), args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("console", m => { const t = m.text(); if (/DIAG|applyHighlights|loadChat|sanitize/.test(t)) console.log("  [page-console] " + t.slice(0, 200)); });
  await ctx.addInitScript(() => {
    try { document.cookie = "key_mistral=sk-test; path=/"; } catch (e) {}
    try {
      window.__diagLog = [];
      const _cl = console.log.bind(console);
      console.log = function () { try { window.__diagLog.push(Array.prototype.map.call(arguments, String).join(' ')); } catch (e) {} return _cl.apply(null, arguments); };
    } catch (e) {}
  });
  const attendre = async () => {
    await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 });
    await page.evaluate(() => { const o = document.getElementById("auth-overlay"); if (o) o.remove(); });
  };
  const ecrire = (ann) => page.evaluate(async ({ corps, ann, chatId }) => {
    const c = JSON.parse(corps); c.messages[1].annotations = ann ? [ann] : [];
    const req = indexedDB.open("THEOLOGICUS_AI_DB");
    await new Promise((res, rej) => { req.onsuccess = res; req.onerror = rej; });
    const db = req.result;
    await new Promise((res, rej) => {
      const tx = db.transaction(["chats", "settings"], "readwrite");
      tx.objectStore("chats").put(c);
      tx.objectStore("settings").put({ id: "currentChatId", value: chatId });
      tx.oncomplete = res; tx.onerror = rej;
    });
    localStorage.setItem("theologicus_chat_" + chatId, JSON.stringify(c));
    localStorage.setItem("theologicus_currentChatId", chatId);
    return c.messages[1].annotations.length;
  }, { corps: CORPS, ann: ann || null, chatId: CHAT_ID });

  try {
    await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await attendre();
    console.log("__diagLog existe ?", await page.evaluate(() => Array.isArray(window.__diagLog)), "taille", await page.evaluate(() => (window.__diagLog || []).length));
    await ecrire(null);
    await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
    await attendre();
    await page.waitForFunction((ts) => !!document.getElementById("mc-" + ts), MSG_TS, { timeout: 60000 });
    await page.waitForTimeout(1200);
    console.log("--- après 1er reload ---");
    console.log("diagLog taille", await page.evaluate(() => (window.__diagLog || []).length));
    const off = await page.evaluate(({ ts, mot }) => {
      const box = document.getElementById("mc-" + ts);
      const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, null);
      const nodes = []; let full = ""; let n;
      while ((n = walker.nextNode())) { nodes.push({ node: n, start: full.length }); full += n.nodeValue; }
      const idx = full.indexOf(mot); if (idx === -1) return null;
      let sc = null, so = 0, ec = null, eo = 0;
      for (const { node, start } of nodes) {
        const end = start + node.nodeValue.length;
        if (!sc && idx >= start && idx < end) { sc = node; so = idx - start; }
        if (!ec && (idx + mot.length) > start && (idx + mot.length) <= end) { ec = node; eo = (idx + mot.length) - start; }
      }
      const range = document.createRange(); range.setStart(sc, so); range.setEnd(ec, eo);
      const o = window.computeOffsetInBox(box, range);
      return o ? { start: o.start, end: o.end, full: full.length } : null;
    }, { ts: MSG_TS, mot: "docétisme" });
    console.log("offsets docétisme:", JSON.stringify(off));
    console.log("écrit:", await ecrire({ id: "hl-drift", text: "marcionisme", a: "c", start: off.start, end: off.end }));
    await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
    await attendre();
    await page.waitForFunction((ts) => !!document.getElementById("mc-" + ts), MSG_TS, { timeout: 60000 });
    await page.waitForTimeout(1500);
    console.log("--- après 2e reload ---");
    console.log("diagLog taille", await page.evaluate(() => (window.__diagLog || []).length));
    (await page.evaluate(() => (window.__diagLog || []).filter(l => /loadChat|sanitize|applyHighlights|MIGRATE/.test(l)).slice(-10))).forEach(l => console.log("  [diag] " + l.slice(0, 200)));
    console.log("test console direct:", await page.evaluate(() => {
      const n = (window.__diagLog || []).length;
      try { window.__applyHighlights(); } catch (e) { return "throw:" + e.message; }
      return { avant: n, apres: (window.__diagLog || []).length, tail: (window.__diagLog || []).slice(-3) };
    }));
    console.log("spans:", await page.evaluate((ts) => {
      const box = document.getElementById("mc-" + ts);
      return Array.from(box.querySelectorAll("[data-hl-id]")).map(sp => sp.dataset.hlId + "=" + (sp.textContent || ""));
    }, MSG_TS));
    console.log("LS ann count:", await page.evaluate(() => {
      const c = JSON.parse(localStorage.getItem("theologicus_chat_chat-drift-0001") || "{}");
      return (c.messages || []).map(m => (m.annotations || []).length);
    }));
  } finally {
    await browser.close(); serveur.close();
  }
})();
