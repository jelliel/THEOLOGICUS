#!/usr/bin/env python3
"""Lire ce que contient VRAIMENT un exe PyInstaller — et comparer a une source.

Pourquoi ce script existe : un scan binaire (`grep`, `strings`) d'un exe
PyInstaller donne des comptes a 0 pour du code pourtant present, parce que le
script principal et le PYZ sont COMPRESSES. Conclure « le code n'y est pas » sur
cette base est faux — c'est arrive, et ca a failli declencher une recompilation
inutile par-dessus une installation qui fonctionnait.

Usage :
    py -3.12 inspecter_exe_pyinstaller.py <exe> [source.py]

Sans source : liste les entrees, les modules, et signale les marqueurs connus.
Avec source : compare les ENSEMBLES de constantes et dit si le code embarque
              est identique a la source (c'est la seule reponse decisive).
"""

import marshal
import sys

from PyInstaller.archive.readers import CArchiveReader

# Marqueurs de la fonctionnalite GPU (v129). A adapter si l'on cherche autre chose.
MARQUEURS = (
    "activer_drapeaux_gpu", "renderer_info", "THEOLOGICUS_GPU_ARGS",
    "THEOLOGICUS_GPU", "_theo_gpu", "_theo_base", "_theo_drapeaux",
    "__setattr__", "--ignore-gpu-blocklist",
)


def _parcourir(co, out_consts, out_names):
    """Descend recursivement dans tous les objets code imbriques."""
    vus, pile = set(), [co]
    while pile:
        c = pile.pop()
        if id(c) in vus:
            continue
        vus.add(id(c))
        out_names.update(getattr(c, "co_names", ()))
        for k in getattr(c, "co_consts", ()):
            if isinstance(k, str):
                out_consts.add(k)
            elif hasattr(k, "co_names"):
                pile.append(k)


def _extraire(chemin):
    """Rend (constantes, noms) du script principal de l'exe."""
    arc = CArchiveReader(chemin)
    noms_entrees = list(arc.toc)
    if "app" not in noms_entrees:
        raise SystemExit(
            "Entree 'app' absente. Entrees vues : " + repr(noms_entrees)
        )
    co = marshal.loads(arc.extract("app"))
    consts, noms = set(), set()
    _parcourir(co, consts, noms)
    return arc, noms_entrees, consts, noms


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    exe = sys.argv[1]
    source = sys.argv[2] if len(sys.argv) > 2 else None

    arc, entrees, consts, noms = _extraire(exe)
    print(f"=== {exe}")
    print(f"entrees de l'archive : {len(entrees)} -> {entrees}")

    pyz = arc.open_embedded_archive("PYZ.pyz")
    print(f"modules dans le PYZ   : {len(pyz.toc)}")

    print("\n=== marqueurs recherches")
    for m in MARQUEURS:
        # Un litteral de chaine (cle de dict, argument de os.environ.get) est une
        # CONSTANTE ; un nom de fonction ou d'attribut est un NOM. Chercher au
        # mauvais endroit rend un « absent » faux.
        dans_consts = m in consts
        dans_noms = m in noms
        # Un drapeau n'est PAS une constante a lui seul : les quatre forment UNE
        # seule chaine. Une egalite stricte le declare donc absent a tort. On
        # accepte aussi la containment, en le disant.
        inclus = [s for s in consts if m.startswith("--") and m in s]
        etat = "present" if (dans_consts or dans_noms or inclus) else "ABSENT"
        ou = []
        if dans_consts:
            ou.append("co_consts")
        if dans_noms:
            ou.append("co_names")
        if inclus:
            ou.append(f"inclus dans une chaine de {len(inclus[0])} car.")
        print(f"  {etat:8s} {m:26s} {' + '.join(ou)}")

    if not source:
        return

    depot_consts, depot_noms = set(), set()
    _parcourir(compile(open(source, encoding="utf-8").read(), source, "exec"),
               depot_consts, depot_noms)
    print(f"\n=== comparaison avec {source}")
    print(f"  constantes seulement dans l'exe   : {sorted(consts - depot_consts)}")
    print(f"  constantes seulement dans la source : {sorted(depot_consts - consts)}")
    identique = consts == depot_consts
    print(f"  ensembles identiques : {identique}")
    if identique:
        print("  -> l'exe embarque bien cette source : aucune recompilation requise.")


if __name__ == "__main__":
    main()
