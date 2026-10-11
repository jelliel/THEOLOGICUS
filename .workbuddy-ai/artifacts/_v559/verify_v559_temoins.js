/* ═══════════════════════════════════════════════════════════════════════
   Banc v559 — TÉMOINS DU VERSET v422 + APERÇU MANUSCRITS v426 + v420.

   Vérifie (tables embarquées = spécification, apparat Nestle-Aland 28/UBS5) :
     1. __msRefHtml PUR : couverture par plages [livre,ch1,v1,ch2,v2] avec
        lacunes `e` — Jn 3:16 → 9 témoins (𝔓66, 𝔓75 + 7 grands codex),
        aucune variante ; Mc 16:19 → Sinaiticus/Vaticanus EXCLUS (lacune
        16:9-20) + note « Fin longue de Marc » ; 1 Jn 5:7 → 3 témoins +
        note « Comma Johanneum » ; Is 7:14 → ordre des groupes (Qumrân →
        Codex hébreu → Codex) + mention « fragments » du Codex d'Alep.
     2. Mesure documentée : la branche « note seule » (total=0) est MORTE —
        le Codex Ephraemi (04) couvre tout le NT sans lacune et le
        Leningradensis tout l'AT : total=0 n'arrive que pour une référence
        invalide (garde testée).
     3. Pastilles v426 : class="ms-chip", data-msapercu = Commons
        Special:FilePath ?width=560, msgrand=1600, msfull sans largeur,
        lien Wikipédia FR encodé, title « clic pour agrandir »,
        pointer-events:auto (l'infobulle est pointer-events:none).
     4. __msCommons : URL exacte (encodage, paramètre width, repli sans).
     5. SURVOL réel (moteur v426) : mouseover sur une pastille (image
        data: — AUCUN réseau Wikimedia en CI) → carte #ms-apercu affichée
        (titre, sous-titre, img) ; mouseout → carte cachée (délai 90 ms).
     6. CLIC réel : la pastille ouvre la visionneuse v420
        (__msv2OuvrirList) avec le TITRE de la pastille cliquée, et la
        navigation ‹ passe au témoin précédent de la MÊME infobulle.
   ═══════════════════════════════════════════════════════════════════ */
const H = require('../../../tools/bench_common.js');
const { chromium } = require('playwright');

const resultats = [];
function section(t) { console.log('\n■ ' + t); }
function ok(label, cond, detail) {
  resultats.push({ label, pass: !!cond });
  console.log((cond ? '  [OK]   ' : '  [ECHEC]') + ' ' + label + (detail ? ' — ' + detail : ''));
}

(async () => {
  const port = await H.pickFreePort();
  /* Magasin ISOLÉ (leçon v558-CI) : sans localAppData, le relais sert le vrai
     magasin de la machine — non déterministe entre dev et CI. */
  const os = require('os'), pathM = require('path'), fsM = require('fs');
  const STORE_DIR = pathM.join(os.tmpdir(), 'theo_v559_store_' + Date.now());
  try { fsM.mkdirSync(STORE_DIR, { recursive: true }); } catch (e) {}
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

  /* ── 1. couverture pure ── */
  section('1. v422 : __msRefHtml — couverture par plages et lacunes');
  const jn = await page.evaluate(() => window.__msRefHtml({ book: '43', ch: '3', v1: '16' }));
  ok('Jn 3:16 : 9 pastilles de témoins',
     (jn.match(/class="ms-chip"/g) || []).length === 9, 'n=' + (jn.match(/class="ms-chip"/g) || []).length);
  ok('Jn 3:16 : 𝔓66 et 𝔓75 (papyrus) présents',
     jn.indexOf('𝔓66') !== -1 && jn.indexOf('𝔓75') !== -1);
  ok('Jn 3:16 : les 7 grands codex présents',
     ['Sinaiticus', 'Alexandrinus', 'Vaticanus', 'Ephraemi', 'Bezae', 'Washingtonianus', 'Regius']
       .every(n => jn.indexOf(n) !== -1));
  ok('Jn 3:16 : AUCUNE variante notée', jn.indexOf('Variante notable') === -1);

  const mc = await page.evaluate(() => window.__msRefHtml({ book: '41', ch: '16', v1: '19' }));
  /* les NOMS de témoins apparaissent aussi DANS le texte de la note de
     variante (« ABSENTE des plus anciens (Sinaiticus 01, Vaticanus 03) ») :
     on ne juge que la zone des pastilles, avant la note. */
  const mcCorps = mc.split('Variante notable')[0];
  ok('Mc 16:19 : Sinaiticus et Vaticanus EXCLUS (lacune 16:9-20)',
     mcCorps.indexOf('Sinaiticus') === -1 && mcCorps.indexOf('Vaticanus') === -1,
     'pastilles=' + (mcCorps.match(/class="ms-chip"/g) || []).length);
  ok('Mc 16:19 : Alexandrinus et Bezae présents', mc.indexOf('Alexandrinus') !== -1 && mc.indexOf('Bezae') !== -1);
  ok('Mc 16:19 : note « Fin longue de Marc » (absente des plus anciens)',
     mc.indexOf('Fin longue de Marc') !== -1 && mc.indexOf('ABSENTE des plus anciens') !== -1);

  const comma = await page.evaluate(() => window.__msRefHtml({ book: '62', ch: '5', v1: '7' }));
  ok('1 Jn 5:7 : 3 témoins (01, 02, 04) + note « Comma Johanneum »',
     (comma.match(/class="ms-chip"/g) || []).length === 3 &&
     comma.indexOf('Comma Johanneum') !== -1,
     'n=' + (comma.match(/class="ms-chip"/g) || []).length);

  const is = await page.evaluate(() => window.__msRefHtml({ book: '23', ch: '7', v1: '14' }));
  const q = is.indexOf('Qumrân'), ch = is.indexOf('Codex hébreu'), cx = is.indexOf('Codex :');
  ok('Is 7:14 : ordre des groupes Qumrân → Codex hébreu → Codex',
     q !== -1 && ch !== -1 && cx !== -1 && q < ch && ch < cx,
     'q=' + q + ' ch=' + ch + ' cx=' + cx);
  ok('Is 7:14 : 1QIsaᵃ (Qumrân) et Alep « fragments »',
     is.indexOf('1QIsa') !== -1 && is.indexOf('fragments') !== -1);
  ok('Is 7:14 : AUCUN papyrus (groupe absent)', is.indexOf('Papyrus :') === -1);
  ok('pied d\'apparat Nestle-Aland présent', is.indexOf('Nestle-Aland 28 / UBS5') !== -1);

  /* ── 2. branches mortes et gardes (mesure) ── */
  section('2. Gardes : références invalides → chaîne vide');
  const gardes = await page.evaluate(() => [
    window.__msRefHtml(null),
    window.__msRefHtml({}),
    window.__msRefHtml({ book: 'x', ch: '3', v1: '16' }),
    window.__msRefHtml({ book: '43', ch: '3' })
  ].every(r => r === ''));
  ok('null / vide / livre non numérique / sans verset → \'\'', gardes);

  /* ── 3. pastilles v426 ── */
  section('3. Pastilles : attributs Commons + Wikipédia (v426)');
  const chips = await page.evaluate(() => {
    const h = window.__msRefHtml({ book: '43', ch: '3', v1: '16' });
    const m = h.match(/<span class="ms-chip"([^>]*)>/);
    return { premier: m ? m[1] : '', n: (h.match(/class="ms-chip"/g) || []).length };
  });
  ok('la première pastille porte data-msapercu (Special:FilePath, largeur 560)',
     chips.premier.indexOf('data-msapercu="https://commons.wikimedia.org/wiki/Special:FilePath/Papyrus66.jpg?width=560"') !== -1,
     chips.premier.slice(0, 110));
  ok('data-msgrand en 1600 et data-msfull SANS largeur',
     chips.premier.indexOf('?width=1600') !== -1 &&
     /data-msfull="https:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\/Papyrus66\.jpg"/.test(chips.premier));
  ok('lien Wikipédia FR encodé + titre « clic pour agrandir »',
     chips.premier.indexOf('data-mslien="https://fr.wikipedia.org/wiki/Papyrus%2066"') !== -1 &&
     chips.premier.indexOf('clic pour agrandir') !== -1);
  const commons = await page.evaluate(() => [
    window.__msCommons('Great Isaiah Scroll.jpg', 560),
    window.__msCommons('Codex Vaticanus B.jpg', 0),
    window.__msCommons('File:Prefixed Name.jpg')
  ]);
  ok('__msCommons : encodage + width, repli sans largeur, préfixe File: retiré',
     commons[0] === 'https://commons.wikimedia.org/wiki/Special:FilePath/Great%20Isaiah%20Scroll.jpg?width=560' &&
     commons[1] === 'https://commons.wikimedia.org/wiki/Special:FilePath/Codex%20Vaticanus%20B.jpg' &&
     commons[2] === 'https://commons.wikimedia.org/wiki/Special:FilePath/Prefixed%20Name.jpg',
     commons[0].slice(-40));

  /* ── 4. survol réel (image data: — zéro réseau) ── */
  section('4. v426 : survol d\'une pastille → carte #ms-apercu');
  const survol = await page.evaluate(() => {
    const tip = document.createElement('div');
    tip.id = 'banc-tip';
    tip.style.cssText = 'position:fixed;left:80px;top:80px;width:420px;height:160px;background:#0a1420;padding:10px';
    tip.innerHTML = '<span class="ms-chip" ' + window.__msChipAttrs({
      apercu: 'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=',   // 1px — aucun réseau
      grand: 'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=',
      full: 'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=',
      titre: 'Banc — 𝔓52', sous: 'c. 125-175', wiki: 'P52.png',
      lien: '', lienTxt: ''
    }) + ' style="pointer-events:auto">𝔓52 (essai)</span>';
    document.body.appendChild(tip);
    const chipEl = tip.querySelector('.ms-chip');
    chipEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    const carte = document.getElementById('ms-apercu');
    return {
      apparait: !!carte && carte.style.display === 'block',
      titre: carte ? carte.querySelector('#ms-apercu-t').textContent : '',
      sous: carte ? carte.querySelector('#ms-apercu-s').textContent : '',
      src: carte ? carte.querySelector('img').getAttribute('src') : ''
    };
  });
  ok('le survol affiche la carte #ms-apercu', survol.apparait);
  ok('titre et sous-titre de la pastille repris', survol.titre === 'Banc — 𝔓52' && survol.sous === 'c. 125-175',
     survol.titre + ' / ' + survol.sous);
  ok('l\'image pointe l\'aperçu de la pastille (aucun réseau)',
     survol.src.indexOf('data:image/gif;base64') === 0, survol.src.slice(0, 30));
  const cache = await page.evaluate(() => new Promise(res => {
    document.querySelector('#banc-tip .ms-chip')
      .dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    setTimeout(() => {
      const carte = document.getElementById('ms-apercu');
      res(carte && carte.style.display === 'none');
    }, 250);   /* délai d'armement 90 ms + marge */
  }));
  ok('la sortie de pastille masque la carte (délai 90 ms respecté)', cache);

  /* ── 5. clic réel → visionneuse v420 ── */
  section('5. Clic pastille → visionneuse v420 (les 2 témoins de la même bulle)');
  const vision = await page.evaluate(() => {
    const tip = document.getElementById('banc-tip');
    tip.querySelector('.ms-chip').insertAdjacentHTML('afterend',
      '<span class="ms-chip" ' + window.__msChipAttrs({
        /* data-URI DISTINCTE de la 1ʳᵉ pastille : l'index de la visionneuse
           est résolu par ÉGALITÉ de data-msapercu — deux pastilles identiques
           résoudraient toujours vers la première. */
        apercu: 'data:image/gif;base64,R0lGODlhAQABAIAAAP8AAP///yH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==',
        grand: 'data:image/gif;base64,R0lGODlhAQABAIAAAP8AAP///yH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==',
        full: 'data:image/gif;base64,R0lGODlhAQABAIAAAP8AAP///yH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==',
        titre: 'Banc — Codex 01', sous: 'IVe s.', wiki: 'X.png', lien: '', lienTxt: ''
      }) + ' style="pointer-events:auto">Codex 01 (essai)</span>');
    tip.querySelectorAll('.ms-chip')[1].click();
    const el = document.querySelector('#msv2-titre');
    return { titre: el ? el.textContent : '', on: el ? !!el.closest('.on') : false };
  });
  ok('le clic ouvre la visionneuse sur le TÉMOIN CLIQUÉ', vision.on && vision.titre === 'Banc — Codex 01',
     'titre=' + vision.titre);
  const nav = await page.evaluate(() => {
    const titre0 = document.querySelector('#msv2-titre').textContent;
    const prev = document.getElementById('msv2-prev');
    if (!prev) return { ok: false };
    prev.click();
    const titre1 = document.querySelector('#msv2-titre').textContent;
    return { ok: true, titre0, titre1 };
  });
  ok('la navigation ‹ passe au TÉMOIN PRÉCÉDENT de la même infobulle',
     nav.ok && nav.titre1 === 'Banc — 𝔓52' && nav.titre1 !== nav.titre0,
     nav.titre0 + ' → ' + nav.titre1);

  /* ── 6. propreté ── */
  section('6. Propreté');
  const vraiesErreurs = bruit.filter(t => !/net::|Failed to load resource|theologicus|wikimedia/i.test(t));
  ok('aucune erreur JS non attendue', vraiesErreurs.length === 0, vraiesErreurs.slice(0, 2).join(' | '));

  const passe = resultats.filter(r => r.pass).length;
  console.log('\nRESULTAT : ' + passe + '/' + resultats.length);
  await browser.close();
  H.killRelay(relais);
  process.exit(passe === resultats.length ? 0 : 3);
})().catch(e => { console.error(e); process.exit(3); });
