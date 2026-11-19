/* v708 — RÉPONSES PLUS LONGUES.
   Vérifie le défaut 8192 tokens, le réglage dans PARAMÈTRES > Modèle,
   la consigne « développe », et l'absence d'effet sur les appels techniques.
   Contrôle négatif : build pré-v708 → module absent. */
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
  try { await page.waitForFunction(() => !!window.__v708Longueur, null, { timeout: 45000 }); charge = true; } catch (e) {}
  ok('module v708 chargé (contrôle négatif : absent sur l’ancien build)', charge);
  if (!charge) {
    console.log('\nBANC V708 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC');
    await browser.close(); process.exit(1);
  }
  await page.waitForTimeout(1300);

  const etat = await page.evaluate(() => {
    const V = window.__v708Longueur;
    return { defaut: V.lire(), choix: V.choix };
  });
  ok('défaut porté à 8192 tokens', etat.defaut === 8192, String(etat.defaut));
  ok('quatre paliers proposés dont 4096 et 16000',
     etat.choix.length === 4 && etat.choix[0] === 4096 && etat.choix[3] === 16000, etat.choix.join(','));

  const appl = await page.evaluate(() => {
    const V = window.__v708Longueur;
    return {
      chat: V.appliquer([{ role: 'system', content: 'Tu es THEOLOGICUS…' }], { max_tokens: 4096 }).max_tokens,
      borne: V.appliquer([{ role: 'system', content: 'Tu es THEOLOGICUS…' }], { max_tokens: 700 }).max_tokens,
      agent: V.appliquer([{ role: 'system', content: '[AGENT Test]' }], {}).max_tokens,
      sonde: V.appliquer([{ role: 'user', content: 'ok' }], { max_tokens: 1 }).max_tokens,
      explicite: V.appliquer([{ role: 'system', content: 'Tu es THEOLOGICUS…' }], { max_tokens: 12000 }).max_tokens
    };
  });
  ok('chat : 4096 devient 8192', appl.chat === 8192, String(appl.chat));
  ok('agent sans max_tokens : 8192 aussi', appl.agent === 8192, String(appl.agent));
  ok('sonde technique max_tokens:1 inchangée', appl.sonde === 1, String(appl.sonde));
  ok('appel volontairement borné (700) inchangé', appl.borne === 700, String(appl.borne));
  ok('valeur explicitement supérieure respectée', appl.explicite === 12000, String(appl.explicite));

  const prompt = await page.evaluate(() => {
    const p = String(buildSystemPrompt());
    return { long: p.indexOf('Développe ta réponse') !== -1,
             concis: p.indexOf('6. Sois concis mais complet') !== -1 };
  });
  ok('consigne prompt : développe au lieu de sois concis', prompt.long && !prompt.concis, JSON.stringify(prompt));

  const ui = await page.evaluate(() => {
    const g = document.getElementById('v708-longueur-group'), s = document.getElementById('v708-longueur-select');
    return {
      present: !!g, panneau: !!(g && g.closest('#settings-panneau-model')),
      header: !!(g && g.closest('.header-controls')), valeur: s ? s.value : ''
    };
  });
  ok('réglage dans PARAMÈTRES > Modèle, jamais dans .header-controls',
     ui.present && ui.panneau && !ui.header, JSON.stringify(ui));
  ok('sélecteur initialisé sur 8192', ui.valeur === '8192', ui.valeur);

  const pers = await page.evaluate(() => {
    const V = window.__v708Longueur;
    V.ecrire(12000);
    return { lu: V.lire(), stock: localStorage.getItem('theologicus_longueur_reponse'),
             appl: V.appliquer([{ role: 'system', content: 'Tu es THEOLOGICUS…' }], { max_tokens: 4096 }).max_tokens };
  });
  ok('changement persisté et appliqué au prochain appel',
     pers.lu === 12000 && pers.stock === '12000' && pers.appl === 12000, JSON.stringify(pers));
  await page.evaluate(() => window.__v708Longueur.ecrire(8192));

  ok('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));
  console.log('\nBANC V708 : ' + ok_n + ' OK / ' + ko_n + ' ECHEC');
  await browser.close();
  process.exit(ko_n ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
