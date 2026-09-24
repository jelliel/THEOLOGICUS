"""Vérifie les routes /config et /theologicus-keys du proxy (v115, persistance
hors dossier d'installation). Lance le VRAI gestionnaire proxy_server sur un
port libre et fait un aller-retour GET/POST."""
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request

sys.path.insert(0, r'C:\Theologicus')
import proxy_server as ps  # noqa: E402

PORT = 8799
BASE = 'http://127.0.0.1:%d' % PORT
srv = ps.http.server.HTTPServer(('127.0.0.1', PORT), ps.CORSProxyHandler)
threading.Thread(target=srv.serve_forever, daemon=True).start()
time.sleep(0.6)

ok = 0
ko = 0


def check(nom, cond, detail=''):
    global ok, ko
    if cond:
        ok += 1
        print('  [OK] ' + nom)
    else:
        ko += 1
        print('  [X]  ' + nom + ('  -> ' + str(detail) if detail else ''))


def get(p):
    try:
        with urllib.request.urlopen(BASE + p, timeout=5) as r:
            return r.read().decode('utf-8')
    except urllib.error.HTTPError as e:
        return 'HTTP %d' % e.code


def post(p, obj):
    req = urllib.request.Request(BASE + p, data=json.dumps(obj).encode('utf-8'),
                                 headers={'Content-Type': 'application/json'}, method='POST')
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.read().decode('utf-8')
    except urllib.error.HTTPError as e:
        return 'HTTP %d' % e.code


cfg_path = os.path.join(ps._app_data_dir(), 'theologicus_config.json')
if os.path.exists(cfg_path):
    os.remove(cfg_path)

print('=== v115 — routes de persistance du proxy ===\n')
print('-- route /config')

r0 = get('/config')
check('GET /config sans config -> {} ', r0.strip() in ('{}', ''), repr(r0))

r1 = post('/config', {'moteur': 'elevenlabs', 'narration': True,
                      'elevenlabs': {'cle': 'CLE-TEST-42', 'voix': 'VOIX-EMILIE'}})
check('POST /config accepte la config', '"ok"' in r1 or 'ok' in r1, repr(r1))

r2 = get('/config')
try:
    d = json.loads(r2)
except Exception:
    d = {}
check('GET /config rend la voix sauvegardee',
      d.get('elevenlabs', {}).get('voix') == 'VOIX-EMILIE', repr(r2))
check('GET /config rend la cle API sauvegardee',
      d.get('elevenlabs', {}).get('cle') == 'CLE-TEST-42', repr(r2))
check('fichier ecrit sur le disque', os.path.isfile(cfg_path), cfg_path)

# Le point crucial : le fichier doit etre HORS du dossier d'installation,
# sinon la prochaine MAJ l'ecrase — c'est exactement le bug a corriger.
inst = os.path.abspath(r'C:\Theologicus').lower()
check('config HORS dossier du projet/install', inst not in cfg_path.lower(), cfg_path)
print('   chemin : %s' % cfg_path)

# Refus d'un corps trop gros (garde-fou, comme _save_keys)
trop = post('/config', {'x': 'a' * 40000})
check('refuse un corps > 16 Ko', 'HTTP 400' in trop or 'erreur' in trop.lower(), repr(trop[:60]))

print('\n-- route /theologicus-keys (migree, meme emplacement)')
k = get('/theologicus-keys')
check('GET /theologicus-keys repond', k.strip() != '', repr(k[:60]))
kp = os.path.join(ps._app_data_dir(), 'theologicus_keys.json')
print('   chemin : %s' % kp)
check('cles hors dossier install', inst not in kp.lower(), kp)

srv.shutdown()
print('\n=== %d OK / %d echec(s) ===' % (ok, ko))
sys.exit(1 if ko else 0)
