"""V117 — prouve que le port est désormais STABLE et l'instance réutilisée.

Le bug : l'origine inclut le port. Un port aléatoire à chaque lancement =
un stockage navigateur neuf = clé API et configuration redemandées.

Ce banc démarre un VRAI serveur THEOLOGICUS (le handler de proxy_server), un
serveur ÉTRANGER témoin, et vérifie :
  1. la sonde reconnaît le nôtre et rejette l'étranger ;
  2. trouver_instance_existante() retrouve l'instance lancée ;
  3. choisir_port() est DÉTERMINISTE (rend le même port à chaque appel) ;
  4. choisir_port() saute un port occupé par un étranger, sans jamais tirer
     au hasard ;
  5. CHOSE QUI MANQUAIT AVANT : deux appels consécutifs rendent le même port.
"""
import http.server
import os
import socket
import sys
import threading

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.dirname(os.path.abspath(__file__))))))

import proxy_server  # noqa: E402
import app  # noqa: E402

ok = ko = 0


def check(nom, cond, detail=None):
    global ok, ko
    if cond:
        ok += 1
        print('  [OK] ' + nom)
    else:
        ko += 1
        print('  [X]  ' + nom + (('  -> ' + str(detail)) if detail is not None else ''))


def port_libre():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


class Etranger(http.server.BaseHTTPRequestHandler):
    """Serveur qui n'est PAS THEOLOGICUS : doit être rejeté par la sonde."""

    def do_GET(self):
        self.send_response(404)
        self.end_headers()

    def log_message(self, *a):
        pass


def demarrer(handler, port):
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', port), handler)
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


print('=== v117 — stabilité du port et réutilisation d\'instance ===\n')

# ── 1. la sonde distingue le nôtre de l'étranger ─────────────────────────────
print('-- sonde d\'identité')
proxy_server.SERVE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.dirname(os.path.abspath(__file__))))).replace('\\', '/').replace(
    'C:/', 'C:/') or '.'
racine = os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.dirname(os.path.abspath(__file__)))))
proxy_server.SERVE_DIR = racine

p_notre = port_libre()
p_etr = port_libre()
srv_notre = demarrer(proxy_server.CORSProxyHandler, p_notre)
demarrer(Etranger, p_etr)

check('le serveur THEOLOGICUS est reconnu', app._est_notre_serveur(p_notre) is True)
check('un serveur étranger est rejeté', app._est_notre_serveur(p_etr) is False)
check('un port fermé est rejeté', app._est_notre_serveur(port_libre()) is False)

# ── 2. réutilisation de l'instance déjà lancée ───────────────────────────────
print('\n-- réutilisation d\'une instance déjà lancée')
plage = app.port_range(p_notre)
trouve = app.trouver_instance_existante(plage)
check('l\'instance en écoute est retrouvée', trouve == p_notre, trouve)

# ── 3. déterminisme ──────────────────────────────────────────────────────────
print('\n-- déterminisme (LE point du bug)')
base_port = 8900
plage2 = app.port_range(base_port)
a = app.choisir_port(plage2)
b = app.choisir_port(plage2)
c = app.choisir_port(plage2)
check('trois appels rendent le même port', a == b == c, f'{a} {b} {c}')
check('le port préféré est honoré quand il est libre', a == base_port, a)

# ── 4. repli déterministe sur un port occupé ─────────────────────────────────
print('\n-- repli déterministe quand le port est squatté')
gêneurs = []
try:
    for i in range(3):                       # on squatte 8900, 8901, 8902
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.bind(('127.0.0.1', base_port + i))
        s.listen(1)
        gêneurs.append(s)
    d = app.choisir_port(plage2)
    e = app.choisir_port(plage2)
    check('le repli saute les ports occupés', d == base_port + 3, d)
    check('le repli est lui aussi déterministe', d == e, f'{d} vs {e}')
    check('le repli n\'est PAS aléatoire', base_port <= d <= base_port + app.PORT_SPAN, d)
finally:
    for s in gêneurs:
        s.close()

# ── 5. aucun tirage aléatoire résiduel ───────────────────────────────────────
print('-- plus aucun bind(("", 0)) dans le lanceur')
src = open(os.path.join(racine, 'app.py'), encoding='utf-8').read()
check('app.py ne fait plus bind sur le port 0', 'bind(("127.0.0.1", 0))' not in src)

srv_notre.shutdown()
print('\n=== %d OK / %d échec(s) ===' % (ok, ko))
sys.exit(1 if ko else 0)
