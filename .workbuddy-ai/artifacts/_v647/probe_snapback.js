/* ═══════════════════════════════════════════════════════════════
   SONDE v647 — le glissement manuel d'un cadre est-il défait ?

   Banc v621, test 4 : « le cadre se déplace encore par son BORD »
   échoue 13/14 avec avant={"l":0,"t":0} apres={"l":0,"t":0}.

   Hypothèse : pendant le glissement, chaque `fb.style.left = ...`
   mute le DOM → le MutationObserver de `cc` → `_atcScheduleApply`
   → `_atcSettle` → `applyShapes` → `_ancPlace` RECALCULE la
   position depuis l'ancre et écrase le geste.

   Garde `__atcGeste` : `if (window.__atcGeste && window.__atcGeste > _seq0)`.
   `_seq0` est pris À L'APPEL de `_atcSettle` : un geste antérieur à
   l'appel ne bloque donc RIEN. Et le glissement n'appelle jamais
   `_figEditing()` (qui stampait `__atcGeste`) — seules les barres
   d'outils le font.

   Cette sonde mesure, sans rien corriger :
     1. `style.left` / `offsetLeft` après CHAQUE pas de la souris ;
     2. le journal daté des mutations d'attribut sur le cadre ;
     3. l'état de `__atcGeste` / `__atcFigEditing` au mousedown.
   ════════════════════════════════════════════════════════════════ */
const H = require("../../../tools/bench_common.js");
const path = require("path"), os = require("os");

const TS = 1700000000000;

(async () => {
  const port = await H.pickFreePort();
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v647_" + Date.now()) });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("pageerror", e => console.log("  [pageerror] " + String(e).slice(0, 200)));
  await page.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2200);
  await page.evaluate(() => {
    const ov = document.getElementById('auth-overlay');
    if (ov) { ov.classList.add('hidden'); ov.style.setProperty('display', 'none', 'important'); }
    const w = document.getElementById('setup-wizard-overlay');
    if (w) { w.classList.remove('active'); w.style.setProperty('display', 'none', 'important'); }
    try { if (window.tpaiSetView) window.tpaiSetView('chat'); } catch (e) {}
  });
  await page.waitForTimeout(400);

  /* ── semence : même message, même cadre SANS ancre que le banc v621 ── */
  await page.evaluate((ts) => {
    state.messages = [{
      role: 'assistant',
      content: 'La notion de Kyrios designe la seigneurie divine.\n\n'
        + 'Mais avec une hierarchie d economie : le Pere est la source, le Fils est envoye.\n\n'
        + 'Citation cle : Cyrille d Alexandrie, De Adoratione in Spiritu 1.',
      ts: ts, annotations: [], marks: []
    }];
    if (typeof renderMessages === 'function') renderMessages();
    const box = document.getElementById('mc-' + ts);
    const rb = box.getBoundingClientRect();
    state.messages[0].shapes = [{ id: 'fg-t', shape: 'Rectangle', color: '#4f8ef7', weight: 1.4,
      text: '', svg: '<rect/>', x: 4, y: 2, w: Math.round(rb.width - 12), h: 90,
      note: 'Note du cadre.' }];
    if (window.__applyShapes) window.__applyShapes();
  }, TS);
  await page.waitForTimeout(1200);

  /* ── journal des mutations d'attribut du cadre ── */
  await page.evaluate(() => {
    window.__LOG = [];
    const fb = document.querySelector('[data-fig-id="fg-t"]');
    if (!fb) return;
    const t0 = Date.now();
    window.__T0 = t0;
    new MutationObserver(function (muts) {
      muts.forEach(function (mu) {
        if (mu.type === 'attributes' && mu.attributeName === 'style') {
          const el = mu.target;
          window.__LOG.push({
            dt: Date.now() - t0,
            tag: el.className || el.tagName,
            left: el.style ? el.style.left : null,
            top: el.style ? el.style.top : null
          });
        }
      });
    }).observe(fb, { attributes: true, attributeFilter: ['style', 'class'] });
  });

  const etat = await page.evaluate(() => {
    const fb = document.querySelector('[data-fig-id="fg-t"]');
    return {
      geste: window.__atcGeste || null,
      editing: !!window.__atcFigEditing,
      stable: window.__atcStable,
      left: fb.style.left, top: fb.style.top,
      offsetLeft: fb.offsetLeft, offsetTop: fb.offsetTop,
      ancre: !!(state.messages[0].shapes[0].ancre)
    };
  });
  console.log("  AVANT le geste : " + JSON.stringify(etat));

  /* ── le geste : bord gauche, comme le banc v621 test 4 ── */
  const r4 = await page.evaluate(() => {
    const fb = document.querySelector('[data-fig-id="fg-t"]');
    const e = fb.querySelector('.fb-edge[data-bord="l"]');
    const r = e.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  await page.mouse.move(r4.x, r4.y);
  await page.mouse.down();
  const apresDown = await page.evaluate(() => {
    const fb = document.querySelector('[data-fig-id="fg-t"]');
    return { geste: window.__atcGeste || null, editing: !!window.__atcFigEditing,
             left: fb.style.left, offsetLeft: fb.offsetLeft };
  });
  console.log("  APRÈS mousedown : " + JSON.stringify(apresDown));

  const pas = [];
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(r4.x + 5 * i, r4.y + 3 * i);
    await page.waitForTimeout(30);
    const s = await page.evaluate(() => {
      const fb = document.querySelector('[data-fig-id="fg-t"]');
      return { left: fb.style.left, top: fb.style.top, offsetLeft: fb.offsetLeft, offsetTop: fb.offsetTop };
    });
    pas.push({ i: i, ...s });
    console.log("    pas " + i + " : " + JSON.stringify(s));
  }
  await page.mouse.up();
  await page.waitForTimeout(300);

  const fin = await page.evaluate(() => {
    const fb = document.querySelector('[data-fig-id="fg-t"]');
    const f = state.messages[0].shapes[0];
    return {
      left: fb.style.left, top: fb.style.top,
      offsetLeft: fb.offsetLeft, offsetTop: fb.offsetTop,
      f: { x: f.x, y: f.y, w: f.w, h: f.h, ancre: f.ancre || null, dx: f.ancre ? f.ancre.dx : null, dy: f.ancre ? f.ancre.dy : null },
      log: window.__LOG
    };
  });
  console.log("  APRÈS mouseup+300ms : " + JSON.stringify({ left: fin.left, top: fin.top, offsetLeft: fin.offsetLeft, offsetTop: fin.offsetTop }));
  console.log("  MODÈLE f : " + JSON.stringify(fin.f));
  console.log("  ── journal des mutations de style du cadre (" + fin.log.length + ") ──");
  fin.log.forEach(l => console.log("    t+" + l.dt + "ms  left=" + l.left + " top=" + l.top + "  (" + String(l.tag).slice(0, 30) + ")"));

  /* verdict mesuré : le geste a-t-il survécu ? */
  const bouge = pas.some(p => p.offsetLeft !== 0 || p.offsetTop !== 0);
  const survit = fin.offsetLeft !== 0 || fin.offsetTop !== 0;
  console.log("\n  SONDE : le cadre a bougé PENDANT le geste = " + bouge);
  console.log("  SONDE : le cadre est encore déplacé APRÈS le geste = " + survit);

  await browser.close();
  relais.child.kill();
  process.exit(0);
})().catch(e => { console.error("EXCEPTION :", e && e.stack || e); process.exit(1); });
