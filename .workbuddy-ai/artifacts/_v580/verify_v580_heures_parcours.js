/* ═══════════════════════════════════════════════════════════════════════
   Banc v580 — LITURGIE DES HEURES simplifiée + PARCOURS PATRISTIQUES :
     1. HEURES : construire('matin'/'soir') → 9 étapes, psaume du jour
        (rotation hebdo, texte réel Segond via le relais), cantiques
        Benedictus (Lc 1:68-79) / Magnificat (Lc 1:46-55) réels ;
        ouverture auto matin/soir selon l’heure ; navigation ▶ et voix
        (ttsEmission doublé → enregistreur).
     2. PARCOURS : 6 thèmes × 5 étapes ; citations patristiques notoires
        (Ignace/Eucharistie, Justin/Trinité…), navigation, ⚖ versions,
        ▶ lire, 🕊 Adeodat (envoyer doublé pour capter le prompt).
   Magasin isolé (règle v559), corpus réels servis par le relais. ═══════ */
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
  const STORE_DIR = path.join(os.tmpdir(), 'theo_v580_store_' + Date.now());
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

  await page.evaluate(() => {
    window.__srInstances = [];
    window.SpeechRecognition = function () {
      const self = this;
      this.lang = ''; this.continuous = false; this.interimResults = false;
      window.__srInstances.push(self);
      this.start = function () {}; this.stop = function () {};
    };
    window.__toasts = [];
    if (typeof window.toast === 'function') {
      const ot = window.toast;
      window.toast = function (m, k) { window.__toasts.push(String(m)); try { ot(m, k); } catch (e) {} };
    }
  });

  /* ── 1. HEURES : structure des deux offices ── */
  section('1. HEURES : 9 étapes, psaumes du jour, cantiques réels');
  const h1 = await page.evaluate(async () => {
    const m = await window.__v580Heures.construire('matin', new Date(2026, 9, 14));   /* mercredi */
    const s = await window.__v580Heures.construire('soir', new Date(2026, 9, 14));
    return {
      nM: m.length, psM: (m[2] && m[2].ref) || '', psMtexte: (m[2] && m[2].t) || '',
      ben: (m[4] && m[4].ref) || '', benTexte: (m[4] && m[4].t) || '',
      nS: s.length, psS: (s[2] && s[2].ref) || '',
      mag: (s[4] && s[4].ref) || '', magTexte: (s[4] && s[4].t) || ''
    };
  });
  ok('l’office du matin compte 9 étapes', h1.nM === 9, 'n=' + h1.nM);
  ok('mercredi : psaume du matin = Psaume 40 (rotation)', h1.psM === 'Psaume 40', h1.psM);
  ok('le psaume est chargé hors-ligne (texte réel)', h1.psMtexte.length > 150, h1.psMtexte.slice(0, 80));
  ok('cantique du matin = Benedictus (Lc 1:68-79) chargé', h1.ben.indexOf('Benedictus') !== -1 && h1.benTexte.length > 200, h1.benTexte.slice(0, 80));
  ok('l’office du soir compte 9 étapes', h1.nS === 9, 'n=' + h1.nS);
  ok('mercredi : psaume du soir = Psaume 131 (degrés)', h1.psS === 'Psaume 131', h1.psS);
  ok('cantique du soir = Magnificat (Lc 1:46-55) chargé', h1.mag.indexOf('Magnificat') !== -1 && h1.magTexte.length > 200, h1.magTexte.slice(0, 80));

  /* ── 2. ouverture + navigation + voix doublée ── */
  section('2. HEURES : panneau, navigation, voix (ttsEmission doublé)');
  await page.evaluate(() => {
    window.__parles = [];
    window.ttsEmission = function (t, l, onEnd, onErr) {
      window.__parles.push(String(t).slice(0, 60));
      if (typeof onEnd === 'function') setTimeout(onEnd, 5);
      return true;
    };
  });
  await page.evaluate(() => window.__v580Heures.ouvrir());
  await page.waitForFunction(() => {
    const m = document.getElementById('v580-modal');
    return m && m.classList.contains('open') && document.getElementById('v580-compte').textContent.indexOf('étape 1/') !== -1;
  }, null, { timeout: 15000 });
  const h2 = await page.evaluate(() => ({
    compte: document.getElementById('v580-compte').textContent,
    cour: document.getElementById('v580-cour').textContent
  }));
  ok('le panneau s’ouvre sur un office (étape 1/9)', h2.compte.indexOf('étape 1/9') !== -1, h2.compte);
  ok('la première étape est l’invocation', h2.cour.indexOf('Au nom du Père') !== -1, h2.cour.slice(0, 50));
  await page.evaluate(() => document.getElementById('v580-play').click());
  await page.waitForFunction(() => window.__parles.length >= 3, null, { timeout: 15000 });
  const h3 = await page.evaluate(() => ({
    parles: window.__parles.length,
    dernier: window.__parles[window.__parles.length - 1]
  }));
  ok('la voix enchaîne les étapes (ttsEmission)', h3.parles >= 3, 'parlés=' + h3.parles + ' dernier=' + h3.dernier);
  await page.evaluate(() => { window.__v580Heures.stop(); document.getElementById('v580-x').click(); });

  /* ── 3. PARCOURS : thèmes, étapes, citations ── */
  section('3. PARCOURS : 6 thèmes × 5 étapes, citations patristiques');
  const th = await page.evaluate(() => window.__v581Parcours.themes());
  ok('6 thèmes proposés', th.length === 6, th.map(t => t.k).join(','));
  ok('chaque thème compte 5 étapes', th.every(t => t.n === 5));
  await page.evaluate(() => window.__v581Parcours.ouvrir());
  await page.waitForFunction(() => {
    const m = document.getElementById('v581-modal');
    return m && m.classList.contains('open') && m.querySelectorAll('.theme').length === 6;
  }, null, { timeout: 8000 });
  await page.evaluate(() => document.querySelector('#v581-corps .theme[data-t="eucharistie"]').click());
  await page.waitForFunction(() => {
    const c = document.getElementById('v581-corps');
    return c && c.textContent.indexOf('remède d’immortalité') !== -1;
  }, null, { timeout: 8000 });
  const p1 = await page.evaluate(() => ({
    aut: document.querySelector('#v581-corps .aut').textContent,
    etape: document.getElementById('v581-corps').textContent.indexOf('étape 1/5') !== -1
  }));
  ok('étape 1 Eucharistie : citation d’Ignace d’Antioche (Éphésiens ~107)',
     p1.aut.indexOf('Ignace d’Antioche') !== -1 && p1.aut.indexOf('Éphésiens') !== -1, p1.aut.slice(0, 80));
  await page.evaluate(() => document.getElementById('v581-next').click());
  const p2 = await page.evaluate(() => document.querySelector('#v581-corps .aut').textContent);
  ok('navigation → étape 2 (Justin martyr)', p2.indexOf('Justin') !== -1, p2.slice(0, 60));

  /* ── 4. actions : ⚖ versions + 🕊 Adeodat (envoyer doublé) ── */
  section('4. Actions du parcours : ⚖ versions et 🕊 Adeodat');
  await page.evaluate(() => {
    window.__adeodatAppels = [];
    window.__v564Adeodat.envoyer = function (t) { window.__adeodatAppels.push(String(t)); };
  });
  await page.evaluate(() => document.getElementById('v581-adeodat').click());
  const ade = await page.evaluate(() => ({
    n: window.__adeodatAppels.length,
    t: (window.__adeodatAppels[0] || '')
  }));
  ok('le bouton 🕊 envoie un prompt d’étude à Adeodat', ade.n === 1 && ade.t.indexOf('patristique') !== -1, ade.t.slice(0, 80));
  await page.evaluate(() => document.getElementById('v581-bib').click());
  await page.waitForFunction(() => {
    const m = document.getElementById('v578-modal');
    return m && m.classList.contains('open');
  }, null, { timeout: 10000 });
  const vers = await page.evaluate(() => document.getElementById('v578-ref').value);
  ok('⚖ versions s’ouvre sur le verset de l’étape (1Co 11:23-26)', vers.indexOf('1Co 11:23-26') !== -1, vers);
  await page.evaluate(() => document.getElementById('v578-x').click());

  /* ── 5. entrées du menu « + » ── */
  section('5. Menu « + » : entrées HEURES + PARCOURS');
  await page.waitForFunction(() => !!document.getElementById('v580-menu-entry') && !!document.getElementById('v581-menu-entry'), null, { timeout: 12000 });
  const menu = await page.evaluate(() => ({
    a: !!document.getElementById('v580-menu-entry'),
    b: !!document.getElementById('v581-menu-entry')
  }));
  ok('⏳ HEURES et 🕊 PÈRES — PARCOURS dans le menu', menu.a && menu.b);

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
