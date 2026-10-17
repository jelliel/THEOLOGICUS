/* ═══════════════════════════════════════════════════════════════
   Banc v603 — « Invalid API Key » : message ACTIONNABLE, JSON brut banni.

   Contexte utilisateur : sur un appareil où la clé Mistral est invalide,
   la conversation affichait le corps brut de l'API — {"details":"Invalid
   API Key"} — sans rien dire de ce qu'il faut faire. v603 traduit : le
   401/403 devient « Clé API refusée par <fournisseur> (HTTP 401)… ».

   Méthode : fetch INTERCEPTÉ (page.route, aucun réseau réel) + appels
   DIRECTS des fonctions globales (throwApiError, callLLMStream). Le flux
   d'envoi COMPLET n'est pas testé ici : sur une installation fraîche en
   banc sans tête, il pend sur TOUTE erreur HTTP (500 compris — mesuré),
   comportement pré-existant indépendant de v603 ; sur appareil réel, le
   chemin d'erreur s'affiche (l'utilisateur voyait le JSON brut).

   CONTRÔLE NÉGATIF : une 500 serveur ne doit PAS être traduite en « clé
   refusée » et ne doit PAS porter cleRefusee.
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
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v603_" + Date.now()) });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const bruit = [];
  page.on("pageerror", e => bruit.push(String(e)));
  await page.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1800);

  /* ── 1. Unité — throwApiError sur un corps Mistral {"details":...} ── */
  section('1. throwApiError : le corps {"details":"Invalid API Key"} devient actionnable');
  const unite = await page.evaluate(async () => {
    const res = new Response(JSON.stringify({ details: "Invalid API Key" }), { status: 401 });
    try { await window.throwApiError(res, "codestral-2508"); return { jete: false }; }
    catch (e) { return { jete: true, message: e.message, cle: !!e.cleRefusee, status: e.status, provider: e.providerLabel || "", brut: /Invalid API Key/.test(e.message) }; }
  });
  ok("l'erreur est JETÉE avec un message clair", unite.jete && /Clé API refusée/.test(unite.message), unite.message);
  ok("le fournisseur est nommé (Mistral)", unite.provider === "Mistral", unite.provider);
  ok("cleRefusee=true et status=401 portés", unite.cle && unite.status === 401, "");
  ok("plus aucun JSON brut dans le message", !unite.brut, "");

  /* ── 2. Intégration — callLLMStream rejette avec le même message ── */
  section("2. callLLMStream (réseau intercepté 401) rejette avec le message clair");
  await page.route("**/chat/completions*", route => route.fulfill({
    status: 401, contentType: "application/json",
    body: JSON.stringify({ details: "Invalid API Key" }),
  }));
  const integ = await page.evaluate(async () => {
    const cfg = { model: "mistral-small-latest", endpoint: "https://api.mistral.ai/v1/chat/completions", apiKey: "fake", format: "chat-completions" };
    return Promise.race([
      window.callLLMStream(cfg, [{ role: "user", content: "test" }], {}, () => {}).then(
        () => ({ pend: false, jete: false }),
        e => ({ pend: false, jete: true, message: e.message, cle: !!e.cleRefusee, brut: /Invalid API Key/.test(e.message) })),
      new Promise(res => setTimeout(() => res({ pend: true }), 10000)),
    ]);
  });
  ok("la promesse SE RÈGLE (rejet) en < 10 s", !integ.pend && integ.jete, "");
  ok("message clair, JSON brut banni", /Clé API refusée/.test(integ.message) && !integ.brut, integ.message);

  /* ── 3. Formatters — la conversation ne verra jamais le JSON brut ── */
  section("3. Formateurs d'affichage — formatApiErrorShort/ForChat");
  const formatters = await page.evaluate(() => {
    const e = new Error("Clé API refusée par Mistral (HTTP 401). Vérifiez ou collez une clé valide : PARAMÈTRES ⚙ > Modèle.");
    e.cleRefusee = true; e.status = 401; e.apiMessage = "Invalid API Key";
    return { short: window.formatApiErrorShort(e), chat: window.formatApiErrorForChat(e) };
  });
  ok("formatApiErrorShort affiche le message clair", /Clé API refusée/.test(formatters.short) && !/\{"details"/.test(formatters.short), formatters.short.slice(0, 90));
  ok("formatApiErrorForChat affiche le message clair", /Clé API refusée/.test(formatters.chat) && !/\{"details"/.test(formatters.chat), "");

  /* ── 4. CONTRÔLE NÉGATIF : une 500 n'est PAS une clé refusée ── */
  section("4. Contrôle négatif — HTTP 500 serveur : pas de « clé refusée »");
  await page.unroute("**/chat/completions*");
  await page.route("**/chat/completions*", route => route.fulfill({
    status: 500, contentType: "application/json",
    body: JSON.stringify({ error: { message: "quota dépassé (simulation)" } }),
  }));
  const neg = await page.evaluate(async () => {
    const cfg = { model: "mistral-small-latest", endpoint: "https://api.mistral.ai/v1/chat/completions", apiKey: "fake", format: "chat-completions" };
    return Promise.race([
      window.callLLMStream(cfg, [{ role: "user", content: "test" }], {}, () => {}).then(
        () => ({ pend: false, jete: false }),
        e => ({ pend: false, jete: true, message: e.message, cle: !!e.cleRefusee, status: e.status })),
      new Promise(res => setTimeout(() => res({ pend: true }), 10000)),
    ]);
  });
  ok("la 500 se règle aussi (rejet)", !neg.pend && neg.jete, "");
  ok("PAS de cleRefusee sur une 500", !neg.cle, "status=" + neg.status);
  ok("le message ne dit pas « Clé API refusée »", !/Clé API refusée/.test(neg.message), neg.message.slice(0, 90));
  ok("le message serveur (quota) reste visible", /quota/.test(neg.message), "");

  /* ── 5. Propreté ── */
  section("5. Propreté");
  ok("aucune erreur JavaScript", bruit.length === 0, bruit.slice(0, 2).join(" | "));

  await browser.close();
  relais.child.kill();
  const passes = resultats.filter(r => r.pass).length;
  console.log("\n========================================================================");
  console.log("RESULTAT : " + passes + "/" + resultats.length);
  console.log("========================================================================");
  process.exit(passes === resultats.length ? 0 : 1);
})().catch(e => { console.error("ERREUR BANC:", e); process.exit(1); });
