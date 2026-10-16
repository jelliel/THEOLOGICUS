/* v598 — injecte le module src_v598.txt dans THEOLOGICUS.html (avant </body>).

   Garde-fous (lecons vécues) :
   - CRLF obligatoire : on normalise le fichier entier avec /(?<!\r)\n/g pour ne
     PAS doubler les \r\n existants (sinon le diff Git couvre tout le fichier).
   - ancre unique : on refuse si le module est deja present.
   - equilibre <script>/</script> et presence unique de </body> apres insertion.
   - node --check sur le module extrait (syntaxe pure, pas d'execution). */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..'); // artifacts/_v598 -> repo
const HTML = path.join(ROOT, 'THEOLOGICUS.html');
const SRC = path.join(__dirname, 'src_v598.txt');
const NODE = 'C:/Users/toshr/.workbuddy-ai/binaries/node/versions/22.22.2-6/node.exe';

const js = fs.readFileSync(SRC, 'utf8').replace(/\r?\n/g, '\n');
if (js.indexOf('</script>') >= 0) { console.error('Module contient </script> — injection refusee'); process.exit(1); }

let html = fs.readFileSync(HTML, 'utf8');
if (html.indexOf('<script id="v598-overflow-menu">') >= 0) { console.error('Module v598 deja present — arret'); process.exit(1); }

const idx = html.lastIndexOf('</body>');
if (idx < 0) { console.error('</body> introuvable'); process.exit(1); }

const tag = '<script id="v598-overflow-menu">\n' + js + '\n</script>\n';
html = html.slice(0, idx) + tag + html.slice(idx);

// normalise CRLF SANS doubler les \r\n existants
html = html.replace(/(?<!\r)\n/g, '\r\n');

fs.writeFileSync(HTML, html, 'utf8');

const after = fs.readFileSync(HTML, 'utf8');
function bal(s) {
  return {
    o: (s.match(/<script(\s[^>]*|)>/g) || []).length,
    c: (s.match(/<\/script>/g) || []).length,
    lf: (s.match(/(?<!\r)\n/g) || []).length
  };
}
const wa = bal(after);
// Compare au delta vs HEAD : l'injection doit ajouter EXACTEMENT 1 paire
// <script>/</script> et ne doit pas alterer les fins de ligne. (Un desequilibre
// pre-existant dans HEAD est un faux positif du regex sur des chaines JS.)
let headOk = false;
try {
  const head = require('child_process').execSync('git show HEAD:THEOLOGICUS.html', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  const wh = bal(head);
  const dO = wa.o - wh.o, dC = wa.c - wh.c, dL = wa.lf - wh.lf;
  if (dO !== dC) { console.error('DESEQUILIBRE: delta open=' + dO + ' delta close=' + dC + ' (attendu 1/1)'); process.exit(1); }
  if (dL !== 0) { console.error('CRLF altere: delta LF isoles=' + dL); process.exit(1); }
  headOk = true;
} catch (e) { /* pas de HEAD : on ne peut pas comparer, on saute ce garde */ }
if (!headOk && wa.o !== wa.c) { console.error('DESEQUILIBRE script local: ' + wa.o + '/' + wa.c + ' (verifier vs HEAD)'); process.exit(1); }
if (after.indexOf('</body>') < 0) { console.error('</body> perdu'); process.exit(1); }
if (after.indexOf('<script id="v598-overflow-menu">') < 0) { console.error('module non injecte'); process.exit(1); }

const tmp = path.join(os.tmpdir(), 'v598_module_check_' + Date.now() + '.js');
fs.writeFileSync(tmp, js, 'utf8');
try {
  execSync('"' + NODE + '" --check "' + tmp + '"', { stdio: 'pipe' });
} catch (e) {
  try { fs.unlinkSync(tmp); } catch (e2) {}
  console.error('node --check a ECHEC sur le module v598');
  process.exit(1);
}
try { fs.unlinkSync(tmp); } catch (e2) {}

// verification finale : pas de LF isole introduit par l'injection
const lf = (after.match(/(?<!\r)\n/g) || []).length;
console.log('OK — module v598 injecte. scripts ' + opens + '/' + closes + ', </body> unique, node --check OK, LF isolés restants: ' + lf);
