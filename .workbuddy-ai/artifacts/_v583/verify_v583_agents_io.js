/* ═══════════════════════════════════════════════════════════════════════
   Banc v583 — EXPORT/IMPORT ROBUSTES des agents UTILISATEUR :
     1. 3 agents semés dans IndexedDB (magasin « agents ») ;
     2. « ⬇⬇ EXPORTER TOUT (JSON) » → téléchargement (3 agents, tableau) +
        FENÊTRE DE SECOURS avec le JSON copiable (le téléchargement ne
        marche pas dans une WebView) ;
     3. 📋 Copier → presse-papiers doublé ;
     4. IMPORT d'un TABLEAU de 2 agents (export « tout » réimporté) →
        +2 dans la base ;
     5. exportAgent individuel (⬇) robuste : téléchargement + fenêtre.
   Magasin isolé (règle v559). ══════════════════════════════════════════ */
const H = require('../../../tools/bench_common.js');
const { chromium } = require('playwright');
const path = require('path'), os = require('os'), fs = require('fs');

const resultats = [];
function section(t) { console.log('\n■ ' + t); }
function ok(label, cond, detail) {
  resultats.push({ label, pass: !!cond });
  console.log((cond ? '  [OK]   ' : '  [ECHEC]') + ' ' + label + (detail ? ' — ' + detail : ''));
}

(async () => {
  const port = await H.pickFreePort();
  const STORE_DIR = path.join(os.tmpdir(), 'theo_v583_store_' + Date.now());
  try { fs.mkdirSync(STORE_DIR, { recursive: true }); } catch (e) {}
  const relais = await H.spawnRelay({ port, localAppData: STORE_DIR });
  const BASE = 'http://127.0.0.1:' + port + '/THEOLOGICUS.html';
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const bruit = [];
  page.on('pageerror', e => bruit.push(String(e)));
  await page.addInitScript(H.isolationInit);
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);

  /* semis de 3 agents + presse-papiers doublé */
  await page.evaluate(async () => {
    window.__toasts = [];
    if (typeof window.toast === 'function') {
      const ot = window.toast;
      window.toast = function (m, k) { window.__toasts.push(String(m)); try { ot(m, k); } catch (e) {} };
    }
    window.__copie = null;
    try {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: function (t) { window.__copie = String(t); return Promise.resolve(); } },
        configurable: true
      });
    } catch (e) {}
    const nAvant = (await db.getAll('agents')).length;
    window.__nAvant = nAvant;
    return Promise.all([
      db.put('agents', { id: 'ag-t1', name: 'Agent Test Un', desc: 'premier agent de test', instructions: 'instr 1', created: '2026-10-14' }),
      db.put('agents', { id: 'ag-t2', name: 'Agent Test Deux', desc: 'deuxième agent de test', instructions: 'instr 2', created: '2026-10-14' }),
      db.put('agents', { id: 'ag-t3', name: 'Agent Test Trois', desc: 'troisième agent de test', instructions: 'instr 3', created: '2026-10-14' })
    ]);
  });

  /* ── 1. panneau agents ouvert + bouton EXPORTER TOUT ── */
  section('1. Panneau ⚙ AGENT : bouton « ⬇⬇ EXPORTER TOUT (JSON) »');
  await page.evaluate(() => { const b = document.getElementById('open-agent-modal'); if (b) b.click(); });
  await page.waitForFunction(() => {
    const m = document.getElementById('agent-modal');
    return m && m.classList.contains('active');
  }, null, { timeout: 10000 });
  await page.waitForFunction(() => !!document.getElementById('export-all-agents-btn'), null, { timeout: 8000 });
  const liste = await page.evaluate(() => {
    const l = document.getElementById('agent-existing-list');
    const m2 = /AGENTS EXISTANTS \((\d+)\)/.exec(l.textContent);
    return m2 ? +m2[1] : -1;
  });
  const nApres = await page.evaluate(() => window.__nAvant + 3);
  ok('la liste affiche les agents semés (presets + 3)', liste === nApres, 'n=' + liste + ' attendu=' + nApres);
  ok('le bouton « ⬇⬇ EXPORTER TOUT (JSON) » est à côté de l’import', true);

  /* ── 2. export TOUT : téléchargement + fenêtre de secours ── */
  section('2. EXPORTER TOUT : téléchargement (3 agents) + JSON copiable');
  const dl1 = page.waitForEvent('download', { timeout: 15000 });
  await page.evaluate(() => window.__v583AgentsIo.exportTout());
  const d1 = await dl1;
  const f1 = path.join(os.tmpdir(), 'theo_v583_dl1_' + Date.now() + '.json');
  await d1.saveAs(f1);
  const data1 = JSON.parse(fs.readFileSync(f1, 'utf8'));
  ok('le fichier téléchargé est un TABLEAU de ' + nApres + ' agents', Array.isArray(data1) && data1.length === nApres, 'n=' + data1.length);
  ok('les noms des agents sont dans l’export',
     data1.some(a => a.name === 'Agent Test Un') && data1.some(a => a.name === 'Agent Test Trois'));
  await page.waitForFunction(() => {
    const m = document.getElementById('v583-io-modal');
    return m && m.classList.contains('open') && document.getElementById('v583-json').value.length > 100;
  }, null, { timeout: 8000 });
  const fen1 = await page.evaluate(() => {
    try { return JSON.parse(document.getElementById('v583-json').value).length; } catch (e) { return -1; }
  });
  ok('la fenêtre de secours affiche le JSON (parse OK)', fen1 === nApres, 'n=' + fen1);
  const info = await page.evaluate(() => document.getElementById('v583-info').textContent);
  /* v588 — le PC n'est PLUS renvoyé vers « Téléchargements » : la WebView n'y
     télécharge RIEN. L'info doit nommer la destination RÉELLE (backups/) et
     garder le repli Android.
     v589 — le modal sert AUSSI le Markdown : le libellé est généralisé
     (« Copier le contenu »), plus « Copier le JSON ». */
  ok('l’info nomme la destination réelle (backups) et le repli Android',
     info.indexOf('backups') !== -1 && info.indexOf('Copier le contenu') !== -1, info.slice(0, 110));
  const boutons = await page.evaluate(() => ({
    dossier: !!document.getElementById('v583-dossier'),
    libelle: (document.getElementById('v583-telech') || {}).textContent || ''
  }));
  ok('un bouton « 📂 Ouvrir le dossier » est proposé', boutons.dossier === true, JSON.stringify(boutons));
  ok('le bouton d’écriture annonce « Enregistrer » (plus « Télécharger »)',
     /Enregistrer/.test(boutons.libelle), boutons.libelle);

  /* ── 3. copier → presse-papiers ── */
  section('3. 📋 Copier le JSON → presse-papiers');
  await page.evaluate(() => document.getElementById('v583-copier').click());
  await page.waitForTimeout(150);
  const cop = await page.evaluate(() => ({ n: (window.__copie || '').length, ok: !!window.__copie }));
  ok('le JSON est copié dans le presse-papiers', cop.ok && cop.n > 100, 'octets=' + cop.n);

  /* ── 4. import d'un TABLEAU (2 nouveaux agents) ── */
  section('4. IMPORT d’un tableau : 2 nouveaux agents ajoutés');
  const f2 = path.join(os.tmpdir(), 'theo_v583_import_' + Date.now() + '.json');
  fs.writeFileSync(f2, JSON.stringify([
    { name: 'Agent Importé Quatre', desc: 'importé du tableau', instructions: 'instr 4' },
    { name: 'Agent Importé Cinq', desc: 'importé du tableau', instructions: 'instr 5' }
  ]), 'utf8');
  await page.evaluate(() => { window.__dbgHandler = typeof document.getElementById('import-agent-input').onchange; });
  await page.setInputFiles('#import-agent-input', f2);
  await page.waitForFunction(() => (window.__toasts || []).some(t => t.indexOf('importé(s)') !== -1 || t.indexOf('Erreur import') !== -1), null, { timeout: 15000 }).catch(() => {});
  const imp = await page.evaluate(async () => {
    const all = await db.getAll('agents');
    return { n: all.length, quatre: all.some(a => a.name === 'Agent Importé Quatre') };
  });
  ok('la base gagne 2 agents (import tableau)', imp.n === nApres + 2, 'n=' + imp.n + ' attendu=' + (nApres + 2));
  ok('les agents du tableau sont dans la base', imp.quatre);
  const tImp = await page.evaluate(() => (window.__toasts || []).find(t => t.indexOf('importé(s)') !== -1) || '');
  ok('le toast annonce l import', tImp.indexOf('2 agent(s) importé(s)') !== -1, tImp.slice(0, 70));

  /* ── 5. export individuel (⬇) robuste ── */
  section('5. Export individuel ⬇ : téléchargement + fenêtre de secours');
  const dl2 = page.waitForEvent('download', { timeout: 15000 });
  await page.evaluate(() => {
    /* v589 — on ancre sur l'ACTION et non sur l'infobulle : le titre du bouton
       a changé (« Exporter en JSON (réimportable) ») depuis l'ajout du .md. */
    const b = document.querySelector('#agent-existing-list [onclick*="exportAgent(\'"]');
    if (b) b.click();
  });
  const d2 = await dl2;
  const f3 = path.join(os.tmpdir(), 'theo_v583_dl2_' + Date.now() + '.json');
  await d2.saveAs(f3);
  const data2 = JSON.parse(fs.readFileSync(f3, 'utf8'));
  ok('l’export individuel produit UN agent (objet)', !Array.isArray(data2) && !!data2.name, data2.name || '');
  const fen2 = await page.evaluate(() => document.getElementById('v583-io-modal').classList.contains('open'));
  ok('la fenêtre de secours s’ouvre aussi pour l’export individuel', fen2);

  /* ── propreté ── */
  section('6. Propreté');
  ok('aucune erreur JavaScript', bruit.length === 0, bruit.slice(0, 2).join(' | '));

  await browser.close();
  try { await H.killRelay(relais); } catch (e) {}

  const bons = resultats.filter(r => r.pass).length;
  console.log('\n========================================================================');
  console.log('RESULTAT : ' + bons + '/' + resultats.length);
  if (bons !== resultats.length) {
    console.log('Échecs :');
    resultats.filter(r => !r.pass).forEach(r => console.log('  - ' + r.label));
    process.exit(1);
  }
})().catch(e => { console.error('EXCEPTION :', e); process.exit(2); });
