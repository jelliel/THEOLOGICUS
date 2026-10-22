// Où _ancRect place-t-il le cadre pour start=341 ? Comparaison avec indexOf brut.
const path = require("path"), http = require("http"), fs = require("fs");
const { chromium } = require("playwright");
const RACINE = path.resolve(__dirname, "..", "..", "..");
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const PORT = 8850;
const TEXTE = `Le titre **Kurios** est central. Paul de Tarse utilise Kurios pour designer Jesus comme Seigneur.
Le mot Seigneur revient souvent : c'est le Seigneur des Seigneurs.
Enfin, « personne ne peut dire Jesus est Seigneur si ce n'est par l'Esprit ».`;
const CHAT = "__offmap__", TS = 1730000000400;
(async () => {
  const srv = http.createServer((rq, rs) => {
    let p = decodeURIComponent(rq.url.split("?")[0]); if (p === "/") p = "/THEOLOGICUS.html";
    if (p === "/blank.html") { rs.writeHead(200, { "Content-Type": "text/html" }); rs.end("<!doctype html><title>b</title>"); return; }
    const fp = path.join(RACINE, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) { rs.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); fs.createReadStream(fp).pipe(rs); }
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
  await pg.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await pg.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 });
  await pg.evaluate(() => { const o = document.getElementById("auth-overlay"); if (o) o.remove();
    window.__d = setInterval(() => { const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active"); }, 250); });
  await pg.evaluate(async id => { try { await window.loadChat(id); } catch (e) {} try { window.renderMessages(); } catch (e) {} }, CHAT);
  await pg.waitForSelector(".message-content", { timeout: 20000 });
  await pg.waitForTimeout(1300);

  const out = await pg.evaluate(() => {
    const box = document.querySelector(".message-content");
    // 1. Espace FILTRE (celui des encadres)
    const walk = filt => {
      const w = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, filt ? { acceptNode: n =>
        (n.parentElement && n.parentElement.closest && n.parentElement.closest(".atc-figbox")) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT } : null);
      let full = "", nodes = [], nd;
      while ((nd = w.nextNode())) { nodes.push(nd); full += nd.nodeValue; }
      return { full, nodes };
    };
    const filt = walk(true), brut = walk(false);
    // 2. Rect pour start/end DONNÉS dans l'espace FILTRE
    const loc = (nodes, pos, inc) => { let acc = 0;
      for (const n of nodes) { const len = n.nodeValue.length;
        if (inc ? (pos <= acc + len) : (pos < acc + len)) return { node: n, off: pos - acc }; acc += len; }
      return null; };
    const rect = (nodes, s, e) => {
      const a = loc(nodes, s, false), b2 = loc(nodes, e, true);
      if (!a || !b2) return null;
      const r = document.createRange(); r.setStart(a.node, a.off); r.setEnd(b2.node, b2.off);
      const rr = r.getBoundingClientRect();
      return { txt: JSON.stringify(r.toString()), left: Math.round(rr.left), top: Math.round(rr.top), w: Math.round(rr.width) };
    };
    return {
      lenFilt: filt.full.length, lenBrut: brut.full.length,
      idxFilt: filt.full.indexOf("Seigneur des"), idxBrut: brut.full.indexOf("Seigneur des"),
      rect140: rect(filt.nodes, 340, 352),
      rect141: rect(filt.nodes, 341, 353),
      rectBrut: rect(brut.nodes, 341, 353),
      ecartNoeuds: (function () {
        // premier nœud texte EXCLU par le filtre
        const excl = brut.nodes.filter(n => !filt.nodes.includes(n));
        return excl.slice(0, 5).map(n => ({ txt: JSON.stringify((n.nodeValue || "").slice(0, 40)), len: (n.nodeValue || "").length,
          parent: n.parentElement ? n.parentElement.className : null }));
      })(),
    };
  });
  console.log(JSON.stringify(out, null, 1));
  await b.close(); srv.close();
})();
