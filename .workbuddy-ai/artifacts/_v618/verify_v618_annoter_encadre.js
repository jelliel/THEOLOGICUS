/* ═══════════════════════════════════════════════════════════════
   Banc v618 — ANNOTER UN ENCADRÉ (commentaire + surlignage).

   Demande : « lorsque je fais un encadrement d'une phrase ou d'un mot, je
   n'arrive pas à faire de commentaire pour ce mot encadré ».

   Cause réelle : le cadre est une SURCOUCHE (position:absolute, z-index:6)
   qui recouvre le texte et capte le geste de sélection. Il n'existait AUCUN
   chemin pour annoter le texte encadré — sauf supprimer le cadre.

   Ce banc prouve, dans un vrai navigateur :
   1. la barre d'outils du cadre offre 💬 (commentaire) et 🖍 (surlignage) ;
   2. 💬 ouvre un panneau VISIBLE et enregistre la note sur le cadre ;
   3. un badge 💬 apparaît sur le cadre et rouvre la note ;
   4. cliquer le badge ne DÉPLACE pas le cadre ;
   5. 🖍 surligne exactement le texte ancré (offsets du cadre) ;
   6. 🖍 de nouveau retire le surlignage (bascule) ;
   7. la note survit au re-rendu (elle est dans state + export) ;
   8. l'export Markdown transporte la note ;
   9. un cadre SANS ancre refuse le surlignage avec un message clair ;
  10. zéro erreur JS.
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
  const relais = await H.spawnRelay({ port, localAppData: path.join(os.tmpdir(), "theo_v618_" + Date.now()) });
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const bruit = [];
  page.on("pageerror", e => bruit.push(String(e).slice(0, 200)));
  await page.goto("http://127.0.0.1:" + port + "/THEOLOGICUS.html", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2200);
  /* v621 — les surcouches de démarrage (porte, assistant) couvrent l'app :
     un clic à la souris ne peut pas les traverser. On les neutralise. */
  await page.evaluate(() => {
    const ov = document.getElementById('auth-overlay');
    if (ov) { ov.classList.add('hidden'); ov.style.setProperty('display', 'none', 'important'); }
    const w = document.getElementById('setup-wizard-overlay');
    if (w) { w.classList.remove('active'); w.style.setProperty('display', 'none', 'important'); }
  });

  /* La porte d'accès (z 999999) couvre tout : on la retire pour le banc. */
  await page.evaluate(() => {
    const ov = document.getElementById('auth-overlay');
    if (ov) { ov.classList.add('hidden'); ov.style.setProperty('display', 'none', 'important'); }
    const b = Array.prototype.find.call(document.querySelectorAll('button'), x => /UTILISER SANS CL/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await page.waitForTimeout(400);

  section("0. Mise en place : un message + un encadré ANCRÉ sur « Alpha »");
  const prep = await page.evaluate((ts) => {
    try { if (window.tpaiSetView) window.tpaiSetView('chat'); } catch (e) {}
    state.messages = [{ role: 'assistant', content: 'Alpha beta gamma delta.', ts: ts }];
    if (typeof renderMessages === 'function') renderMessages();
    const box = document.getElementById('mc-' + ts);
    if (!box) return { box: false };
    state.messages[0].shapes = [{
      id: 'fg-banc', x: 8, y: 6, w: 120, h: 40, shape: 'Rectangle',
      color: '#4f8ef7', weight: 1.2, text: '', svg: '<rect x="1" y="1" width="22" height="22"/>',
      ancre: { start: 0, end: 5, texte: 'Alpha' }
    }];
    if (window.__applyShapes) window.__applyShapes();
    const fb = document.querySelector('[data-fig-id="fg-banc"]');
    return { box: true, fig: !!fb, rect: fb ? fb.getBoundingClientRect().toJSON() : null };
  }, TS);
  ok("message rendu et cadre posé", prep.box && prep.fig, JSON.stringify(prep).slice(0, 120));

  section("1. Barre d'outils : 💬 et 🖍 présents");
  let r1 = { boutons: [] };
  /* Le rect doit être relu APRÈS stabilisation de la mise en page : mesuré
     dans le même tick que le rendu, il désignait une position périmée et le
     clic tombait à côté (faux négatif attrapé ici). */
  await page.waitForTimeout(400);
  const rect = await page.evaluate(() => {
    const fb = document.querySelector('[data-fig-id="fg-banc"]');
    return fb ? fb.getBoundingClientRect().toJSON() : null;
  });
  /* v621 — le centre du cadre est TRAVERSANT : on saisit le cadre par son
     bord gauche (le centre sert désormais à sélectionner le texte). */
  const bord = await page.evaluate((ts) => {
    const fb = document.querySelector('[data-fig-id="fg-banc"]');
    const box = document.getElementById('mc-' + ts);
    if (!fb || !box) return null;
    const r = fb.getBoundingClientRect(), b = box.getBoundingClientRect();
    /* le cadre peut déborder du contenu (rogné) : on vise la PARTIE VISIBLE
       de son bord gauche, pas son milieu géométrique. */
    const top = Math.max(r.top, b.top), bot = Math.min(r.bottom, b.bottom);
    return { x: Math.max(r.left, b.left) + 4, y: (top + bot) / 2 };
  }, TS);
  if (bord) {
    const cx = bord.x, cy = bord.y;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(250);
    r1 = await page.evaluate(() => {
      const t = document.querySelector('.fig-tools');
      return {
        outils: !!t,
        boutons: t ? Array.prototype.map.call(t.querySelectorAll('button'), b => b.textContent.trim()) : []
      };
    });
  }
  ok("la barre d'outils s'ouvre au clic sur le cadre", r1.outils === true, String(r1.outils));
  ok("elle offre un bouton de commentaire (💬)", r1.boutons.indexOf('💬') >= 0, r1.boutons.join(' '));
  ok("elle offre un bouton de surlignage (🖍)", r1.boutons.indexOf('🖍') >= 0, r1.boutons.join(' '));

  section("1b. Un CLIC sur le cadre ne détruit pas son ancre texte");
  const rAnc = await page.evaluate((ts) => {
    const f = state.messages.find(m => m.ts === ts).shapes[0];
    return { ancre: !!f.ancre };
  }, TS);
  ok("l'ancre survit au clic qui ouvre la barre d'outils", rAnc.ancre === true, String(rAnc.ancre));

  section("2. 💬 ouvre un panneau VISIBLE et enregistre la note");
  const r2 = await page.evaluate(async (ts) => {
    const t = document.querySelector('.fig-tools');
    const btn = Array.prototype.find.call(t.querySelectorAll('button'), b => b.textContent.trim() === '💬');
    btn.click();
    await new Promise(r => setTimeout(r, 150));
    const p = document.getElementById('atc-fig-note');
    const cs = p ? getComputedStyle(p) : null;
    const rect = p ? p.getBoundingClientRect() : null;
    const ta = p ? p.querySelector('textarea') : null;
    if (ta) {
      ta.value = 'Mon commentaire de banc';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const save = p ? p.querySelector('[data-save]') : null;
    if (save) save.click();
    await new Promise(r => setTimeout(r, 200));
    const f = (state.messages.find(m => m.ts === ts) || {}).shapes[0];
    const fb = document.querySelector('[data-fig-id="fg-banc"]');
    return {
      ouvert: !!p, visible: !!(cs && cs.display !== 'none' && rect && rect.width > 200 && rect.height > 80),
      ferme: !document.getElementById('atc-fig-note'),
      note: f ? f.note : null,
      badge: !!(fb && fb.querySelector('.fb-note'))
    };
  }, TS);
  ok("le panneau s'ouvre et il est VISIBLE", r2.ouvert && r2.visible, JSON.stringify({ o: r2.ouvert, v: r2.visible }));
  ok("il se referme après enregistrement", r2.ferme === true, String(r2.ferme));
  ok("la note est écrite SUR le cadre", r2.note === 'Mon commentaire de banc', String(r2.note));
  ok("un badge 💬 apparaît sur le cadre", r2.badge === true, String(r2.badge));

  section("3. Le badge rouvre la note — sans DÉPLACER le cadre");
  const r3 = await page.evaluate(async () => {
    const fb = document.querySelector('[data-fig-id="fg-banc"]');
    const avant = { l: fb.offsetLeft, t: fb.offsetTop };
    const b = fb.querySelector('.fb-note');
    const r = b.getBoundingClientRect();
    b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: r.x + 8, clientY: r.y + 8 }));
    await new Promise(x => setTimeout(x, 150));
    const p = document.getElementById('atc-fig-note');
    const ta = p ? p.querySelector('textarea') : null;
    const apres = { l: fb.offsetLeft, t: fb.offsetTop };
    const val = ta ? ta.value : null;
    if (p) p.remove();
    return { ouvert: !!p, val: val, avant: avant, apres: apres };
  });
  ok("le clic sur le badge ouvre la note", r3.ouvert === true, String(r3.ouvert));
  ok("le champ est prérempli avec la note", r3.val === 'Mon commentaire de banc', String(r3.val));
  ok("le cadre n'a PAS bougé", r3.avant.l === r3.apres.l && r3.avant.t === r3.apres.t,
     JSON.stringify(r3.avant) + ' -> ' + JSON.stringify(r3.apres));

  section("4. 🖍 surligne EXACTEMENT le texte ancré, puis le retire");
  const r4 = await page.evaluate(async (ts) => {
    const f = state.messages.find(m => m.ts === ts).shapes[0];
    const fb = document.querySelector('[data-fig-id="fg-banc"]');
    window.__theoFigAnnot.surlignerFigure(fb, f, ts);
    await new Promise(r => setTimeout(r, 250));
    const msg = state.messages.find(m => m.ts === ts);
    const box = document.getElementById('mc-' + ts);
    const sp = box ? box.querySelector('.atc-mark') : null;
    const mk = (msg.marks || [])[0] || null;
    return {
      nb: (msg.marks || []).length,
      texte: sp ? sp.textContent : null,
      offsetOk: !!(mk && mk.start === 0 && mk.end === 5),
      couleur: mk ? mk.color : null
    };
  }, TS);
  ok("une marque est créée sur le cadre", r4.nb === 1, String(r4.nb));
  ok("elle porte les OFFSETS du cadre (0-5)", r4.offsetOk === true, String(r4.offsetOk));
  ok("elle surligne bien « Alpha »", r4.texte === 'Alpha', String(r4.texte));
  ok("sa couleur suit le cadre (bleu)", r4.couleur === 'blue', String(r4.couleur));

  const r5 = await page.evaluate(async (ts) => {
    const f = state.messages.find(m => m.ts === ts).shapes[0];
    const fb = document.querySelector('[data-fig-id="fg-banc"]');
    window.__theoFigAnnot.surlignerFigure(fb, f, ts);
    await new Promise(r => setTimeout(r, 250));
    const msg = state.messages.find(m => m.ts === ts);
    const box = document.getElementById('mc-' + ts);
    return { nb: (msg.marks || []).length, span: !!(box && box.querySelector('.atc-mark')) };
  }, TS);
  ok("un second clic RETIRE le surlignage", r5.nb === 0 && r5.span === false, JSON.stringify(r5));

  section("5. La note survit au re-rendu et part dans l'export");
  await page.evaluate(() => { if (typeof renderMessages === 'function') renderMessages(); });
  /* applyShapes est déclenché par l'observer (~60 ms) : lire le DOM tout de
     suite donnerait un faux négatif. */
  await page.waitForTimeout(400);
  const r6 = await page.evaluate((ts) => {
    const fb = document.querySelector('[data-fig-id="fg-banc"]');
    const msg = state.messages.find(m => m.ts === ts);
    let md = '';
    try { md = window.exportBuildMsgMD ? window.exportBuildMsgMD(msg) : ''; } catch (e) { md = 'ERREUR:' + e.message; }
    return { badge: !!(fb && fb.querySelector('.fb-note')), md: md };
  }, TS);
  ok("le badge revient après re-rendu (note persistée dans l'état)", r6.badge === true, String(r6.badge));
  ok("l'export Markdown transporte la note", /Note de l'encadré/.test(r6.md) && /Mon commentaire de banc/.test(r6.md),
     r6.md.slice(0, 120).replace(/\n/g, ' | '));

  section("6. Un cadre SANS ancre refuse le surlignage, avec un message clair");
  const r7 = await page.evaluate(async (ts) => {
    const msg = state.messages.find(m => m.ts === ts);
    const f2 = { id: 'fg-sans', x: 8, y: 60, w: 100, h: 34, shape: 'Rectangle', color: '#ff8a80', weight: 1.2, text: 'libre' };
    msg.shapes.push(f2);
    if (window.__applyShapes) window.__applyShapes();
    const fb = document.querySelector('[data-fig-id="fg-sans"]');
    const avant = (msg.marks || []).length;
    window.__theoFigAnnot.surlignerFigure(fb, f2, ts);
    await new Promise(r => setTimeout(r, 200));
    return { avant: avant, apres: (msg.marks || []).length };
  }, TS);
  ok("aucune marque créée sans ancre", r7.avant === r7.apres, r7.avant + ' -> ' + r7.apres);

  section("7. Aucune erreur JavaScript");
  ok("zéro erreur JS", bruit.length === 0, bruit.slice(0, 2).join(' | '));

  const passes = resultats.filter(r => r.pass).length;
  console.log("\nRESULTAT : " + passes + "/" + resultats.length);
  if (passes !== resultats.length) resultats.filter(r => !r.pass).forEach(r => console.log("  ÉCHEC : " + r.label));
  await browser.close();
  relais.child.kill();
  process.exit(passes === resultats.length ? 0 : 1);
})().catch(e => { console.error("EXCEPTION :", e && e.stack || e); process.exit(1); });
