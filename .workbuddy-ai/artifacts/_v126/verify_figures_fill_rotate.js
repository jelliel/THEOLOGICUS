// Banc v127 — REMPLISSAGE et ROTATION des figures (section « Blocs Flèches »).
//
// Ce que l'utilisateur a demandé :
//   « je veux pouvoir rotate les fleches et aussi remplir (avec des couleurs)
//     l'interieur des fleches »
//
// Ce banc vérifie, par le CHEMIN RÉEL (clic droit sur le message -> menu
// d'encadrement -> palette « Blocs Flèches » -> barre d'outils de la figure) :
//   1. défaut inchangé : une figure sans remplissage garde `fill="none"`
//      partout (aucune régression sur les figures déjà posées) ;
//   2. le remplissage ne s'applique QU'AUX FORMES FERMÉES : le corps d'une
//      flèche (`<polygon>`) se remplit, une courbe ouverte (`<path>` sans Z)
//      reste en contour — sinon le navigateur referme le chemin et peint une
//      tache ;
//   3. la rotation tourne l'ARTWORK (le <svg>), pas la boîte, et fait passer
//      `preserveAspectRatio` de "none" à "xMidYMid meet" (sinon une flèche
//      étirée puis tournée de 90° devient courte et énorme) ;
//   4. les deux réglages survivent au rechargement (ils sont stockés sur la
//      figure, donc sauvegardés avec la conversation).

const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8802;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";

const CHAT_ID = "chat-fig-0001";
const MSG_TS = 1790600000001;
const CONTENU = "1. Il cite Hénoc comme témoignage non **canonique** mais utile pour réfuter les hérésies (docét**isme**, marcion**isme**).";
const FILL = "#ffd54f";
const ROT = 45;

const resultats = [];
function ok(nom, cond, detail) {
  resultats.push([!!cond, nom, detail === undefined ? "" : String(detail)]);
  console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`);
  return !!cond;
}

const CORPS = JSON.stringify({
  id: CHAT_ID, model: "mistral", messages: [
    { role: "user", content: "Question de test", ts: MSG_TS - 1 },
    { role: "assistant", content: CONTENU, ts: MSG_TS, annotations: [] },
  ], title: "Banc figures", updated: 1, fav: false,
});

/* Décrit ce que porte réellement le SVG d'une figure : pour chaque élément,
   son tag et son fill. */
const DECRIRE_SVG = (id) => {
  const fb = document.querySelector('.atc-figbox[data-fig-id="' + id + '"]');
  if (!fb) return null;
  const svg = fb.querySelector('svg');
  const els = Array.from(svg.querySelectorAll('polygon,path,line,polyline,rect,circle,ellipse'));
  return {
    transform: svg.style.transform || "",
    aspect: svg.getAttribute('preserveAspectRatio'),
    boiteTransform: fb.style.transform || "",
    els: els.map(e => e.tagName.toLowerCase() + ":" + (e.getAttribute('fill') || "")),
  };
};

(async () => {
  console.log("=".repeat(72));
  console.log("BANC v127 — REMPLISSAGE ET ROTATION DES FIGURES");
  console.log("=".repeat(72));
  if (SERVI !== RACINE) console.log(`  [info] copie servie : ${SERVI}`);

  const serveur = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/THEOLOGICUS.html";
    const fp = path.join(SERVI, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      res.writeHead(200, {
        "Content-Type": p.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream",
        "Cache-Control": "no-store",
      });
      fs.createReadStream(fp).pipe(res);
    } else { res.writeHead(404); res.end("404"); }
  });
  await new Promise(r => serveur.listen(PORT, "127.0.0.1", r));

  const browser = await chromium.launch({
    executablePath: path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe"),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", e => erreurs.push(String(e)));

  await ctx.addInitScript(({ corps, chatId }) => {
    try { document.cookie = "key_mistral=sk-test-mistral-fig; path=/"; } catch (e) {}
    try { localStorage.setItem("theo_debug", "1"); } catch (e) {}
    try {
      if (!localStorage.getItem("__bench_fig_seeded")) {
        localStorage.setItem("theologicus_chat_" + chatId, corps);
        localStorage.setItem("theologicus_currentChatId", chatId);
        localStorage.setItem("__bench_fig_seeded", "1");
      }
    } catch (e) {}
  }, { corps: CORPS, chatId: CHAT_ID });

  const attendreApp = async () => {
    await page.waitForFunction(() => typeof window.renderMessages === "function", null, { timeout: 90000 });
    await page.evaluate(() => {
      const o = document.getElementById("auth-overlay"); if (o) o.remove();
      const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active");
    });
    /* L'assistant de premier lancement se réactive tout seul et intercepte
       tous les clics (mesuré : « #setup-wizard-overlay intercepts pointer
       events »). On le neutralise pour la durée du banc. */
    try { await page.addStyleTag({ content: "#setup-wizard-overlay{display:none !important}" }); } catch (e) {}
  };
  /* Insère une figure de la palette par le chemin réel : clic droit sur le
     message -> menu d'encadrement -> icône de la forme. */
  async function inserer(forme) {
    await page.evaluate(() => { const m = document.getElementById("atc-insert-menu"); if (m) m.style.display = "none"; });
    const box = page.locator("#mc-" + MSG_TS);
    await box.click({ button: "right", position: { x: 30, y: 12 } });
    await page.waitForSelector("#atc-insert-menu", { state: "visible", timeout: 10000 });
    const ico = page.locator(`#atc-insert-menu .im-ico[title="${forme}"]`);
    await ico.click();
    await page.waitForTimeout(250);
    return page.evaluate(() => {
      const all = Array.from(document.querySelectorAll(".atc-figbox"));
      return all.length ? all[all.length - 1].dataset.figId : null;
    });
  }
  /* Ouvre la barre d'outils de la figure (mousedown sur la boîte). */
  async function outils(id) {
    await page.evaluate((fid) => {
      const fb = document.querySelector('.atc-figbox[data-fig-id="' + fid + '"]');
      const r = fb.getBoundingClientRect();
      fb.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: r.left + 4, clientY: r.top + 4 }));
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    }, id);
    await page.waitForTimeout(200);
    return page.locator(".fig-tools").count();
  }

  try {
    await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: "domcontentloaded", timeout: 90000 });
    await attendreApp();
    await page.waitForFunction((ts) => !!document.getElementById("mc-" + ts), MSG_TS, { timeout: 60000 });
    await page.waitForTimeout(1000);

    // ── 1. Flèche droite : défaut INCHANGÉ (contour seul) ──
    const idFleche = await inserer("Flèche droite");
    ok("la flèche est insérée par la palette", !!idFleche, idFleche);
    if (!idFleche) throw new Error("insertion impossible");
    let d = await page.evaluate(DECRIRE_SVG, idFleche);
    ok("défaut : le corps de la flèche reste en contour (fill=none)",
      !!d && d.els.length > 0 && d.els.every(x => x.endsWith(":none")), JSON.stringify(d && d.els));
    ok("défaut : aucune rotation, aucun étirement modifié",
      !!d && d.transform === "" && d.aspect === "none", JSON.stringify(d && { t: d.transform, a: d.aspect }));

    // ── 2. Barre d'outils : remplissage ──
    const nbOutils = await outils(idFleche);
    ok("la barre d'outils s'ouvre sur la figure", nbOutils === 1);
    ok("un contrôle de remplissage existe", await page.locator(".fig-tools .ft-fill").count() === 1);
    ok("un contrôle de rotation existe", await page.locator(".fig-tools .ft-rot").count() === 1);
    ok("le bouton « aucun remplissage » existe", await page.locator(".fig-tools .ft-filloff").count() === 1);

    await page.evaluate((c) => {
      const inp = document.querySelector(".fig-tools .ft-fill");
      inp.value = c;
      inp.dispatchEvent(new Event("input", { bubbles: true }));
    }, FILL);
    await page.waitForTimeout(250);
    d = await page.evaluate(DECRIRE_SVG, idFleche);
    ok("le corps de la flèche est REMPLI de la couleur choisie",
      !!d && d.els.length > 0 && d.els.every(x => x.endsWith(":" + FILL)), JSON.stringify(d && d.els));

    // ── 3. Rotation ──
    await page.evaluate((r) => {
      const inp = document.querySelector(".fig-tools .ft-rot");
      inp.value = String(r);
      inp.dispatchEvent(new Event("input", { bubbles: true }));
    }, ROT);
    await page.waitForTimeout(250);
    d = await page.evaluate(DECRIRE_SVG, idFleche);
    ok(`l'artwork tourne de ${ROT}°`, !!d && d.transform === `rotate(${ROT}deg)`, JSON.stringify(d && d.transform));
    ok("la BOÎTE ne tourne pas (poignées et étiquette intactes)",
      !!d && d.boiteTransform === "", JSON.stringify(d && d.boiteTransform));
    ok("preserveAspectRatio passe à xMidYMid meet (pas de déformation)",
      !!d && d.aspect === "xMidYMid meet", JSON.stringify(d && d.aspect));
    ok("le remplissage survit à la rotation",
      !!d && d.els.every(x => x.endsWith(":" + FILL)), JSON.stringify(d && d.els));

    // ── 4. Flèche courbée : la courbe OUVERTE ne doit PAS être remplie ──
    const idCourbe = await inserer("Flèche courbée");
    ok("la flèche courbée est insérée", !!idCourbe, idCourbe);
    await outils(idCourbe);
    await page.evaluate((c) => {
      const inp = document.querySelector(".fig-tools .ft-fill");
      inp.value = c;
      inp.dispatchEvent(new Event("input", { bubbles: true }));
    }, FILL);
    await page.waitForTimeout(250);
    const dc = await page.evaluate(DECRIRE_SVG, idCourbe);
    const courbe = dc ? dc.els.find(x => x.startsWith("path:")) : "";
    const pointe = dc ? dc.els.find(x => x.startsWith("polygon:")) : "";
    ok("la courbe OUVERTE reste en contour (fill=none) — pas de tache",
      courbe === "path:none", JSON.stringify(courbe));
    ok("la pointe FERMÉE est remplie", pointe === "polygon:" + FILL, JSON.stringify(pointe));

    // ── 5. Persistance ──
    await page.evaluate(() => { try { window.renderMessages(true); } catch (e) {} });
    await page.waitForTimeout(600);
    const apres = await page.evaluate(DECRIRE_SVG, idFleche);
    ok("après re-rendu : remplissage conservé", !!apres && apres.els.every(x => x.endsWith(":" + FILL)), JSON.stringify(apres && apres.els));
    ok("après re-rendu : rotation conservée", !!apres && apres.transform === `rotate(${ROT}deg)`, JSON.stringify(apres && apres.transform));

    const stock = await page.evaluate(() => {
      const c = JSON.parse(localStorage.getItem("theologicus_chat_chat-fig-0001") || "{}");
      const m = (c.messages || []).find(x => x.ts === 1790600000001);
      return (m && m.shapes || []).map(s => ({ shape: s.shape, fill: s.fill, rot: s.rot }));
    });
    ok("les réglages sont bien écrits dans la conversation sauvegardée",
      stock.some(s => s.fill === FILL && s.rot === ROT), JSON.stringify(stock));

    await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
    await attendreApp();
    await page.waitForFunction((ts) => !!document.getElementById("mc-" + ts), MSG_TS, { timeout: 60000 });
    await page.waitForTimeout(1500);
    const apresRechargement = await page.evaluate(DECRIRE_SVG, idFleche);
    ok("après RECHARGEMENT : remplissage conservé",
      !!apresRechargement && apresRechargement.els.every(x => x.endsWith(":" + FILL)), JSON.stringify(apresRechargement && apresRechargement.els));
    ok("après RECHARGEMENT : rotation conservée",
      !!apresRechargement && apresRechargement.transform === `rotate(${ROT}deg)`, JSON.stringify(apresRechargement && apresRechargement.transform));

    // ── 6. Réglages posés DEPUIS LE MENU D'ENCODREMENT, avant insertion ──
    await page.evaluate(() => { const m = document.getElementById("atc-insert-menu"); if (m) m.style.display = "none"; });
    await page.locator("#mc-" + MSG_TS).click({ button: "right", position: { x: 70, y: 12 } });
    await page.waitForSelector("#atc-insert-menu", { state: "visible", timeout: 10000 });
    ok("le menu d'encadrement propose un nuancier de REMPLISSAGE",
      await page.locator('#atc-insert-menu .im-swatch[data-role="fill"]').count() >= 8);
    ok("il propose aussi « aucun remplissage »",
      await page.locator('#atc-insert-menu .im-swatch[data-role="fill"][data-c=""]').count() === 1);
    ok("il propose un curseur de rotation",
      await page.locator("#atc-insert-menu input.im-rrot").count() === 1);
    await page.locator('#atc-insert-menu .im-swatch[data-role="fill"][data-c="#81e68c"]').click();
    await page.evaluate(() => {
      const r = document.querySelector("#atc-insert-menu input.im-rrot");
      r.value = "135"; r.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForTimeout(200);
    const ico = page.locator('#atc-insert-menu .im-ico[title="Flèche haut"]');
    await ico.click();
    await page.waitForTimeout(300);
    const idPre = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll(".atc-figbox"));
      return all.length ? all[all.length - 1].dataset.figId : null;
    });
    const dPre = await page.evaluate(DECRIRE_SVG, idPre);
    ok("la figure insérée prend le remplissage choisi dans le menu",
      !!dPre && dPre.els.length > 0 && dPre.els.every(x => x.endsWith(":#81e68c")), JSON.stringify(dPre && dPre.els));
    ok("la figure insérée prend la rotation choisie dans le menu",
      !!dPre && dPre.transform === "rotate(135deg)", JSON.stringify(dPre && dPre.transform));

    // ── 7. Retour à « aucun remplissage » ──
    await outils(idFleche);
    await page.evaluate(() => { document.querySelector(".fig-tools .ft-filloff").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })); });
    await page.waitForTimeout(250);
    const vide = await page.evaluate(DECRIRE_SVG, idFleche);
    ok("« ∅ » remet la flèche en contour seul",
      !!vide && vide.els.every(x => x.endsWith(":none")), JSON.stringify(vide && vide.els));

    ok("aucune erreur JS", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
  } catch (e) {
    ok("banc exécuté sans exception", false, String((e && e.message) || e));
  } finally {
    await browser.close();
    serveur.close();
  }

  const reussis = resultats.filter(r => r[0]).length;
  console.log("-".repeat(72));
  console.log(`RESULTAT : ${reussis}/${resultats.length}`);
  console.log("-".repeat(72));
  process.exit(reussis === resultats.length ? 0 : 1);
})();
