/* ═══════════════════════════════════════════════════════════════
   Banc v617 — TRANSPORT : délai borné, repli élargi, diagnostic.

   Constat utilisateur : « la version APK a toujours des soucis de HTTP ».
   Deux causes STRUCTURELLES mesurées dans le code (indépendantes de la clé) :
     1. aucun délai sur le chemin direct -> interface qui tourne sans fin ;
     2. repli natif déclenché SEULEMENT sur 403 ou échec réseau -> un 502/520/
        522/524 (edge) ou un 408 mourait alors qu'un autre chemin aboutissait.

   Ce banc prouve, dans un vrai navigateur :
   1. 200 -> aucun repli, et RIEN dans le journal (un succès ne chasse pas la panne) ;
   2. 502 -> rejeu natif (nouveau) ;
   3. 520 -> rejeu natif (nouveau, code d'edge Cloudflare) ;
   4. 401 -> AUCUN rejeu (contrôle négatif : une clé invalide reste invalide) ;
   5. 429 -> AUCUN rejeu (contrôle négatif : rejouer aggraverait la limite) ;
   6. 422 -> AUCUN rejeu (verdict du fournisseur) ;
   7. délai expiré -> abandon du direct PUIS rejeu natif (le cas « ça tourne ») ;
   8. délai expiré SANS pont -> erreur claire `delaiExpire`, jamais un blocage ;
   9. abandon VOLONTAIRE de l'appelant -> aucun rejeu ;
  10. journal + rapport de diagnostic : version, plateforme, endpoint, corps exact ;
  11. panneau de diagnostic : s'ouvre, contient le rapport, se ferme ;
  12. contrôle négatif desktop : 502 reste 502 (pas de pont hors APK) ;
  13. zéro erreur JS.
   ════════════════════════════════════════════════════════════════ */
const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
const resultats = [];
function section(t) { console.log("\n■ " + t); }
function ok(label, cond, detail) {
  resultats.push({ label, pass: !!cond });
  console.log((cond ? "  [OK]   " : "  [ECHEC]") + " " + label + (detail ? " — " + detail : ""));
}

/* Mock APK : contrats RÉELS (NetBridge `body`, CapacitorHttp `data`). */
const MOCK_CAPACITOR = () => {
  window.__appelsNatifs = [];
  window.__statutNatif = 200;
  window.__corpsNatif = '{"via":"netbridge"}';
  window.__netBridgeRepond = true;
  window.Capacitor = {
    isNativePlatform: function () { return true; },
    getPlatform: function () { return "android"; },
    Plugins: {
      Filesystem: { writeFile: function () { return Promise.resolve({ uri: "file:///tmp/x" }); } },
      NetBridge: {
        gateway: function () { return Promise.resolve({ gateway: "", localIp: "" }); },
        httpRequest: function (o) {
          window.__appelsNatifs.push(JSON.parse(JSON.stringify(o)));
          if (!window.__netBridgeRepond) return Promise.reject(new Error("pont indisponible"));
          return Promise.resolve({ status: window.__statutNatif, headers: { "content-type": "application/json" }, body: window.__corpsNatif });
        }
      }
    }
  };
};

(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v617_" + Date.now()) });
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
    body: JSON.stringify({ model: "mistral-small-latest", messages: [{ role: "user", content: "x" }], stream: true })
  };

  section("0. Module chargé, diagnostic exposé");
  const etat0 = await page.evaluate(() => ({
    f: typeof window.theoFetchReseau,
    diag: typeof window.__theoDiagReseau,
    panneau: typeof window.__theoDiagAfficher,
    ponts: window.__theoTransportDisponible ? window.__theoTransportDisponible() : "(absent)"
  }));
  ok("window.theoFetchReseau exposé", etat0.f === "function", etat0.f);
  ok("rapport de diagnostic exposé", etat0.diag === "function", etat0.diag);
  ok("panneau de diagnostic exposé", etat0.panneau === "function", etat0.panneau);
  ok("ponts détectés", etat0.ponts === "NetBridge", String(etat0.ponts));

  /* ── 1. 200 : aucun repli, journal silencieux ── */
  section("1. Direct 200 — aucun repli, journal silencieux");
  await page.route("**/chat/completions*", route => route.fulfill({
    status: 200, contentType: "application/json", body: '{"ok":true,"via":"direct"}'
  }));
  const r1 = await page.evaluate(async ({ u, i }) => {
    window.__appelsNatifs.length = 0;
    window.__theoJournalReseau = [];
    const r = await window.fetch(u, i);
    return { status: r.status, texte: await r.text(), n: window.__appelsNatifs.length,
             journal: (window.__theoJournalReseau || []).length };
  }, { u: URL_API, i: INIT });
  ok("200 rendu par la voie directe", r1.status === 200 && /direct/.test(r1.texte), r1.texte);
  ok("aucun appel natif", r1.n === 0, r1.n + " appel(s)");
  ok("un SUCCÈS n'entre pas dans le journal", r1.journal === 0, r1.journal + " entrée(s)");
  await page.unroute("**/chat/completions*");

  /* ── 2. 502 -> rejeu natif ── */
  section("2. Direct 502 (edge) — rejeu natif (NOUVEAU v617)");
  await page.route("**/chat/completions*", route => route.fulfill({
    status: 502, contentType: "text/html", body: "<html><body>Bad gateway</body></html>"
  }));
  const r2 = await page.evaluate(async ({ u, i }) => {
    window.__appelsNatifs.length = 0;
    window.__theoJournalReseau = [];
    const r = await window.fetch(u, i);
    return { status: r.status, texte: await r.text(), n: window.__appelsNatifs.length,
             journal: window.__theoJournalReseau || [] };
  }, { u: URL_API, i: INIT });
  ok("le 502 est CONTOURNÉ par le natif", r2.status === 200 && /netbridge/.test(r2.texte), "status=" + r2.status);
  ok("un seul rejeu natif", r2.n === 1, r2.n + " appel(s)");
  ok("le rejeu est journalisé avec les DEUX statuts",
     r2.journal.some(e => e.type === "rejeu" && e.statutDirect === 502 && e.statutNatif === 200),
     JSON.stringify(r2.journal));
  await page.unroute("**/chat/completions*");

  /* ── 3. 520 (Cloudflare) -> rejeu natif ── */
  section("3. Direct 520 (Cloudflare) — rejeu natif");
  await page.route("**/chat/completions*", route => route.fulfill({
    status: 520, contentType: "text/html", body: "<html>cloudflare</html>"
  }));
  const r3 = await page.evaluate(async ({ u, i }) => {
    window.__appelsNatifs.length = 0;
    const r = await window.fetch(u, i);
    return { status: r.status, texte: await r.text(), n: window.__appelsNatifs.length };
  }, { u: URL_API, i: INIT });
  ok("520 -> réponse native", r3.status === 200 && /netbridge/.test(r3.texte), "status=" + r3.status);
  ok("un rejeu natif", r3.n === 1, r3.n + " appel(s)");
  await page.unroute("**/chat/completions*");

  /* ── 4/5/6. Contrôles négatifs : 401, 429, 422 ── */
  for (const cas of [
    { code: 401, corps: '{"details":"Invalid API Key"}', quoi: "clé invalide" },
    { code: 429, corps: '{"error":{"message":"rate limited"}}', quoi: "limitation de débit" },
    { code: 422, corps: '{"detail":[{"loc":["body","messages"],"msg":"Field required"}]}', quoi: "corps refusé" }
  ]) {
    section(cas.code + " (" + cas.quoi + ") — AUCUN rejeu");
    await page.route("**/chat/completions*", route => route.fulfill({
      status: cas.code, contentType: "application/json", body: cas.corps
    }));
    const r = await page.evaluate(async ({ u, i }) => {
      window.__appelsNatifs.length = 0;
      const r = await window.fetch(u, i);
      return { status: r.status, n: window.__appelsNatifs.length };
    }, { u: URL_API, i: INIT });
    ok(cas.code + " conservé", r.status === cas.code, "status=" + r.status);
    ok("aucun appel natif sur " + cas.code, r.n === 0, r.n + " appel(s)");
    await page.unroute("**/chat/completions*");
  }

  /* ── 7. Délai expiré -> rejeu natif ── */
  section("7. Délai expiré — abandon du direct PUIS rejeu natif");
  await page.route("**/chat/completions*", () => { /* ne répond JAMAIS */ });
  const r7 = await page.evaluate(async ({ u, i }) => {
    window.__appelsNatifs.length = 0;
    window.__dernierTransport = null;
    window.__theoJournalReseau = [];
    const t0 = Date.now();
    const init = Object.assign({}, i, { __theoDelaiMs: 400 });
    const r = await window.fetch(u, init);
    return { status: r.status, texte: await r.text(), ms: Date.now() - t0,
             n: window.__appelsNatifs.length, tr: window.__dernierTransport,
             journal: window.__theoJournalReseau || [] };
  }, { u: URL_API, i: INIT });
  ok("la requête ABOUTIT (natif) au lieu de pendre", r7.status === 200 && /netbridge/.test(r7.texte), "status=" + r7.status);
  ok("le direct a bien été abandonné au délai", r7.ms >= 350 && r7.ms < 5000, r7.ms + " ms");
  ok("le délai est tracé dans le diagnostic",
     !!(r7.tr && r7.tr.direct && r7.tr.direct.delaiExpire === 400), JSON.stringify(r7.tr && r7.tr.direct));
  ok("journal : cause = delai", r7.journal.some(e => e.type === "rejeu" && e.cause === "delai"), JSON.stringify(r7.journal));
  await page.unroute("**/chat/completions*");

  /* ── 8. Délai expiré SANS pont -> erreur claire ── */
  section("8. Délai expiré sans pont natif — erreur claire, jamais un blocage");
  await page.route("**/chat/completions*", () => {});
  const r8 = await page.evaluate(async ({ u, i }) => {
    const sauv = window.Capacitor.Plugins.NetBridge;
    delete window.Capacitor.Plugins.NetBridge;
    try {
      const init = Object.assign({}, i, { __theoDelaiMs: 400 });
      const t0 = Date.now();
      try {
        const r = await window.fetch(u, init);
        return { abouti: true, status: r.status, ms: Date.now() - t0 };
      } catch (e) {
        return { abouti: false, msg: String(e && e.message), flag: !!e.delaiExpire, ms: Date.now() - t0 };
      }
    } finally { window.Capacitor.Plugins.NetBridge = sauv; }
  }, { u: URL_API, i: INIT });
  ok("la requête échoue au lieu de pendre", r8.abouti === false && r8.ms < 5000, r8.ms + " ms");
  ok("l'erreur est marquée delaiExpire", r8.flag === true, String(r8.flag));
  ok("le message nomme le délai", /Aucune réponse après/.test(String(r8.msg)), String(r8.msg).slice(0, 90));
  const r8b = await page.evaluate(() => {
    const e = new Error("x"); e.delaiExpire = true;
    return (typeof window.formatApiErrorShort === "function") ? window.formatApiErrorShort(e) : "(absent)";
  });
  ok("le message utilisateur propose le diagnostic",
     /Réseau muet/.test(String(r8b)) && /DIAGNOSTIC/.test(String(r8b)), String(r8b).slice(0, 100));
  await page.unroute("**/chat/completions*");

  /* ── 9. Abandon volontaire -> aucun rejeu ── */
  section("9. Abandon VOLONTAIRE de l'appelant — aucun rejeu");
  await page.route("**/chat/completions*", () => {});
  const r9 = await page.evaluate(async ({ u, i }) => {
    window.__appelsNatifs.length = 0;
    const ctrl = new AbortController();
    const init = Object.assign({}, i, { signal: ctrl.signal, __theoDelaiMs: 30000 });
    setTimeout(() => ctrl.abort(), 200);
    try {
      await window.fetch(u, init);
      return { abouti: true, n: window.__appelsNatifs.length };
    } catch (e) {
      return { abouti: false, nom: String(e && e.name), n: window.__appelsNatifs.length };
    }
  }, { u: URL_API, i: INIT });
  ok("l'appelant reçoit bien un abandon", r9.abouti === false && r9.nom === "AbortError", r9.nom);
  ok("AUCUN rejeu natif sur un abandon volontaire", r9.n === 0, r9.n + " appel(s)");
  await page.unroute("**/chat/completions*");

  /* ── 10. Rapport de diagnostic ── */
  section("10. Rapport de diagnostic — la pièce qui manquait");
  await page.route("**/chat/completions*", route => route.fulfill({
    status: 503, contentType: "application/json", body: '{"error":{"message":"service unavailable"}}'
  }));
  const r10 = await page.evaluate(async ({ u, i }) => {
    window.__theoJournalReseau = [];
    window.__statutNatif = 503;   /* le natif échoue aussi -> le 503 est rendu */
    window.__corpsNatif = '{"error":{"message":"service unavailable"}}';
    try {
      const r = await window.fetch(u, i);
      await r.text();
      const res = new Response(JSON.stringify({ detail: "service unavailable" }), { status: 503 });
      try { await window.throwApiError(res, "mistral-small-latest"); } catch (e) {
        return { msg: e.message, flag: !!e.reseauInstable, transport: e.transport,
                 rapport: window.__theoDiagReseau() };
      }
    } finally { window.__statutNatif = 200; window.__corpsNatif = '{"via":"netbridge"}'; }
  }, { u: URL_API, i: INIT });
  ok("503 -> message « erreur du serveur ou de l'edge »",
     /erreur du serveur ou de l'edge/.test(String(r10.msg)), String(r10.msg).slice(0, 110));
  ok("503 marqué reseauInstable et le transport est nommé",
     r10.flag === true && /natif|direct/i.test(String(r10.transport)), String(r10.transport));
  ok("le rapport contient version + plateforme + transport",
     /version/.test(r10.rapport) && /android/.test(r10.rapport) && /transport/.test(r10.rapport),
     String(r10.rapport).split("\n").slice(0, 4).join(" | "));
  ok("le rapport contient le CORPS exact du fournisseur",
     /service unavailable/.test(r10.rapport), "(corps absent)");
  ok("le rapport ne contient AUCUNE clé",
     !/fake-key-banc/.test(r10.rapport) && !/Bearer/.test(r10.rapport), "(fuite)");
  await page.unroute("**/chat/completions*");

  /* ── 11. Panneau de diagnostic ── */
  section("11. Panneau de diagnostic — lisible, copiable, refermable");
  const r11 = await page.evaluate(() => {
    window.__theoDiagAfficher();
    const ov = document.getElementById("theo-diag-reseau");
    const pre = document.getElementById("theo-diag-texte");
    const btn = ov ? ov.querySelector("[data-copier]") : null;
    const ferme = ov ? ov.querySelector("[data-fermer]") : null;
    const txt = pre ? pre.textContent : "";
    /* VISIBILITÉ, pas existence : .modal-overlay est en display:none et le
       premier jet laissait le panneau invisible (attrapé à la capture). */
    const cs = ov ? getComputedStyle(ov) : null;
    const rect = ov ? ov.getBoundingClientRect() : null;
    const visible = !!(cs && cs.display !== "none" && cs.visibility !== "hidden" &&
                       rect && rect.width > 200 && rect.height > 100);
    /* Même étage que les autres modales (--z-overlay) : au-dessus du contenu,
       en dessous de la porte d'accès qui est un contrôle d'accès. */
    const zPanneau = cs ? parseInt(cs.zIndex || "0", 10) : -1;
    const apiModal = document.getElementById("api-modal");
    const zApi = apiModal ? parseInt(getComputedStyle(apiModal).zIndex || "0", 10) : -1;
    const auCentre = (zPanneau >= zApi && zPanneau > 0);
    if (ferme) ferme.click();
    return {
      ouvert: !!ov, visible: visible, auCentre: auCentre, texte: txt.slice(0, 120), copier: !!btn,
      referme: !document.getElementById("theo-diag-reseau")
    };
  });
  ok("le panneau s'ouvre", r11.ouvert === true, String(r11.ouvert));
  ok("le panneau est VISIBLE (display + surface réelle)", r11.visible === true, String(r11.visible));
  ok("le panneau est au même étage que la modale de clé", r11.auCentre === true, String(r11.auCentre));
  ok("il affiche le rapport", /DIAGNOSTIC RÉSEAU/.test(r11.texte), r11.texte.slice(0, 60));
  ok("il propose un bouton de copie", r11.copier === true, String(r11.copier));
  ok("il se referme", r11.referme === true, String(r11.referme));

  /* ── 12. Contrôle négatif desktop ── */
  section("12. Contrôle négatif — desktop : 502 reste 502");
  const page2 = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page2.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page2.waitForTimeout(1800);
  await page2.route("**/chat/completions*", route => route.fulfill({ status: 502, contentType: "text/html", body: "bad gateway" }));
  const r12 = await page2.evaluate(async ({ u, i }) => {
    const pont = window.__theoTransportDisponible ? window.__theoTransportDisponible() : "(absent)";
    const r = await window.theoFetchReseau(u, i);
    return { status: r.status, pont: pont };
  }, { u: URL_API, i: INIT });
  ok("aucun pont hors APK", r12.pont === null, String(r12.pont));
  ok("le 502 est rendu TEL QUEL", r12.status === 502, "status=" + r12.status);
  await page2.close();

  section("13. Aucune erreur JavaScript");
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
