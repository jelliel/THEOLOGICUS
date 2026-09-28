// Sonde : POURQUOI certains jetons référencés sans repli échappent au banc.
//
// Constat de départ, contre-intuitif : dans la MÊME règle `.badge-plasma`,
// `color: var(--plasma)` est bien vu par jetons_manquants.js, mais
// `background: var(--plasma-dim)` ne l'est pas — alors que les deux jetons sont
// également indéfinis. Le regex a été vérifié hors navigateur : il capture les
// deux. Donc l'écart vient du NAVIGATEUR, pas du banc.
//
// Cette sonde interroge donc le navigateur au lieu de raisonner :
//   1. la règle `.badge-plasma` est-elle réellement dans document.styleSheets ?
//   2. quel est son cssText exact (ce que le parseur a retenu) ?
//   3. la liste complète des jetons sans repli, avec leurs sélecteurs porteurs.
//
// Usage : node sonde_jetons.js [--port 8892] [--theme glass]

const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8892;
const THEME = process.argv.includes("--theme")
  ? process.argv[process.argv.indexOf("--theme") + 1] : "glass";
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
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`,
    { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => typeof window.loadArchiveChat === "function", null, { timeout: 90000 });

  const r = await page.evaluate((th) => {
    document.documentElement.setAttribute("data-theme", th);

    // --- 1. Les règles qui nous intéressent sont-elles visibles ? ---
    const cibles = [".badge-plasma", ".badge-violet", ".badge-neon", ".rating-star:hover, .rating-star.active"];
    const vues = {};
    for (const c of cibles) vues[c] = null;

    // --- 2. Balayage complet, avec le sélecteur porteur de chaque jeton ---
    const sansRepli = new Map();   // jeton -> Set(sélecteurs)
    const avecRepli = new Set();
    let nbFeuilles = 0, nbRegles = 0, nbIllisibles = 0;

    const visiter = (liste) => {
      for (const regle of liste) {
        if (regle.cssRules && !regle.selectorText) { visiter(regle.cssRules); continue; }
        if (!regle.style) continue;
        nbRegles++;
        const sel = regle.selectorText || "(?)";
        for (const c of cibles) {
          if (vues[c] === null && sel && sel.indexOf(c.split(",")[0]) !== -1) {
            vues[c] = { selecteur: sel, cssText: regle.cssText.slice(0, 300) };
          }
        }
        for (let i = 0; i < regle.style.length; i++) {
          const nom = regle.style[i];
          if (nom.startsWith("--")) continue;
          const v = regle.style.getPropertyValue(nom);
          const re = /var\(\s*(--[A-Za-z0-9_-]+)\s*([,)])/g;
          let m;
          while ((m = re.exec(v))) {
            if (m[2] === ",") { avecRepli.add(m[1]); continue; }
            if (!sansRepli.has(m[1])) sansRepli.set(m[1], new Set());
            sansRepli.get(m[1]).add(sel + " { " + nom + " }");
          }
        }
      }
    };

    for (const f of document.styleSheets) {
      nbFeuilles++;
      let rs;
      try { rs = f.cssRules; } catch (e) { nbIllisibles++; continue; }
      visiter(rs);
    }

    // --- 3. Que résolvent-ils ? ---
    const cs = getComputedStyle(document.documentElement);
    const etat = [];
    for (const j of [...sansRepli.keys()].sort()) {
      etat.push({
        jeton: j,
        valeur: cs.getPropertyValue(j).trim(),
        porteurs: [...sansRepli.get(j)].slice(0, 3),
      });
    }
    return { nbFeuilles, nbRegles, nbIllisibles, vues, etat, nbAvecRepli: avecRepli.size };
  }, THEME);

  console.log(`theme « ${THEME} » — ${r.nbFeuilles} feuilles, ${r.nbRegles} règles, ${r.nbIllisibles} illisibles`);
  console.log(`jetons sans repli : ${r.etat.length} | jetons avec repli : ${r.nbAvecRepli}\n`);

  console.log("=== Les règles cibles sont-elles visibles du navigateur ? ===");
  for (const [c, v] of Object.entries(r.vues)) {
    console.log(v ? `  [VUE ] ${c}\n         ${v.cssText.replace(/\s+/g, " ").slice(0, 200)}`
                  : `  [NON ] ${c}`);
  }

  const manquants = r.etat.filter(e => e.valeur === "");
  console.log(`\n=== Jetons sans repli qui résolvent VIDE (${manquants.length}) ===`);
  for (const e of manquants) {
    console.log(`  ${e.jeton}`);
    for (const p of e.porteurs) console.log(`      ${p}`);
  }

  const definis = r.etat.filter(e => e.valeur !== "");
  console.log(`\n=== Jetons sans repli qui résolvent une valeur (${definis.length}) ===`);
  console.log("  " + definis.map(e => e.jeton + "=" + e.valeur).join("\n  "));

  await browser.close();
  serveur.close();
})();
