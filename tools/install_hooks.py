"""Installe les hooks git versionnes de ce depot.

Pourquoi ce script : `core.hooksPath` est une configuration LOCALE a chaque
clone. Elle ne voyage pas avec le depot. Un hook non installe est un voeux
pieux : le fichier existe, personne ne l'execute. Toute personne qui clone ce
depot (ou qui change de machine) doit lancer ce script UNE fois.

Usage :
    python tools/install_hooks.py
"""

import os
import stat
import subprocess
import sys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HOOKS = os.path.join(RACINE, "tools", "githooks")


def git(*args):
    return subprocess.run(["git"] + list(args), cwd=RACINE,
                          capture_output=True, text=True)


def main():
    if not os.path.isdir(os.path.join(RACINE, ".git")):
        print("Ce dossier n'est pas un depot git : %s" % RACINE)
        return 2
    if not os.path.isdir(HOOKS):
        print("Dossier de hooks introuvable : %s" % HOOKS)
        return 2

    noms = sorted(n for n in os.listdir(HOOKS)
                  if os.path.isfile(os.path.join(HOOKS, n)))
    if not noms:
        print("Aucun hook a installer dans %s" % HOOKS)
        return 0

    # Sous Windows, git execute les hooks via sh : le bit +x compte peu, mais
    # il est indispensable partout ailleurs. On le pose sans condition.
    for n in noms:
        chemin = os.path.join(HOOKS, n)
        try:
            os.chmod(chemin, os.stat(chemin).st_mode | stat.S_IEXEC
                     | stat.S_IXGRP | stat.S_IXOTH)
        except Exception as e:
            print("  (chmod best-effort sur %s : %s)" % (n, e))
        print("  [OK] %s" % n)

    r = git("config", "core.hooksPath", "tools/githooks")
    if r.returncode != 0:
        print("Echec de git config : %s" % (r.stderr or r.stdout))
        return 1

    actuel = git("config", "core.hooksPath").stdout.strip()
    print("\ncore.hooksPath = %s" % actuel)
    print("VERDICT : %d hook(s) installe(s)." % len(noms))
    print("Les commits passent desormais par ces controles ; --no-verify pour")
    print("les contourner en connaissance de cause.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
