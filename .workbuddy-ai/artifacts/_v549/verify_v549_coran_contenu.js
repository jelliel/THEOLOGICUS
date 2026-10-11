// Banc v549 — PANNEAU CORAN (v183) : CONTENU (tafsirs · hadiths · lexique ·
// parallèles · citations). v540 ne couvrait que le CHROME (design system).
//
// Contrat réel (module v183-quran-script) :
//   • window.__v183Open(s, v1, v2) ouvre #v183-pat, charge à la demande les
//     trois corpus PAR SOURATE (tradition/qtafsir|qhadith|qwbw/sN.js →
//     window.__qtafsirX|__qhadithX|__qwbwX[s]) puis rend :
//       § Tafsirs (N) / § Hadiths attribués (M) / § Lexique arabe mot à mot,
//     + § Parallèles bibliques (tradition/paralleles.json, asynchrone) ;
//   • 📋 par item → insertRaw(CITE[ci]) dans #user-input ;
//   • #v183-cite (en-tête) → buildCitation() : « 🕌 Coran S:V (nomPhon) » +
//     texte FR + arabe, via __quranSurahs (chargé par __ensureQuranSurah).
// NB (mesuré) : les replis « Pas de tafsir indexé » / « Aucun tafsir… » sont
// INATTEIGNABLES avec les corpus embarqués — qtafsir couvre les 6236 versets
// (vérifié sur les 114 sourates) et qwbw est complet. On ne teste pas une
// branche morte : le banc le documente plutôt que de la fabriquer.
//
// Méthode honnête : le banc EXÉCUTE les corpus servis par le relais dans un
// bac à sable Node (vm) et recoupe CHAQUE compte rendu au JSON réel (comme
// v547/v547). Cible : Coran 2:255 (Ayat al-Kursi) — tafsirs + hadiths +
// lexique + 1 parallèle exact dans le corpus.
//
// Usage : node verify_v549_coran_contenu.js

const H = require('../../../tools/bench_common.js');
const { chromium } = require('playwright');
const vm = require('vm');

const resultats = [];
function ok(nom, cond, detail) {
  resultats.push([!!cond, nom, detail === undefined ? '' : String(detail)]);
  console.log(`  ${cond ? '[OK]  ' : '[ECHEC]'} ${nom}${detail !== undefined ? '  -- ' + detail : ''}`);
  return !!cond;
}
function section(t) { console.log('\n' + t); }

/* charge un corpus « window.__x=… » dans un bac à sable Node */
function chargerCorpus(chemin) {
  try {
    const ctx = { window: {} };
    vm.createContext(ctx);
    vm.runInContext(require('fs').readFileSync(chemin, 'utf8'), ctx, { timeout: 5000 });
    return ctx.window;
  } catch (e) { return { __erreur: String(e).slice(0, 120) }; }
}

(async () => {
  console.log('='.repeat(72));
  console.log('BANC v549 — CORAN (v183) : CONTENU DU PANNEAU (2:255, Ayat al-Kursi)');
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

  /* ── Corpus chargés côté banc (croisement exact) ── */
  section('0. Corpus de la sourate 2 (côté banc, exécutés en bac à sable)');
  const wT = chargerCorpus('tradition/qtafsir/s2.js');
  const wH = chargerCorpus('tradition/qhadith/s2.js');
  const wW = chargerCorpus('tradition/qwbw/s2.js');
  const wQ = chargerCorpus('quran/q2.js');
  const tafsir2 = (wT.__qtafsirX || {})[2] || null;
  const hadith2 = (wH.__qhadithX || {})[2] || null;
  const wbw2 = (wW.__qwbwX || {})[2] || null;
  const sura2 = (wQ.__quranSurahs || {})[2] || null;
  if (!ok('les 4 corpus de la sourate 2 sont servis et exécutables',
          !!tafsir2 && !!wbw2 && !!sura2, 'tafsir=' + !!tafsir2 + ' hadith=' + !!hadith2 + ' wbw=' + !!wbw2 + ' quran=' + !!sura2)) {
    H.killRelay(relais); process.exit(2);
  }
  const NT = (tafsir2['255'] || []).length;   /* tafsirs de 2:255 */
  const NH = (hadith2 ? (hadith2['255'] || []).length : 0);
  const NW = (wbw2['255'] || []).length;      /* mots du verset 255 */
  ok('2:255 a du contenu à afficher (croisement)', NT > 0 && NW > 0,
     'tafsirs=' + NT + ' hadiths=' + NH + ' mots=' + NW);
  const nomPhon = sura2.nomPhon || '';
  ok('nomPhon de la sourate 2 disponible (citation)', !!nomPhon, nomPhon);

  /* NB : pas de recherche de « verset sans tafsir » — mesuré sur les 114
     sourates : qtafsir couvre chaque verset (aucun trou), le repli est une
     branche défensive morte avec les corpus embarqués. */

  /* parallèle exact attendu pour 2:255 */
  let para255 = 0, paraTitre = '';
  try {
    const ps = JSON.parse(require('fs').readFileSync('tradition/paralleles.json', 'utf8')).paralleles || [];
    const hits = ps.filter(p => String(p.q || '').split(',').some(part => {
      const m = /^\s*(\d+)(?::\s*(\d+)(?:\s*-\s*(\d+))?)?\s*$/.exec(part);
      return m && +m[1] === 2 && (m[2] === undefined || (+m[2] <= 255 && +(m[3] || m[2]) >= 255));
    }));
    para255 = hits.length;
    if (hits.length) paraTitre = hits[0].t || '';
  } catch (e) {}

  /* ── Navigateur ── */
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const erreurs = [];
  const BRUIT = /version\.txt|Failed to load resource|net::ERR|Failed to fetch|401|403|404|Unauthorized|\[corpus\]|jspdf|html2canvas|quranx|corpus\.quran\.com/i;
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
  ok('l\'API du module v183 est exposée', await page.evaluate(() =>
    typeof window.__v183Open === 'function' && typeof window.__v183RenderBody === 'function'));

  section('2. OUVERTURE 2:255 — les corpus paresseux se chargent et rendent');
  await page.evaluate(() => window.__v183Open(2, 255));
  await page.waitForFunction(() => {
    const p = document.getElementById('v183-pat');
    return p && p.classList.contains('open');
  }, { timeout: 15000 });
  await page.waitForFunction(() => {
    const b = document.getElementById('v183-body');
    return b && (b.querySelector('.v167-item') || b.querySelector('.v183-w'));
  }, { timeout: 20000 });
  const titre = await page.evaluate(() => (document.getElementById('v183-title') || {}).textContent || '');
  ok('le titre annonce la référence', /📖 Coran — Sourate 2 : 255$/.test(titre), titre);

  section('3. Comptes rendus = comptes du corpus (croisement exact)');
  const compte = await page.evaluate(() => {
    const b = document.getElementById('v183-body');
    const txt = b.textContent;
    const mT = txt.match(/§ Tafsirs \((\d+)\)/);
    const mH = txt.match(/§ Hadiths attribués \((\d+)\)/);
    return { t: mT ? +mT[1] : 0, h: mH ? +mH[1] : 0,
             w: b.querySelectorAll('.v183-w').length,
             q: b.querySelectorAll('.v183-q').length,
             lk: b.querySelectorAll('a.v167-lk').length };
  });
  ok('§ Tafsirs (' + NT + ') — compte rendu = corpus', compte.t === NT, 'rendu=' + compte.t);
  ok('§ Hadiths attribués (' + NH + ') — compte rendu = corpus', compte.h === NH, 'rendu=' + compte.h);
  ok('lexique mot à mot : ' + NW + ' blocs .v183-w rendus', compte.w === NW, 'rendu=' + compte.w);
  ok('un bouton 📋 par tafsir + hadith (' + (NT + NH) + ')', compte.q === NT + NH, 'rendu=' + compte.q);
  ok('des liens quranx.com sont présents', compte.lk >= NT, compte.lk + ' liens');
  const lexArabe = await page.evaluate(() => {
    const w = document.querySelector('#v183-body .v183-w');
    return w ? { tr: !!w.querySelector('.wt'), ar: !!w.querySelector('.v183-arab') } : { tr: false, ar: false };
  });
  ok('chaque mot du lexique porte translittération + arabe', lexArabe.tr && lexArabe.ar, JSON.stringify(lexArabe));

  section('4. § Parallèles bibliques (asynchrone, corpus exact)');
  const para = await page.evaluate(() => new Promise((resolve) => {
    let i = 0;
    const poll = setInterval(() => {
      i++;
      const box = document.getElementById('v183-para');
      const fait = box && box.textContent.indexOf('Parallèles bibliques') !== -1;
      if (fait || i > 20) {                 /* 10 s max */
        clearInterval(poll);
        const m = box ? box.textContent.match(/§ Parallèles bibliques \((\d+)\)/) : null;
        resolve({ n: m ? +m[1] : 0, texte: box ? box.textContent.slice(0, 300) : '' });
      }
    }, 500);
  }));
  ok('§ Parallèles bibliques (' + para255 + ') rendu — croisé au corpus', para.n === para255 && para255 > 0,
     'rendu=' + para.n + ' attendu=' + para255);
  if (paraTitre) ok('le parallèle attendu est cité (« ' + paraTitre.slice(0, 40) + ' »)',
     para.texte.indexOf(paraTitre.slice(0, 30)) !== -1, para.texte.slice(0, 120));

  section('5. CITATION par item (📋 → #user-input)');
  const cite1 = await page.evaluate(() => {
    const ta = document.getElementById('user-input');
    ta.value = ''; ta.dispatchEvent(new Event('input', { bubbles: true }));
    const q = document.querySelector('#v183-body .v183-q');
    if (!q) return { ok: false, err: 'aucun bouton 📋' };
    q.click();
    return { ok: true, contenu: ta.value };
  });
  ok('le 📋 du premier item insère la citation', cite1.ok && /📖 Tafsir/.test(cite1.contenu || '') && /Coran 2:255/.test(cite1.contenu || ''),
     String(cite1.contenu || cite1.err || '').slice(0, 90));

  section('6. CITATION d\'en-tête (#v183-cite → 🕌 Coran + nomPhon + arabe)');
  const cite2 = await page.evaluate(() => new Promise((resolve) => {
    const ta = document.getElementById('user-input');
    ta.value = ''; ta.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('v183-cite').click();
    let i = 0;
    const poll = setInterval(() => {
      i++;
      if (ta.value.indexOf('🕌 Coran 2:255') !== -1 || i > 20) {   /* 10 s : __ensureQuranSurah peut charger q2.js */
        clearInterval(poll);
        const nom = (window.__quranSurahs && window.__quranSurahs[2]) ? window.__quranSurahs[2].nomPhon : '';
        resolve({ contenu: ta.value, nom: nom });
      }
    }, 500);
  }));
  ok('la citation d\'en-tête insère « 🕌 Coran 2:255 »',
     (cite2.contenu || '').indexOf('🕌 Coran 2:255') !== -1, String(cite2.contenu || '').slice(0, 80));
  ok('elle porte le nom phonétique de la sourate (' + nomPhon + ')',
     !!nomPhon && (cite2.contenu || '').indexOf(nomPhon) !== -1 && cite2.nom === nomPhon);
  ok('elle contient le texte FR puis l\'arabe (bloc > … > …)',
     /\n>\n> /.test(cite2.contenu || '') && (cite2.contenu || '').length > 120,
     (cite2.contenu || '').length + ' caractères');

  section('7. Fermeture');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  ok('Échap ferme le panneau', await page.evaluate(() =>
    !document.getElementById('v183-pat').classList.contains('open')));

  section('8. Propreté');
  ok('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));

  await browser.close();
  H.killRelay(relais);
  process.exitCode = H.report(resultats);
})().catch(e => { console.error('\n[EXCEPTION] ' + (e && e.stack || e)); process.exit(3); });
