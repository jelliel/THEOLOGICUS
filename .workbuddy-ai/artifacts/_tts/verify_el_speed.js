/**
 * Vérifie le câblage v116 du ton théologique vers ElevenLabs.
 *
 * Extrait les VRAIES fonctions du HTML (ttsElAppliqueVitesse, ttsTonTheologique,
 * ttsNarration, ttsCfg) et recalcule `voice_settings.speed` avec la formule
 * exacte du code, pour prouver :
 *   - eleven_v3 ne reçoit JAMAIS de speed (mesuré : il l'ignore -> code mort) ;
 *   - v2 et flash le reçoivent bien ;
 *   - un verset solennel est plus lent qu'un texte neutre ;
 *   - la valeur reste dans la plage documentée 0.7 - 1.2.
 */
const fs = require('fs');
const vm = require('vm');

const HTML = fs.readFileSync('THEOLOGICUS.html', 'utf8');

function extractFn(name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{');
  const m = re.exec(HTML);
  if (!m) throw new Error('fonction introuvable : ' + name);
  const i = m.index + m[0].length - 1;
  let depth = 0, j = i;
  for (; j < HTML.length; j++) {
    if (HTML[j] === '{') depth++;
    else if (HTML[j] === '}') { depth--; if (depth === 0) break; }
  }
  return HTML.slice(m.index, j + 1);
}

const cleConst = /var TTS_CFG_CLE = '(.*?)';/.exec(HTML);
const moteursConst = /var TTS_MOTEURS = \{[^}]*\};/.exec(HTML);

const SRC = [
  cleConst[0], moteursConst[0],
  extractFn('ttsCfg'), extractFn('ttsNarration'),
  extractFn('ttsTonTheologique'), extractFn('ttsElAppliqueVitesse'),
  extractFn('ttsElBaliseTon')
].join('\n');

let ok = 0, ko = 0;
function check(nom, cond, detail) {
  if (cond) { ok++; console.log('  [OK] ' + nom); }
  else { ko++; console.log('  [X]  ' + nom + (detail !== undefined ? '  -> ' + detail : '')); }
}

function ctx(narration) {
  const store = narration === null ? {} : { 'theologicus-tts-moteurs': JSON.stringify({ narration: narration }) };
  const c = { console };
  c.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); }
  };
  vm.createContext(c);
  vm.runInContext(SRC, c);
  return c;
}

// Formule EXACTE du bloc ElevenLabs de ttsParleDistant.
function vitesse(c, texte, modele) {
  if (!c.ttsElAppliqueVitesse(modele)) return null;
  const v = c.ttsTonTheologique(texte).rate * (c.ttsNarration() ? 0.92 : 1);
  return Math.min(1.2, Math.max(0.7, Math.round(v * 100) / 100));
}

const SOLENNEL = 'Ainsi parle le Seigneur : je mettrai ma loi au fond de leur coeur.';
const RASSURANT = 'Ne crains pas, car je suis avec toi.';
const NEUTRE = 'Le chapitre suivant traite de la création.';

console.log('=== v116 — ton théologique -> ElevenLabs (voice_settings.speed) ===\n');
const c = ctx(true); // narration activée

console.log('-- eleven_v3 : aucun speed (mesuré comme ignoré)');
check('v3 n\'applique pas la vitesse', c.ttsElAppliqueVitesse('eleven_v3') === false);
check('v3 -> speed null', vitesse(c, SOLENNEL, 'eleven_v3') === null, vitesse(c, SOLENNEL, 'eleven_v3'));

console.log('\n-- v2 et flash : speed appliqué');
check('v2 applique la vitesse', c.ttsElAppliqueVitesse('eleven_multilingual_v2') === true);
check('flash applique la vitesse', c.ttsElAppliqueVitesse('eleven_flash_v2_5') === true);

console.log('\n-- le ton se traduit bien en débit (narration activée)');
const sSol = vitesse(c, SOLENNEL, 'eleven_multilingual_v2');
const sRas = vitesse(c, RASSURANT, 'eleven_multilingual_v2');
const sNeu = vitesse(c, NEUTRE, 'eleven_multilingual_v2');
console.log('   solennel=%s  rassurant=%s  neutre=%s', sSol, sRas, sNeu);
check('solennel plus lent que neutre', sSol < sNeu, sSol + ' vs ' + sNeu);
check('rassurant plus lent que neutre', sRas < sNeu, sRas + ' vs ' + sNeu);
check('solennel = 0.82 x 0.92 = 0.75', sSol === 0.75, sSol);
check('neutre = 1 x 0.92 = 0.92', sNeu === 0.92, sNeu);

console.log('\n-- plage documentée 0.7 - 1.2');
[SOLENNEL, RASSURANT, NEUTRE].forEach(t => {
  const v = vitesse(c, t, 'eleven_multilingual_v2');
  check('0.7 <= ' + v + ' <= 1.2', v >= 0.7 && v <= 1.2, v);
});

console.log('\n-- narration désactivée : on revient au débit du ton seul');
const c2 = ctx(false);
const sSol2 = vitesse(c2, SOLENNEL, 'eleven_multilingual_v2');
check('sans narration, solennel = 0.82', sSol2 === 0.82, sSol2);
check('sans narration, neutre = 1', vitesse(c2, NEUTRE, 'eleven_multilingual_v2') === 1);

console.log('\n-- le SSML n\'est PAS câblé (mesuré ignoré sur v3)');
const debut = HTML.indexOf("if (moteur === 'elevenlabs')");
const finBloc = HTML.indexOf('var stb = String(c.supertonic.url');
const blocEl = (debut >= 0 && finBloc > debut) ? HTML.slice(debut, finBloc) : '';
check('bloc ElevenLabs localisé', blocEl.length > 0, 'debut=' + debut + ' fin=' + finBloc);
// On cherche une CONSTRUCTION de balise, pas le mot dans un commentaire :
// chercher « '<prosody » ou « "<prosody » (littéral de chaîne), pas « prosody > ».
check('aucune balise <prosody> construite', !/['"]<prosody/.test(blocEl));
check('le texte envoyé est bien le texte préparé', /text:\s*_texteEl\s*,/.test(blocEl));

// ── v116b : le ton sur eleven_v3 passe par une balise audio ──────────────────
console.log('\n-- v116b : balises audio sur eleven_v3');
const V3 = 'eleven_v3';
const balise = (c, texte, modele) => c.ttsElBaliseTon(c.ttsTonTheologique(texte).ton, modele);

check('solennel -> [slows down]', balise(c, SOLENNEL, V3) === '[slows down] ', balise(c, SOLENNEL, V3));
check('rassurant -> [quietly]', balise(c, RASSURANT, V3) === '[quietly] ', balise(c, RASSURANT, V3));
const EXPLICATIF = 'C\'est-à-dire, en d\'autres termes, la création.';
check('explicatif -> [deliberate]', balise(c, EXPLICATIF, V3) === '[deliberate] ', balise(c, EXPLICATIF, V3));
check('neutre -> aucune balise', balise(c, NEUTRE, V3) === '', JSON.stringify(balise(c, NEUTRE, V3)));

console.log('\n-- les balises sont strictement réservées à v3');
check('v2 n\'en reçoit aucune', balise(c, SOLENNEL, 'eleven_multilingual_v2') === '');
check('flash n\'en reçoit aucune', balise(c, SOLENNEL, 'eleven_flash_v2_5') === '');

console.log('\n-- [slowly]/[softly] proscrits : hors liste officielle, risque d\'être LUS');
// Mesuré actifs (+16,5 % / +7 %) mais absents de la liste officielle v3 :
// le supplément de durée venait du mot prononcé, pas d'un ralentissement.
// On ne balaie que le CODE : le commentaire qui relate la mesure les nomme.
const CODE = HTML
  .replace(/\/\*[\s\S]*?\*\//g, '')            // commentaires de bloc
  .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');   // commentaires de ligne (pas les URL)
check('aucun [slowly] dans le code', !/\[slowly\]/.test(CODE));
check('aucun [softly] dans le code', !/\[softly\]/.test(CODE));
check('le filtre de commentaires a bien fonctionné', !CODE.includes('hors liste officielle'));

console.log('\n-- la balise précède toujours du texte (règle officielle v3)');
const TAGS = ['[slows down] ', '[quietly] ', '[deliberate] '];
check('chaque balise se termine par une espace', TAGS.every(t => t.endsWith(' ')));
const fBal = extractFn('ttsElBaliseTon');
check('ttsElBaliseTon ne rend que des balises connues',
  (fBal.match(/return\s*'\[[^\]]+\]\s*'/g) || []).length === 3,
  (fBal.match(/return\s*'\[[^\]]+\]\s*'/g) || []).join(' | '));

console.log('\n=== ' + ok + ' OK / ' + ko + ' échec(s) ===');
process.exit(ko ? 1 : 0);
