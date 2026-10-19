/* ═══════════════════════════════════════════════════════════════
   Banc v611 — TRANSPORT NATIF DE SECOURS (APK Android) + non-régression 422.

   Historique : sur l'APK il n'y a aucun relais local, la requête part du
   WebView (Origin https://localhost, UA WebView) et le WAF répond 403.

   🔴 v611b — le premier jet envoyait `body` à CapacitorHttp, qui attend
   `data` (et renvoie `data`). Résultat sur appareil : POST SANS corps ->
   422 « field required ». Ce banc mocke donc les CONTRATS RÉELS :
     · NetBridge.httpRequest  : entrée `body`, réponse `body` ;
     · CapacitorHttp.request  : entrée `data`, réponse `data` ;
       un mock qui reçoit `body` répond 422 au corps VIDE (le bug).
   Et il vérifie qu'un tel 422 ne masque JAMAIS le 403 d'origine.

   Sections :
   1. direct 200 -> aucun appel natif ;
   2. direct 403 -> rejeu natif (NetBridge, corps POST + Authorization) ;
   3. échec réseau/CORS -> rejeu natif ;
   4. 401 -> aucun repli ;
   5. URL locale -> jamais de natif ;
   6. CapacitorHttp seul -> `data` en entrée ET en sortie ;
   7. les deux ponts -> NetBridge prioritaire, CapacitorHttp en second ;
   8. RÉGRESSION 422 : pont qui ignore le corps -> 422 vide -> on rend le 403 ;
   9. autonomie sans plugin Filesystem ;
  10. desktop (sans Capacitor) -> 403 tel quel ;
  11. zéro erreur JS.
   ════════════════════════════════════════════════════════════════ */
const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
const resultats = [];
function section(t) { console.log("\n■ " + t); }
function ok(label, cond, detail) {
  resultats.push({ label, pass: !!cond });
  console.log((cond ? "  [OK]   " : "  [ECHEC]") + " " + label + (detail ? " — " + detail : ""));
}

/* Mock APK : contrats RÉELS des deux ponts. */
const MOCK_CAPACITOR = () => {
  window.__appelsNatifs = [];
  window.__appelsCapHttp = [];
  window.__netBridgeRepond = true;      /* false -> le pont rejette */
  window.__capHttpRepond = true;
  window.__netBridgeIgnoreCorps = false; /* true -> simule le bug (corps perdu) */
  window.Capacitor = {
    isNativePlatform: function () { return true; },
    Plugins: {
      Filesystem: { writeFile: function () { return Promise.resolve({ uri: "file:///tmp/x" }); } },
      NetBridge: {
        gateway: function () { return Promise.resolve({ gateway: "", localIp: "" }); },
        httpRequest: function (o) {
          window.__appelsNatifs.push(JSON.parse(JSON.stringify(o)));
          if (!window.__netBridgeRepond) return Promise.reject(new Error("pont indisponible"));
          /* contrat NetBridge : le corps est dans `body` */
          var corps = window.__netBridgeIgnoreCorps ? null : o.body;
          if (corps == null && String(o.method || "").toUpperCase() !== "GET") {
            /* POST sans corps : c'est EXACTEMENT ce que le serveur rejette */
            return Promise.resolve({ status: 422, headers: {}, body: "" });
          }
          return Promise.resolve({ status: 200, headers: { "content-type": "application/json" }, body: '{"via":"netbridge"}' });
        }
      },
      CapacitorHttp: {
        request: function (o) {
          window.__appelsCapHttp.push(JSON.parse(JSON.stringify(o)));
          if (!window.__capHttpRepond) return Promise.reject(new Error("CapacitorHttp indisponible"));
          /* contrat CapacitorHttp : le corps est dans `data` */
          if (o.data == null && String(o.method || "").toUpperCase() !== "GET") {
            return Promise.resolve({ status: 422, headers: {}, data: "" });
          }
          return Promise.resolve({ status: 200, headers: { "content-type": "application/json" }, data: '{"via":"capacitor-http"}' });
        }
      }
    }
  };
};

(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v611b_" + Date.now()) });
  const browser = await H.launchBrowser();

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const bruit = [];
  page.on("pageerror", e => bruit.push(String(e).slice(0, 200)));
  await page.addInitScript(MOCK_CAPACITOR);
  await page.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2200);

  const URL_API = "https://api.mistral.ai/v1/chat/completions";
  const INIT = {
    method: "POST",
    headers: { "content-type": "application/json", "Authorization": "Bearer fake-key-banc" },
    body: JSON.stringify({ model: "mistral-small-latest", messages: [{ role: "user", content: "x" }] })
  };

  section("0. Module chargé, ponts détectés (ordre de préférence)");
  const etat0 = await page.evaluate(() => ({
    f: typeof window.theoFetchReseau,
    direct: typeof window.__theoFetchDirect,
    ponts: window.__theoTransportDisponible ? window.__theoTransportDisponible() : "(absent)"
  }));
  ok("window.theoFetchReseau exposé", etat0.f === "function", etat0.f);
  ok("fetch d'origine capturé (pas de récursion)", etat0.direct === "function", etat0.direct);
  ok("ponts = NetBridge puis CapacitorHttp", etat0.ponts === "NetBridge,CapacitorHttp", String(etat0.ponts));

  /* ── 1. direct 200 : aucun repli ── */
  section("1. Direct 200 — le repli natif ne s'active PAS");
  await page.route("**/chat/completions*", route => route.fulfill({
    status: 200, contentType: "application/json", body: '{"ok":true,"via":"direct"}'
  }));
  const r1 = await page.evaluate(async ({ u, i }) => {
    window.__appelsNatifs.length = 0; window.__appelsCapHttp.length = 0;
    const r = await window.fetch(u, i);
    return { status: r.status, texte: await r.text(), n: window.__appelsNatifs.length + window.__appelsCapHttp.length };
  }, { u: URL_API, i: INIT });
  ok("status 200 rendu par la voie DIRECTE", r1.status === 200 && /direct/.test(r1.texte), r1.texte);
  ok("AUCUN appel natif (streaming préservé)", r1.n === 0, r1.n + " appel(s)");
  await page.unroute("**/chat/completions*");

  /* ── 2. direct 403 -> rejeu NetBridge ── */
  section("2. Direct 403 (WAF) — rejeu NetBridge avec corps et Authorization");
  await page.route("**/chat/completions*", route => route.fulfill({
    status: 403, contentType: "text/html",
    body: "<html><head><title>Attention Required! | Cloudflare</title></head><body>blocked</body></html>"
  }));
  const r2 = await page.evaluate(async ({ u, i }) => {
    window.__appelsNatifs.length = 0; window.__appelsCapHttp.length = 0;
    const r = await window.fetch(u, i);
    return {
      status: r.status, texte: await r.text(),
      appel: window.__appelsNatifs[0] || null, nb: window.__appelsNatifs.length,
      transport: window.__dernierTransport || null
    };
  }, { u: URL_API, i: INIT });
  ok("l'appelant reçoit 200 (WAF du WebView contourné)", r2.status === 200, "status=" + r2.status);
  ok("le corps vient du NATIF", /netbridge/.test(r2.texte), r2.texte.slice(0, 60));
  ok("transport mémorisé = natif / NetBridge",
     r2.transport && r2.transport.utilise === "natif" && r2.transport.pont === "NetBridge",
     JSON.stringify(r2.transport && { u: r2.transport.utilise, p: r2.transport.pont }));
  ok("l'appel natif porte le corps POST et l'Authorization",
     !!r2.appel && r2.appel.method === "POST" && /Bearer fake-key-banc/.test(JSON.stringify(r2.appel.headers)) &&
     /mistral-small-latest/.test(String(r2.appel.body)),
     r2.appel ? r2.appel.method : "(aucun)");
  const cles = r2.appel ? Object.keys(r2.appel.headers || {}).map(k => k.toLowerCase()) : [];
  ok("AUCUN en-tête de navigateur (origin / sec-fetch / referer)",
     !cles.includes("origin") && !cles.some(k => k.indexOf("sec-fetch") === 0) && !cles.includes("referer"),
     cles.join(","));
  ok("CapacitorHttp non sollicité (NetBridge prioritaire)", r2.nb === 1, r2.nb + " appel(s)");
  await page.unroute("**/chat/completions*");

  /* ── 3. échec réseau -> rejeu natif ── */
  section("3. Échec réseau/CORS — rejeu natif au lieu d'une erreur");
  await page.route("**/chat/completions*", route => route.abort("failed"));
  const r3 = await page.evaluate(async ({ u, i }) => {
    window.__appelsNatifs.length = 0;
    try {
      const r = await window.fetch(u, i);
      return { status: r.status, texte: await r.text(), n: window.__appelsNatifs.length };
    } catch (e) { return { erreur: String(e && e.message), n: window.__appelsNatifs.length }; }
  }, { u: URL_API, i: INIT });
  ok("la requête aboutit malgré l'échec direct", r3.status === 200 && /netbridge/.test(r3.texte || ""), r3.erreur || ("status=" + r3.status));
  ok("rejeu natif effectué", r3.n === 1, r3.n + " appel(s)");
  await page.unroute("**/chat/completions*");

  /* ── 4. 401 : aucun repli ── */
  section("4. 401 — AUCUN repli (une clé invalide reste une clé invalide)");
  await page.route("**/chat/completions*", route => route.fulfill({
    status: 401, contentType: "application/json", body: '{"details":"Invalid API Key"}'
  }));
  const r4 = await page.evaluate(async ({ u, i }) => {
    window.__appelsNatifs.length = 0; window.__appelsCapHttp.length = 0;
    const r = await window.fetch(u, i);
    return { status: r.status, n: window.__appelsNatifs.length + window.__appelsCapHttp.length };
  }, { u: URL_API, i: INIT });
  ok("status 401 conservé", r4.status === 401, "status=" + r4.status);
  ok("AUCUN appel natif sur 401", r4.n === 0, r4.n + " appel(s)");
  await page.unroute("**/chat/completions*");

  /* ── 5. URL locale ── */
  section("5. URL locale — jamais de transport natif");
  const r5 = await page.evaluate(async () => {
    window.__appelsNatifs.length = 0; window.__appelsCapHttp.length = 0;
    const r = await window.fetch("/theologicus-keys", { method: "GET" });
    return { status: r.status, n: window.__appelsNatifs.length + window.__appelsCapHttp.length };
  });
  ok("/theologicus-keys servi localement", r5.status === 200, "status=" + r5.status);
  ok("aucun appel natif pour une URL locale", r5.n === 0, r5.n + " appel(s)");

  /* ── 6. CapacitorHttp SEUL : contrat `data` ── */
  section("6. CapacitorHttp seul — corps envoyé dans `data`, lu dans `data`");
  await page.route("**/chat/completions*", route => route.fulfill({
    status: 403, contentType: "application/json", body: '{"error":{"message":"Forbidden"}}'
  }));
  const r6 = await page.evaluate(async ({ u, i }) => {
    window.__appelsNatifs.length = 0; window.__appelsCapHttp.length = 0;
    window.__dernierTransport = null;
    const sauv = window.Capacitor.Plugins.NetBridge;
    delete window.Capacitor.Plugins.NetBridge;   /* force CapacitorHttp */
    try {
      const r = await window.theoFetchReseau(u, i);
      return {
        status: r.status, texte: await r.text(),
        appel: window.__appelsCapHttp[0] || null,
        nbNet: window.__appelsNatifs.length,
        transport: window.__dernierTransport
      };
    } finally { window.Capacitor.Plugins.NetBridge = sauv; }
  }, { u: URL_API, i: INIT });
  ok("CapacitorHttp utilisé", r6.transport && r6.transport.pont === "CapacitorHttp", JSON.stringify(r6.transport && r6.transport.pont));
  ok("le corps part dans `data` (PAS `body`)",
     !!r6.appel && typeof r6.appel.data === "string" && /mistral-small-latest/.test(r6.appel.data) && r6.appel.body === undefined,
     r6.appel ? ("data=" + String(r6.appel.data).slice(0, 24) + " body=" + String(r6.appel.body)) : "(aucun)");
  ok("la réponse est LUE dans `data` (pas de corps vide)", r6.status === 200 && /capacitor-http/.test(r6.texte),
     "status=" + r6.status + " texte=" + String(r6.texte).slice(0, 40));
  await page.unroute("**/chat/completions*");

  /* ── 7. les deux ponts : NetBridge d'abord, CapacitorHttp en secours ── */
  section("7. NetBridge échoue — CapacitorHttp prend le relais");
  await page.route("**/chat/completions*", route => route.fulfill({
    status: 403, contentType: "application/json", body: '{"error":{"message":"Forbidden"}}'
  }));
  const r7 = await page.evaluate(async ({ u, i }) => {
    window.__appelsNatifs.length = 0; window.__appelsCapHttp.length = 0;
    window.__netBridgeRepond = false;   /* premier pont en échec */
    try {
      const r = await window.theoFetchReseau(u, i);
      return { status: r.status, texte: await r.text(),
               nbNet: window.__appelsNatifs.length, nbCap: window.__appelsCapHttp.length,
               transport: window.__dernierTransport };
    } finally { window.__netBridgeRepond = true; }
  }, { u: URL_API, i: INIT });
  ok("les deux ponts ont été tentés", r7.nbNet === 1 && r7.nbCap === 1, "net=" + r7.nbNet + " cap=" + r7.nbCap);
  ok("la réponse vient de CapacitorHttp", r7.status === 200 && /capacitor-http/.test(r7.texte), "status=" + r7.status);
  ok("les tentatives sont tracées", !!(r7.transport && r7.transport.tentatives && r7.transport.tentatives.length === 2),
     JSON.stringify(r7.transport && r7.transport.tentatives));
  await page.unroute("**/chat/completions*");

  /* ── 8. RÉGRESSION 422 : un pont qui perd le corps ne doit pas masquer le 403 ── */
  section("8. Régression 422 — corps perdu -> on rend le 403, JAMAIS un faux 422");
  await page.route("**/chat/completions*", route => route.fulfill({
    status: 403, contentType: "text/html", body: "blocked"
  }));
  const r8 = await page.evaluate(async ({ u, i }) => {
    window.__appelsNatifs.length = 0; window.__appelsCapHttp.length = 0;
    window.__dernierTransport = null;
    /* simule le bug v611 : NetBridge ne transmet plus le corps -> 422 vide */
    window.__netBridgeIgnoreCorps = true;
    window.__capHttpRepond = false;
    try {
      const r = await window.theoFetchReseau(u, i);
      return { status: r.status, texte: await r.text(), transport: window.__dernierTransport };
    } finally { window.__netBridgeIgnoreCorps = false; window.__capHttpRepond = true; }
  }, { u: URL_API, i: INIT });
  ok("le 422 natif n'est PAS rendu à l'appelant", r8.status !== 422, "status=" + r8.status);
  ok("c'est le 403 DIRECT d'origine qui est rendu", r8.status === 403, "status=" + r8.status);
  ok("le corps vide est tracé comme échec de pont",
     !!(r8.transport && r8.transport.tentatives && r8.transport.tentatives.some(t => t.corpsVide === true)),
     JSON.stringify(r8.transport && r8.transport.tentatives));
  await page.unroute("**/chat/completions*");

  /* ── 9. Autonomie sans Filesystem ── */
  section("9. Autonomie — APK sans plugin Filesystem");
  const page3 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page3.addInitScript(MOCK_CAPACITOR);
  await page3.addInitScript(() => { delete window.Capacitor.Plugins.Filesystem; });
  await page3.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page3.waitForTimeout(1800);
  await page3.route("**/chat/completions*", route => route.fulfill({ status: 403, contentType: "text/html", body: "blocked" }));
  const r9 = await page3.evaluate(async ({ u, i }) => {
    window.__appelsNatifs.length = 0;
    const r = await window.fetch(u, i);
    return { status: r.status, texte: await r.text(), n: window.__appelsNatifs.length,
             routeur: typeof window.__theoFetchDirect };
  }, { u: URL_API, i: INIT });
  ok("v611 a installé son propre routeur", r9.routeur === "function", String(r9.routeur));
  ok("403 -> rejeu natif même sans Filesystem", r9.status === 200 && /netbridge/.test(r9.texte), "status=" + r9.status);
  await page3.close();

  /* ── 10. Contrôle négatif desktop ── */
  section("10. Contrôle négatif — desktop (sans Capacitor) : 403 reste 403");
  const page2 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page2.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page2.waitForTimeout(1800);
  await page2.route("**/chat/completions*", route => route.fulfill({
    status: 403, contentType: "application/json", body: '{"error":{"message":"Forbidden"}}'
  }));
  const r10 = await page2.evaluate(async ({ u, i }) => {
    const pont = window.__theoTransportDisponible ? window.__theoTransportDisponible() : "(absent)";
    const r = await window.theoFetchReseau(u, i);
    return { status: r.status, pont: pont };
  }, { u: URL_API, i: INIT });
  ok("aucun pont natif hors APK", r10.pont === null, String(r10.pont));
  ok("le 403 est rendu TEL QUEL", r10.status === 403, "status=" + r10.status);
  await page2.close();

  /* ── 11. 422 : le détail de validation devient lisible ── */
  section("11. HTTP 422 — le détail FastAPI (clé `detail`) devient lisible");
  const r422 = await page.evaluate(async () => {
    const corps = JSON.stringify({ detail: [{ loc: ["body", "messages"], msg: "Field required" }] });
    const res = new Response(corps, { status: 422 });
    try { await window.throwApiError(res, "mistral-small-latest"); return { jete: false }; }
    catch (e) {
      return { jete: true, msg: e.message, flag: !!e.parametresRefuses,
               formate: (typeof window.formatApiErrorForChat === "function")
                 ? window.formatApiErrorForChat(e) : "(formateur absent)" };
    }
  });
  ok("422 traduit en « Paramètres refusés »", r422.jete && /Paramètres refusés/.test(r422.msg), String(r422.msg).slice(0, 120));
  ok("le champ fautif est nommé (body.messages : Field required)",
     /body\.messages/.test(r422.msg) && /Field required/.test(r422.msg), String(r422.msg).slice(0, 120));
  ok("le formateur de conversation rend ce message tel quel",
     /Paramètres refusés/.test(String(r422.formate || "")), String(r422.formate).slice(0, 80));

  /* ── 12. 403 : QUI répond (edge) + transport ── */
  section("12. HTTP 403 — l'en-tête d'edge et le transport sont nommés");
  const r403 = await page.evaluate(async () => {
    const res = new Response(JSON.stringify({ detail: "Forbidden" }), {
      status: 403,
      headers: { "server": "cloudflare", "cf-ray": "8f2a1c-AMS", "content-type": "application/json" }
    });
    try { await window.throwApiError(res, "mistral-small-latest"); return { jete: false }; }
    catch (e) { return { jete: true, msg: e.message, edge: e.edge || null }; }
  });
  ok("le 403 nomme l'edge (serveur cloudflare + cf-ray)",
     /serveur cloudflare/.test(r403.msg) && /cf-ray/.test(r403.msg), String(r403.msg).slice(0, 140));
  ok("le transport utilisé est indiqué", /\[via /.test(r403.msg), String(r403.msg).slice(0, 90));
  ok("l'edge est structuré pour le diagnostic",
     !!(r403.edge && r403.edge.server === "cloudflare" && r403.edge.ray), JSON.stringify(r403.edge));

  const rChal = await page.evaluate(async () => {
    const res = new Response("challenge", { status: 403, headers: { "cf-mitigated": "challenge" } });
    try { await window.throwApiError(res, "mistral-small-latest"); return { msg: "" }; }
    catch (e) { return { msg: e.message }; }
  });
  ok("un défi anti-robot est annoncé comme tel (et non « clé invalide »)",
     /anti-robot/.test(rChal.msg), String(rChal.msg).slice(0, 140));

  /* ── 13. 403 « subscription tier » : modèle hors abonnement ── */
  section("13. HTTP 403 « not available in your subscription tier » — modèle hors abonnement");
  const rAbo = await page.evaluate(async () => {
    const corps = JSON.stringify({ detail: "This model is not available in your subscription tier." });
    const res = new Response(corps, { status: 403, headers: { "content-type": "application/json" } });
    try { await window.throwApiError(res, "codestral-2508"); return { jete: false }; }
    catch (e) {
      return {
        jete: true, msg: e.message, flag: !!e.modeleIndisponible,
        marque: (typeof estModeleIndisponible === "function") ? estModeleIndisponible("codestral-2508") : null
      };
    }
  });
  ok("le message nomme le modèle et l'abonnement",
     rAbo.jete && /codestral-2508/.test(rAbo.msg) && /abonnement/.test(rAbo.msg), String(rAbo.msg).slice(0, 130));
  ok("le message n'accuse NI la clé NI la région",
     !/région, permissions/.test(rAbo.msg) && !/Clé API refusée/.test(rAbo.msg), String(rAbo.msg).slice(0, 80));
  ok("le modèle est mémorisé comme indisponible", rAbo.flag === true && rAbo.marque === true, String(rAbo.marque));

  const rMarque = await page.evaluate(() => {
    if (typeof refreshModelSelect === "function") refreshModelSelect();
    const sel = document.getElementById("model-select");
    const opt = sel ? [...sel.querySelectorAll("option")].find(o => o.value === "codestral-2508") : null;
    return { texte: opt ? opt.textContent : "(option absente)", titre: opt ? opt.title : "" };
  });
  ok("le sélecteur affiche ⛔ (abonnement) sur ce modèle",
     /⛔/.test(rMarque.texte) && /abonnement/.test(rMarque.texte), rMarque.texte.slice(0, 70));

  const rTest = await page.evaluate(async () => {
    state.model = "codestral-2508";
    state.keys = state.keys || {}; state.keys.mistral = "fake-key-banc";
    state.apiKey = "fake-key-banc";   /* la garde « aucune clé » lit AUSSI ce champ */
    window.__dernierTestCle = null;
    return true;
  });
  await page.route("**/v1/models*", route => route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ data: [{ id: "mistral-small-latest" }, { id: "open-mistral-nemo" }] })
  }));
  const rListe = await page.evaluate(async () => {
    window.__dernierTestCle = null;
    window.__testerCleApi();
    for (let i = 0; i < 40 && !window.__dernierTestCle; i++) await new Promise(r => setTimeout(r, 100));
    return window.__dernierTestCle || {};
  });
  ok("TESTER récupère la liste des modèles autorisés",
     Array.isArray(rListe.modeles) && rListe.modeles.length === 2, JSON.stringify(rListe.modeles));
  ok("le modèle actif absent de la liste est signalé (ok=true mais liste != actif)",
     rListe.ok === true && rListe.modeles.indexOf("codestral-2508") < 0, JSON.stringify(rListe.modeles));
  await page.unroute("**/v1/models*");

  section("14. Aucune erreur JavaScript");
  ok("zéro erreur JS", bruit.length === 0, bruit.slice(0, 2).join(" | "));

  const passes = resultats.filter(r => r.pass).length;
  console.log("\nRESULTAT : " + passes + "/" + resultats.length);
  if (passes !== resultats.length) {
    resultats.filter(r => !r.pass).forEach(r => console.log("  ÉCHEC : " + r.label));
  }
  await browser.close();
  relais.child.kill();
  process.exit(passes === resultats.length ? 0 : 1);
})().catch(e => { console.error("EXCEPTION :", e && e.stack || e); process.exit(1); });
