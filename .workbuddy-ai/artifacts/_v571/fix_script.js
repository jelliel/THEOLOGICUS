/* corrige le script d'édition (4e passe) — cibles construites par morceaux nommés */
const fs = require('fs');
let s = fs.readFileSync('C:/tmp/theoverify/.workbuddy-ai/artifacts/_v571/apply_edits_v571.js', 'utf8');
const D = '"';          /* guillemet */
const A = "'";          /* apostrophe */
const BS = '\\';        /* antislash */
const QUOT = '&q' + 'u' + 'o' + 't' + ';';   /* l'entité HTML, écrite par morceaux */

/* 1. esc :  "/g, """   ->   "/g, """   (avec l'entité HTML comme remplacement) */
const escOld = [D, '/g, ', D, D, D].join('');
const escNew = [D, '/g, ', D, QUOT, D].join('');
console.log('escOld =', JSON.stringify(escOld));
console.log('escNew =', JSON.stringify(escNew));
const nEsc = s.split(escOld).length - 1;
if (nEsc !== 1) { console.error('esc trouvé ' + nEsc + ' fois'); process.exit(1); }
s = s.replace(escOld, escNew);

/* 2. title : ré-échapper les apostrophes pour la chaîne à simple apostrophe */
const tOld = 'THEOLOGICUS (' + A + A + ' = modèle actif';
const tNew = 'THEOLOGICUS (' + BS + A + BS + A + ' = modèle actif';
const nT = s.split(tOld).length - 1;
if (nT === 1) s = s.replace(tOld, tNew);
else if (nT === 0) console.log('title déjà corrigé');
else { console.error('title trouvé ' + nT + ' fois'); process.exit(1); }

fs.writeFileSync('C:/tmp/theoverify/.workbuddy-ai/artifacts/_v571/apply_edits_v571.js', s, 'utf8');
console.log('script corrigé');
