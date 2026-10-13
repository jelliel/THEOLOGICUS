/* v573c — bannière LAN : afficher l'URL HTTPS (micro inclus) + port.txt. */
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

/* 1. demarrer_https note le port choisi (port.txt) */
remplacer('demarrer_https — note port.txt',
[
'            threading.Thread(target=httpd_tls.serve_forever, daemon=True).start()',
'            hote = lan_ip or "127.0.0.1"',
"            print(f\"[OK] HTTPS prêt : https://{hote}:{p}/THEOLOGICUS.html  (certificat auto-signé : acceptez l'avertissement au premier accès — requis pour le micro depuis cet appareil)\")",
'            return p'
],
[
'            threading.Thread(target=httpd_tls.serve_forever, daemon=True).start()',
'            try:',
'                with open(os.path.join(dossier, "port.txt"), "w") as f3:',
'                    f3.write(str(p))',
'            except Exception:',
'                pass',
'            hote = lan_ip or "127.0.0.1"',
"            print(f\"[OK] HTTPS prêt : https://{hote}:{p}/THEOLOGICUS.html  (certificat auto-signé : acceptez l'avertissement au premier accès — requis pour le micro depuis cet appareil)\")",
'            return p'
]);

/* 2. lan_info expose l'URL HTTPS */
remplacer('lan_info — expose https',
[
'        return {',
'            "port": getattr(self, "port", None),',
'            "local": getattr(self, "local_url", ""),',
'            "lan": getattr(self, "lan_url", ""),',
'            "lan_ip": getattr(self, "lan_ip", None),',
'        }'
],
[
'        return {',
'            "port": getattr(self, "port", None),',
'            "local": getattr(self, "local_url", ""),',
'            "lan": getattr(self, "lan_url", ""),',
'            "lan_ip": getattr(self, "lan_ip", None),',
'            "https": getattr(self, "lan_url_https", ""),',
'        }'
]);

/* 3. main — reconstruit lan_url_https (ce lancement ou port.txt) + api */
remplacer('main — api.lan_url_https',
[
'    api = DesktopApi()',
'    api.port = port',
'    api.local_url = url',
'    api.lan_ip = lan_ip',
'    api.lan_url = lan_url'
],
[
"    # v573c — l'URL HTTPS (micro depuis un autre appareil) : celle de CE",
"    # lancement, sinon celle notée par l'instance précédente (port.txt).",
'    lan_url_https = ""',
'    try:',
'        dossier_https = os.path.join(os.environ.get("LOCALAPPDATA") or tempfile.gettempdir(), "THEOLOGICUS", "https")',
'        pf = os.path.join(dossier_https, "port.txt")',
'        if os.path.exists(pf) and lan_ip:',
'            with open(pf) as f4:',
'                p_https = int(f4.read().strip())',
'            if 8443 <= p_https <= 8446:',
'                lan_url_https = f"https://{lan_ip}:{p_https}/THEOLOGICUS.html"',
'    except Exception:',
'        pass',
'    api = DesktopApi()',
'    api.port = port',
'    api.local_url = url',
'    api.lan_ip = lan_ip',
'    api.lan_url = lan_url',
'    api.lan_url_https = lan_url_https'
]);

/* 4. bannière — HTTPS en tête (micro inclus) */
remplacer('bannière — préfère le HTTPS',
[
"      var lan = (info && info.lan) || '';"
],
[
"      var lan = (info && (info.https || info.lan)) || '';",
"      var estHttps = !!(info && info.https);"
]);

remplacer('bannière — libellé HTTPS',
[
"      label.innerHTML = '<b>Acces reseau</b> :';"
],
[
"      label.innerHTML = estHttps ? '<b>Autre appareil (HTTPS — micro inclus)</b> :' : '<b>Acces reseau</b> :';"
]);

remplacer('bannière — infobulle du lien',
[
"      link.target = '_blank';"
],
[
"      link.target = '_blank';",
"      link.title = estHttps ? 'Ouvrez cette adresse sur l autre appareil et acceptez le certificat une fois' : '';"
]);

if (crlf) src = src.replace(/\n/g, '\r\n');
fs.writeFileSync(F, src, 'utf8');
console.log('ÉCRIT app.py');
