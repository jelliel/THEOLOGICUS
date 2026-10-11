// Banc v547 — ASBĀB AL-NUZŪL + CHRONOLOGIE (v424) : contrat de l'infobulle.
//
// v424 n'a pas de panneau : il enrichit l'infobulle d'un verset CORANIQUE
// (showTip, lignes ~27232/27242) via deux API publiques :
//   • window.__asbabHtml({sourate, v1, v2}) — PUR : chronologie de la
//     révélation (rang égyptien standard, mecquoise/médinoise) + asbāb
//     embarqués (49 notices) filtrés par chevauchement de versets +
//     placeholder <div id="asbab-src"></div> pour le corpus dynamique.
//   • window.__asbabAppend(sura, v1, v2, tip) — DYNAMIQUE (v430) : charge
//     tradition/asbab/sNNN.json à la demande (corpus Shamela, 7 ouvrages,
//     3175 notices) et peint les récits arabes avec leurs sources dans
//     #asbab-src, si le tip est encore ouvert.
// Les traductions IA (v437/v438) exigent un modèle : HORS SCOPE CI.
//
// Méthode honnête et déterministe : tables statiques = spécification
// (assertions sur des sous-chaînes distinctives des notices), corpus
// dynamique vérifié EN CROISANT le JSON servi par le relais (le banc
// recalcule le filtre e.v ∈ [v1..v2] et compare au rendu).
//
// Usage : node verify_v547_asbab.js

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
  console.log('BANC v547 — ASBĀB AL-NUZŪL (v424) : CHRONOLOGIE + CONTEXTE DE RÉVÉLATION');
  console.log('='.repeat(72));

  const port = await H.pickFreePort();
  console.log('  … relais sur port libre ' + port);
  const relais = await H.spawnRelay({ port });
  if (!relais.child || relais.child.exitCode !== null) {
    console.log('\nRelais injoignable.'); process.exit(2);
  }
  const BASE = `http://127.0.0.1:${port}/THEOLOGICUS.html`;
  const ORIGINE = `http://127.0.0.1:${port}`;
  console.log('  base : ' + BASE);

  /* ── Corpus dynamique lu côté banc (croisement) : s096 ── */
  section('0. Corpus tradition/asbab/s096.json (côté banc)');
  let s96 = null;
  try { s96 = await (await fetch(ORIGINE + '/tradition/asbab/s096.json')).json(); } catch (e) { s96 = null; }
  ok('le fichier par sourate est servi par le relais', !!s96 && Array.isArray(s96.e),
     s96 ? (s96.e.length + ' notice(s), versets ' + s96.e.map(e => e.v).join('/')) : 'JSON injoignable');
  // attendu pour le verset 96:1-5 (filtre du module : e.v ∈ [v1..v2])
  const attendus96_1_5 = (s96 ? s96.e : []).filter(e => e.v >= 1 && e.v <= 5);
  ok('le verset 96:1-5 a au moins une notice dynamique attendue', attendus96_1_5.length >= 1,
     attendus96_1_5.map(e => 'v' + e.v + ' [' + e.src + ']').join(', ') || 'aucune');

  /* ── Navigateur ── */
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const erreurs = [];
  const BRUIT = /version\.txt|Failed to load resource|net::ERR|Failed to fetch|401|403|404|Unauthorized|\[corpus\]|\[ASB\]|jspdf|html2canvas/i;
  page.on('pageerror', e => erreurs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !BRUIT.test(m.text())) erreurs.push('console: ' + m.text()); });
  page.on('dialog', d => d.accept());

  await page.addInitScript(H.isolationInit);

  section('1. Ouverture de l\'application');
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(() => { const ov = document.getElementById('setup-wizard-overlay'); if (ov) { ov.classList.remove('active'); ov.style.display = 'none'; } }).catch(() => {});
  await page.waitForTimeout(1200);
  ok('les API du module v424 sont exposées', await page.evaluate(() =>
    typeof window.__asbabHtml === 'function' && typeof window.__asbabAppend === 'function' &&
    !!window.__ASBAB_SRC && typeof window.__ASBAB_SRC === 'object'));

  section('2. __asbabHtml — entrées invalides → chaîne vide');
  ok('null → \'\'', await page.evaluate(() => window.__asbabHtml(null) === ''));
  ok('sourate 0 → \'\'', await page.evaluate(() => window.__asbabHtml({ sourate: 0, v1: 1, v2: 1 }) === ''));
  ok('sourate 115 → \'\'', await page.evaluate(() => window.__asbabHtml({ sourate: 115, v1: 1, v2: 1 }) === ''));

  section('3. __asbabHtml — CHRONOLOGIE (ordre égyptien standard)');
  const chrono96 = await page.evaluate(() => window.__asbabHtml({ sourate: 96, v1: 1, v2: 5 }));
  ok('ʿAlaq est la 1re sourate révélée', /<b[^>]*>1<sup>re<\/sup> sourate révélée<\/b> sur 114/.test(chrono96) || /1re sourate révélée/.test(chrono96));
  ok('ʿAlaq est mecquoise (610-622)', /mecquoise/.test(chrono96) && /610-622/.test(chrono96));
  const chrono2 = await page.evaluate(() => window.__asbabHtml({ sourate: 2, v1: 144, v2: 144 }));
  ok('La Vache est la 87e révélée (table embarquée)', /87/.test(chrono2), 'rang attendu 87');
  ok('La Vache est médinoise (622-632)', /médinoise/.test(chrono2) && /622-632/.test(chrono2));

  section('4. __asbabHtml — ASBĀB embarqués (chevauchement de versets)');
  ok('96:1-5 → notice de la caverne de Ḥirāʾ (96:1)',
     /Contexte de révélation — 96:1/.test(chrono96) && /Ḥirāʾ/.test(chrono96),
     'bloc 📜 attendu, notice v[1..5]');
  const h24 = await page.evaluate(() => window.__asbabHtml({ sourate: 24, v1: 11, v2: 11 }));
  ok('24:11 → affaire du collier (plage 24:11-20)',
     /Contexte de révélation — 24:11-20/.test(h24) && /collier/.test(h24));
  const h33 = await page.evaluate(() => window.__asbabHtml({ sourate: 33, v1: 53, v2: 53 }));
  ok('33:53 → voile des épouses (verset unique)',
     /Contexte de révélation — 33:53/.test(h33) && /festin de mariage/.test(h33));
  ok('96:10 → AUCUNE notice (hors plage 1-5 du verset)',
     !(await page.evaluate(() => /Contexte de révélation/.test(window.__asbabHtml({ sourate: 96, v1: 10, v2: 10 })))));
  ok('le placeholder #asbab-src est présent (pour le corpus dynamique)',
     /id="asbab-src"/.test(chrono96));
  ok('le pied mentionne le caractère narratif (pas des faits établis)',
     /traditions narratives rapportées/.test(chrono96));

  section('5. __asbabAppend — corpus Shamela dynamique (96:1-5)');
  // Le banc monte un conteneur réel (comme le tip) contenant #asbab-src,
  // exactement ce que showTip lui passe (ligne 27242).
  const dyn = await page.evaluate(({ attendu }) => new Promise((resolve) => {
    const tip = document.createElement('div');
    tip.id = 'v547-bench-tip';
    tip.innerHTML = window.__asbabHtml({ sourate: 96, v1: 1, v2: 5 });
    document.body.appendChild(tip);
    window.__asbabAppend(96, 1, 5, tip);
    const box = tip.querySelector('#asbab-src');
    let i = 0;
    const poll = setInterval(() => {
      i++;
      const peint = box && box.childElementCount > 0;
      if (peint || i > 40) {           /* 20 s max */
        clearInterval(poll);
        const rtl = box ? box.querySelectorAll('[dir="rtl"]').length : 0;
        const bTr = box ? box.querySelectorAll('.asb-tr').length : 0;
        const all = box ? !!box.querySelector('.asb-tr-all') : false;
        const badge = box ? Array.from(box.querySelectorAll('span[title]')).map(s => s.textContent) : [];
        const entete = box ? (box.textContent.match(/📖\s*Asbāb al-nuzūl — (\d+) récit\(s\) · (\d+) source\(s\)/) || null) : null;
        const out = {
          peint: peint,
          entete: entete ? { n: +entete[1], s: +entete[2] } : null,
          rtl: rtl, bTr: bTr, all: all, badge: badge,
          shamela: box ? /shamela\.ws/.test(box.textContent) : false
        };
        tip.remove();
        resolve(out);
      }
    }, 500);
  }), { attendu: attendus96_1_5.length });

  ok('les récits dynamiques sont peints dans #asbab-src', dyn.peint);
  if (dyn.peint) {
    ok('l\'en-tête compte EXACTEMENT les notices attendues (croisement JSON)',
       dyn.entete && dyn.entete.n === attendus96_1_5.length,
       'rendu=' + (dyn.entete ? dyn.entete.n : '?') + ' attendu=' + attendus96_1_5.length);
    ok('le nombre de sources distinctes est correct',
       dyn.entete && dyn.entete.s === new Set(attendus96_1_5.map(e => e.src)).size,
       'rendu=' + (dyn.entete ? dyn.entete.s : '?'));
    ok('chaque récit est un bloc arabe (dir="rtl")', dyn.rtl === attendus96_1_5.length,
       dyn.rtl + ' bloc(s) rtl');
    ok('un bouton 🇫🇷 par récit (traduction IA, hors scope CI)', dyn.bTr === attendus96_1_5.length,
       dyn.bTr + ' bouton(s)');
    ok('le bouton « 🌐 Tout traduire » (v438) est présent', dyn.all);
    ok('la source est badgée avec une légende du recueil connu',
       dyn.badge.length >= 1 && /الواحدي|السيوطي|ابن حجر|المحرر|الصحيح|الاستيعاب/.test(dyn.badge.join(' ')),
       dyn.badge.join(' | ').slice(0, 90));
    ok('le pied cite shamela.ws', dyn.shamela);
  }

  section('6. __asbabAppend — négatif : verset sans notice dynamique');
  const neg = await page.evaluate(() => new Promise((resolve) => {
    const tip = document.createElement('div');
    tip.id = 'v547-bench-tip-neg';
    tip.innerHTML = window.__asbabHtml({ sourate: 96, v1: 100, v2: 100 });
    document.body.appendChild(tip);
    window.__asbabAppend(96, 100, 100, tip);
    const box = tip.querySelector('#asbab-src');
    let i = 0;
    const poll = setInterval(() => {
      i++;
      /* le module ne peint QUE s'il y a des notices : après un délai raisonnable
         le conteneur doit être resté vide. */
      if (i > 10) {                    /* 5 s suffisent (fetch local ≈ instantané) */
        clearInterval(poll);
        const vide = !box || box.childElementCount === 0;
        tip.remove();
        resolve(vide);
      }
    }, 500);
  }));
  ok('96:100 → #asbab-src reste vide (aucun récit hors plage)', neg === true);

  section('7. Propreté');
  ok('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));

  await browser.close();
  H.killRelay(relais);
  process.exitCode = H.report(resultats);
})().catch(e => { console.error('\n[EXCEPTION] ' + (e && e.stack || e)); process.exit(3); });
