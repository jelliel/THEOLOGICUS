/* ═══════════════════════════════════════════════════════════════
   Banc v584 — PETS V4.0 (compagnons animes des agents)
   Contrat : OFF par defaut (rien au repos) ; case dans PARAMETRES ;
   activation agent → compagnon au composeur (salue puis se pose) ;
   tout changement d agent change la mascotte ; generation → il suit
   la question (thinking) ; voix → il suit la reponse (wave) ; fin →
   heureux puis retour au coin bas-gauche. Atlas verifie : grille
   OpenPets 1536x2288. Magasin isole (v559). ════════════════════════ */
const H = require("../../../tools/bench_common.js");
const { chromium } = require("playwright");
const path = require("path"), os = require("os");
const resultats = [];
function section(t) { console.log("\n■ " + t); }
function ok(label, cond, detail) {
  resultats.push({ label, pass: !!cond });
  console.log((cond ? "  [OK]   " : "  [ECHEC]") + " " + label + (detail ? " — " + detail : ""));
}
(async () => {
  const port = await H.pickFreePort();
  const STORE_DIR = path.join(os.tmpdir(), "theo_v584_store_" + Date.now());
  const relais = await H.spawnRelay({ port, localAppData: STORE_DIR });
  const BASE = "http://127.0.0.1:" + port + "/THEOLOGICUS.html";
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const bruit = [];
  page.on("pageerror", e => bruit.push(String(e)));
  await page.addInitScript(H.isolationInit);
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1600);

  /* cle semee pour le flux (regle v559) */
  await page.evaluate(() => {
    try { state.keys = state.keys || {}; state.keys.agnes = "banc-cle-factice"; state.model = "agnes:agnes-2.5-flash"; } catch (e) {}
  });

  /* ── 1. OFF par defaut : reglages montes, aucun compagnon au repos ── */
  section("1. Repos : aucune mascotte (defaut OFF), reglages presents");
  const e1 = await page.evaluate(() => ({
    host: !!document.getElementById("v584-pet"),
    case: document.getElementById("v584-on") ? document.getElementById("v584-on").checked : null,
    style: !!document.getElementById("v584-style")
  }));
  ok("reglages Pets injectes dans PARAMETRES → mouvement", e1.case !== null, JSON.stringify(e1));
  ok("case DECOCHEE par defaut (OFF)", e1.case === false);
  ok("aucun compagnon au repos (invariant)", e1.host === false);
  ok("feuille de style du module posee (aucun style au repos)", e1.style === true);

  /* ── 2. active sans agent : toujours rien ── */
  section("2. Pets actifs mais aucun agent : aucun compagnon");
  await page.evaluate(() => { document.getElementById("v584-on").click(); });
  await page.waitForTimeout(700);
  const e2 = await page.evaluate(() => ({ cle: localStorage.getItem("theo_pets"), st: window.__v584Pets.etat() }));
  ok("case cochee → theo_pets = 1", e2.cle === "1", e2.cle);
  ok("aucun compagnon tant qu aucun agent n est choisi", e2.st.visible === false, JSON.stringify(e2.st));

  /* ── 3. activation d un agent → salutation au composeur ── */
  section("3. Agent Patristique active → Colombe au composeur, salue puis se pose");
  await page.evaluate(async () => {
    await db.put("agents", { id: "v584-pat", name: "Patristique", desc: "Peres de l Eglise" });
    await db.put("agents", { id: "v584-isl", name: "Islamologue", desc: "Monde musulman" });
  });
  await page.evaluate(() => window.activateAgent("v584-pat"));
  await page.waitForFunction(() => window.__v584Pets && window.__v584Pets.etat().visible, null, { timeout: 8000 });
  const e3a = await page.evaluate(() => window.__v584Pets.etat());
  ok("compagnon visible apres activation", e3a.visible === true, JSON.stringify(e3a));
  ok("mascotte COLOMBE pour agent Patristique (famille pere)", e3a.pet === "colombe", e3a.pet);
  ok("salutation (wave) a l arrivee", e3a.anim === "wave", e3a.anim);
  await page.waitForTimeout(800);
  const posC = await page.evaluate(() => {
    const h = document.getElementById("v584-pet").getBoundingClientRect();
    const i = document.getElementById("input-area").getBoundingClientRect();
    return { pb: h.bottom, pl: h.left, it: i.top, il: i.left, pw: h.width };
  });
  ok("pose PRES du composeur (perche au-dessus)", posC.pb >= posC.it - 20 && posC.pb <= posC.it + 70 && posC.pl >= posC.il - 30 && posC.pl <= posC.il + 130, JSON.stringify(posC));
  await page.waitForTimeout(2200);
  const e3b = await page.evaluate(() => window.__v584Pets.etat());
  ok("retour a la respiration idle apres la salutation", e3b.anim === "idle" && e3b.cible === "composeur", JSON.stringify(e3b));

  /* ── 4. tout autre chemin de selection → autre mascotte ── */
  section("4. Choisir Islamologue (via state) → Fennec");
  await page.evaluate(async () => { state.agent = await db.get("agents", "v584-isl"); });
  await page.waitForFunction(() => window.__v584Pets.etat().pet === "fennec", null, { timeout: 8000 });
  const e4 = await page.evaluate(() => window.__v584Pets.etat());
  ok("changement d agent → changement de mascotte (fennec du desert)", e4.pet === "fennec", JSON.stringify(e4));
  await page.waitForTimeout(800);

  /* ── 5. generation : il suit la question (thinking) puis la reponse (happy) ── */
  section("5. Generation : le compagnon suit la question puis revient au coin");
  await page.evaluate(() => {
    try { state.messages.push({ role: "user", content: "Question de test du compagnon." }); } catch (e) {}
    if (typeof renderMessages === "function") renderMessages();
    window.__fluxFini = false;
    const enc = s => new TextEncoder().encode(s);
    window.fetch = async function (url, opts) {
      if (String(url).indexOf("/chat/completions") !== -1) {
        await new Promise(r => setTimeout(r, 1800));
        const parts = [];
        ["Reponse de test, phrase complete. "].forEach(function (m) {
          parts.push(enc("data: " + JSON.stringify({ choices: [{ delta: { content: m } }] }) + "\n\n"));
        });
        parts.push(enc("data: [DONE]\n\n"));
        const plat = [];
        parts.forEach(function (c) { c.forEach(function (b) { plat.push(b); }); });
        const tout = new Uint8Array(plat);
        let lu = false;
        return { ok: true, status: 200, body: { getReader: function () { return { read: async function () { return lu ? { done: true } : (lu = true, { done: false, value: tout }); } }; } } };
      }
      return { ok: false, status: 404, text: async function () { return ""; } };
    };
  });
  const diag = await page.evaluate(() => {
    let cfg = null;
    try { cfg = (typeof resolveModelConfig === "function") ? resolveModelConfig("agnes:agnes-2.5-flash") : null; } catch (e) {}
    if (!cfg) cfg = { apiEndpoint: "http://127.0.0.1:9/v1" };
    const p = window.callLLMStream(cfg, [{ role: "user", content: "Q" }], { temperature: 0.4, max_tokens: 60 }, function () {});
    window.__fluxFini = false;
    if (p && typeof p.then === "function") p.then(function () { window.__fluxFini = true; }, function () { window.__fluxFini = true; });
    return { animJusteApresAppel: window.__v584Pets.etat().anim, thenable: !!(p && typeof p.then === "function") };
  });
  console.log("   [diag] " + JSON.stringify(diag));
  await page.waitForFunction(() => window.__v584Pets.etat().anim === "thinking", null, { timeout: 6000 });
  await page.waitForTimeout(900); /* laisse finir le vol (transition 550 ms) */
  const e5a = await page.evaluate(() => {
    const st = window.__v584Pets.etat();
    const h = document.getElementById("v584-pet").getBoundingClientRect();
    const ms = document.querySelectorAll("#chat-container .message");
    const m = ms.length ? ms[ms.length - 1].getBoundingClientRect() : null;
    return { st: st, hb: h.bottom, hx: h.right, mb: m ? m.top : null, mx: m ? m.right : null };
  });
  ok("pendant la generation : animation thinking", e5a.st.anim === "thinking", e5a.st.anim);
  ok("ancre sur le message (suit la question)", e5a.st.cible === "message", e5a.st.cible);
  ok("position collee au dernier message", e5a.mb !== null && Math.abs(e5a.hb - (e5a.mb + 10)) < 80 && Math.abs(e5a.hx - e5a.mx) < 220, JSON.stringify(e5a));
  await page.waitForFunction(() => window.__fluxFini === true, null, { timeout: 8000 });
  await page.waitForFunction(() => window.__v584Pets.etat().anim === "happy", null, { timeout: 5000 });
  ok("fin de generation : mascotte heureuse (happy)", true);
  await page.waitForFunction(() => window.__v584Pets.etat().cible === "composeur", null, { timeout: 6000 });
  await page.waitForTimeout(800);
  const posRetour = await page.evaluate(() => {
    const h = document.getElementById("v584-pet").getBoundingClientRect();
    const i = document.getElementById("input-area").getBoundingClientRect();
    return { hb: h.bottom, it: i.top, hl: h.left, il: i.left, a: window.__v584Pets.etat() };
  });
  ok("fin du suivi : retour a l ETAT INITIAL (perche au composeur, idle)", posRetour.hb >= posRetour.it - 20 && posRetour.hb <= posRetour.it + 70 && posRetour.a.cible === "composeur" && posRetour.a.anim === "idle", JSON.stringify(posRetour));

  /* ── 6. voix : il suit la lecture puis se taire ── */
  section("6. Voix : le compagnon s agite pendant la lecture, puis se repose");
  await page.evaluate(() => {
    const orig = window.ttsEmission;
    window.__ttsAppels = 0;
    window.ttsEmission = function (t, l, onEnd, onErr) {
      window.__ttsAppels++;
      try { return orig.call(this, t, l, onEnd, onErr); } catch (e) { try { if (onEnd) onEnd(); } catch (e2) {} }
    };
  });
  await page.evaluate(() => { window.ttsEmission("Phrase de test du compagnon.", "fr-FR", function () {}, function () {}); });
  await page.waitForFunction(() => window.__v584Pets.etat().anim === "wave", null, { timeout: 4000 });
  const e6 = await page.evaluate(() => window.__v584Pets.etat());
  ok("pendant la lecture : compagnon anime (wave)", e6.anim === "wave", JSON.stringify(e6));
  await page.waitForFunction(() => window.__v584Pets.etat().cible === "composeur", null, { timeout: 6000 });
  const e6b = await page.evaluate(() => window.__v584Pets.etat());
  ok("apres le silence : retour a l etat initial", e6b.anim === "idle" && e6b.cible === "composeur", JSON.stringify(e6b));

  /* ── 7. wrappers marques ── */
  section("7. Les crochets sont marques et se reaffirment");
  const e7 = await page.evaluate(() => ({ flux: !!(window.callLLMStream && window.callLLMStream.__v584W), tts: !!(window.ttsEmission && window.ttsEmission.__v584W) }));
  ok("callLLMStream porte le marqueur __v584W", e7.flux === true, JSON.stringify(e7));
  ok("ttsEmission porte le marqueur __v584W", e7.tts === true, JSON.stringify(e7));

  /* ── 8. atlas : grille OpenPets reelle ── */
  section("8. Atlas des mascottes : format OpenPets verifie");
  const atlas = await page.evaluate(() => new Promise(function (res) {
    const img = new Image();
    img.onload = function () { res({ w: img.naturalWidth, h: img.naturalHeight }); };
    img.onerror = function () { res({ w: 0, h: 0 }); };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(window.__v584Pets.atlas("colombe"));
  }));
  ok("atlas SVG decode aux dimensions OpenPets (1536x2288)", atlas.w === 1536 && atlas.h === 2288, JSON.stringify(atlas));
  const fam = await page.evaluate(() => ({ pat: window.__v584Pets.familleDe({ name: "Exegete", desc: " " }), def: window.__v584Pets.familleDe({ name: "Agent perso", desc: " " }) }));
  ok("famille Exegete → chouette ; agent perso → phenix", fam.pat === "chouette" && fam.def === "phenix", JSON.stringify(fam));

  /* ── 9. pile et invariants ── */
  section("9. Pile z-index et invariants de surface");
  const e9 = await page.evaluate(() => {
    const h = document.getElementById("v584-pet");
    if (!h) return null;
    const cs = getComputedStyle(h);
    return { z: parseFloat(cs.zIndex), cls: h.className, pe: cs.pointerEvents, inline: (h.getAttribute("style") || "") };
  });
  ok("z-index derive des tokens : au-dessus du contenu, sous les fiches", e9 && e9.z > 1000 && e9.z < 9900, e9 ? "z=" + e9.z : "absent");
  ok("aucune classe ui-* au repos (invariant v513)", e9 && e9.cls.indexOf("ui-") === -1, e9 ? e9.cls : "");
  ok("traverse la souris (pointer-events none)", e9 && e9.pe === "none", e9 ? e9.pe : "");
  ok("aucune url dans le style inline (sanitizer a11y)", e9 && e9.inline.indexOf("url(") === -1, e9 ? e9.inline.slice(0, 40) : "");
  const bob = await page.evaluate(() => {
    const h = document.getElementById("v584-pet");
    const b = h ? h.querySelector(".v584-float") : null;
    return { present: !!b, anim: b ? getComputedStyle(b).animationName : "", taille: b ? getComputedStyle(b).animationDuration : "" };
  });
  ok("corps flottant separe du voyage (bob anime en permanence)", bob.present && bob.anim === "v584-bob", JSON.stringify(bob));

  /* ── 10. OFF → disparition + persistance ── */
  section("10. Desactivation : le compagnon quitte l ecran (et y reste apres rechargement)");
  await page.evaluate(() => { const c = document.getElementById("v584-on"); if (c.checked) c.click(); });
  await page.waitForFunction(() => window.__v584Pets.etat().visible === false, null, { timeout: 5000 });
  const e10 = await page.evaluate(() => ({ host: !!document.getElementById("v584-pet"), cle: localStorage.getItem("theo_pets") }));
  ok("case decochee → compagnon retire du DOM", e10.host === false);
  ok("choix persiste (theo_pets = 0)", e10.cle === "0", e10.cle);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(1800);
  const e10b = await page.evaluate(() => ({ host: !!document.getElementById("v584-pet"), st: window.__v584Pets.etat() }));
  ok("apres rechargement : toujours aucun compagnon", e10b.host === false && e10b.st.visible === false, JSON.stringify(e10b));

  /* proprete */
  ok("aucune erreur JavaScript", bruit.length === 0, bruit.slice(0, 3).join(" | "));
  const bons = resultats.filter(r => r.pass).length;
  console.log("\nRESULTAT : " + bons + "/" + resultats.length);
  await browser.close();
  try { await H.killRelay(relais); } catch (e) { try { relais.proc.kill(); } catch (e2) {} }
  process.exit(bons === resultats.length ? 0 : 1);
})();
