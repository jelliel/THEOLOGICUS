/* v573b — https_port initialisé + pas de double démarrage HTTPS (CRLF sûr). */
const fs = require('fs');
const F = 'C:/tmp/theoverify/app.py';
let src = fs.readFileSync(F, 'utf8');
const crlf = src.indexOf('\r\n') !== -1;
src = src.replace(/\r\n/g, '\n');

function remplacer(titre, oldLines, newLines) {
  const oldStr = oldLines.join('\n');
  const newStr = newLines.join('\n');
  const n = src.split(oldStr).length - 1;
  if (n !== 1) { console.error('FATAL [' + titre + '] : ancrage trouvé ' + n + ' fois'); process.exit(1); }
  src = src.replace(oldStr, () => newStr);
  console.log('OK  ' + titre);
}

remplacer('https_port initialisé à None', ['    ports = port_range(proxy_server.PORT)', '    httpd = None'],
  ['    ports = port_range(proxy_server.PORT)', '    httpd = None', '    https_port = None']);

remplacer('NO_WINDOW — démarrer HTTPS seulement si pas déjà fait',
  ['        https_port = demarrer_https(base, partial(proxy_server.CORSProxyHandler, directory=base), get_lan_ip())',
   '        if https_port:',
   '            hote = get_lan_ip() or "127.0.0.1"',
   '            print(f"[OK] HTTPS (réseau) : https://{hote}:{https_port}/THEOLOGICUS.html")'],
  ['        if not https_port:',
   '            https_port = demarrer_https(base, partial(proxy_server.CORSProxyHandler, directory=base), get_lan_ip())',
   '        if https_port:',
   '            hote = get_lan_ip() or "127.0.0.1"',
   '            print(f"[OK] HTTPS (réseau) : https://{hote}:{https_port}/THEOLOGICUS.html")']);

if (crlf) src = src.replace(/\n/g, '\r\n');
fs.writeFileSync(F, src, 'utf8');
console.log('ÉCRIT app.py');
