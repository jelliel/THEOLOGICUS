/* v573 — HTTPS pour le mode serveur (micro depuis un autre appareil).
   app.py (CRLF) + proxy_server.py (CRLF) + THEOLOGICUS.html (CRLF). */
const fs = require('fs');

function editer(F, blocs) {
  let src = fs.readFileSync(F, 'utf8');
  const crlf = src.indexOf('\r\n') !== -1;
  const NL = crlf ? '\r\n' : '\n';
  if (!crlf) console.log('  [' + F + '] fins de ligne LF (préservées)');
  src = src.replace(/\r\n/g, '\n');
  for (const [titre, oldLines, newLines] of blocs) {
    const oldStr = oldLines.join('\n');
    const newStr = newLines.join('\n');
    const n = src.split(oldStr).length - 1;
    if (n !== 1) { console.error('FATAL [' + titre + '] : ancrage trouvé ' + n + ' fois dans ' + F); process.exit(1); }
    src = src.replace(oldStr, () => newStr);
    console.log('OK  ' + titre);
  }
  if (crlf) src = src.replace(/\n/g, '\r\n');
  fs.writeFileSync(F, src, 'utf8');
  console.log('  ÉCRIT ' + F);
}

const APP = 'C:/tmp/theoverify/app.py';
const PS = 'C:/tmp/theoverify/proxy_server.py';
const HTML = 'C:/tmp/theoverify/THEOLOGICUS.html';

editer(APP, [
  ['app.py — fonction demarrer_https (module)',
  [
    'def main() -> int:'
  ],
  [
    'def demarrer_https(base, handler, lan_ip):',
    '    """v573 — serveur HTTPS auto-signé (ports 8443-8446) pour le micro',
    '    depuis un AUTRE appareil : getUserMedia et SpeechRecognition exigent',
    '    un contexte sécurisé (localhost ou https) — une adresse réseau HTTP',
    '    ne peut donc pas servir le micro. Le certificat est embarqué',
    '    (https/) et copié dans les données utilisateur au premier lancement.',
    '    Retourne le port HTTPS ou None."""',
    '    try:',
    '        import ssl',
    '        dossier = os.path.join(os.environ.get("LOCALAPPDATA") or tempfile.gettempdir(), "THEOLOGICUS", "https")',
    '        os.makedirs(dossier, exist_ok=True)',
    '        paire = (("theologicus-local.pem", "theologicus-local-cert.pem"),',
    '                 ("theologicus-local-key.pem", "theologicus-local-key.pem"))',
    '        for src_nom, dst_nom in paire:',
    '            src = os.path.join(base, "https", src_nom)',
    '            dst = os.path.join(dossier, dst_nom)',
    '            if (not os.path.exists(dst)) and os.path.exists(src):',
    '                with open(src, "rb") as f1, open(dst, "wb") as f2:',
    '                    f2.write(f1.read())',
    '        cert_chemin = os.path.join(dossier, "theologicus-local-cert.pem")',
    '        cle_chemin = os.path.join(dossier, "theologicus-local-key.pem")',
    '        if not (os.path.exists(cert_chemin) and os.path.exists(cle_chemin)):',
    '            print("[!] HTTPS désactivé : certificat embarqué introuvable (https/)", file=sys.stderr)',
    '            return None',
    '        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)',
    '        ctx.load_cert_chain(cert_chemin, cle_chemin)',
    '        for p in (8443, 8444, 8445, 8446):',
    '            try:',
    '                httpd_tls = ThreadingHTTPServer(("0.0.0.0", p), handler)',
    '            except OSError:',
    '                continue',
    '            httpd_tls.daemon_threads = True',
    '            httpd_tls.socket = ctx.wrap_socket(httpd_tls.socket, server_side=True)',
    '            threading.Thread(target=httpd_tls.serve_forever, daemon=True).start()',
    '            hote = lan_ip or "127.0.0.1"',
    '            print(f"[OK] HTTPS prêt : https://{hote}:{p}/THEOLOGICUS.html  (certificat auto-signé : acceptez l\'avertissement au premier accès — requis pour le micro depuis cet appareil)")',
    '            return p',
    '        print("[!] HTTPS désactivé : ports 8443-8446 tous occupés", file=sys.stderr)',
    '        return None',
    '    except Exception as e:',
    '        print("[!] HTTPS indisponible : " + str(e), file=sys.stderr)',
    '        return None',
    '',
    '',
    'def main() -> int:'
  ]],
  ['app.py — démarrage HTTPS après le serveur HTTP',
  [
    '        server_thread = threading.Thread(target=httpd.serve_forever, daemon=True)',
    '        server_thread.start()'
  ],
  [
    '        server_thread = threading.Thread(target=httpd.serve_forever, daemon=True)',
    '        server_thread.start()',
    '',
    '        # v573 — HTTPS pour le micro depuis un autre appareil (voir',
    '        # demarrer_https) : le port effectif est imprimé et retourné.',
    '        https_port = demarrer_https(base, handler, lan_ip)',
    '        if https_port and lan_ip:',
    '            lan_url_https = f"https://{lan_ip}:{https_port}/THEOLOGICUS.html"',
    '            print(f"[OK] HTTPS (LAN)  : {lan_url_https}")'
  ]],
  ['app.py — NO_WINDOW : imprimer le HTTPS',
  [
    '    if os.environ.get("THEOLOGICUS_NO_WINDOW"):',
    '        print(f"[OK] Serveur prêt : {url}  (Ctrl+C pour arrêter)")',
    '        if lan_url:',
    '            print(f"[OK] Réseau (LAN)   : {lan_url}")'
  ],
  [
    '    if os.environ.get("THEOLOGICUS_NO_WINDOW"):',
    '        print(f"[OK] Serveur prêt : {url}  (Ctrl+C pour arrêter)")',
    '        if lan_url:',
    '            print(f"[OK] Réseau (LAN)   : {lan_url}")',
    '        https_port = demarrer_https(base, partial(proxy_server.CORSProxyHandler, directory=base), get_lan_ip())',
    '        if https_port:',
    '            hote = get_lan_ip() or "127.0.0.1"',
    '            print(f"[OK] HTTPS (réseau) : https://{hote}:{https_port}/THEOLOGICUS.html")'
  ]]
]);

editer(PS, [
  ['proxy_server — _origine_locale accepte la même origine (HTTPS LAN)',
  [
    "        o = (self.headers.get('Origin') or '').strip()",
    "        if not o or o == 'null':",
    '            return True',
    '        try:',
    "            h = urlparse(o).hostname or ''",
    '        except Exception:',
    '            return False',
    "        return h in ('127.0.0.1', 'localhost', '::1') or h.endswith('.localhost')"
  ],
  [
    "        o = (self.headers.get('Origin') or '').strip()",
    "        if not o or o == 'null':",
    '            return True',
    '        try:',
    "            h = urlparse(o).hostname or ''",
    '        except Exception:',
    '            return False',
    "        if h in ('127.0.0.1', 'localhost', '::1') or h.endswith('.localhost'):",
    '            return True',
    '        # v573 — MÊME ORIGINE que ce serveur : la page peut être ouverte en',
    '        # HTTPS réseau (https://<lan>:8443, mode micro) — son Origin est',
    '        # l\'adresse de CE serveur lui-même, donc de confiance.',
    '        try:',
    "            hote = (self.headers.get('Host') or '').strip().lower()",
    "            if hote and urlparse(o).netloc.lower() == hote:",
    '                return True',
    '        except Exception:',
    '            pass',
    "        return h in ('127.0.0.1', 'localhost', '::1') or h.endswith('.localhost')"
  ]]
]);

editer(HTML, [
  ['THEOLOGICUS — toast micro : mention du HTTPS 8443 (T3)',
  [
    '        toast("🎙️ Micro indisponible : l\\\'adresse « " + location.origin + " » n\\\'est pas sécurisée. Sur l\\\'ordinateur serveur, ouvrez http://localhost:" + (location.port || "8765") + " — depuis un autre appareil, le micro exige HTTPS.", "error");'
  ],
  [
    '        toast("🎙️ Micro indisponible : l\\\'adresse « " + location.origin + " » n\\\'est pas sécurisée. Sur l\\\'ordinateur serveur, ouvrez http://localhost:" + (location.port || "8765") + " ; depuis un autre appareil : https://<adresse-réseau-du-serveur>:8443 (acceptez le certificat une fois).", "error");'
  ]]
]);

console.log('v573 appliqué.');
