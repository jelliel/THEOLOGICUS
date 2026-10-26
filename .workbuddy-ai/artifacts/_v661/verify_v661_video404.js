// Banc v661 — AI VIDEO : « aucune vidéo — HTTP 404 ».
//
// Symptôme : lancer une génération vidéo se solde par « Aucune vidéo —
// HTTP 404 ». L'endpoint POST /v1/videos existe (401 sans jeton, vérifié) :
// le 404 vient donc du fournisseur pour CE modèle / CETTE URL.
//
// Trois défauts corrigés (v660b) et testés ici SANS le fournisseur (réseau
// simulé par page.route) :
//   A. URL normalisée : un endpoint personnalisé saisi avec « / » final
//      produisait « …/v1//videos » (404 « Invalid URL »).
//   B. agnes-video-2.5 est « API compatible OpenAI Videos » : le suivi doit
//      interroger /v1/videos/<id>, pas /agnesapi (dialecte v2.0) — sinon 404
//      à chaque sondage, avalé par la boucle, puis « Délai maximal ».
//   C. CHAÎNE DE REPLIS : le repli unique valait agnes-video-v2.0, c'est-à-dire
//      AUSSI le modèle par défaut — si v2.0 renvoie 404, aucun repli n'était
//      tenté (condition modelId !== VIDEO_REPLI fausse). On vérifie de bout en
//      bout qu'un 404 sur v2.0 fait basculer sur agnes-video-2.5 et que la
//      génération aboutit.
//   D. Le message final est actionnable (cause 404 explicite, plus « HTTP 404 »).
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = process.argv.includes("--port")
  ? parseInt(process.argv[process.argv.indexOf("--port") + 1], 10) : 8991;
const RACINE = path.resolve(__dirname, "..", "..", "..");
const SERVI = process.env.BENCH_ROOT ? path.resolve(process.env.BENCH_ROOT) : RACINE;
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");

const res = [];
function ok(nom, cond, detail) {
  res.push([!!cond, nom, detail === undefined ? "" : String(detail)]);
  console.log(`  ${cond ? "[OK]  " : "[ECHEC]"} ${nom}${detail !== undefined ? "  -- " + detail : ""}`);
}

(async () => {
  const serveur = http.createServer((req, rq) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/ai-video.html";
    const fp = path.join(SERVI, p.replace(/^\/+/, ""));
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      rq.writeHead(200, { "Content-Type": p.endsWith(".html") ? "text/html; charset=utf-8" : "application/octet-stream", "Cache-Control": "no-store" });
      fs.createReadStream(fp).pipe(rq);
    } else { rq.writeHead(404); rq.end("404"); }
  });
  await new Promise(r => serveur.listen(PORT, "127.0.0.1", r));

  const browser = await chromium.launch(Object.assign({ args: ["--no-sandbox", "--disable-dev-shm-usage"] },
    process.env.PW_DIR ? { executablePath: CHROME } : {}));
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const page = await ctx.newPage();
  const errJs = [];
  page.on("pageerror", e => errJs.push(String((e && e.message) || e)));
  await page.addInitScript(() => {
    try {
      localStorage.setItem("agnes_api_key", "cle-de-test");
      localStorage.setItem("theologicus_wizard_skipped", "1");
      localStorage.setItem("agnes_api_status_v1", "valid");
      localStorage.setItem("cinema_noir_active_models_v1", JSON.stringify(["agnes-video-v2.0"]));
    } catch (e) {}
  });

  /* ── RÉSEAU SIMULÉ ────────────────────────────────────────────────────
     On intercepte TOUT appel vers le fournisseur (relais /proxy/… ou direct).
     Le comportement dépend du modèle et du chemin, pour reproduire le 404. */
  const appels = [];
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    const meth = route.request().method();
    if (!/agnes-ai\.com|exemple\.test/.test(url)) return route.continue();
    let body = {};
    try { body = JSON.parse(route.request().postData() || "{}"); } catch (e) {}
    appels.push({ meth, url, model: body.model || null });
    const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

    if (meth === "GET" && /\/models/.test(url)) {
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ data: [{ id: "agnes-video-v2.0" }, { id: "agnes-video-2.5" }] }) });
    }
    if (meth === "POST" && /\/videos$/.test(url)) {
      /* 404 pour agnes-video-v2.0 (modèle retiré, scénario du bug), OK sinon */
      if (body.model === "agnes-video-v2.0") {
        return route.fulfill({ status: 404, headers: cors, body: JSON.stringify({ error: { message: "model not found", type: "invalid_request_error" } }) });
      }
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ video_id: "task-2-5", id: "task-2-5", status: "queued" }) });
    }
    if (meth === "GET" && /\/videos\/[^/]+$/.test(url)) {
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ status: "completed", metadata: { url: "https://exemple.test/video.mp4" } }) });
    }
    if (meth === "GET" && /agnesapi/.test(url)) {
      /* le dialecte v2.0 : on le laisse échouer en 404 comme le vrai serveur */
      return route.fulfill({ status: 404, headers: cors, body: "{}" });
    }
    if (/video\.mp4$/.test(url)) return route.fulfill({ status: 200, headers: { "Content-Type": "video/mp4" }, body: "faux-mp4" });
    return route.fulfill({ status: 200, headers: cors, body: "{}" });
  });

  await page.goto(`http://127.0.0.1:${PORT}/ai-video.html`, { waitUntil: "domcontentloaded", timeout: 60000 });
  /* Le point d'export de test n'existe que depuis v660b : sur un build
     antérieur (contrôle négatif), A/B/D ne sont pas testables — on le dit,
     et C (le scénario utilisateur) reste exécuté. */
  const hook = await page.waitForFunction(() => !!window.__v660b, null, { timeout: 6000 }).then(() => true).catch(() => false);
  await page.waitForTimeout(600);

  if (hook) {
  const a = await page.evaluate(async () => {
    try {
      await window.__v660b.creer("test", null, null, "agnes-video-2.5", null,
        { endpoint: "https://exemple.test/v1/", apiKey: "k", adapter: "agnes" });
      return { ok: true };
    } catch (e) { return { ok: false, erreur: String(e && e.message) }; }
  });
  const postsA = appels.filter(x => x.meth === "POST");
  ok("A. endpoint personnalisé : pas de double barre avant /videos",
     a.ok && postsA.length >= 1 && postsA.every(x => !/\/v1\/\/videos/.test(x.url) && /\/v1\/videos$/.test(x.url)),
     `retour=${JSON.stringify(a)} | ${postsA.map(x => x.url).join(" | ")}`);

  /* B. dialecte 2.5 : le suivi interroge /v1/videos/<id> (pas /agnesapi) */
  appels.length = 0;
  const b = await page.evaluate(async () => {
    try {
      const r = await window.__v660b.sonder("task-2-5", "agnes-video-2.5", "test", null);
      return { ok: true, url: r && r.videoUrl };
    } catch (e) { return { ok: false, erreur: String(e && e.message) }; }
  });
  const pollsB = appels.filter(x => x.meth === "GET");
  ok("B. agnes-video-2.5 : suivi sur /v1/videos/<id>, pas /agnesapi",
     b.ok && pollsB.some(x => /\/v1\/videos\/task-2-5$/.test(x.url)) && !pollsB.some(x => /agnesapi/.test(x.url)),
     `poll=${pollsB.map(x => x.url).join(" | ")} retour=${JSON.stringify(b)}`);
  } else {
    console.log("  [INFO] A/B/D non testables — build sans point d'export __v660b (contrôle négatif)");
  }

  /* C. chaîne de replis : 404 sur v2.0 -> bascule sur 2.5 -> succès
     (la galerie vit dans IndexedDB cinema_noir_video/kv/gallery-idb depuis v456) */
  appels.length = 0;
  const lireGalerie = () => page.evaluate(async () => {
    const idb = await new Promise((ok2) => {
      const r = indexedDB.open("cinema_noir_video", 1);
      r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv"); };
      r.onsuccess = () => ok2(r.result); r.onerror = () => ok2(null);
    });
    if (!idb) return { n: -1 };
    const val = await new Promise((ok2) => {
      const tx = idb.transaction(["kv"], "readonly");
      const g = tx.objectStore("kv").get("gallery-idb");
      g.onsuccess = () => ok2(g.result || null); g.onerror = () => ok2(null);
    });
    let list = [];
    try { list = JSON.parse(val || "[]"); } catch (e) {}
    return { n: Array.isArray(list) ? list.length : -1, modele: list[0] && list[0].model, label: list[0] && list[0].label, url: list[0] && list[0].url };
  });
  /* vider la galerie : le test B a déjà ajouté une vidéo (libellé « test ») */
  await page.evaluate(async () => {
    const idb = await new Promise((ok2) => {
      const r = indexedDB.open("cinema_noir_video", 1);
      r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv"); };
      r.onsuccess = () => ok2(r.result); r.onerror = () => ok2(null);
    });
    await new Promise((ok2) => {
      const tx = idb.transaction(["kv"], "readwrite");
      tx.objectStore("kv").delete("gallery-idb");
      tx.oncomplete = () => ok2(); tx.onerror = () => ok2();
    });
  });
  await page.evaluate(() => {
    /* préparer le mode texte + un seul modèle (le modèle par défaut, celui du bug) */
    const st = window.__v499 && window.__v499.etat;
    if (st) { st.mode = "text"; st.activeModels = ["agnes-video-v2.0"]; st.durationFrames = 121; st.textBase = "Un canard traverse un lac au coucher du soleil."; }
    const ta = document.getElementById("scene-base-text");
    if (ta) { ta.value = "Un canard traverse un lac au coucher du soleil."; ta.dispatchEvent(new Event("input", { bubbles: true })); }
  });
  await page.evaluate(() => {
    const btn = document.getElementById("generate-btn");
    if (btn) { btn.disabled = false; btn.click(); }
  });
  /* attendre une vidéo du RUN (libellé « Scène … »), pas celle du test B.
     ⚠️ l'écriture IndexedDB de la galerie est ASYNCHRONE : ne pas conclure à
     l'arrêt du run — on laisse 5 s de grâce après isRunning=false. */
  let fin = { galerie: 0, modele: null, label: null, repli: false, journal: "" };
  let arretVu = 0;
  for (let i = 0; i < 50; i++) {
    await page.waitForTimeout(1000);
    const g = await lireGalerie();
    const l = await page.evaluate(() => {
      const st = window.__v499 && window.__v499.etat;
      const log = document.getElementById("log-panel");
      return { running: !!(st && st.isRunning), repli: /Repli réussi avec agnes-video-2\.5/.test(log ? log.innerText : "") };
    });
    if (g.n >= 1 && /^Scène/.test(String(g.label || ""))) { fin = { galerie: g.n, modele: g.modele, label: g.label, repli: l.repli, journal: "" }; break; }
    if (!l.running) { arretVu++; if (arretVu >= 5) { fin = { galerie: g.n, modele: g.modele, label: g.label, repli: l.repli, journal: "" }; break; } }
    else arretVu = 0;
  }
  const postsC = appels.filter(x => x.meth === "POST").map(x => x.model);
  ok("C. 404 sur agnes-video-v2.0 -> repli automatique sur agnes-video-2.5 et succès",
     fin.galerie >= 1 && /^Scène/.test(String(fin.label || "")) && fin.modele === "agnes-video-2.5" &&
     postsC[0] === "agnes-video-v2.0" && postsC.includes("agnes-video-2.5"),
     `galerie=${fin.galerie} label=${fin.label} modèle=${fin.modele} repliLog=${fin.repli} POST=${postsC.join(" -> ")}`);

  /* D. message final actionnable : la branche 404 de classerEchec doit rendre
     une cause explicite, et plus jamais le texte brut « HTTP 404 ». */
  if (hook) {
    const d = await page.evaluate(() => {
      const f = window.__v660b.classer;
      return { brut: f("HTTP 404"), autre: f("HTTP 500") };
    });
    ok("D. cause 404 explicite (branche dédiée dans classerEchec)",
       /route vidéo introuvable/i.test(d.brut) && !/^HTTP 404$/.test(d.brut),
       `404 -> « ${d.brut} » | 500 -> « ${d.autre} »`);
  }

  /* E. hygiène */
  ok("E. aucune erreur JavaScript non gérée", errJs.length === 0, errJs.slice(0, 2).join(" | "));

  const bons = res.filter(r => r[0]).length;
  console.log(`\n${bons}/${res.length} — ${bons === res.length ? "OK" : "ECHEC"}`);
  await browser.close(); serveur.close();
  process.exit(bons === res.length ? 0 : 1);
})().catch(e => { console.error("EXCEPTION :", e && e.stack || e); process.exit(2); });
