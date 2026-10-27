/* v665 — ciblage par rôle accessible : le banc résiste à une mise en page qui
   bouge, là où des coordonnées enregistrées ne résistent pas.
   Le cœur du banc est le test C : même scénario joué deux fois sur la MÊME
   perturbation (un décalage de 300 px), une fois par rôle, une fois par
   coordonnée enregistrée avant le décalage. Le rôle atteint le contrôle, la
   coordonnée le rate — mesuré, pas supposé.
   Réseau simulé : aucun appel réel. */
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");
const roles = require("./roles.js");

const PORT = Number(process.env.PORT || 9461);
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
    if (p === "/") p = "/ai-video.html";
    const fp = path.join(RACINE, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      rs.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      fs.createReadStream(fp).pipe(rs);
    } else { rs.writeHead(404); rs.end("404"); }
  });
  await new Promise(r => serveur.listen(PORT, "127.0.0.1", r));

  const browser = await chromium.launch(Object.assign({ args: ["--no-sandbox"] },
    process.env.PW_DIR ? { executablePath: CHROME } : {}));
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on("pageerror", e => erreurs.push(String(e.message)));
  await page.addInitScript(() => {
    if (window.top !== window) return;
    try { localStorage.setItem("agnes_api_key", "sk-test-key"); } catch (e) {}
    /* l'accueil (onboard) s'ouvre à 900 ms et intercepte les clics : on le
       DÉSAMORCE en semant son drapeau « déjà vu », sans retirer l'élément
       (le retirer couperait l'initialisation). */
    try { localStorage.setItem("theologicus_onboard_vu", "1"); } catch (e) {}
  });
  await page.goto(`http://127.0.0.1:${PORT}/ai-video.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => !!window.__v499, null, { timeout: 30000 });
  await page.waitForTimeout(1200);

  /* A. inventaire : non vide (prémisse) et dans le budget */
  const inv = await roles.inventaire(ctx, page);
  ok("A. inventaire accessible non vide et dans le budget (≤ " + roles.BUDGET_ELEMENTS + ")",
     inv.total > 0 && inv.dansLeBudget,
     inv.total + " actionnables, " + inv.sansNom.length + " sans nom");

  /* B. les contrôles critiques sont atteignables par rôle + nom */
  const libelles = await page.evaluate(() => {
    const b = {};
    document.querySelectorAll(".mode-btn").forEach(el => { b[el.dataset.mode] = el.textContent.trim(); });
    return b;
  });
  const critiques = [
    ["button", libelles.image || "Image"], ["button", libelles.text || "Texte"],
    ["button", libelles.audio || "Audio"], ["textbox", "Clé Agnes"],
    ["button", "Vérifier"]
  ];
  const manquants = [];
  for (const [r, n] of critiques) {
    const c = await roles.parRole(page, r, n).count();
    if (c < 1) manquants.push(r + "/" + n);
  }
  ok("B. les " + critiques.length + " contrôles critiques sont atteignables par rôle + nom",
     manquants.length === 0, manquants.join(", ") || "tous présents");

  /* ═══ C. LE CŒUR : même perturbation, rôle contre coordonnées ═══ */
  const modeAudio = libelles.audio || "Audio";
  /* 1. revenir sur « Texte » par rôle, et relever la boîte de « Audio » */
  try { await roles.clicRole(page, "button", libelles.text || "Texte"); }
  catch (e) { /* un contrôle sans nom : l'échec est constaté plus bas, pas ici */ }
  let avant = null;
  try { avant = await roles.boite(page, "button", modeAudio); } catch (e) { avant = null; }
  const modeAvant = await page.evaluate(() => window.__v499.etat.mode);

  /* 2. perturbation : un espaceur de 300 px pousse toute la rangée vers le bas */
  await page.evaluate(() => {
    const btn = document.querySelector(".mode-btn");
    const parent = btn && btn.parentElement;
    if (!parent) return;
    const d = document.createElement("div");
    d.id = "spacer-banc";
    d.style.height = "300px";
    parent.parentElement.insertBefore(d, parent);
  });
  let apres = null;
  try { apres = await roles.boite(page, "button", modeAudio); } catch (e) { apres = null; }
  const decale = avant && apres ? Math.abs(apres.y - avant.y) : 0;

  /* 3. clic PAR RÔLE après perturbation : le mode doit changer. Un contrôle
     sans nom accessible rend le clic impossible — c'est un ÉCHEC, pas une
     exception qui abrège le banc. */
  let erreurRole = "";
  try { await roles.clicRole(page, "button", modeAudio); }
  catch (e) { erreurRole = String(e.message).split("\n")[0].slice(0, 80); }
  const modeRole = await page.evaluate(() => window.__v499.etat.mode);

  /* 4. revenir sur « Texte », puis clic aux COORDONNÉES enregistrées avant la
        perturbation : le mode ne doit PAS changer (le clic est passé à côté) */
  await page.evaluate(() => { window.__v499.etat.mode = "text"; });
  if (avant) await page.mouse.click(avant.x + avant.width / 2, avant.y + avant.height / 2);
  await page.waitForTimeout(300);
  const modeCoord = await page.evaluate(() => window.__v499.etat.mode);

  ok("C1. la perturbation a réellement déplacé le contrôle (≥ 200 px)",
     decale >= 200, "décalage mesuré = " + Math.round(decale) + " px");
  ok("C2. après le décalage, le clic PAR RÔLE atteint encore le contrôle",
     modeRole === "audio", (erreurRole ? "clic impossible : " + erreurRole + " — " : "") +
     "mode après clic par rôle = " + modeRole + " (avant : " + modeAvant + ")");
  ok("C3. la coordonnée enregistrée avant le décalage, elle, le rate",
     modeCoord !== "audio", "mode après clic aux anciennes coordonnées = " + modeCoord);

  /* D. deuxième perturbation, d'une autre nature : réordonner le DOM. Le rôle
     suit le contrôle, un sélecteur positionnel (nth-child) ne le suivrait pas. */
  await page.evaluate(() => {
    const parent = document.querySelector(".mode-btn").parentElement;
    parent.appendChild(parent.querySelector(".mode-btn"));
  });
  await page.evaluate(() => { window.__v499.etat.mode = "text"; });
  try { await roles.clicRole(page, "button", modeAudio); }
  catch (e) { /* constaté par l'assertion, pas par une exception */ }
  const modeReordonne = await page.evaluate(() => window.__v499.etat.mode);
  ok("D. le rôle survit à un réordonnancement du DOM", modeReordonne === "audio",
     "mode = " + modeReordonne);

  /* E. hygiène de l'inventaire : pas de contrôle actionnable sans nom parmi
     ceux que la page montre réellement (les input[type=file] cachés sont
     exclus : ils ne sont pas présentés à l'utilisateur). */
  const visiblesSansNom = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll("button, a, [role=button]").forEach(el => {
      if (el.offsetParent === null) return;                 /* hors rendu :non montré */
      const nom = (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || "").trim();
      if (!nom) out.push((el.tagName + "#" + el.id).slice(0, 40));
    });
    return out;
  });
  ok("E. aucun bouton visible sans nom accessible", visiblesSansNom.length === 0,
     visiblesSansNom.join(", ") || "0");

  /* F. hygiène */
  ok("F. aucune erreur JavaScript non gérée", erreurs.length === 0, erreurs.join(" | ") || "0");

  console.log("\n-- RESULTAT : " + ok_n + " OK / " + ko_n + " ECHEC --");
  await browser.close(); serveur.close();
  process.exit(ko_n === 0 ? 0 : 1);
})().catch(e => { console.error("EXCEPTION BANC :", e); process.exit(2); });
