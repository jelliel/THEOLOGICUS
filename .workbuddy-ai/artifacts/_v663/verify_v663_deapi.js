/* v663 — fournisseur deAPI (vidéo open-source) : découverte, création,
   sondage du job, et secours automatique quand Agnes échoue.
   Réseau SIMULÉ (page.route) : aucun appel réel, aucune clé consommée.
   Les corps de réponse reprennent la forme documentée (deapi.ai/llms.txt). */
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = Number(process.env.PORT || 9311);
const RACINE = path.resolve(process.env.BENCH_ROOT || path.resolve(__dirname, "..", "..", ".."));
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");
const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

let ok_n = 0, ko_n = 0;
function ok(nom, cond, detail) {
  if (cond) { ok_n++; console.log("[OK]   " + nom + (detail ? "  -- " + detail : "")); }
  else { ko_n++; console.log("[ECHEC] " + nom + "  -- " + detail); }
}

/* Catalogue conforme à la doc : bornes PAR MODÈLE (Ltx2_5 : max 1344 px,
   max_pixels 1 032 192, max_ratio 2 ; Ltxv_13B impose fps 30 / steps 1). */
const CATALOGUE = {
  data: [
    { name: "LTX-2.5 22B Dist", slug: "Ltx2_5_22B_Dist_INT8", inference_types: ["txt2video"],
      info: { limits: { min_width: 256, max_width: 1344, min_height: 256, max_height: 1344,
                        min_frames: 9, max_frames: 257, min_fps: 24, max_fps: 60,
                        max_pixels: 1032192, max_ratio: 2, dimension_multiple: 32 } } },
    { name: "LTX-Video 13B", slug: "Ltxv_13B_0_9_8_Distilled_FP8", inference_types: ["txt2video"],
      info: { limits: { min_width: 256, max_width: 768, min_height: 256, max_height: 768,
                        min_frames: 9, max_frames: 257, min_fps: 30, max_fps: 30 } } }
  ],
  meta: { current_page: 1, last_page: 1, total: 2 }
};

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

  const appels = [];
  await page.route("**/proxy/**", async (route) => {
    const u = route.request().url();
    const meth = route.request().method();
    let corps = null;
    try { corps = meth === "POST" ? JSON.parse(route.request().postData() || "{}") : null; } catch (e) { corps = null; }
    const deapi = /api\.deapi\.ai/.test(u);
    const agnes = /apihub\.agnes-ai\.com/.test(u);
    if (deapi) appels.push({ meth, url: u.replace(/^.*\/proxy\//, ""), corps });

    if (deapi && /\/models\?/.test(u)) return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify(CATALOGUE) });
    if (deapi && /\/videos\/generations\/price$/.test(u)) return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify({ data: { price: 0.04 } }) });
    if (deapi && /\/videos\/generations$/.test(u)) return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify({ data: { request_id: "job-deapi-1" } }) });
    if (deapi && /\/jobs\/job-deapi-1$/.test(u)) return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify({ data: { status: "done", progress: 100, result_url: "https://results.deapi.ai/v.mp4" } }) });
    /* Agnes : file pleine (503) — exactement la panne mesurée en production */
    if (agnes && /\/videos$/.test(u)) return route.fulfill({ status: 503, headers: CORS, body: JSON.stringify({ code: "video_queue_full", message: "video queue is full, please retry later" }) });
    return route.continue();
  });
  await page.route("**/results.deapi.ai/**", async (route) =>
    route.fulfill({ status: 200, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "video/mp4" }, body: "AAAA" }));

  /* clé deAPI seule (pas de clé Agnes) : le scénario « secours » doit suffire */
  await page.addInitScript(() => {
    if (window.top !== window) return;
    try { localStorage.setItem("theologicus_deapi_key_v1", "sk-dp-test-key"); } catch (e) {}
  });
  await page.goto(`http://127.0.0.1:${PORT}/ai-video.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => !!window.__v663, null, { timeout: 30000 });
  await page.waitForTimeout(600);

  /* A. catalogue : découverte + enregistrement */
  const a = await page.evaluate(async () => {
    const l = await window.__v663.lister();
    return { n: l.length, slugs: l.map(m => m.slug), stocke: localStorage.getItem("theologicus_deapi_models_v1") };
  });
  ok("A. catalogue deAPI découvert et mémorisé (2 modèles txt2video)",
     a.n === 2 && a.slugs.indexOf("Ltx2_5_22B_Dist_INT8") >= 0 && /Ltxv_13B/.test(String(a.stocke)),
     JSON.stringify(a.slugs));

  /* B. taille conforme aux bornes du modèle (pixels ET ratio ET multiples) */
  const b = await page.evaluate(() => {
    const t = window.__v663.taille("Ltx2_5_22B_Dist_INT8", 1.7778);
    const t2 = window.__v663.taille("Ltxv_13B_0_9_8_Distilled_FP8", 1.7778);
    return { t: t, px: t.w * t.h, ratio: t.w / t.h, t2: t2, px2: t2.w * t2.h };
  });
  ok("B. taille bornée par le modèle (Ltx2_5 : ≤ 1 032 192 px, ratio ≤ 2)",
     b.px <= 1032192 && b.ratio <= 2 && b.t.w <= 1344 && b.t.h <= 1344 && b.t.w % 32 === 0,
     JSON.stringify(b));

  /* C. création : corps conforme, fps/frames bornés par le modèle */
  const c = await page.evaluate(async () => {
    const id = await window.__v663.creer("un canard sur un lac", "Ltxv_13B_0_9_8_Distilled_FP8", { dureeSec: 5, ratio: 1.7778 });
    return { id: id };
  });
  const creation = appels.filter(x => /videos\/generations$/.test(x.url));
  ok("C. création : request_id retourné, fps/frames/taille conformes au modèle",
     c.id === "job-deapi-1" && creation.length === 1 &&
     creation[0].corps.fps === 30 && creation[0].corps.frames === 150 &&
     creation[0].corps.width <= 768 && creation[0].corps.height <= 768,
     JSON.stringify(creation[0] && creation[0].corps));

  /* D. sondage : job done -> vidéo en galerie */
  const d = await page.evaluate(async () => {
    await window.__v663.sonder("job-deapi-1", "Scène 1/1 · deAPI", "Ltx2_5_22B_Dist_INT8");
    const idb = await new Promise((res) => {
      const r = indexedDB.open("cinema_noir_video", 1);
      r.onupgradeneeded = () => { const dd = r.result; if (!dd.objectStoreNames.contains("kv")) dd.createObjectStore("kv"); };
      r.onsuccess = () => res(r.result); r.onerror = () => res(null);
    });
    const val = await new Promise((res) => {
      const tx = idb.transaction(["kv"], "readonly");
      const g = tx.objectStore("kv").get("gallery-idb");
      g.onsuccess = () => res(g.result || null); g.onerror = () => res(null);
    });
    let liste = []; try { liste = JSON.parse(val || "[]"); } catch (e) {}
    return { n: liste.length, modele: liste[0] && liste[0].model, url: liste[0] && liste[0].url };
  });
  ok("D. job terminé -> vidéo ajoutée à la galerie (modèle identifié deAPI)",
     d.n >= 1 && /^deapi:/.test(String(d.modele)) && /results\.deapi\.ai/.test(String(d.url)),
     JSON.stringify(d));

  /* E. SECours réel : Agnes en 503 (file pleine) -> deAPI prend le relais */
  appels.length = 0;
  const avant = await page.evaluate(() => { const b = document.getElementById("log-panel"); return b ? b.innerText.length : 0; });
  await page.evaluate(() => {
    const st = window.__v499.etat;
    st.mode = "text"; st.textBase = "un canard traverse un lac au coucher du soleil";
    st.activeModels = ["agnes-video-2.5-flash"]; st.durationFrames = 121; st.stopRequested = false;
    const ta = document.getElementById("scene-base-text");
    if (ta) { ta.value = "un canard traverse un lac au coucher du soleil"; ta.dispatchEvent(new Event("input", { bubbles: true })); }
  });
  await page.evaluate(() => { const b = document.getElementById("generate-btn"); if (b) { b.disabled = false; b.click(); } });
  /* laisser le run se dérouler (le 503 Agnes est réessayé) : on attend le
     passage par deAPI, borné à 3 min */
  let journal = "";
  for (let i = 0; i < 90; i++) {
    await page.waitForTimeout(2000);
    journal = await page.evaluate(() => { const b = document.getElementById("log-panel"); return b ? b.innerText : ""; });
    if (/Secours deAPI réussi|Secours deAPI échoué/.test(journal)) break;
  }
  const appelsDeapi = appels.filter(x => /api\.deapi\.ai/.test(x.url));
  ok("E. Agnes en 503 (file pleine) -> secours deAPI déclenché et réussi",
     /Secours deAPI réussi/.test(journal) && appelsDeapi.some(x => /videos\/generations$/.test(x.url)),
     `appels deAPI=${appelsDeapi.map(x => x.url.split("/api/v2/")[1]).join(", ") || "(aucun)"}`);

  /* F. sans clé deAPI : aucun appel (pas d'effet de bord) */
  const f = await page.evaluate(async () => {
    localStorage.removeItem("theologicus_deapi_key_v1");
    const r = await window.deapiEssayer("p", null, null, null, "S");
    return { r: r };
  });
  const appelsF = appels.filter(x => /api\.deapi\.ai/.test(x.url));
  ok("F. sans clé deAPI : aucun appel réseau et secours désactivé", f.r === false, `retour=${f.r}`);

  /* G. hygiène */
  ok("G. aucune erreur JavaScript non gérée", erreurs.length === 0, erreurs.join(" | ") || "0");

  console.log("\n-- RESULTAT : " + ok_n + " OK / " + ko_n + " ECHEC --");
  await browser.close(); serveur.close();
  process.exit(ko_n === 0 ? 0 : 1);
})().catch(e => { console.error("EXCEPTION BANC :", e); process.exit(2); });
