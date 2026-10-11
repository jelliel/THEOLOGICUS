// Banc v554 — AGENTS THÉOLOGIQUES (v527) : 20 presets + masquage par agent.
//
// v554 : (a) la bibliothèque passe de 8 à 20 agents théologiques (thomiste,
// augustinien, liturgiste, conciles, talmudiste, coranologue, orientaux,
// réforme, mystique, archéologue, traducteur, moraliste) ; (b) chaque carte
// du panneau AGENTS porte un toggle 👁 Masquer/Réafficher qui persiste le
// champ `desactive` du store IndexedDB `agents` et EXCLUT l'agent du
// sélecteur #agent-select (garde ajoutée dans loadAgents), sauf s'il est
// l'agent actif de la conversation.
//
// Contrat testé ici :
//   1. le panneau AGENTS s'ouvre par le bouton HUD (#open-presets, barre) ;
//   2. les 20 pré-réglés s'installent (seme non destructif) et se listent ;
//   3. 👁 Masquer → champ desactive=true + carte marquée + agent ABSENT du
//      sélecteur ; 👁 Réafficher → retour dans le sélecteur, champ nettoyé ;
//   4. Activer équipe la conversation (state.agent) — comportement v527
//      inchangé ;
//   5. l'agent ACTIF masqué reste néanmoins dans le sélecteur (garde).
//
// Usage : node verify_v554_agents.js

const H = require('../../../tools/bench_common.js');
const { chromium } = require('playwright');

const resultats = [];
function ok(nom, cond, detail) {
  resultats.push([!!cond, nom, detail === undefined ? '' : String(detail)]);
  console.log(`  ${cond ? '[OK]  ' : '[ECHEC]'} ${nom}${detail !== undefined ? '  -- ' + detail : ''}`);
  return !!cond;
}
function section(t) { console.log('\n' + t); }

const NOUVEAUX = ['preset-thomiste', 'preset-augustinien', 'preset-liturgiste', 'preset-conciles',
  'preset-talmudiste', 'preset-coranolog', 'preset-orientaux', 'preset-reforme',
  'preset-mystique', 'preset-archeologue', 'preset-traducteur', 'preset-moraliste'];
const ANCIENS = ['preset-exegete', 'preset-patristique', 'preset-langues', 'preset-islam',
  'preset-canoniste', 'preset-historien', 'preset-apologete', 'preset-catechiste'];

(async () => {
  console.log('='.repeat(72));
  console.log('BANC v554 — AGENTS THÉOLOGIQUES (v527) : 20 PRÉSETS + TOGGLE MASQUER');
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
  const BRUIT = /version\.txt|Failed to load resource|net::ERR|Failed to fetch|401|403|404|Unauthorized|\[corpus\]|jspdf|html2canvas/i;
  page.on('pageerror', e => erreurs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !BRUIT.test(m.text())) erreurs.push('console: ' + m.text()); });
  page.on('dialog', d => d.accept());

  await page.addInitScript(H.isolationInit);

  section('1. Ouverture de l\'application + panneau AGENTS (HUD)');
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(() => { const ov = document.getElementById('setup-wizard-overlay'); if (ov) { ov.classList.remove('active'); ov.style.display = 'none'; } }).catch(() => {});
  await page.waitForTimeout(1200);
  ok('l\'API du module v527 est exposée', await page.evaluate(() => !!window.__v527Agents && Array.isArray(window.__v527Agents.presets)));
  ok('la bibliothèque contient 20 pré-réglés (8 + 12 v554)',
     await page.evaluate(() => window.__v527Agents.presets.length === 20),
     await page.evaluate(() => window.__v527Agents.presets.length));
  await page.click('#open-presets');
  await page.waitForFunction(() => {
    const p = document.getElementById('v527-panel');
    return p && p.classList.contains('open');
  }, { timeout: 15000 });
  await page.waitForFunction(() => {
    const l = document.getElementById('v527-l');
    return l && l.querySelectorAll('.it').length >= 20;
  }, { timeout: 20000 });
  const etat = await page.evaluate(() => ({
    cartes: document.querySelectorAll('#v527-l .it').length,
    st: (document.getElementById('v527-st') || {}).textContent || ''
  }));
  ok('les 20 cartes d\'agents sont rendues', etat.cartes === 20, 'cartes=' + etat.cartes);
  ok('l\'installation est complète (« ' + etat.st + ' »)', etat.st.indexOf('20 / 20') !== -1, etat.st);

  section('2. Les 12 nouveaux agents théologiques sont présents');
  const idsPresents = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#v527-l [data-act]')).map(b => b.dataset.act));
  const nouveauxPresents = NOUVEAUX.filter(id => idsPresents.indexOf(id) !== -1);
  const anciensPresents = ANCIENS.filter(id => idsPresents.indexOf(id) !== -1);
  ok('12 nouveaux (thomiste, augustinien, liturgiste, conciles, talmudiste, coranologue, orientaux, réforme, mystique, archéologue, traducteur, moraliste)',
     nouveauxPresents.length === NOUVEAUX.length, nouveauxPresents.length + '/12');
  ok('les 8 anciens sont toujours là', anciensPresents.length === ANCIENS.length, anciensPresents.length + '/8');
  const noms = await page.evaluate(() => document.getElementById('v527-l').textContent);
  ok('les noms sont lisibles (Thomiste, Coranologue, Talmudiste, Moraliste…)',
     /Thomiste/.test(noms) && /Coranologue/.test(noms) && /Talmudiste/.test(noms) && /Moraliste/.test(noms));

  section('3. 👁 MASQUER — persiste dans le store et sort du sélecteur');
  const avant = await page.evaluate(() => {
    const sel = document.getElementById('agent-select');
    return Array.from(sel.options).map(o => o.value).filter(Boolean);
  });
  ok('le sélecteur contient les agents installés avant le test', avant.indexOf('preset-canoniste') !== -1,
     avant.length + ' options');
  await page.click('[data-toggle="preset-canoniste"]');
  await page.waitForTimeout(600);
  const apresMasque = await page.evaluate(async () => {
    const ag = await db.get('agents', 'preset-canoniste');
    const sel = document.getElementById('agent-select');
    return { desactive: !!(ag && ag.desactive),
             dansSelect: Array.from(sel.options).some(o => o.value === 'preset-canoniste'),
             carte: !!document.querySelector('#v527-l .it.masque') };
  });
  ok('le champ desactive est persisté dans le store agents', apresMasque.desactive === true);
  ok('l\'agent a DISPARU du sélecteur #agent-select', apresMasque.dansSelect === false);
  ok('la carte est marquée « masqué » (état + badge)', apresMasque.carte);

  section('4. 👁 RÉAFFICHER — retour dans le sélecteur, champ nettoyé');
  await page.click('[data-toggle="preset-canoniste"]');
  await page.waitForTimeout(600);
  const apresRetour = await page.evaluate(async () => {
    const ag = await db.get('agents', 'preset-canoniste');
    const sel = document.getElementById('agent-select');
    return { desactive: !!(ag && ag.desactive),
             dansSelect: Array.from(sel.options).some(o => o.value === 'preset-canoniste') };
  });
  ok('le champ desactive est nettoyé', apresRetour.desactive === false);
  ok('l\'agent est de retour dans le sélecteur', apresRetour.dansSelect === true);

  section('5. ACTIVER — comportement v527 inchangé');
  await page.click('[data-act="preset-thomiste"]');
  await page.waitForTimeout(600);
  const activeState = await page.evaluate(() => {
    /* state est une liaison lexicale globale (const) : pas une propriété de window */
    const st = (typeof state !== 'undefined') ? state : window.state;
    return { actif: !!(st && st.agent && st.agent.id === 'preset-thomiste'),
             nom: st && st.agent ? st.agent.name : '' };
  });
  ok('Activer équipe la conversation (state.agent = preset-thomiste)',
     activeState.actif, activeState.nom);

  section('6. L\'agent ACTIF masqué reste au sélecteur (garde v554)');
  await page.click('[data-toggle="preset-thomiste"]');
  await page.waitForTimeout(600);
  const garde = await page.evaluate(() => {
    const st = (typeof state !== 'undefined') ? state : window.state;
    const sel = document.getElementById('agent-select');
    const ag = (st && st.agent) || {};
    return { dansSelect: Array.from(sel.options).some(o => o.value === 'preset-thomiste'),
             toujoursActif: ag.id === 'preset-thomiste' };
  });
  ok('masquer l\'agent actif ne le retire PAS du sélecteur (garde)', garde.dansSelect);
  ok('il reste l\'agent actif de la conversation', garde.toujoursActif);
  await page.click('[data-toggle="preset-thomiste"]');   /* nettoyage : réafficher */
  await page.waitForTimeout(500);

  section('7. Propreté');
  ok('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));

  await browser.close();
  H.killRelay(relais);
  process.exitCode = H.report(resultats);
})().catch(e => { console.error('\n[EXCEPTION] ' + (e && e.stack || e)); process.exit(3); });
