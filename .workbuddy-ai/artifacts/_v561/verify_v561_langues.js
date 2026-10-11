/* ═══════════════════════════════════════════════════════════════════════
   Banc v561 — OUTILS DE LANGUE : hébreu v89, grec v90, latin v91.

   Ferme les derniers trous R3 (même famille que le banc v560 arabe).
   Corpus RÉELS servis par le relais, exécutés en bac à sable Node pour
   calculer les attendus (méthode v549) :

   1. v89 HÉBREU (Gn 1:1, AT seulement) — __hbRemplir({book,ch,v1,v2},
      panneau à #hb-slot) : ligne RTL, un .hb par mot du corpus
      biblehb/b1.js (« Hébreu|translit|Strong|morph »), data-* conformes,
      flèche ← + sous-légende ; fiche #hb-tip au clic : translittération,
      Lemme Strong (biblehb/strongs.js), Sens FR (trad. auto.) + source
      (en), Analyse (décodage PARTIEL du code Westminster — le code brut
      reste affiché), notice Westminster/Strong GPL.
   2. analyser PUR : HVqp3ms → verbe, qal, parfait… ; HNcfsa → nom… ;
      particule ; code inconnu → '' (jamais d'analyse inventée).
   3. v90 GREC (Jn 1:1, NT) — le wrapper v91 route __hbRemplir vers le
      grec : .gr data-g, flèche → (LTR) ; fiche #gr-tip avec Lemme Strong
      (biblegr/strongs.js, comparé DYNAMIQUEMENT au corpus chargé) et code
      MorphGNT brut.
   4. v91 LATIN (Denzinger) — __latLigne(p, 'denzinger') wrappe chaque mot
      en .lat[data-w] ; un paragraphe NON latin n'est PAS wrappé ; clic →
      #lat-tip : analyses de latin/mots.js (Whitaker's Words, 20 263
      entrées — jusqu'à 4 pour une forme ambiguë), FR « trad. auto. » +
      source (en) ; forme OCR absente (« symbob ») → « Aucune analyse
      disponible » + note de numérisation (jamais d'analyse inventée).
   5. Gardes : panneau sans #hb-slot → rien ; verset ABSENT du corpus
      (Ps 51, un des 8 chapitres désalignés exclus par conception) →
      aucun .hb (RÈGLE D'OR : absent plutôt que désaligné).
   6. v86 ANNOTER-UN-MOT : compterOcc (rang d'occurrence, frontières de
      mots, accents), contexteDuMot au point (mot + msgTs NOMBRE + occ) et
      ouvrir() → window._atcSel {text, msgTs, occ, w:1} consommé par les
      12 actions de la bulle d'annotation (bulle DOUBLÉE).
   Magasin isolé (localAppData) — règle v559. Aucun réseau externe.
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
function ch(p) {
  const c = { window: {} };
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(p, 'utf8'), c, { timeout: 10000 });
  return c.window;
}

(async () => {
  /* ── attendus (corpus réels) ── */
  const hb = ch(path.join(process.cwd(), 'biblehb', 'b1.js'));
  const TXT_HB = hb.__bibleHb[1][1][1];
  const MOTS_HB = TXT_HB.split(' ').filter(Boolean).map(w => w.split('|'));
  const st = ch(path.join(process.cwd(), 'biblehb', 'strongs.js'));
  const ST1 = st.__strongsHb[MOTS_HB[0][2]] || st.__strongsHb[MOTS_HB[0][2].replace(/^H/, '')];
  const gr = ch(path.join(process.cwd(), 'biblegr', 'b43.js'));
  const TXT_GR = gr.__bibleGr[43][1][1];
  const MOTS_GR = TXT_GR.split(' ').filter(Boolean).map(w => w.split('|'));
  const ps = ch(path.join(process.cwd(), 'biblehb', 'b19.js'));
  const PS51_ABSENT = !ps.__bibleHb[19][51];
  const lat = ch(path.join(process.cwd(), 'latin', 'mots.js'));
  const NB_LAT = Object.keys(lat.__latinMots).length;
  console.log('attendus : hébreu Gn 1:1 = ' + MOTS_HB.length + ' mots · grec Jn 1:1 = ' +
    MOTS_GR.length + ' tokens · latin ' + NB_LAT + ' entrées · Ps 51 absent = ' + PS51_ABSENT);

  const port = await H.pickFreePort();
  const STORE_DIR = path.join(os.tmpdir(), 'theo_v561_store_' + Date.now());
  try { fs.mkdirSync(STORE_DIR, { recursive: true }); } catch (e) {}
  const relais = await H.spawnRelay({ port, localAppData: STORE_DIR });
  const BASE = 'http://127.0.0.1:' + port + '/THEOLOGICUS.html';
  const browser = await H.launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const bruit = [];
  page.on('console', m => { if (m.type() === 'error') bruit.push(m.text()); });
  page.on('pageerror', e => bruit.push(String(e)));
  await page.addInitScript(H.isolationInit);
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await H.adminLogin(page, H.AUTH_HASH);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(1500);

  /* ── 1. hébreu ── */
  section('1. v89 : ligne hébraïque de Gn 1:1 dans un panneau à #hb-slot');
  const hb1 = await page.evaluate((attendus) => {
    const panneau = document.createElement('div');
    panneau.id = 'banc-hb';
    panneau.style.cssText = 'position:fixed;left:340px;top:40px;width:880px;background:#0a1420;padding:12px;z-index:999998';
    panneau.innerHTML = '<div id="hb-slot"></div>';
    document.body.appendChild(panneau);
    window.__hbRemplir({ book: '1', ch: '1', v1: '1', v2: '1' }, panneau);
    return new Promise(res => setTimeout(() => {
      const slot = panneau.querySelector('#hb-slot');
      const spans = slot.querySelectorAll('.hb[data-h]');
      res({
        n: spans.length,
        h0: spans[0] && spans[0].getAttribute('data-h'),
        t0: spans[0] && spans[0].getAttribute('data-t'),
        s0: spans[0] && spans[0].getAttribute('data-s'),
        m0: spans[0] && spans[0].getAttribute('data-m'),
        debut: spans[0] && spans[0].classList.contains('hb-debut'),
        fleche: !!slot.querySelector('.hb-sens'),
        sous: slot.textContent.indexOf('on commence ici') !== -1
      });
    }, 1200));
  }, MOTS_HB);
  ok('un .hb par mot du corpus (' + MOTS_HB.length + ')', hb1.n === MOTS_HB.length, 'n=' + hb1.n);
  ok('le premier mot porte data-h/t/s/m conformes au corpus',
     hb1.h0 === MOTS_HB[0][0] && hb1.t0 === MOTS_HB[0][1] &&
     hb1.s0 === MOTS_HB[0][2] && hb1.m0 === MOTS_HB[0][3],
     JSON.stringify([hb1.h0, hb1.t0, hb1.s0, hb1.m0]));
  ok('premier mot hb-debut + flèche de sens + « on commence ici »',
     hb1.debut && hb1.fleche && hb1.sous);

  section('2. Fiche hébraïque #hb-tip au clic');
  await page.click('#banc-hb .hb[data-h="' + MOTS_HB[0][0].replace(/"/g, '"') + '"]');
  await page.waitForFunction(() => {
    const t = document.getElementById('hb-tip');
    return t && t.style.display === 'block' && t.querySelector('.hb-lem');
  }, { timeout: 15000 });
  const ficheHb = await page.evaluate(() => {
    const t = document.getElementById('hb-tip');
    return {
      mot: t.querySelector('.hb-mot').textContent,
      translit: t.textContent.indexOf('bereʾšit') !== -1,
      lemme: (t.querySelector('.hb-lem') || {}).textContent || '',
      strong: t.textContent.indexOf('7225') !== -1,
      fr: t.textContent.indexOf('trad. auto.') !== -1 && t.textContent.indexOf('Début') !== -1,
      en: t.textContent.indexOf('beginning') !== -1,
      ana: (t.textContent.match(/Analyse([\s\S]*?)code /) || [])[1] || '',
      code: t.textContent.indexOf('HR/Ncfsa') !== -1,
      notice: t.textContent.indexOf('Westminster Leningrad Codex') !== -1 &&
              t.textContent.indexOf('GPL 3.0') !== -1
    };
  });
  ok('la fiche affiche le mot hébreu cliqué', ficheHb.mot === MOTS_HB[0][0], JSON.stringify(ficheHb.mot));
  ok('translittération « bereʾšit » (corpus)', ficheHb.translit);
  ok('Lemme Strong ' + JSON.stringify(ST1[0]) + ' (biblehb/strongs.js)', ficheHb.lemme === ST1[0], ficheHb.lemme);
  ok('référence Strong 7225 affichée (lien concordance)', ficheHb.strong);
  ok('Sens FR « Début… » (trad. auto.) + source (en) « beginning »', ficheHb.fr && ficheHb.en);
  ok('Analyse partielle : « nom, commun, masculin, singulier, avec préfixe »',
     ficheHb.ana.indexOf('nom') !== -1 && ficheHb.ana.indexOf('avec préfixe') !== -1, ficheHb.ana.trim());
  ok('code brut Westminster conservé (HR/Ncfsa)', ficheHb.code);
  ok('notice Westminster Leningrad Codex + Strong GPL 3.0', ficheHb.notice);

  /* ── 3. analyser pur ── */
  section('3. v89 : analyser() — décodage volontairement partiel du code WLC');
  const analyses = await page.evaluate(() => {
    const A = window.__hbV89.analyser;
    return {
      verbe: A('HVqp3ms'), nom: A('HNcfsa'), part: A('HTo'),
      inconnu: A('ZZzzzz')
    };
  });
  ok('HVqp3ms → verbe, qal, parfait, 3e pers. masculin singulier',
     analyses.verbe === 'verbe, qal, parfait, 3e pers. masculin singulier', analyses.verbe);
  ok('HNcfsa → nom, commun, féminin, singulier, absolu',
     analyses.nom === 'nom, commun, féminin, singulier, absolu', analyses.nom);
  ok('HTo → particule', analyses.part === 'particule', analyses.part);
  ok('code inconnu → \'\' (jamais d\'analyse inventée)', analyses.inconnu === '', JSON.stringify(analyses.inconnu));

  /* ── 4. grec (routing v91) ── */
  section('4. v90/v91 : Jn 1:1 routé vers le GREC (wrapper __hbRemplir)');
  const gr1 = await page.evaluate(() => {
    const panneau = document.createElement('div');
    panneau.id = 'banc-gr';
    panneau.style.cssText = 'position:fixed;left:340px;top:40px;width:880px;background:#0a1420;padding:12px;z-index:999998';
    panneau.innerHTML = '<div id="hb-slot"></div>';
    document.body.appendChild(panneau);
    window.__hbRemplir({ book: '43', ch: '1', v1: '1', v2: '1' }, panneau);
    return new Promise(res => setTimeout(() => {
      const slot = panneau.querySelector('#hb-slot');
      const spans = slot.querySelectorAll('.gr[data-g]');
      res({
        n: spans.length,
        g0: spans[0] && spans[0].getAttribute('data-g'),
        t0: spans[0] && spans[0].getAttribute('data-t'),
        s0: spans[0] && spans[0].getAttribute('data-s'),
        fleche: slot.querySelector('.gr-sens') ? slot.querySelector('.gr-sens').textContent : '',
        sous: slot.textContent.indexOf('on commence ici') !== -1,
        pasHebreu: slot.querySelectorAll('.hb[data-h]').length === 0
      });
    }, 1200));
  });
  ok('le NT est routé vers le GREC : ' + MOTS_GR.length + ' tokens .gr, AUCUN .hb',
     gr1.n === MOTS_GR.length && gr1.pasHebreu, 'n=' + gr1.n);
  ok('le premier token = Ἐν (data-g/t/s conformes au corpus)',
     gr1.g0 === MOTS_GR[0][0] && gr1.t0 === MOTS_GR[0][1] && gr1.s0 === MOTS_GR[0][2],
     JSON.stringify([gr1.g0, gr1.t0, gr1.s0]));
  ok('flèche → (le grec se lit de gauche à droite)', gr1.fleche === '→' && gr1.sous);
  await page.click('#banc-gr .gr[data-g="' + MOTS_GR[0][0].replace(/"/g, '"') + '"]');
  await page.waitForFunction(() => {
    const t = document.getElementById('gr-tip');
    return t && t.style.display === 'block';
  }, { timeout: 15000 });
  const ficheGr = await page.evaluate(() => {
    const t = document.getElementById('gr-tip');
    const st = window.__strongsGr || {};
    const s = '1722';
    const attendu = st[s] ? st[s][0] : null;
    const attenduBrut = (window.__grV90 && window.__grV90.brut) ? String(window.__grV90.brut('P---------')) : '';
    return {
      mot: (t.querySelector('.gr-mot') || {}).textContent || '',
      strong: t.textContent.indexOf('1722') !== -1,
      lemmeAttendu: attendu,
      lemmeOk: attendu ? t.textContent.indexOf(attendu) !== -1 : true,
      ana: t.textContent.indexOf('Analyse') !== -1,
      brutAttendu: attenduBrut,
      tipContientBrut: attenduBrut !== '' ? t.textContent.indexOf(attenduBrut) !== -1 : false
    };
  });
  ok('la fiche grecque affiche le mot cliqué (Ἐν)', ficheGr.mot === MOTS_GR[0][0], JSON.stringify(ficheGr.mot));
  ok('Strong 1722 + lemme conforme au strongs grec chargé', ficheGr.strong && ficheGr.lemmeOk,
     'attendu=' + JSON.stringify(ficheGr.lemmeAttendu));
  ok('code MorphGNT affiché via brut() (contrat v90 : code transformé)',
     ficheGr.ana && ficheGr.brutAttendu !== '' &&
     ficheGr.tipContientBrut === true, 'brut()=' + JSON.stringify(ficheGr.brutAttendu));

  /* ── 5. latin (v91) ── */
  section('5. v91 : latin du magistère — wrap, fiche, forme OCR absente');
  const lat1 = await page.evaluate(() => {
    const latin = window.__latLigne('Deus in principio', 'denzinger');
    const nonLatin = window.__latLigne('Ceci est du français', 'bible');
    return { latin, nonLatin,
             n: (latin.match(/class="lat" data-w="/g) || []).length };
  });
  ok('chaque mot latin est wrappé en .lat[data-w] (3 mots)',
     lat1.n === 3 && lat1.latin.indexOf('data-w="deus"') !== -1 &&
     lat1.latin.indexOf('data-w="principio"') !== -1, lat1.latin.slice(0, 80));
  ok('un paragraphe NON latin n\'est pas wrappé', lat1.nonLatin.indexOf('class="lat"') === -1);
  await page.evaluate(() => {
    const b = document.createElement('div');
    b.id = 'banc-lat';
    b.style.cssText = 'position:fixed;left:340px;top:40px;width:600px;background:#0a1420;padding:12px;z-index:999998';
    b.innerHTML = window.__latLigne('Deus Symbob in principio', 'denzinger');
    document.body.appendChild(b);
  });
  await page.click('#banc-lat .lat[data-w="deus"]');
  await page.waitForFunction(() => {
    const t = document.getElementById('lat-tip');
    return t && t.style.display === 'block';
  }, { timeout: 15000 });
  const ficheLat = await page.evaluate(() => {
    const t = document.getElementById('lat-tip');
    return {
      entete: t.textContent.indexOf('on commence ici') !== -1 && t.textContent.indexOf('latin') !== -1,
      mot: (t.querySelector('.lat-mot') || {}).textContent || '',
      ana: t.querySelectorAll('.lat-ana').length,
      fr: t.textContent.indexOf('trad. auto.') !== -1 && t.textContent.indexOf('dieu') !== -1,
      en: t.textContent.indexOf('source (en)') !== -1 && t.textContent.indexOf('God') !== -1
    };
  });
  ok('l\'en-tête de lecture latine est affiché', ficheLat.entete);
  ok('la fiche affiche le mot latin (Deus)', ficheLat.mot === 'Deus', ficheLat.mot);
  ok('les analyses Whitaker sont listées (≤ 4, forme ambiguë)', ficheLat.ana >= 1 && ficheLat.ana <= 4,
     'analyses=' + ficheLat.ana);
  ok('sens FR « dieu » (trad. auto.) + source (en) « God »', ficheLat.fr && ficheLat.en);
  await page.click('#banc-lat .lat[data-w="symbob"]');
  await page.waitForFunction(() =>
    document.getElementById('lat-tip').textContent.indexOf('Aucune analyse disponible') !== -1, { timeout: 15000 });
  const ocr = await page.evaluate(() => {
    const t = document.getElementById('lat-tip');
    return { vide: t.textContent.indexOf('Aucune analyse disponible pour cette forme.') !== -1,
             note: t.textContent.indexOf('numérisation') !== -1 };
  });
  ok('forme OCR absente du dictionnaire → « Aucune analyse disponible » (jamais inventée)', ocr.vide);
  ok('la note de numérisation 1911 est affichée', ocr.note);

  /* ── 6. gardes ── */
  section('6. Gardes : règle d\'or « absent plutôt que désaligné »');
  ok('Ps 51 est bien ABSENT du corpus hébreu (conception)', PS51_ABSENT);
  const garde = await page.evaluate(() => {
    const panneau = document.createElement('div');
    panneau.id = 'banc-garde';
    panneau.style.cssText = 'position:fixed;left:340px;top:40px;width:600px;background:#0a1420;padding:12px;z-index:999998';
    panneau.innerHTML = '<div id="hb-slot"></div>';
    document.body.appendChild(panneau);
    window.__hbRemplir({ book: '19', ch: '51', v1: '1', v2: '3' }, panneau);
    return new Promise(res => setTimeout(() => {
      const slot = panneau.querySelector('#hb-slot');
      res({ vide: slot.querySelectorAll('.hb').length === 0,
            sansSlot: (function () {
              const p2 = document.createElement('div');
              document.body.appendChild(p2);
              window.__hbRemplir({ book: '1', ch: '1', v1: '1', v2: '1' }, p2);
              return p2.querySelectorAll('.hb').length === 0;
            })() });
    }, 900));
  });
  ok('verset exclu (Ps 51) → AUCUN mot-à-mot affiché', garde.vide);
  ok('panneau sans #hb-slot → aucun rendu, aucune erreur', garde.sansSlot);

  /* ── 7. v86 : annoter UN SEUL MOT (rang d'occurrence — piège des répétitions) ── */
  section('7. v86 : annoter un mot — rang d\'occurrence + bulle (_atcSel)');
  const occ = await page.evaluate(() => {
    const C = window.__motV86;
    return {
      rang2: C.compterOcc('Dieu aime. ', 'dieu'),                    // usage réel : texte AVANT le mot
      accents: C.compterOcc('Dieu a créé. DIEU aime. ', 'dieu'),
      colle: C.compterOcc('dieudonné', 'dieu'),                        // frontière : non
      apostrophe: C.compterOcc("aujourd'hui", 'hui'),                  // ' = lettre : non
      tiret: C.compterOcc('porte-parole', 'parole')                    // - = lettre : non
    };
  });
  ok('compterOcc : rang de la 2e occurrence = 1', occ.rang2 === 1, 'occ=' + occ.rang2);
  ok('insensible à la casse et aux accents', occ.accents === 2, 'occ=' + occ.accents);
  ok('frontières de mots : « dieudonné » ne compte pas comme « dieu »', occ.colle === 0);
  ok("l'apostrophe est une lettre : « aujourd'hui » ne contient pas « hui »", occ.apostrophe === 0);
  ok('le tiret est une lettre : « porte-parole » ne contient pas « parole »', occ.tiret === 0);
  const mot8 = await page.evaluate(() => {
    /* bulle de message au format RÉEL : .message-content + id mc-<ts> */
    const b = document.createElement('div');
    b.className = 'message-content';
    b.id = 'mc-9000000001';
    b.style.cssText = 'position:fixed;left:340px;top:40px;width:600px;background:#0a1420;color:#e8e8e8;padding:14px;font-size:16px;z-index:999998';
    b.innerHTML = 'Seigneur <span id="banc-w2">Dieu</span> règne. Seigneur <span id="banc-w4">Dieu</span> aime.';
    document.body.appendChild(b);
    const r = document.getElementById('banc-w4').getBoundingClientRect();
    const ctx = window.__motV86.contexteDuMot(r.left + r.width / 2, r.top + r.height / 2);
    /* la bulle d'annotation est DOUBLÉE : ouvrir() doit remplir _atcSel */
    window.__atcRecu = null;
    window.__atcBubble = { show: function () { window.__atcRecu = window._atcSel; } };
    const ouvert = window.__motV86.ouvrir(ctx);
    return {
      word: ctx && ctx.word, msgTs: ctx && ctx.msgTs, occ: ctx && ctx.occ,
      ouvert: ouvert, sel: window._atcSel ? {
        text: window._atcSel.text, msgTs: window._atcSel.msgTs,
        occ: window._atcSel.occ, w: window._atcSel.w
      } : null, bubble: window.__atcRecu ? 'notifié' : 'non notifié'
    };
  });
  ok('le mot sous le point = « Dieu » (le 2e, pas le 1er)', mot8.word === 'Dieu');
  ok('le msgTs est le NOMBRE 9000000001 (égalité stricte onAddToChat)',
     mot8.msgTs === 9000000001, JSON.stringify(mot8.msgTs));
  ok('le rang d\'occurrence du 2e « Dieu » = 1 (le piège documenté du module)', mot8.occ === 1, 'occ=' + mot8.occ);
  ok('ouvrir() remplit _atcSel (text/msgTs/occ/w) et notifie la bulle',
     mot8.ouvert === true && mot8.sel && mot8.sel.text === 'Dieu' &&
     mot8.sel.msgTs === 9000000001 && mot8.sel.occ === 1 && mot8.sel.w === 1 &&
     mot8.bubble === 'notifié', JSON.stringify(mot8.sel));

  /* ── 8. propreté ── */
  section('8. Propreté');
  const vraiesErreurs = bruit.filter(t => !/net::|Failed to load resource|theologicus|bible|latin/i.test(t));
  ok('aucune erreur JS non attendue', vraiesErreurs.length === 0, vraiesErreurs.slice(0, 2).join(' | '));

  const passe = resultats.filter(r => r.pass).length;
  console.log('\nRESULTAT : ' + passe + '/' + resultats.length);
  await browser.close();
  H.killRelay(relais);
  process.exit(passe === resultats.length ? 0 : 3);
})().catch(e => { console.error(e); process.exit(3); });
