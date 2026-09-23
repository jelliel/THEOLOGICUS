# -*- coding: utf-8 -*-
"""Extraire la cible des raccourcis .lnk sans COM (bloque par le sandbox).
Un .lnk contient le chemin en clair, en ASCII ou en UTF-16LE."""
import glob
import os
import re

CIBLES = [
    "C:/Users/toshr/Desktop/THEOLOGICUS.lnk",
]
CIBLES += glob.glob(
    "C:/Users/toshr/AppData/Roaming/Microsoft/Windows/Start Menu/Programs/THEOLOGICUS/*.lnk"
)

BACKSLASH = chr(92)

for f in CIBLES:
    if not os.path.exists(f):
        print("absent :", f)
        continue
    d = open(f, "rb").read()
    print("=== %s (%d octets)" % (os.path.basename(f), len(d)))

    trouves = set()

    # ASCII imprimable
    for m in re.findall(rb"[\x20-\x7e]{4,160}", d):
        t = m.decode("ascii", "ignore")
        if (BACKSLASH in t) or ("Program" in t) or (".exe" in t.lower()):
            trouves.add(("A", t))

    # UTF-16LE imprimable
    for m in re.findall(rb"(?:[\x20-\x7e]\x00){4,160}", d):
        t = m.decode("utf-16-le", "ignore")
        if (BACKSLASH in t) or ("Program" in t) or (".exe" in t.lower()):
            trouves.add(("U", t))

    for tag, t in sorted(trouves):
        print("   %s: %s" % (tag, t))
    print("---")
