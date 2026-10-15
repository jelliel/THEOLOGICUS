# -*- coding: utf-8 -*-
"""v585bis — fabrique des frames d animation a partir d UNE illustration.
Le quota de generation d images etant epuise (429), on anime les poses de base
par transformations geometriques (respiration, inclinaison, saut) : les vraies
poses generees remplaceront ces fichiers des que le quota reviendra
(assembler_atlas.py prend toujours les fichiers presents)."""
import os
from PIL import Image

SRC = "C:/tmp/theoverify/.workbuddy-ai/artifacts/_v584/sprites"
CW, CH = 256, 278
BASE = 1024                     # largeur de travail (l illustration est en 1024)
HAUT = int(BASE / (CW / CH))    # 1112 — meme ratio que la cellule

PETS = ["chouette", "cierge", "lion", "perroquet", "poisson", "fennec", "phenix"]

# (nom de frame, rotation degres, dx, dy, echelle) — valeurs a l echelle BASE
PLANS = {
    "idle":     [("idle1", 0.0, 0, 0, 1.0), ("idle2", -1.2, 0, 22, 1.0), ("idle3", 1.2, 0, -18, 1.0)],
    "thinking": [("think1", -4.0, -10, -12, 1.0), ("think2", 4.0, 10, -8, 1.0)],
    "happy":    [("happy1", -3.0, 0, -66, 1.02), ("happy2", 3.0, 0, -34, 1.0)],
    "wave":     [("wave1", 7.0, -22, -20, 1.0)],
}

def normaliser(chemin):
    """recadre sur la zone dessinee et normalise au ratio de la cellule"""
    im = Image.open(chemin).convert("RGBA")
    bbox = im.getchannel("A").getbbox()
    if bbox:
        x0, y0, x1, y1 = bbox
        m = 0.06
        dx, dy = int((x1 - x0) * m) + 2, int((y1 - y0) * m) + 2
        im = im.crop((max(0, x0 - dx), max(0, y0 - dy), min(im.width, x1 + dx), min(im.height, y1 + dy)))
    r_src, r_dst = im.width / im.height, CW / CH
    if r_src > r_dst:
        nl = int(im.height * r_dst)
        x = (im.width - nl) // 2
        im = im.crop((x, 0, x + nl, im.height))
    else:
        nh = int(im.width / r_dst)
        y = (im.height - nh) // 2
        im = im.crop((0, y, im.width, y + nh))
    return im.resize((BASE, HAUT), Image.LANCZOS)

def transformer(norm, rot, dx, dy, ech):
    """rotation + translation + echelle, fond transparent, sans enroulement"""
    im = norm
    if ech != 1.0:
        nw, nh = int(im.width * ech), int(im.height * ech)
        im = im.resize((nw, nh), Image.LANCZOS)
    if rot:
        im = im.rotate(rot, resample=Image.BICUBIC, expand=False)
    if dx or dy:
        canevas = Image.new("RGBA", (BASE, HAUT), (0, 0, 0, 0))
        canevas.paste(im, (dx + (BASE - im.width) // 2, dy + (HAUT - im.height) // 2), im)
        im = canevas
    return im.resize((CW, CH), Image.LANCZOS)

total = 0
for pet in PETS:
    base = os.path.join(SRC, pet + "_base.png")
    if not os.path.exists(base):
        base = os.path.join(SRC, pet + "_happy1.png")   # certaines bases ont ete renommees
    if not os.path.exists(base):
        print("  %-10s ABSENT" % pet)
        continue
    norm = normaliser(base)
    n = 0
    for etat, frames in PLANS.items():
        for (nom, rot, dx, dy, ech) in frames:
            cible = os.path.join(SRC, "%s_%s.png" % (pet, nom))
            if os.path.exists(cible) and os.path.getsize(cible) > 0:
                continue        # une VRAIE pose generee existe : on la garde
            transformer(norm, rot, dx, dy, ech).save(cible, "PNG")
            n += 1
    total += n
    print("  %-10s %d frames fabriquees" % (pet, n))
print("TOTAL : %d frames (a partir des illustrations existantes)" % total)
