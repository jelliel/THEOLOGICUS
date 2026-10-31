/* v673 — TRANCHES 1 et 2 : client MCP + détecteur de références.
   Vérifié contre le VRAI serveur (sophiascriptura.com), pas contre un double.
   Le banc monte une page harnais qui ne contient QUE le module : si une
   assertion passe ici, elle ne doit rien au reste de l'application. */
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = Number(process.env.PORT || 9681);
const MODULE = process.env.MODULE || "C:/tmp/sophia_module.html";
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

let ok_n = 0, ko_n = 0;
function ok(nom, cond, detail) {
  if (cond) { ok_n++; console.log("[OK]    " + nom + (detail ? "  -- " + detail : "")); }
  else { ko_n++; console.log("[ECHEC] " + nom + "  -- " + detail); }
}

const HARNAIS = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>harnais</title></head>
<body><div id="x">harnais</div>
${fs.readFileSync(MODULE, "utf8")}
</body></html>`;

(async () => {
  const serveur = http.createServer((rq, rs) => {
    if (rq.url.split("?")[0] === "/h.html") {
      rs.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); rs.end(HARNAIS);
    } else { rs.writeHead(404); rs.end("404"); }
  });
  await new Promise(r => serveur.listen(PORT, "127.0.0.1", r));

  const browser = await chromium.launch(Object.assign({ args: ["--no-sandbox"] }, { executablePath: CHROME }));
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", e => erreurs.push(String(e.message)));

  /* compteur de requêtes réseau : sert à prouver le cache et le zéro-appel */
  let reseau = 0;
  page.on("request", r => { if (r.url().indexOf("sophiascriptura.com") >= 0) reseau++; });

  await page.goto(`http://127.0.0.1:${PORT}/h.html`, { waitUntil: "domcontentloaded" });
  const pret = await page.waitForFunction(() => !!window.__SOPHIA, null, { timeout: 15000 }).then(() => true).catch(() => false);
  ok("0. module chargé, __SOPHIA exposé (prémisse)", pret, pret ? "oui" : "absent");
  if (!pret) { console.log("\n-- RESULTAT : " + ok_n + " OK / " + ko_n + " ECHEC --"); await browser.close(); serveur.close(); process.exit(1); }

  /* ── A. détection des références (formes françaises et anglaises) ── */
  const cas = await page.evaluate(() => {
    const D = window.__SOPHIA.detectRefs;
    const t = [
      ["Matthieu 19:9", "Matthew 19:9"],
      ["Mt 19,9", "Matthew 19:9"],
      ["1 Co 7,10-15", "1 Corinthians 7:10-15"],
      ["1 Corinthiens 7.10", "1 Corinthians 7:10"],
      ["Ps 22 LXX", "Psalms 22"],
      ["Jean 3,16", "John 3:16"],
      ["Jn 3:16-18", "John 3:16-18"],
      ["Romains 7, 14", "Romans 7:14"],
      ["Mt 5.31-32", "Matthew 5:31-32"],
      ["Hébreux 11:1", "Hebrews 11:1"]
    ];
    return t.map(([entree, attendu]) => {
      const r = D(entree);
      return { entree, attendu, obtenu: r.length ? r[0].reference : null };
    });
  });
  const mauvais = cas.filter(c => c.obtenu !== c.attendu);
  ok("A. 10 références reconnues (FR + EN)", mauvais.length === 0,
     mauvais.length ? mauvais.map(m => `${m.entree} -> ${m.obtenu} (attendu ${m.attendu})`).join(" ; ")
                    : cas.map(c => c.entree).join(", "));

  /* ── B. faux positifs écartés ── */
  const faux = await page.evaluate(() => {
    const D = window.__SOPHIA.detectRefs;
    const pieges = [
      "J'ai lu 1 Corinthiens hier soir.",      /* livre sans chapitre */
      "Il est arrivé 3 fois en 2026.",         /* nombres nus */
      "Le chapitre 19 du livre est long.",     /* pas de livre biblique */
      "Jean a dit 2 choses.",                  /* prénom + nombre, mais « Jean 2 » est ambigu */
      "Voir le document 12 pour la méthode."
    ];
    return pieges.map(p => ({ texte: p, refs: D(p).map(r => r.reference) }));
  });
  const bavards = faux.filter(f => f.refs.length > 0 && !/Jean a dit/.test(f.texte));
  ok("B. aucun faux positif sur 4 pièges (livre seul, nombres, « document 12 »)",
     bavards.length === 0, bavards.length ? JSON.stringify(bavards) : "0 détection parasite");

  /* ── C. appel réel au serveur ── */
  const c = await page.evaluate(async () => {
    try {
      const r = await window.__SOPHIA.call("list_topics", { query: "baptism" });
      return { ok: true, sujets: (r.topics || r.items || []).length, cles: Object.keys(r || {}).slice(0, 6) };
    } catch (e) { return { ok: false, err: String(e.message) }; }
  });
  ok("C. appel réel list_topics (réseau, sans authentification)", c.ok, c.ok ? `clés=${c.cles.join(",")}` : c.err);

  /* ── D. cache : le second appel ne repart pas sur le réseau ── */
  const avant = reseau;
  await page.evaluate(() => window.__SOPHIA.call("list_topics", { query: "baptism" }));
  const apres = reseau;
  ok("D. cache : 2e appel identique sans requête réseau", apres === avant, `${apres - avant} requête(s) ajoutée(s)`);

  /* ── E. agent sans la case : aucune requête, contexte nul ── */
  const r0 = reseau;
  const e = await page.evaluate(async () => {
    const r = await window.__SOPHIA.contexte("Que dit Matthieu 19:9 sur le divorce ?", { patristique: false });
    return { nul: r === null };
  });
  ok("E. agent SANS la case : contexte nul ET zéro requête",
     e.nul && reseau === r0, `nul=${e.nul}, requêtes=${reseau - r0}`);

  /* ── F. agent avec la case : bloc construit, borné, avec les garde-fous ── */
  const f = await page.evaluate(async () => {
    const r = await window.__SOPHIA.contexte("Que dit Matthieu 19:9 sur le divorce ?", { patristique: true });
    if (!r) return { nul: true };
    const b = r.bloc || "";
    return {
      nul: false, longueur: b.length, sources: r.sources.length,
      aUrl: /https:\/\/sophiascriptura\.com\/p\//.test(b),
      aSbl: /Note SBL/.test(b),
      aIa: /PAR IA/.test(b),
      aPartiel: /PARTIELLE/.test(b),
      aInterdit: /JAMAIS une citation/.test(b),
      aFrancais: /commentes en FRANÇAIS/.test(b),
      premiereSource: r.sources[0] ? { ref: r.sources[0].reference, url: r.sources[0].url } : null
    };
  });
  ok("F1. bloc produit pour Matthieu 19:9", !f.nul, f.nul ? "contexte nul (réseau ?)" : `${f.longueur} c., ${f.sources} source(s)`);
  if (!f.nul) {
    ok("F2. bloc borné (≤ 6 000 caractères)", f.longueur <= 6000, f.longueur + " c.");
    ok("F3. URL de source présente dans le bloc", f.aUrl, "url=" + (f.premiereSource ? f.premiereSource.url : "-"));
    ok("F4. note SBL présente", f.aSbl, String(f.aSbl));
    ok("F5. garde-fou « traduction PAR IA »", f.aIa, String(f.aIa));
    ok("F6. garde-fou « couverture PARTIELLE »", f.aPartiel, String(f.aPartiel));
    ok("F7. interdiction de citer de mémoire", f.aInterdit, String(f.aInterdit));
    ok("F8. consigne « commente en français »", f.aFrancais, String(f.aFrancais));
  }

  /* ── G. dégradation : serveur injoignable → null, jamais d'exception ── */
  /* 🔴 Un motif de type « ** » + nom de domaine + « /** » NE matche PAS le
     sous-domaine « mcp.sophiascriptura.com » (il exige le domaine nu precede
     d'une barre). Le test G passait donc sans rien couper : on filtre sur le
     nom d'hote, ce qui est explicite et verifiable. */
  await page.route(u => u.hostname.indexOf("sophiascriptura.com") >= 0, r => r.abort());
  const g = await page.evaluate(async () => {
    window.__SOPHIA.viderCache();
    try {
      const r = await window.__SOPHIA.contexte("Matthieu 19:9", { patristique: true });
      return { nul: r === null, exception: false };
    } catch (e) { return { nul: false, exception: true, err: String(e.message) }; }
  });
  ok("G. serveur injoignable : contexte nul, AUCUNE exception (dégradation silencieuse)",
     g.nul && !g.exception, `nul=${g.nul}, exception=${g.exception}`);

  ok("H. aucune erreur JavaScript non gérée", erreurs.length === 0, erreurs.join(" | ") || "0");

  console.log("\n-- RESULTAT : " + ok_n + " OK / " + ko_n + " ECHEC --");
  await browser.close(); serveur.close();
  process.exit(ko_n === 0 ? 0 : 1);
})().catch(e => { console.error("EXCEPTION BANC :", e); process.exit(2); });
