/* ═══════════════════════════════════════════════════════════════════════
   Banc v560 — MOT À MOT ARABE v88 (infobulle du Coran).

   Vérifie (corpus RÉELS servis par le relais, exécutés dans un bac à
   sable Node pour calculer les attendus — méthode v549) :
     1. __qwMots(2,255,arabe) : le nombre de mots INDEXÉS (.qw avec
        data-i) est EXACTEMENT celui du corpus quranwbw[2][255] (50) —
        le contrat d'alignement ; les signes d'annotation coraniques
        (U+06D6-06ED) sont conservés SANS index (sinon gloses décalées).
     2. Marqueurs v414 : flèche de sens (qw-sens) en tête, premier mot
        qw-debut (l'arabe se lit de droite à gauche).
     3. Translittération v412 ASYNCHRONE : après chargement de
        quranwbw/q2.js, une .qw-t par mot, valeurs = corpus (al-lahu…).
     4. Fiche #qw-tip au CLIC réel sur un mot : mot arabe, « Mot à mot »
        (FR, g[2] — intégration v89), « source (en) » (g[0]), Racine
        (r[0]), Lemme (r[1]), Nature (r[2]) et la notice obligatoire
        Quranic Arabic Corpus (GPL).
     5. Branche « Aucune donnée » : index hors corpus → message honnête
        (chemin réel des versets non alignés).
     6. Défilement → la fiche se cache (scroll en capture).
   Magasin isolé (localAppData) — leçon v559. Aucun réseau externe.
   ═══════════════════════════════════════════════════════════════════ */
const H = require('../../../tools/bench_common.js');
const { chromium } = require('playwright');
const fs = require('fs'), vm = require('vm'), path = require('path'), os = require('os');

const resultats = [];
function section(t) { console.log('\n■ ' + t); }
function ok(label, cond, detail) {
  resultats.push({ label, pass: !!cond });
  console.log((cond ? '  [OK]   ' : '  [ECHEC]') + ' ' + label + (detail ? ' — ' + detail : ''));
}

/* exécute un corpus .js dans un bac à sable (faux window) — méthode v549 */
function ch(p) {
  const c = { window: {} };
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(p, 'utf8'), c, { timeout: 5000 });
  return c.window;
}

(async () => {
  /* ── attendus calculés depuis les corpus réels ── */
  const racine = path.join(process.cwd());
  const q = ch(path.join(racine, 'quran', 'q2.js'));
  const w = ch(path.join(racine, 'quranwbw', 'q2.js'));
  const r = ch(path.join(racine, 'quranroots', 'q2.js'));
  const ARABE = String(q.__quranSurahs[2].versets[255].arabe);
  const WBW = w.__quranWbw[2][255];
  const RT = r.__quranRoots[2][255];
  const N = WBW.length;
  /* premier mot indexé de l'arabe (les signes SIG ne sont pas indexés) */
  /* v560 — SIG ANCRÉ : un signe est un token COMPOSÉ UNIQUEMENT de signes.
     L'ancien test non ancré survolait les mots à petit wāw/yā (ۥ ۦ). */
  const SIG = /^[\u06d6-\u06ed\u08e2]+$/;
  const mots = ARABE.split(' ').filter(t => t && !SIG.test(t));

  console.log('attendus : ' + N + ' mots wbw / ' + mots.length + ' mots indexés attendus / 1er = « ' + mots[0] + ' »');

  const port = await H.pickFreePort();
  const STORE_DIR = path.join(os.tmpdir(), 'theo_v560_store_' + Date.now());
  try { fs.mkdirSync(STORE_DIR, { recursive: true }); } catch (e) {}
  const relais = await H.spawnRelay({ port, localAppData: STORE_DIR });
  const BASE = 'http://127.0.0.1:' + port + '/THEOLOGICUS.html';
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const bruit = [];
  page.on('console', m => { if (m.type() === 'error') bruit.push(m.text()); });
  page.on('pageerror', e => bruit.push(String(e)));
  await page.addInitScript(H.isolationInit);
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);

  /* ── 1. découpage + alignement ── */
  section('1. __qwMots : alignement avec le corpus (contrat v88)');
  const dec = await page.evaluate((arabe) => {
    const boite = document.createElement('div');
    boite.id = 'banc-qw';
    boite.style.cssText = 'position:fixed;left:60px;top:60px;width:900px;background:#0a1420;padding:12px;z-index:999998';
    boite.innerHTML = window.__qwMots(2, 255, arabe);
    document.body.appendChild(boite);
    const qw = boite.querySelectorAll('.qw[data-i]');
    return {
      n: qw.length,
      premier: qw[0] ? qw[0].getAttribute('data-i') : null,
      debut: qw[0] ? qw[0].classList.contains('qw-debut') : false,
      fleche: !!boite.querySelector('.qw-sens'),
      flechePremiere: boite.firstChild && boite.firstChild.classList && boite.firstChild.classList.contains('qw-sens'),
      signesSansIndex: Array.from(boite.children).every(el =>
        el.classList.contains('qw') ? el.hasAttribute('data-i') : true)
    };
  }, ARABE);
  ok('le nombre de mots indexés = le corpus wbw (' + N + ')', dec.n === N, 'n=' + dec.n);
  ok('le premier mot indexé est data-i="0" et porte qw-debut', dec.premier === '0' && dec.debut);
  ok('la flèche de sens (qw-sens) ouvre la lecture', dec.fleche && dec.flechePremiere);
  ok('les signes d\'annotation coraniques restent SANS index', dec.signesSansIndex);

  /* ── 2. translittération asynchrone ── */
  section('2. v412 : translittération sous chaque mot (corpus quranwbw)');
  await page.waitForFunction((n) => document.querySelectorAll('#banc-qw .qw-t').length === n, N, { timeout: 15000 });
  const translits = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#banc-qw .qw-t')).map(e => e.textContent));
  ok('une .qw-t par mot (' + N + ')', translits.length === N, 'n=' + translits.length);
  ok('la première translittération = le corpus (« ' + WBW[0][1].trim() + ' »)',
     translits[0] === WBW[0][1], JSON.stringify(translits[0]));
  const echantillonOk = [1, 7, 25, 49].every(i => translits[i] === WBW[i][1]);
  ok('échantillon de translittérations conforme au corpus (i=1,7,25,49)', echantillonOk);

  /* ── 3. fiche au clic ── */
  section('3. Fiche #qw-tip au clic : gloses, racine, lemme, nature, notice');
  await page.click('#banc-qw .qw[data-i="0"]');
  await page.waitForFunction(() => {
    const t = document.getElementById('qw-tip');
    return t && t.style.display === 'block' && t.querySelector('.qw-racine');
  }, { timeout: 15000 });
  const fiche = await page.evaluate(() => {
    const t = document.getElementById('qw-tip');
    return {
      mot: t.querySelector('.qw-mot').textContent,
      fr: t.textContent.indexOf('Mot à mot') !== -1 ? t.textContent.split('Mot à mot')[1].split('source (en)')[0].trim() : '',
      en: t.textContent.indexOf('source (en) : ') !== -1 ? t.textContent.split('source (en) : ')[1].split('\n')[0].trim() : '',
      racine: (t.querySelector('.qw-racine') || {}).textContent || '',
      lignes: Array.from(t.querySelectorAll('.qw-cle')).map(e => e.textContent),
      notice: t.textContent.indexOf('Quranic Arabic Corpus') !== -1 && t.textContent.indexOf('(GPL)') !== -1
    };
  });
  ok('la fiche affiche le mot arabe cliqué', fiche.mot === mots[0], JSON.stringify(fiche.mot));
  ok('« Mot à mot » FR présent (glose[2] = ' + JSON.stringify(WBW[0][2].trim()) + ')',
     fiche.fr.indexOf(WBW[0][2].trim()) !== -1, fiche.fr.slice(0, 40));
  ok('la source anglaise est citée en petit (glose[0])', fiche.en.indexOf(WBW[0][0].trim()) !== -1, fiche.en.slice(0, 30));
  ok('la racine = le corpus (quranroots[0][0])', fiche.racine === RT[0][0], JSON.stringify(fiche.racine));
  ok('les lignes attendues : Translittération / Mot à mot / Racine / Lemme / Nature',
     ['Translittération', 'Mot à mot', 'Racine', 'Lemme', 'Nature'].every(k => fiche.lignes.includes(k)),
     fiche.lignes.join(' · '));
  ok('la notice Quranic Arabic Corpus (GPL) obligatoire est affichée', fiche.notice);

  /* ── 4. « Aucune donnée » (index hors corpus — cas des versets non alignés) ── */
  section('4. Sans donnée : message honnête (jamais deviné)');
  const vide = await page.evaluate(() => {
    const boite = document.getElementById('banc-qw');
    boite.insertAdjacentHTML('beforeend',
      ' <span class="qw" data-s="2" data-v="255" data-i="999"><span class="qw-h">تجريبي</span></span>');
    window.__qwV88.detail(boite.querySelector('.qw[data-i="999"]'));
    return new Promise(res => setTimeout(() => {
      const t = document.getElementById('qw-tip');
      res({ visible: t.style.display === 'block', vide: t.textContent.indexOf('Aucune donnée pour ce mot.') !== -1 });
    }, 400));
  });
  ok('index hors corpus → « Aucune donnée pour ce mot. »', vide.visible && vide.vide);

  /* ── 5. défilement → la fiche se cache ── */
  section('5. Défilement : la fiche se cache (scroll en capture)');
  /* éloigner le pointeur d'abord : après le clic de la section 3, la souris
     stationnaire reçoit un mouseover SYNTHÉTIQUE quand la fiche masquée
     change le contenu sous elle — ce qui rouvrirait la fiche (artefact
     navigateur, pas le geste réel : on scrolle le pointeur libre). */
  await page.mouse.move(640, 760);
  await page.waitForTimeout(120);
  const cache = await page.evaluate(() => new Promise(res => {
    document.dispatchEvent(new Event('scroll'));
    setTimeout(() => res(document.getElementById('qw-tip').style.display === 'none'), 150);
  }));
  ok('un scroll masque la fiche', cache);

  /* ── 6. propreté ── */
  section('6. Propreté');
  const vraiesErreurs = bruit.filter(t => !/net::|Failed to load resource|theologicus|quran/i.test(t));
  ok('aucune erreur JS non attendue', vraiesErreurs.length === 0, vraiesErreurs.slice(0, 2).join(' | '));

  const passe = resultats.filter(r => r.pass).length;
  console.log('\nRESULTAT : ' + passe + '/' + resultats.length);
  await browser.close();
  H.killRelay(relais);
  process.exit(passe === resultats.length ? 0 : 3);
})().catch(e => { console.error(e); process.exit(3); });
