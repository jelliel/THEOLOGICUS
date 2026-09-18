/* THEOLOGICUS 2.0 - generateur de table de versification.
 *
 * Lit les tranches bible/b<N>.js et quran/q<N>.js et produit deux fichiers
 * de metadonnees : pour chaque chapitre (ou sourate), le NOMBRE de versets.
 *
 * Pourquoi : le verificateur de citations doit pouvoir repondre a
 * "Jean 3:37 existe-t-il ?" SANS charger les 4,3 Mo du corpus. La table est
 * derivee du corpus, jamais saisie a la main, donc elle ne peut pas deriver.
 *
 * Usage : node tools/build_versification.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

/* Les tranches s'executent avec un objet `window` factice. */
function evalSlice(file) {
  const src = fs.readFileSync(file, 'utf8');
  const win = {};
  new Function('window', src)(win);
  return win;
}

function buildBible() {
  const counts = {};
  let missing = [];
  for (let b = 1; b <= 66; b++) {
    const file = path.join(ROOT, 'bible', 'b' + b + '.js');
    if (!fs.existsSync(file)) { missing.push(b); continue; }
    const win = evalSlice(file);
    const book = win.__bibleBooks && win.__bibleBooks[b];
    if (!book) { missing.push(b); continue; }
    const perChapter = {};
    Object.keys(book).forEach(function (ch) {
      perChapter[ch] = Object.keys(book[ch]).length;
    });
    counts[b] = perChapter;
  }
  return { counts: counts, missing: missing };
}

function buildQuran() {
  const counts = {};
  let missing = [];
  for (let p = 1; p <= 114; p++) {
    const file = path.join(ROOT, 'quran', 'q' + p + '.js');
    if (!fs.existsSync(file)) { missing.push(p); continue; }
    const win = evalSlice(file);
    const surah = win.__quranSurahs && win.__quranSurahs[p];
    if (!surah || !surah.versets) { missing.push(p); continue; }
    counts[p] = Object.keys(surah.versets).length;
  }
  return { counts: counts, missing: missing };
}

const bible = buildBible();
const quran = buildQuran();

const header = function (what) {
  return '/* THEOLOGICUS 2.0 - table de versification, GENERE par\n'
    + '   tools/build_versification.js depuis ' + what + '. NE PAS EDITER A LA MAIN :\n'
    + '   regenerer apres toute modification du corpus. */\n';
};

fs.writeFileSync(path.join(ROOT, 'bible', 'versification.js'),
  header('bible/b1..b66.js') +
  'window.__bibleVerseCounts = ' + JSON.stringify(bible.counts) + ';\n', 'utf8');

fs.writeFileSync(path.join(ROOT, 'quran', 'versification.js'),
  header('quran/q1..q114.js') +
  'window.__quranVerseCounts = ' + JSON.stringify(quran.counts) + ';\n', 'utf8');

const nbChapters = Object.values(bible.counts).reduce(function (s, c) { return s + Object.keys(c).length; }, 0);
const nbVerses = Object.values(bible.counts).reduce(function (s, c) {
  return s + Object.values(c).reduce(function (a, n) { return a + n; }, 0);
}, 0);
const nbQuranVerses = Object.values(quran.counts).reduce(function (a, n) { return a + n; }, 0);

console.log('bible  : ' + Object.keys(bible.counts).length + ' livres, ' + nbChapters + ' chapitres, ' + nbVerses + ' versets');
console.log('coran  : ' + Object.keys(quran.counts).length + ' sourates, ' + nbQuranVerses + ' versets');
if (bible.missing.length) console.log('!! livres bible manquants : ' + bible.missing.join(', '));
if (quran.missing.length) console.log('!! sourates coran manquantes : ' + quran.missing.join(', '));

/* Controle croise : chaque chapitre annonce doit exister dans la tranche, et
   le compte doit correspondre. On relit tout et on compare. */
let mismatch = 0;
for (let b = 1; b <= 66; b++) {
  if (!bible.counts[b]) continue;
  const win = evalSlice(path.join(ROOT, 'bible', 'b' + b + '.js'));
  const book = win.__bibleBooks[b];
  Object.keys(bible.counts[b]).forEach(function (ch) {
    const reel = Object.keys(book[ch]).length;
    if (reel !== bible.counts[b][ch]) {
      console.log('!! divergence livre ' + b + ' chapitre ' + ch + ' : table=' + bible.counts[b][ch] + ' corpus=' + reel);
      mismatch++;
    }
  });
}
for (let p = 1; p <= 114; p++) {
  if (!quran.counts[p]) continue;
  const win = evalSlice(path.join(ROOT, 'quran', 'q' + p + '.js'));
  const reel = Object.keys(win.__quranSurahs[p].versets).length;
  if (reel !== quran.counts[p]) {
    console.log('!! divergence sourate ' + p + ' : table=' + quran.counts[p] + ' corpus=' + reel);
    mismatch++;
  }
}
console.log(mismatch === 0 ? 'controle croise : OK (0 divergence)' : 'controle croise : ' + mismatch + ' DIVERGENCE(S)');

const szB = fs.statSync(path.join(ROOT, 'bible', 'versification.js')).size;
const szQ = fs.statSync(path.join(ROOT, 'quran', 'versification.js')).size;
console.log('taille : bible/versification.js = ' + szB + ' o, quran/versification.js = ' + szQ + ' o');
