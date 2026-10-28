/* v669 — PDFCraft : extraire des LIGNES et des PARAGRAPHES, pas une ligne plate.
   Mesure du 2026-10-28 sur le build v668 : `extraireTexte` faisait
   `items.map(it => it.str).join(' ')` — une page entière devenait UNE ligne,
   sans saut de ligne, sans paragraphe, sans coordonnée. Inutilisable pour
   citer, ancrer ou étudier.
   Le banc a deux étages :
     · unité  — `reconstruire(items)` sur des items pdf.js synthétiques ;
     · intégration — un VRAI PDF construit dans la page avec pdf-lib, ouvert par
       le chemin pdf.js de l'application, puis extrait.
   L'étage d'intégration est celui qui attrape le défaut : un banc d'unité seul
   passerait sur un build qui n'appelle jamais `reconstruire`.
   Aucun réseau, aucun fichier écrit sur le disque. */
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = Number(process.env.PORT || 9571);
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

  const pret = await page.waitForFunction(
    () => !!(window.__PFC && typeof window.__PFC.reconstruire === "function"), null, { timeout: 30000 })
    .then(() => true).catch(() => false);
  ok("0. sonde __PFC.reconstruire présente (prémisse)", pret, pret ? "oui" : "absente (build sans extraction structurée)");
  if (!pret) {
    console.log("\n-- RESULTAT : " + ok_n + " OK / " + ko_n + " ECHEC --");
    await browser.close(); serveur.close();
    process.exit(1);
  }

  /* ═══ A. UNITÉ : items pdf.js synthétiques ═══
     Deux paragraphes de deux lignes. La ligne 1 et 2 sont à 15 pt d'écart,
     le paragraphe suivant à 45 pt : un blanc doit apparaître entre les deux. */
  const a = await page.evaluate(() => {
    const items = [
      { str: "Premier", transform: [10, 0, 0, 10, 50, 700], width: 42, height: 10 },
      { str: "paragraphe", transform: [10, 0, 0, 10, 96, 700], width: 58, height: 10 },
      { str: "sur", transform: [10, 0, 0, 10, 158, 700], width: 18, height: 10 },
      { str: "deux", transform: [10, 0, 0, 10, 180, 700], width: 24, height: 10 },
      { str: "lignes.", transform: [10, 0, 0, 10, 208, 700], width: 32, height: 10 },
      { str: "Second", transform: [10, 0, 0, 10, 50, 685], width: 40, height: 10 },
      { str: "bloc", transform: [10, 0, 0, 10, 94, 685], width: 24, height: 10 },
      { str: "séparé.", transform: [10, 0, 0, 10, 122, 685], width: 40, height: 10 },
      { str: "Troisième", transform: [10, 0, 0, 10, 50, 640], width: 52, height: 10 },
      { str: "bloc.", transform: [10, 0, 0, 10, 106, 640], width: 28, height: 10 }
    ];
    const r = window.__PFC.reconstruire({ items: items });
    return {
      lignes: r.lignes.length,
      texte: r.texte,
      blancs: (r.texte.match(/\n\s*\n/g) || []).length,
      premiere: r.lignes[0] && r.lignes[0].txt,
      boite: r.lignes[0] && { x: r.lignes[0].x, y: r.lignes[0].y, w: r.lignes[0].w, h: r.lignes[0].h },
      ordre: r.lignes.map(l => l.y)
    };
  });
  ok("A. trois lignes reconstruites (le build v668 en faisait une seule)",
     a.lignes === 3, a.lignes + " ligne(s)");
  ok("A'. une ligne = ses items joints, espaces compris",
     a.premiere === "Premier paragraphe sur deux lignes.", JSON.stringify(a.premiere));
  ok("A''. un blanc sépare les paragraphes (1 blanc attendu)", a.blancs === 1,
     a.blancs + " blanc(s) — texte = " + JSON.stringify(a.texte));
  ok("A'''. chaque ligne porte sa boîte (x, y, w, h)",
     !!(a.boite && a.boite.w > 100 && a.boite.h === 10 && a.boite.y === 700),
     JSON.stringify(a.boite));
  ok("A'''': lecture de haut en bas (y décroissant)",
     a.ordre.length === 3 && a.ordre[0] === 700 && a.ordre[2] === 640, JSON.stringify(a.ordre));

  /* ═══ B. INTÉGRATION : vrai PDF (pdf-lib) -> pdf.js -> extraction ═══
     Deux paragraphes de deux lignes, positions connues. */
  const b = await page.evaluate(async () => {
    const { PDFDocument, StandardFonts } = window.PDFLib;
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const p = doc.addPage([595, 842]);
    p.drawText("Au commencement, Dieu crea les cieux et la terre.", { x: 50, y: 700, size: 11, font });
    p.drawText("La terre etait informe et vide.", { x: 50, y: 686, size: 11, font });
    p.drawText("Dieu dit : que la lumiere soit, et la lumiere fut.", { x: 50, y: 640, size: 11, font });
    p.drawText("Dieu vit que la lumiere etait bonne.", { x: 50, y: 626, size: 11, font });
    const octets = await doc.save();
    const pjs = await window.__PFC.ouvrir(octets);
    if (!pjs) return { erreur: "pdf.js n'a pas ouvert le PDF" };
    const pg = await pjs.getPage(1);
    const c = await pg.getTextContent();
    const r = window.__PFC.reconstruire(c);
    return { items: c.items.length, lignes: r.lignes.length, blancs: (r.texte.match(/\n\s*\n/g) || []).length,
             texte: r.texte, plat: c.items.map(it => it.str).join(" ") };
  });
  ok("B. un vrai PDF de 4 lignes rend ≥ 4 lignes (pas une ligne plate)",
     !b.erreur && b.lignes >= 4, b.erreur || (b.lignes + " ligne(s) pour " + b.items + " items"));
  ok("B'. le paragraphe est préservé (un blanc entre les deux blocs)",
     !b.erreur && b.blancs === 1, (b.blancs || 0) + " blanc(s)");
  ok("B''. la sortie n'est plus la concaténation plate",
     !b.erreur && b.texte !== b.plat && b.texte.indexOf("\n") >= 0,
     "plat = " + JSON.stringify(String(b.plat).slice(0, 70)));

  /* ═══ C. NON-RÉGRESSION : une seule ligne ne produit ni ligne vide ni blanc ═══ */
  const c = await page.evaluate(() => {
    const items = [{ str: "Une seule ligne.", transform: [10, 0, 0, 10, 50, 500], width: 90, height: 10 }];
    const r = window.__PFC.reconstruire({ items: items });
    return { lignes: r.lignes.length, texte: r.texte, blancs: (r.texte.match(/\n\s*\n/g) || []).length };
  });
  ok("C. une ligne unique : 1 ligne, 0 blanc, pas de saut parasite",
     c.lignes === 1 && c.blancs === 0 && c.texte === "Une seule ligne.", JSON.stringify(c));

  /* ═══ D. entrée vide / aberrante : pas d'exception ═══ */
  const d = await page.evaluate(() => {
    const out = [];
    try { out.push(window.__PFC.reconstruire({ items: [] }).texte); } catch (e) { out.push("EX:" + e.message); }
    try { out.push(window.__PFC.reconstruire(null).texte); } catch (e) { out.push("EX:" + e.message); }
    try { out.push(window.__PFC.reconstruire({ items: [{ str: "", transform: [1, 0, 0, 1, 0, 0] }] }).texte); }
    catch (e) { out.push("EX:" + e.message); }
    return out;
  });
  ok("D. entrées vides : chaîne vide, aucune exception",
     d.every(x => x === ""), JSON.stringify(d));

  ok("E. aucune erreur JavaScript non gérée", erreurs.length === 0, erreurs.join(" | ") || "0");

  console.log("\n-- RESULTAT : " + ok_n + " OK / " + ko_n + " ECHEC --");
  await browser.close(); serveur.close();
  process.exit(ko_n === 0 ? 0 : 1);
})().catch(e => { console.error("EXCEPTION BANC :", e); process.exit(2); });
