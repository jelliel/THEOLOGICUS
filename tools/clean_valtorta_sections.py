# -*- coding: utf-8 -*-
"""Nettoie les textes de valtorta_sec.json (retire la navigation du site).

Utile pour les donnees recoltees AVANT l'ajout du nettoyage dans le
moissonneur. Idempotent.
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from scan_valtorta_sections import nettoie  # noqa: E402

OUT = os.path.join(ROOT, "tradition", "valtorta_sec.json")

d = json.load(open(OUT, encoding="utf-8"))
n0 = n1 = 0
for s in d["sections"]:
    for p in s.get("pages", []):
        if p.get("x"):
            n0 += len(p["x"])
            p["x"] = nettoie(p["x"])
            n1 += len(p["x"])
d["meta"]["nettoye"] = True
json.dump(d, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("textes nettoyes : %d -> %d caracteres (-%.0f%%)"
      % (n0, n1, 100.0 * (n0 - n1) / max(1, n0)))
