/* ═══════════════════════════════════════════════════════════════
   Banc v622 — UN SEUL COMMENTAIRE À LA FOIS (celui qu'on survole).

   Demande : « dans les encadrés, s'il y a plusieurs commentaires, je veux que
   ça affiche seulement celui qui survole à la souris ».

   Avant : le survol du CADRE listait tous les commentaires qu'il recouvre.
   Maintenant : chaque surlignage porte SA fiche ; le cadre ne montre que SA
   note propre.

   1. survol du commentaire A -> A seul (ni B, ni la note) ;
   2. survol du commentaire B -> B seul ;
   3. survol du CADRE (zone vide) -> la note du cadre, JAMAIS les commentaires ;
   4. contrôle NÉGATIF : cadre sans note -> aucune infobulle au survol du cadre ;
   5. les deux commentaires restent atteignables (aucun n'est masqué) ;
   6. zéro erreur JS.
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
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v622_" + Date.now()) });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const bruit = [];
  page.on("pageerror", e => bruit.push(String(e).slice(0, 200)));
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

  section("0. Un cadre avec DEUX commentaires et une note");
  const prep = await page.evaluate((ts) => {
    const CONT = 'Alpha beta gamma delta epsilon.';
    const iA = CONT.indexOf('Alpha'), iB = CONT.indexOf('beta');
    state.messages = [{
      role: 'assistant', content: CONT, ts: ts, marks: [],
      annotations: [
        { id: 'hl-A', text: 'Alpha', a: 'COMMENTAIRE A', start: iA, end: iA + 5 },
        { id: 'hl-B', text: 'beta', a: 'COMMENTAIRE B', start: iB, end: iB + 4 }
      ]
    }];
    if (typeof renderMessages === 'function') renderMessages();
    if (window.__applyHighlights) window.__applyHighlights();
    const box = document.getElementById('mc-' + ts);
    const rb = box.getBoundingClientRect();
    state.messages[0].shapes = [{ id: 'fg-deux', shape: 'Rectangle', color: '#4f8ef7',
      weight: 1.6, text: '', svg: '<rect/>', x: 2, y: 2,
      w: Math.round(rb.width - 10), h: 90, note: 'NOTE DU CADRE' }];
    if (window.__applyShapes) window.__applyShapes();
    const a = document.querySelector('.atc-hl[data-hl-id="hl-A"]');
    const b = document.querySelector('.atc-hl[data-hl-id="hl-B"]');
    const fb = document.querySelector('[data-fig-id="fg-deux"]');
    const ra = a ? a.getBoundingClientRect() : null;
    const rbb = b ? b.getBoundingClientRect() : null;
    const rf = fb ? fb.getBoundingClientRect() : null;
    return {
      ok: !!(a && b && fb), ra: ra, rb: rbb, rf: rf,
      ptVide: rf ? { x: rf.left + rf.width / 2, y: rf.top + 10 } : null
    };
  }, TS);
  await page.waitForTimeout(400);
  ok("deux commentaires et un cadre posés", prep.ok === true, String(prep.ok));

  async function survol(pt) {
    await page.evaluate(() => { const t = document.getElementById('atc-tip'); if (t) t.remove(); });
    await page.mouse.move(5, 5);
    await page.waitForTimeout(160);
    await page.mouse.move(pt.x, pt.y);
    await page.waitForTimeout(350);
    return await page.evaluate(() => {
      const t = document.getElementById('atc-tip');
      return { present: !!t, texte: t ? t.textContent.replace(/\s+/g, ' ').trim() : '' };
    });
  }

  section("1. Survol du commentaire A — A SEUL");
  const t1 = await survol({ x: prep.ra.left + prep.ra.width / 2, y: prep.ra.top + prep.ra.height / 2 });
  ok("une infobulle apparaît", t1.present === true, String(t1.present));
  ok("elle montre le commentaire A", /COMMENTAIRE A/.test(t1.texte), t1.texte.slice(0, 90));
  ok("elle ne montre PAS le commentaire B", !/COMMENTAIRE B/.test(t1.texte), t1.texte.slice(0, 90));
  ok("elle ne montre pas la note du cadre", !/NOTE DU CADRE/.test(t1.texte), t1.texte.slice(0, 90));

  section("2. Survol du commentaire B — B SEUL");
  const t2 = await survol({ x: prep.rb.left + prep.rb.width / 2, y: prep.rb.top + prep.rb.height / 2 });
  ok("elle montre le commentaire B", t2.present === true && /COMMENTAIRE B/.test(t2.texte), t2.texte.slice(0, 90));
  ok("elle ne montre PAS le commentaire A", !/COMMENTAIRE A/.test(t2.texte), t2.texte.slice(0, 90));

  section("3. Survol du CADRE (zone vide) — la note, jamais les commentaires");
  const t3 = await survol(prep.ptVide);
  ok("la note du cadre s'affiche", t3.present === true && /NOTE DU CADRE/.test(t3.texte), t3.texte.slice(0, 90));
  ok("AUCUN commentaire n'est listé", !/COMMENTAIRE A/.test(t3.texte) && !/COMMENTAIRE B/.test(t3.texte),
     t3.texte.slice(0, 120));

  section("4. Contrôle NÉGATIF : cadre SANS note, survol de la zone vide");
  await page.evaluate(() => {
    const f = state.messages[0].shapes[0];
    delete f.note;
    document.querySelectorAll('.atc-figbox').forEach(function (e) { e.remove(); });
    if (window.__applyShapes) window.__applyShapes();
  });
  await page.waitForTimeout(300);
  const t4 = await survol(prep.ptVide);
  ok("AUCUNE infobulle au survol du cadre sans note", t4.present === false,
     t4.present ? t4.texte.slice(0, 80) : "(rien)");

  section("5. Les deux commentaires restent atteignables");
  const t5 = await survol({ x: prep.ra.left + prep.ra.width / 2, y: prep.ra.top + prep.ra.height / 2 });
  const t6 = await survol({ x: prep.rb.left + prep.rb.width / 2, y: prep.rb.top + prep.rb.height / 2 });
  ok("A toujours sa fiche", /COMMENTAIRE A/.test(t5.texte), t5.texte.slice(0, 60));
  ok("B toujours sa fiche", /COMMENTAIRE B/.test(t6.texte), t6.texte.slice(0, 60));

  section("6. Aucune erreur JavaScript");
  ok("zéro erreur JS", bruit.length === 0, bruit.slice(0, 2).join(' | '));

  const passes = resultats.filter(r => r.pass).length;
  console.log("\nRESULTAT : " + passes + "/" + resultats.length);
  if (passes !== resultats.length) resultats.filter(r => !r.pass).forEach(r => console.log("  ÉCHEC : " + r.label));
  await browser.close();
  relais.child.kill();
  process.exit(passes === resultats.length ? 0 : 1);
})().catch(e => { console.error("EXCEPTION :", e && e.stack || e); process.exit(1); });
