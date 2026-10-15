/* ═══════════════════════════════════════════════════════════════
   Banc v587 — ERRANCE : le compagnon se deplace LIBREMENT dans toute
   l interface du chat.
   Contrat : reglage « Deambulation libre » present et actif par defaut ;
   la zone d errance couvre la conversation ET le composeur ; les points
   tires restent dans la zone (marge) et sont etales ; apres l activation
   d un agent, le compagnon QUITTE son ancre et visite plusieurs positions
   distinctes, toujours dans la zone, en restant anime (idle) ; le sens
   (data-face) correspond au sens du deplacement ; la generation SUSPEND
   la promenade (ancre message) puis la REPREND ; desactiver le reglage
   arrete la promenade et ramene le compagnon au composeur.
   Magasin isole (v559) + fetch intercepte. ════════════════════════════ */
const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
const resultats = [];
function section(t) { console.log("\n■ " + t); }
function ok(label, cond, detail) {
  resultats.push({ label, pass: !!cond });
  console.log((cond ? "  [OK]   " : "  [ECHEC]") + " " + label + (detail ? " — " + detail : ""));
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

(async () => {
  const port = await H.pickFreePort();
  const STORE_DIR = path.join(os.tmpdir(), "theo_v587_store_" + Date.now());
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
  await page.evaluate(() => {
    try { state.keys = state.keys || {}; state.keys.agnes = "banc-cle-factice"; state.model = "agnes:agnes-2.5-flash"; } catch (e) {}
  });

  /* ── 1. reglage + zone ── */
  section("1. Reglage « Deambulation libre » present, actif par defaut, zone = chat");
  await page.evaluate(() => { const c = document.getElementById("v584-on"); if (c && !c.checked) c.click(); });
  await page.waitForTimeout(400);
  const e1 = await page.evaluate(() => {
    const c = document.getElementById("v584-errance");
    const wrap = document.getElementById("chat-wrap").getBoundingClientRect();
    const inp = document.getElementById("input-area").getBoundingClientRect();
    return {
      existe: !!c, coche: c ? c.checked : null, cle: localStorage.getItem("theo_pets_errance"),
      z: window.__v584Pets.errance().zone,
      wrap: { x: wrap.left, y: wrap.top, w: wrap.width, h: wrap.height }, inpBas: inp.bottom
    };
  });
  ok("case « Deambulation libre » injectee dans PARAMETRES", e1.existe === true, JSON.stringify(e1));
  ok("active par defaut (cochée, cle absente)", e1.coche === true && e1.cle === null, "coche=" + e1.coche + " cle=" + e1.cle);
  ok("la zone part du bord gauche du chat", Math.abs(e1.z.x - e1.wrap.x) < 2, "z.x=" + e1.z.x + " wrap.x=" + e1.wrap.x);
  ok("la zone couvre toute la hauteur du chat", e1.z.h >= e1.wrap.h - 2, "z.h=" + e1.z.h + " wrap.h=" + e1.wrap.h);
  ok("la zone descend jusqu au bas du composeur", Math.abs((e1.z.y + e1.z.h) - e1.inpBas) < 3, "bas=" + (e1.z.y + e1.z.h) + " inp=" + e1.inpBas);

  /* ── 2. points tires : bornes + etalement ── */
  section("2. Les points de promenade restent dans la zone et sont etales");
  const e2 = await page.evaluate(() => {
    const z = window.__v584Pets.errance().zone;
    const pts = [];
    for (let i = 0; i < 400; i++) pts.push(window.__v584Pets.choisirPoint());
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, hors = 0;
    pts.forEach(p => {
      if (p.x < z.x || p.x > z.x + z.w || p.y < z.y || p.y > z.y + z.h) hors++;
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });
    return { n: pts.length, hors: hors, etX: maxX - minX, etY: maxY - minY, z: z };
  });
  ok("400 points tires : aucun hors de la zone", e2.hors === 0, JSON.stringify({ hors: e2.hors }));
  ok("etalement horizontal reel (> 300 px)", e2.etX > 300, "etX=" + Math.round(e2.etX));
  ok("etalement vertical reel (> 200 px)", e2.etY > 200, "etY=" + Math.round(e2.etY));

  /* ── 3. deambulation automatique apres activation d un agent ── */
  section("3. Agent active → le compagnon quitte son ancre et visite la zone");
  await page.evaluate(async () => { await db.put("agents", { id: "v587-pat", name: "Patristique", desc: "Peres de l Eglise" }); });
  await page.evaluate(() => window.activateAgent("v587-pat"));
  await page.waitForFunction(() => window.__v584Pets.etat().visible, null, { timeout: 8000 });
  await page.waitForFunction(() => window.__v584Pets.errance().actif === true, null, { timeout: 8000 });
  ok("au repos : la promenade est ARMED (actif)", true);
  await page.waitForFunction(() => window.__v584Pets.etat().cible === "errance", null, { timeout: 8000 });
  const e3a = await page.evaluate(() => window.__v584Pets.etat());
  ok("la cible quitte l ancre pour « errance »", e3a.cible === "errance", JSON.stringify(e3a));

  /* on echantillonne la position REELLE (getBoundingClientRect) pendant la promenade */
  const vue = await page.evaluate(async () => {
    const z = window.__v584Pets.errance().zone;
    const pts = [], anims = new Set();
    let hors = 0;
    const fin = Date.now() + 15000;
    while (Date.now() < fin) {
      const h = document.getElementById("v584-pet");
      if (h) {
        const r = h.getBoundingClientRect();
        anims.add(h.getAttribute("data-anim"));
        if (r.left < z.x - 3 || r.right > z.x + z.w + 3 || r.top < z.y - 3 || r.bottom > z.y + z.h + 3) hors++;
        pts.push({ x: Math.round(r.left), y: Math.round(r.top) });
      }
      await new Promise(r => setTimeout(r, 350));
    }
    /* positions distinctes (regroupees a 40 px) */
    const distinctes = [];
    pts.forEach(p => { if (!distinctes.some(d => Math.hypot(d.x - p.x, d.y - p.y) < 40)) distinctes.push(p); });
    return { n: pts.length, distinctes: distinctes, hors: hors, anims: Array.from(anims), z: z };
  });
  ok("positions distinctes visitees (>= 3)", vue.distinctes.length >= 3, "distinctes=" + vue.distinctes.length + " " + JSON.stringify(vue.distinctes));
  ok("aucune position hors de la zone pendant la promenade", vue.hors === 0, "hors=" + vue.hors + "/" + vue.n);
  ok("le compagnon reste ANIME pendant la promenade (idle)", vue.anims.length === 1 && vue.anims[0] === "idle", JSON.stringify(vue.anims));

  /* ── 4. invariant de sens : data-face suit le sens du deplacement ── */
  section("4. Le compagnon se retourne dans le sens de sa marche");
  const sens = await page.evaluate(async () => {
    const mouv = [];
    let prec = window.__v584Pets.errance().pos;
    const fin = Date.now() + 16000;
    while (Date.now() < fin && mouv.length < 4) {
      await new Promise(r => setTimeout(r, 140));
      const e = window.__v584Pets.errance();
      const dx = e.pos.x - prec.x;
      if (Math.abs(dx) > 5) { mouv.push({ dx: Math.round(dx), face: e.face }); prec = e.pos; }
    }
    const coherents = mouv.filter(m => (m.dx > 0 && m.face === "droite") || (m.dx < 0 && m.face === "gauche")).length;
    return { n: mouv.length, coherents: coherents, mouv: mouv };
  });
  ok("au moins 3 deplacements observes", sens.n >= 3, JSON.stringify(sens.mouv));
  ok("data-face coherent avec le sens (droite/gauche)", sens.n > 0 && sens.coherents === sens.n, sens.coherents + "/" + sens.n);
  const faces = await page.evaluate(() => document.getElementById("v584-pet").getAttribute("data-face"));
  ok("attribut data-face pose sur l hote", faces === "droite" || faces === "gauche", faces);

  /* ── 5. la generation SUSPEND puis REPREND la promenade ── */
  section("5. Generation : la promenade est suspendue (message) puis reprise");
  await page.evaluate(() => {
    try { state.messages.push({ role: "user", content: "Question de test errance." }); } catch (e) {}
    if (typeof renderMessages === "function") renderMessages();
    const enc = s => new TextEncoder().encode(s);
    window.__fluxFini = false;
    window.fetch = async function (url) {
      if (String(url).indexOf("/chat/completions") !== -1) {
        await new Promise(r => setTimeout(r, 1500));
        const parts = [enc("data: " + JSON.stringify({ choices: [{ delta: { content: "Reponse de test, phrase complete. " } }] }) + "\n\n"), enc("data: [DONE]\n\n")];
        const plat = []; parts.forEach(c => c.forEach(b => plat.push(b)));
        const tout = new Uint8Array(plat); let lu = false;
        return { ok: true, status: 200, body: { getReader: () => ({ read: async () => lu ? { done: true } : (lu = true, { done: false, value: tout }) }) } };
      }
      return { ok: false, status: 404, text: async () => "" };
    };
  });
  await page.evaluate(() => {
    let cfg = null;
    try { cfg = (typeof resolveModelConfig === "function") ? resolveModelConfig("agnes:agnes-2.5-flash") : null; } catch (e) {}
    if (!cfg) cfg = { apiEndpoint: "http://127.0.0.1:9/v1" };
    const p = window.callLLMStream(cfg, [{ role: "user", content: "Q" }], { temperature: 0.4, max_tokens: 60 }, function () {});
    if (p && typeof p.then === "function") p.then(() => { window.__fluxFini = true; }, () => { window.__fluxFini = true; });
  });
  await page.waitForFunction(() => window.__v584Pets.etat().cible === "message", null, { timeout: 6000 });
  const e5a = await page.evaluate(() => ({ st: window.__v584Pets.etat(), er: window.__v584Pets.errance() }));
  ok("pendant la generation : ancre « message »", e5a.st.cible === "message", e5a.st.cible);
  ok("pendant la generation : promenade SUSPENDUE", e5a.er.actif === false, "actif=" + e5a.er.actif);
  await page.waitForFunction(() => window.__fluxFini === true, null, { timeout: 8000 });
  await page.waitForFunction(() => window.__v584Pets.etat().anim === "happy", null, { timeout: 5000 });
  ok("fin de generation : mascotte heureuse (happy)", true);
  await page.waitForFunction(() => window.__v584Pets.etat().cible === "composeur", null, { timeout: 6000 });
  await page.waitForFunction(() => window.__v584Pets.errance().actif === true, null, { timeout: 8000 });
  await page.waitForFunction(() => window.__v584Pets.etat().cible === "errance", null, { timeout: 8000 });
  const e5b = await page.evaluate(() => window.__v584Pets.etat());
  ok("apres la generation : la promenade REPREND", e5b.cible === "errance" && e5b.anim === "idle", JSON.stringify(e5b));

  /* ── 6. desactivation du reglage : arret + retour au composeur ── */
  section("6. Reglage decoche → promenade arretee, retour au composeur");
  await page.evaluate(() => { const c = document.getElementById("v584-errance"); if (c.checked) c.click(); });
  await page.waitForTimeout(700);
  const e6 = await page.evaluate(() => ({ er: window.__v584Pets.errance(), st: window.__v584Pets.etat(), cle: localStorage.getItem("theo_pets_errance") }));
  ok("cle persistee theo_pets_errance = 0", e6.cle === "0", e6.cle);
  ok("promenade desactivee (on = false)", e6.er.on === false, JSON.stringify(e6.er.on));
  ok("promenade arretee (actif = false)", e6.er.actif === false, "actif=" + e6.er.actif);
  ok("retour a l ancre composeur", e6.st.cible === "composeur" && e6.st.anim === "idle", JSON.stringify(e6.st));
  /* stable : rien ne bouge plus */
  const p1 = await page.evaluate(() => window.__v584Pets.errance().pos);
  await page.waitForTimeout(3000);
  const p2 = await page.evaluate(() => window.__v584Pets.errance().pos);
  ok("plus aucun deplacement apres desactivation", dist(p1, p2) < 1, JSON.stringify({ p1, p2 }));

  /* ── 7. proprete ── */
  section("7. Proprete");
  ok("aucune erreur JavaScript", bruit.length === 0, bruit.slice(0, 3).join(" | "));

  const bons = resultats.filter(r => r.pass).length;
  console.log("\nRESULTAT : " + bons + "/" + resultats.length);
  await browser.close();
  try { await H.killRelay(relais); } catch (e) { try { relais.proc.kill(); } catch (e2) {} }
  process.exit(bons === resultats.length ? 0 : 1);
})();
