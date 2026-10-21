const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");
const PORT = 8819;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");
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
  const browser = await chromium.launch(Object.assign({ args: ["--no-sandbox", "--disable-dev-shm-usage"] }, process.env.PW_DIR ? { executablePath: CHROME } : {}));
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errs = [];
  page.on("pageerror", e => errs.push(String(e && e.stack ? e.stack.split("\n").slice(0, 4).join(" | ") : e)));
  page.on("console", m => { if (m.type() === "error") errs.push("console.error: " + m.text()); });
  await page.addInitScript(() => {
    try { document.cookie = "key_mistral=sk-test; path=/"; } catch (e) {}
    try { localStorage.setItem("theologicus_wizard_skipped", "1"); } catch (e) {}
  });
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(13000);
  const d = await page.evaluate(() => ({
    topbar: !!document.getElementById("v6-topbar"),
    rightGrp: !!document.getElementById("v6-right-grp"),
    rightGrpEnfants: document.getElementById("v6-right-grp") ? Array.from(document.getElementById("v6-right-grp").children).map(c => c.id || c.className).slice(0, 8) : null,
    btn: !!document.getElementById("media-open-btn"),
    modal: !!document.getElementById("media-modal"),
    flag: !!window.__v631Media,
    apiExpose: typeof window.__mediaOuvrir,
  }));
  console.log(JSON.stringify(d, null, 2));
  console.log("ERREURS:", errs.length ? errs.slice(0, 4).join("\n---\n") : "(aucune)");
  await browser.close();
  serveur.close();
})();
