// Sonde ciblée : que voit exactement le CSSOM dans une règle qui contient
// un var() sans repli, selon la PROPRIÉTÉ porteuse ?
//
// Écart constaté : dans `.badge-plasma`, `color: var(--plasma)` est capturé par
// le balayage, mais `background: var(--plasma-dim)` ne l'est pas — les deux
// jetons étant pourtant indéfinis tous les deux, et les octets identiques.
// Hypothèse à tester : le CSSOM ne restitue pas de la même façon une valeur
// « en attente de substitution » portée par un RACCOURCI (background) et par
// une propriété longue (color).
//
// Usage : node sonde_une_regle.js [--port 8893]

const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8893;
const RACINE = path.resolve(__dirname, "..", "..", "..", "..");
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";

if (!fs.existsSync(path.join(RACINE, "THEOLOGICUS.html"))) {
  console.error("THEOLOGICUS.html introuvable dans " + RACINE);
  process.exit(2);
}

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

  const browser = await chromium.launch({
    executablePath: path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe"),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => typeof window.loadArchiveChat === "function", null, { timeout: 90000 });

  const r = await page.evaluate(() => {
    const cibles = [".badge-plasma", ".badge-violet", ".archive-match", ".rating-star:hover, .rating-star.active"];
    const out = [];
    const trouver = (liste, sel) => {
      for (const regle of liste) {
        if (regle.cssRules && !regle.selectorText) { const t = trouver(regle.cssRules, sel); if (t) return t; continue; }
        if (regle.selectorText === sel) return regle;
      }
      return null;
    };
    for (const c of cibles) {
      let regle = null;
      for (const f of document.styleSheets) {
        let rs; try { rs = f.cssRules; } catch (e) { continue; }
        regle = trouver(rs, c); if (regle) break;
      }
      if (!regle) { out.push({ selecteur: c, trouve: false }); continue; }
      const st = regle.style;
      const props = [];
      for (let i = 0; i < st.length; i++) {
        const nom = st[i];
        props.push({
          rang: i,
          nom: nom,
          valeur: st.getPropertyValue(nom),
          // Lecture par l'API « raccourci » explicite, pour comparer.
          cssText: (st.getPropertyValue(nom) || "").trim(),
        });
      }
      out.push({ selecteur: c, trouve: true, longueur: st.length, props: props, cssText: regle.cssText });
    }
    return out;
  });

  for (const c of r) {
    console.log("\n" + "=".repeat(70));
    console.log("SÉLECTEUR : " + c.selecteur);
    if (!c.trouve) { console.log("  (règle introuvable)"); continue; }
    console.log("  style.length = " + c.longueur);
    for (const p of c.props) {
      const marque = /var\(/.test(p.valeur) ? "  <-- contient var()" : "";
      console.log(`    [${p.rang}] ${p.nom.padEnd(22)} = ${JSON.stringify(p.valeur)}${marque}`);
    }
  }

  await browser.close();
  serveur.close();
})();
