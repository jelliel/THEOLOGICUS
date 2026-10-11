// Banc v548 — HEADER : plus aucune modale inatteignable.
//
// Défaut corrigé (v548) : .header-controls empile ses commandes en
// flex-wrap:nowrap + overflow:hidden. Dans une fenêtre normale (1280 px),
// la rangée fait ~1700 px : tout ce qui dépassait ~600 px était ROGNÉ sans
// recours (open-dossier, open-notes, open-ta-sujets, open-gsearch,
// open-diag, open-rapid, open-corbeille, open-presets, boutons Atelier et
// Média…) — les modales correspondantes étaient inatteignables à la souris.
// Correctif : overflow-x:auto (barre fine) + module v548-header-scroll
// (molette → défilement horizontal, sans voler le geste vertical).
//
// ARCHITECTURE RÉELLE (v6 + v155 + v159) : les 32 boutons de modale/action
// sont répartis par conception entre QUATRE foyers :
//   • BARRE        (.header-controls, dans #v6-topbar) — 12 modales ;
//   • MENU-V6      (#v6-more-menu, ouvert par le bouton ⋯) — 10 modales
//                  + new-chat / compress / clears ;
//   • ATELIER      (#v155-atelier-panel, bouton ✨ ATELIER) — 6 modales ;
//   • MÉDIA        (#v159-media-panel, bouton 🎬 MEDIA) — 2 modales.
// Le banc prouve le contrat complet :
//   A. aucune modale n'est PERDUE (chaque id existe dans l'un des foyers) ;
//   B. la BARRE défile : chaque contrôle, porté par scrollIntoViewIfNeeded
//      (le mécanisme d'un clic), atterrit dans la zone visible (tolérance
//      2 px : arrondis flex sous-pixel mesurés) ;
//   C. la molette fait défiler la barre jusqu'à la dernière commande ;
//   D. les trois MENUS s'ouvrent et montrent toutes leurs modales.
//
// Usage : node verify_v548_header_scroll.js

const H = require('../../../tools/bench_common.js');
const { chromium } = require('playwright');

const resultats = [];
function ok(nom, cond, detail) {
  resultats.push([!!cond, nom, detail === undefined ? '' : String(detail)]);
  console.log(`  ${cond ? '[OK]  ' : '[ECHEC]'} ${nom}${detail !== undefined ? '  -- ' + detail : ''}`);
  return !!cond;
}
function section(t) { console.log('\n' + t); }

/* répartition par conception (v6 / v155 / v159 / v550) */
const MODALES_BARRE = [
  'open-palette', 'open-gsearch', 'open-diag', 'open-rapid',
  'open-corbeille', 'open-presets'
];
const MODALES_MENU_V6 = [
  'open-api-modal', 'open-agent-modal', 'open-data-modal',
  'open-settings-modal', 'open-hermes-modal', 'open-archives-desktop',
  'open-stats-modal', 'export-word-btn'
];
const MODALES_ATELIER = [
  'open-gauge-modal', 'open-duel-modal', 'open-trad-modal',
  'open-homelie-modal', 'open-lectio-modal', 'open-semsearch-modal'
];
const MODALES_MEDIA = ['open-studio-modal', 'open-aivideo-modal'];
/* v550 — retirées du header À LA DEMANDE : déjà accessibles via la PALETTE
   (v535 indexe tous les button.hud-btn du document et lance par el.click(),
   même sur des boutons cachés). Conteneur caché #v550-modales-palette. */
const MODALES_CACHEES = [
  'open-conseil', 'open-sources', 'open-concordance', 'open-themes',
  'open-dossier', 'open-notes', 'open-ta-sujets'
];
const TOUTES = [].concat(MODALES_BARRE, MODALES_MENU_V6, MODALES_ATELIER, MODALES_MEDIA, MODALES_CACHEES);

(async () => {
  console.log('='.repeat(72));
  console.log('BANC v548 — HEADER : TOUTES LES MODALES ATTEIGNABLES (barre + 3 menus)');
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
  /* 1280×800 : largeur de bureau courante — la rangée y déborde à coup sûr,
     ce qui reproduit le défaut signalé. */
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
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
  await page.waitForTimeout(1500);

  section('2. La barre défile au lieu de rogner (correctif v548)');
  const etat = await page.evaluate(() => {
    const bar = document.querySelector('.header-controls');
    if (!bar) return null;
    const cs = getComputedStyle(bar);
    return {
      overflowX: cs.overflowX,
      scrollWidth: bar.scrollWidth,
      clientWidth: bar.clientWidth,
      deborde: bar.scrollWidth > bar.clientWidth,
      moduleActif: !!(window.__v548HeaderScroll && window.__v548HeaderScroll.barre === bar)
    };
  });
  ok('la barre .header-controls existe', !!etat);
  ok('overflow-x calculé = auto (au lieu de hidden)', etat && etat.overflowX === 'auto', etat && etat.overflowX);
  ok('la rangée déborde réellement à 1280 px (cas corrigé)', etat && etat.deborde,
     etat ? ('scrollWidth=' + etat.scrollWidth + ' clientWidth=' + etat.clientWidth) : '-');
  ok('le module v548-header-scroll est actif sur la barre', etat && etat.moduleActif);

  section('3. Aucune modale perdue : chacune existe dans l\'un des 5 foyers');
  const foyerDe = await page.evaluate((ids) => {
    const bar = document.querySelector('.header-controls');
    const menu = document.getElementById('v6-more-menu');
    const at = document.getElementById('v155-atelier-panel');
    const md = document.getElementById('v159-media-panel');
    const ca = document.getElementById('v550-modales-palette');
    const out = {};
    for (const id of ids) {
      const e = document.getElementById(id);
      out[id] = !e ? 'ABSENT'
        : (bar && bar.contains(e)) ? 'BARRE'
        : (menu && menu.contains(e)) ? 'MENU-V6'
        : (at && at.contains(e)) ? 'ATELIER'
        : (md && md.contains(e)) ? 'MEDIA'
        : (ca && ca.contains(e)) ? 'CACHEES' : 'AUTRE';
    }
    return out;
  }, TOUTES);
  const absents = TOUTES.filter(id => foyerDe[id] === 'ABSENT');
  const egares = TOUTES.filter(id => foyerDe[id] === 'AUTRE');
  ok('les ' + TOUTES.length + ' boutons de modale existent tous', absents.length === 0 && egares.length === 0,
     (absents.length ? 'ABSENTS : ' + absents.join(', ') + ' ' : '') + (egares.length ? 'ÉGARÉS : ' + egares.join(', ') : 'répartition intacte'));
  const parFoyer = {};
  TOUTES.forEach(id => { parFoyer[foyerDe[id]] = (parFoyer[foyerDe[id]] || 0) + 1; });
  ok('répartition conforme (6 barre / 8 menu-v6 / 6 atelier / 2 média / 7 cachées-palette)',
     parFoyer['BARRE'] === MODALES_BARRE.length && parFoyer['MENU-V6'] === MODALES_MENU_V6.length &&
     parFoyer['ATELIER'] === MODALES_ATELIER.length && parFoyer['MEDIA'] === MODALES_MEDIA.length &&
     parFoyer['CACHEES'] === MODALES_CACHEES.length,
     JSON.stringify(parFoyer));
  const cacheesHorsVue = await page.evaluate((ids) => {
    return ids.every(id => {
      const e = document.getElementById(id);
      if (!e) return false;
      const r = e.getBoundingClientRect();
      const container = document.getElementById('v550-modales-palette');
      return container.contains(e) && getComputedStyle(container).display === 'none';
    });
  }, MODALES_CACHEES);
  ok('les 7 modales retirées sont hors du header ET hors de la vue', cacheesHorsVue);

  section('4. ⭐ Barre : chaque contrôle atterrit dans la zone visible');
  /* scrollIntoViewIfNeeded = le mécanisme exact d'un clic Playwright. */
  const controles = await page.$$('.header-controls button, .header-controls select');
  let rognes = [];
  for (const el of controles) {
    const id = await el.evaluate(e => e.id || e.className || '(sans id)');
    try { await el.scrollIntoViewIfNeeded(); } catch (e) { rognes.push(id + ' (exception)'); continue; }
    const dansZone = await el.evaluate(e => {
      const bar = document.querySelector('.header-controls');
      const r = e.getBoundingClientRect(), b = bar.getBoundingClientRect();
      return r.left >= b.left - 2 && r.right <= b.right + 2 && r.width > 0;  /* ±2 px : arrondis flex sous-pixel */
    });
    if (!dansZone) rognes.push(id);
  }
  ok('les ' + controles.length + ' contrôles de la barre sont atteignables',
     rognes.length === 0, rognes.length ? 'rognés : ' + rognes.join(', ') : 'aucun rogné');

  section('5. La molette fait défiler la rangée (module v548)');
  const molette = await page.evaluate(() => {
    const bar = document.querySelector('.header-controls');
    bar.scrollLeft = 0;
    bar.dispatchEvent(new WheelEvent('wheel', { deltaY: 240, deltaX: 0, bubbles: true, cancelable: true }));
    return bar.scrollLeft;
  });
  ok('un coup de molette déplace la rangée', molette > 0, 'scrollLeft=' + molette);
  const finAtteinte = await page.evaluate(() => {
    const bar = document.querySelector('.header-controls');
    for (let i = 0; i < 40; i++) bar.dispatchEvent(new WheelEvent('wheel', { deltaY: 240, bubbles: true, cancelable: true }));
    const last = document.getElementById('v159-media-btn') || bar.lastElementChild;
    if (!last) return false;
    const r = last.getBoundingClientRect(), b = bar.getBoundingClientRect();
    return r.left >= b.left - 2 && r.right <= b.right + 2;
  });
  ok('à coups de molette, la DERNIÈRE commande de la barre devient visible', finAtteinte);
  const retour = await page.evaluate(() => {
    const bar = document.querySelector('.header-controls');
    bar.scrollLeft = 0;
    const first = document.getElementById('open-palette');
    if (!first) return false;
    const r = first.getBoundingClientRect(), b = bar.getBoundingClientRect();
    return r.left >= b.left - 2 && r.right <= b.right + 2;
  });
  ok('retour au début : PALETTE redevient visible à scrollLeft=0', retour);

  section('6. Les trois menus montrent toutes leurs modales');
  /* ── menu ⋯ (v6) ── */
  const menuV6 = await (async () => {
    const btn = await page.$('#v6-right-grp button[title="Plus d actions"]');
    if (!btn) return { erreur: 'bouton ⋯ introuvable' };
    await btn.click();
    await page.waitForTimeout(250);
    const res = await page.evaluate((ids) => {
      const menu = document.getElementById('v6-more-menu');
      if (!menu || !menu.classList.contains('open')) return { erreur: 'menu non ouvert' };
      const ratees = [];
      for (const id of ids) {
        const e = document.getElementById(id);
        if (!e) { ratees.push(id + ' (absent)'); continue; }
        e.scrollIntoViewIfNeeded();
        const r = e.getBoundingClientRect();
        const visible = r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight &&
                        r.right > 0 && r.left < window.innerWidth;
        if (!visible) ratees.push(id);
      }
      return { ratees: ratees };
    }, MODALES_MENU_V6);
    await page.evaluate(() => document.body.click());
    await page.waitForTimeout(150);
    return res;
  })();
  ok('menu ⋯ : toutes les modales du menu sont visibles une fois ouvert',
     !menuV6.erreur && menuV6.ratees && menuV6.ratees.length === 0,
     menuV6.erreur || (menuV6.ratees && menuV6.ratees.length ? 'invisibles : ' + menuV6.ratees.join(', ') : (MODALES_MENU_V6.length + ' visibles')));

  /* ── menu ✨ ATELIER (v155) ──
     ⚠️ v155 ferme son panneau sur TOUT scroll (window scroll capture) et le
     chat auto-défile en arrière-plan : on vérifie la visibilité IMMÉDIATEMENT
     après le clic (c'est ce que voit l'utilisateur), sans attendre. */
  const atelier = await (async () => {
    const btn = await page.$('#v155-atelier-btn');
    if (!btn) return { erreur: 'bouton ATELIER introuvable' };
    await btn.click();
    const res = await page.evaluate((ids) => {
      const p = document.getElementById('v155-atelier-panel');
      if (!p || !p.classList.contains('open')) return { erreur: 'panneau non ouvert' };
      const ratees = [];
      for (const id of ids) {
        const e = document.getElementById(id);
        if (!e) { ratees.push(id + ' (absent)'); continue; }
        const r = e.getBoundingClientRect();
        const visible = r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
        if (!visible) ratees.push(id);
      }
      return { ratees: ratees };
    }, MODALES_ATELIER);
    await page.keyboard.press('Escape');   /* v155 ferme sur Échap */
    await page.waitForTimeout(150);
    return res;
  })();
  ok('menu ✨ ATELIER : les 6 modales sont visibles une fois ouvert',
     !atelier.erreur && atelier.ratees && atelier.ratees.length === 0,
     atelier.erreur || (atelier.ratees && atelier.ratees.length ? 'invisibles : ' + atelier.ratees.join(', ') : (MODALES_ATELIER.length + ' visibles')));

  /* ── menu 🎬 MÉDIA (v159) ── */
  const media = await (async () => {
    const btn = await page.$('#v159-media-btn');
    if (!btn) return { erreur: 'bouton MÉDIA introuvable' };
    await btn.click();
    await page.waitForTimeout(250);
    const res = await page.evaluate((ids) => {
      const p = document.getElementById('v159-media-panel');
      if (!p || !p.classList.contains('open')) return { erreur: 'panneau non ouvert' };
      const ratees = [];
      for (const id of ids) {
        const e = document.getElementById(id);
        if (!e) { ratees.push(id + ' (absent)'); continue; }
        const r = e.getBoundingClientRect();
        const visible = r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
        if (!visible) ratees.push(id);
      }
      return { ratees: ratees };
    }, MODALES_MEDIA);
    await page.evaluate(() => document.body.click());
    await page.waitForTimeout(150);
    return res;
  })();
  ok('menu 🎬 MÉDIA : les 2 modales sont visibles une fois ouvert',
     !media.erreur && media.ratees && media.ratees.length === 0,
     media.erreur || (media.ratees && media.ratees.length ? 'invisibles : ' + media.ratees.join(', ') : (MODALES_MEDIA.length + ' visibles')));

  section('7. Les 7 modales cachées restent lancables depuis la PALETTE (v550)');
  /* v535 indexe TOUS les button.hud-btn du document (même cachés) et exécute
     par el.click(). On prouve l'indexation pour les 7, puis un lancement
     réel de bout en bout (CONSEIL → #v528-panel ouvert). */
  const MOTS = {
    'open-conseil': ['conseil', 'CONSEIL'],
    'open-sources': ['sources', 'SOURCES'],
    'open-concordance': ['concordance', 'CONCORDANCE'],
    'open-themes': ['themes', 'THÈMES'],
    'open-dossier': ['dossier', 'DOSSIER'],
    'open-notes': ['notes', 'NOTES'],
    'open-ta-sujets': ['sujets', 'SUJETS']
  };
  let nonIndexees = [];
  for (const id of MODALES_CACHEES) {
    const [mot, label] = MOTS[id];
    const labels = await page.evaluate((mot) => {
      const bp = document.getElementById('open-palette');
      if (!bp) return null;
      bp.click();                                  /* ouvre + recharge l'index */
      const p = document.getElementById('v535-panel');
      if (!p || !p.classList.contains('open')) return null;
      const inp = document.getElementById('v535-q');
      inp.value = mot;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      const out = Array.from(document.querySelectorAll('#v535-l .it .lb')).map(e => e.textContent);
      p.classList.remove('open');                  /* refermer pour le suivant */
      return out;
    }, mot);
    if (!labels || !labels.some(t => t.indexOf(label) !== -1)) nonIndexees.push(id);
  }
  ok('la PALETTE indexe et retrouve les 7 modales retirées du header',
     nonIndexees.length === 0,
     nonIndexees.length ? 'introuvables : ' + nonIndexees.join(', ') : '7/7 cherchables');

  /* lancement réel de bout en bout : PALETTE → CONSEIL */
  const conseil = await (async () => {
    await page.evaluate(() => document.getElementById('open-palette').click());
    await page.waitForTimeout(150);
    await page.evaluate(() => {
      const inp = document.getElementById('v535-q');
      inp.value = 'conseil';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const ok_it = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('#v535-l .it'));
      const cible = items.find(i => i.textContent.indexOf('CONSEIL') !== -1);
      if (!cible) return false;
      cible.click();                               /* → execute() : fermer + el.click() différé */
      return true;
    });
    if (!ok_it) return { erreur: 'entrée CONSEIL absente des résultats' };
    await page.waitForTimeout(400);
    return await page.evaluate(() => {
      const pal = document.getElementById('v535-panel');
      const pan = document.getElementById('v528-panel');
      return { paletteFermee: !pal.classList.contains('open'),
               conseilOuvert: !!pan && pan.classList.contains('open') &&
                              getComputedStyle(pan).display !== 'none' };
    });
  })();
  ok('PALETTE → CONSEIL : la commande cachée s\'exécute (#v528-panel ouvert)',
     !conseil.erreur && conseil.paletteFermee && conseil.conseilOuvert,
     conseil.erreur || ('paletteFermee=' + conseil.paletteFermee + ' conseilOuvert=' + conseil.conseilOuvert));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  section('8. Propreté');
  ok('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));

  await browser.close();
  H.killRelay(relais);
  process.exitCode = H.report(resultats);
})().catch(e => { console.error('\n[EXCEPTION] ' + (e && e.stack || e)); process.exit(3); });
