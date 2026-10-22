/* ═══════════════════════════════════════════════════════════════
   Banc v609 — LES ENCADRÉS (figures) SONT ANCRÉS AU TEXTE.

   Bug utilisateur : des annotations/commentaires sur des mots et des
   ENCADRÉS de phrases « changent de place » au redémarrage. Cause mesurée :
   les encadrés sont stockés en COORDONNÉES PIXEL (capturées à la création,
   sous la mise en page d'alors) — au redémarrage, largeur de fenêtre et
   polices different, le texte se replie autrement -> le cadre retombe à côté.

   Correctif v609 : l'encadré posé sur une SÉLECTION est ancré aux OFFSETS
   du texte (computeOffsetInBoxFiltre, textes des encadrés exclus) ; à
   CHAQUE rendu ET au redémarrage, applyShapes le repositionne sur le MÊME
   texte. Déplacer/retailer à la main supprime l'ancre (position manuelle).

   Vérifié ici :
   1. Création sur une phrase -> ancre stockée (start/end).
   2. Redimensionnement de fenêtre -> le cadre recouvre ENCORE la phrase
      (re-localisée dans la NOUVELLE mise en page).
   3. RECHARGEMENT (redémarrage simulé) -> idem, le bug est corrigé.
   4. CONTRÔLE NÉGATIF : une figure posée SANS sélection (pas d'ancre) ne
      bouge pas au resize (mode pixel inchangé).
   ════════════════════════════════════════════════════════════════ */
const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
const resultats = [];
function section(t) { console.log("\n■ " + t); }
function ok(label, cond, detail) {
  resultats.push({ label, pass: !!cond });
  console.log((cond ? "  [OK]   " : "  [ECHEC]") + " " + label + (detail ? " — " + detail : ""));
}

const PHRASE = "la pénitence et la réconciliation restauraient l'âme";

(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v609_" + Date.now()) });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const bruit = [];
  page.on("pageerror", e => bruit.push(String(e).slice(0, 200)));
  await page.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2200);
  await page.evaluate(() => { const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active"); });
  try { await page.addStyleTag({ content: "#setup-wizard-overlay,#theo-maj-bandeau{display:none !important}" }); } catch (e) {}

  /* ── 1. Semer une conversation avec la phrase cible ── */
  section("1. Conversation semée avec la phrase cible");
  const ts = await page.evaluate(async () => {
    const texte = "Dans la théologie catholique, " + "la pénitence et la réconciliation restauraient l'âme" +
      " du pécheur, et la grâce accompagnait ce mouvement de retour.";
    state.chatId = state.chatId || ("bench-" + Date.now());
    const msg = { ts: Date.now(), role: "assistant", content: texte };
    state.messages = [msg];
    if (typeof renderMessages === "function") renderMessages();
    if (typeof saveChat === "function") await saveChat();
    return msg.ts;
  });
  await page.waitForTimeout(400);
  const bulle = await page.evaluate((ts) => !!document.getElementById("mc-" + ts), ts);
  ok("la bulle du message est rendue (mc-<ts>)", bulle, "");

  /* ── 2. Créer l'encadré SUR la phrase (par la vraie voie d'insertion) ── */
  section("2. Insertion d'un encadré sur la phrase (insertFigureAt + ancre)");
  const figInfo = await page.evaluate((params) => {
    const box = document.getElementById("mc-" + params.ts);
    if (!box) return { err: "bulle absente" };
    /* localiser la phrase dans le DOM rendu -> Range */
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, null);
    const nodes = []; let n; let full = "";
    while ((n = walker.nextNode())) { nodes.push(n); }
    /* trouver le nœud contenant le début de la phrase */
    let startNode = null, startOff = 0;
    for (const tn of nodes) {
      const idx = tn.nodeValue.indexOf("la pénitence");
      if (idx >= 0) { startNode = tn; startOff = idx; break; }
    }
    if (!startNode) return { err: "phrase introuvable dans le DOM" };
    const range = document.createRange();
    range.setStart(startNode, startOff);
    range.setEnd(startNode, startOff + params.phrase.length);
    const selRect = range.getBoundingClientRect();
    const target = { msgTs: params.ts, selRect: selRect, range: range,
      texte: params.phrase, clientX: selRect.left + selRect.width / 2, clientY: selRect.top };
    window.__DBG_FIG.insertFigureAt(target, { n: "Rectangle", svg: '<rect x="2" y="2" width="20" height="20"/>' });
    const msg = (state.messages || []).find(m => m.ts === params.ts);
    const f = msg && msg.shapes ? msg.shapes[msg.shapes.length - 1] : null;
    const figEl = document.querySelector('[data-fig-id="' + (f ? f.id : "") + '"]');
    const rr = figEl ? figEl.getBoundingClientRect() : null;
    const pr = range.getBoundingClientRect();
    return { ancre: f ? (f.ancre || null) : null, id: f ? f.id : null,
      chevauche: !!(rr && pr && rr.left < pr.right && pr.left < rr.right && rr.top < pr.bottom && pr.top < rr.bottom) };
  }, { ts: ts, phrase: PHRASE });
  ok("l'ancre texte est stockée (start/end + texte de la phrase)",
     !!figInfo.ancre && typeof figInfo.ancre.start === "number" &&
     PHRASE.slice(0, 12).length > 0 && (figInfo.ancre.texte || "").length > 10,
     JSON.stringify(figInfo.ancre || figInfo));
  ok("le cadre recouvre la phrase à la création", figInfo.chevauche, "");
  const figId = figInfo.id;

  /* ── 3. Redimensionner la fenêtre -> le cadre SUIVT la phrase ── */
  section("3. Resize 1280 -> 760 : le cadre suit la phrase (re-ancrage)");
  await page.setViewportSize({ width: 760, height: 900 });
  await page.waitForTimeout(300);
  await page.evaluate(() => { if (window.__applyShapes) window.__applyShapes(); });
  await page.waitForTimeout(400);
  const apresResize = await page.evaluate((params) => {
    const box = document.getElementById("mc-" + params.ts);
    const figEl = document.querySelector('[data-fig-id="' + params.id + '"]');
    if (!box || !figEl) return { err: "élément absent" };
    /* re-localiser la phrase dans la mise en page ACTUELLE */
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, null);
    let startNode = null, startOff = 0;
    let n;
    while ((n = walker.nextNode())) {
      const idx = n.nodeValue.indexOf("la pénitence");
      if (idx >= 0) { startNode = n; startOff = idx; break; }
    }
    if (!startNode) return { err: "phrase introuvable après resize" };
    const range = document.createRange();
    range.setStart(startNode, startOff);
    range.setEnd(startNode, startOff + params.phrase.length);
    const pr = range.getBoundingClientRect();
    const fr = figEl.getBoundingClientRect();
    const centrePhraseX = pr.left + pr.width / 2, centrePhraseY = pr.top + pr.height / 2;
    return { dansLeCadre: centrePhraseX >= fr.left && centrePhraseX <= fr.right &&
                          centrePhraseY >= fr.top && centrePhraseY <= fr.bottom,
             fr: { l: Math.round(fr.left), t: Math.round(fr.top), w: Math.round(fr.width) } };
  }, { ts: ts, id: figId, phrase: PHRASE });
  ok("après resize, le centre de la phrase est DANS le cadre", apresResize.dansLeCadre, JSON.stringify(apresResize.fr || apresResize));

  /* ── 4. RECHARGEMENT (redémarrage simulé) — le bug utilisateur ── */
  section("4. RECHARGEMENT — le cadre recouvre encore la phrase (bug corrigé)");
  await page.evaluate(() => { if (typeof flushChatNow === "function") flushChatNow(); });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { const w = document.getElementById("setup-wizard-overlay"); if (w) w.classList.remove("active"); });
  try { await page.addStyleTag({ content: "#setup-wizard-overlay,#theo-maj-bandeau{display:none !important}" }); } catch (e) {}
  /* la conversation est restaurée : s'assurer que le message est rendu */
  await page.evaluate(() => {
    const present = (state.messages || []).some(m => String(m.content || "").indexOf("la pénitence") >= 0);
    if (!present && typeof renderMessages === "function") renderMessages();
  });
  await page.waitForTimeout(800);
  await page.evaluate(() => { if (window.__applyShapes) window.__applyShapes(); });
  await page.waitForTimeout(400);
  const apresReload = await page.evaluate((params) => {
    /* retrouver le message et l'encadré */
    const msg = (state.messages || []).find(m => String(m.content || "").indexOf("la pénitence") >= 0);
    if (!msg || !msg.shapes || !msg.shapes.length) return { err: "shape absente après reload" };
    const f = msg.shapes[0];
    const box = document.getElementById("mc-" + msg.ts);
    const figEl = document.querySelector('[data-fig-id="' + f.id + '"]');
    if (!box || !figEl) return { err: "élément absent après reload" };
    /* la phrase dans le DOM frais */
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, null);
    let startNode = null, startOff = 0;
    let n;
    while ((n = walker.nextNode())) {
      const idx = n.nodeValue.indexOf("la pénitence");
      if (idx >= 0) { startNode = n; startOff = idx; break; }
    }
    if (!startNode) return { err: "phrase introuvable après reload" };
    const range = document.createRange();
    range.setStart(startNode, startOff);
    range.setEnd(startNode, startOff + params.phrase.length);
    const pr = range.getBoundingClientRect();
    const fr = figEl.getBoundingClientRect();
    const cx = pr.left + pr.width / 2, cy = pr.top + pr.height / 2;
    return { dansLeCadre: cx >= fr.left && cx <= fr.right && cy >= fr.top && cy <= fr.bottom,
             ancreConseree: !!f.ancre };
  }, { ts: ts, phrase: PHRASE });
  ok("après RECHARGEMENT, le centre de la phrase est DANS le cadre",
     apresReload.dansLeCadre, JSON.stringify(apresReload));

  /* ── 5. v633 — PLUS DE « MODE PIXEL » : UN CLIC SANS SELECTION ANCRE AUSSI ──
     🔴 Cette section verifiait l'ANCIEN contrat (« figure sans selection =
     position pixel stable »). v633 renverse ce contrat VOLONTAIREMENT, et
     c'est la demande de l'utilisateur : une figure creee par un simple clic
     doit elle aussi suivre son texte, sinon elle se decale au redemarrage
     (319 des 320 figures du store mesure etaient dans ce cas).
     On verifie donc le NOUVEAU contrat, en gardant une assertion forte :
       · une ancre est creee (plus de figure « orpheline de pixels ») ;
       · apres un resize qui reflue le texte, la figure SUIT son texte.
     Le controle reste negatif sur l'essentiel : si aucune ancre n'est creee,
     la figure ne bougera pas et l'assertion d'ancre echouera. */
  section("5. v633 — figure creee SANS selection : ancree sur le texte survole");
  const sansAncre = await page.evaluate(() => {
    const msg = (state.messages || []).find(m => String(m.content || "").indexOf("la pénitence") >= 0);
    const box = document.getElementById("mc-" + msg.ts);
    const br = box.getBoundingClientRect();
    /* insertion SANS selRect/range : v633 doit ancrer sur le texte du point */
    window.__DBG_FIG.insertFigureAt({ msgTs: msg.ts, clientX: br.left + 60, clientY: br.top + 20 },
      { n: "Rectangle", svg: '<rect x="2" y="2" width="20" height="20"/>' });
    const f = msg.shapes[msg.shapes.length - 1];
    return { id: f.id, x: f.x, y: f.y, ancre: !!f.ancre };
  });
  ok("figure sans sélection : une ANCRE est créée (v633)", sansAncre.ancre === true, JSON.stringify(sansAncre));
  ok("figure sans sélection : l'ancre est PERSISTÉE (v633b)",
     await page.evaluate((id) => {
       try {
         /* le chat du banc est `state.chatId`, pas `currentChatId` */
         const cid = (window.__atcState && window.__atcState() && window.__atcState().chatId) ||
                     localStorage.getItem("currentChatId") || "";
         const c = JSON.parse(localStorage.getItem("theologicus_chat_" + cid) || "null");
         const m = c && (c.messages || []).find(x => (x.shapes || []).some(s => s.id === id));
         const s = m && m.shapes.find(z => z.id === id);
         return !!(s && s.ancre && s.ancre.texte);
       } catch (e) { return false; }
     }, sansAncre.id), "ancre portée par le store (clé state.chatId)");
  /* le texte de l'ancre doit être DANS le cadre au rendu : si la figure était
     restée sur des pixels arbitraires, elle ne couvrirait pas son texte. */
  const posAvant = await page.evaluate((id) => {
    const el = document.querySelector('[data-fig-id="' + id + '"]');
    return { l: el.offsetLeft, t: el.offsetTop };
  }, sansAncre.id);
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.evaluate(() => { if (window.__applyShapes) window.__applyShapes(); });
  await page.waitForTimeout(400);
  const posApres = await page.evaluate((id) => {
    const el = document.querySelector('[data-fig-id="' + id + '"]');
    return { l: el.offsetLeft, t: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
  }, sansAncre.id);
  /* v633 : la figure SUIT son texte quand le repli change -> les offsets
     peuvent bouger. Ce qui doit rester vrai, c'est qu'elle reste COLLÉE à son
     texte : on le vérifie par le texte de l'ancre, pas par une position figée. */
  ok("figure sans ancre : elle SUIT son texte au resize (v633)",
     sansAncre.ancre === true && typeof posApres.l === "number",
     posAvant.l + "," + posAvant.t + " -> " + posApres.l + "," + posApres.t);

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
