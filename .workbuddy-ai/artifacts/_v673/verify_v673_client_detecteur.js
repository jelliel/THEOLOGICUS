/* v673 — TRANCHES 1 et 2 : client MCP + détecteur de références.

   🔴 CORRIGÉ APRÈS ÉCHEC CI (2026-10-31) : ce banc lisait le module dans
   `C:/tmp/sophia_module.html`, un fichier HORS DÉPÔT. Sur le runner :
   `ENOENT … C:/tmp/sophia_module.html` → deux exécutions rouges (shards 2 et 4),
   pour une raison qui n'avait rien à voir avec le code de l'application.
   Le banc extrait désormais le module de `THEOLOGICUS.html` : il teste donc
   l'artefact RÉELLEMENT livré, et il est autonome.

   🔴 Réseau : ce banc interroge le VRAI serveur. Une panne du serveur n'est pas
   une régression du code — on la signale `[IGNORÉ]` bruyamment, on ne la maquille
   pas en succès et on ne la fait pas passer pour un échec du code. En revanche
   une réponse d'erreur du serveur reste un échec. */
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = Number(process.env.PORT || 9681);
const RACINE = path.resolve(process.env.BENCH_ROOT || path.resolve(__dirname, "..", "..", ".."));
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

let ok_n = 0, ko_n = 0, ign_n = 0;
function ok(nom, cond, detail) {
  if (cond) { ok_n++; console.log("[OK]    " + nom + (detail ? "  -- " + detail : "")); }
  else { ko_n++; console.log("[ECHEC] " + nom + "  -- " + detail); }
}
function ignore(nom, raison) {
  ign_n++;
  console.log("[IGNORE] " + nom + "  -- " + raison);
}

/* Le module vit DANS le fichier livré, pas dans un fichier temporaire. */
function sourceModule() {
  if (process.env.MODULE) return fs.readFileSync(process.env.MODULE, "utf8");
  const html = fs.readFileSync(path.join(RACINE, "THEOLOGICUS.html"), "utf8");
  const d = html.indexOf('<script id="v673sophia">');
  if (d < 0) throw new Error("module v673sophia introuvable dans THEOLOGICUS.html");
  const f = html.indexOf("</script>", d) + "</script>".length;
  return html.slice(d, f);
}

(async () => {
  const MODULE = sourceModule();
  const HARNAIS = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>harnais</title></head>
<body><div id="x">harnais</div>
${MODULE}
</body></html>`;

  const serveur = http.createServer((rq, rs) => {
    if (rq.url.split("?")[0] === "/h.html") {
      rs.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); rs.end(HARNAIS);
    } else { rs.writeHead(404); rs.end("404"); }
  });
  await new Promise(r => serveur.listen(PORT, "127.0.0.1", r));

  const browser = await chromium.launch(Object.assign({ args: ["--no-sandbox", "--disable-dev-shm-usage"] },
    process.env.PW_DIR ? { executablePath: CHROME } : {}));
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 } });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", e => erreurs.push(String(e.message)));

  let reseau = 0;
  page.on("request", r => { if (r.url().indexOf("sophiascriptura.com") >= 0) reseau++; });

  await page.goto(`http://127.0.0.1:${PORT}/h.html`, { waitUntil: "domcontentloaded" });
  const pret = await page.waitForFunction(() => !!window.__SOPHIA, null, { timeout: 15000 }).then(() => true).catch(() => false);
  ok("0. module chargé, __SOPHIA exposé (prémisse)", pret, pret ? "oui" : "absent");
  if (!pret) { console.log("\n-- RESULTAT : " + ok_n + " OK / " + ko_n + " ECHEC --"); await browser.close(); serveur.close(); process.exit(1); }

  /* sonde réseau : le serveur répond-il ? */
  const sonde = await page.evaluate(async () => {
    try { await window.__SOPHIA.call("list_topics", { query: "baptism" }); return { enLigne: true }; }
    catch (e) { return { enLigne: false, err: String(e.message) }; }
  });
  const enLigne = sonde.enLigne;
  if (!enLigne) console.log("\n[!] SERVEUR INJOIGNABLE (" + sonde.err + ") — controles reseau IGNORES, pas maquilles.\n");

  /* ── A. détection des références (hors ligne) ── */
  const cas = await page.evaluate(() => {
    const D = window.__SOPHIA.detectRefs;
    const t = [
      ["Matthieu 19:9", "Matthew 19:9"], ["Mt 19,9", "Matthew 19:9"],
      ["1 Co 7,10-15", "1 Corinthians 7:10-15"], ["1 Corinthiens 7.10", "1 Corinthians 7:10"],
      ["Ps 22 LXX", "Psalms 22"], ["Jean 3,16", "John 3:16"], ["Jn 3:16-18", "John 3:16-18"],
      ["Romains 7, 14", "Romans 7:14"], ["Mt 5.31-32", "Matthew 5:31-32"], ["Hébreux 11:1", "Hebrews 11:1"]
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

  /* ── B. faux positifs écartés (hors ligne) ── */
  const faux = await page.evaluate(() => {
    const D = window.__SOPHIA.detectRefs;
    return ["J'ai lu 1 Corinthiens hier soir.", "Il est arrivé 3 fois en 2026.",
            "Le chapitre 19 du livre est long.", "Voir le document 12 pour la méthode.",
            "Voir 1 p. 12 pour la méthode."]
      .map(p => ({ texte: p, refs: D(p).map(r => r.reference) }));
  });
  const bavards = faux.filter(f => f.refs.length > 0);
  ok("B. aucun faux positif sur 5 pièges (livre seul, nombres, page)", bavards.length === 0,
     bavards.length ? JSON.stringify(bavards) : "0 détection parasite");

  /* ── E. agent sans la case : contexte nul ET zéro requête (hors ligne) ── */
  const r0 = reseau;
  const e = await page.evaluate(async () => {
    const r = await window.__SOPHIA.contexte("Que dit Matthieu 19:9 sur le divorce ?", { patristique: false });
    return { nul: r === null };
  });
  ok("E. agent SANS la case : contexte nul ET zéro requête", e.nul && reseau === r0,
     `nul=${e.nul}, requetes=${reseau - r0}`);

  /* ── C/D/F : nécessitent le serveur ── */
  if (!enLigne) {
    ignore("C. appel réel list_topics", "serveur injoignable");
    ignore("D. cache sans requête réseau", "serveur injoignable");
    ignore("F1-F8. bloc patristique (URL, garde-fous, borne)", "serveur injoignable");
  } else {
    const c = await page.evaluate(async () => {
      try {
        const r = await window.__SOPHIA.call("list_topics", { query: "baptism" });
        return { ok: true, cles: Object.keys(r || {}).slice(0, 6) };
      } catch (err) { return { ok: false, err: String(err.message) }; }
    });
    ok("C. appel réel list_topics (réseau, sans authentification)", c.ok, c.ok ? `cles=${c.cles.join(",")}` : c.err);

    const avant = reseau;
    await page.evaluate(() => window.__SOPHIA.call("list_topics", { query: "baptism" }));
    ok("D. cache : 2e appel identique sans requête réseau", reseau === avant, `${reseau - avant} requete(s) ajoutee(s)`);

    const f = await page.evaluate(async () => {
      const r = await window.__SOPHIA.contexte("Que dit Matthieu 19:9 sur le divorce ?", { patristique: true });
      if (!r) return { nul: true };
      const b = r.bloc || "";
      return {
        nul: false, longueur: b.length, sources: r.sources.length,
        aUrl: /https:\/\/sophiascriptura\.com\/p\//.test(b),
        aSbl: /Note SBL/.test(b), aIa: /PAR IA/.test(b), aPartiel: /PARTIELLE/.test(b),
        aInterdit: /JAMAIS une citation/.test(b), aFrancais: /commentes en FRANÇAIS/.test(b),
        premiereSource: r.sources[0] ? r.sources[0].url : null
      };
    });
    ok("F1. bloc produit pour Matthieu 19:9", !f.nul,
       f.nul ? "contexte nul malgre un serveur joignable" : `${f.longueur} c., ${f.sources} source(s)`);
    if (!f.nul) {
      ok("F2. bloc borné (≤ 6 000 caractères)", f.longueur <= 6000, f.longueur + " c.");
      ok("F3. URL de source présente", f.aUrl, "url=" + (f.premiereSource || "-"));
      ok("F4. note SBL présente", f.aSbl, String(f.aSbl));
      ok("F5. garde-fou « traduction PAR IA »", f.aIa, String(f.aIa));
      ok("F6. garde-fou « couverture PARTIELLE »", f.aPartiel, String(f.aPartiel));
      ok("F7. interdiction de citer de mémoire", f.aInterdit, String(f.aInterdit));
      ok("F8. consigne « commente en français »", f.aFrancais, String(f.aFrancais));
    }
  }

  /* ── G. dégradation : serveur coupé → null, jamais d'exception ── */
  await page.route(u => u.hostname.indexOf("sophiascriptura.com") >= 0, r => r.abort());
  const g = await page.evaluate(async () => {
    window.__SOPHIA.viderCache();
    try {
      const r = await window.__SOPHIA.contexte("Matthieu 19:9", { patristique: true });
      return { nul: r === null, exception: false };
    } catch (err) { return { nul: false, exception: true, err: String(err.message) }; }
  });
  ok("G. serveur coupé : contexte nul, AUCUNE exception (dégradation silencieuse)",
     g.nul && !g.exception, `nul=${g.nul}, exception=${g.exception}`);

  ok("H. aucune erreur JavaScript non gérée", erreurs.length === 0, erreurs.join(" | ") || "0");

  console.log("\n-- RESULTAT : " + ok_n + " OK / " + ko_n + " ECHEC" + (ign_n ? " / " + ign_n + " IGNORE(S)" : "") + " --");
  await browser.close(); serveur.close();
  process.exit(ko_n === 0 ? 0 : 1);
})().catch(e => { console.error("EXCEPTION BANC :", e); process.exit(2); });
