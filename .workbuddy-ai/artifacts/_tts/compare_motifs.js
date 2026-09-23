/* Question honnete : l ancien \b et le nouveau lookaround donnent-ils le MEME
   resultat sur speakBibleRefs() ? Si oui, ma retouche etait inutile et doit
   partir. On compare les deux jeux de motifs sur les memes phrases. */
const ANCIEN_ABBR = '\\b(Gn|Ex|Is|Ez|Ep|He|Jr)\\s+(\\d+)\\s*:\\s*(\\d+)(?:\\s*[-–—]\\s*(\\d+))?';
const NOUVEAU_ABBR = '(?<![\\p{L}\\p{N}])(Gn|Ex|Is|Ez|Ep|He|Jr)\\s+(\\d+)\\s*:\\s*(\\d+)(?:\\s*[-–—]\\s*(\\d+))?';
const ANCIEN_FULL = '\\b(Ésaïe|Ézéchiel|Éphésiens|Hébreux|Genèse|Exode|Jérémie)\\s+(\\d+)\\s*:\\s*(\\d+)(?:\\s*[-–—]\\s*(\\d+))?';
const NOUVEAU_FULL = '(?<![\\p{L}\\p{N}])(Ésaïe|Ézéchiel|Éphésiens|Hébreux|Genèse|Exode|Jérémie)\\s+(\\d+)\\s*:\\s*(\\d+)(?:\\s*[-–—]\\s*(\\d+))?';
const ANCIEN_GEN = '\\b([\\p{L}]{2,})\\s+(\\d+)\\s*:\\s*(\\d+)(?:\\s*[-–—]\\s*(\\d+))?';
const NOUVEAU_GEN = '(?<![\\p{L}\\p{N}])([\\p{L}]{2,})\\s+(\\d+)\\s*:\\s*(\\d+)(?:\\s*[-–—]\\s*(\\d+))?';

const CAS = [
  'Ésaïe 7:14 est cité.',
  'Ainsi Ésaïe 7:14 fut relu.',
  'Ézéchiel 36:26 annonce la promesse.',
  'Éphésiens 2:8 est décisif.',
  'Genèse 1:1 commence la Bible.',
  'Jérémie 31:33 le dit.',
  'Hébreux 11:1 définit la foi.',
  'Exode 20:3 ouvre le décalogue.',
  'Is 7:14 est cité.',
  'Jr 31:33 le dit.',
  'He 11:1 définit la foi.',
];

console.log('=== MOTIF ABREVIATIONS ===');
for (const t of CAS) {
  const a = t.match(new RegExp(ANCIEN_ABBR, 'g'));
  const b = t.match(new RegExp(NOUVEAU_ABBR, 'gu'));
  const diff = JSON.stringify(a) !== JSON.stringify(b) ? '  <-- DIFFERENT' : '';
  console.log('  ' + (diff ? 'DIFF' : 'meme') + '  abbr: ' + (a || '-').toString().padEnd(14) + ' vs ' + (b || '-').toString().padEnd(14) + '  ' + t + diff);
}
console.log('');
console.log('=== MOTIF NOMS COMPLETS ===');
for (const t of CAS) {
  const a = t.match(new RegExp(ANCIEN_FULL, 'g'));
  const b = t.match(new RegExp(NOUVEAU_FULL, 'gu'));
  const diff = JSON.stringify(a) !== JSON.stringify(b) ? '  <-- DIFFERENT' : '';
  console.log('  ' + (diff ? 'DIFF' : 'meme') + '  full: ' + (a || '-').toString().padEnd(14) + ' vs ' + (b || '-').toString().padEnd(14) + '  ' + t + diff);
}
console.log('');
console.log('=== MOTIF GENERIQUE (le filet de securite) ===');
for (const t of CAS) {
  const a = t.match(new RegExp(ANCIEN_GEN, 'g'));
  const b = t.match(new RegExp(NOUVEAU_GEN, 'gu'));
  const diff = JSON.stringify(a) !== JSON.stringify(b) ? '  <-- DIFFERENT' : '';
  console.log('  ' + (diff ? 'DIFF' : 'meme') + '  gen : ' + (a || '-').toString().padEnd(14) + ' vs ' + (b || '-').toString().padEnd(14) + '  ' + t + diff);
}
