/* v666 — conformité des deux adaptateurs vidéo face aux pannes du fournisseur.
   Un seul faux fournisseur, piloté par scénario (fournisseur_faux.js) : chaque
   scénario ne diffère que là où les vrais fournisseurs diffèrent. On exige que
   l'adaptateur produise la BONNE référence et la bonne phrase ACTIONNABLE.
   L'invariant qui compte : l'adaptateur doit faire remonter le CORPS de la
   réponse, pas seulement le statut — sans le corps, un 403 « quota » devient
   « clé refusée » et l'utilisateur re-saisit une clé valide.
   Réseau simulé : aucun appel réel, aucune clé consommée. */
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");
const faux = require("./fournisseur_faux.js");

const PORT = Number(process.env.PORT || 9471);
const RACINE = path.resolve(process.env.BENCH_ROOT || path.resolve(__dirname, "..", "..", ".."));
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

const CATALOGUE = [
  { name: "LTX-2.5 22B Dist", slug: "Ltx2_5_22B_Dist_INT8", inference_types: ["txt2video"],
    info: { limits: { min_width: 256, max_width: 1344, min_height: 256, max_height: 1344,
                      min_frames: 9, max_frames: 257, min_fps: 24, max_fps: 60,
                      max_pixels: 1032192, max_ratio: 2, dimension_multiple: 32 } } }
];

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
    try {
      localStorage.setItem("agnes_api_key", "sk-test-key");
      localStorage.setItem("theologicus_deapi_key_v1", "sk-dp-test-key");
      localStorage.setItem("theologicus_deapi_models_v1", JSON.stringify([
        { name: "LTX-2.5 22B Dist", slug: "Ltx2_5_22B_Dist_INT8", inference_types: ["txt2video"],
          info: { limits: { min_width: 256, max_width: 1344, min_height: 256, max_height: 1344,
                            min_frames: 9, max_frames: 257, min_fps: 24, max_fps: 60,
                            max_pixels: 1032192, max_ratio: 2, dimension_multiple: 32 } } }
      ]));
      localStorage.setItem("theologicus_onboard_vu", "1");
    } catch (e) {}
  });

  /* Scénario courant, mutable : un seul gestionnaire de route pour tous. */
  let courant = null;
  const journal = [];
  await page.route("**/proxy/**", async (route) => {
    const u = route.request().url();
    if (/api\.deapi\.ai/.test(u) && /\/models\?/.test(u)) {
      return route.fulfill({ status: 200, headers: faux.CORS, body: JSON.stringify({ data: CATALOGUE, meta: { current_page: 1, last_page: 1, total: 1 } }) });
    }
    if (/api\.deapi\.ai/.test(u) && /\/videos\/generations\/price$/.test(u)) {
      return route.fulfill({ status: 200, headers: faux.CORS, body: JSON.stringify({ data: { price: 0.04 } }) });
    }
    if (courant) {
      const agnes = /apihub\.agnes-ai\.com/.test(u) && courant.fournisseur === "agnes";
      const deapi = /api\.deapi\.ai/.test(u) && courant.fournisseur === "deapi";
      if ((agnes || deapi) && courant.route.test(u)) {
        journal.push(courant.fournisseur + ":" + courant.statut);
        return route.fulfill({ status: courant.statut, headers: faux.entetesDe(courant), body: courant.corps });
      }
    }
    return route.continue();
  });

  await page.goto(`http://127.0.0.1:${PORT}/ai-video.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
  const pret = await page.waitForFunction(() => !!(window.__v664 && window.__v664.gen === "v664"), null, { timeout: 30000 })
    .then(() => true).catch(() => false);
  const pretDeapi = await page.waitForFunction(() => !!window.__v663, null, { timeout: 15000 })
    .then(() => true).catch(() => false);
  ok("0. hooks présents (prémisse : __v664 et __v663)", pret && pretDeapi,
     "__v664=" + pret + " __v663=" + pretDeapi);
  if (!pret || !pretDeapi) {
    console.log("\n-- RESULTAT : " + ok_n + " OK / " + ko_n + " ECHEC --");
    await browser.close(); serveur.close();
    process.exit(1);
  }
  await page.waitForTimeout(600);

  const noms = Object.keys(faux.SCENARIOS);
  for (const nom of noms) {
    const s = faux.SCENARIOS[nom];
    courant = s;
    const brut = await page.evaluate(async (f) => {
      try {
        if (f === "agnes") {
          await window.__v660b.creer("test", null, null, "agnes-video-2.5", null,
            { endpoint: "https://apihub.agnes-ai.com/v1", apiKey: "k", adapter: "agnes" });
        } else {
          await window.__v663.creer("un canard sur un lac", "Ltx2_5_22B_Dist_INT8", { dureeSec: 4, ratio: 1.7778 });
        }
        return { msg: "" };
      } catch (e) { return { msg: String((e && e.message) || e) }; }
    }, s.fournisseur);

    const c = await page.evaluate((m) => ({
      kind: window.__v664.kind(m), ref: window.__v664.ref(m), texte: window.__v664.texte(m)
    }), brut.msg);

    const a = s.attendu;
    const bon = c.kind === a.kind && c.ref === a.ref &&
      (!a.doitContenir || a.doitContenir.test(c.texte)) &&
      (!a.neDoitPasContenir || !a.neDoitPasContenir.test(c.texte));
    ok(nom + " → " + a.kind + " / " + a.ref, bon,
       "obtenu kind=" + c.kind + " ref=" + c.ref + " | « " + c.texte.slice(0, 90) + " »" +
       (brut.msg ? "" : " | ATTENTION : aucune erreur levée, scénario non joué"));
  }

  /* I. invariant transversal : le corps de la réponse doit remonter. Sans lui,
     un 403 « quota » se fait passer pour une clé refusée. On le vérifie en
     classant le message APPauvri que produirait un adaptateur muet. */
  const muet = await page.evaluate(() => {
    const plein = "HTTP 403 {\"code\":\"insufficient_user_quota\",\"remaining\":0.1}";
    const sansCorps = "HTTP 403";
    return { plein: window.__v664.kind(plein), sansCorps: window.__v664.kind(sansCorps) };
  });
  ok("I. sans le corps, un 403 quota est (hélas) classé « clé » — le banc exige donc le corps",
     muet.plein === "quota" && muet.sansCorps === "cle",
     JSON.stringify(muet));

  /* J. hygiène */
  ok("J. aucune erreur JavaScript non gérée", erreurs.length === 0, erreurs.join(" | ") || "0");
  ok("K. chaque scénario a bien été joué (une réponse simulée chacun)",
     journal.length >= noms.length, journal.length + " réponses simulées pour " + noms.length + " scénarios");

  console.log("\n-- RESULTAT : " + ok_n + " OK / " + ko_n + " ECHEC --");
  await browser.close(); serveur.close();
  process.exit(ko_n === 0 ? 0 : 1);
})().catch(e => { console.error("EXCEPTION BANC :", e); process.exit(2); });
