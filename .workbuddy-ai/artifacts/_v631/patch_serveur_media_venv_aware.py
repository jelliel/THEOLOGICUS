# v631b — Serveur : media_deps VERSION-AWARE (venv lié au Python qui l'a créé).
# Cause réelle constatée chez l'utilisateur : un venv créé avec un Python 3.13
# (binaires cp313) puis repris par un Python 3.14 -> les .pyd ne chargent plus
# (ModuleNotFoundError: No module named 'rpds.rpds'). Correctif : si la version
# du Python courant diffère de la base du venv existant (pyvenv.cfg), on ARCHIVE
# l'ancien venu (.venv.old-pyX.Y) et on reconstruit complètement.
# 2 remplacements littéraux (CRLF ; contrôle : aucun nouveau LF nu).
import io, sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else 'proxy_server.py'

HELPERS = '''def _media_pyver(py):
    """Version majeure.mineure d'un interpréteur Python ('3.14'), ou None."""
    import subprocess
    try:
        p = subprocess.run([py, '-c', "import sys; print('%d.%d' % sys.version_info[:2])"],
                           capture_output=True, text=True, timeout=15, shell=False)
        return (p.stdout or '').strip()
    except Exception:
        return None


def _venv_base_ver(venv_dir):
    """Version du Python de base d'un venv (lue dans pyvenv.cfg), ou None."""
    import os
    try:
        with open(os.path.join(venv_dir, 'pyvenv.cfg'), encoding='utf-8', errors='replace') as f:
            for ligne in f:
                if ligne.lower().startswith('version'):
                    return ligne.split('=', 1)[1].strip()[:4]
    except Exception:
        pass
    return None


'''

DEPS_OLD = '''    py = shutil.which('python')
    if not py:
        return {'ok': False, 'erreur': 'Python introuvable — installez Python 3.10+.',
                'log': ''}
    log = []
    ok = _media_run([py, '-m', 'venv', '.venv'], d, 300, log, 'python -m venv .venv')
    if not ok:
        return {'ok': False, 'erreur': 'Échec de la création du venv.',
                'log': '\\n'.join(log)[-4000:]}
    vp = _media_venv_python(d)'''

DEPS_NEW = '''    py = shutil.which('python')
    if not py:
        return {'ok': False, 'erreur': 'Python introuvable — installez Python 3.10+.',
                'log': ''}
    log = []
    # v631b — le venv est LIÉ à la version du Python qui l'a créé : les binaires
    # compilés (.pyd) sont spécifiques (cp313, cp314…). Si le Python courant
    # diffère de la base du venv existant (pyvenv.cfg), on ARCHIVE l'ancien venv
    # et on reconstruit — sinon : « ModuleNotFoundError: No module named
    # 'rpds.rpds' » (constaté chez un utilisateur).
    ver = _media_pyver(py)
    venv_dir = os.path.join(d, '.venv')
    if os.path.isdir(venv_dir):
        base = _venv_base_ver(venv_dir)
        if base and ver and base != ver:
            vieux = os.path.join(d, '.venv.old-py' + base.replace('.', ''))
            try:
                import shutil as _sh
                if os.path.isdir(vieux):
                    _sh.rmtree(vieux, ignore_errors=True)
                os.rename(venv_dir, vieux)
                log.append('Python ' + base + ' -> ' + ver
                           + ' : ancien venv archivé (' + os.path.basename(vieux)
                           + '), reconstruction complète.')
            except Exception as e:
                return {'ok': False,
                        'erreur': ("Le venv existant (Python " + base
                                   + ") est incompatible avec le Python courant ("
                                   + ver + ") et n'a pas pu être archivé : " + str(e)),
                        'log': '\\n'.join(log)[-4000:]}
    ok = _media_run([py, '-m', 'venv', '.venv'], d, 300, log, 'python -m venv .venv')
    if not ok:
        return {'ok': False, 'erreur': 'Échec de la création du venv.',
                'log': '\\n'.join(log)[-4000:]}
    try:
        with open(os.path.join(venv_dir, '.theo_pyver'), 'w') as f:
            f.write(ver or '')
    except Exception:
        pass
    vp = _media_venv_python(d)'''

with io.open(ROOT, 'rb') as f:
    data = f.read()
buf = data.decode('utf-8')

def replace_once(label, old, new):
    global buf
    n = buf.count(old)
    if n != 1:
        print('ERREUR [%s] : occurrence = %d (attendu 1)' % (label, n))
        sys.exit(2)
    buf = buf.replace(old, new)

HELPERS_CRLF = HELPERS.replace('\n', '\r\n')
replace_once('S_helpers', 'def media_clone():', HELPERS_CRLF + 'def media_clone():')

DEPS_OLD_CRLF = DEPS_OLD.replace('\n', '\r\n')
DEPS_NEW_CRLF = DEPS_NEW.replace('\n', '\r\n')
replace_once('S_deps_aware', DEPS_OLD_CRLF, DEPS_NEW_CRLF)

out = buf.encode('utf-8')
crlf = out.count(b'\r\n')
lf_nus = out.count(b'\n') - crlf
if lf_nus > data.count(b'\n') - data.count(b'\r\n'):
    print('ERREUR : nouveaux LF nus')
    sys.exit(3)

with io.open(ROOT, 'wb') as f:
    f.write(out)
print('OK : media_deps version-aware (helpers + archive venv si base différente).')
