/* v674 — DEUTÉROCANONIQUES.
   Fait mesuré le 2026-10-31 sur le serveur réel :
     · `lookup_scripture("Tobit 6:17")` est REJETÉ par son analyseur de références
       (« Could not read … as a Bible reference ») ;
     · « Daniel 13 », « Esther 14 », « Psalm 151 » sont acceptés mais renvoient 0 ;
     · en revanche `search_text` trouve le TEXTE : Tobit 65, Judith 49, Baruch 206.
   Donc l'index verset par verset ne couvre pas ces livres, mais les Pères en
   parlent. Le module bascule sur la recherche plein texte ET le dit au modèle.

   Ce banc vérifie trois choses distinctes :
     1. la détection (formes françaises et anglaises, marquage `deutero`) ;
     2. la ROUTE réellement empruntée (search_text, jamais lookup_scripture) ;
     3. ce que le bloc AFFIRME — c'est le point critique : il ne doit jamais
        laisser croire que les passages trouvés sont des citations du verset. */
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = Number(process.env.PORT || 9721);
const MODULE = process.env.MODULE || "C:/tmp/sophia_module.html";
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

let ok_n = 0, ko_n = 0;
function ok(nom, cond, detail) {
  if (cond) { ok_n++; console.log("[OK]    " + nom + (detail ? "  -- " + detail : "")); }
  else { ko_n++; console.log("[ECHEC] " + nom + "  -- " + detail); }
}

const HARNAIS = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>h</title></head>
<body><div id="input-area"></div>
${fs.readFileSync(MODULE, "utf8")}
</body></html>`;

(async () => {
  const serveur = http.createServer((rq, rs) => {
    if (rq.url.split("?")[0] === "/h.html") { rs.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); rs.end(HARNAIS); }
    else { rs.writeHead(404); rs.end("404"); }
  });
  await new Promise(r => serveur.listen(PORT, "127.0.0.1", r));

  const browser = await chromium.launch({ executablePath: CHROME, args: ["--no-sandbox"] });
  const page = await (await browser.newContext({ viewport: { width: 1000, height: 800 } })).newPage();
  const erreurs = [];
  page.on("pageerror", e => erreurs.push(String(e.message)));
  await page.goto(`http://127.0.0.1:${PORT}/h.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__SOPHIA, null, { timeout: 15000 });

  /* espion sur fetch : on enregistre le NOM de l'outil MCP réellement appelé */
  await page.evaluate(() => {
    window.__outils = [];
    const orig = window.fetch;
    window.fetch = function (u, o) {
      try {
        const b = JSON.parse((o && o.body) || "{}");
        if (b && b.params && b.params.name) window.__outils.push(b.params.name);
      } catch (e) {}
      return orig.apply(this, arguments);
    };
  });

  /* ── A. détection des deutérocanoniques, FR et EN ── */
  const cas = await page.evaluate(() => {
    const D = window.__SOPHIA.detectRefs;
    const t = [
      ["Tobie 6,17", "Tobit 6:17"], ["Tb 6:17", "Tobit 6:17"], ["Tobit 6:17", "Tobit 6:17"],
      ["Judith 8,1", "Judith 8:1"], ["Jdt 8,1", "Judith 8:1"],
      ["Sagesse 2,12", "Wisdom 2:12"], ["Sg 2,12", "Wisdom 2:12"], ["Wisdom 2:12", "Wisdom 2:12"],
      ["Siracide 2,1", "Sirach 2:1"], ["Si 2,1", "Sirach 2:1"], ["Ecclésiastique 2,1", "Sirach 2:1"],
      ["Baruch 3,38", "Baruch 3:38"], ["Ba 3,38", "Baruch 3:38"],
      ["1 Maccabées 2,52", "1 Maccabees 2:52"], ["1 M 2,52", "1 Maccabees 2:52"],
      ["2 Maccabées 7,1", "2 Maccabees 7:1"],
      ["Suzanne 1,1", "Susanna 1:1"], ["Daniel 13,1", "Daniel 13:1"],
      ["Psaume 151", "Psalms 151"], ["Psaume 22", "Psalms 22"]
    ];
    return t.map(([e, att]) => {
      const r = D(e)[0];
      return { e, att, ref: r ? r.reference : null, deut: r ? !!r.deutero : null };
    });
  });
  const fautifs = cas.filter(c => c.ref !== c.att);
  ok("A. 20 formes deutérocanoniques reconnues (FR + EN)", fautifs.length === 0,
     fautifs.length ? fautifs.map(f => `${f.e} -> ${f.ref} (attendu ${f.att})`).join(" ; ")
                    : cas.map(c => c.e).join(", "));

  /* ── B. le marquage `deutero` est correct dans les deux sens ── */
  const marq = await page.evaluate(() => {
    const D = window.__SOPHIA.detectRefs;
    const g = (x) => { const r = D(x)[0]; return r ? { ref: r.reference, deut: !!r.deutero } : null; };
    return {
      deutero: ["Tobie 6,17", "Siracide 2,1", "1 Maccabées 2,52", "Psaume 151"].map(g),
      proto: ["Matthieu 19,9", "Jean 3,16", "Psaume 22", "Romains 7,14"].map(g)
    };
  });
  ok("B1. les deutérocanoniques sont marqués `deutero`",
     marq.deutero.every(x => x && x.deut === true),
     JSON.stringify(marq.deutero));
  ok("B2. les protocanoniques ne sont PAS marqués (pas de faux positif)",
     marq.proto.every(x => x && x.deut === false),
     JSON.stringify(marq.proto));

  /* ── B3. le piège de la page : « 1 p. 12 » ne doit PAS devenir 1 Pierre ── */
  const pieges = await page.evaluate(() => {
    const D = window.__SOPHIA.detectRefs;
    return {
      page: D("Voir 1 p. 12 pour la méthode.").map(r => r.reference),
      metres: D("Un mur de 2 m. de haut.").map(r => r.reference),
      pierre: D("1 P 2,9 est cité par Pierre.").map(r => r.reference)
    };
  });
  ok("B3a. « 1 p. 12 » (page) n'est PAS une référence biblique",
     pieges.page.length === 0, JSON.stringify(pieges.page));
  ok("B3b. « 2 m. de haut » (mètres) n'est PAS une référence biblique",
     pieges.metres.length === 0, JSON.stringify(pieges.metres));
  ok("B3c. mais « 1 P 2,9 » (sans point) est bien reconnu",
     pieges.pierre[0] === "1 Peter 2:9", JSON.stringify(pieges.pierre));

  /* ── C. route réellement empruntée pour un deutérocanonique ── */
  await page.evaluate(() => window.__SOPHIA.viderCache());
  await page.evaluate(() => { window.__outils.length = 0; });
  const c = await page.evaluate(async () => {
    const r = await window.__SOPHIA.contexte("Que dit Tobie 6,17 sur le mariage ?", { patristique: true });
    return r ? { bloc: r.bloc, sources: r.sources.length, outils: window.__outils.slice() } : null;
  });
  ok("C1. contexte produit pour Tobie 6,17", !!c, c ? `${c.sources} source(s)` : "nul (réseau ?)");
  ok("C2. la route est search_text, JAMAIS lookup_scripture",
     !!c && c.outils.indexOf("search_text") >= 0 && c.outils.indexOf("lookup_scripture") < 0,
     c ? "outils appelés : " + c.outils.join(", ") : "-");
  if (c) {
    ok("C3. le bloc annonce l'absence d'index verset par verset",
       /INDEX VERSET PAR VERSET NON DISPONIBLE/.test(c.bloc), String(/INDEX VERSET PAR VERSET NON DISPONIBLE/.test(c.bloc)));
    ok("C4. le bloc interdit de présenter les passages comme des citations du verset",
       /ne pas les présenter comme telles/i.test(c.bloc), String(/ne pas les présenter comme telles/i.test(c.bloc)));
    ok("C5. la consigne 4b est présente dans les règles",
       /4b\./.test(c.bloc), String(/4b\./.test(c.bloc)));
    ok("C6. les extraits portent bien une URL",
       /https:\/\/sophiascriptura\.com\/p\//.test(c.bloc), String(/sophiascriptura\.com\/p\//.test(c.bloc)));
    ok("C7. le bloc reste borné (≤ 6 000 c.)", c.bloc.length <= 6000, c.bloc.length + " c.");
  }

  /* ── D. un protocanonique garde la route lookup_scripture ── */
  await page.evaluate(() => { window.__outils.length = 0; });
  const d = await page.evaluate(async () => {
    const r = await window.__SOPHIA.contexte("Que dit Matthieu 19,9 ?", { patristique: true });
    return r ? { outils: window.__outils.slice(), bloc: r.bloc } : null;
  });
  ok("D. un protocanonique passe toujours par lookup_scripture",
     !!d && d.outils.indexOf("lookup_scripture") >= 0,
     d ? "outils : " + d.outils.join(", ") : "-");
  /* 🔴 La regle 4b cite « INDEX VERSET PAR VERSET NON DISPONIBLE » dans TOUS les
     blocs : chercher cette chaine ne prouve rien. On vise l'EN-TETE du passage. */
  ok("D2. et son bloc ne porte PAS l'en-tête « index manquant »",
     !!d && !/──\s*Matthew 19:9\s*—\s*INDEX VERSET PAR VERSET/.test(d.bloc),
     d ? String(!/──\s*Matthew 19:9\s*—\s*INDEX VERSET/.test(d.bloc)) : "-");

  ok("E. aucune erreur JavaScript non gérée", erreurs.length === 0, erreurs.slice(0, 3).join(" | ") || "0");

  console.log("\n-- RESULTAT : " + ok_n + " OK / " + ko_n + " ECHEC --");
  await browser.close(); serveur.close();
  process.exit(ko_n === 0 ? 0 : 1);
})().catch(e => { console.error("EXCEPTION BANC :", e); process.exit(2); });
