// Qui ecrase les jetons de theme ? Mesure les valeurs REELLEMENT calculees.
//
// Indice : le theme glass definit --hull:#0e1c30 (sombre) et .message.assistant
// prend background:var(--hull) — pourtant la mesure donne rgb(255,255,255).
// Une valeur de feuille de style ne peut pas perdre contre une autre sans une
// raison : style en ligne sur <html>, ou regle de specificite superieure.
//
// Usage : node jetons_reels.js [--port 8880]

const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8880;
const RACINE = "C:/tmp/theoverify";
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";

(async () => {
  const serveur = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/THEOLOGICUS.html";
    const fp = path.join(RACINE, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      res.writeHead(200, {
        "Content-Type": p.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream",
        "Cache-Control": "no-store",
      });
      fs.createReadStream(fp).pipe(res);
    } else { res.writeHead(404); res.end("404"); }
  });
  await new Promise(r => serveur.listen(PORT, "127.0.0.1", r));

  const browser = await chromium.launch({
    executablePath: path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe"),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  await ctx.addInitScript(() => {
    try { document.cookie = "key_mistral=sk-test; path=/"; } catch (x) {}
  });

  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`,
    { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => typeof window.loadArchiveChat === "function", null, { timeout: 90000 });
  await page.waitForTimeout(2500);

  const info = await page.evaluate(() => {
    const racine = document.documentElement;
    const cs = getComputedStyle(racine);
    const jetons = ["--hull", "--bg-card", "--bg-card-alt", "--void", "--deep",
                    "--text-primary", "--text-secondary", "--text-bright", "--glass-bg", "--popup-bg"];
    const lus = {};
    for (const j of jetons) lus[j] = cs.getPropertyValue(j).trim();
    // Proprietes posees EN LIGNE sur <html> : elles gagnent sur toute feuille.
    const enLigne = {};
    for (let i = 0; i < racine.style.length; i++) {
      const n = racine.style[i];
      enLigne[n] = racine.style.getPropertyValue(n).trim();
    }
    // Regles de feuille qui declarent --hull, pour voir qui gagne.
    const decl = [];
    for (const feuille of document.styleSheets) {
      let regles;
      try { regles = feuille.cssRules; } catch (e) { continue; }
      for (const r of regles) {
        if (!r.style || !r.selectorText) continue;
        for (const j of ["--hull", "--bg-card"]) {
          if (r.style.getPropertyValue(j)) {
            decl.push({ sel: r.selectorText, jeton: j, val: r.style.getPropertyValue(j).trim() });
          }
        }
      }
    }
    return {
      theme: racine.getAttribute("data-theme"),
      classe: racine.className,
      lus,
      enLigne,
      nbEnLigne: Object.keys(enLigne).length,
      declarations: decl,
    };
  });

  console.log("theme :", info.theme, "| classes <html> :", JSON.stringify(info.classe));
  console.log("\n--- jetons calcules sur <html> ---");
  for (const [k, v] of Object.entries(info.lus)) console.log(`  ${k.padEnd(18)} ${v}`);
  console.log(`\n--- proprietes EN LIGNE sur <html> (${info.nbEnLigne}) ---`);
  for (const [k, v] of Object.entries(info.enLigne)) console.log(`  ${k.padEnd(24)} ${v}`);
  console.log("\n--- feuilles qui declarent --hull / --bg-card ---");
  for (const d of info.declarations) console.log(`  ${d.jeton.padEnd(12)} ${d.val.padEnd(24)} ${d.sel}`);

  await browser.close();
  serveur.close();
})();
