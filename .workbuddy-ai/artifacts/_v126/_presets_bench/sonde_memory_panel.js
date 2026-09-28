// Pourquoi la capture du panneau memoire est un rectangle uni ?
// Mesure l'etat reel de #memory-panel apres ajout de .active : geometrie,
// opacite, transform, et le fond calcule. Sans cela on capture a l'aveugle.
//
// Usage : node sonde_memory_panel.js [--theme v6-cyber] [--port 8844]
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const PORT = parseInt(arg("--port", "8844"), 10);
const THEME = arg("--theme", "v6-cyber");
const RACINE = process.env.BENCH_ROOT || path.resolve(__dirname, "..", "..", "..", "..");
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";

(async () => {
  const serveur = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/THEOLOGICUS.html";
    const fp = path.join(RACINE, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      res.writeHead(200, { "Content-Type": p.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream" });
      fs.createReadStream(fp).pipe(res);
    } else { res.writeHead(404); res.end("non"); }
  });
  await new Promise(r => serveur.listen(PORT, "127.0.0.1", r));

  const browser = await chromium.launch({ executablePath: path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe") });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(2500);

  const avant = await page.evaluate(() => {
    const p = document.getElementById("memory-panel");
    const cs = getComputedStyle(p);
    const r = p.getBoundingClientRect();
    return { classes: p.className, display: cs.display, opacity: cs.opacity, transform: cs.transform,
             bg: cs.backgroundColor, rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] };
  });
  console.log("SANS .active :", JSON.stringify(avant));

  const apres = await page.evaluate((th) => {
    document.documentElement.setAttribute("data-theme", th);
    const p = document.getElementById("memory-panel");
    p.classList.add("active");
    const cs = getComputedStyle(p);
    const r = p.getBoundingClientRect();
    return { classes: p.className, display: cs.display, opacity: cs.opacity, transform: cs.transform,
             bg: cs.backgroundColor, rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] };
  }, THEME);
  console.log("AVEC .active :", JSON.stringify(apres));

  await page.waitForTimeout(1500);
  const apres2 = await page.evaluate(() => {
    const p = document.getElementById("memory-panel");
    const cs = getComputedStyle(p);
    const r = p.getBoundingClientRect();
    return { display: cs.display, opacity: cs.opacity, transform: cs.transform, rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] };
  });
  console.log("apres 1,5 s  :", JSON.stringify(apres2));

  await browser.close();
  serveur.close();
})();
