/* AUDIT — chaque z-index numerique >= 100000 est-il un MODAL/BANDEAU legitime,
   ou un element de CONTENU qui pourrait masquer une fiche de mot ?

   Enjeu : `--z-bulle:100000` pour les bulles d'annotation, `--z-mot:9500` pour
   les fiches. Un element de contenu au-dessus de 100000 masquerait une fiche.
   Un modal AU-DESSUS de tout est normal (il bloque l'interaction).

   On ne devine pas : on lit la ligne et on cherche un marqueur de modal.
*/
'use strict';
const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'THEOLOGICUS.html', 'utf8').split('\n');
const re = /z-index:\s*(\d{6,})/;
const MOTS_MODAL = /inset:\s*0|display:\s*flex|align-items:\s*center|justify-content:\s*center|backdrop-filter|rgba\(2,6,12|rgba\(0,0,0|overlay|modal|bandeau|banner|boite|popup|toast|notif|erreur|error/i;
const MOTS_CONTENU = /tip|bulle|fiche|panneau|verse|verset|sourate|tooltip|citation|phrase|mot/i;

const lignes = [];
src.forEach((l, i) => {
  const m = re.exec(l);
  if (!m) return;
  lignes.push({ l: i + 1, z: parseInt(m[1], 10), t: l.trim() });
});
lignes.sort((a, b) => b.z - a.z);

console.log('=== z-index numeriques >= 100000 (au-dessus de --z-bulle) ===\n');
let suspects = 0;
lignes.forEach(h => {
  const modal = MOTS_MODAL.test(h.t);
  /* on ne s'alarme que si le mot de contenu est present SANS marqueur de modal */
  const contenu = MOTS_CONTENU.test(h.t);
  const verdict = modal ? 'MODAL/BANDEAU  (au-dessus de tout : normal)'
    : (contenu ? '>>> SUSPECT : contenu au-dessus des fiches' : '>>> A EXAMINER');
  if (!modal) suspects++;
  console.log(String(h.z).padStart(8) + '  l.' + String(h.l).padStart(6) + '  ' + verdict);
  console.log('          ' + h.t.slice(0, 150));
  console.log('');
});
console.log('=== RESULTAT ===');
console.log('declarations >= 100000 : ' + lignes.length);
console.log('non classees MODAL     : ' + suspects);
process.exit(suspects === 0 ? 0 : 1);
