// Jetons de theme REFERENCÉS mais jamais DÉFINIS — dans le thème actif.
//
// Pourquoi : deux jetons manquants dans le theme `glass` (--chat-assistant et
// --bg-card) suffisent a rendre toutes les conversations illisibles (texte
// clair sur fond blanc, 1,11:1). Un `var(--x)` sans valeur de repli rend la
// declaration ENTIERE invalide : la propriete retombe a sa valeur initiale,
// silencieusement. Aucun message d'erreur, aucune exception.
//
// Ce banc dresse la LISTE, pour ne pas corriger au coup par coup et en laisser
// dix autres derriere.
//
// Usage : node jetons_manquants.js [--port 8890]

const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8890;
const RACINE = "C:/tmp/theoverify";
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";

const THEMES = ["glass", "cyber", "midnight", "light", "v6-glass", "v6-cyber", "v6-light"];

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

  for (const theme of THEMES) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`,
      { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForFunction(() => typeof window.loadArchiveChat === "function", null, { timeout: 90000 });

    const r = await page.evaluate((th) => {
      // 1. Tous les jetons references, avec ou sans repli.
      const sansRepli = new Set();
      const avecRepli = new Set();
      const definis = new Set();
      const visiter = (liste) => {
        for (const regle of liste) {
          if (regle.cssRules && !regle.selectorText) { visiter(regle.cssRules); continue; }
          if (!regle.style) continue;
          for (let i = 0; i < regle.style.length; i++) {
            const nom = regle.style[i];
            if (nom.startsWith("--")) { definis.add(nom); continue; }
            const v = regle.style.getPropertyValue(nom);
            const re = /var\(\s*(--[A-Za-z0-9_-]+)\s*([,)])/g;
            let m;
            while ((m = re.exec(v))) {
              if (m[2] === ",") avecRepli.add(m[1]); else sansRepli.add(m[1]);
            }
          }
        }
      };
      for (const f of document.styleSheets) {
        let rs; try { rs = f.cssRules; } catch (e) { continue; }
        visiter(rs);
      }
      // 2. Le theme actif : on pose l'attribut puis on lit les jetons calcules.
      document.documentElement.setAttribute("data-theme", th);
      const cs = getComputedStyle(document.documentElement);
      const manquants = [];
      for (const j of sansRepli) {
        if (cs.getPropertyValue(j).trim() === "") manquants.push(j);
      }
      return {
        totalReferences: sansRepli.size,
        totalDefinis: definis.size,
        manquants: manquants.sort(),
      };
    }, theme);

    console.log(`\n=== theme « ${theme} »`);
    console.log(`    jetons references sans repli : ${r.totalReferences}`);
    console.log(`    jetons declares dans les feuilles : ${r.totalDefinis}`);
    console.log(`    MANQUANTS dans ce theme : ${r.manquants.length}`);
    if (r.manquants.length) console.log("      " + r.manquants.join(", "));
    await ctx.close();
  }

  await browser.close();
  serveur.close();
})();
