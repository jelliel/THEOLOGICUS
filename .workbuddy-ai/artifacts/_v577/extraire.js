/* Extrait les 3 nouveaux modules pour node --check */
const fs = require('fs');
const s = fs.readFileSync('C:/tmp/theoverify/THEOLOGICUS.html', 'utf8');
['v577-liturgie', 'v578-versions', 'v579-chapelet'].forEach(function (m) {
  const tag = '<script id="' + m + '">';
  const d = s.indexOf(tag) + tag.length;
  const f = s.indexOf('</scr' + 'ipt>', d);
  fs.writeFileSync(__dirname + '/mod_' + m + '.js', s.slice(d, f), 'utf8');
  console.log('extrait : mod_' + m + '.js (' + (f - d) + ' octets)');
});
