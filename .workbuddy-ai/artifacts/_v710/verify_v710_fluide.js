/* v710 — MODE FLUIDE.
   Vérifie l'activation auto sur profil mobile/Honor X8b, l'absence
   d'effet sur desktop, le réglage Auto/Toujours/Jamais et la borne
   des timers rapides.
   Contrôle négatif : build pré-v710 → module absent. */
const path = require('path');
const { chromium } = require('playwright');
const RACINE = path.resolve(process.env.BENCH_ROOT || path.resolve(__dirname, '../../..'));
const HTML = 'file:///' + path.join(RACINE, 'THEOLOGICUS.html').replace(/\\/g, '/');
let ok_n = 0, ko_n = 0;
function ok(nom, cond, detail) {
  if (cond) { ok_n++; console.log('[OK]    ' + nom + (detail ? '  -- ' + detail : '')); }
  else { ko_n++; console.log('[ECHEC] ' + nom + (detail ? '  -- ' + detail : '')); }
}
const MOBILE_UA = 'Mozilla/5.0 (Linux; Android 13; HonorX8b) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';
async function ouvrir(browser, mobile, mode) {
  const ctx = await browser.newContext(mobile
    ? { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true, userAgent: MOBILE_UA }
    : { viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message)));
  await page.addInitScript(m => {
    try { localStorage.setItem('theologicus_wizard_skipped', '1'); } catch (e) {}
    if (m) { try { localStorage.setItem('theologicus_mode_fluide', m); } catch (e) {} }
  }, mode || null);
  await page.goto(HTML, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction(() => !!window.sendMessage, null, { timeout: 180000 });
  await page.waitForTimeout(1200);
  return { ctx, page, errs };
}
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const m = await ouvrir(browser, true, null);
  let charge = false;
  try { await m.page.waitForFunction(() => !!window.__v710Perf, null, { timeout: 30000 }); charge = true; } catch (e) {}
  ok('module v710 chargé (contrôle négatif : absent sur l’ancien build)', charge);
  if (!charge) {
    console.log('\nBANC V710 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC');
    await browser.close(); process.exit(1);
  }

  const mob = await m.page.evaluate(() => ({
    mobile: window.__v710Perf.estMobile, actif: window.__v710Perf.estActif(),
    attr: document.documentElement.getAttribute('data-v710-perf'),
    css: !!document.getElementById('v710-perf-css'),
    stats: window.__v710Perf.stats(),
    app: !!window.sendMessage
  }));
  ok('Honor X8b / Android détecté et mode fluide actif par défaut',
     mob.mobile && mob.actif && mob.attr === 'on' && mob.css, JSON.stringify(mob));
  ok('timers rapides effectivement bornés', mob.stats.clamps > 0, JSON.stringify(mob.stats));
  ok('application toujours opérationnelle en mode fluide', mob.app);

  const regl = await m.page.evaluate(() => {
    var s = document.getElementById('v710-fluide-select');
    var g = document.getElementById('v710-fluide-group');
    var avant = document.documentElement.getAttribute('data-v710-perf');
    s.value = 'off'; s.onchange();
    var apresOff = document.documentElement.getAttribute('data-v710-perf');
    s.value = 'on'; s.onchange();
    var apresOn = document.documentElement.getAttribute('data-v710-perf');
    return { select: !!s, panneau: !!(g && g.closest('#settings-panneau-model')),
             header: !!(g && g.closest('.header-controls')),
             avant: avant, apresOff: apresOff, apresOn: apresOn };
  });
  ok('réglage dans PARAMÈTRES > Modèle, jamais dans .header-controls',
     regl.select && regl.panneau && !regl.header, JSON.stringify(regl));
  ok('bascule immediade fluide → complet → fluide',
     regl.avant === 'on' && regl.apresOff === 'off' && regl.apresOn === 'on', JSON.stringify(regl));
  ok('aucune erreur JS sur profil mobile', m.errs.length === 0, m.errs.slice(0, 2).join(' | '));
  await m.ctx.close();

  const d = await ouvrir(browser, false, null);
  const desk = await d.page.evaluate(() => ({
    mobile: window.__v710Perf.estMobile, actif: window.__v710Perf.estActif(),
    attr: document.documentElement.getAttribute('data-v710-perf'),
    stats: window.__v710Perf.stats()
  }));
  ok('desktop inchangé : mode fluide inactif, aucun timer borné',
     !desk.mobile && !desk.actif && desk.attr === 'off' && desk.stats.clamps === 0, JSON.stringify(desk));
  ok('aucune erreur JS sur desktop', d.errs.length === 0, d.errs.slice(0, 2).join(' | '));
  await d.ctx.close();

  console.log('\nBANC V710 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC');
  await browser.close();
  process.exit(ko_n ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
