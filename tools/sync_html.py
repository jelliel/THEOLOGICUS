# -*- coding: utf-8 -*-
"""
THEOLOGICUS — synchroniser le HTML source vers TOUTES les copies de travail.

Pourquoi ce script existe
-------------------------
THEOLOGICUS.html vit en plusieurs exemplaires sur le disque : le source, la
copie Android (mobile/www), la distribution Windows (dist/THEOLOGICUS) et le
dossier d'installation lance par l'utilisateur (_inst_v102). Un correctif
applique au seul source ne se voit NULLE PART ailleurs — c'est exactement ce
qui s'est produit en v107 : l'app Windows affichait encore l'ancienne version
alors que le depot etait corrige.

Usage
-----
    python tools/sync_html.py            # copie et verifie
    python tools/sync_html.py --check     # ne copie rien, Signale les ecarts

Le script refuse de copier si la source est plus PETITE qu'une cible : un
fichier tronque ne doit jamais ecraser une version complete.
"""

import hashlib
import os
import shutil
import sys

SOURCE = "THEOLOGICUS.html"

CIBLES = [
    "mobile/www/index.html",              # Capacitor (APK)
    "dist/THEOLOGICUS/THEOLOGICUS.html",  # distribution Windows
    "_inst_v102/THEOLOGICUS.html",        # installation locale lancee
]


def md5(path):
    with open(path, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()


def main():
    verifier_seulement = "--check" in sys.argv
    racine = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(racine)

    if not os.path.isfile(SOURCE):
        print("[X] Source introuvable : %s" % SOURCE)
        return 1

    ref_md5 = md5(SOURCE)
    ref_taille = os.path.getsize(SOURCE)
    print("[SOURCE] %s  %d octets  md5=%s" % (SOURCE, ref_taille, ref_md5[:12]))
    print("")

    ecarts = 0
    for cible in CIBLES:
        if not os.path.isfile(cible):
            print("[--] %-38s absente, ignoree" % cible)
            continue

        t_md5 = md5(cible)
        t_taille = os.path.getsize(cible)

        if t_md5 == ref_md5:
            print("[OK] %-38s deja identique" % cible)
            continue

        # v117 — le build ESTAMPE la version dans dist/_inst_v102 :
        # `var STAMPED = '__THEO_VERSION__'` devient `var STAMPED = '2.0.145'`.
        # Le fichier deploye est donc legitimement plus court de quelques octets
        # que la source, sans etre perime. Sans cette reconnaissance, chaque build
        # faisait crier « PERIMEE » (1464224 -> 1464233) et l'on « corrigeait »
        # un ecart qui n'existait pas. On ne signale donc comme perimee que si la
        # cible n'a PAS de tampon de version.
        try:
            with open(cible, 'rb') as f:
                tete = f.read()
            import re as _re
            m = _re.search(rb"var STAMPED = '([^']*)'", tete)
            estampille = bool(m) and m.group(1) != b'__THEO_VE' + b'RSION__'
        except Exception:
            estampille = False

        if estampille:
            # v120 — le tampon seul ne prouve RIEN sur la fraicheur : une
            # installation oubliee depuis des semaines porte aussi un tampon,
            # et elle etait benie « deployee » a chaque sync. Mesure du
            # 2026-09-25 : `_inst_v102/THEOLOGICUS.html` datait de 05:53 quand
            # la source venait d'etre corrigee a 15:20 — le correctif (bouton
            # STUDIO VIDEO) etait ABSENT de l'installation, et le script disait
            # « OK ». On exige donc que la cible soit PLUS RECENTE que la source.
            try:
                recente = os.path.getmtime(cible) >= os.path.getmtime(source)
            except Exception:
                recente = False
            if recente:
                print("[OK] %-38s deployee (version estampillee par le build)" % cible)
                continue
            print("[!!] %-38s deployee mais PLUS ANCIENNE que la source" % cible)
            print("     -> le correctif n'est pas dans l'installation : on recopie")
            # On retombe dans la copie ci-dessous (le tampon sera re-estampille
            # par le prochain build ; ici la copie est de toute facon en avance).
            estampille = False

        if not estampille:
            ecarts += 1
            etat = "PERIMEE" if t_taille < ref_taille else "DIFFERENTE"
            print("[!!] %-38s %s (%d -> %d octets)" % (cible, etat, t_taille, ref_taille))

        if verifier_seulement:
            continue

        # Garde-fou : ne jamais remplacer une copie par plus petite.
        if t_taille > ref_taille:
            print("     refus : la cible est PLUS GROSSE que la source.")
            print("     (la source est peut-etre tronquee — verifier avant de continuer)")
            continue

        shutil.copyfile(SOURCE, cible)
        if md5(cible) == ref_md5:
            print("     -> synchronisee")
        else:
            print("     -> ECHEC de la copie !")

    print("")
    if verifier_seulement:
        print("VERDICT : %d copie(s) en ecart." % ecarts)
        return 1 if ecarts else 0

    print("VERDICT : %d copie(s) mises a jour." % ecarts)
    return 0


if __name__ == "__main__":
    sys.exit(main())
