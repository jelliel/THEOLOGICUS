/* v671 — LIVROTRADO : lire un PDF avec la MÊME reconstruction que PDFCraft.
   Mesure du 2026-10-28 sur le build v670 : `lirePdf` groupait les fragments par
   ordonnée puis joignait la rangée entière — deux colonnes sur la même ligne de
   base donnaient « G1 D1 » — et devinait les paragraphes par la LONGUEUR de la
   ligne (« moins de 60 caractères = fin de paragraphe »). Un livre en deux
   colonnes ressortait donc entrelacé, et une suite de lignes courtes (dialogues,
   versets, listes) était découpée en autant de paragraphes.
   Le banc passe par le VRAI chemin : `__livro.extraire(File)`, qui dispatche
   vers `lirePdf`. Aucun réseau, aucun fichier écrit. */
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = Number(process.env.PORT || 9611);
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

  const pret = await page.waitForFunction(() => !!(window.__livro && window.PDFLib), null, { timeout: 30000 })
    .then(() => true).catch(() => false);
  ok("0. hooks présents (prémisse : __livro et PDFLib)", pret, pret ? "oui" : "absent");
  if (!pret) {
    console.log("\n-- RESULTAT : " + ok_n + " OK / " + ko_n + " ECHEC --");
    await browser.close(); serveur.close();
    process.exit(1);
  }

  /* Le décor vit dans la PAGE : il construit un PDF, l'enveloppe en File et le
     donne à LIVROTRADO par son point d'entrée public. */
  await page.evaluate(() => {
    window.__PDF = async function (dessiner) {
      const { PDFDocument, StandardFonts } = window.PDFLib;
      const doc = await PDFDocument.create();
      const f = await doc.embedFont(StandardFonts.Helvetica);
      const p = doc.addPage([595, 842]);
      dessiner(p, f);
      const octets = await doc.save();
      return new File([octets], "livre.pdf", { type: "application/pdf" });
    };
    window.__PARAS = async function (file) {
      const r = await window.__livro.extraire(file);
      const ch = (r && r.chapitres) || [];
      return ch.map(c => c.paragraphes);
    };
  });

  /* ═══ A. deux colonnes : l'ordre de lecture doit suivre les colonnes ═══ */
  const a = await page.evaluate(async () => {
    const file = await window.__PDF((p, f) => {
      p.drawText("Titre du chapitre", { x: 50, y: 780, size: 12, font: f });
      const L = ["Gauche un.", "Gauche deux.", "Gauche trois."];
      const R = ["Right one.", "Right two.", "Right three."];
      for (let i = 0; i < 3; i++) {
        p.drawText(L[i], { x: 50, y: 740 - i * 14, size: 10, font: f });
        p.drawText(R[i], { x: 300, y: 740 - i * 14, size: 10, font: f });
      }
    });
    const paras = await window.__PARAS(file);
    return { paras: paras, plat: paras.map(p => p.join(" | ")).join(" ## ") };
  });
  const toutA = (a.paras || []).map(p => p.join(" ")).join(" ");
  const iG3 = toutA.indexOf("Gauche trois");
  const iR1 = toutA.indexOf("Right one");
  ok("A. deux colonnes : les trois lignes de gauche avant celles de droite",
     iG3 >= 0 && iR1 >= 0 && iG3 < iR1, a.plat.slice(0, 150));
  ok("A'. aucune ligne ne mélange les deux colonnes",
     !/Gauche un\.\s*Right one\./.test(toutA), a.plat.slice(0, 150));

  /* ═══ B. paragraphes par l'ÉCART VERTICAL, pas par la longueur ═══
     Deux lignes courtes (moins de 60 caractères) à interligne normal forment
     UN paragraphe ; le bloc suivant, après un vrai blanc, en forme un autre.
     L'heuristique « < 60 c. = fin de paragraphe » en faisait deux. */
  const b = await page.evaluate(async () => {
    const file = await window.__PDF((p, f) => {
      p.drawText("Courte une.", { x: 50, y: 700, size: 11, font: f });
      p.drawText("Courte deux.", { x: 50, y: 686, size: 11, font: f });
      p.drawText("Bloc suivant apres un vrai blanc.", { x: 50, y: 640, size: 11, font: f });
    });
    const paras = await window.__PARAS(file);
    return { n: paras.reduce((s, p) => s + p.length, 0), paras: paras };
  });
  ok("B. deux lignes courtes = UN paragraphe, le bloc suivant = un autre (2 au total)",
     b.n === 2, b.n + " paragraphe(s) : " + JSON.stringify(b.paras));

  /* ═══ C. NON-RÉGRESSION : un livre d'une colonne garde ses paragraphes ═══ */
  const c = await page.evaluate(async () => {
    const file = await window.__PDF((p, f) => {
      p.drawText("Premier paragraphe du livre, sur une seule ligne assez longue.", { x: 50, y: 700, size: 11, font: f });
      p.drawText("Second paragraphe, separe par un blanc franc du precedent.", { x: 50, y: 640, size: 11, font: f });
    });
    const paras = await window.__PARAS(file);
    return { n: paras.reduce((s, p) => s + p.length, 0), paras: paras };
  });
  /* `paras` est un tableau de CHAPITRES, chaque chapitre un tableau de
     paragraphes : on aplatit avant d'affirmer. */
  const cp = (c.paras && c.paras[0]) || [];
  ok("C. une colonne : deux paragraphes distincts",
     c.n === 2 && cp.length === 2 && /Premier/.test(String(cp[0])) && /Second/.test(String(cp[1])),
     JSON.stringify(cp));

  ok("D. aucune erreur JavaScript non gérée", erreurs.length === 0, erreurs.join(" | ") || "0");

  console.log("\n-- RESULTAT : " + ok_n + " OK / " + ko_n + " ECHEC --");
  await browser.close(); serveur.close();
  process.exit(ko_n === 0 ? 0 : 1);
})().catch(e => { console.error("EXCEPTION BANC :", e); process.exit(2); });
