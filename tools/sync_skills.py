"""Synchronise les skills THEOLOGICUS de l'utilisateur vers le depot.

Pourquoi ce script existe : `.workbuddy-ai/skills/` dans le depot est un
MIROIR de `~/.workbuddy-ai/skills/`, qui n'est PAS un depot git. Un miroir qui
diverge est pire que pas de miroir — il fait croire a une sauvegarde alors qu'il
sert une version perimee. La copie manuelle s'oubliait ; on la rend mecanique.

Sens de copie : utilisateur -> depot. Jamais l'inverse. La source de verite est
le dossier utilisateur, parce que c'est de la que l'agent charge un skill.

Usage :
    python tools/sync_skills.py            # copie et signale les ecarts
    python tools/sync_skills.py --verifier  # ne copie rien, code de sortie 1 si ecart
"""

import argparse
import filecmp
import os
import shutil
import sys

SKILLS = (
    "theologicus-apk-build",
    "theologicus-code-fragilities",
    "theologicus-tts-diagnostic",
    "theologicus-zindex-guard",
)

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _source():
    """Dossier des skills de l'utilisateur. Honor `SKILLS_DIR` pour les tests."""
    env = os.environ.get("SKILLS_DIR")
    if env:
        return env
    return os.path.join(os.path.expanduser("~"), ".workbuddy-ai", "skills")


def _fichiers(dossier):
    """Liste relative des fichiers d'un skill, triee."""
    out = []
    for base, _dirs, noms in os.walk(dossier):
        for n in noms:
            out.append(os.path.relpath(os.path.join(base, n), dossier))
    return sorted(out)


def _comparer(src, dst):
    """Ecarts d'un skill : (fichiers manquants, fichiers differents).

    On compare fichier par fichier plutot que le dossier entier : `filecmp` sur
    un dossier ne dit PAS lequel a change, et un rapport qui ne nomme pas le
    fichier oblige a tout re-verifier a la main.
    """
    if not os.path.isdir(dst):
        return ["(dossier absent)"], []
    manquants, differents = [], []
    for rel in _fichiers(src):
        a, b = os.path.join(src, rel), os.path.join(dst, rel)
        if not os.path.isfile(b):
            manquants.append(rel)
        elif not filecmp.cmp(a, b, shallow=False):
            differents.append(rel)
    return manquants, differents


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--verifier", action="store_true",
                    help="ne copie rien ; sort en 1 si le miroir diverge")
    args = ap.parse_args()

    src_racine = _source()
    dst_racine = os.path.join(RACINE, ".workbuddy-ai", "skills")

    if not os.path.isdir(src_racine):
        print("Source introuvable : %s" % src_racine)
        return 2

    print("Source : %s" % src_racine)
    print("Miroir : %s\n" % dst_racine)

    ecarts = 0
    for nom in SKILLS:
        src, dst = os.path.join(src_racine, nom), os.path.join(dst_racine, nom)
        if not os.path.isdir(src):
            print("[--] %-32s absent de la source" % nom)
            continue
        manquants, differents = _comparer(src, dst)
        if not manquants and not differents:
            print("[OK] %-32s identique" % nom)
            continue
        ecarts += 1
        detail = []
        if manquants:
            detail.append("manquants: %s" % ", ".join(manquants))
        if differents:
            detail.append("differents: %s" % ", ".join(differents))
        print("[!!] %-32s %s" % (nom, " ; ".join(detail)))
        if not args.verifier:
            # On remplace le dossier entier : un fichier supprime cote source
            # doit disparaitre du miroir, sinon le miroir accumule des morts.
            if os.path.isdir(dst):
                shutil.rmtree(dst)
            shutil.copytree(src, dst)
            print("     -> miroir mis a jour")

    if args.verifier:
        print("\nVERDICT : %s" % ("a jour" if ecarts == 0 else "%d skill(s) a synchroniser" % ecarts))
        return 1 if ecarts else 0

    print("\nVERDICT : %d skill(s) synchronise(s), %d deja a jour."
          % (ecarts, len(SKILLS) - ecarts))
    if ecarts:
        print("Penser a committer : git add .workbuddy-ai/skills/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
