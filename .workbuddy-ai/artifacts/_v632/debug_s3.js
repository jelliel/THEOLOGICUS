// Scénario 3 : que se passe-t-il quand une fiche est insérée APRÈS le rendu ?
const path = require("path"), http = require("http"), fs = require("fs");
const { chromium } = require("playwright");
const RACINE = path.resolve(__dirname, "..", "..", "..");
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const PORT = 8856;
const TEXTE = `Le titre **Kurios** est central. Paul de Tarse utilise Kurios pour designer Jesus comme Seigneur.
Le mot Seigneur revient souvent : c'est le Seigneur des Seigneurs.
Enfin, « personne ne peut dire Jesus est Seigneur si ce n'est par l'Esprit ».`;
const CHAT = "__s3__", TS = 1730000000700;

(async () => {
  const srv = http.createServer((rq, rs) => {
    let p = decodeURIComponent(rq.url.split("?")[0]); if (p === "/") p = "/THEOLOGICUS.html";
    if (p === "/blank.html") { rs.writeHead(200, { "Content-Type": "text/html" }); rs.end("<!doctype html><title>b</title>"); return; }
    const fp = path.join(RACINE, p.replace(/^\/+/, ""));
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
      { role: "assistant", content: texte, ts: msgTs, annotations: [], marks: [],
        shapes: [{ id: "fg-s3", x: 1, y: 1, w: 100, h: 44, shape: "Rectangle", color: "#4f8ef7",
          svg: '<svg viewBox="0 0 24 24"><rect x="0" y="0" width="24" height="24" fill="none"/></svg>',
          ancre: { start: 339, end: 351, texte: "Seigneur des" } }] }] };
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
    await pg.waitForTimeout(1400);
  }
  const etat = () => pg.evaluate(() => {
    const box = document.querySelector(".message-content");
    const fb = document.querySelector(".atc-figbox");
    const st = window.__atcState(); const f = st.messages[1].shapes[0];
    const nodes = [];
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, { acceptNode: n =>
      (n.parentElement && n.parentElement.closest && n.parentElement.closest(".atc-figbox, .theo-fig, .theo-src-chips, [data-no-anchor]"))
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    let nd; while ((nd = walker.nextNode())) nodes.push(nd);
    let full = ""; nodes.forEach(n => full += n.nodeValue);
    const k = full.indexOf("Seigneur des");
    const loc = (pos, inc) => { let acc = 0; for (const n of nodes) { const len = n.nodeValue.length;
      if (inc ? (pos <= acc + len) : (pos < acc + len)) return { node: n, off: pos - acc }; acc += len; } return null; };
    let mot = null;
    if (k >= 0) { const a = loc(k, false), b2 = loc(k + 12, true);
      const r = document.createRange(); r.setStart(a.node, a.off); r.setEnd(b2.node, b2.off);
      const rr = r.getBoundingClientRect(), br = box.getBoundingClientRect();
      mot = { x: Math.round(rr.left - br.left), y: Math.round(rr.top - br.top), w: Math.round(rr.width) }; }
    const fr = fb ? fb.getBoundingClientRect() : null, br = box.getBoundingClientRect();
    return { ancre: f.ancre, fig: { x: f.x, y: f.y, w: f.w }, idx: k, lenFull: full.length,
      mot, cadre: fr ? { x: Math.round(fr.left - br.left), y: Math.round(fr.top - br.top) } : null,
      nbTheoFig: box.querySelectorAll(".theo-fig").length };
  });

  await load();
  console.log("APRES CHARGEMENT   ", JSON.stringify(await etat()));
  // injecter la fiche
  await pg.evaluate(() => {
    const box = document.querySelector(".message-content");
    const fig = document.createElement("div");
    fig.className = "theo-fig";
    fig.innerHTML = '<a class="theo-fig-img" href="#"><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="Paul de Tarse"></a>' +
      '<div class="theo-fig-txt"><div class="theo-fig-t">Paul de Tarse</div>' +
      '<div class="theo-fig-x">Paul de Tarse, ou saint Paul parmi les apôtres, est une figure majeure des origines du christianisme.</div>' +
      '<a class="theo-fig-l" href="#">Article Wikipédia →</a></div>';
    box.insertBefore(fig, box.firstChild);
  });
  await pg.waitForTimeout(1500);
  console.log("APRES INJECTION    ", JSON.stringify(await etat()));
  await load();
  console.log("APRES RELOAD       ", JSON.stringify(await etat()));
  await b.close(); srv.close();
})();
