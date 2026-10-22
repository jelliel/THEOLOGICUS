// Diagnostic v621 : que fait la reparation v633 au cadre du banc ?
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = 8838;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

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

  const browser = await chromium.launch(Object.assign({ args: ["--no-sandbox"] },
    process.env.PW_DIR ? { executablePath: CHROME } : {}));
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", e => console.log("  [pageerror] " + e.message));
  await page.addInitScript(() => { try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {} });

  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 });
  await page.evaluate(() => {
    const o = document.getElementById("auth-overlay"); if (o) o.remove();
    setInterval(function () { const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active"); }, 250);
  });
  await page.waitForTimeout(1500);

  const r = await page.evaluate(() => {
    const ts = Date.now();
    const st = window.__atcState ? window.__atcState() : null;
    if (!st) return { err: "pas d'etat" };
    st.messages = [{ role: "user", content: "x", ts: ts - 1 },
      { role: "assistant",
        content: 'La notion de Kyrios designe la seigneurie divine.\n\n' +
          'Mais avec une hierarchie d economie : le Pere est la source, le Fils est envoye.\n\n' +
          'Citation cle : Cyrille d Alexandrie, De Adoratione in Spiritu 1.',
        ts: ts, annotations: [], marks: [] }];
    if (typeof renderMessages === "function") renderMessages();
    const box = document.getElementById("mc-" + ts);
    if (!box) return { err: "pas de box" };
    const rb = box.getBoundingClientRect();
    st.messages[1].shapes = [{ id: "fg-t", shape: "Rectangle", color: "#4f8ef7", weight: 1.4,
      text: "", svg: "<rect/>", x: 4, y: 2, w: Math.round(rb.width - 12), h: 90, note: "Note du cadre." }];
    if (window.__applyShapes) window.__applyShapes();
    return { ok: true, ts: ts, boxW: Math.round(rb.width) };
  });
  await page.waitForTimeout(800);

  const m = await page.evaluate((ts) => {
    const box = document.getElementById("mc-" + ts);
    const fb = document.querySelector('[data-fig-id="fg-t"]');
    const st = window.__atcState ? window.__atcState() : null;
    const sh = st ? st.messages[1].shapes[0] : null;
    // texte du milieu du cadre : que recouvre-t-il ? (walker LIMITÉE au box)
    const w = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const n0 = w.nextNode();
    const rng = document.createRange();
    rng.setStart(n0, 0); rng.setEnd(n0, Math.min(40, n0.nodeValue.length));
    const rr = rng.getBoundingClientRect();
    const fr = fb ? fb.getBoundingClientRect() : null;
    const el = fr ? document.elementFromPoint(rr.left + 2, rr.top + rr.height / 2) : null;
    return {
      fig: fr ? { l: Math.round(fr.left), t: Math.round(fr.top), w: Math.round(fr.width), h: Math.round(fr.height) } : null,
      memo: sh ? { x: sh.x, y: sh.y, w: sh.w, h: sh.h, ancre: sh.ancre || null, libre: sh.libre || 0 } : null,
      texte40: { l: Math.round(rr.left), t: Math.round(rr.top), w: Math.round(rr.width), h: Math.round(rr.height) },
      dansCadre: fr ? (rr.left > fr.left && rr.right < fr.right) : null,
      elAtPoint: el ? el.tagName + "." + String(el.className || "").slice(0, 40) : null,
      boxRect: { l: Math.round(box.getBoundingClientRect().left), t: Math.round(box.getBoundingClientRect().top), w: Math.round(box.getBoundingClientRect().width) },
      nodeParent: n0.parentElement ? n0.parentElement.tagName + "." + String(n0.parentElement.className || "").slice(0, 50) : null,
      nodeDansBox: box.contains(n0),
      innerHTML: box.innerHTML.slice(0, 220),
      ancRect: window.__ANC ? window.__ANC.rect(box, 0, 48) : null,
      ancResolve: window.__ANC ? (function(){ var r = window.__ANC.resolve(box, sh); return r ? { x: r.r.x, y: r.r.y, w: r.r.w, h: r.r.h, start: r.start } : null; })() : null,
      boxClientLeft: box.clientLeft, figOffsetLeft: fb ? fb.offsetLeft : null, figOffsetTop: fb ? fb.offsetTop : null,
      selApresClic: null,
    };
  }, r.ts);
  console.log(JSON.stringify(m, null, 2));
  await browser.close();
  serveur.close();
})();
