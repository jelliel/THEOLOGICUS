/* ═══════════════════════════════════════════════════════════════
   Banc v620 — SURVOL D'UN CADRE SANS ANCRE (repli GÉOMÉTRIQUE).

   Constat sur vidéo : un cadre dessiné à la main (ou créé sans sélection) n'a
   pas d'ancre texte. v619 cherchait les commentaires par OFFSETS : rien
   trouvé, donc rien affiché — alors que le commentaire existait et
   s'affichait hors cadre.

   Ce banc prouve :
   1. cadre SANS ancre posé sur un commentaire -> l'infobulle s'affiche ;
   2. contrôle NÉGATIF : le même cadre déplacé loin -> rien ;
   3. non-régression : cadre AVEC ancre (chemin v619) ;
   4. note du cadre + commentaire recouvert -> les deux dans l'infobulle ;
   5. zéro erreur JS.
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
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v620_" + Date.now()) });
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

  section("0. Message + commentaire, cadre SANS ancre posé dessus");
  const prep = await page.evaluate((ts) => {
    const CONTENU = 'Thèse : Kyrios s\'applique aux trois Personnes de la Trinité, mais avec une hiérarchie d\'économie.';
    const MOT = 'hiérarchie d\'économie';
    /* offsets RÉELS du mot dans le contenu (un offset faux fait disparaître
       le surlignage au re-rendu : le banc mesurerait alors un fantôme). */
    const _st = CONTENU.indexOf(MOT);
    window.__v620st = _st; window.__v620len = MOT.length;
    state.messages = [{
      role: 'assistant',
      content: CONTENU,
      ts: ts,
      annotations: [{ id: 'hl-v620', text: MOT,
        a: 'Commentaire sur la hiérarchie d\'économie.', start: _st, end: _st + MOT.length }],
      marks: []
    }];
    if (typeof renderMessages === 'function') renderMessages();
    if (window.__applyHighlights) window.__applyHighlights();
    const box = document.getElementById('mc-' + ts);
    const hl = document.querySelector('.atc-hl[data-hl-id="hl-v620"]');
    if (!box || !hl) return { ok: false };
    const rb = box.getBoundingClientRect(), rh = hl.getBoundingClientRect();
    /* cadre SANS ancre, posé autour du surlignage */
    const f = { id: 'fg-sans-ancre', shape: 'Rectangle', color: '#ff00aa', weight: 1.4,
      text: '', svg: '<rect/>',
      x: Math.round(rh.left - rb.left - 10), y: Math.round(rh.top - rb.top - 8),
      w: Math.round(rh.width + 20), h: Math.round(rh.height + 16) };
    state.messages[0].shapes = [f];
    if (window.__applyShapes) window.__applyShapes();
    return { ok: true, ancre: !!f.ancre };
  }, TS);
  await page.waitForTimeout(400);
  /* 🔴 v633 — cette assertion verifiait l'ANCIEN contrat (« cadre pose SANS
     ancre »). v633 ancre desormais TOUTE figure qui recouvre du texte, et c'est
     la demande de l'utilisateur (sinon le cadre se decale au redemarrage).
     On verifie le nouveau contrat, sans perdre le controle : le cadre doit
     etre ancre SUR LE MOT SURHIGNE, sinon il ne suit pas le bon texte. */
  const prep2 = await page.evaluate(() => {
    const f = (state.messages[0].shapes || [])[0];
    return f && f.ancre
      ? { ancre: true, texte: String(f.ancre.texte || ''), start: f.ancre.start, end: f.ancre.end }
      : { ancre: false };
  });
  ok("cadre posé : v633 l'ancre sur le mot survolé",
     prep.ok === true && prep2.ancre === true && prep2.texte.indexOf("hiérarchie") >= 0,
     JSON.stringify(prep2));

  async function survoler(sel) {
    const r = await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    }, sel);
    if (!r) return null;
    /* l'infobulle précédente est un panneau FIXE : elle peut couvrir le cadre
       et intercepter la souris (le survol ne l'atteindrait jamais). */
    await page.evaluate(() => { const tp = document.getElementById('atc-tip'); if (tp) tp.remove(); });
    await page.mouse.move(5, 5);
    await page.waitForTimeout(160);
    await page.mouse.move(r.x, r.y);
    await page.waitForTimeout(350);
    return r;
  }
  async function survolerTexte(hlId) {
    const r = await page.evaluate((id) => {
      const el = document.querySelector('.atc-hl[data-hl-id="' + id + '"]');
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    }, hlId);
    if (!r) return null;
    await page.evaluate(() => { const tp = document.getElementById('atc-tip'); if (tp) tp.remove(); });
    await page.mouse.move(5, 5);
    await page.waitForTimeout(180);
    await page.mouse.move(r.x, r.y);
    await page.waitForTimeout(380);
    return r;
  }
  async function lireTip() {
    return await page.evaluate(() => {
      const t = document.getElementById('atc-tip');
      if (!t) return { present: false };
      const cs = getComputedStyle(t), rect = t.getBoundingClientRect();
      return { present: true, texte: t.textContent.replace(/\s+/g, ' ').trim().slice(0, 200),
        visible: cs.display !== 'none' && rect.width > 100 && rect.height > 20 };
    });
  }

  section("1. Le commentaire s'affiche au survol de SON MOT, même dans un cadre sans ancre");
  await survolerTexte('hl-v620');
  const t1 = await lireTip();
  ok("une infobulle apparaît", t1.present === true, String(t1.present));
  ok("elle est visible", t1.visible === true, String(t1.visible));
  ok("elle contient le commentaire recouvert", /Commentaire sur la hiérarchie/.test(String(t1.texte)),
     String(t1.texte).slice(0, 120));


  section("2. Contrôle NÉGATIF : le même cadre déplacé loin du commentaire");
  await page.evaluate((ts) => {
    const f = state.messages[0].shapes[0];
    f.y = f.y + 260;                    /* loin du texte */
    const fb = document.querySelector('[data-fig-id="fg-sans-ancre"]');
    if (fb) { fb.style.top = f.y + 'px'; }
  }, TS);
  await page.waitForTimeout(200);
  await survoler('[data-fig-id="fg-sans-ancre"]');
  const t2 = await lireTip();
  ok("AUCUNE infobulle quand le cadre ne recouvre plus rien", t2.present === false,
     t2.present ? String(t2.texte).slice(0, 80) : "(rien)");

  section("3. Non-régression : cadre AVEC ancre (chemin v619)");
  const r3 = await page.evaluate((ts) => {
    const box = document.getElementById('mc-' + ts);
    const hl = document.querySelector('.atc-hl[data-hl-id="hl-v620"]');
    const rb = box.getBoundingClientRect(), rh = hl.getBoundingClientRect();
    state.messages[0].shapes = [{ id: 'fg-avec-ancre', shape: 'Rectangle', color: '#4f8ef7',
      weight: 1.4, text: '', svg: '<rect/>',
      x: Math.round(rh.left - rb.left - 10), y: Math.round(rh.top - rb.top - 8),
      w: Math.round(rh.width + 20), h: Math.round(rh.height + 16),
      ancre: { start: window.__v620st, end: window.__v620st + window.__v620len,
               texte: 'hiérarchie d\'économie' } }];
    document.querySelectorAll('.atc-figbox').forEach(function (e) { e.remove(); });
    if (window.__applyHighlights) window.__applyHighlights();
    if (window.__applyShapes) window.__applyShapes();
    return { ancre: !!state.messages[0].shapes[0].ancre,
             hl: !!document.querySelector('.atc-hl[data-hl-id="hl-v620"]') };
  }, TS);
  await page.waitForTimeout(350);
  await survolerTexte('hl-v620');
  const t3 = await lireTip();
  ok("cadre ancré : le commentaire s'affiche au survol du mot",
     r3.ancre === true && /Commentaire sur la hiérarchie/.test(String(t3.texte)),
     String(t3.texte || '').slice(0, 90));

  section("4. Note du cadre (au survol du cadre) et commentaire (au survol du mot)");
  await page.evaluate((ts) => {
    const f = state.messages[0].shapes[0];
    f.note = 'Note propre au cadre.';
    document.querySelectorAll('.atc-figbox').forEach(function (e) { e.remove(); });
    if (window.__applyShapes) window.__applyShapes();
  }, TS);
  await page.waitForTimeout(300);
  await survoler('[data-fig-id="fg-avec-ancre"]');
  const t4 = await lireTip();
  ok("la note du cadre s'affiche au survol du cadre", /Note propre au cadre/.test(String(t4.texte)),
     String(t4.texte).slice(0, 110));
  ok("le commentaire n'y est PAS (v622)", !/Commentaire sur la hiérarchie/.test(String(t4.texte)),
     String(t4.texte).slice(0, 140));


  section("5. Aucune erreur JavaScript");
  ok("zéro erreur JS", bruit.length === 0, bruit.slice(0, 2).join(' | '));

  const passes = resultats.filter(r => r.pass).length;
  console.log("\nRESULTAT : " + passes + "/" + resultats.length);
  if (passes !== resultats.length) resultats.filter(r => !r.pass).forEach(r => console.log("  ÉCHEC : " + r.label));
  await browser.close();
  relais.child.kill();
  process.exit(passes === resultats.length ? 0 : 1);
})().catch(e => { console.error("EXCEPTION :", e && e.stack || e); process.exit(1); });
