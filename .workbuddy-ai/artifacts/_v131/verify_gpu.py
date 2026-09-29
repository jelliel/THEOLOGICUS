# -*- coding: utf-8 -*-
"""Verifie que le build PyInstaller embarque bien les drapeaux GPU ultra (v129).
On extrait le CArchive de l'exe et on cherche les chaines de DRAPEAUX_GPU_ULTRA.
"""
import sys

TARGET = sys.argv[1] if len(sys.argv) > 1 else "dist/THEOLOGICUS/THEOLOGICUS.exe"
NEEDLES = [b"--disable-gpu-vsync", b"DRAPEAUX_GPU_ULTRA", b"THEOLOGICUS_GPU_MODE"]

try:
    from PyInstaller.archive.readers import CArchiveReader as CArchive
except Exception as e:
    print("IMPORT_ERR", e)
    sys.exit(2)

ca = CArchive(TARGET)
hits = {}
for name in ca.toc:
    try:
        data = ca.extract(name)
    except Exception:
        continue
    if not data:
        continue
    for n in NEEDLES:
        if n in data:
            hits.setdefault(name, []).append(n.decode("utf-8", "replace"))

if hits:
    print("OK: drapeaux GPU trouves dans l'exe build")
    for k, v in hits.items():
        print("  ", k, "->", v)
    sys.exit(0)
else:
    print("KO: aucun des drapeaux GPU trouve dans l'exe build")
    # diagnostic: liste quelques entrees du toc
    print("ENTRIES_SAMPLE:", list(ca.toc.keys())[:20])
    sys.exit(1)
