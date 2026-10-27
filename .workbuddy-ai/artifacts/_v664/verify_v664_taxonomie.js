/* v664 — taxonomie d'échecs : la décision est prise UNE fois (un `kind`), la
   phrase, le conseil, la priorité et la RÉFÉRENCE en dérivent.
   Pourquoi ce banc existe : le classement rendait directement le texte affiché,
   si bien que `causeProbable` devait re-tester les PHRASES produites (PRIORITE
   était une liste de regex sur le texte) — changer une virgule cassait l'ordre
   en silence. Chaque test ci-dessous porte sur la STRUCTURE, pas sur les mots :
   on mute une entrée de la table et on exige que la sortie suive. Un build qui
   re-teste le texte ne peut pas passer D ni G.
   Réseau simulé (page.route) : aucun appel réel, aucune clé consommée. */
const path = require("path");
const http = require("http");
const fs = require("fs");
const { chromium } = require("playwright");

const PORT = Number(process.env.PORT || 9314);
const RACINE = path.resolve(process.env.BENCH_ROOT || path.resolve(__dirname, "..", "..", ".."));
const PW = process.env.PW_DIR || "C:/Users/toshr/AppData/Local/ms-playwright";
const CHROME = path.join(PW, "chromium-1234", "chrome-win64", "chrome.exe");
const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

/* Corps RÉELS du fournisseur, relevés en production le 2026-10-27. */
const CORPS_QUOTA = '{"code":"insufficient_user_quota","message":"pre-consume quota failed","remaining":0.1,"required":0.125}';
const CORPS_FILE = '{"code":"video_queue_full","message":"video queue is full, please retry later"}';
const CORPS_RETIRE = '{"code":"model_not_found","message":"model agnes-video-v2.0 is retired"}';

/* Référence bornée : jetons fixes uniquement. La même forme que
   packages/user-errors (openbot) — pas de schéma, pas de requête, pas d'espace. */
const REF = /^(?=.{3,64}$)[a-z][a-z0-9_-]{0,15}(?:\/[A-Za-z0-9_.-]{1,40}){1,3}$/;

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

  await page.route("**/proxy/**", async (route) => {
    if (/\/videos$/.test(route.request().url())) {
      return route.fulfill({ status: 401, headers: CORS, body: '{"code":"invalid_api_key","message":"Invalid token"}' });
    }
    return route.continue();
  });
  /* clé présente : l'écran de génération reste utilisable */
  await page.addInitScript(() => {
    if (window.top !== window) return;
    /* le vrai emplacement de la clé Agnes (SK.AGNES), sinon l'écran refuse de
       démarrer et le scénario J passerait à vide */
    try { localStorage.setItem("agnes_api_key", "sk-test-key"); } catch (e) {}
  });

  await page.goto(`http://127.0.0.1:${PORT}/ai-video.html`, { waitUntil: "domcontentloaded", timeout: 60000 });

  /* Le hook est la PRÉMISSE : sans lui, tous les tests seraient vides. */
  const pret = await page.waitForFunction(() => !!(window.__v664 && window.__v664.gen === "v664"), null, { timeout: 30000 })
    .then(() => true).catch(() => false);
  ok("0. hook __v664 présent (prémisse)", pret, pret ? "gen=v664" : "aucun __v664.gen — build sans taxonomie");
  if (!pret) {
    console.log("\n-- RESULTAT : " + ok_n + " OK / " + ko_n + " ECHEC --");
    await browser.close(); serveur.close();
    process.exit(1);
  }

  /* A. classement — un kind par panne mesurée, et le texte reste celui du kind */
  const a = await page.evaluate(([q, f, r]) => {
    const c = window.__v664;
    const msgs = {
      quota: "HTTP 403 " + q, file: "HTTP 503 " + f, cle: "HTTP 401 unauthorized",
      limite: "HTTP 429 too many requests", requete: "HTTP 400 bad request",
      route: "HTTP 404 Not Found", service: "HTTP 500 " + r,
      reseau: "TypeError: Failed to fetch", assemblage: "ffmpeg montage impossible",
      media: "les fichiers joints exigent une URL PUBLIQUE",
      inconnu: "bonjour"
    };
    const out = {};
    for (const k in msgs) out[k] = { kind: c.kind(msgs[k]), texte: c.texte(msgs[k]) };
    return out;
  }, [CORPS_QUOTA, CORPS_FILE, CORPS_RETIRE]);
  const attendus = ["quota", "file", "cle", "limite", "requete", "route", "service", "reseau", "assemblage", "media", "inconnu"];
  const mauvais = attendus.filter(k => a[k] && a[k].kind !== k).map(k => k + "->" + a[k].kind);
  ok("A. chaque panne mesurée a son kind, sans confusion",
     mauvais.length === 0, mauvais.join(", ") || "11/11");
  /* A'. le texte dérive du kind (quota ≠ clé, montants conservés dans les DEUX
     formes de corps : JSON et recopie en clair) */
  const a2 = await page.evaluate(() => {
    const c = window.__v664;
    return { json: c.texte('HTTP 403 {"code":"insufficient_user_quota","remaining":0.1,"required":0.125}'),
             clair: c.texte("HTTP 403 insufficient_user_quota remaining: 0.100000 required: 0.125000"),
             cle: c.texte("HTTP 401 unauthorized") };
  });
  ok("A'. le texte dérive du kind (quota ≠ clé, montants dans les deux formes de corps)",
     /solde Agnes insuffisant/.test(a2.json) && /0\.1/.test(a2.json) &&
     /0\.100000/.test(a2.clair) && /0\.125000/.test(a2.clair) &&
     !/clé/i.test(a2.json) && /clé Agnes refusée/.test(a2.cle),
     `json=« ${a2.json} » | clair=« ${a2.clair} »`);

  /* B. référence bornée, et étanche aux URL / jetons / chemins */
  const b = await page.evaluate(([q]) => {
    const c = window.__v664;
    const piege = "HTTP 404 GET https://apihub.agnes-ai.com/v1/videos?model=x&k=1 Authorization: Bearer sk-abc123def456 (C:\\tmp\\a b\\x.mp4)";
    const ttes = ["HTTP 403 " + q, "HTTP 503 file", "HTTP 401 unauthorized", "HTTP 429", "HTTP 400",
                  "HTTP 404", "HTTP 500", "Failed to fetch ECONNREFUSED", "ffmpeg", "data:", "bonjour", piege];
    return ttes.map(m => ({ m: m.slice(0, 28), ref: c.ref(m) }));
  }, [CORPS_QUOTA]);
  const toutesBornees = b.every(x => typeof x.ref === "string" && REF.test(x.ref));
  const fuites = b.filter(x => /:\/\/|\?|&|sk-|\\|\s/.test(String(x.ref)));
  ok("B. toute référence est bornée (3 à 64 c., jetons fixes uniquement)",
     toutesBornees, b.map(x => x.ref).join(" | "));
  ok("B'. aucune URL, requête, jeton ni chemin ne fuit dans la référence",
     fuites.length === 0, fuites.map(x => x.m + " => " + x.ref).join(" ; ") || "0 fuite");

  /* C. référence STABLE : deux messages sans statut du même kind partagent la
     référence — c'est le kind qui la porte, pas le message. Le statut, quand il
     est présent, s'ajoute sans jamais sortir du motif. */
  const c2 = await page.evaluate(() => {
    const c = window.__v664;
    return { a: c.ref("invalid api key"), b: c.ref("unauthorized"),
             inconnu: c.ref("bonjour"), avecStatut: c.ref("HTTP 401 unauthorized") };
  });
  ok("C. référence stable par kind, statut ajouté sans casser le motif",
     c2.a === c2.b && c2.a === "video/cle" && REF.test(c2.avecStatut) &&
     REF.test(c2.inconnu) && c2.inconnu === "video/inconnu",
     JSON.stringify(c2));

  /* D. PRIORITÉ DANS LA DONNÉE : on mute prio, le vainqueur doit suivre.
     Un build qui garde une liste de regex sur les phrases ne peut pas passer. */
  const d = await page.evaluate(([q, r]) => {
    const c = window.__v664, e = c.table;
    const avant = c.cause(["HTTP 500 " + r, "HTTP 403 " + q]);
    const pQuota = e.quota.prio, pService = e.service.prio;
    e.quota.prio = 99;                       /* le quota devient le MOINS prioritaire */
    const apres = c.cause(["HTTP 500 " + r, "HTTP 403 " + q]);
    e.quota.prio = pQuota; e.service.prio = pService;
    return { avant: avant, apres: apres };
  }, [CORPS_QUOTA, CORPS_RETIRE]);
  ok("D. la priorité vient de la table (muter prio change le vainqueur)",
     /solde Agnes insuffisant/.test(d.avant) && !/solde|quota/i.test(d.apres),
     `avant=« ${String(d.avant).slice(0, 60)} » | apres mutation=« ${String(d.apres).slice(0, 60)} »`);

  /* E. phrase et conseil de la MÊME entrée : muter le conseil ne doit pas
     toucher la phrase, et le conseil affiché doit être le muté. */
  const e2 = await page.evaluate(([q]) => {
    const c = window.__v664, e = c.table;
    const t0 = c.texte("HTTP 403 " + q), c0 = c.conseil("HTTP 403 " + q);
    const tTexte = e.quota.texte, tConseil = e.quota.conseil;
    e.quota.conseil = "CONSEIL-MARQUE";
    const t1 = c.texte("HTTP 403 " + q), c1 = c.conseil("HTTP 403 " + q);
    e.quota.texte = () => "TEXTE-MARQUE";
    const t2 = c.texte("HTTP 403 " + q), c2b = c.conseil("HTTP 403 " + q);
    e.quota.texte = tTexte; e.quota.conseil = tConseil;
    return { t0, c0, t1, c1, t2, c2b };
  }, [CORPS_QUOTA]);
  ok("E. phrase et conseil dérivent de la même entrée (mutations indépendantes)",
     e2.t1 === e2.t0 && e2.c1 === "CONSEIL-MARQUE" && e2.t2 === "TEXTE-MARQUE" && e2.c2b === "CONSEIL-MARQUE",
     JSON.stringify(e2));

  /* F. `cause` = la plus ACTIONNABLE, jamais la plus fréquente ; et elle joint
     le conseil. Cas mesuré : 5 × 500 « retiré » + 1 × 403 quota. */
  const f = await page.evaluate(([q, r]) => {
    const l = [];
    for (let i = 0; i < 5; i++) l.push("HTTP 500 " + r);
    l.push("HTTP 403 " + q);
    return window.__v664.cause(l);
  }, [CORPS_QUOTA, CORPS_RETIRE]);
  ok("F. cause = la plus actionnable (1 quota bat 5 × 500) et porte le conseil",
     /solde Agnes insuffisant/.test(f) && !/indisponible/i.test(f) && /rechargez|Flash/.test(f),
     String(f).slice(0, 120));

  /* G. ARRÊT FATAL décidé par le kind, pas par une regex sur la phrase :
     on renomme le texte de `cle`, l'arrêt doit toujours se déclencher. */
  const g = await page.evaluate(() => {
    const c = window.__v664, e = c.table;
    const t = e.cle.texte;
    e.cle.texte = () => "autre chose";
    const apresRenommage = c.estFatale("HTTP 401 unauthorized");
    e.cle.texte = t;
    return { apresRenommage: apresRenommage, normal: c.estFatale("HTTP 401 unauthorized"),
             quota: c.estFatale("HTTP 403 insufficient_user_quota"), route: c.estFatale("HTTP 404") };
  });
  ok("G. l'arrêt fatal suit le kind (survit au renommage du texte, épargne le quota)",
     g.apresRenommage === true && g.normal === true && g.quota === false && g.route === false,
     JSON.stringify(g));

  /* G'. l'arrêt après épuisement du solde suit le kind, lui aussi : il y avait
     un SECOND test sur la phrase (/solde Agnes insuffisant/ dans le run). */
  const gp = await page.evaluate(() => {
    const c = window.__v664, e = c.table;
    const t = e.quota.texte;
    e.quota.texte = () => "solde rechargé";
    const apresRenommage = c.definitif("HTTP 403 insufficient_user_quota remaining: 0.1");
    e.quota.texte = t;
    return { apresRenommage: apresRenommage,
             normal: c.definitif("HTTP 403 insufficient_user_quota"),
             cle: c.definitif("HTTP 401 unauthorized"),
             route: c.definitif("HTTP 404") };
  });
  ok("G'. l'arrêt sur quota épuisé suit le kind (survit au renommage, épargne la clé et le 404)",
     gp.apresRenommage === true && gp.normal === true && gp.cle === false && gp.route === false,
     JSON.stringify(gp));

  /* J. INTÉGRATION : un run qui échoue affiche la référence dans le résumé, et
     la référence désigne la MÊME panne que la phrase (même décision). */
  await page.evaluate(() => {
    const st = window.__v499.etat;
    st.mode = "text"; st.textBase = "un canard traverse un lac";
    st.activeModels = ["agnes-video-2.5-flash"]; st.durationFrames = 121; st.stopRequested = false;
    const ta = document.getElementById("scene-base-text");
    if (ta) { ta.value = "un canard traverse un lac"; ta.dispatchEvent(new Event("input", { bubbles: true })); }
    const b = document.getElementById("generate-btn"); if (b) { b.disabled = false; b.click(); }
  });
  let journal = "";
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(2000);
    journal = await page.evaluate(() => { const b = document.getElementById("log-panel"); return b ? b.innerText : ""; });
    if (/Aucune vidéo/.test(journal)) break;
  }
  const presente = /réf\. video\/http-401\/cle/.test(journal);
  const memePanne = /clé Agnes refusée/.test(journal);
  ok("J. le résumé d'un run réel affiche la référence, et elle désigne la même panne",
     presente && memePanne,
     (journal.match(/Aucune vidéo[^\n]*/) || ["(aucune ligne de résumé)"])[0].slice(0, 160));

  /* H. l'inconnu reste borné : 140 caractères, jamais le brut entier */
  const h = await page.evaluate(() => {
    const long = "z".repeat(600);
    return { t: window.__v664.texte(long), k: window.__v664.kind(long) };
  });
  ok("H. message inconnu tronqué à 140 c. et classé « inconnu »",
     h.t.length <= 140 && h.k === "inconnu", h.t.length + " c. / kind=" + h.k);

  /* I. hygiène */
  ok("I. aucune erreur JavaScript non gérée", erreurs.length === 0, erreurs.join(" | ") || "0");

  console.log("\n-- RESULTAT : " + ok_n + " OK / " + ko_n + " ECHEC --");
  await browser.close(); serveur.close();
  process.exit(ko_n === 0 ? 0 : 1);
})().catch(e => { console.error("EXCEPTION BANC :", e); process.exit(2); });
