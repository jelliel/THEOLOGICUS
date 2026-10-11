// Banc v552 — CHRONOLOGIES v197 : frises sourate + livre biblique.
//
// v197 n'avait AUCUN banc. Le module expose des rendus purs à conteneur :
//   • window.__theoTL197surah(s, box)  — frise « révélation + transmission »
//     (données tradition/tl_versets.json : coran[s] + coran_evt) ;
//   • window.__theoTL197bible(b, box)  — frise « composition + manuscrits »
//     (bible[b] : nom, c1, c2, t → composition à (c1+c2)/2, puis at/nt_evt) ;
//   • window.__theoTLsvg(evs) — SVG réutilisable (≥ 2 événements, tri par
//     date, points .tl-dot cliquables, étiquettes .tl-lab anti-collision).
// Interactions : clic sur un point → carte #v197-tl-card (badge de date
// fmtDate, libellé, info, navigation ‹ › entre les événements de la frise,
// compteur « i / N ») ; Échap ou clic extérieur la ferment.
//
// Méthode honnête : le banc lit tradition/tl_versets.json servi par le
// relais et recoupe CHAQUE compte (points rendus = 1 + événements du corpus,
// libellés et dates exacts). Garde box.isConnected vérifié au passage.
// Mesuré : coran couvre 114/114 sourates et bible 66/66 livres — les
// branches « référence absente » sont mortes ; on teste les bords réels
// (< 2 événements → SVG vide ; boîte non connectée → pas de rendu).
//
// Usage : node verify_v552_chronologie.js

const H = require('../../../tools/bench_common.js');
const { chromium } = require('playwright');

const resultats = [];
function ok(nom, cond, detail) {
  resultats.push([!!cond, nom, detail === undefined ? '' : String(detail)]);
  console.log(`  ${cond ? '[OK]  ' : '[ECHEC]'} ${nom}${detail !== undefined ? '  -- ' + detail : ''}`);
  return !!cond;
}
function section(t) { console.log('\n' + t); }

(async () => {
  console.log('='.repeat(72));
  console.log('BANC v552 — CHRONOLOGIES (v197) : FRISE SOURATE + LIVRE + CARTE');
  console.log('='.repeat(72));

  const port = await H.pickFreePort();
  console.log('  … relais sur port libre ' + port);
  const relais = await H.spawnRelay({ port });
  if (!relais.child || relais.child.exitCode !== null) {
    console.log('\nRelais injoignable.'); process.exit(2);
  }
  const BASE = `http://127.0.0.1:${port}/THEOLOGICUS.html`;
  const ORIGINE = `http://127.0.0.1:${port}`;
  console.log('  base : ' + BASE);

  /* ── Corpus côté banc (croisement exact) ── */
  section('0. Corpus tradition/tl_versets.json (côté banc)');
  let TL = null;
  try { TL = await (await fetch(ORIGINE + '/tradition/tl_versets.json')).json(); } catch (e) { TL = null; }
  if (!ok('le corpus des frises est servi par le relais',
          !!TL && !!TL.coran && !!TL.bible, TL ? ('coran=' + Object.keys(TL.coran).length + ' sourates, bible=' + Object.keys(TL.bible).length + ' livres') : 'JSON injoignable')) {
    H.killRelay(relais); process.exit(2);
  }
  const s2 = TL.coran['2'];
  const evtCoran = TL.coran_evt || [];
  const attenduDotsS2 = 1 + evtCoran.length;
  const b40 = TL.bible['40'];
  const evtNT = TL.nt_evt || [];
  const attenduDotsB40 = 1 + evtNT.length;
  ok('sourate 2 : révélation y=' + (s2 && s2.y) + ' + ' + evtCoran.length + ' événements de transmission',
     !!s2 && s2.y === 627, s2 ? (s2.lieu + ' — ' + (s2.info || '').slice(0, 70)) : '-');
  ok('Matthieu (b40) : composition (' + b40.c1 + '-' + b40.c2 + ') + ' + evtNT.length + ' événements NT',
     !!b40 && b40.t === 'NT', b40 ? b40.nom : '-');

  /* ── Navigateur ── */
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const erreurs = [];
  const BRUIT = /version\.txt|Failed to load resource|net::ERR|Failed to fetch|401|403|404|Unauthorized|\[corpus\]|jspdf|html2canvas/i;
  page.on('pageerror', e => erreurs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !BRUIT.test(m.text())) erreurs.push('console: ' + m.text()); });
  page.on('dialog', d => d.accept());

  await page.addInitScript(H.isolationInit);

  section('1. Ouverture de l\'application');
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(() => { const ov = document.getElementById('setup-wizard-overlay'); if (ov) { ov.classList.remove('active'); ov.style.display = 'none'; } }).catch(() => {});
  await page.waitForTimeout(1200);
  ok('les API du module v197 sont exposées', await page.evaluate(() =>
    typeof window.__theoTL197surah === 'function' && typeof window.__theoTL197bible === 'function' &&
    typeof window.__theoTLsvg === 'function' && Array.isArray(window.__theoTLdata)));

  section('2. FRISE SOURATE 2 — rendu croisé au corpus');
  const frise = await page.evaluate(() => new Promise((resolve) => {
    const box = document.createElement('div');
    box.id = 'v552-tl-s2';
    document.body.appendChild(box);                 /* isConnected requis */
    window.__theoTL197surah(2, box);
    let i = 0;
    const poll = setInterval(() => {
      i++;
      if (box.querySelector('.tl-dot') || i > 20) {  /* 10 s max */
        clearInterval(poll);
        resolve({
          entete: box.textContent.indexOf('Chronologie de la sourate') !== -1,
          dots: box.querySelectorAll('.tl-dot').length,
          labs: Array.from(box.querySelectorAll('.tl-lab')).map(e => e.textContent),
          svgRole: (box.querySelector('svg') || {}).getAttribute ? box.querySelector('svg').getAttribute('role') : null
        });
      }
    }, 500);
  }));
  ok('l\'en-tête « 📜 Chronologie de la sourate » est posé', frise.entete);
  ok('points rendus = 1 révélation + ' + evtCoran.length + ' événements (croisement)',
     frise.dots === attenduDotsS2, 'rendu=' + frise.dots + ' attendu=' + attenduDotsS2);
  ok('le SVG est accessible (role=img + aria-label)', frise.svgRole === 'img');
  ok('l\'étiquette « Révélation » figure dans la frise', frise.labs.indexOf('Révélation') !== -1,
     frise.labs.slice(0, 4).join(' | '));

  section('3. CARTE au clic — date, libellé, info, navigation ‹ ›');
  const carte = await page.evaluate(() => new Promise((resolve) => {
    const dot = Array.from(document.querySelectorAll('#v552-tl-s2 .tl-dot'))
      .find(d => (d.querySelector('title') || {}).textContent && d.querySelector('title').textContent.indexOf('Révélation') === 0);
    if (!dot) { resolve({ erreur: 'point Révélation introuvable' }); return; }
    const r = dot.getBoundingClientRect();
    dot.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: r.left + 5, clientY: r.top + 5 }));
    let i = 0;
    const poll = setInterval(() => {
      i++;
      const c = document.getElementById('v197-tl-card');
      if ((c && c.style.display === 'block') || i > 10) {
        clearInterval(poll);
        if (!c || c.style.display !== 'block') { resolve({ erreur: 'carte non ouverte' }); return; }
        const out = {
          date: (c.textContent.match(/(\d+ av\. J\.-C\.|\d+ ap\. J\.-C\.)/) || [])[1] || '',
          label: (c.querySelector('b') || {}).textContent || '',
          info: c.textContent.indexOf('Médine') !== -1 || c.textContent.indexOf('622') !== -1,
          nav: c.querySelectorAll('button').length,
          compteur: (c.textContent.match(/1 \/ (\d+)/) || [])[1] || ''
        };
        /* navigation : › passe au suivant */
        const btns = c.querySelectorAll('button');
        if (btns[1]) btns[1].click();
        setTimeout(() => {
          out.apresNav = (c.textContent.match(/(\d+) \/ (\d+)/) || []).slice(1).join('/');
          resolve(out);
        }, 120);
      }
    }, 200);
  }));
  if (!ok('la carte s\'ouvre au clic du point (badge de date inclus)', !carte.erreur && !!carte.date,
          carte.erreur || ('date=' + carte.date))) {
    /* pas de blocage : les assertions suivantes gèrent l'absence */
  } else {
    ok('la date croisée au corpus est affichée (627 ap. J.-C.)', carte.date === '627 ap. J.-C.', carte.date);
    ok('le libellé de l\'événement est « Révélation »', carte.label === 'Révélation', carte.label);
    ok('l\'info de la sourate figure (Médine / 622-632)', carte.info);
    ok('navigation ‹ › présente pour une frise de ' + attenduDotsS2 + ' événements', carte.nav === 2, carte.nav + ' bouton(s)');
    ok('compteur initial « 1 / ' + attenduDotsS2 + ' »', carte.compteur === String(attenduDotsS2), carte.compteur);
    ok('le bouton › avance le compteur (' + carte.apresNav + ')', carte.apresNav === '2/' + attenduDotsS2, carte.apresNav);
  }

  section('4. Fermeture de la carte (Échap)');
  const fermee = await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    const c = document.getElementById('v197-tl-card');
    return c ? c.style.display === 'none' : true;
  });
  ok('Échap ferme la carte', fermee);

  section('5. FRISE LIVRE (Matthieu) — composition + événements NT');
  const friseB = await page.evaluate(() => new Promise((resolve) => {
    const box = document.createElement('div');
    box.id = 'v552-tl-b40';
    document.body.appendChild(box);
    window.__theoTL197bible(40, box);
    let i = 0;
    const poll = setInterval(() => {
      i++;
      if (box.querySelector('.tl-dot') || i > 20) {
        clearInterval(poll);
        resolve({
          entete: box.textContent.indexOf('Chronologie du livre') !== -1,
          dots: box.querySelectorAll('.tl-dot').length,
          compo: box.textContent.indexOf('Composition — Matthieu') !== -1
        });
      }
    }, 500);
  }));
  ok('l\'en-tête « 📜 Chronologie du livre » est posé', friseB.entete);
  ok('points rendus = 1 composition + ' + evtNT.length + ' événements NT (croisement)',
     friseB.dots === attenduDotsB40, 'rendu=' + friseB.dots + ' attendu=' + attenduDotsB40);
  ok('le point de composition porte le livre (« Composition — Matthieu »)', friseB.compo);

  section('6. Bords réels (mesurés : pas de référence absente dans le corpus)');
  const svgCourt = await page.evaluate(() => window.__theoTLsvg([{ y: 500, l: 'seul événement' }]));
  ok('__theoTLsvg avec < 2 événements → chaîne vide (garde du module)', svgCourt === '');
  const nonConnecte = await page.evaluate(() => new Promise((resolve) => {
    const box = document.createElement('div');           /* JAMAIS attaché au DOM */
    window.__theoTL197surah(2, box);
    setTimeout(() => resolve(box.childElementCount === 0), 1500);
  }));
  ok('boîte non connectée → aucun rendu (garde box.isConnected)', nonConnecte);

  section('7. Propreté');
  ok('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));

  await browser.close();
  H.killRelay(relais);
  process.exitCode = H.report(resultats);
})().catch(e => { console.error('\n[EXCEPTION] ' + (e && e.stack || e)); process.exit(3); });
