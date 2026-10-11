// Banc v541 — PANNEAU PÈRES (v167) MIGRÉ AU DESIGN SYSTEM (Axe 3, lot C1).
//
// Caractérisation d'abord (ouvre le panneau sur un verset, prouve qu'il
// s'ouvre / se ferme et que le chrome est migré), puis contrat de migration
// (jetons --ui-* + ui-btn). Réutilise l'outillage partagé tools/bench_common.js
// (Axe 4, lot R1) : port libre, arrêt du relais par PID, isolation standard.
//
// ⚠️ Le contenu (extraits de Pères) dépend de l'index précalculé
// (v167_fathers_idx) + corpus fathers/*.js même origine. Dans un profil neuf
// isolé l'index n'est pas encore construit → les extraits ne s'affichent pas ;
// l'assertion de contenu est donc TOLÉRANTE et TRANSPARENTE (on rapporte
// index chargé / extraits), cf. lot R1a (amorcer/attendre le corpus).
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

  section('1. CARACTÉRISATION : le panneau fonctionne');
  const usagesAvant = await page.evaluate(() => window.__v509Design ? window.__v509Design.audit().usages : -1);
  await page.evaluate(() => window.__v167OpenPanel('Jn 3:16'));
  await page.waitForFunction(() => {
    const p = document.getElementById('v167-pat');
    return p && p.classList.contains('open');
  }, { timeout: 20000 });
  await page.waitForFunction(() => document.querySelectorAll('#v167-body .v167-item').length > 0 || (document.getElementById('v167-body') && document.getElementById('v167-body').childElementCount > 0) || (document.getElementById('v167-status') && document.getElementById('v167-status').textContent.length > 0), { timeout: 30000 }).catch(() => {});
  const car = await page.evaluate(() => ({
    titre: (document.getElementById('v167-title') || {}).textContent || '',
    items: document.querySelectorAll('#v167-body .v167-item').length,
    enfants: document.getElementById('v167-body') ? document.getElementById('v167-body').childElementCount : 0,
    statut: (document.getElementById('v167-status') || {}).textContent || '',
    indexCharge: window.__fathersIndex ? Object.keys(window.__fathersIndex).length : 0,
    close: !!document.getElementById('v167-close')
  }));
  ok("le titre annonce les Pères", /Pères/.test(car.titre), car.titre);
  ok("le bouton de fermeture existe", car.close);
  ok("le panneau a ouvert et rendu un état", car.items > 0 || car.enfants > 0 || car.statut.length > 0,
     'extraits=' + car.items + ' enfants=' + car.enfants + ' statut=' + car.statut.length + ' | index Pères chargé=' + car.indexCharge);
  if (car.items === 0) console.log('  ⚠️  contenu non vérifié (index Pères non construit en profil isolé) — voir lot R1a.');

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
    items: document.querySelectorAll('#v167-body .v167-item').length,
    enfants: document.getElementById('v167-body') ? document.getElementById('v167-body').childElementCount : 0
  }));
  ok('le titre est intact', /Pères/.test(apres.titre), apres.titre);
  ok('le contenu est intact', apres.items === car.items && apres.enfants === car.enfants, car.items + '/' + car.enfants + ' -> ' + apres.items + '/' + apres.enfants);
  await page.evaluate(() => document.getElementById('v167-close').click());
  await page.waitForTimeout(300);
  ok('le panneau se ferme toujours', await page.evaluate(() => !document.getElementById('v167-pat').classList.contains('open')));

  section('4. Propreté');
  ok('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));

  await browser.close();
  H.killRelay(relais);
  process.exitCode = H.report(resultats);
})().catch(e => { console.error('\n[EXCEPTION] ' + (e && e.stack || e)); process.exit(3); });
