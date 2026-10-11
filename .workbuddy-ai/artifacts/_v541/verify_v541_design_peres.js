// Banc v541 — PANNEAU PÈRES (v167) MIGRÉ AU DESIGN SYSTEM (Axe 3, lot C1).
//
// Caractérisation d'abord (ouvre le panneau sur un verset, prouve qu'il
// s'ouvre / se ferme et que le chrome est migré), puis contrat de migration
// (jetons --ui-* + ui-btn). Réutilise l'outillage partagé tools/bench_common.js
// (Axe 4, lot R1) : port libre, arrêt du relais par PID, isolation standard.
//
// R1a (vérifiabilité honnête) : le contenu (extraits de Pères) dépend de
// l'index précalculé (v167_fathers_idx). Dans un profil isolé neuf l'index
// n'est PAS construit (scan asynchrone de ~120 œuvres trop lent pour le banc),
// donc on AMORCE le cache IndexedDB (app_config / v167_fathers_idx) AVANT
// d'ouvrir le panneau — l'assertion de contenu devient alors HONNÊTE
// (extraits > 0 prouve que l'index est lu et rendu), sans dépendre du corpus.
//
// Usage : node verify_v541_design_peres.js

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
  console.log('BANC v541 — PANNEAU PÈRES MIGRÉ AU DESIGN SYSTEM');
  console.log('='.repeat(72));

  const port = await H.pickFreePort();
  console.log('  … relais sur port libre ' + port + ' (évite 8765 partagé)');
  const relais = await H.spawnRelay({ port });
  if (!relais.child || relais.child.exitCode !== null) {
    console.log('\nRelais injoignable.'); process.exit(2);
  }
  const BASE = `http://127.0.0.1:${port}/THEOLOGICUS.html`;
  console.log('  base : ' + BASE);

  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const erreurs = [];
  const BRUIT = /version\.txt|Failed to load resource|net::ERR|Failed to fetch|401|403|404|Unauthorized|\[corpus\]|jspdf|html2canvas/i;
  page.on('pageerror', e => erreurs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !BRUIT.test(m.text())) erreurs.push('console: ' + m.text()); });
  page.on('dialog', d => d.accept());

  await page.addInitScript(H.isolationInit);

  section('0. Ouverture de l\'application');
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(() => { const ov = document.getElementById('setup-wizard-overlay'); if (ov) { ov.classList.remove('active'); ov.style.display = 'none'; } }).catch(() => {});
  await page.waitForTimeout(1200);
  ok("l'API d'ouverture des Pères existe", await page.evaluate(() => typeof window.__v167OpenPanel === 'function'));

  section('0.5 Amorçage de l\'index des Pères (R1a)');
  // Le panneau lit l'index précalculé (app_config / v167_fathers_idx). En
  // profil isolé neuf cet index n'existe pas (le scan asynchrone de ~120
  // œuvres est trop lent pour le banc) → on l'amorce directement dans
  // IndexedDB AVANT d'ouvrir le panneau, afin que l'assertion de contenu
  // soit HONNÊTE (extraits > 0 prouve la lecture+rendu de l'index).
  // Clé d'index = "b:c:v" (Segond v167 : Jn = 43) → "43:3:16".
  const amorce = await page.evaluate(() => new Promise((resolve, reject) => {
    const rec = {
      id: 'v167_fathers_idx', v: 1671,
      idx: { '43:3:16': [
        { w: 'f0409', h: 0, st: 'Commentaire sur Jean', sn: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life. (John 3:16)' },
        { w: 'f0301', h: 1, st: 'Homélie sur le prologue', sn: 'And as Moses lifted up the serpent in the wilderness, even so must the Son of man be lifted up. (John 3:14)' }
      ] }
    };
    let c = null;
    const req = indexedDB.open('THEOLOGICUS_AI_DB', 5);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('app_config')) d.createObjectStore('app_config', { keyPath: 'id' });
    };
    req.onsuccess = e => {
      c = e.target.result;
      const tx = c.transaction('app_config', 'readwrite');
      tx.objectStore('app_config').put(rec);
      tx.oncomplete = () => { try { c.close(); } catch (_) {} resolve('amorcé'); };
      tx.onerror = () => { try { c.close(); } catch (_) {} reject(tx.error); };
    };
    req.onerror = () => { try { c && c.close(); } catch (_) {} reject(req.error); };
  }));
  ok("l'index des Pères est amorcé en cache", amorce === 'amorcé', amorce);

  section('1. CARACTÉRISATION : le panneau fonctionne');
  const usagesAvant = await page.evaluate(() => window.__v509Design ? window.__v509Design.audit().usages : -1);
  await page.evaluate(() => window.__v167OpenPanel('Jn 3:16'));
  await page.waitForFunction(() => {
    const p = document.getElementById('v167-pat');
    return p && p.classList.contains('open');
  }, { timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll('#v167-body .v167-item').length > 0 || (document.getElementById('v167-status') && document.getElementById('v167-status').textContent.length > 0), { timeout: 30000 }).catch(() => {});
  const car = await page.evaluate(() => ({
    titre: (document.getElementById('v167-title') || {}).textContent || '',
    peres: document.querySelectorAll('#v167-body > .v167-item').length,
    items: document.querySelectorAll('#v167-body .v167-item').length,
    groupes: Array.from(document.querySelectorAll('#v167-body > .v167-grp')).map(e => e.textContent).join(' | '),
    statut: (document.getElementById('v167-status') || {}).textContent || '',
    indexCharge: window.__fathersIndex ? Object.keys(window.__fathersIndex).length : 0,
    close: !!document.getElementById('v167-close')
  }));
  ok("le titre annonce les Pères", /Pères/.test(car.titre), car.titre);
  ok("le bouton de fermeture existe", car.close);
  ok("le panneau a ouvert et rendu un état", car.items > 0 || car.statut.length > 0,
     'extraits=' + car.items + ' (dont Pères=' + car.peres + ') statut=' + car.statut.length + ' | index Pères chargé=' + car.indexCharge);
  // R1a — assertion HONNÊTE : avec l'index des Pères amorcé en cache, le
  // panneau doit rendre les extraits PATRISTIQUES (enfants directs de
  // #v167-body, distincts des corpora auxiliaires TA/HCF/SEF). Si peres===0,
  // c'est un vrai échec (index non lu/rendu), plus une tolérance de profil.
  ok("les extraits PATRISTIQUES sont rendus (index lu)", car.peres > 0,
     'Pères=' + car.peres + ' groupes=' + car.groupes);

  section('2. MIGRATION : le chrome utilise les jetons --ui-*');
  const tok = await page.evaluate(() => {
    function resoudre(prop, expr) {
      const s = document.createElement('div');
      s.style.position = 'absolute'; s.style.left = '-9999px';
      s.style[prop] = expr;
      document.body.appendChild(s);
      const v = getComputedStyle(s)[prop];
      s.remove();
      return v;
    }
    const box = document.getElementById('v167-box');
    const head = document.getElementById('v167-head');
    const csBox = getComputedStyle(box);
    const csHead = getComputedStyle(head);
    return {
      uiPanel: resoudre('backgroundColor', 'var(--ui-panel)'),
      bgBox: csBox.backgroundColor,
      uiBorder: resoudre('borderTopColor', 'var(--ui-border)'),
      bordureBox: csBox.borderTopColor,
      uiAccent: resoudre('color', 'var(--ui-accent)'),
      couleurHead: csHead.color,
      clsBox: box.className,
      clsClose: (document.getElementById('v167-close') || {}).className || '',
      usages: window.__v509Design ? window.__v509Design.audit().usages : -1
    };
  });
  console.log('  jeton --ui-panel=' + tok.uiPanel + '  fond du panneau=' + tok.bgBox);
  ok("#v167-box porte la classe ui-panel", /\bui-panel\b/.test(tok.clsBox), tok.clsBox);
  ok('le fond du panneau est le jeton --ui-panel', tok.bgBox === tok.uiPanel, tok.bgBox + ' vs ' + tok.uiPanel);
  ok('la bordure du panneau est le jeton --ui-border', tok.bordureBox === tok.uiBorder, tok.bordureBox + ' vs ' + tok.uiBorder);
  ok('le titre utilise le jeton --ui-accent', tok.couleurHead === tok.uiAccent, tok.couleurHead + ' vs ' + tok.uiAccent);
  ok('la fermeture porte ui-btn', /\bui-btn\b/.test(tok.clsClose), tok.clsClose);
  ok("l'auditeur voit des composants ui-* en plus", tok.usages > usagesAvant, 'avant=' + usagesAvant + ' après=' + tok.usages);

  section('3. La migration n\'a RIEN cassé');
  const apres = await page.evaluate(() => ({
    titre: (document.getElementById('v167-title') || {}).textContent || '',
    peres: document.querySelectorAll('#v167-body > .v167-item').length
  }));
  ok('le titre est intact', /Pères/.test(apres.titre), apres.titre);
  ok('le contenu patristique est intact', apres.peres === car.peres, car.peres + ' -> ' + apres.peres);
  await page.evaluate(() => document.getElementById('v167-close').click());
  await page.waitForTimeout(300);
  ok('le panneau se ferme toujours', await page.evaluate(() => !document.getElementById('v167-pat').classList.contains('open')));

  section('4. Propreté');
  ok('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));

  await browser.close();
  H.killRelay(relais);
  process.exitCode = H.report(resultats);
})().catch(e => { console.error('\n[EXCEPTION] ' + (e && e.stack || e)); process.exit(3); });
