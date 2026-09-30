const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");
const RACINE = path.resolve(__dirname, "..", "..", "..", "..");
const PW = "C:/Users/toshr/AppData/Local/ms-playwright";
const PORT = 8793;
const REPONSE = "1. Il cite Hénoc comme témoignage non **canonique** mais utile.";

(async () => {
  const serveur = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/THEOLOGICUS.html";
    const fp = path.join(RACINE, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      res.writeHead(200, { "Content-Type": p.endsWith(".html") ? "text/html; charset=utf-8" : p.endsWith(".js") ? "application/javascript; charset=utf-8" : "application/octet-stream", "Cache-Control": "no-store" });
      fs.createReadStream(fp).pipe(res);
    } else { res.writeHead(404); res.end("404"); }
  });
  await new Promise(r => serveur.listen(PORT, "127.0.0.1", r));

  const browser = await chromium.launch({
    executablePath: path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe"),
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  page.on("console", m => console.log(`[${m.type()}] ${m.text().slice(0, 250)}`));
  page.on("pageerror", e => console.log(`[pageerror] ${e.message}`));
  page.on("requestfailed", r => console.log(`[reqfail] ${r.url()} ${r.failure() && r.failure().errorText}`));
  page.on("response", r => { if (r.status() >= 400) console.log(`[http${r.status()}] ${r.url()}`); });
  const fetched = [];
  await page.addInitScript((reponse) => {
    try { localStorage.setItem("agnes_api_key", "sk-test-agnes-align"); } catch (e) {}
    try { document.cookie = "key_mistral=sk-test-mistral-align; path=/"; } catch (e) {}
    window.__fetched = [];
    window.fetch = function (input, init) {
      const url = typeof input === "string" ? input : (input && input.url) || "";
      const method = String((init && init.method) || "GET").toUpperCase();
      window.__fetched.push(method + " " + url);
      if (method === "POST" && /chat\/completions|\/responses|\/v1\/messages/.test(url)) {
        const enc = new TextEncoder();
        const parts = [enc.encode("data: " + JSON.stringify({ choices: [{ delta: { content: reponse } }] }) + "\n\n"), enc.encode("data: [DONE]\n\n")];
        let i = 0;
        const stream = new ReadableStream({ pull(c) { if (i >= parts.length) { c.close(); return; } c.enqueue(parts[i++]); } });
        return Promise.resolve(new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } }));
      }
      return Promise.resolve(new Response("{}", { status: 200 }));
    };
  }, REPONSE);

  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => typeof window.onAddToChat === "function", null, { timeout: 60000 });
  await page.evaluate(() => { const o = document.getElementById("auth-overlay"); if (o) o.remove(); });
  await page.waitForSelector("#user-input");
  await page.fill("#user-input", "test question");
  const before = await page.evaluate(() => document.getElementById("user-input").value);
  console.log("input value before send:", JSON.stringify(before));
  await page.evaluate(() => {
    const inp = document.getElementById("user-input");
    inp.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  await page.waitForTimeout(4000);
  const after = await page.evaluate(() => ({
    chatText: (document.getElementById("chat-container").textContent || "").slice(0, 300),
    fetched: window.__fetched,
    sendBtnDisabled: document.getElementById("send-btn") ? document.getElementById("send-btn").disabled : null,
    hasMc: !!document.querySelector('[id^="mc-"]'),
  }));
  console.log("AFTER:", JSON.stringify(after, null, 2));
  await browser.close();
  serveur.close();
})().catch(e => { console.error("FATAL", e.message); process.exit(1); });