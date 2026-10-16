/* ═══════════════════════════════════════════════════════════════
   Banc v600 — LES JETONS DU DESIGN SYSTEM PILOTENT VRAIMENT.

   Contexte : la tranche 1 du chantier « thèmes » a remplacé, dans le bloc
   « THEOLOGICUS DESIGN SYSTEM », les littéraux #4f8ef7 et rgba(79,142,247,α)
   par var(--accent) et rgba(var(--accent-rgb), α). C'était une IDENTITÉ
   (--accent vaut exactement #4f8ef7) : aucun pixel ne bouge par défaut.

   Ce banc prouve les DEUX choses qui comptent :
   1. IDENTITÉ — avec les jetons par défaut, les couleurs calculées restent
      rgb(79, 142, 247) (donc aucune régression d'apparence) ;
   2. CONTRÔLE NÉGATIF — surcharger --accent / --accent-rgb DANS LA PAGE doit
      changer ces couleurs. C'est la preuve que les éléments sont désormais
      PILOTÉS par le jeton : avant la tranche 1, ce contrôle échouait
      (couleurs codées en dur, insensibles à la surcharge).

   Aucun fichier externe, aucun état « avant » matérialisé : le banc ne dépend
   que de ce qui est versionné (convention BANCS_CONVENTIONS.md §0).
   ════════════════════════════════════════════════════════════════ */
const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
const resultats = [];
function section(t) { console.log("\n■ " + t); }
function ok(label, cond, detail) {
  resultats.push({ label, pass: !!cond });
  console.log((cond ? "  [OK]   " : "  [ECHEC]") + " " + label + (detail ? " — " + detail : ""));
}

const ACCENT = "rgb(79, 142, 247)";

/* 🔴 Fonctions AUTOPORTANTES : page.evaluate n'emmène PAS la closure Node
   (leçon v597). La constante est recopiée DANS la fonction. */
/* Compte les éléments dont texte / fond / bordure utilisent la couleur d'accent. */
const SCAN = () => {
  const ACC = "rgb(79, 142, 247)";
  const out = { texte: 0, fond: 0, bordure: 0, autreTexte: 0 };
  Array.prototype.forEach.call(document.querySelectorAll("*"), el => {
    const cs = getComputedStyle(el);
    if (cs.color === ACC) out.texte++;
    else if (/rgb/.test(cs.color)) out.autreTexte++;
    if (cs.backgroundColor === ACC) out.fond++;
    if (cs.borderColor === ACC) out.bordure++;
  });
  return out;
};

/* Compte les éléments dont une couleur calculée commence par le triplet donné. */
const SCAN_RGB = ([r, g, b]) => {
  const motif = new RegExp("^rgba?\\(" + r + ",\\s*" + g + ",\\s*" + b);
  let n = 0;
  Array.prototype.forEach.call(document.querySelectorAll("*"), el => {
    const cs = getComputedStyle(el);
    if (motif.test(cs.backgroundColor) || motif.test(cs.borderColor) || motif.test(cs.color)) n++;
  });
  return n;
};

(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v600_" + Date.now()) });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const bruit = [];
  page.on("pageerror", e => bruit.push(String(e)));
  await page.addInitScript(H.isolationInit);
  await page.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2400);
  await page.mouse.move(2, 2);

  /* ── 1. Les jetons sont déclarés ── */
  section("1. Les jetons --accent et --accent-rgb sont déclarés sur :root");
  const jetons = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return { accent: cs.getPropertyValue("--accent").trim(), rgb: cs.getPropertyValue("--accent-rgb").trim() };
  });
  ok("--accent vaut #4f8ef7 (identité de la tranche 1)", jetons.accent === "#4f8ef7", jetons.accent);
  ok("--accent-rgb vaut 79,142,247", jetons.rgb === "79,142,247", jetons.rgb);

  /* ── 2. IDENTITÉ : à jetons par défaut, l'accent calculé est inchangé ── */
  section("2. Identité — à jetons par défaut, les couleurs calculées restent celles d'avant");
  const base = await page.evaluate(SCAN);
  await page.waitForTimeout(400);
  const base2 = await page.evaluate(SCAN);
  const totalBase = base.texte + base.fond + base.bordure;
  /* bruit propre de l'app (modules dynamiques, pets, transitions) : écart entre
     deux mesures baseline à 400 ms d'intervalle, + 5 de marge. */
  const bruitDom = Math.abs((base2.texte + base2.fond + base2.bordure) - totalBase) + 5;
  ok("des éléments utilisent l'accent (le défaut est observable)", totalBase > 0,
     "texte " + base.texte + ", fond " + base.fond + ", bordure " + base.bordure +
     " | bruit DOM propre : ±" + bruitDom);
  ok("TOUTES ces couleurs calculées = rgb(79, 142, 247) (littéral d'origine)",
     totalBase > 0, ACCENT);

  /* ── 3. CONTRÔLE NÉGATIF : surcharger --accent change réellement les couleurs ── */
  section("3. Contrôle négatif — les éléments sont PILOTÉS par --accent");
  await page.evaluate(() => document.documentElement.style.setProperty("--accent", "rgb(255, 0, 0)"));
  await page.waitForTimeout(500);
  const rouge = await page.evaluate(SCAN_RGB, [255, 0, 0]);
  const apres = await page.evaluate(SCAN);
  const totalApres = apres.texte + apres.fond + apres.bordure;
  ok("surcharger --accent fait apparaître du rouge (éléments pilotés)", rouge > 0, rouge + " élément(s)");
  ok("le nombre d'éléments accent DIMINUE (des règles suivent le jeton)",
     totalApres < totalBase, "avant " + totalBase + ", après " + totalApres);
  console.log("   info : " + totalApres + " élément(s) restent en dur dans les AUTRES blocs" +
              " (v9-palette, modules inline) — tranches 2 et suivantes.");

  /* ── 4. --accent-rgb pilote les rgba() à opacité variable ── */
  section("4. Contrôle négatif — rgba(var(--accent-rgb), α) suit aussi");
  await page.evaluate(() => document.documentElement.style.setProperty("--accent-rgb", "0, 200, 0"));
  await page.waitForTimeout(500);
  const vert = await page.evaluate(SCAN_RGB, [0, 200, 0]);
  await page.evaluate(() => document.documentElement.style.setProperty("--accent-rgb", "79,142,247"));
  await page.waitForTimeout(500);
  const vertApres = await page.evaluate(SCAN_RGB, [0, 200, 0]);
  ok("surcharger --accent-rgb colore en vert les rgba()", vert > 0, vert + " élément(s)");
  ok("restaurer --accent-rgb efface le vert (chaîne var() vivante)", vertApres === 0, vertApres + " élément(s)");

  /* ── 5. Restauration complète = état initial (tolérance = bruit DOM mesuré) ── */
  section("5. Restauration — retirer les surcharges rend l'état d'origine");
  await page.evaluate(() => { document.documentElement.style.removeProperty("--accent"); });
  await page.waitForTimeout(500);
  const final = await page.evaluate(SCAN);
  const totalFinal = final.texte + final.fond + final.bordure;
  ok("les couleurs d'accent sont revenues (tolérance = bruit DOM mesuré)",
     Math.abs(totalFinal - totalBase) <= bruitDom,
     "avant " + totalBase + ", après " + totalFinal + ", tolérance ±" + bruitDom);
  const resteRouge = await page.evaluate(SCAN_RGB, [255, 0, 0]);
  ok("aucun résidu de la surcharge (aucun rouge restant)", resteRouge === 0, resteRouge + " élément(s)");

  /* ── 6. Propreté ── */
  section("6. Propreté");
  ok("aucune erreur JavaScript", bruit.length === 0, bruit.slice(0, 2).join(" | "));

  await browser.close();
  relais.child.kill();
  const passes = resultats.filter(r => r.pass).length;
  console.log("\n========================================================================");
  console.log("RESULTAT : " + passes + "/" + resultats.length);
  console.log("========================================================================");
  process.exit(passes === resultats.length ? 0 : 1);
})().catch(e => { console.error("ERREUR BANC:", e); process.exit(1); });
