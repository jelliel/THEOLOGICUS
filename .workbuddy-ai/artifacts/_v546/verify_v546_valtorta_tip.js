// Banc v546 — MARIA VALTORTA (v204) : chips 🌊 de l'infobulle de verset.
//
// v204 n'a PAS de panneau dédié : il injecte des chips dans l'infobulle
// d'un verset (showTip v66, ligne ~26950) via window.__v204TipHtml(p), et
// expose le parseur pur window.__v204RefParts(text). Un clic sur une chip
// ouvre le récit officiel dans le navigateur interne (v179 __theoOpenNav).
//
// Méthode HONNÊTE et déterministe : le banc lit le VRAI corpus
// tradition/valtorta.json servi par le relais, choisit un épisode dont le
// (livre:chapitre) a peu de concurrents à référence d'en-tête (donc garanti
// dans les 4 chips affichées), parse sa référence AVEC le parseur du module,
// puis attend le chargement paresseux (1er appel + boot à 2,5 s) et vérifie :
//   1. le parseur FR (formats « Mt 3:16 », « Luc 1,5-7 », « 1 Co 12:3 »…),
//   2. les chips rendues (en-tête 🌊, data-u/data-t, marqueur 📖 de l'épisode
//      cible, plafond 4),
//   3. le câblage du clic → __theoOpenNav (doublure d'enregistrement),
//   4. le négatif : un verset SANS couverture (calculé sur le corpus) → ''.
//
// Usage : node verify_v546_valtorta_tip.js

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
  console.log('BANC v546 — VALTORTA (v204) : CHIPS DE L\'INFOBULLE DE VERSET');
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

  /* ── Corpus lu côté Node (le relais sert le dépôt) : choix déterministe
     de la cible et du verset négatif ── */
  section('0. Corpus valtorta.json (côté banc)');
  let corpus = null;
  try {
    corpus = await (await fetch(ORIGINE + '/tradition/valtorta.json')).json();
  } catch (e) { corpus = null; }
  if (!ok('le corpus valtorta.json est servi par le relais', !!corpus && Array.isArray(corpus.episodes) && corpus.episodes.length > 0,
          corpus ? ((corpus.episodes || []).length + ' épisodes') : 'JSON injoignable')) {
    await browserCloseSafe(null); H.killRelay(relais); process.exit(2);
  }
  const episodes = corpus.episodes;

  // carte AELF -> numéro (copie du BOOKN du module, strictement pour choisir
  // la cible et le négatif — les assertions du parseur passent par le module)
  const BOOKN = { gn:1, ex:2, lv:3, nb:4, dt:5, jos:6, jg:7, rt:8, '1s':9, '2s':10,
    '1r':11, '2r':12, '1ch':13, '2ch':14, esd:15, ne:16, et:17, jb:18, ps:19, pr:20,
    ec:21, ct:22, is:23, jr:24, lm:25, ez:26, dn:27, os:28, jl:29, am:30, ab:31,
    jo:32, mi:33, na:34, ha:35, so:36, ag:37, za:38, ml:39, mt:40, mc:41, lc:42,
    jn:43, ac:44, rm:45, '1co':46, '2co':47, ga:48, ep:49, ph:50, col:51, '1th':52,
    '2th':53, '1ti':54, '2ti':55, ti:56, phm:57, hb:58, jc:59, '1p':60, '2p':61,
    '1jn':62, '2jn':63, '3jn':64, jd:65, ap:66 };

  // épisodes à référence d'en-tête qui couvrent (b,c) — concurrents off=1
  function enTeteSur(b, c) {
    return episodes.filter(e => (e.refs || []).some(r => r.b === b && Number(r.c) === Number(c)));
  }
  function chevauche(r, v1, v2) {
    const a = Math.max(Number(r.v1), v1), b = Math.min(Number(r.v2 || r.v1), v2);
    return a <= b;
  }

  // cible : premier épisode dont le (livre:chapitre) a ≤ 4 épisodes à
  // en-tête → il est GARANTI dans les 4 chips affichées (tri off d'abord).
  let cible = null, cibleInfo = null;
  for (const e of episodes) {
    const r = (e.refs || [])[0];
    if (!r || !BOOKN[r.b]) continue;
    const conc = enTeteSur(r.b, r.c);
    if (conc.length <= 4) { cible = e; cibleInfo = { raw: r.raw, b: r.b, c: r.c, v1: r.v1, v2: r.v2 || r.v1, concurrents: conc.length }; break; }
  }
  if (!ok('un épisode cible déterministe est trouvé (≤ 4 en-têtes sur son chapitre)',
          !!cible, cibleInfo ? (cibleInfo.raw + ' — ' + cibleInfo.concurrents + ' en-tête(s)') : 'aucun')) {
    await browserCloseSafe(null); H.killRelay(relais); process.exit(2);
  }

  // verset négatif : (livre, chapitre) du canon ABSENT de l'index du corpus
  let negatif = null;
  outer:
  for (let b = 1; b <= 66; b++) {
    for (let c = 1; c <= 40; c++) {
      const utilise = episodes.some(e =>
        (e.refs || []).some(r => BOOKN[r.b] === b && Number(r.c) === c) ||
        (e.cit  || []).some(r => BOOKN[r.b] === b && Number(r.c) === c));
      if (!utilise) { negatif = { book: String(b), ch: String(c), v1: 1, v2: 1 }; break outer; }
    }
  }
  ok('un verset sans couverture existe (négatif déterministe)', !!negatif,
     negatif ? ('livre ' + negatif.book + ' chapitre ' + negatif.ch) : 'corpus couvre tout ?');

  /* ── Navigateur ── */
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const erreurs = [];
  const BRUIT = /version\.txt|Failed to load resource|net::ERR|Failed to fetch|401|403|404|Unauthorized|\[corpus\]|jspdf|html2canvas|maria-valtorta|mariavaltorta/i;
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
  ok('l\'API du module v204 est exposée', await page.evaluate(() =>
    typeof window.__v204TipHtml === 'function' && typeof window.__v204RefParts === 'function'));

  section('2. PARSEUR PUR : __v204RefParts (contrat FR → {book,ch,v1,v2})');
  const cas = [
    ['Mt 3:16',     '40', '3', 16, null],
    ['Luc 1,5-7',   '42', '1', 5,  7],
    ['1 Co 12:3',   '46', '12', 3, null],
    ['1 Jean 3:16', '62', '3', 16, null],
    ['Ap 22:21',    '66', '22', 21, null]
  ];
  for (const [txt, book, ch, v1, v2] of cas) {
    const r = await page.evaluate(t => window.__v204RefParts(t), txt);
    ok(`parse « ${txt} »`, !!r && r.book === book && String(r.ch) === ch && r.v1 === v1 && r.v2 === v2,
       r ? JSON.stringify(r) : 'null');
  }
  ok('rejette un livre inconnu (« Foo 3:16 »)', await page.evaluate(t => window.__v204RefParts(t) === null, 'Foo 3:16'));
  ok('rejette une référence sans verset (« Mt 3 »)', await page.evaluate(t => window.__v204RefParts(t) === null, 'Mt 3'));

  section('3. CHIPS : __v204TipHtml sur la cible (chargement paresseux attendu)');
  // Le parseur DU MODULE donne la sonde exacte que showTip v66 lui passerait.
  const chargement = await page.evaluate(async (raw) => {
    const p = window.__v204RefParts(raw);
    if (!p) return { err: 'parse: ' + raw };
    const sonde = { book: p.book, ch: p.ch, v1: p.v1, v2: p.v2 || p.v1 };
    for (let i = 0; i < 40; i++) {           /* 20 s max : 1er appel lance load, boot à 2,5 s aussi */
      const h = window.__v204TipHtml(sonde);
      if (h && h.length) return { ok: true, html: h, sonde };
      await new Promise(r => setTimeout(r, 500));
    }
    return { ok: false, html: '', sonde };
  }, cibleInfo.raw);
  ok('l\'infobulle renvoie des chips pour ' + cibleInfo.raw, !!chargement.ok,
     chargement.ok ? (chargement.html.length + ' caractères') : (chargement.err || 'délai dépassé'));

  if (chargement.ok) {
    const cibleUrl = cible.u;
    const info = await page.evaluate(({ html, targetUrl, negatif }) => {
      const d = document.createElement('div');
      d.id = 'v204-bench'; d.innerHTML = html;
      document.body.appendChild(d);
      const chips = Array.from(d.querySelectorAll('.v204-chip'));
      const cible = chips.find(c => (c.getAttribute('data-u') || '') === targetUrl) || null;
      /* câblage du clic : doublure d'enregistrement (pas de vrai v179) */
      const appels = [];
      window.__theoOpenNav = function (u, t) { appels.push({ u: u, t: t }); };
      if (cible) cible.click();
      const vide = window.__v204TipHtml(negatif);
      const out = {
        n: chips.length,
        entete: /MARIA VALTORTA/.test(html),
        ciblePresente: !!cible,
        cibleMarqueur: cible ? /📖/.test(cible.textContent) : false,
        cibleTitre: cible ? (cible.getAttribute('data-t') || '') : '',
        dataT0: chips[0] ? (chips[0].getAttribute('data-t') || '') : '',
        appels: appels,
        vide: vide,
        debordement: /\+\s*\d+\s*autre\(s\)/.test(html)
      };
      d.remove();
      return out;
    }, { html: chargement.html, targetUrl: cibleUrl, negatif: negatif });

    ok('l\'en-tête 🌊 MARIA VALTORTA est présent', info.entete);
    ok('au moins une chip est rendue (plafond 4 respecté)', info.n >= 1 && info.n <= 4, info.n + ' chip(s)');
    ok('l\'épisode cible (' + cible.fid + ') figure dans les chips', info.ciblePresente, cibleUrl);
    ok('la chip cible porte le marqueur 📖 (référence d\'en-tête)', info.cibleMarqueur, info.cibleTitre.slice(0, 90));
    ok('la chip cible est titrée « Valtorta — … »', /^Valtorta — /.test(info.cibleTitre), info.cibleTitre.slice(0, 90));
    ok('la première chip est titrée « Valtorta — … »', /^Valtorta — /.test(info.dataT0), info.dataT0.slice(0, 90));

    section('4. CLIC : la chip ouvre le navigateur interne (v179)');
    ok('le clic sur la chip appelle __theoOpenNav', info.appels.length === 1,
       JSON.stringify(info.appels).slice(0, 110));
    ok('l\'URL transmise est celle de la chip', info.appels.length === 1 && info.appels[0].u === cibleUrl,
       info.appels.length ? String(info.appels[0].u).slice(0, 90) : '-');

    section('5. NÉGATIF : verset sans couverture → pas de chips');
    ok('« livre ' + negatif.book + ', ' + negatif.ch + ':1 » renvoie une chaîne vide', info.vide === '',
       JSON.stringify(info.vide).slice(0, 80));
  }

  section('6. Propreté');
  ok('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));

  await browser.close();
  H.killRelay(relais);
  process.exitCode = H.report(resultats);
})().catch(e => { console.error('\n[EXCEPTION] ' + (e && e.stack || e)); process.exit(3); });

async function browserCloseSafe(b) { try { if (b) await b.close(); } catch (e) {} }
