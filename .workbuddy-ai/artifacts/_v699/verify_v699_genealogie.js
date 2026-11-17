/* v699 — GÉNÉALOGIE PARCHEMIN INTERACTIVE DANS LES SCHÉMAS.

   Contrôles :
     - le module est chargé et expose son API ;
     - une carte généalogique est RECONNUE (et une carte quelconque ne l'est pas) ;
     - la transformation produit 3 sections, 2 branches, 100 noms ;
     - la barre vit DANS la carte, jamais dans .header-controls (v597/v598) ;
     - recherche, filtre, fiche, pliage, fermeture, RETOUR fonctionnent ;
     - les outils v83 (NUIT / ZOOM / SVG) restent opérationnels ;
     - l'auto-transformation par MutationObserver fonctionne ;
     - aucune erreur JS.

   Contrôle négatif : BENCH_ROOT pointe un build sans v699 — le module
   n'existe pas, le banc ÉCHOUEE (il ne plante pas) sur la bonne raison.
*/
const path = require('path');
const { chromium } = require('playwright');
const RACINE = path.resolve(process.env.BENCH_ROOT || path.resolve(__dirname, '../../..'));
const HTML = 'file:///' + path.join(RACINE, 'THEOLOGICUS.html').replace(/\\/g, '/');
let ok_n = 0, ko_n = 0;
function ok(nom, cond, detail) {
  if (cond) { ok_n++; console.log('[OK]    ' + nom + (detail ? '  -- ' + detail : '')); }
  else { ko_n++; console.log('[ECHEC] ' + nom + (detail ? '  -- ' + detail : '')); }
}
const nul = x => (x === null || x === undefined);

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(String(e.message)));
  await page.addInitScript(() => {
    try { localStorage.setItem('theologicus_wizard_skipped', '1'); } catch (e) {}
    try { sessionStorage.setItem('theologicus_auth', 'true'); } catch (e) {}
  });
  await page.goto(HTML, { waitUntil: 'domcontentloaded', timeout: 90000 });

  let charge = false;
  try { await page.waitForFunction(() => !!window.__v699Genealogie, null, { timeout: 45000 }); charge = true; } catch (e) {}
  ok('module v699 chargé (contrôle négatif : absent sur l’ancien build)', charge);
  if (!charge) {
    console.log('\nBANC V699 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC');
    await browser.close(); process.exit(1);
  }

  const noms = ['David','Nathan','Salomon','Jessé','Jésus','Joseph','Booz','Obed'];
  /* La carte est semée DÉTACHÉE : on teste estGenealogie/traiter avant que
     l'observateur ne la voie, sinon la transformationauto gagne la course
     et les valeurs de retour deviennent fausses à tort. */
  const seme = await page.evaluate((args) => {
    const d = document.createElement('div');
    d.className = 'message-content v699-banc';
    d.innerHTML = '<div class="schema-card v699-banc-a"><div class="schema-layer schema-tree">'
      + args.map(n => '<div class="schema-box"><b>' + n + '</b></div>').join('')
      + '</div></div><div class="schema-card v699-banc-b"><div class="schema-layer schema-tree">'
      + ['Pierre','Paul','Marc','Jean'].map(n => '<div class="schema-box"><b>' + n + '</b></div>').join('')
      + '</div></div>';
    const a = d.querySelector('.v699-banc-a'), b = d.querySelector('.v699-banc-b');
    const boxesA = a ? a.querySelectorAll('.schema-box').length : 0;
    const oui = window.__v699Genealogie.estGenealogie(a);
    const non = window.__v699Genealogie.estGenealogie(b);
    const r = window.__v699Genealogie.traiter(a);
    document.body.appendChild(d);
    return { a: !!a, b: !!b, boxesA: boxesA, oui: oui, non: non, r: r,
      classe: a.className, data: a.getAttribute('data-v699'),
      sections: a.querySelectorAll('.schema-v699-sec').length,
      colonnes: a.querySelectorAll('.schema-v699-cols').length,
      branches: a.querySelectorAll('.schema-v699-br').length,
      personnes: a.querySelectorAll('.schema-v699-pers').length,
      barre: !!a.querySelector('.schema-tools.v699-bar'),
      header: !!document.querySelector('.header-controls .v699-search') };
  }, noms);
  ok('prémissse : les deux cartes sont semées (aucun test à vide)', seme.a && seme.b && seme.boxesA === 8, JSON.stringify({a:seme.a,b:seme.b,boxesA:seme.boxesA}));
  if (!seme.a || !seme.b) { await browser.close(); process.exit(1); }
  ok('une généalogie est reconnue', seme.oui === true);
  ok('un schéma quelconque n’est pas transformé', seme.non === false);
  ok('transformation appliquée', seme.r === true && seme.classe.indexOf('v699-genealogie') !== -1 && seme.data === '1');
  ok('structure cible : 3 sections / 2 colonnes / 2 branches / 100 noms',
    seme.sections === 3 && seme.colonnes === 2 && seme.branches === 2 && seme.personnes === 100,
    JSON.stringify(seme));
  ok('barre d’outils DANS la carte, jamais dans .header-controls', seme.barre === true && seme.header === false);

  const sources = await page.evaluate(() => {
    const t = document.querySelector('.v699-banc-a').textContent;
    return ['Abraham','David','Salomon','Nathan','Jésus'].every(n => t.indexOf(n) !== -1);
  });
  ok('données complètes présentées (Abraham, David, Salomon, Nathan, Jésus)', sources);

  await page.locator('.v699-banc-a .v699-search').fill('Nathan');
  const recherche = await page.evaluate(() => {
    const c = document.querySelector('.v699-banc-a');
    return { trouves: c.querySelectorAll('.schema-v699-pers.trouve').length,
             dims: c.querySelectorAll('.schema-v699-pers.dim').length,
             compte: (c.querySelector('.schema-v699-compte') || {}).textContent || '' };
  });
  ok('recherche : correspondances trouvées et autres estompées',
    recherche.trouves >= 1 && recherche.dims > 0 && /trouv/.test(recherche.compte), JSON.stringify(recherche));
  await page.locator('.v699-banc-a .v699-search').fill('');

  await page.locator('.v699-banc-a .v699-filtre[data-f="nathan"]').click();
  const filtre = await page.evaluate(() => {
    const c = document.querySelector('.v699-banc-a');
    return { salomonMasque: c.querySelector('.schema-v699-br.salomon').classList.contains('masque'),
             nathanVisible: !c.querySelector('.schema-v699-br.nathan').classList.contains('masque'),
             pressed: c.querySelector('.v699-filtre[data-f="nathan"]').getAttribute('aria-pressed') };
  });
  ok('filtre NATHAN : Salomon masqué, Nathan visible', filtre.salomonMasque && filtre.nathanVisible && filtre.pressed === 'true', JSON.stringify(filtre));
  await page.locator('.v699-banc-a .v699-filtre[data-f="all"]').click();

  await page.locator('.v699-banc-a .schema-v699-pers[data-nom="David"]').first().click();
  const fiche = await page.evaluate(() => {
    const p = document.querySelector('.v699-banc-a .schema-v699-fiche');
    return { visible: p && !p.hidden, texte: p ? p.textContent : '' };
  });
  ok('clic sur un nom ouvre sa fiche', fiche.visible && /Roi d’Israël/.test(fiche.texte));

  await page.locator('.v699-banc-a .v699-fermer').click();
  const ferme = await page.evaluate(() => document.querySelector('.v699-banc-a .schema-v699-fiche').hidden);
  ok('la fiche se referme', ferme === true);

  await page.locator('.v699-banc-a .schema-v699-sec > h3').first().click();
  const plie = await page.evaluate(() => {
    const s = document.querySelector('.v699-banc-a .schema-v699-sec');
    return { plie: s.classList.contains('plie'),
             cache: getComputedStyle(s.querySelector('.schema-v699-corps')).display === 'none' };
  });
  ok('section repliable', plie.plie && plie.cache, JSON.stringify(plie));
  await page.locator('.v699-banc-a .schema-v699-sec > h3').first().click();

  const outils = await page.evaluate(() => {
    const c = document.querySelector('.v699-banc-a');
    return ['schema-svg','schema-zoom','schema-night'].every(k => !!c.querySelector('.schema-tool.' + k));
  });
  ok('outils v83 conservés (SVG / ZOOM / NUIT)', outils);

  await page.locator('.v699-banc-a .schema-tool.schema-night').click();
  const nuit = await page.evaluate(() => document.querySelector('.v699-banc-a').classList.contains('schema-night'));
  ok('bascule nuit v83 toujours active sur la carte', nuit === true);
  await page.locator('.v699-banc-a .schema-tool.schema-night').click();

  await page.locator('.v699-banc-a .schema-tool.schema-zoom').click();
  const zoom = await page.evaluate(() => !!document.querySelector('.schema-zoom-overlay'));
  ok('zoom plein écran v83 toujours actif', zoom === true);
  await page.keyboard.press('Escape');
  const zoomFerme = await page.evaluate(() => !document.querySelector('.schema-zoom-overlay'));
  ok('zoom se referme par Échap', zoomFerme === true);

  const retour = await page.evaluate(() => {
    const c = document.querySelector('.v699-banc-a');
    c.querySelector('.v699-retour').click();
    return { classe: c.className, data: c.getAttribute('data-v699'),
             boxes: c.querySelectorAll('.schema-box').length,
             reste: c.querySelectorAll('.schema-v699-pers').length };
  });
  ok('RETOUR restitue le schéma d’origine',
    retour.classe.indexOf('v699-genealogie') === -1 && !retour.data && retour.boxes === 8 && retour.reste === 0,
    JSON.stringify(retour));

  const auto = await page.evaluate(() => new Promise(res => {
    const d = document.createElement('div');
    d.innerHTML = '<div class="schema-card v699-banc-c"><div class="schema-layer schema-tree">'
      + ['David','Jésus','Nathan','Salomon','Joseph','Booz'].map(n => '<div class="schema-box"><b>'+n+'</b></div>').join('')
      + '</div></div>';
    document.body.appendChild(d);
    const c = d.querySelector('.v699-banc-c');
    let n = 0;
    const t = setInterval(() => {
      n++;
      if (c.classList.contains('v699-genealogie') || n > 40) { clearInterval(t); res(c.classList.contains('v699-genealogie')); }
    }, 100);
  }));
  ok('auto-transformation des nouvelles cartes (MutationObserver)', auto === true);

  ok('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));
  console.log('\nBANC V699 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC');
  await browser.close();
  process.exit(ko_n ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
