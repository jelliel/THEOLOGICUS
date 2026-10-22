// Extrait les modules <script id> + le bloc ADD TO CHAT (inline) et vérifie la syntaxe.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.argv[2] || 'C:/tmp/theoverify';
const html = fs.readFileSync(path.join(ROOT, 'THEOLOGICUS.html'), 'utf8');

let n = 0, ko = 0;
const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
let m;
const tmpdir = path.join(ROOT, '.workbuddy-ai', 'artifacts', '_v632', 'chk');
fs.mkdirSync(tmpdir, { recursive: true });
while ((m = re.exec(html))) {
  const attrs = m[1] || '';
  const body = m[2] || '';
  if (/\bsrc\s*=/.test(attrs)) continue;
  if (!body.trim()) continue;
  n++;
  const im = /id\s*=\s*["']([^"']+)["']/.exec(attrs);
  const name = im ? im[1] : 'inline-' + n;
  const f = path.join(tmpdir, name + '.js');
  fs.writeFileSync(f, body, 'utf8');
  try {
    new vm.Script(body, { filename: name });
  } catch (e) {
    ko++;
    console.log('KO ' + name + ' :: ' + e.message);
  }
}
console.log('scripts inline verifies : ' + n + ' / echecs : ' + ko);
process.exit(ko ? 1 : 0);
