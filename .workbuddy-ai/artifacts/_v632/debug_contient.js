// Validation ciblée : le cadre CONTIENT-IL le mot ? (indépendant de mes marges)
const path = require("path"), http = require("http"), fs = require("fs");
const { chromium } = require("playwright");
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const PORT = 8848;
const TEXTE = `Le titre **Kurios** est central. Paul de Tarse utilise Kurios pour designer Jesus comme Seigneur.
Le mot Seigneur revient souvent : c'est le Seigneur des Seigneurs.
Enfin, « personne ne peut dire Jesus est Seigneur si ce n'est par l'Esprit ».`;
const CHAT = "__contient__", TS = 1730000000300;

(async () => {
  const srv = http.createServer((rq, rs) => {
    let p = decodeURIComponent(rq.url.split("?")[0]); if (p === "/") p = "/THEOLOGICUS.html";
    if (p === "/blank.html") { rs.writeHead(200, { "Content-Type": "text/html" }); rs.end("<!doctype html><title>b</title>"); return; }
    const fp = path.join(SERVI, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) { rs.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }); fs.createReadStream(fp).pipe(rs); }
    else { rs.writeHead(404); rs.end("404"); }
  });
  await new Promise(r => srv.listen(PORT, "127.0.0.1", r));
  const b = await chromium.launch(Object.assign({ args: ["--no-sandbox"] }, process.env.PW_DIR ? { executablePath: path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe") } : {}));
  const pg = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await pg.addInitScript(() => { try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {} });
  await pg.goto(`http://127.0.0.1:${PORT}/blank.html`);
  await pg.evaluate(async ({ chatId, texte, msgTs }) => {
    const chat = { id: chatId, title: "d", updated: Date.now(), messages: [
      { role: "system", content: "sys", ts: 1 },
      { role: "assistant", content: texte, ts: msgTs, annotations: [], marks: [], shapes: [] }] };
    await new Promise((res, rej) => {
      const r = indexedDB.open("THEOLOGICUS_AI_DB");
      r.onupgradeneeded = () => { const d = r.result;
        if (!d.objectStoreNames.contains("chats")) d.createObjectStore("chats", { keyPath: "id" });
        if (!d.objectStoreNames.contains("settings")) d.createObjectStore("settings", { keyPath: "id" }); };
      r.onsuccess = () => { const db = r.result; const tx = db.transaction(["chats", "settings"], "readwrite");
        tx.objectStore("chats").put(chat); tx.objectStore("settings").put({ id: "currentChatId", value: chatId });
        tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); };
      r.onerror = () => rej(r.error);
    });
    localStorage.setItem("theologicus_chat_" + chatId, JSON.stringify(chat));
  }, { chatId: CHAT, texte: TEXTE, msgTs: TS });

  async function load() {
    await pg.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await pg.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 });
    await pg.evaluate(() => { const o = document.getElementById("auth-overlay"); if (o) o.remove();
      window.__d = setInterval(() => { const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active"); }, 250); });
    await pg.evaluate(async id => { try { await window.loadChat(id); } catch (e) {} try { window.renderMessages(); } catch (e) {} }, CHAT);
    await pg.waitForSelector(".message-content", { timeout: 20000 });
    await pg.waitForTimeout(1300);
  }
  await load();
  await pg.evaluate(() => {
    const box = document.querySelector(".message-content");
    const w = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, null);
    let full = "", nodes = [], nd;
    while ((nd = w.nextNode())) { nodes.push({ node: nd, s: full.length }); full += nd.nodeValue; }
    const k = full.indexOf("Seigneur des");
    const pos = st => { for (let i = nodes.length - 1; i >= 0; i--) if (st >= nodes[i].s) return { node: nodes[i].node, off: st - nodes[i].s }; return null; };
    const a = pos(k), bb = pos(k + 12);
    const rng = document.createRange(); rng.setStart(a.node, a.off); rng.setEnd(bb.node, bb.off);
    const r = rng.getBoundingClientRect();
    const st = window.__atcState(); const msg = st.messages.find(m => m.role === "assistant");
    window.__atcInsertFig({ msgTs: msg.ts, range: rng.cloneRange(), selRect: { left: r.left, top: r.top, width: r.width, height: r.height }, texte: "Seigneur des" }, "Rectangle");
  });
  await pg.waitForTimeout(1500);
  await load();
  const res = await pg.evaluate(() => {
    const box = document.querySelector(".message-content");
    const fb = document.querySelector(".atc-figbox");
    const st = window.__atcState(); const f = st.messages[1].shapes[0];
    const w = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, { acceptNode: n =>
      (n.parentElement && n.parentElement.closest && n.parentElement.closest(".atc-figbox")) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    let full = "", nodes = [], nd;
    while ((nd = w.nextNode())) { nodes.push({ node: nd, s: full.length }); full += nd.nodeValue; }
    const k = full.indexOf("Seigneur des");
    const pos = st2 => { for (let i = nodes.length - 1; i >= 0; i--) if (st2 >= nodes[i].s) return { node: nodes[i].node, off: st2 - nodes[i].s }; return null; };
    const a = pos(k), bb = pos(k + 12);
    const rng = document.createRange(); rng.setStart(a.node, a.off); rng.setEnd(bb.node, bb.off);
    const wr = rng.getBoundingClientRect(), fr = fb.getBoundingClientRect();
    return { ancre: f.ancre, fig: { x: f.x, y: f.y, w: f.w, h: f.h },
      mot: { l: Math.round(wr.left), t: Math.round(wr.top), r: Math.round(wr.right), b: Math.round(wr.bottom) },
      cadre: { l: Math.round(fr.left), t: Math.round(fr.top), r: Math.round(fr.right), b: Math.round(fr.bottom) },
      contient: fr.left <= wr.left + 2 && fr.top <= wr.top + 2 && fr.right >= wr.right - 2 && fr.bottom >= wr.bottom - 2,
      margeGauche: Math.round(wr.left - fr.left), margeHaut: Math.round(wr.top - fr.top) };
  });
  console.log(JSON.stringify(res, null, 1));
  await b.close(); srv.close();
})();
