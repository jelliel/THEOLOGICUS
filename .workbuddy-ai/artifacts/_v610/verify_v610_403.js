/* ═══════════════════════════════════════════════════════════════
   Banc v610 — 401 ≠ 403 : messages EXACTS selon la cause.

   Bug utilisateur : « Clé API refusée par Mistral (HTTP 403) » — le message
   v603 rangeait 403 avec 401. Or un 403 est un ACCÈS REFUSÉ : la clé peut
   être valide (WAF/Cloudflare, région, permissions, modèle non autorisé,
   ou le RELAIS LOCAL qui refuse l'origine — son corps {erreur:...} n'était
   même pas lu). Quatre cas distincts sont vérifiés ici, plus le bouton
   🔍 TESTER qui appelle /v1/models et DIT laquelle des causes c'est.

   Méthode : appels DIRECTS de window.throwApiError avec des Response
   construites (aucun réseau) ; toasts interceptés pour le test de clé.
   ════════════════════════════════════════════════════════════════ */
const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
const resultats = [];
function section(t) { console.log("\n■ " + t); }
function ok(label, cond, detail) {
  resultats.push({ label, pass: !!cond });
  console.log((cond ? "  [OK]   " : "  [ECHEC]") + " " + label + (detail ? " — " + detail : ""));
}

(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v610_" + Date.now()) });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const bruit = [];
  page.on("pageerror", e => bruit.push(String(e).slice(0, 200)));
  await page.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2200);

  /* ── 1. 401 -> clé invalide ── */
  section("1. HTTP 401 -> « Clé API refusée » (comportement conservé)");
  const cas401 = await page.evaluate(async () => {
    const res = new Response(JSON.stringify({ details: "Invalid API Key" }), { status: 401 });
    try { await window.throwApiError(res, "mistral-small-latest"); return { jete: false }; }
    catch (e) { return { jete: true, msg: e.message, cle: !!e.cleRefusee, acces: !!e.accesRefuse }; }
  });
  ok("401 : cleRefusee=true, message « Clé API refusée »",
     cas401.jete && cas401.cle && /Clé API refusée/.test(cas401.msg) && !cas401.acces, cas401.msg);

  /* ── 2. 403 JSON générique -> accès refusé, clé peut être valide ── */
  section("2. HTTP 403 JSON -> « Accès refusé », la clé peut être VALIDE");
  const cas403 = await page.evaluate(async () => {
    const res = new Response(JSON.stringify({ error: { message: "Forbidden" } }), { status: 403 });
    try { await window.throwApiError(res, "mistral-small-latest"); return { jete: false }; }
    catch (e) { return { jete: true, msg: e.message, cle: !!e.cleRefusee, acces: !!e.accesRefuse }; }
  });
  ok("403 : accesRefuse=true et PAS cleRefusee", cas403.jete && cas403.acces && !cas403.cle, cas403.msg);
  ok("403 : le message dit « la clé peut être VALIDE » + oriente vers TESTER",
     /la clé peut être VALIDE/.test(cas403.msg) && /TESTER/.test(cas403.msg), cas403.msg);

  /* ── 3. 403 du RELAIS (origine non locale) -> message dédié ── */
  section("3. HTTP 403 du RELAIS -> « Le RELAIS LOCAL a refusé » (clé non testée)");
  const casRelais = await page.evaluate(async () => {
    const res = new Response(JSON.stringify({ ok: false, erreur: "origine non locale refusée" }), { status: 403 });
    try { await window.throwApiError(res, "mistral-small-latest"); return { jete: false }; }
    catch (e) { return { jete: true, msg: e.message, acces: !!e.accesRefuse }; }
  });
  ok("403 relais : message « RELAIS LOCAL » + « clé n'a PAS été testée »",
     casRelais.jete && /RELAIS LOCAL/.test(casRelais.msg) && /PAS été testée/.test(casRelais.msg), casRelais.msg);

  /* ── 4. 403 Cloudflare/WAF -> message WAF ── */
  section("4. HTTP 403 Cloudflare -> « blocage WAF/proxy »");
  const casWaf = await page.evaluate(async () => {
    const html = "<html><head><title>Attention Required! | Cloudflare</title></head><body><h1>Access denied</h1></body></html>";
    const res = new Response(html, { status: 403, headers: { "Content-Type": "text/html" } });
    try { await window.throwApiError(res, "mistral-small-latest"); return { jete: false }; }
    catch (e) { return { jete: true, msg: e.message }; }
  });
  ok("403 Cloudflare : message « blocage WAF/proxy » (pas « clé refusée »)",
     casWaf.jete && /WAF/.test(casWaf.msg) && !/Clé API refusée/.test(casWaf.msg), casWaf.msg.slice(0, 120));

  /* ── 5. Bouton 🔍 TESTER — /models 200 puis 403 ── */
  section("5. Bouton TESTER — /v1/models dit laquelle des causes c'est");
  /* le toast interne n'est pas interceptable (binding lexical) : le test
     publie son résultat sur window.__dernierTestCle (diagnostic + banc). */
  /* une clé est nécessaire (garde « Aucune clé à tester » — correcte) */
  await page.evaluate(() => { state.keys = state.keys || {}; state.keys.mistral = "fake-key-banc"; state.apiKey = "fake-key-banc"; });
  await page.route("**/models*", route => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ data: [{ id: "mistral-small-latest" }] }),
  }));
  await page.evaluate(() => { window.__dernierTestCle = null; window.__testerCleApi(); });
  await page.waitForTimeout(800);
  const t1 = await page.evaluate(() => window.__dernierTestCle || {});
  ok("test 200 : clé VALIDE (ok=true, HTTP 200, route indiquée)",
     t1.ok === true && t1.status === 200 && /relais|direct/.test(String(t1.via)), JSON.stringify(t1));
  await page.unroute("**/models*");
  await page.route("**/models*", route => route.fulfill({
    status: 403, contentType: "application/json", body: JSON.stringify({ error: { message: "Forbidden" } }),
  }));
  await page.evaluate(() => { window.__dernierTestCle = null; window.__testerCleApi(); });
  await page.waitForTimeout(800);
  const t2 = await page.evaluate(() => window.__dernierTestCle || {});
  ok("test 403 : ok=false, HTTP 403, détail « Forbidden » (la clé n'est pas forcément en cause)",
     t2.ok === false && t2.status === 403 && /Forbidden/.test(String(t2.detail)), JSON.stringify(t2));
  await page.unroute("**/models*");

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
