/* v668 — une ancre mémorise TOUT son texte, pas ses 200 premiers caractères.
   Mesure du 2026-10-28 sur le build v667 : un cadre couvrant ~400 caractères
   écrivait `ancre.end` = la couverture réelle mais `ancre.texte = 200 c.` ; au
   rechargement `_ancResolve` ne retrouvait que le préfixe, la plage relue se
   réduisait à 200 c. et le CENTRE du texte DÉRIVAIT (mesuré −77 px sur ce
   décor). Sur les cadres hauts du store réel (jusqu'à 321 px, 6-10 lignes) la
   dérive est de cet ordre : c'est la famille « le cadre glisse par rapport à
   son texte », en plus petit.
   Le banc pilote le VRAI chemin d'écriture (`__ANC.fit`) : une ancre fabriquée
   à la main passerait même sur un build cassé.
   Le décor est fait de phrases séparées (un nœud de texte par phrase) : avec UN
   seul nœud, `_ancFit` prend le nœud entier et aucun cas court ne serait
   mesurable. Aucun réseau, aucune clé. */
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = Number(process.env.PORT || 9555);
const RACINE = path.resolve(process.env.BENCH_ROOT || path.resolve(__dirname, "..", "..", ".."));
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");
const MAX = 800;   /* borne du texte mémorisé (_ANC_TEXTE_MAX) */

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
  ok("0. sondes fit/repair présentes (prémisse)", pret, pret ? "__ANC.fit" : "absent (build sans sonde)");
  if (!pret) {
    console.log("\n-- RESULTAT : " + ok_n + " OK / " + ko_n + " ECHEC --");
    await browser.close(); serveur.close();
    process.exit(1);
  }

  /* Le décor vit dans la PAGE (un evaluate ne voit pas la portée de Node). */
  await page.evaluate(() => {
    const PHRASE = "Le Seigneur est mon berger je ne manquerai de rien. ";
    window.__PHRASE = PHRASE;
    window.__DECOR = function (n) {
      const box = document.createElement("div");
      box.style.cssText = "position:relative;width:600px;margin:0;padding:0;font:16px/1.6 serif";
      for (let i = 0; i < n; i++) {
        const sp = document.createElement("span");
        sp.textContent = PHRASE;          /* un nœud de texte par phrase */
        box.appendChild(sp);
      }
      document.body.appendChild(box);
      const el = document.createElement("div");
      el.style.cssText = "position:absolute;left:0;top:0;width:200px;height:90px;border:1px solid #000";
      document.body.appendChild(el);
      return box;
    };
    /* Écrit une ancre par le VRAI chemin : _ancFit avec une position imposée
       (celle de la finalisation v657b), sur les phrases [de, a]. */
    window.__ECRIRE = function (box, de, a) {
      const P = PHRASE.length;
      const s = de * P, e = (a + 1) * P;
      const r = window.__ANC.rect(box, s, e);
      const f = { w: r ? Math.round(r.w) : 200, h: r ? Math.round(r.h) : 90 };
      const el = document.body.lastElementChild;
      window.__ANC.fit(box, f, el, { posOverride: { x: r ? r.x : 0, y: r ? r.y : 0 } });
      const full = window.__ANC.noeuds(box).map(n => n.nodeValue).join("");
      const an = f.ancre || {};
      const sol = window.__ANC.resolve(box, f);
      const vrai = window.__ANC.rect(box, s, e);
      return {
        couverts: e - s,
        memoire: (an.texte || "").length,
        start: an.start, end: an.end,
        couvertureRelue: sol ? sol.end - sol.start : 0,
        cyVrai: vrai ? vrai.y + vrai.h / 2 : null,
        /* reference = la plage REELLEMENT memorisee : `_ancFit` demarre a la
           premiere ligne qui intersecte le cadre (mesure : start 52 pour un
           cadre pose sur la ligne 3), pas au debut de la zone demandee. */
        cyMemoire: (function () {
          const st = (typeof an.start === 'number') ? an.start : s;
          const r2 = window.__ANC.rect(box, st, Math.min(st + 200, e));
          return r2 ? r2.y + r2.h / 2 : null;
        })(),
        cyRelu: sol && sol.r ? sol.r.y + sol.r.h / 2 : null,
        texteOk: typeof an.texte === "string" && an.texte === full.slice(an.start, an.start + (an.texte || "").length)
      };
    };
  });

  /* A. 7 phrases (~400 caractères) couvertes, écrites par le vrai chemin :
     la mémoire doit suivre la couverture, pas s'arrêter à 200. */
  const a = await page.evaluate(() => {
    const box = window.__DECOR(30);
    return window.__ECRIRE(box, 2, 8);
  });
  /* v672 — CONTRAT CORRIGÉ : la borne est 200, et ce n'est pas un oubli.
     Elle règle aussi la POSITION d'une figure réparée (centrée sur sa plage) :
     à 800, tous les encadrements descendaient de 141 px. Voir le banc _v672. */
  ok("A. une ancre mémorise AU PLUS 200 caractères (borne _ANC_TEXTE_MAX)",
     a.memoire === 200, "couverture écrite = " + a.couverts + " c., mémorisé = " + a.memoire + " c.");
  ok("A'. la plage relue fait 200 caractères (bornée, donc position stable)",
     a.couvertureRelue === 200, "plage relue = " + a.couvertureRelue + " c.");
  /* Le centre est comparé à celui de la plage de 200 caractères effectivement
     mémorisée — pas à celui du bloc entier, qui n'est plus la référence. */
  const derive = (a.cyMemoire !== null && a.cyRelu !== null) ? Math.round(a.cyRelu - a.cyMemoire) : NaN;
  ok("A''. le centre est celui de la plage mémorisée (|dérive| ≤ 5 px)", Math.abs(derive) <= 5,
     "dérive verticale = " + derive + " px");
  ok("A'''. le texte mémorisé est bien celui de la plage (pas un décalage)",
     a.texteOk === true, "texte = tranche exacte ? " + a.texteOk);

  /* B. BORNE : un cadre couvrant 1 500 caractères ne doit pas les mémoriser
     tous — la borne protège la taille du store. */
  const b = await page.evaluate((MAX) => {
    const box = window.__DECOR(40);
    const r = window.__ECRIRE(box, 0, 26);
    return { couverts: r.couverts, memoire: r.memoire };
  }, MAX);
  ok("B. un bloc de " + b.couverts + " caractères n'en mémorise que 200",
     b.memoire === 200 && b.couverts > 200, b.couverts + " c. couverts, mémorisé " + b.memoire + " c.");

  /* C. NON-RÉGRESSION : une ancre courte (2 phrases, 114 c.) n'est pas
     tronquée et se relit aux mêmes offsets. */
  const c = await page.evaluate(() => {
    const box = window.__DECOR(30);
    const r = window.__ECRIRE(box, 2, 3);
    return { memoire: r.memoire, start: r.start, end: r.end, P: window.__PHRASE.length,
             couverts: r.couverts, couvertureRelue: r.couvertureRelue };
  });
  /* 2 phrases, le blanc de fin étant retiré : memoire = 2P-1, plage = [2P, 2P+memoire[. */
  ok("C. ancre courte : non tronquée, offsets inchangés",
     c.start === 2 * c.P && c.memoire === 2 * c.P - 1 &&
     c.end === c.start + c.memoire && c.couvertureRelue === c.memoire,
     JSON.stringify(c));

  ok("D. aucune erreur JavaScript non gérée", erreurs.length === 0, erreurs.join(" | ") || "0");

  console.log("\n-- RESULTAT : " + ok_n + " OK / " + ko_n + " ECHEC --");
  await browser.close(); serveur.close();
  process.exit(ko_n === 0 ? 0 : 1);
})().catch(e => { console.error("EXCEPTION BANC :", e); process.exit(2); });
