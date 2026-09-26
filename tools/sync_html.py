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

# v126 — THEOLOGICUS.html n'est plus seul : le modal AI VIDEO charge un
# SECOND document. Oublier de le propager donne un iframe VIDE sur le mobile
# et dans l'installable, sans la moindre erreur — exactement le genre de
# panne qu'on ne voit pas sur sa machine de developpement. Meme regle que le
# HTML principal : un fichier absent de `dist/` est une fonction absente.
COMPAGNONS = {
    "ai-video.html": [
        "mobile/www/ai-video.html",              # Capacitor (APK)
        "dist/THEOLOGICUS/ai-video.html",        # distribution Windows
        "_inst_v102/ai-video.html",              # installation locale
    ],
}


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
                recente = os.path.getmtime(cible) >= os.path.getmtime(SOURCE)
            except Exception:
                recente = False
            if recente:
                print("[OK] %-38s deployee (version estampillee par le build)" % cible)
                continue
            print("[!!] %-38s deployee mais PLUS ANCIENNE que la source" % cible)
            print("     -> le correctif n'est pas dans l'installation : on recopie")
            # On retombe dans la copie ci-dessous. La copie ecrase un fichier
            # ESTAMPILLE par un fichier NON estampille : c'est normal (on remet
            # la source en place, le prochain build re-estampille) mais ce n'est
            # PAS neutre — `dist` perd alors son numero de version, et
            # `version.txt` continue d'annoncer une version que le HTML ne porte
            # plus. On le dit, pour que personne ne cherche midi a quatorze
            # heures devant un « STAMPED = '__THEO_VERSION__' » inattendu.
            print("     (le tampon de version du HTML est ecrase : le prochain")
            print("      build le remettra — ce n'est pas un defaut)")
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

    # ── Les documents compagnons ──────────────────────────────────────
    # Regle simple, et differente du HTML principal : un compagnon n'est
    # jamais estampille, donc la seule question est « est-il identique ? ».
    # Une cible ABSENTE est copiee (et non ignoree) : c'est justement le cas
    # qui produit un iframe vide.
    print("")
    for src, cibles in COMPAGNONS.items():
        if not os.path.isfile(src):
            print("[--] %-38s source absente, ignoree" % src)
            continue
        s_md5 = md5(src)
        for cible in cibles:
            dossier = os.path.dirname(cible)
            if dossier and not os.path.isdir(dossier):
                print("[--] %-38s dossier absent, ignoree" % cible)
                continue
            if os.path.isfile(cible) and md5(cible) == s_md5:
                print("[OK] %-38s deja identique" % cible)
                continue
            ecarts += 1
            if os.path.isfile(cible):
                print("[!!] %-38s PERIMEE" % cible)
            else:
                print("[!!] %-38s ABSENTE" % cible)
            if verifier_seulement:
                continue
            shutil.copyfile(src, cible)
            print("     -> copiee" if md5(cible) == s_md5 else "     -> ECHEC de la copie !")

    print("")
    if verifier_seulement:
        print("VERDICT : %d copie(s) en ecart." % ecarts)
        return 1 if ecarts else 0

    print("VERDICT : %d copie(s) mises a jour." % ecarts)
    return 0


if __name__ == "__main__":
    sys.exit(main())
