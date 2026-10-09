// theo_tests/test_coeur.js — TESTS UNITAIRES DU CŒUR (v504).
//
// Pourquoi ce fichier existe
// --------------------------
// THEOLOGICUS.html pèse ~1,4 Mo, embarque 78 modules et ~500 versions, mais sa
// logique SENSIBLE (parseur de références bibliques, normalisation des noms)
// n'était couverte que par des bancs Playwright bout-en-bout : lents et
// indirects. Ici, on EXTRAIT les fonctions pures du HTML et on les teste en
// Node : rapide, déterministe, exécutable en CI, sans navigateur.
//
// Si l'extraction échoue (source renommée/déplacée), le test ÉCHOUE — c'est
// volontaire : cela signale une dérive du contrat plutôt que de passer à vide.
//
// Usage : node theo_tests/test_coeur.js   (code de sortie 1 si un test échoue)

'use strict';
const fs = require('fs');
const path = require('path');

const HTML = path.join(__dirname, '..', 'THEOLOGICUS.html');
const src = fs.readFileSync(HTML, 'utf8');

/* ── extraction par accolades équilibrées ─────────────────────────────── */
function blocAccolades(texte, from) {
  const i = texte.indexOf('{', from);
  if (i < 0) return null;
  let d = 0;
  for (let j = i; j < texte.length; j++) {
    const c = texte[j];
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) return texte.slice(from, j + 1); }
  }
  return null;
}

function extraireCoeur(texte) {
  const iL = texte.indexOf('const LIVRES');
  const iN = texte.indexOf('const normNom');
  const iP = texte.indexOf('function parseRef(texte)');
  if (iL < 0 || iN < 0 || iP < 0) {
    throw new Error('contrat introuvable : LIVRES=' + iL + ' normNom=' + iN + ' parseRef=' + iP);
  }
  const liv = blocAccolades(texte, iL);
  const par = blocAccolades(texte, iP);
  const finN = texte.indexOf(';', iN);
  const norm = texte.slice(iN, finN + 1);
  if (!liv || !par || !norm) throw new Error('extraction incomplète');
  return liv + '\n' + norm + '\n' + par + '\nreturn { LIVRES: LIVRES, normNom: normNom, parseRef: parseRef };';
}

/* ── mini-harnais d'assertions ────────────────────────────────────────── */
let total = 0, echecs = 0;
function ok(nom, cond, detail) {
  total++;
  if (!cond) echecs++;
  console.log(`  ${cond ? '[OK]  ' : '[ECHEC]'} ${nom}${detail !== undefined ? '  -- ' + detail : ''}`);
}

/* ── exécution ────────────────────────────────────────────────────────── */
let coeur;
try {
  coeur = new Function(extraireCoeur(src))();
} catch (e) {
  console.error('EXTRACTION IMPOSSIBLE : ' + e.message);
  process.exit(2);
}
const { LIVRES, normNom, parseRef } = coeur;

console.log('='.repeat(72));
console.log('TESTS UNITAIRES DU CŒUR — parseur de références bibliques');
console.log('='.repeat(72));

console.log('\n1. normNom (normalisation des noms de livres)');
ok('« Genèse » -> « genese »', normNom('Genèse') === 'genese', normNom('Genèse'));
ok('« Ésaïe » -> « esaie »', normNom('Ésaïe') === 'esaie', normNom('Ésaïe'));
ok('« 1 Co » -> « 1co » (espaces retirés, chiffre gardé)', normNom('1 Co') === '1co', normNom('1 Co'));
ok('« Jn. » -> « jn » (point retiré)', normNom('Jn.') === 'jn', normNom('Jn.'));
ok('diacritiques neutralisés (éphésiens = ephesiens)', normNom('Éphésiens') === normNom('Ephesiens'), normNom('Éphésiens'));

console.log('\n2. LIVRES : couverture des 66 livres');
const valeurs = new Set(Object.values(LIVRES));
let manquants = [];
for (let n = 1; n <= 66; n++) if (!valeurs.has(n)) manquants.push(n);
ok('les 66 livres sont atteignables', manquants.length === 0, manquants.length ? 'manquants=' + manquants.join(',') : 'ok');

console.log('\n3. parseRef : références valides');
const cas = [
  ['Jean 3:16', 43, 3, 16, 16],
  ['Jn 3,16', 43, 3, 16, 16],
  ['Psaume 23(22),1', 19, 23, 1, 1],
  ['Genèse 1:1', 1, 1, 1, 1],
  ['1 Co 13,4-7', 46, 13, 4, 7],
  ['Mt 5,3-12', 40, 5, 3, 12],
  ['Ap 22:21', 66, 22, 21, 21],
  ['2 Tm 3,16', 55, 3, 16, 16],
  ['Ac 2,1', 44, 2, 1, 1],
];
for (const [txt, livre, ch, v1, v2] of cas) {
  const r = parseRef(txt);
  ok(`« ${txt} »`, !!r && r.livre === livre && r.ch === ch && r.v1 === v1 && r.v2 === v2,
    r ? JSON.stringify(r) : 'null');
}

console.log('\n4. parseRef : entrées invalides -> null (jamais de faux positif)');
ok('chaîne vide', parseRef('') === null);
ok('null', parseRef(null) === null);
ok('nom inconnu', parseRef('Nawak 1:1') === null);
ok('sans numéro de verset', parseRef('Jean 3') === null);
ok('chiffres isolés', parseRef('3:16') === null);
ok('texte quelconque', parseRef('bonjour le monde') === null);

console.log('\n5. Cohérence interne');
ok('v2 >= v1 toujours', cas.every(([t]) => { const r = parseRef(t); return !r || r.v2 >= r.v1; }));
ok('un livre connu renvoie 1..66', cas.every(([t]) => { const r = parseRef(t); return r && r.livre >= 1 && r.livre <= 66; }));

console.log('\n' + '='.repeat(72));
console.log(`RESULTAT : ${total - echecs}/${total}`);
if (echecs) { console.log(`\n${echecs} échec(s).`); process.exit(1); }
console.log('OK — le cœur (références) est conforme.');
