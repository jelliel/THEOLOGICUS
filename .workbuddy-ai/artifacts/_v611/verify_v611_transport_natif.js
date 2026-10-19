/* ═══════════════════════════════════════════════════════════════
   Banc v611 — TRANSPORT NATIF DE SECOURS (APK Android).

   Bug utilisateur : « ça ne passe pas » sur mobile Android, MÊME avec la
   bonne clé et le bon modèle. Sur l'APK il n'y a aucun relais local :
   apiEndpoint() renvoie l'URL directe, la requête part du WebView (Origin
   https://localhost, UA WebView) et le WAF répond 403.

   Ce banc prouve, sans Android :
   1. direct 200 -> AUCUN appel natif (le repli ne dégrade pas le streaming) ;
   2. direct 403 -> rejeu NATIF, réponse 200 rendue à l'appelant ;
   3. échec réseau (CORS) -> rejeu natif ;
   4. 401 -> AUCUN repli (une vraie clé invalide ne doit pas être masquée) ;
   5. URL locale -> jamais de natif ;
   6. sans Capacitor (desktop) -> 403 reste 403 (contrôle négatif) ;
   7. CapacitorHttp prioritaire sur NetBridge quand les deux existent ;
   8. l'appel natif ne porte AUCUN en-tête de navigateur (origin/sec-fetch).
   ════════════════════════════════════════════════════════════════ */
const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
const resultats = [];
function section(t) { console.log("\n■ " + t); }
function ok(label, cond, detail) {
  resultats.push({ label, pass: !!cond });
  console.log((cond ? "  [OK]   " : "  [ECHEC]") + " " + label + (detail ? " — " + detail : ""));
}

const MOCK_CAPACITOR = () => {
  window.__appelsNatifs = [];
  window.__reponseNative = { status: 200, headers: { "content-type": "application/json" }, body: '{"ok":true,"via":"natif"}' };
  window.Capacitor = {
    isNativePlatform: function () { return true; },
    Plugins: {
      /* présent sur l'APK : sans lui le wrapper fetch de l'app n'est pas posé */
      Filesystem: { writeFile: function () { return Promise.resolve({ uri: "file:///tmp/x" }); } },
      NetBridge: {
        gateway: function () { return Promise.resolve({ gateway: "", localIp: "" }); },
        httpRequest: function (o) {
          window.__appelsNatifs.push(JSON.parse(JSON.stringify(o)));
          return Promise.resolve(window.__reponseNative);
        }
      }
    }
  };
};

(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v611_" + Date.now()) });
  const browser = await H.launchBrowser();

  /* ═══ PAGE NATIVE (APK simulé) ═══ */
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

  section("0. Le module est chargé et le pont natif est détecté");
  const etat0 = await page.evaluate(() => ({
    theoFetchReseau: typeof window.theoFetchReseau,
    direct: typeof window.__theoFetchDirect,
    pont: window.__theoTransportDisponible ? window.__theoTransportDisponible() : "(absent)",
    natif: window.Capacitor.isNativePlatform()
  }));
  ok("window.theoFetchReseau exposé", etat0.theoFetchReseau === "function", etat0.theoFetchReseau);
  ok("fetch d'origine capturé (pas de récursion)", etat0.direct === "function", etat0.direct);
  ok("pont natif détecté = NetBridge", etat0.pont === "NetBridge", String(etat0.pont));

  /* ── 1. direct 200 : AUCUN repli ── */
  section("1. Direct 200 — le repli natif ne s'active PAS");
  await page.route("**/chat/completions*", route => route.fulfill({
    status: 200, contentType: "application/json", body: '{"ok":true,"via":"direct"}'
  }));
  const r1 = await page.evaluate(async ({ u, i }) => {
    window.__appelsNatifs.length = 0;
    const r = await window.fetch(u, i);
    return { status: r.status, texte: await r.text(), natifs: window.__appelsNatifs.length };
  }, { u: URL_API, i: INIT });
  ok("status 200 rendu par la voie DIRECTE", r1.status === 200 && /direct/.test(r1.texte), r1.texte);
  ok("AUCUN appel natif (streaming préservé)", r1.natifs === 0, r1.natifs + " appel(s)");
  await page.unroute("**/chat/completions*");

  /* ── 2. direct 403 -> rejeu natif ── */
  section("2. Direct 403 (WAF) — rejeu NATIF et réponse rendue à l'appelant");
  await page.route("**/chat/completions*", route => route.fulfill({
    status: 403, contentType: "text/html",
    body: "<html><head><title>Attention Required! | Cloudflare</title></head><body>blocked</body></html>"
  }));
  const r2 = await page.evaluate(async ({ u, i }) => {
    window.__appelsNatifs.length = 0;
    window.__reponseNative = { status: 200, headers: { "content-type": "application/json" }, body: '{"ok":true,"via":"natif","choix":[{"message":{"content":"bonjour"}}]}' };
    const r = await window.fetch(u, i);
    return {
      status: r.status, texte: await r.text(),
      natifs: window.__appelsNatifs.length, appel: window.__appelsNatifs[0] || null,
      transport: window.__dernierTransport || null
    };
  }, { u: URL_API, i: INIT });
  ok("l'appelant reçoit 200 (le WAF du WebView est contourné)", r2.status === 200, "status=" + r2.status);
  ok("le corps vient du NATIF", /natif/.test(r2.texte), r2.texte.slice(0, 80));
  ok("un appel natif a été émis", r2.natifs === 1, r2.natifs + " appel(s)");
  ok("transport mémorisé = natif / NetBridge",
     r2.transport && r2.transport.utilise === "natif" && r2.transport.pont === "NetBridge",
     JSON.stringify(r2.transport && { u: r2.transport.utilise, p: r2.transport.pont }));
  ok("le 403 direct est conservé pour le diagnostic",
     r2.transport && r2.transport.direct && r2.transport.direct.statut === 403,
     JSON.stringify(r2.transport && r2.transport.direct));
  ok("l'appel natif porte le corps et l'Authorization",
     !!r2.appel && r2.appel.method === "POST" && /Bearer fake-key-banc/.test(JSON.stringify(r2.appel.headers)) &&
     /mistral-small-latest/.test(String(r2.appel.body)),
     r2.appel ? r2.appel.method : "(aucun)");
  const clesEntetes = r2.appel ? Object.keys(r2.appel.headers || {}).map(k => k.toLowerCase()) : [];
  ok("AUCUN en-tête de navigateur transmis (origin / sec-fetch / referer)",
     !clesEntetes.includes("origin") && !clesEntetes.some(k => k.indexOf("sec-fetch") === 0) && !clesEntetes.includes("referer"),
     clesEntetes.join(","));
  await page.unroute("**/chat/completions*");

  /* ── 3. échec réseau (CORS) -> rejeu natif ── */
  section("3. Échec réseau/CORS — rejeu natif au lieu d'une erreur");
  await page.route("**/chat/completions*", route => route.abort("failed"));
  const r3 = await page.evaluate(async ({ u, i }) => {
    window.__appelsNatifs.length = 0;
    window.__reponseNative = { status: 200, headers: { "content-type": "application/json" }, body: '{"ok":true,"via":"natif-cors"}' };
    try {
      const r = await window.fetch(u, i);
      return { status: r.status, texte: await r.text(), natifs: window.__appelsNatifs.length };
    } catch (e) { return { erreur: String(e && e.message), natifs: window.__appelsNatifs.length }; }
  }, { u: URL_API, i: INIT });
  ok("la requête aboutit malgré l'échec direct", r3.status === 200 && /natif-cors/.test(r3.texte || ""),
     r3.erreur || ("status=" + r3.status));
  ok("rejeu natif effectué", r3.natifs === 1, r3.natifs + " appel(s)");
  await page.unroute("**/chat/completions*");

  /* ── 4. 401 : AUCUN repli (clé vraiment invalide) ── */
  section("4. 401 — AUCUN repli natif (une clé invalide reste une clé invalide)");
  await page.route("**/chat/completions*", route => route.fulfill({
    status: 401, contentType: "application/json", body: '{"details":"Invalid API Key"}'
  }));
  const r4 = await page.evaluate(async ({ u, i }) => {
    window.__appelsNatifs.length = 0;
    window.__reponseNative = { status: 200, headers: {}, body: '{"ok":true}' };
    const r = await window.fetch(u, i);
    return { status: r.status, natifs: window.__appelsNatifs.length };
  }, { u: URL_API, i: INIT });
  ok("status 401 conservé", r4.status === 401, "status=" + r4.status);
  ok("AUCUN appel natif sur 401", r4.natifs === 0, r4.natifs + " appel(s)");
  await page.unroute("**/chat/completions*");

  /* ── 5. URL locale : jamais de natif ── */
  section("5. URL locale — jamais de transport natif");
  const r5 = await page.evaluate(async () => {
    window.__appelsNatifs.length = 0;
    const r = await window.fetch("/theologicus-keys", { method: "GET" });
    return { status: r.status, natifs: window.__appelsNatifs.length };
  });
  ok("/theologicus-keys servi localement", r5.status === 200, "status=" + r5.status);
  ok("aucun appel natif pour une URL locale", r5.natifs === 0, r5.natifs + " appel(s)");

  /* ── 6. CapacitorHttp prioritaire ── */
  section("6. CapacitorHttp prioritaire quand les deux ponts existent");
  /* le direct doit ÉCHOUER (403) pour que le repli s'active : sans route,
     api.mistral.ai répondrait et CapacitorHttp ne serait jamais sollicité. */
  await page.route("**/chat/completions*", route => route.fulfill({
    status: 403, contentType: "application/json", body: '{"error":{"message":"Forbidden"}}'
  }));
  const r6 = await page.evaluate(async ({ u, i }) => {
    window.__appelsNatifs.length = 0;
    window.__dernierTransport = null;
    const appels = [];
    window.Capacitor.Plugins.CapacitorHttp = {
      request: function (o) {
        appels.push(JSON.parse(JSON.stringify(o)));
        return Promise.resolve({ status: 200, headers: { "content-type": "application/json" }, body: '{"via":"capacitor-http"}' });
      }
    };
    const r = await window.theoFetchReseau(u, i);
    const texte = await r.text();
    delete window.Capacitor.Plugins.CapacitorHttp;
    return { texte, appelsHttp: appels.length, appelsNet: window.__appelsNatifs.length,
             pont: window.__dernierTransport && window.__dernierTransport.pont };
  }, { u: URL_API, i: INIT });
  ok("CapacitorHttp utilisé", r6.appelsHttp === 1 && r6.pont === "CapacitorHttp", JSON.stringify({ h: r6.appelsHttp, p: r6.pont }));
  ok("NetBridge PAS appelé en doublon", r6.appelsNet === 0, r6.appelsNet + " appel(s)");
  await page.unroute("**/chat/completions*");

  /* ── 7. Contrôle négatif : sans Capacitor, 403 reste 403 ── */
  section("7. Contrôle négatif — desktop (sans Capacitor) : 403 reste 403");
  const page2 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page2.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page2.waitForTimeout(1800);
  await page2.route("**/chat/completions*", route => route.fulfill({
    status: 403, contentType: "application/json", body: '{"error":{"message":"Forbidden"}}'
  }));
  const r7 = await page2.evaluate(async ({ u, i }) => {
    const pont = window.__theoTransportDisponible ? window.__theoTransportDisponible() : "(absent)";
    const r = await window.theoFetchReseau(u, i);
    return { status: r.status, pont: pont };
  }, { u: URL_API, i: INIT });
  ok("aucun pont natif hors APK", r7.pont === null, String(r7.pont));
  ok("le 403 est rendu TEL QUEL (pas de faux succès)", r7.status === 403, "status=" + r7.status);
  await page2.close();

  /* ── 7b. Autonomie : sans plugin Filesystem, v611 installe SON routeur ── */
  section("7b. Autonomie — APK sans plugin Filesystem : le repli fonctionne quand même");
  const page3 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page3.addInitScript(() => {
    window.__appelsNatifs = [];
    /* Capacitor natif SANS Filesystem : le wrapper de fetch de l'app n'est
       alors jamais posé — c'est le cas que v611 doit couvrir seul. */
    window.Capacitor = {
      isNativePlatform: function () { return true; },
      Plugins: {
        NetBridge: { httpRequest: function (o) {
          window.__appelsNatifs.push(JSON.parse(JSON.stringify(o)));
          return Promise.resolve({ status: 200, headers: {}, body: '{"via":"autonome"}' });
        } }
      }
    };
  });
  await page3.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page3.waitForTimeout(1800);
  await page3.route("**/chat/completions*", route => route.fulfill({ status: 403, contentType: "text/html", body: "blocked" }));
  const r7b = await page3.evaluate(async ({ u, i }) => {
    window.__appelsNatifs.length = 0;
    const r = await window.fetch(u, i);
    return { status: r.status, texte: await r.text(), natifs: window.__appelsNatifs.length,
             method: window.__appelsNatifs[0] && window.__appelsNatifs[0].method,
             routeurInstalle: typeof window.__theoFetchDirect };
  }, { u: URL_API, i: INIT });
  ok("v611 a installé son propre routeur", r7b.routeurInstalle === "function", String(r7b.routeurInstalle));
  ok("403 -> rejeu natif même sans Filesystem", r7b.status === 200 && /autonome/.test(r7b.texte), "status=" + r7b.status);
  ok("le corps (POST) est transmis au natif", r7b.natifs === 1 && r7b.method === "POST", r7b.method + " / " + r7b.natifs);
  await page3.close();

  /* ── 8. Propreté ── */
  section("8. Aucune erreur JavaScript");
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
