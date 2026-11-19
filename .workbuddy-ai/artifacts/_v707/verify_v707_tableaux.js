/* v707 — TABLEAUX AU LIEU DE BLOCS MONOSPACE.
   Vérifie qu'un tableau markdown enfermé dans ``` ou une structure en
   sections sortie en ```text devient un vrai <table>, que le code réel
   reste en <pre>, et que le prompt demande le format markdown.
   Contrôle négatif : build pré-v707 → module absent. */
const path = require('path');
const { chromium } = require('playwright');
const RACINE = path.resolve(process.env.BENCH_ROOT || path.resolve(__dirname, '../../..'));
const HTML = 'file:///' + path.join(RACINE, 'THEOLOGICUS.html').replace(/\\/g, '/');
let ok_n = 0, ko_n = 0;
function ok(nom, cond, detail) {
  if (cond) { ok_n++; console.log('[OK]    ' + nom + (detail ? '  -- ' + detail : '')); }
  else { ko_n++; console.log('[ECHEC] ' + nom + (detail ? '  -- ' + detail : '')); }
}
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(String(e.message)));
  await page.addInitScript(() => {
    try { localStorage.setItem('theologicus_wizard_skipped', '1'); } catch (e) {}
  });
  await page.goto(HTML, { waitUntil: 'domcontentloaded', timeout: 90000 });
  let charge = false;
  try { await page.waitForFunction(() => !!window.__v707Tableaux, null, { timeout: 45000 }); charge = true; } catch (e) {}
  ok('module v707 chargé (contrôle négatif : absent sur l’ancien build)', charge);
  if (!charge) {
    console.log('\nBANC V707 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC');
    await browser.close(); process.exit(1);
  }
  await page.waitForTimeout(1000);

  const rendu = await page.evaluate(() => {
    const structure = [
      'Passage:',
      '1 Jean 5:7-8',
      '',
      'Lecture A (plus longue - Comma Johanneum)',
      '- Car il y a trois qui témoignent dans le ciel : le Père, la Parole et le Saint-Esprit.',
      '',
      'Lecture B (plus courte)',
      '- Car il y a trois qui témoignent : l’Esprit, l’eau et le sang.',
      '',
      'Témoins Lecture A',
      '- Codex Montfortianus (1518)',
      '- Manuscrits grecs médiévaux tardifs',
      '',
      'État actuel de la recherche',
      '- ÉTABLI : le Comma Johanneum est un ajout tardif.'
    ].join('\n');
    const markdown = [
      'Critère | Lecture A | Lecture B',
      '--- | --- | ---',
      'Témoins | Montfortianus | papyrus grecs',
      'Datation | XVIe siècle | IIe–IIIe siècle'
    ].join('\n');
    const code = 'function f() {\n  const x = 2;\n  return x;\n}';
    const t1 = mdToHtml('```text\n' + structure + '\n```');
    const t2 = mdToHtml('```\n' + markdown + '\n```');
    const t3 = mdToHtml('```js\n' + code + '\n```');
    return {
      structTable: t1.indexOf('<table') !== -1 && t1.indexOf('v707-table') !== -1,
      structPre: t1.indexOf('<pre') !== -1,
      structContenu: t1.indexOf('Comma Johanneum') !== -1 && t1.indexOf('Lecture B') !== -1,
      mdTable: t2.indexOf('<table') !== -1 && t2.indexOf('Montfortianus') !== -1,
      codePre: t3.indexOf('<pre') !== -1,
      codeTable: t3.indexOf('<table') !== -1,
      css: !!document.getElementById('v707-css')
    };
  });
  ok('structure en sections rendue en tableau', rendu.structTable && !rendu.structPre, JSON.stringify({ t: rendu.structTable, pre: rendu.structPre }));
  ok('contenu du verset conservé dans le tableau', rendu.structContenu);
  ok('tableau markdown dans un bloc ``` converti aussi', rendu.mdTable);
  ok('vrai code JavaScript reste en <pre><code>', rendu.codePre && !rendu.codeTable);
  ok('feuille de style du tableau injectée', rendu.css);

  const prompt = await page.evaluate(() => {
    const p = String(buildSystemPrompt());
    return { table: p.indexOf('═══ TABLEAUX ═══') !== -1, interdit: /N’enferme JAMAIS un tableau/.test(p), pipe: p.indexOf('séparateur ---') !== -1 };
  });
  ok('prompt demande un vrai tableau markdown et interdit le bloc de code',
     prompt.table && prompt.interdit && prompt.pipe, JSON.stringify(prompt));

  const direct = await page.evaluate(() => {
    const V = window.__v707Tableaux;
    return {
      vide: V.convertir('deux lignes sans structure'),
      stats: V.stats()
    };
  });
  ok('texte sans structure n’est pas transformé', direct.vide === '');
  ok('conversion comptée pour le diagnostic', direct.stats >= 2, String(direct.stats));

  ok('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));
  console.log('\nBANC V707 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC');
  await browser.close();
  process.exit(ko_n ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
