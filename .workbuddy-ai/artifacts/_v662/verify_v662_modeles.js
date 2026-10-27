/* v662 — AI VIDEO : modèles retirés, quota, file d'attente.
   Vérifie SANS réseau (sauf le dernier point) :
   - la migration d'un store qui contient encore agnes-video-v2.0 ;
   - le classement des causes (quota, file pleine, 404, 401) ;
   - la priorité de la cause affichée (quota > service indisponible) ;
   - la liste des modèles proposés (v2.0 absent) et le défaut (2.5 Flash). */
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = Number(process.env.PORT || 9111);
const RACINE = path.resolve(process.env.BENCH_ROOT || "C:/tmp/theoverify");
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

let ok_n = 0, ko_n = 0;
function ok(nom, cond, detail) {
  if (cond) { ok_n++; console.log("[OK]   " + nom + (detail ? "  — " + detail : "")); }
  else { ko_n++; console.log("[ECHEC] " + nom + "  — " + detail); }
}

/* Corps RÉELS relevés le 2026-10-27 (curl direct sur apihub.agnes-ai.com). */
const CORPS_QUOTA = '{"code":"insufficient_user_quota","message":"Failed to pre-consume quota, remaining: ＄0.100000, required: ＄0.125000 (request id: 20261027060809746905011c7uUb7bC)","data":null}';
const CORPS_FILE = '{"code":"video_queue_full","message":"video queue is full, please retry later (request id: 202610270608167982099505SHaxva9)","data":null}';
const CORPS_RETIRE = '{"error":{"code":"get_channel_failed","message":"Model agnes-video-v2.0 is temporarily unavailable. Please try again later","type":"AgnesAI_error"}}';

(async () => {
  const serveur = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/ai-video.html";
    const fp = path.join(RACINE, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      fs.createReadStream(fp).pipe(res);
    } else { res.writeHead(404); res.end("404"); }
  });
  await new Promise(r => serveur.listen(PORT, "127.0.0.1", r));

  const browser = await chromium.launch(Object.assign({ args: ["--no-sandbox"] },
    process.env.PW_DIR ? { executablePath: CHROME } : {}));
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const page = await ctx.newPage();
  const erreursJs = [];
  page.on("pageerror", e => erreursJs.push(String(e.message)));

  /* store de l'utilisateur AVANT correctif : uniquement le modèle retiré.
     GARDE `window.top === window` : addInitScript s'exécute dans CHAQUE frame ;
     l'iframe about:blank créée après le démarrage réécrivait le store et
     masquait la migration (mesuré : 3 écritures flash puis v2.0 relu). */
  await page.addInitScript(() => {
    if (window.top !== window) return;
    try {
      localStorage.setItem("agnes_selected_model_v1", "agnes-video-v2.0");
      localStorage.setItem("cinema_noir_active_models_v1", JSON.stringify(["agnes-video-v2.0"]));
    } catch (e) {}
  });

  await page.goto(`http://127.0.0.1:${PORT}/ai-video.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => !!window.__v660b, null, { timeout: 30000 });
  await page.waitForTimeout(800);

  /* A. migration : le modèle retiré devient 2.5 Flash, y compris dans le store */
  const a = await page.evaluate(() => ({
    actifs: window.__v499 && window.__v499.etat ? window.__v499.etat.activeModels : null,
    stocke: localStorage.getItem("cinema_noir_active_models_v1"),
    defaut: typeof window.__v660b.defaut === "function" ? window.__v660b.defaut() : "(hook absent)",
    modeleStocke: localStorage.getItem("agnes_selected_model_v1")
  }));
  ok("A. store v2.0 migré vers 2.5 Flash (mémoire + localStorage)",
     Array.isArray(a.actifs) && a.actifs.length === 1 && a.actifs[0] === "agnes-video-2.5-flash" &&
     /agnes-video-2\.5-flash/.test(String(a.stocke)) &&
     a.defaut === "agnes-video-2.5-flash" && a.modeleStocke === "agnes-video-2.5-flash",
     JSON.stringify(a));

  /* B. classement : quota (corps réel du fournisseur) */
  const b = await page.evaluate((corps) => window.__v660b.classer("HTTP 403 " + corps), CORPS_QUOTA);
  ok("B. quota épuisé → cause explicite avec les montants",
     /solde Agnes insuffisant/.test(b) && /0\.100000/.test(b) && /0\.125000/.test(b) && !/clé/i.test(b),
     b);

  /* C. classement : file vidéo pleine */
  const c = await page.evaluate((corps) => window.__v660b.classer("HTTP 503 " + corps), CORPS_FILE);
  ok("C. file vidéo pleine → cause explicite",
     /file d'attente vidéo/i.test(c), c);

  /* D. non-régression : 404 et 401 gardent leur classement */
  const dd = await page.evaluate(() => ({
    f404: window.__v660b.classer("HTTP 404 Not Found"),
    f401: window.__v660b.classer("HTTP 401 unauthorized")
  }));
  ok("D. 404 et 401 gardent leur classement",
     /route vidéo introuvable/i.test(dd.f404) && /clé Agnes refusée/i.test(dd.f401),
     JSON.stringify(dd));

  /* E. priorité : 500 (modèle retiré) + 403 (quota) → le QUOTA est affiché */
  const e = await page.evaluate(([retire, quota]) => {
    if (typeof window.__v660b.cause !== "function") return "(hook absent)";
    return window.__v660b.cause(["HTTP 500 " + retire, "HTTP 403 " + quota]);
  }, [CORPS_RETIRE, CORPS_QUOTA]);
  ok("E. cause affichée = la plus actionnable (quota), pas « service indisponible »",
     /solde Agnes insuffisant/.test(e) && !/indisponible/i.test(e), e);

  /* F. liste des modèles : v2.0 plus proposé, 2.5 Flash en tête */
  const f = await page.evaluate(() => {
    const l = (window.loadDetectedAgnes && window.loadDetectedAgnes()) || [];
    return l.map(x => x.id);
  });
  ok("F. agnes-video-v2.0 retiré de la liste, 2.5 Flash présent",
     !f.includes("agnes-video-v2.0") && f.includes("agnes-video-2.5-flash") && f.includes("agnes-video-2.5"),
     f.join(", "));

  /* G. hygiène */
  ok("G. aucune erreur JS au chargement", erreursJs.length === 0, erreursJs.join(" | ") || "0");

  console.log("\n— RESULTAT : " + ok_n + " OK / " + ko_n + " ECHEC —");
  await browser.close();
  serveur.close();
  process.exit(ko_n === 0 ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
