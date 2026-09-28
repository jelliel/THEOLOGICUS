// Sonde de CASCADE : pour un thème et une liste de jetons, quelles règles les
// déclarent sur <html>, dans quel ordre, et laquelle gagne ?
//
// Raison d'être : `--text` vaut #e6edf7 dans le thème CLAIR. Ce n'est pas un
// jeton manquant (il résout), c'est un jeton ÉCRASÉ par une déclaration plus
// loin dans le document mais de même spécificité. Un banc qui ne regarde que la
// valeur calculée ne dit pas QUI a gagné ; sans le nom du gagnant, on corrige
// au hasard. Cette sonde nomme le gagnant.
//
// Usage : node sonde_cascade.js [--port 8911] [--theme light] [--jetons "--text,--neon,--glass-border"]

const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const arg = (n, d) => process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d;
const PORT = parseInt(arg("--port", "8911"), 10);
const THEME = arg("--theme", "light");
const JETONS = arg("--jetons", "--text,--text-bright,--neon,--cyan,--accent,--glass-border,--cyan-dim,--bg-void,--bg-hull").split(",").map(s => s.trim());
const RACINE = process.env.BENCH_ROOT || path.resolve(__dirname, "..", "..", "..", "..");
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
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => typeof window.loadArchiveChat === "function", null, { timeout: 90000 });

  const r = await page.evaluate((args) => {
    const [th, jetons] = args;
    document.documentElement.setAttribute("data-theme", th);

    // Spécificité approchée : (ids, classes/attributs/pseudo-classes, éléments).
    const spec = (sel) => {
      let a = 0, b = 0, c = 0;
      // On ignore ce qui suit un :pseudo-élément.
      const s = sel.split("::")[0];
      const re = /(#[A-Za-z0-9_-]+)|(\.[A-Za-z0-9_-]+)|(\[[^\]]*\])|(::?[A-Za-z-]+(\([^)]*\))?)|([A-Za-z][A-Za-z0-9-]*)/g;
      let m;
      while ((m = re.exec(s))) {
        if (m[1]) a++;
        else if (m[2] || m[3]) b++;
        else if (m[4]) b++;          // :root est une pseudo-classe -> compte en b
        else if (m[6]) c++;
      }
      return [a, b, c];
    };
    const cmp = (x, y) => (x[0] - y[0]) || (x[1] - y[1]) || (x[2] - y[2]);

    const trouve = new Map();   // jeton -> [ {ordre, feuille, selecteur, valeur, spec} ]
    for (const j of jetons) trouve.set(j, []);

    let ordre = 0;
    const visiter = (liste, feuille) => {
      for (const regle of liste) {
        if (regle.cssRules && !regle.selectorText) { visiter(regle.cssRules, feuille); continue; }
        if (!regle.selectorText || !regle.style) continue;
        ordre++;
        const sel = regle.selectorText;
        let concerne = false;
        for (const j of jetons) if (regle.style.getPropertyValue(j) !== "") { concerne = true; break; }
        if (!concerne) continue;
        // La règle s'applique-t-elle à <html> ?
        let cible = false;
        try { cible = document.documentElement.matches(sel.split(",").map(s => s.trim()).join(",")); } catch (e) { cible = false; }
        if (!cible) continue;
        for (const j of jetons) {
          const v = regle.style.getPropertyValue(j);
          if (v === "") continue;
          trouve.get(j).push({ ordre, feuille, selecteur: sel, valeur: v.trim(), spec: spec(sel) });
        }
      }
    };
    for (const f of document.styleSheets) {
      let rs; try { rs = f.cssRules; } catch (e) { continue; }
      visiter(rs, f.ownerNode && f.ownerNode.id ? "#" + f.ownerNode.id : "(sans id)");
    }

    const cs = getComputedStyle(document.documentElement);
    const out = [];
    for (const j of jetons) {
      const cands = trouve.get(j);
      // Le gagnant : spécificité max, puis ordre max.
      let gagnant = null;
      for (const k of cands) {
        if (!gagnant || cmp(k.spec, gagnant.spec) > 0 || (cmp(k.spec, gagnant.spec) === 0 && k.ordre > gagnant.ordre)) gagnant = k;
      }
      out.push({ jeton: j, calcule: cs.getPropertyValue(j).trim(), candidats: cands, gagnant });
    }
    return out;
  }, [THEME, JETONS]);

  console.log(`theme « ${THEME} » — déclarations de jeton s'appliquant à <html>\n`);
  for (const e of r) {
    console.log(`── ${e.jeton}  =  ${e.calcule || "(vide)"}`);
    if (!e.candidats.length) { console.log("     aucune déclaration ne cible <html>\n"); continue; }
    for (const c of e.candidats) {
      const gagne = e.gagnant && c.ordre === e.gagnant.ordre && c.selecteur === e.gagnant.selecteur;
      console.log(`     ${gagne ? ">>>" : "   "} [${c.spec.join(",")}] ordre ${String(c.ordre).padStart(4)}  `
        + `${c.feuille.padEnd(22)} ${c.selecteur.padEnd(34)} = ${c.valeur}`);
    }
    console.log("");
  }

  await browser.close();
  serveur.close();
})();
