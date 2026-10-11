// Banc v553 — FEUILLE D'ÉTUDE (v189) : panier, notes, favoris, sauvegarde.
//
// v189 n'avait AUCUN banc. Le panneau #v189-pan s'ouvre par le bouton HUD
// runtime #open-etude-modal (🧺 ÉTUDE), que v203 place dans le menu
// « ⋯ Plus d'actions » (section Outils). Quatre onglets :
//   🧺 Panier   — theo_basket_v1 [{id,ts,src,text,fr}] ; export Word/MD ;
//                 📋 copier, 🗑 retirer ; __v189BasketAdd(s) ajoute (toast).
//   📝 Notes    — theo_panel_notes_v1 [{id,key,anchor,note,ts}] ; éditeur
//                 flottant __v189NoteEditor(s?, existing?) (#v189-note-ed).
//   ⭐ Favoris  — theo_favorites_v1 [{id,label,parts,open}] ; « 📖 Ouvrir »
//                 referme la feuille et rouvre le panneau source
//                 (open.kind='quran' → __v183Open(s,v1,v2)).
//   💾 Sauvegarde — export/import JSON des données locales.
//
// Méthode : amorçage localStorage (les VRAIES clés de l'app), ouverture par
// le CHEMIN RÉEL (menu ⋯ → 🧺 ÉTUDE), assertions DOM + effets localStorage,
// et une intégration inter-modules (favoris → panneau Coran).
//
// Usage : node verify_v553_etude.js

const H = require('../../../tools/bench_common.js');
const { chromium } = require('playwright');

const resultats = [];
function ok(nom, cond, detail) {
  resultats.push([!!cond, nom, detail === undefined ? '' : String(detail)]);
  console.log(`  ${cond ? '[OK]  ' : '[ECHEC]'} ${nom}${detail !== undefined ? '  -- ' + detail : ''}`);
  return !!cond;
}
function section(t) { console.log('\n' + t); }

const AMORCE = {
  basket: [
    { id: 'bk-1', ts: 1, src: 'Bible Jean 3:16', text: 'Car Dieu a tant aimé le monde qu\u2019il a donné son Fils unique.', fr: 'Texte déjà en français.' },
    { id: 'bk-2', ts: 2, src: 'Coran 2:255', text: 'Allah! Point de divinité à part Lui, le Vivant, Celui qui subsiste par Lui-même.' }
  ],
  notes: [
    { id: 'pn-1', key: 'v167#43:3:16', anchor: 'Car Dieu a tant aimé…', note: 'Ma note d\u0027étude sur Jean 3:16.', ts: 3 }
  ],
  favs: [
    { id: 'fv-1', label: 'Coran 2:255', parts: [{ sn: 'Allah! Point de divinité à part Lui…', fr: null }], open: { kind: 'quran', s: 2, v1: 255 } }
  ],
  hist: [
    { id: 'hs-1', label: 'Coran 2:255', ts: 5, open: { kind: 'quran', s: 2, v1: 255 } }
  ]
};

(async () => {
  console.log('='.repeat(72));
  console.log('BANC v553 — FEUILLE D\'ÉTUDE (v189) : PANIER · NOTES · FAVORIS · SAUVEGARDE');
  console.log('='.repeat(72));

  const port = await H.pickFreePort();
  console.log('  … relais sur port libre ' + port);
  const relais = await H.spawnRelay({ port });
  if (!relais.child || relais.child.exitCode !== null) {
    console.log('\nRelais injoignable.'); process.exit(2);
  }
  const BASE = `http://127.0.0.1:${port}/THEOLOGICUS.html`;
  console.log('  base : ' + BASE);

  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const erreurs = [];
  const BRUIT = /version\.txt|Failed to load resource|net::ERR|Failed to fetch|401|403|404|Unauthorized|\[corpus\]|jspdf|html2canvas|quranx|corpus\.quran\.com/i;
  page.on('pageerror', e => erreurs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !BRUIT.test(m.text())) erreurs.push('console: ' + m.text()); });
  page.on('dialog', d => d.accept());

  await page.addInitScript(H.isolationInit);
  /* amorçage AVANT le chargement : les clés locales de l'app */
  await page.addInitScript((a) => {
    try {
      localStorage.setItem('theo_basket_v1', JSON.stringify(a.basket));
      localStorage.setItem('theo_panel_notes_v1', JSON.stringify(a.notes));
      localStorage.setItem('theo_favorites_v1', JSON.stringify(a.favs));
      localStorage.setItem('theo_history_v1', JSON.stringify(a.hist));
    } catch (e) {}
  }, AMORCE);

  section('1. Ouverture de l\'application');
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(() => { const ov = document.getElementById('setup-wizard-overlay'); if (ov) { ov.classList.remove('active'); ov.style.display = 'none'; } }).catch(() => {});
  await page.waitForTimeout(1200);
  ok('les API du module v189 sont exposées', await page.evaluate(() =>
    typeof window.__v189Render === 'function' && typeof window.__v189BasketAdd === 'function' &&
    typeof window.__v189NoteEditor === 'function' && typeof window.__v189ApplyPanelNotes === 'function'));

  section('2. OUVERTURE par le chemin réel : menu ⋯ → 🧺 ÉTUDE');
  const btnMenu = await page.$('#v6-right-grp button[title="Plus d actions"]');
  if (!ok('le menu ⋯ est présent dans la barre v6', !!btnMenu)) { await browser.close(); H.killRelay(relais); process.exit(2); }
  await btnMenu.click();
  await page.waitForTimeout(250);
  const btnEtude = await page.$('#open-etude-modal');
  ok('le bouton 🧺 ÉTUDE est présent dans le menu ⋯ (v203)', !!btnEtude &&
     await btnEtude.evaluate(e => e.offsetParent !== null || getComputedStyle(e).display !== 'none'));
  await btnEtude.click();
  await page.waitForTimeout(300);
  ok('le panneau #v189-pan est ouvert', await page.evaluate(() =>
    document.getElementById('v189-pan') && document.getElementById('v189-pan').classList.contains('open')));
  ok('les 4 onglets existent (Panier/Notes/Favoris/Sauvegarde)', await page.evaluate(() => {
    const vs = Array.from(document.querySelectorAll('#v189-tabs button')).map(b => b.dataset.v);
    return vs.join(',') === 'basket,notes,fav,backup';
  }, ));

  section('3. ONGLET PANIER — amorcé, rendu, actions');
  const panier = await page.evaluate(() => {
    const b = document.getElementById('v189-body');
    return {
      items: b.querySelectorAll('.v189-item').length,
      src0: (b.querySelector('.v189-item b') || {}).textContent || '',
      texte: b.textContent.indexOf('Car Dieu a tant aimé') !== -1,
      fr: b.textContent.indexOf('🇫🇷') !== -1,
      word: !!b.querySelector('#v189-word'), md: !!b.querySelector('#v189-md'),
      del: b.querySelectorAll('[data-del]').length
    };
  });
  ok('les 2 entrées du panier sont rendues', panier.items === 2, 'items=' + panier.items);
  ok('la source du premier item est étiquetée (« ' + panier.src0 + ' »)', panier.src0 === 'Bible Jean 3:16', panier.src0);
  ok('le texte et la traduction 🇫🇷 sont affichés', panier.texte && panier.fr);
  ok('les exports Word/Markdown sont présents', panier.word && panier.md);
  ok('un bouton 🗑 Retirer par item', panier.del === 2, panier.del);

  const retire = await page.evaluate(() => {
    document.querySelector('#v189-body [data-del="bk-2"]').click();
    return JSON.parse(localStorage.getItem('theo_basket_v1') || '[]').map(x => x.id);
  });
  ok('🗑 Retirer supprime l\'entrée du localStorage (et seulement elle)',
     retire.join(',') === 'bk-1', retire.join(','));
  const apresRetrait = await page.evaluate(() => document.querySelectorAll('#v189-body .v189-item').length);
  ok('le rendu se met à jour (1 item restant)', apresRetrait === 1, 'items=' + apresRetrait);

  section('4. __v189BasketAdd — ajout programmatique (bulle de sélection)');
  const ajout = await page.evaluate(() => {
    window.__v189BasketAdd({ text: 'Sélection test pour le banc v553' });
    return JSON.parse(localStorage.getItem('theo_basket_v1') || '[]');
  });
  ok('l\'ajout atterrit dans theo_basket_v1 (1 restant + 1 ajouté = 2)', ajout.length === 2, 'n=' + ajout.length);
  ok('la nouvelle entrée porte la source par défaut « Sélection »',
     (ajout[1] || {}).src === 'Sélection', (ajout[1] || {}).src);

  section('5. ONGLET NOTES — liste, éditeur, sauvegarde');
  await page.evaluate(() => document.querySelector('#v189-tabs button[data-v="notes"]').click());
  await page.waitForTimeout(200);
  const notes = await page.evaluate(() => {
    const b = document.getElementById('v189-body');
    return { contient: b.textContent.indexOf('Ma note d\u0027étude') !== -1 };
  });
  ok('la note amorcée est listée dans l\'onglet Notes', notes.contient);
  const editeur = await page.evaluate(() => new Promise((resolve) => {
    const n = JSON.parse(localStorage.getItem('theo_panel_notes_v1'))[0];
    window.__v189NoteEditor(null, n);
    setTimeout(() => {
      const ed = document.getElementById('v189-note-ed');
      resolve({ visible: ed && ed.style.display !== 'none' && ed.style.display !== '',
                prefill: ed ? ed.querySelector('textarea').value : '' });
    }, 150);
  }));
  ok('l\'éditeur flottant s\'ouvre prérempli', editeur.visible && editeur.prefill === 'Ma note d\u0027étude sur Jean 3:16.',
     editeur.prefill.slice(0, 60));
  const sauve = await page.evaluate(() => new Promise((resolve) => {
    const ed = document.getElementById('v189-note-ed');
    ed.querySelector('textarea').value = 'Note mise à jour par le banc v553.';
    ed.querySelector('.save').click();
    setTimeout(() => {
      const arr = JSON.parse(localStorage.getItem('theo_panel_notes_v1') || '[]');
      resolve({ note: (arr[0] || {}).note || '', ferme: ed.style.display === 'none' });
    }, 200);
  }));
  ok('💾 Enregistrer met à jour theo_panel_notes_v1', sauve.note === 'Note mise à jour par le banc v553.', sauve.note);
  ok('l\'éditeur se referme après enregistrement', sauve.ferme);

  section('6. ONGLET FAVORIS → intégration panneau Coran');
  await page.evaluate(() => document.querySelector('#v189-tabs button[data-v="fav"]').click());
  await page.waitForTimeout(200);
  const fav = await page.evaluate(() => {
    const b = document.getElementById('v189-body');
    return { label: b.textContent.indexOf('Coran 2:255') !== -1,
             ouvrir: !!b.querySelector('[data-open="fv-1"]'),
             hist: b.textContent.indexOf('🕘 HISTORIQUE') !== -1 };
  });
  ok('le favori amorcé est listé avec « 📖 Ouvrir »', fav.label && fav.ouvrir);
  ok('la section 🕘 HISTORIQUE est rendue', fav.hist);
  await page.evaluate(() => document.querySelector('#v189-body [data-open="fv-1"]').click());
  await page.waitForTimeout(600);
  const integre = await page.evaluate(() => ({
    etudeFermee: !document.getElementById('v189-pan').classList.contains('open'),
    coranOuvert: document.getElementById('v183-pat') && document.getElementById('v183-pat').classList.contains('open'),
    titre: (document.getElementById('v183-title') || {}).textContent || ''
  }));
  ok('« 📖 Ouvrir » referme la feuille et rouvre le panneau source',
     integre.etudeFermee && integre.coranOuvert && integre.titre.indexOf('Sourate 2 : 255') !== -1,
     integre.titre);
  await page.keyboard.press('Escape');      /* refermer le panneau Coran */
  await page.waitForTimeout(250);

  section('7. ONGLET SAUVEGARDE — rendu');
  await page.evaluate(() => { window.__v189Render(); document.querySelector('#v189-tabs button[data-v="backup"]').click(); });
  await page.waitForTimeout(200);
  const backup = await page.evaluate(() => {
    const b = document.getElementById('v189-body');
    return { nonVide: b.innerHTML.length > 200, boutons: b.querySelectorAll('button').length };
  });
  ok('l\'onglet Sauvegarde rend son interface (export/restauration)',
     backup.nonVide && backup.boutons >= 1, backup.boutons + ' bouton(s)');

  section('8. Fermeture');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  ok('Échap ferme la feuille d\'étude', await page.evaluate(() =>
    !document.getElementById('v189-pan').classList.contains('open')));

  section('9. Propreté');
  ok('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));

  await browser.close();
  H.killRelay(relais);
  process.exitCode = H.report(resultats);
})().catch(e => { console.error('\n[EXCEPTION] ' + (e && e.stack || e)); process.exit(3); });
