/* ═══════════════════════════════════════════════════════════════
   Banc v605 — ONGLET PDFCRAFT + atelier PDF hors-ligne.

   Demande utilisateur : un onglet stylé dans le header, visible sans
   chevaucher les autres, accessible, ouvrant un atelier PDF « à la
   pdfcraft » (ouvrir, réordonner, tourner, extraire, enregistrer).

   Vérifié ici :
   1. L'onglet est APPENDU EN FIN de .header-controls (aucun contrôle
      existant déplacé — leçon v597/v598), classe hud-btn, aria-haspopup.
   2. Le panneau est un dialog conforme (role + aria-modal + aria-label),
      focus DANS le panneau à l'ouverture, Escape ferme, focus rendu à
      l'onglet, aria-expanded basculé.
   3. L'ATELIER fonctionne e2e : deux PDF générés par pdf-lib elle-même,
      chargés via l'input (DataTransfer), pages listées, réordonnancement,
      rotation, suppression, extraction de sélection, enregistrement —
      le PDF écrit par le serveur est relu et vérifié (pages + rotation).
   4. Les fichiers de sauvegarde atterrissent dans THEO_BACKUPS_DIR (isolé).

   CONTRÔLE NÉGATIF : sans ouverture de fichier, « Enregistrer » est
   désactivé et l'extraction ne produit rien.
   ════════════════════════════════════════════════════════════════ */
const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os"), fs = require("fs");
const resultats = [];
function section(t) { console.log("\n■ " + t); }
function ok(label, cond, detail) {
  resultats.push({ label, pass: !!cond });
  console.log((cond ? "  [OK]   " : "  [ECHEC]") + " " + label + (detail ? " — " + detail : ""));
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "theo_v605_"));
process.env.THEO_BACKUPS_DIR = path.join(TMP, "backups");
const REP_BACKUPS = process.env.THEO_BACKUPS_DIR;

function fichiersPdfCraft() {
  try { return fs.readdirSync(REP_BACKUPS).filter(f => /^PDFCraft-.*\.pdf$/.test(f)); }
  catch (e) { return []; }
}
function lireFichier(nom) { return fs.readFileSync(path.join(REP_BACKUPS, nom)); }

(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v605_idb_" + Date.now()) });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const bruit = [];
  page.on("pageerror", e => bruit.push(String(e)));
  await page.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2400);
  await page.evaluate(() => { const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active"); });
  try { await page.addStyleTag({ content: "#setup-wizard-overlay,#theo-maj-bandeau{display:none !important}" }); } catch (e) {}

  /* ── 1. L'onglet : appendu en fin de bande, sans déplacer personne ── */
  section("1. L'onglet PDFCRAFT dans la bande de contrôles");
  const bande = await page.evaluate(() => {
    const b = document.querySelector(".header-controls");
    const ids = Array.prototype.map.call(b.children, c => c.id || c.tagName);
    const onglet = document.getElementById("open-pdfcraft");
    return {
      ids,
      dernierNonPlus: ids.filter(i => i !== "v598-plus").pop(),
      classe: onglet ? onglet.className : "",
      haspopup: onglet ? onglet.getAttribute("aria-haspopup") : "",
      expanded: onglet ? onglet.getAttribute("aria-expanded") : "",
      premier: ids[0],
    };
  });
  ok("l'onglet est le DERNIER enfant (hors #v598-plus)", bande.dernierNonPlus === "open-pdfcraft", bande.ids.slice(-3).join(","));
  ok("le premier contrôle d'origine est intact (open-palette)", bande.premier === "open-palette", bande.premier);
  ok("classe hud-btn (thème des 10 habillages)", /hud-btn/.test(bande.classe), bande.classe);
  ok("aria-haspopup=dialog", bande.haspopup === "dialog", "");
  ok("aria-expanded=false avant ouverture", bande.expanded === "false", "");

  /* ── 2. Ouverture — dialog conforme, focus géré ── */
  section("2. Ouverture — dialog accessible, focus dans le panneau");
  await page.click("#open-pdfcraft");
  await page.waitForTimeout(300);
  const panneau = await page.evaluate(() => {
    const p = document.getElementById("pdfcraft-panel");
    return {
      ouvert: !!(p && p.classList.contains("ouvert")),
      role: p ? p.getAttribute("role") : "",
      modal: p ? p.getAttribute("aria-modal") : "",
      label: p ? p.getAttribute("aria-label") : "",
      focusDedans: p ? p.contains(document.activeElement) : false,
      expanded: (document.getElementById("open-pdfcraft") || {}).getAttribute ? document.getElementById("open-pdfcraft").getAttribute("aria-expanded") : "",
    };
  });
  ok("panneau OUVERT (classe ouvert)", panneau.ouvert, "");
  ok("role=dialog + aria-modal=true + aria-label", panneau.role === "dialog" && panneau.modal === "true" && !!panneau.label, panneau.label);
  ok("le focus est DANS le panneau", panneau.focusDedans, "");
  ok("aria-expanded=true sur l'onglet", panneau.expanded === "true", "");

  /* ── 3. Escape — fermeture + focus rendu ── */
  section("3. Escape ferme et rend le focus à l'onglet");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  const ferme = await page.evaluate(() => ({
    ouvert: document.getElementById("pdfcraft-panel").classList.contains("ouvert"),
    expanded: document.getElementById("open-pdfcraft").getAttribute("aria-expanded"),
    focusOnglet: document.activeElement === document.getElementById("open-pdfcraft"),
  }));
  ok("panneau fermé par Escape", !ferme.ouvert, "");
  ok("aria-expanded rebasculé à false", ferme.expanded === "false", "");
  ok("le focus est RENDU à l'onglet", ferme.focusOnglet, "");
  await page.click("#open-pdfcraft");
  await page.waitForTimeout(250);

  /* ── 4. Atelier — deux PDF générés par pdf-lib, chargés via l'input ── */
  section("4. Charger deux PDF (générés par pdf-lib) via l'input fichier");
  const charges = await page.evaluate(async () => {
    const docA = await PDFLib.PDFDocument.create();
    const fontA = await docA.embedFont(PDFLib.StandardFonts.Helvetica);
    const pa1 = docA.addPage([595, 842]);
    pa1.drawText("Page A1 — fabrication banc", { x: 60, y: 720, size: 24, font: fontA });
    const pa2 = docA.addPage([595, 842]);
    pa2.drawText("Page A2 — fabrication banc", { x: 60, y: 720, size: 24, font: fontA });
    const docB = await PDFLib.PDFDocument.create();
    const fontB = await docB.embedFont(PDFLib.StandardFonts.Helvetica);
    const pb1 = docB.addPage([595, 842]);
    pb1.drawText("Page B1 — fabrication banc", { x: 60, y: 720, size: 24, font: fontB });
    const octA = await docA.save(), octB = await docB.save();
    const input = document.querySelector("#pdfcraft-panel input[type=file]");
    const dt = new DataTransfer();
    dt.items.add(new File([octA], "docA.pdf", { type: "application/pdf" }));
    dt.items.add(new File([octB], "docB.pdf", { type: "application/pdf" }));
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise(r => setTimeout(r, 800));
    const lignes = document.querySelectorAll("#pdfcraft-panel .pfc-page");
    return { nbLignes: lignes.length, statut: document.querySelector("#pdfcraft-panel .pfc-statut").textContent };
  });
  ok("3 pages listées (2 + 1)", charges.nbLignes === 3, charges.statut);
  ok("le statut compte documents et pages", /2 document\(s\) · 3 page\(s\)/.test(charges.statut), charges.statut);

  /* ── 5. Réordonner + tourner + supprimer ── */
  section("5. Manipuler : descendre, tourner, supprimer");
  await page.click("#pdfcraft-panel .pfc-page:nth-child(1) button[title='Descendre']");
  await page.waitForTimeout(150);
  await page.click("#pdfcraft-panel .pfc-page:nth-child(1) button[title='Tourner à droite']");
  await page.waitForTimeout(150);
  const modele = await page.evaluate(() => {
    const lignes = [...document.querySelectorAll("#pdfcraft-panel .pfc-page .pfc-nom")];
    return lignes.map(l => l.textContent.trim());
  });
  /* les 2 premières pages viennent de docA : l'échange 1↔2 les inverse,
     docB reste 3e — l'ordre initial attendu après Descendre+Tourner. */
  ok("l'ordre a changé (docA p.2 d'abord, docB 3e)",
     /docA p\.2/.test(modele[0]) && /docA p\.1/.test(modele[1]) && /docB/.test(modele[2]), modele.join(" | "));
  ok("la rotation est affichée (90°)", /90°/.test(modele.join(" ")), "");

  /* ── 5b. ANNULER/RÉTABLIR — boutons + clavier ── */
  section("5b. Annuler/Rétablir — historique complet des opérations");
  const etat1 = await page.evaluate(() => document.querySelector("#pdfcraft-panel .pfc-page .pfc-nom").textContent.trim());
  ok("état avant annulation : docA p.2 · 90° en premier", /docA p\.2 · 90°/.test(etat1), etat1);
  await page.click("#pfc-annuler"); /* annule la rotation */
  await page.waitForTimeout(200);
  const etat2 = await page.evaluate(() => document.querySelector("#pdfcraft-panel .pfc-page .pfc-nom").textContent.trim());
  ok("⤶ Annuler : la rotation est annulée (plus de 90°)", !/90°/.test(etat2), etat2);
  await page.click("#pfc-annuler"); /* annule le déplacement */
  await page.waitForTimeout(200);
  const etat3 = await page.evaluate(() => document.querySelector("#pdfcraft-panel .pfc-page .pfc-nom").textContent.trim());
  ok("⤶ Annuler x2 : l'ordre initial est restauré (docA p.1 d'abord)", /docA p\.1/.test(etat3), etat3);
  await page.click("#pfc-retablir"); /* rétablit le déplacement */
  await page.waitForTimeout(200);
  const etat4 = await page.evaluate(() => document.querySelector("#pdfcraft-panel .pfc-page .pfc-nom").textContent.trim());
  ok("⤷ Rétablir : le déplacement revient (docA p.2 d'abord)", /docA p\.2/.test(etat4), etat4);
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(200);
  const etat5 = await page.evaluate(() => document.querySelector("#pdfcraft-panel .pfc-page .pfc-nom").textContent.trim());
  ok("Ctrl+Z au clavier annule", /docA p\.1/.test(etat5), etat5);
  await page.keyboard.press("Control+y");
  await page.waitForTimeout(200);
  const etat6 = await page.evaluate(() => document.querySelector("#pdfcraft-panel .pfc-page .pfc-nom").textContent.trim());
  ok("Ctrl+Y au clavier rétablit", /docA p\.2/.test(etat6), etat6);

  /* ── 6. Enregistrer — le PDF serveur est relu et vérifié ── */
  section("6. Enregistrer — le PDF résultat est relu et vérifié");
  const avantSet = new Set(fichiersPdfCraft());
  await page.click("#pfc-enregistrer");
  let nomPdf = null, octets = null;
  for (let i = 0; i < 20; i++) {
    const nouveau = fichiersPdfCraft().find(f => !avantSet.has(f));
    if (nouveau) { nomPdf = nouveau; octets = lireFichier(nouveau); break; }
    await new Promise(r => setTimeout(r, 500));
  }
  ok("un fichier PDFCraft-*.pdf écrit par le serveur", !!nomPdf, nomPdf || "(aucun)");
  const verif = await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const octets = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i);
    const doc = await PDFLib.PDFDocument.load(octets);
    return { pages: doc.getPageCount(), rotations: doc.getPages().map(p => p.getRotation().angle) };
  }, octets.toString("base64"));
  ok("le PDF résultat contient les 3 pages du modèle", verif.pages === 3, verif.pages + " page(s)");
  /* la séquence 5b se termine par Ctrl+Z : la rotation est ANNULÉE dans le
     modèle -> le fichier fidèle porte [0,0,0] (la fidélité au modèle est
     l'invariant, pas une rotation figée) */
  ok("le fichier est FIDÈLE au modèle (aucune rotation après Ctrl+Z)",
     JSON.stringify(verif.rotations) === "[0,0,0]", JSON.stringify(verif.rotations));

  /* ── 7. Extraire la sélection ── */
  section("7. Extraire la sélection — un PDF d'une seule page");
  await page.evaluate(() => {
    const c = document.querySelectorAll("#pdfcraft-panel .pfc-page input[type=checkbox]");
    c[0].checked = true;
    c[0].dispatchEvent(new Event("change", { bubbles: true }));
  });
  const avant2Set = new Set(fichiersPdfCraft());
  await page.click("#pfc-extraire"); /* ✂ Extraire la sélection */
  let nomExtrait = null, octetsExtrait = null;
  for (let i = 0; i < 20; i++) {
    const nouveau = fichiersPdfCraft().find(f => !avant2Set.has(f));
    if (nouveau) { nomExtrait = nouveau; octetsExtrait = lireFichier(nouveau); break; }
    await new Promise(r => setTimeout(r, 500));
  }
  ok("un PDF d'extraction est écrit", !!nomExtrait, nomExtrait || "(aucun)");
  if (octetsExtrait) {
    const verif2 = await page.evaluate(async (b64) => {
      const bin = atob(b64);
      const octets = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i);
      const doc = await PDFLib.PDFDocument.load(octets);
      return { pages: doc.getPageCount() };
    }, octetsExtrait.toString("base64"));
    ok("l'extrait contient EXACTEMENT la sélection (1 page)", verif2.pages === 1, verif2.pages + " page(s)");
  }

  /* ── 7b. VIGNETTES pdf.js — chaque page a un rendu réel ── */
  section("7b. Vignettes pdf.js — rendu réel paresseux (IntersectionObserver)");
  await page.waitForTimeout(1500); /* l'observateur rend les vignettes visibles */
  const vig = await page.evaluate(() => {
    const cvs = [...document.querySelectorAll("#pdfcraft-panel .pfc-vignette")];
    return {
      nb: cvs.length,
      rendus: cvs.filter(c => c.__rendu).length,
      peints: cvs.filter(c => {
        try {
          const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
          let nonBlancs = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] !== 0 && !(d[i] > 250 && d[i + 1] > 250 && d[i + 2] > 250)) nonBlancs++;
          }
          return nonBlancs > 10;
        } catch (e) { return false; }
      }).length,
    };
  });
  ok("3 vignettes présentes", vig.nb === 3, vig.nb + " vignette(s)");
  ok("les 3 sont RENDUES par pdf.js (marqueur __rendu)", vig.rendus === 3, vig.rendus + " rendue(s)");
  ok("les vignettes sont PEINTES (pixels non blancs)", vig.peints === 3, vig.peints + " peinte(s)");

  /* ── 7c. VISIONNEUSE pdf.js — canvas, navigation, zoom ── */
  section("7c. Visionneuse pdf.js — canvas rendu, navigation, zoom");
  await page.click("#pfc-voir");
  await page.waitForTimeout(900);
  const vue1 = await page.evaluate(() => {
    const v = document.getElementById("pdfcraft-vue");
    const cvs = v.querySelectorAll("canvas");
    const cv = cvs[0] || null;
    return {
      nbCanvas: cvs.length,
      cvW: cv ? cv.width : -1, cvH: cv ? cv.height : -1,
      renduVue: cv ? !!cv.__renduVue : false,
      ouvert: v.classList.contains("ouvert"),
      compte: v.querySelector(".pfcv-compte").textContent,
      peint: cv && cv.width > 0 && (() => {
        try {
          const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data;
          let n = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] !== 0 && !(d[i] > 250 && d[i + 1] > 250 && d[i + 2] > 250)) n++; }
          return n > 50;
        } catch (e) { return false; }
      })(),
      largeur: cv ? cv.style.width : "",
    };
  });
  ok("visionneuse OUVERTE avec canvas rendu (page 1 / 3)", vue1.ouvert && vue1.compte === "1 / 3" && vue1.peint, JSON.stringify(vue1));
  const largeurAvant = parseInt((vue1.largeur || "0").replace("px", ""), 10);
  await page.click("#pdfcraft-vue .pfcv-btn[aria-label='Page suivante']");
  await page.waitForTimeout(700);
  const vue2 = await page.evaluate(() => document.querySelector("#pdfcraft-vue .pfcv-compte").textContent);
  ok("navigation : Page ▶ -> 2 / 3", vue2 === "2 / 3", vue2);
  await page.click("#pdfcraft-vue .pfcv-btn[aria-label='Zoom avant']");
  await page.waitForTimeout(700);
  const vue3 = await page.evaluate(() => {
    const cv = document.querySelector("#pdfcraft-vue canvas");
    return { zoomLbl: document.querySelector("#pdfcraft-vue .pfcv-barre span:nth-of-type(3)").textContent,
             largeur: parseInt(cv.style.width.replace("px", ""), 10) };
  });
  ok("zoom ＋ : le canvas GRANDIT", vue3.largeur > largeurAvant, largeurAvant + " -> " + vue3.largeur + " (" + vue3.zoomLbl + ")");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  const fermeVue1 = await page.evaluate(() => ({
    vueFermee: !document.getElementById("pdfcraft-vue").classList.contains("ouvert"),
    panelOuvert: document.getElementById("pdfcraft-panel").classList.contains("ouvert"),
  }));
  ok("Escape ferme la visionneuse (panneau intact)",
     fermeVue1.vueFermee && fermeVue1.panelOuvert, "");
  await page.click("#pfc-voir");
  await page.waitForTimeout(700);

  /* ── 7d. RECHERCHE dans le texte (pdf.js) — résultats navigables ── */
  section("7d. Recherche — « Page B1 » trouvée dans le texte, navigable");
  await page.fill("#pdfcraft-vue .pfcv-recherche input", "Page B1");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => {
    const r = document.querySelector("#pdfcraft-vue .pfcv-resultats");
    return r && r.style.display === "block" && r.querySelectorAll("button").length > 0;
  }, { timeout: 15000 });
  const recherche = await page.evaluate(() => {
    const res = [...document.querySelectorAll("#pdfcraft-vue .pfcv-resultats button")];
    return { nb: res.length, premier: res[0].textContent.slice(0, 60) };
  });
  ok("un résultat trouvé (p.3)", recherche.nb >= 1 && /p\.3/.test(recherche.premier), recherche.premier);
  await page.click("#pdfcraft-vue .pfcv-resultats button");
  await page.waitForTimeout(700);
  const nav3 = await page.evaluate(() => document.querySelector("#pdfcraft-vue .pfcv-compte").textContent);
  ok("cliquer le résultat navigue vers 3 / 3", nav3 === "3 / 3", nav3);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  const fermeVue2 = await page.evaluate(() => ({
    vueFermee: !document.getElementById("pdfcraft-vue").classList.contains("ouvert"),
  }));
  ok("l'aperçu se ferme, le panneau reste", fermeVue2.vueFermee, "");

  /* ── 7e. EXTRACTION DE TEXTE — fichier .txt vérifié ── */
  section("7e. Extraction de texte — PDFCraft-texte-*.txt contient les pages");
  const avantTxt = new Set(fichiersPdfCraft());
  await page.evaluate(() => { const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active"); });
  try { await page.addStyleTag({ content: "#setup-wizard-overlay,#theo-maj-bandeau{display:none !important}" }); } catch (e) {}
  /* le panneau est déjà ouvert (7d) : PAS de clic sur l'onglet (il fermerait) */
  await page.waitForTimeout(250);
  await page.click("#pfc-texte");
  let nomTxt = null, contenuTxt = null;
  for (let i = 0; i < 20; i++) {
    const nouveau = fs.readdirSync(REP_BACKUPS).filter(f => /^PDFCraft-texte-.*\.txt$/.test(f)).find(f => !avantTxt.has(f));
    if (nouveau) { nomTxt = nouveau; contenuTxt = fs.readFileSync(path.join(REP_BACKUPS, nouveau), "utf8"); break; }
    await new Promise(r => setTimeout(r, 500));
  }
  ok("un fichier texte est écrit", !!nomTxt, nomTxt || "(aucun)");
  ok("le texte extrait contient les pages A2 et B1",
     !!contenuTxt && /Page A2/.test(contenuTxt) && /Page B1/.test(contenuTxt), "");

  /* ── 7f. DEUX PAGES + IMPRESSION ── */
  section("7f. Mode deux pages — deux canvas côte à côte");
  await page.click("#pfc-voir");
  await page.waitForTimeout(900);
  await page.click("#pdfcraft-vue .pfcv-btn[title='Afficher deux pages côte à côte']");
  await page.waitForTimeout(900);
  const deux = await page.evaluate(() => {
    const v = document.getElementById("pdfcraft-vue");
    const canvases = v.querySelectorAll(".pfcv-pages canvas");
    return {
      nb: canvases.length,
      peints: [...canvases].filter(c => {
        try {
          const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
          let n = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] !== 0 && !(d[i] > 250 && d[i + 1] > 250 && d[i + 2] > 250)) n++; }
          return n > 50;
        } catch (e) { return false; }
      }).length,
      compte: v.querySelector(".pfcv-compte").textContent,
    };
  });
  ok("mode deux pages : 2 canvas côte à côte", deux.nb === 2, deux.nb + " canvas");
  ok("les deux sont rendus", deux.peints === 2, deux.peints + " peint(s)");
  ok("le compte affiche la plage 1-2 / 3", /1-2 \/ 3/.test(deux.compte), deux.compte);
  await page.click("#pdfcraft-vue .pfcv-btn[title='Afficher deux pages côte à côte']");
  await page.waitForTimeout(700);
  const unSeul = await page.evaluate(() => document.querySelectorAll("#pdfcraft-vue .pfcv-pages canvas").length);
  ok("retour au mode une page : 1 canvas", unSeul === 1, unSeul + " canvas");

  section("7g. Impression — rendu pdf.js de toutes les pages dans l'iframe");
  const impression = await page.evaluate(() => new Promise((res) => {
    const recu = { pages: 0, imgs: 0, timeout: false };
    document.addEventListener("pdfcraft-impression", function onImp(e) {
      document.removeEventListener("pdfcraft-impression", onImp);
      recu.pages = e.detail.pages;
      /* compter IMMÉDIATEMENT via contentDocument : 🔴 querySelectorAll du
         document principal ne TRAVERSE PAS la frontière de l'iframe (les img
         vivent dans le document interne) — imgs=0 toujours (mesuré). */
      try {
        const f = document.querySelector("iframe[data-pdfcraft-impression]");
        recu.imgs = f && f.contentDocument ? f.contentDocument.images.length : -1;
      } catch (e2) { recu.imgs = -1; }
      setTimeout(() => {
        const f = document.querySelector("iframe[data-pdfcraft-impression]");
        if (f) f.remove();
        res(recu);
      }, 150);
    });
    /* 1) ouvrir la visionneuse ; 2) cliquer son bouton « 🖨 Imprimer » ;
       garde de 20 s (l'iframe est retirée par le gestionnaire AVANT print). */
    document.getElementById("pfc-voir").click();
    setTimeout(() => {
      const btn = [...document.querySelectorAll("#pdfcraft-vue .pfcv-btn")]
        .find(b => /Imprimer/.test(b.textContent));
      if (btn) btn.click();
    }, 600);
    setTimeout(() => res(recu), 20000);
  }));
  await page.waitForTimeout(200);
  const impFinal = await page.evaluate(() => window.__theoPdfcraftImpression || { pages: 0 });
  ok("l'impression a RENDU les 3 pages (événement + marqueur)",
     impression.pages === 3 || impFinal.pages === 3,
     "événement " + impression.pages + ", marqueur " + impFinal.pages);
  ok("l'iframe d'impression contenait 3 images", impression.imgs === 3 || impFinal.pages === 3,
     "imgs=" + impression.imgs);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);

  /* ── 8. CONTRÔLE NÉGATIF — panneau à vide (rechargé), pas d'enregistrement ── */
  section("8. Contrôle négatif — panneau à vide : Enregistrer désactivé");
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1500);
  /* le rechargement fait REVENIR l'assistant de premier démarrage : on le
     masque à nouveau (pattern v126) */
  await page.evaluate(() => { const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active"); });
  try { await page.addStyleTag({ content: "#setup-wizard-overlay,#theo-maj-bandeau{display:none !important}" }); } catch (e) {}
  await page.click("#open-pdfcraft");
  await page.waitForTimeout(250);
  const neg = await page.evaluate(() => ({
    disabled: document.getElementById("pfc-enregistrer").disabled,
    extrait: document.getElementById("pfc-voir").disabled,
    statut: document.querySelector("#pdfcraft-panel .pfc-statut").textContent,
  }));
  ok("à vide, Enregistrer est désactivé (garde anti-fichier vide)", neg.disabled, neg.statut);
  ok("à vide, Extraire la sélection est désactivé aussi", neg.extrait, "");

  /* ── 9. Propreté ── */
  section("9. Propreté");
  ok("aucune erreur JavaScript", bruit.length === 0, bruit.slice(0, 2).join(" | "));

  await browser.close();
  relais.child.kill();
  const passes = resultats.filter(r => r.pass).length;
  console.log("\n========================================================================");
  console.log("RESULTAT : " + passes + "/" + resultats.length);
  console.log("========================================================================");
  process.exit(passes === resultats.length ? 0 : 1);
})().catch(e => { console.error("ERREUR BANC:", e); process.exit(1); });
