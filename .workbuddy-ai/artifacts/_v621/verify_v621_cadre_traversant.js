/* ═══════════════════════════════════════════════════════════════
   Banc v621 — LE CADRE EST TRAVERSANT : on SÉLECTIONNE le texte dessous.

   Demande : « dans les encadrés, je veux pouvoir faire des surlignages et des
   commentaires sur des mots/phrases sélectionnés ».

   Avant : le cadre captait la souris (surcouche) — impossible de sélectionner
   le texte qu'il entoure. Après : `pointer-events:none` sur la boîte, le cadre
   restant saisissable par ses BORDS, sa POIGNÉE, ses coins et son badge.

   Ce banc prouve :
   1. le centre du cadre n'intercepte plus la souris (le texte est dessous) ;
   2. un glissement dans le cadre SÉLECTIONNE réellement du texte ;
   3. la bulle d'annotation s'ouvre sur cette sélection, et ✏️ Surligner crée
      bien un surlignage ;
   4. le cadre se déplace encore par son BORD ;
   5. il se redimensionne encore par son COIN ;
   6. le survol d'un commentaire situé DANS le cadre l'affiche toujours ;
   7. le badge 💬 ouvre toujours la note du cadre ;
   8. contrôle NÉGATIF : glisser au centre ne déplace PAS le cadre ;
   9. zéro erreur JS.
   ════════════════════════════════════════════════════════════════ */
const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");
const resultats = [];
function section(t) { console.log("\n■ " + t); }
function ok(label, cond, detail) {
  resultats.push({ label, pass: !!cond });
  console.log((cond ? "  [OK]   " : "  [ECHEC]") + " " + label + (detail ? " — " + detail : ""));
}

const TS = 1700000000000;

(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v621_" + Date.now()) });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const bruit = [];
  page.on("pageerror", e => bruit.push(String(e).slice(0, 200)));
  await page.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2200);

  /* Deux surcouches de démarrage couvrent l'app (porte d'accès z 999999,
     assistant de configuration z 2000). On les neutralise par CLASSE + style
     inline !important : un clic sur un bouton dépend de l'étape affichée. */
  await page.evaluate(() => {
    const ov = document.getElementById('auth-overlay');
    if (ov) { ov.classList.add('hidden'); ov.style.setProperty('display', 'none', 'important'); }
    const w = document.getElementById('setup-wizard-overlay');
    if (w) { w.classList.remove('active'); w.style.setProperty('display', 'none', 'important'); }
    try { if (window.tpaiSetView) window.tpaiSetView('chat'); } catch (e) {}
  });
  await page.waitForTimeout(400);

  section("0. Un message avec un cadre SANS ancre posé sur une phrase");
  const prep = await page.evaluate((ts) => {
    state.messages = [{
      role: 'assistant',
      content: 'La notion de Kyrios designe la seigneurie divine.\n\n'
        + 'Mais avec une hierarchie d economie : le Pere est la source, le Fils est envoye.\n\n'
        + 'Citation cle : Cyrille d Alexandrie, De Adoratione in Spiritu 1.',
      ts: ts, annotations: [], marks: []
    }];
    if (typeof renderMessages === 'function') renderMessages();
    const box = document.getElementById('mc-' + ts);
    if (!box) return { ok: false };
    const rb = box.getBoundingClientRect();
    /* Le cadre doit VRAIMENT entourer le texte : on le cale sur son rectangle
       mesuré (le poser « au jugé » le laissait à côté — faux négatif). */
    const w0 = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, null);
    const n0 = w0.nextNode();
    const rg0 = document.createRange();
    rg0.setStart(n0, 0); rg0.setEnd(n0, Math.min(40, n0.nodeValue.length));
    const rt = rg0.getBoundingClientRect();
    window.__v621rt = rt;
    state.messages[0].shapes = [{ id: 'fg-t', shape: 'Rectangle', color: '#4f8ef7', weight: 1.4,
      text: '', svg: '<rect/>',
      /* DANS la zone visible : `.message-content{overflow:hidden}` rogne tout
         ce qui dépasse, et un bord rogné n'est plus hit-testé. */
      x: 4, y: 2, w: Math.round(rb.width - 12), h: 90,
      note: 'Note du cadre.' }];
    if (window.__applyShapes) window.__applyShapes();
    const fb = document.querySelector('[data-fig-id="fg-t"]');
    const r = fb.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      ok: true, rect: r.toJSON(),
      auCentre: el ? (el.tagName + '.' + (el.className || '').toString().slice(0, 40)) : null,
      dansCadre: !!(el && el.closest && el.closest('.atc-figbox'))
    };
  }, TS);
  await page.waitForTimeout(400);
  ok("cadre posé", prep.ok === true, String(prep.ok));

  section("1. Le centre du cadre n'intercepte plus la souris");
  ok("l'élément au centre n'est PAS le cadre", prep.dansCadre === false, String(prep.auCentre));

  section("2. Un glissement DANS le cadre sélectionne du texte");
  const sel = await page.evaluate((ts) => {
    const box = document.getElementById('mc-' + ts);
    const fb = document.querySelector('[data-fig-id="fg-t"]');
    const r = fb.getBoundingClientRect();
    /* point de départ sur le premier mot de la ligne, à l'intérieur du cadre */
    const w = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, null);
    const n = w.nextNode();
    const rng = document.createRange();
    rng.setStart(n, 3); rng.setEnd(n, 9);
    const rr = rng.getBoundingClientRect();
    return { x1: rr.left + 1, x2: rr.right - 1, y: rr.top + rr.height / 2,
             dansCadre: rr.left > r.left && rr.right < r.right };
  }, TS);
  ok("le texte visé est bien à l'intérieur du cadre", sel.dansCadre === true, JSON.stringify(sel));
  await page.mouse.move(sel.x1, sel.y);
  await page.mouse.down();
  await page.mouse.move(sel.x2, sel.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const r2 = await page.evaluate(() => {
    const s = window.getSelection();
    return { texte: s ? s.toString() : '', collapse: s ? s.isCollapsed : true };
  });
  ok("du texte est RÉELLEMENT sélectionné dans le cadre", r2.texte.trim().length > 1 && r2.collapse === false,
     JSON.stringify(r2.texte));

  section("3. La bulle d'annotation s'ouvre, ✏️ Surligner crée un surlignage");
  const r3 = await page.evaluate(async () => {
    const bulle = document.getElementById('atc-bubble');
    const vis = bulle && getComputedStyle(bulle).display !== 'none' && bulle.getBoundingClientRect().width > 50;
    const hl = bulle ? bulle.querySelector('[data-act="hl"]') : null;
    if (hl) hl.click();
    await new Promise(r => setTimeout(r, 200));
    /* ✏️ ouvre le NUANCIER : c'est le choix d'une couleur qui crée le
       surlignage (un simple clic sur ✏️ n'en crée aucun). */
    const dot = document.querySelector('.cc-dot[data-color]');
    if (dot) dot.click();
    await new Promise(r => setTimeout(r, 350));
    const msg = state.messages[0];
    const sp = document.querySelector('.atc-mark');
    return { bulle: !!vis, bouton: !!hl, marques: (msg.marks || []).length,
             span: sp ? sp.textContent : null };
  });
  ok("la bulle d'annotation est visible sur la sélection", r3.bulle === true, String(r3.bulle));
  ok("le bouton Surligner existe", r3.bouton === true, String(r3.bouton));
  ok("un surlignage est créé", r3.marques === 1, String(r3.marques));
  ok("il couvre bien le texte sélectionné", !!r3.span && r3.span.length > 1, String(r3.span));

  section("4. Le cadre se déplace encore par son BORD");
  const r4 = await page.evaluate(() => {
    const fb = document.querySelector('[data-fig-id="fg-t"]');
    /* bord GAUCHE : toujours à l'intérieur du message, donc hit-testable
       (le bord haut peut être rogné par .message-content{overflow:hidden}). */
    const e = fb.querySelector('.fb-edge[data-bord="l"]');
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, avant: { l: fb.offsetLeft, t: fb.offsetTop } };
  });
  await page.mouse.move(r4.x, r4.y);
  await page.mouse.down();
  await page.mouse.move(r4.x + 30, r4.y + 18, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const r4b = await page.evaluate(() => {
    const fb = document.querySelector('[data-fig-id="fg-t"]');
    return { l: fb.offsetLeft, t: fb.offsetTop };
  });
  ok("le cadre a bougé (déplacement par le bord)", r4b.l !== r4.avant.l || r4b.t !== r4.avant.t,
     JSON.stringify(r4.avant) + ' -> ' + JSON.stringify(r4b));

  section("5. Il se redimensionne encore par son COIN");
  const r5 = await page.evaluate(() => {
    const fb = document.querySelector('[data-fig-id="fg-t"]');
    fb.classList.add('sel');
    const h = fb.querySelector('.h[data-dir="se"]');
    const r = h.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: fb.offsetWidth, h: fb.offsetHeight };
  });
  await page.mouse.move(r5.x, r5.y);
  await page.mouse.down();
  await page.mouse.move(r5.x + 40, r5.y + 20, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const r5b = await page.evaluate(() => {
    const fb = document.querySelector('[data-fig-id="fg-t"]');
    return { w: fb.offsetWidth, h: fb.offsetHeight };
  });
  ok("le cadre a été redimensionné", r5b.w > r5.w && r5b.h > r5.h, JSON.stringify(r5) + ' -> ' + JSON.stringify(r5b));

  section("6. Le survol d'un commentaire DANS le cadre l'affiche toujours");
  /* nettoyer sélection + barre d'outils avant de mesurer un survol */
  await page.mouse.click(24, 520);
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    try { window.getSelection().removeAllRanges(); } catch (e) {}
    document.querySelectorAll('.fig-tools').forEach(function (e) { e.remove(); });
    const t = document.getElementById('atc-tip'); if (t) t.remove();
  });
  await page.evaluate(() => {
    const CONT = state.messages[0].content;
    const MOT = 'seigneurie divine';
    const st = CONT.indexOf(MOT);
    state.messages[0].annotations = [{ id: 'hl-x', text: MOT,
      a: 'Commentaire dans le cadre.', start: st, end: st + MOT.length }];
    if (window.__applyHighlights) window.__applyHighlights();
  });
  await page.waitForTimeout(300);
  const cible = await page.evaluate(() => {
    const hl = document.querySelector('.atc-hl[data-hl-id="hl-x"]');
    if (!hl) return null;
    const r = hl.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (cible) {
    await page.mouse.move(5, 5); await page.waitForTimeout(150);
    await page.mouse.move(cible.x, cible.y); await page.waitForTimeout(400);
  }
  const r6 = await page.evaluate(() => {
    const t = document.getElementById('atc-tip');
    return { present: !!t, texte: t ? t.textContent.slice(0, 80) : '' };
  });
  ok("l'infobulle du commentaire s'affiche dans le cadre", r6.present === true, String(r6.texte));

  section("7. Le badge 💬 ouvre toujours la note du cadre");
  const r7 = await page.evaluate(async () => {
    const fb = document.querySelector('[data-fig-id="fg-t"]');
    const b = fb.querySelector('.fb-note');
    if (!b) return { badge: false };
    const r = b.getBoundingClientRect();
    b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: r.x + 8, clientY: r.y + 8 }));
    await new Promise(x => setTimeout(x, 150));
    const p = document.getElementById('atc-fig-note');
    const val = p ? p.querySelector('textarea').value : null;
    if (p) p.remove();
    return { badge: true, ouvert: !!p, val: val };
  });
  ok("le badge ouvre la note du cadre", r7.badge === true && r7.ouvert === true && r7.val === 'Note du cadre.',
     JSON.stringify(r7));

  section("8. Contrôle NÉGATIF : glisser au CENTRE ne déplace pas le cadre");
  const avantCentre = await page.evaluate(() => {
    const fb = document.querySelector('[data-fig-id="fg-t"]');
    return { l: fb.offsetLeft, t: fb.offsetTop };
  });
  const centre = await page.evaluate(() => {
    const fb = document.querySelector('[data-fig-id="fg-t"]');
    const r = fb.getBoundingClientRect();
    return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.55 };
  });
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  await page.mouse.move(centre.x + 25, centre.y + 25, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const apresCentre = await page.evaluate(() => {
    const fb = document.querySelector('[data-fig-id="fg-t"]');
    return { l: fb.offsetLeft, t: fb.offsetTop };
  });
  ok("le cadre n'a PAS bougé (le geste sélectionne le texte)",
     apresCentre.l === avantCentre.l && apresCentre.t === avantCentre.t,
     JSON.stringify(avantCentre) + ' -> ' + JSON.stringify(apresCentre));

  section("9. Aucune erreur JavaScript");
  ok("zéro erreur JS", bruit.length === 0, bruit.slice(0, 2).join(' | '));

  const passes = resultats.filter(r => r.pass).length;
  console.log("\nRESULTAT : " + passes + "/" + resultats.length);
  if (passes !== resultats.length) resultats.filter(r => !r.pass).forEach(r => console.log("  ÉCHEC : " + r.label));
  await browser.close();
  relais.child.kill();
  process.exit(passes === resultats.length ? 0 : 1);
})().catch(e => { console.error("EXCEPTION :", e && e.stack || e); process.exit(1); });
