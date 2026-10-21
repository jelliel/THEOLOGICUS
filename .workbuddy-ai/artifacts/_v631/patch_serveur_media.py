# v631 — Serveur : pont OpenMontage (endpoints /media/*, LISTE BLANCHE).
# 3 insertions LITTÉRALES dans proxy_server.py (CRLF ; le fichier contient
# déjà 33 LF nus préexistants -> contrôle : aucun NOUVEAU LF nu).
#   S1 : fonctions module-level avant def mpt_status()
#   S2 : route GET /media/status après le bloc /supertonic/status
#   S3 : routes POST /media/clone|deps|run après le bloc /freellmapi/start
import io, sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else 'proxy_server.py'

S1_NEW = '''# ════════════════════════════════════════════════════════════════════
# v631 — MEDIA : pont OpenMontage (https://github.com/calesthio/OpenMontage)
#
# OpenMontage est un système de production vidéo AGENTIQUE (pipelines Python
# pilotés par un assistant IA type Claude Code/Cursor). Ce pont NE l'embarque
# PAS : il installe le dépôt SUR LA MACHINE de l'utilisateur (clonage à la
# demande dans _app_data_dir()/OpenMontage, hors dossier d'installation) et
# n'exécute QUE des commandes d'une LISTE BLANCHE — jamais une commande
# fournie par le client. Subprocess : cwd fixé, timeout, sortie bornée.
# Exécution possible sur PC uniquement (l'APK WebView n'a pas Python/Node/
# ffmpeg) : l'interface l'affiche clairement.
# ════════════════════════════════════════════════════════════════════

OM_REPO_URL = 'https://github.com/calesthio/OpenMontage.git'
OM_ACTIONS = ('envelope', 'providers')   # liste blanche des actions /media/run


def _media_dir():
    """Dossier d'installation OpenMontage de l'utilisateur (survit aux MAJ)."""
    import os
    return os.path.join(_app_data_dir(), 'OpenMontage')


def _media_venv_python(d):
    """Python du venv d'OpenMontage, s'il est installé."""
    import os
    venv = os.path.join(d, '.venv')
    if os.name == 'nt':
        p = os.path.join(venv, 'Scripts', 'python.exe')
    else:
        p = os.path.join(venv, 'bin', 'python')
    return p if os.path.isfile(p) else None


def _media_run(cmd, cwd, timeout, log, titre):
    """Exécute une commande (liste blanche côté appelant), ajoute le log borné."""
    import subprocess
    log.append('$ ' + titre)
    try:
        p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True,
                           timeout=timeout, shell=False)
        out = ((p.stdout or '') + '\\n' + (p.stderr or '')).strip()
        log.append(out[-2500:] if out else '(aucune sortie)')
        return p.returncode == 0
    except subprocess.TimeoutExpired:
        log.append('TIMEOUT : la commande a dépassé le délai imparti.')
        return False
    except Exception as e:
        log.append('ERREUR : ' + str(e))
        return False


def media_status():
    """Prérequis (python/git/ffmpeg/node) + état de l'installation OpenMontage."""
    import os
    import shutil
    d = _media_dir()
    outils = {}
    for exe in ('python', 'git', 'ffmpeg', 'node'):
        chemin = shutil.which(exe)
        version = None
        if chemin:
            try:
                import subprocess
                p = subprocess.run([exe, '--version'], capture_output=True,
                                   text=True, timeout=10, shell=False)
                lignes = (p.stdout or p.stderr or '').strip().splitlines()
                version = lignes[0][:120] if lignes else ''
            except Exception:
                version = None
        outils[exe] = {'ok': bool(version), 'version': version}
    return {'ok': True, 'install_dir': d,
            'installe': os.path.isdir(os.path.join(d, 'tools')),
            'tools': outils}


def media_clone():
    """git clone --depth 1 du dépôt. Refusé si déjà installé."""
    import os
    import shutil
    import subprocess
    d = _media_dir()
    if os.path.isdir(os.path.join(d, 'tools')):
        return {'ok': False, 'erreur': 'OpenMontage est déjà installé dans ' + d,
                'log': ''}
    git = shutil.which('git')
    if not git:
        return {'ok': False,
                'erreur': "git introuvable — installez git puis réessayez.",
                'log': ''}
    log = ['$ git clone --depth 1 ' + OM_REPO_URL + ' ' + d]
    try:
        os.makedirs(os.path.dirname(d), exist_ok=True)
        p = subprocess.run([git, 'clone', '--depth', '1', OM_REPO_URL, d],
                           capture_output=True, text=True, timeout=900,
                           shell=False)
        out = ((p.stdout or '') + '\\n' + (p.stderr or '')).strip()
        log.append(out[-2500:] if out else '(aucune sortie)')
        ok = p.returncode == 0
        return {'ok': ok,
                'erreur': None if ok else 'git clone a échoué (voir log)',
                'log': '\\n'.join(log)[-4000:]}
    except subprocess.TimeoutExpired:
        log.append('TIMEOUT (>15 min).')
        return {'ok': False, 'erreur': 'TIMEOUT du clonage.',
                'log': '\\n'.join(log)[-4000:]}
    except Exception as e:
        return {'ok': False, 'erreur': str(e), 'log': '\\n'.join(log)[-4000:]}


def media_deps():
    """Installation des dépendances : venv + pip + piper-tts + npm (Remotion).

    Long (plusieurs minutes) : chaque étape est loggée, un échec interrompt
    proprement avec le log accumulé. Node absent = Remotion non installé, le
    rendu FFmpeg reste possible (c'est un choix documenté d'OpenMontage).
    """
    import os
    import shutil
    d = _media_dir()
    if not os.path.isdir(os.path.join(d, 'tools')):
        return {'ok': False, 'erreur': "Clonez d'abord OpenMontage (étape 1).",
                'log': ''}
    py = shutil.which('python')
    if not py:
        return {'ok': False, 'erreur': 'Python introuvable — installez Python 3.10+.',
                'log': ''}
    log = []
    ok = _media_run([py, '-m', 'venv', '.venv'], d, 300, log, 'python -m venv .venv')
    if not ok:
        return {'ok': False, 'erreur': 'Échec de la création du venv.',
                'log': '\\n'.join(log)[-4000:]}
    vp = _media_venv_python(d)
    if not vp:
        return {'ok': False, 'erreur': 'venv créé mais python introuvable dedans.',
                'log': '\\n'.join(log)[-4000:]}
    ok = _media_run([vp, '-m', 'pip', 'install', '--upgrade', 'pip'], d, 300,
                    log, 'pip install --upgrade pip')
    ok = _media_run([vp, '-m', 'pip', 'install', '-r', 'requirements.txt'], d,
                    1800, log, 'pip install -r requirements.txt')
    if not ok:
        return {'ok': False, 'erreur': 'Échec de pip install (voir log).',
                'log': '\\n'.join(log)[-4000:]}
    _media_run([vp, '-m', 'pip', 'install', 'piper-tts'], d, 900, log,
               'pip install piper-tts (voix locale)')
    node = shutil.which('node')
    npm = shutil.which('npm') or shutil.which('npm.cmd')
    if node and npm and os.path.isdir(os.path.join(d, 'remotion-composer')):
        ok = _media_run([npm, 'install'], os.path.join(d, 'remotion-composer'),
                        1800, log, 'npm install (remotion-composer)')
        if not ok:
            return {'ok': False, 'erreur': 'Échec de npm install (Remotion).',
                    'log': '\\n'.join(log)[-4000:]}
    else:
        log.append('Node/npm absent : Remotion non installé — le rendu FFmpeg '
                   'reste disponible.')
    src, dst = os.path.join(d, '.env.example'), os.path.join(d, '.env')
    if os.path.isfile(src) and not os.path.isfile(dst):
        try:
            import shutil as _sh
            _sh.copyfile(src, dst)
            log.append('.env créé depuis .env.example (à compléter : clés API).')
        except Exception:
            pass
    return {'ok': True, 'erreur': None, 'log': '\\n'.join(log)[-4000:]}


def media_run_action(action):
    """Exécute une action PRÉDÉFINIE dans le venv d'OpenMontage (liste blanche)."""
    import os
    d = _media_dir()
    if action not in OM_ACTIONS:
        return {'ok': False, 'erreur': 'Action inconnue (liste blanche : '
                + ', '.join(OM_ACTIONS) + ').', 'log': ''}
    if not os.path.isdir(os.path.join(d, 'tools')):
        return {'ok': False, 'erreur': "OpenMontage n'est pas installé.",
                'log': ''}
    vp = _media_venv_python(d)
    if not vp:
        return {'ok': False, 'erreur': 'Dépendances non installées — lancez '
                "« Installer les dépendances ».", 'log': ''}
    if action == 'envelope':
        code = ("from tools.tool_registry import registry; import json; "
                "registry.discover(); "
                "print(json.dumps(registry.support_envelope(), indent=2))")
    else:
        code = ("from tools.tool_registry import registry; import json; "
                "registry.discover(); "
                "print(json.dumps(registry.provider_menu(), indent=2))")
    log = []
    ok = _media_run([vp, '-c', code], d, 180, log, 'python -c (tool_registry: ' + action + ')')
    return {'ok': ok, 'erreur': None if ok else 'Échec (voir log)',
            'log': '\\n'.join(log)[-4000:]}


'''

with io.open(ROOT, 'rb') as f:
    buf = f.read().decode('utf-8')

def inserer(label, ancre, bloc):
    n = buf.count(ancre)
    if n != 1:
        print('ERREUR [%s] : ancre x%d (attendu 1)' % (label, n))
        sys.exit(2)
    return buf.replace(ancre, bloc + ancre)

# S1 — fonctions avant def mpt_status()
# Le fichier patch vit en LF : normalisation LITTÉRALE vers CRLF (règle
# projet : s.replace("\n","\r\n"), jamais une regex d'échappements).
S1_NEW = S1_NEW.replace('\n', '\r\n')
buf = inserer('S1_fonctions', 'def mpt_status():', S1_NEW)

# S2 — route GET après le bloc supertonic/status
S2_ANCRE = ("        # Supertonic local : état (interrogé par PARAMÈTRES)\r\n"
            "        if self.path.split('?')[0] == '/supertonic/status':\r\n"
            "            self._json_response(st_status())\r\n"
            "            return\r\n")
S2_NEW = S2_ANCRE + ("        # v631 — Media : état du pont OpenMontage (prérequis + installation)\r\n"
                     "        if self.path.split('?')[0] == '/media/status':\r\n"
                     "            self._json_response(media_status())\r\n"
                     "            return\r\n")
buf = inserer('S2_route_get', S2_ANCRE, S2_NEW)

# S3 — routes POST après le bloc freellmapi/start
S3_ANCRE = ("        # v486 — démarrage du routeur : lance la commande configurée par\r\n"
            "        # l'utilisateur (sur SA machine). L'adresse est validée bouclage.\r\n"
            "        if self.path.split('?')[0] == '/freellmapi/start':\r\n"
            "            self._fla_start()\r\n"
            "            return\r\n")
S3_NEW = S3_ANCRE + ("        # v631 — Media : pont OpenMontage (LISTE BLANCHE, voir bloc v631)\r\n"
                     "        if self.path.split('?')[0] == '/media/clone':\r\n"
                     "            self._json_response(media_clone())\r\n"
                     "            return\r\n"
                     "        if self.path.split('?')[0] == '/media/deps':\r\n"
                     "            self._json_response(media_deps())\r\n"
                     "            return\r\n"
                     "        if self.path.split('?')[0] == '/media/run':\r\n"
                     "            corps = self._lire_corps_json()\r\n"
                     "            action = corps.get('action') if isinstance(corps, dict) else None\r\n"
                     "            self._json_response(media_run_action(action))\r\n"
                     "            return\r\n")
buf = inserer('S3_route_post', S3_ANCRE, S3_NEW)

# Contrôles : LF nus non augmentés ; écriture
lf_avant = buf.count('\n') - buf.count('\r\n')
# (recalcul via octets : refaisons proprement)
data = buf.encode('utf-8')
crlf = data.count(b'\r\n')
lf_nus = data.count(b'\n') - crlf

with io.open(ROOT, 'rb') as f:
    avant = f.read()
lf_avant = avant.count(b'\n') - avant.count(b'\r\n')
if lf_nus > lf_avant:
    print('ERREUR : nouveaux LF nus (%d -> %d)' % (lf_avant, lf_nus))
    sys.exit(3)

with io.open(ROOT, 'wb') as f:
    f.write(data)
print('OK : endpoints /media/* ajoutés (LF nus %d -> %d, aucun nouveau).' % (lf_avant, lf_nus))
