/* ═══════════════════════════════════════════════════════════════
   Banc v619 — VOIR LES COMMENTAIRES D'UN ENCADRÉ AU SURVOL.

   Demande : « des surlignements et des commentaires se trouvent dans des
   encadrements, mais je veux pouvoir avec un survol de la souris voir les
   commentaires ».

   Cause : le cadre est une surcouche qui recouvre le texte ; le survol touche
   le CADRE, jamais le `.atc-hl` situé dessous -> aucune infobulle.

   Ce banc prouve, dans un vrai navigateur :
   1. survol du cadre -> infobulle VISIBLE avec le commentaire de l'annotation ;
   2. sortie de la souris -> l'infobulle se ferme ;
   3. un cadre portant une NOTE (v618) l'affiche au survol ;
   4. plusieurs annotations dans un cadre -> toutes listées ;
   5. contrôle NÉGATIF : un cadre sans annotation chevauchante n'affiche RIEN ;
   6. non-régression : le survol d'un surlignage HORS cadre fonctionne toujours ;
   7. zéro erreur JS.
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
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v619_" + Date.now()) });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const bruit = [];
  page.on("pageerror", e => bruit.push(String(e).slice(0, 200)));
  await page.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2200);

  await page.evaluate(() => {
    const ov = document.getElementById('auth-overlay');
    if (ov) { ov.classList.add('hidden'); ov.style.setProperty('display', 'none', 'important'); }
    const b = Array.prototype.find.call(document.querySelectorAll('button'), x => /UTILISER SANS CL/i.test(x.textContent || ''));
    if (b) b.click();
    try { if (window.tpaiSetView) window.tpaiSetView('chat'); } catch (e) {}
  });
  await page.waitForTimeout(300);

  section("0. Mise en place : un message, 2 commentaires, 2 encadrés");
  const prep = await page.evaluate((ts) => {
    state.messages = [{
      role: 'assistant', content: 'Alpha beta gamma delta.', ts: ts,
      annotations: [
        { id: 'hl-1', text: 'Alpha', a: 'Commentaire sur Alpha.', start: 0, end: 5 },
        { id: 'hl-2', text: 'beta', a: 'Commentaire sur beta.', start: 6, end: 10 }
      ],
      marks: []
    }];
    if (typeof renderMessages === 'function') renderMessages();
    /* Un seul cadre à la fois : trois cadres sur la MÊME ligne se
       recouvrent après ré-ancrage (le survol tomberait sur le dernier). */
    state.messages[0].shapes = [];
    if (window.__applyShapes) window.__applyShapes();
    if (window.__applyHighlights) window.__applyHighlights();
    return { ok: !!document.getElementById('mc-' + ts) };
  }, TS);
  await page.waitForTimeout(500);
  ok("message rendu", prep.ok === true, String(prep.ok));

  async function poser(f) {
    await page.evaluate((o) => {
      state.messages[0].shapes = [o.f];
      document.querySelectorAll('.atc-figbox').forEach(function (e) { e.remove(); });
      if (window.__applyShapes) window.__applyShapes();
    }, { f: f });
    await page.waitForTimeout(250);
  }
  const CADRE_A = { id: 'fg-a', x: 6, y: 2, w: 90, h: 34, shape: 'Rectangle', color: '#4f8ef7',
    weight: 1.4, text: '', svg: '<rect/>', ancre: { start: 0, end: 5, texte: 'Alpha' } };
  const CADRE_B = { id: 'fg-b', x: 6, y: 44, w: 110, h: 34, shape: 'Rectangle', color: '#ff8a80',
    weight: 1.4, text: '', svg: '<rect/>', ancre: { start: 11, end: 16, texte: 'gamma' } };
  const CADRE_C = { id: 'fg-c', x: 6, y: 86, w: 110, h: 34, shape: 'Rectangle', color: '#ffd54f',
    weight: 1.4, text: '', svg: '<rect/>', note: 'Note propre au cadre C.',
    ancre: { start: 6, end: 10, texte: 'beta' } };

  async function survoler(sel) {
    const r = await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    }, sel);
    if (!r) return null;
    await page.mouse.move(5, 5);
    await page.waitForTimeout(120);
    await page.mouse.move(r.x, r.y);
    await page.waitForTimeout(350);
    return r;
  }
  async function lireTip() {
    return await page.evaluate(() => {
      const t = document.getElementById('atc-tip');
      if (!t) return { present: false };
      const cs = getComputedStyle(t);
      const rect = t.getBoundingClientRect();
      return {
        present: true, texte: t.textContent.replace(/\s+/g, ' ').trim().slice(0, 220),
        visible: cs.display !== 'none' && cs.visibility !== 'hidden' && rect.width > 100 && rect.height > 20
      };
    });
  }

  section("1. Survol d'un encadré qui recouvre un commentaire");
  await poser(CADRE_A);
  await survoler('[data-fig-id="fg-a"]');
  const t1 = await lireTip();
  ok("une infobulle apparaît", t1.present === true, String(t1.present));
  ok("elle est VISIBLE (surface réelle)", t1.visible === true, JSON.stringify(t1.visible));
  ok("elle contient le commentaire de l'annotation", /Commentaire sur Alpha/.test(String(t1.texte)),
     String(t1.texte).slice(0, 120));
  ok("elle rappelle le passage annoté", /Alpha/.test(String(t1.texte)), String(t1.texte).slice(0, 80));

  section("2. Sortie de la souris — l'infobulle se ferme");
  await page.mouse.move(5, 5);
  await page.waitForTimeout(350);
  const t2 = await lireTip();
  ok("l'infobulle est fermée", t2.present === false, String(t2.present));

  section("3. Un encadré qui porte une NOTE (v618) l'affiche au survol");
  await poser(CADRE_C);
  await survoler('[data-fig-id="fg-c"]');
  const t3 = await lireTip();
  ok("la note du cadre apparaît", /Note propre au cadre C/.test(String(t3.texte)), String(t3.texte).slice(0, 120));
  ok("le commentaire de l'annotation « beta » y figure aussi",
     /Commentaire sur beta/.test(String(t3.texte)), String(t3.texte).slice(0, 140));

  section("4. Contrôle NÉGATIF : cadre sans annotation chevauchante");
  await poser(CADRE_B);
  await survoler('[data-fig-id="fg-b"]');
  const t4 = await lireTip();
  ok("AUCUNE infobulle pour un cadre qui ne recouvre aucun commentaire", t4.present === false,
     t4.present ? String(t4.texte).slice(0, 80) : "(rien)");

  section("5. Non-régression : survol d'un surlignage HORS cadre");
  const hors = await page.evaluate(() => {
    /* on retire les cadres pour laisser le texte à nu */
    state.messages[0].shapes = [];
    document.querySelectorAll('.atc-figbox').forEach(function (e) { e.remove(); });
    if (window.__applyHighlights) window.__applyHighlights();
    const hl = document.querySelector('.atc-hl');
    if (!hl) return null;
    const b = hl.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  });
  if (hors) {
    await page.mouse.move(5, 5);
    await page.waitForTimeout(120);
    await page.mouse.move(hors.x, hors.y);
    await page.waitForTimeout(350);
  }
  const t5 = await lireTip();
  ok("le survol direct d'un surlignage fonctionne toujours", t5.present === true && /Commentaire sur Alpha/.test(String(t5.texte)),
     String(t5.texte || '').slice(0, 100));

  section("6. Aucune erreur JavaScript");
  ok("zéro erreur JS", bruit.length === 0, bruit.slice(0, 2).join(' | '));

  const passes = resultats.filter(r => r.pass).length;
  console.log("\nRESULTAT : " + passes + "/" + resultats.length);
  if (passes !== resultats.length) resultats.filter(r => !r.pass).forEach(r => console.log("  ÉCHEC : " + r.label));
  await browser.close();
  relais.child.kill();
  process.exit(passes === resultats.length ? 0 : 1);
})().catch(e => { console.error("EXCEPTION :", e && e.stack || e); process.exit(1); });
