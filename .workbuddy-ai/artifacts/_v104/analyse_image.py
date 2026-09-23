# -*- coding: utf-8 -*-
"""v104 — localiser le cadre orange trace par l'utilisateur sur la capture.

Le modele ne peut pas ouvrir l'image ; on l'analyse donc par les pixels.
Objectif : trouver la boite englobante du trait orange, la recadrer, et
mesurer ce qui s'y trouve, pour identifier l'element concerne.
"""
import sys
from PIL import Image

SRC = r"C:\Users\toshr\Pictures\Screenshots\Screenshot 2026-09-22 204216.png"
OUT_DIR = r"C:\Theologicus\.workbuddy-ai\artifacts\_v104"

im = Image.open(SRC)
print("taille image :", im.size, "| mode :", im.mode)
rgb = im.convert("RGB")
W, H = rgb.size
px = rgb.load()

# Un trait d'annotation "orange" : rouge haut, vert moyen, bleu bas.
# On accepte une plage large (feutre, anti-aliasing, compression).
def est_orange(r, g, b):
    return r > 170 and 60 < g < 200 and b < 110 and (r - b) > 90 and (r - g) > 30

minx, miny, maxx, maxy, n = W, H, -1, -1, 0
for y in range(H):
    for x in range(W):
        r, g, b = px[x, y]
        if est_orange(r, g, b):
            n += 1
            if x < minx: minx = x
            if x > maxx: maxx = x
            if y < miny: miny = y
            if y > maxy: maxy = y

print("pixels oranges :", n)
if n == 0:
    print("AUCUN orange detecte : l'annotation n'est peut-etre pas un trait plein.")
    sys.exit(0)

print("boite englobante du orange : x %d..%d  y %d..%d  (%dx%d)"
      % (minx, maxx, miny, maxy, maxx - minx + 1, maxy - miny + 1))
print("position relative : %.1f%% .. %.1f%% en X, %.1f%% .. %.1f%% en Y"
      % (100.0 * minx / W, 100.0 * maxx / W, 100.0 * miny / H, 100.0 * maxy / H))

# Recadrer un peu plus large pour garder le contexte
pad = 12
box = (max(0, minx - pad), max(0, miny - pad), min(W, maxx + pad), min(H, maxy + pad))
crop = rgb.crop(box)
chemin = OUT_DIR + "\\zone_orange.png"
crop.save(chemin)
print("recadre sauve :", chemin, crop.size)

# Apercu des couleurs dominantes DANS le cadre (hors trait orange) :
# cela dit de quel type d'element il s'agit (parchemin, bulle sombre, ...).
from collections import Counter
c = Counter()
for y in range(box[1], box[3], 2):
    for x in range(box[0], box[2], 2):
        r, g, b = px[x, y]
        if est_orange(r, g, b):
            continue
        c[(r // 24 * 24, g // 24 * 24, b // 24 * 24)] += 1
print("couleurs dominantes dans le cadre (hors orange) :")
for col, k in c.most_common(6):
    print("   rgb%s  x%d" % (col, k))
