/* v667 — ancrage : l'EXACT d'abord, la clé normalisée en repli seulement.
   Pourquoi : `_ancNorm` ne garde que [a-z0-9]. « Genèse 1,1 » et « Genèse 11 »
   y deviennent le même « genese11 ». Mesuré sur le build v666 : occurrences()
   renvoyait les DEUX passages, et _ancResolve choisissait le plus proche de
   `ancre.start` — donc, l'offset ayant dérivé (famille « cadre à 333 px de son
   texte »), la figure pouvait se poser sur un AUTRE verset.
   Correctif repris de `selection_range` (deeptutor/reading/_grounding.py,
   Apache-2.0) : correspondance exacte d'abord ; normalisation seulement si
   l'exacte échoue, avec la table de correspondance vers les offsets sources.
   Aucun réseau, aucune clé : tout est mesuré dans la page. */
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = Number(process.env.PORT || 9521);
const RACINE = path.resolve(process.env.BENCH_ROOT || path.resolve(__dirname, "..", "..", ".."));
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

let ok_n = 0, ko_n = 0;
function ok(nom, cond, detail) {
  if (cond) { ok_n++; console.log("[OK]   " + nom + (detail ? "  -- " + detail : "")); }
  else { ko_n++; console.log("[ECHEC] " + nom + "  -- " + detail); }
}

(async () => {
  const serveur = http.createServer((rq, rs) => {
    let p = decodeURIComponent(rq.url.split("?")[0]);
    if (p === "/") p = "/THEOLOGICUS.html";
    const fp = path.join(RACINE, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      rs.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      fs.createReadStream(fp).pipe(rs);
    } else { rs.writeHead(404); rs.end("404"); }
  });
  await new Promise(r => serveur.listen(PORT, "127.0.0.1", r));

  const browser = await chromium.launch(Object.assign({ args: ["--no-sandbox"] },
    process.env.PW_DIR ? { executablePath: CHROME } : {}));
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", e => erreurs.push(String(e.message)));
  await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 60000 });

  const pret = await page.waitForFunction(() => !!(window.__ANC && window.__ANC.occurrences), null, { timeout: 30000 })
    .then(() => true).catch(() => false);
  ok("0. sonde d'ancrage présente (prémisse)", pret, pret ? "__ANC.occurrences" : "absent");
  if (!pret) {
    console.log("\n-- RESULTAT : " + ok_n + " OK / " + ko_n + " ECHEC --");
    await browser.close(); serveur.close();
    process.exit(1);
  }

  /* A. COLLISION : deux passages dont la clé normalisée est identique.
     « Genèse 1,1 » et « Genèse 11 » donnent tous deux « genese11 ». */
  const a = await page.evaluate(() => {
    const d = document.createElement("div");
    d.style.cssText = "position:absolute;left:0;top:0;width:600px;font:16px serif";
    d.textContent = "Debut. Genèse 1,1 au commencement. Milieu. Genèse 11 la tour. Fin.";
    document.body.appendChild(d);
    const occ = window.__ANC.occurrences(d, "Genèse 1,1");
    const full = window.__ANC.noeuds(d).map(n => n.nodeValue).join("");
    return { n: occ.length, txts: occ.map(o => full.slice(o.start, o.end)) };
  });
  ok("A. « Genèse 1,1 » ne rend QUE le passage exact (pas « Genèse 11 »)",
     a.n === 1 && a.txts[0] === "Genèse 1,1", a.n + " occurrence(s) : " + JSON.stringify(a.txts));

  /* B. RESOLUTION : l'offset mémorisé a DÉRIVÉ sur le passage colliding.
     Le texte exact doit primer sur la proximité de l'offset. */
  const b = await page.evaluate(() => {
    const d = document.createElement("div");
    d.style.cssText = "position:absolute;left:0;top:100px;width:600px;font:16px serif";
    d.textContent = "Debut. Genèse 1,1 au commencement. Milieu. Genèse 11 la tour. Fin.";
    document.body.appendChild(d);
    const full = window.__ANC.noeuds(d).map(n => n.nodeValue).join("");
    const f = { ancre: { texte: "Genèse 1,1", start: full.indexOf("Genèse 11"), end: full.indexOf("Genèse 11") + 9 } };
    const sol = window.__ANC.resolve(d, f);
    return { sol: !!sol, txt: sol ? full.slice(sol.start, sol.end) : null };
  });
  ok("B. offset dérivé sur le passage colliding : le TEXTE exact gagne",
     b.sol && b.txt === "Genèse 1,1", "résolu = " + JSON.stringify(b.txt));

  /* C. NON-REGRESSION : le repli normalisé doit survivre à l'exacte absente
     (apostrophe courbe mémorisée, apostrophe droite dans le document). */
  const c = await page.evaluate(() => {
    const d = document.createElement("div");
    d.style.cssText = "position:absolute;left:0;top:200px;width:600px;font:16px serif";
    d.textContent = "L'Eternel parla encore, et dit : je suis le premier.";
    document.body.appendChild(d);
    const occ = window.__ANC.occurrences(d, "l’Éternel");
    const full = window.__ANC.noeuds(d).map(n => n.nodeValue).join("");
    return { n: occ.length, txt: occ.length ? full.slice(occ[0].start, occ[0].end) : null };
  });
  /* Le REPLI rend lui aussi des offsets de SOURCE : la ponctuation absente de
     la clé (« ' ») doit être dans la tranche rendue, sinon la table de
     correspondance a été oubliée. */
  ok("C. apostrophe courbe : repli normalisé, offsets de source (ponctuation rendue)",
     c.n >= 1 && c.txt === "L'Eternel", "n=" + c.n + " texte=" + JSON.stringify(c.txt));

  /* D. NON-REGRESSION : tiret variant (U+2011) et espace insécable. */
  const d = await page.evaluate(() => {
    const box = document.createElement("div");
    box.style.cssText = "position:absolute;left:0;top:300px;width:600px;font:16px serif";
    box.textContent = "un bien-heureux jour vint";
    document.body.appendChild(box);
    const occ = window.__ANC.occurrences(box, "bien\u2011heureux\u00a0jour");
    const full = window.__ANC.noeuds(box).map(n => n.nodeValue).join("");
    return { n: occ.length, txt: occ.length ? full.slice(occ[0].start, occ[0].end) : null };
  });
  ok("D. tiret variant + espace insécable : toujours retrouvé",
     d.n >= 1 && /heureux/.test(String(d.txt)), "n=" + d.n + " texte=" + JSON.stringify(d.txt));

  /* E. LES OFFSETS SONT CEUX DE LA SOURCE : `full.slice(start, end)` doit
     rendre le passage, y compris sa ponctuation (mutant « map oubliée »). */
  const e = await page.evaluate(() => {
    const box = document.createElement("div");
    box.style.cssText = "position:absolute;left:0;top:400px;width:600px;font:16px serif";
    box.textContent = "Debut. Genèse 1,1 au commencement. Milieu. Genèse 11 la tour. Fin.";
    document.body.appendChild(box);
    const full = window.__ANC.noeuds(box).map(n => n.nodeValue).join("");
    const occ = window.__ANC.occurrences(box, "Genèse 1,1");
    const sol = window.__ANC.resolve(box, { ancre: { texte: "Genèse 1,1", start: 0, end: 1 } });
    return { slice: occ.length ? full.slice(occ[0].start, occ[0].end) : null,
             sliceSol: sol ? full.slice(sol.start, sol.end) : null };
  });
  ok("E. offsets rendus dans l'espace source (ponctuation conservée)",
     e.slice === "Genèse 1,1" && e.sliceSol === "Genèse 1,1",
     "occ=" + JSON.stringify(e.slice) + " resolve=" + JSON.stringify(e.sliceSol));

  /* F. répétitions : deux occurrences IDENTIQUES restent deux occurrences
     (l'exacte ne doit pas écraser les doublons). */
  const g = await page.evaluate(() => {
    const box = document.createElement("div");
    box.style.cssText = "position:absolute;left:0;top:500px;width:600px;font:16px serif";
    box.textContent = "Amen. Amen. Fin.";
    document.body.appendChild(box);
    return { n: window.__ANC.occurrences(box, "Amen").length };
  });
  ok("F. deux occurrences identiques restent deux", g.n === 2, "n=" + g.n);

  /* G. absence : aucun résultat, et AUCUNE exception. */
  const h = await page.evaluate(() => {
    const box = document.createElement("div");
    box.style.cssText = "position:absolute;left:0;top:600px;width:600px;font:16px serif";
    box.textContent = "tout autre chose";
    document.body.appendChild(box);
    const occ = window.__ANC.occurrences(box, "introuvable");
    const sol = window.__ANC.resolve(box, { ancre: { texte: "introuvable", start: 0, end: 1 } });
    return { n: occ.length, sol: sol };
  });
  ok("G. texte absent : aucune occurrence, résolution nulle, sans exception",
     h.n === 0 && h.sol === null, "n=" + h.n + " sol=" + JSON.stringify(h.sol));

  ok("H. aucune erreur JavaScript non gérée", erreurs.length === 0, erreurs.join(" | ") || "0");

  console.log("\n-- RESULTAT : " + ok_n + " OK / " + ko_n + " ECHEC --");
  await browser.close(); serveur.close();
  process.exit(ko_n === 0 ? 0 : 1);
})().catch(e => { console.error("EXCEPTION BANC :", e); process.exit(2); });
