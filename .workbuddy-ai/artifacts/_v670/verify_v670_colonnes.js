/* v670 — PDFCraft : ORDRE DE LECTURE. Sans ça, deux colonnes s'entrelacent :
   les lignes de même hauteur se suivent, et le texte extrait saute d'une
   colonne à l'autre à chaque ligne. C'était la limite assumée de v669.
   Ordre : colonnes d'abord (gouttière verticale franchie par aucune ligne),
   puis bandes horizontales (saut de paragraphe), puis haut→bas.
   Le banc a deux étages : items pdf.js synthétiques, et un VRAI PDF à deux
   colonnes construit dans la page avec pdf-lib puis ouvert par pdf.js.
   Aucun réseau, aucun fichier écrit. */
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = Number(process.env.PORT || 9591);
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
  ok("0. sonde __PFC.reconstruire présente (prémisse)", pret, pret ? "oui" : "absente");
  if (!pret) {
    console.log("\n-- RESULTAT : " + ok_n + " OK / " + ko_n + " ECHEC --");
    await browser.close(); serveur.close();
    process.exit(1);
  }

  /* ═══ A. UNITÉ : page à deux colonnes, titre pleine largeur ═══
     Gauche : x 50..250. Droite : x 280..480. Gouttière de 30 pt.
     Les lignes gauches et droites partagent les MÊMES y : c'est exactement ce
     qui entrelace la lecture quand rien ne découpe les colonnes. */
  const a = await page.evaluate(() => {
    const it = (s, x, y, w) => ({ str: s, transform: [10, 0, 0, 10, x, y], width: w, height: 10 });
    const items = [
      it("TITRE PLEINE LARGEUR", 50, 760, 350),
      it("G1", 50, 720, 200), it("D1", 280, 720, 200),
      it("G2", 50, 706, 200), it("D2", 280, 706, 200),
      it("G3", 50, 692, 200), it("D3", 280, 692, 200),
      it("G4", 50, 678, 200), it("D4", 280, 678, 200)
    ];
    const r = window.__PFC.reconstruire({ items: items });
    return { ordre: r.lignes.map(l => l.txt), texte: r.texte };
  });
  const ordre = a.ordre.join("|");
  ok("A. le titre vient d'abord, puis la colonne gauche ENTIÈRE, puis la droite",
     ordre === "TITRE PLEINE LARGEUR|G1|G2|G3|G4|D1|D2|D3|D4", ordre);
  ok("A'. aucune alternance gauche/droite (le défaut de v669)",
     !/G1\|D1/.test(ordre), "ordre = " + ordre);

  /* ═══ B. INTÉGRATION : vrai PDF à deux colonnes (pdf-lib -> pdf.js) ═══ */
  const b = await page.evaluate(async () => {
    const { PDFDocument, StandardFonts } = window.PDFLib;
    const doc = await PDFDocument.create();
    const f = await doc.embedFont(StandardFonts.Helvetica);
    const p = doc.addPage([595, 842]);
    p.drawText("Commentaire sur la Genese", { x: 50, y: 780, size: 12, font: f });
    const L = ["Colonne gauche, ligne une.", "Colonne gauche, ligne deux.", "Colonne gauche, ligne trois."];
    const R = ["Right column, line one.", "Right column, line two.", "Right column, line three."];
    for (let i = 0; i < 3; i++) {
      p.drawText(L[i], { x: 50, y: 740 - i * 14, size: 10, font: f });
      p.drawText(R[i], { x: 300, y: 740 - i * 14, size: 10, font: f });
    }
    const octets = await doc.save();
    const pjs = await window.__PFC.ouvrir(octets);
    if (!pjs) return { erreur: "pdf.js n'a pas ouvert le PDF" };
    const pg = await pjs.getPage(1);
    const c = await pg.getTextContent();
    const r = window.__PFC.reconstruire(c);
    return { ordre: r.lignes.map(l => l.txt), texte: r.texte };
  });
  const ob = (b.ordre || []).join("|");
  const gaucheAvantDroite = ob.indexOf("Colonne gauche, ligne trois") < ob.indexOf("Right column, line one");
  ok("B. vrai PDF deux colonnes : les trois lignes de gauche avant celles de droite",
     !b.erreur && gaucheAvantDroite && (b.ordre || []).length === 7,
     b.erreur || ob);

  /* ═══ C. NON-RÉGRESSION : une seule colonne garde l'ordre de v669 ═══ */
  const c = await page.evaluate(() => {
    const it = (s, x, y, w) => ({ str: s, transform: [10, 0, 0, 10, x, y], width: w, height: 10 });
    const items = [
      it("Premier paragraphe", 50, 700, 120), it("sur deux lignes.", 50, 686, 100),
      it("Second bloc", 50, 640, 80), it("apres un blanc.", 50, 626, 90)
    ];
    const r = window.__PFC.reconstruire({ items: items });
    return { ordre: r.lignes.map(l => l.txt), texte: r.texte, blancs: (r.texte.match(/\n\s*\n/g) || []).length };
  });
  ok("C. une colonne : ordre haut→bas, un blanc entre paragraphes",
     c.ordre.join("|") === "Premier paragraphe|sur deux lignes.|Second bloc|apres un blanc." && c.blancs === 1,
     JSON.stringify(c));

  /* ═══ D. une page SANS gouttière franche (lignes longues) ne se coupe pas ═══ */
  const d = await page.evaluate(() => {
    const it = (s, x, y, w) => ({ str: s, transform: [10, 0, 0, 10, x, y], width: w, height: 10 });
    /* lignes pleine largeur, décalées : aucune gouttière libre de 15 pt */
    const items = [
      it("une ligne tres longue qui occupe toute la largeur", 50, 700, 450),
      it("une autre ligne qui occupe elle aussi la largeur", 50, 686, 450),
      it("et une troisieme du meme genre, pleine largeur", 50, 672, 450)
    ];
    const r = window.__PFC.reconstruire({ items: items });
    return { n: r.lignes.length, ordre: r.lignes.map(l => l.txt) };
  });
  ok("D. pas de fausse colonne sur des lignes pleine largeur",
     d.n === 3 && /toute la largeur/.test(d.ordre[0]) && /pleine largeur/.test(d.ordre[2]),
     JSON.stringify(d.ordre));

  ok("E. aucune erreur JavaScript non gérée", erreurs.length === 0, erreurs.join(" | ") || "0");

  console.log("\n-- RESULTAT : " + ok_n + " OK / " + ko_n + " ECHEC --");
  await browser.close(); serveur.close();
  process.exit(ko_n === 0 ? 0 : 1);
})().catch(e => { console.error("EXCEPTION BANC :", e); process.exit(2); });
