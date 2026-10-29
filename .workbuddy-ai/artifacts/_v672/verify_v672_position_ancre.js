/* v672 — LA POSITION D'UN ENCADREMENT NE DÉPEND PAS DE LA LONGUEUR DU MESSAGE.
   Incident réel du 2026-10-29 : « les encadrements ne sont plus respectés ».
   Cause mesurée : v668 avait porté la borne du texte d'ancre de 200 à 800
   caractères pour que la plage résolue couvre tout le texte couvert. Or cette
   borne règle aussi la POSITION, parce qu'une figure réparée est CENTRÉE sur la
   plage de son ancre (`ancre.cx`) et que la plage = le texte mémorisé.
   Sur une ancre `start=0, end=message` (ce que produit `_ancFit` sur un message
   d'un seul nœud de texte) : 200 c. -> centre 51 px ; 800 c. -> centre 192 px,
   soit +141 px vers le bas pour tous les encadrements réparés.
   Le banc passe par le VRAI chemin d'écriture (`__ANC.fit`) : une ancre
   fabriquée à la main ne lirait jamais la constante de l'application, et
   passerait donc même sur un build cassé (piège rencontré deux fois). */
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = Number(process.env.PORT || 9654);
const RACINE = path.resolve(process.env.BENCH_ROOT || path.resolve(__dirname, "..", "..", ".."));
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");
const BORNE = 200;

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

  const pret = await page.waitForFunction(() => !!(window.__ANC && window.__ANC.fit), null, { timeout: 30000 })
    .then(() => true).catch(() => false);
  ok("0. sonde __ANC.fit présente (prémisse)", pret, pret ? "oui" : "absente");
  if (!pret) {
    console.log("\n-- RESULTAT : " + ok_n + " OK / " + ko_n + " ECHEC --");
    await browser.close(); serveur.close();
    process.exit(1);
  }

  await page.evaluate(() => {
    /* Écrit une ancre par le VRAI chemin, sur un message neuf (le décor est
       retiré à la fin : sinon le second message est empilé sous le premier et
       les centres ne sont plus comparables). */
    window.__POSER = function (phrases) {
      const box = document.createElement("div");
      box.style.cssText = "position:relative;width:600px;margin:0;padding:0;font:16px/1.6 serif";
      let t = "";
      for (let i = 0; i < phrases; i++) t += "Le Seigneur est mon berger je ne manquerai de rien. ";
      box.textContent = t;                       /* UN nœud de texte : le cas réel */
      document.body.appendChild(box);
      const el = document.createElement("div");
      el.style.cssText = "position:absolute;left:0;top:0;width:200px;height:90px";
      document.body.appendChild(el);
      const f = { w: 200, h: 90 };
      window.__ANC.fit(box, f, el, { posOverride: { x: 0, y: 0 } });
      const an = f.ancre || {};
      const sol = window.__ANC.resolve(box, f);
      const out = {
        message: (window.__ANC.noeuds(box).map(n => n.nodeValue).join("")).length,
        memoire: (an.texte || "").length,
        span: (typeof an.end === "number" && typeof an.start === "number") ? an.end - an.start : -1,
        plage: sol ? sol.end - sol.start : 0,
        centre: sol && sol.r ? Math.round(sol.r.y + sol.r.h / 2) : null
      };
      box.remove(); el.remove();
      return out;
    };
  });

  /* A. la mémoire est bornée à 200 — c'est la constante de l'application */
  const a = await page.evaluate(() => window.__POSER(36));
  ok("A. une ancre ancienne mémorise " + BORNE + " caractères (build v668 : 800)",
     a.memoire === BORNE, "mémorisé = " + a.memoire + " c. sur un message de " + a.message);
  ok("A'. la plage relue fait " + BORNE + " caractères",
     a.plage === BORNE, "plage = " + a.plage + " c.");

  /* B. LE CŒUR : le centre ne dépend pas de la longueur du message */
  const b = await page.evaluate(() => ({ court: window.__POSER(36), long: window.__POSER(76) }));
  const ecart = (b.court.centre !== null && b.long.centre !== null) ? b.long.centre - b.court.centre : NaN;
  ok("B. le centre est identique sur un message de 1 900 et de 4 000 caractères",
     Math.abs(ecart) <= 2,
     `${b.court.message} c. -> ${b.court.centre} px | ${b.long.message} c. -> ${b.long.centre} px | écart ${ecart} px`);

  /* C. et il retombe sur la position d'AVANT v668 : 51 px. C'est la valeur
     mesurée sur le build v667 avec la même construction. */
  ok("C. le centre retombe sur la position d'origine (51 px ± 6)",
     b.court.centre !== null && Math.abs(b.court.centre - 51) <= 6,
     "centre = " + b.court.centre + " px");

  /* D. un message plus court que la borne : la plage suit le texte réel */
  const d = await page.evaluate(() => window.__POSER(3));
  /* Le texte d'ancre est coupé à son espace de fin : 1 à 2 caractères de moins. */
  ok("D. message plus court que la borne : la plage suit le texte réel",
     d.plage < BORNE && Math.abs(d.message - d.plage) <= 2, d.plage + " c. pour " + d.message);

  ok("E. aucune erreur JavaScript non gérée", erreurs.length === 0, erreurs.join(" | ") || "0");

  console.log("\n-- RESULTAT : " + ok_n + " OK / " + ko_n + " ECHEC --");
  await browser.close(); serveur.close();
  process.exit(ko_n === 0 ? 0 : 1);
})().catch(e => { console.error("EXCEPTION BANC :", e); process.exit(2); });
