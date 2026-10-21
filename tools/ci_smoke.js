// Outil CI — fumée ultra-rapide (sans navigateur) du fichier application.
//
// But : détecter une régression GROSSIÈRE (module arraché par un splice, ancre
// critique manquante) en < 30 s, AVANT de lancer la meute Playwright coûteuse.
// Unique source de vérité du nombre de modules : on compte EXACTEMENT comme
// tools/verifier_assets.py#controle_modules (tous les <script id="...">, pas
// seulement les vNNN). Le chiffre est codé ici ; à monter si on ajoute un module.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.env.THEO_ROOT || process.cwd();
const HTML = path.join(ROOT, 'THEOLOGICUS.html');
const MODULES_ATTENDUS = 130; // +1 v631 (v631media — onglet Media / pont OpenMontage) // +1 v629 (v629lecture — mode lecture) // +pdf.js et +worker (text/plain, non compté comme module exécutable) // synchronisé avec verifier_assets.py (controle_modules) ; +1 v626 (v626nav — navigation des surlignages)

// Ancres critiques : si l'une manque, l'appli est cassée indépendamment des bancs.
// (Uniquement des chaînes PRÉSENTES dans le HTML STATIQUE — v598-plus est créé
// à l'exécution par le module, donc pas testable ici ; on se fie à __v598Overflow.)
const ANCRES = [
  'window.__v598Overflow',          // menu « Plus » (débordement de la bande)
  'window.callLLMStream',           // cerveau Adeodat
  'window.sauvegardeFermeture',     // v604 backup conversations à la fermeture
  'window.pdfjsLib',                // v606 pdf.js embarqué (rendu, recherche)
  'window.theoFetchReseau',         // v611 transport natif de secours (APK)
  'IndexedDB',                      // stockage canonique
];

let html;
try {
  html = fs.readFileSync(HTML, 'utf8');
} catch (e) {
  console.error('SMOKE ÉCHEC : THEOLOGICUS.html introuvable — ' + e.message);
  process.exit(1);
}

const ids = [...html.matchAll(/<script id="([^"]+)">/g)].map(m => m[1]);
const uniques = new Set(ids);
if (uniques.size !== ids.length) {
  const vus = {};
  const doublons = ids.filter(id => (vus[id] = (vus[id] || 0) + 1) > 1);
  console.error('SMOKE ÉCHEC : identifiants de module DUPLIQUÉS — ' + [...new Set(doublons)].join(', '));
  process.exit(1);
}

let ok = true;
if (ids.length !== MODULES_ATTENDUS) {
  console.error(`SMOKE ÉCHEC : ${ids.length} modules (attendu ${MODULES_ATTENDUS}) — un splice a arraché un module ?`);
  ok = false;
} else {
  console.log(`SMOKE OK : ${ids.length} modules présents.`);
}

for (const a of ANCRES) {
  if (html.includes(a)) {
    console.log(`SMOKE OK : ancre présente — ${a}`);
  } else {
    console.error(`SMOKE ÉCHEC : ancre CRITIQUE manquante — ${a}`);
    ok = false;
  }
}

// Sanity minimale CRLF (un fichier en LF pur casse le hot-deploy Windows).
// 🔴 Détecter les DEUX dérives : CR solitaires ET LF solitaires (une lecture
// Python en mode texte convertit tout en LF — attrapé par verifier_assets,
// pas par la première version de cette fumée, v602).
const lfSeul = (html.match(/(?<!\r)\n/g) || []).length;
const crSeul = (html.match(/\r(?!\n)/g) || []).length;
if (crSeul > 0 || lfSeul > 0) {
  console.error(`SMOKE ÉCHEC : fins de ligne mixtes — ${lfSeul} LF solitaires, ${crSeul} CR solitaires (CRLF requis partout).`);
  ok = false;
} else {
  console.log(`SMOKE OK : CRLF cohérent (${lfSeul === 0 ? (html.match(/\r\n/g) || []).length : '?'} fins de ligne).`);
}

if (!ok) {
  console.error('\nSMOKE ÉCHEC — une régression grossière a été détectée avant les bancs.');
  process.exit(1);
}
console.log('\nSMOKE OK — aucune régression grossière détectée.');
