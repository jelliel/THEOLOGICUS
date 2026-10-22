// Sonde : quels globaux le banc peut-il atteindre ?
const path = require("path"), http = require("http"), fs = require("fs");
const { chromium } = require("playwright");
const RACINE = path.resolve(__dirname, "..", "..", "..");
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
(async () => {
  const srv = http.createServer((rq, rs) => {
    let p = decodeURIComponent(rq.url.split("?")[0]); if (p === "/") p = "/THEOLOGICUS.html";
    const fp = path.join(RACINE, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) { rs.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); fs.createReadStream(fp).pipe(rs); }
    else { rs.writeHead(404); rs.end("404"); }
  });
  await new Promise(r => srv.listen(8851, "127.0.0.1", r));
  const b = await chromium.launch(Object.assign({ args: ["--no-sandbox"] }, process.env.PW_DIR ? { executablePath: path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe") } : {}));
  const pg = await (await b.newContext()).newPage();
  await pg.addInitScript(() => { try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {} });
  await pg.goto("http://127.0.0.1:8851/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 90000 });
  await pg.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 }).catch(() => {});
  await pg.waitForTimeout(2500);
  const r = await pg.evaluate(() => {
    const keys = Object.keys(window).filter(k => /state|chat|msg|atc|theo/i.test(k));
    return {
      render: typeof window.renderMessages,
      saveChat: typeof window.saveChat,
      loadChat: typeof window.loadChat,
      insertFig: typeof window.__atcInsertFig,
      dbgFig: typeof window.__DBG_FIG,
      stateType: typeof window.state,
      hasAppState: typeof window.appState,
      windowKeys: keys.sort().slice(0, 60),
      msgCount: document.querySelectorAll(".message-content").length,
    };
  });
  console.log(JSON.stringify(r, null, 2));
  await b.close(); srv.close();
})();
