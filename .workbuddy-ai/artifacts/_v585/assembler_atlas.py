# -*- coding: utf-8 -*-
"""v585 — assemblage des atlas de sprites (format moteur pets v584).
Grille : 8 colonnes x 4 rangees (idle=0, thinking=1, happy=2, wave=3),
cellule 256x278, fond transparent, sortie WebP + data URL.
Les frames sont recadrees sur la zone dessinee (bounding box alpha)."""
import os, sys, base64, json
from PIL import Image

SRC = "C:/tmp/theoverify/.workbuddy-ai/artifacts/_v584/sprites"
OUT = "C:/tmp/theoverify/.workbuddy-ai/artifacts/_v585"
CW, CH = 256, 278          # cellule
COLS, ROWS = 8, 4
ETATS = ["idle", "thinking", "happy", "wave"]
PETS = ["colombe", "chouette", "cierge", "lion", "perroquet", "poisson", "fennec", "phenix"]

def charger(chemin):
    im = Image.open(chemin).convert("RGBA")
    # bounding box de la zone dessinee (alpha > 8)
    a = im.getchannel("A")
    bbox = a.getbbox()
    if bbox:
        marge = 0.06
        x0, y0, x1, y1 = bbox
        dx, dy = int((x1 - x0) * marge) + 2, int((y1 - y0) * marge) + 2
        x0, y0 = max(0, x0 - dx), max(0, y0 - dy)
        x1, y1 = min(im.width, x1 + dx), min(im.height, y1 + dy)
        im = im.crop((x0, y0, x1, y1))
    # ajustement au ratio cellule sans deformer
    r_src, r_dst = im.width / im.height, CW / CH
    if r_src > r_dst:      # trop large -> couper les cotes
        nl = int(im.height * r_dst)
        x = (im.width - nl) // 2
        im = im.crop((x, 0, x + nl, im.height))
    else:                  # trop haut -> couper haut/bas
        nh = int(im.width / r_dst)
        y = (im.height - nh) // 2
        im = im.crop((0, y, im.width, y + nh))
    return im.resize((CW, CH), Image.LANCZOS)

def frames(pet):
    """retourne {etat: [chemins...]} — repli sur la frame voisine si manquante"""
    res = {}
    for etat in ETATS:
        liste = []
        n = 1
        while True:
            p = os.path.join(SRC, "%s_%s%d.png" % (pet, "think" if etat == "thinking" else etat, n))
            if os.path.exists(p):
                liste.append(p)
                n += 1
            else:
                break
        if not liste and pet != "colombe":
            # pets non encore generes : frame unique depuis la base
            base = os.path.join(SRC, pet + "_base.png")
            if os.path.exists(base):
                liste = [base]
        res[etat] = liste
    return res

atlas = {}
rapport = {}
for pet in PETS:
    fr = frames(pet)
    dispo = {e: len(v) for e, v in fr.items() if v}
    if not any(dispo.values()):
        rapport[pet] = "ABSENT"
        continue
    planche = Image.new("RGBA", (COLS * CW, ROWS * CH), (0, 0, 0, 0))
    compte = {}
    for i, etat in enumerate(ETATS):
        liste = fr[etat]
        if not liste:
            # pas de frame pour cet etat : reutiliser idle si present
            liste = fr["idle"] or list(fr.values())[0]
        for f, chemin in enumerate(liste[:COLS]):
            planche.paste(charger(chemin), (f * CW, i * CH))
        compte[etat] = len(liste[:COLS])
    nom = "atlas_" + pet + ".webp"
    planche.save(os.path.join(OUT, nom), "WEBP", quality=82, method=6)
    b64 = base64.b64encode(open(os.path.join(OUT, nom), "rb").read()).decode()
    atlas[pet] = "data:image/webp;base64," + b64
    rapport[pet] = compte

# module d atlas embarque
frames_meta = {pet: rapport[pet] for pet in rapport if isinstance(rapport[pet], dict)}
with open(os.path.join(OUT, "atlas_gen.js"), "w", encoding="utf-8") as fh:
    fh.write("/* v585 — atlas de sprites illustres (generes par Gemini 3 Pro Image,\n")
    fh.write("   assembles par assembler_atlas.py). Cle -> data URL WebP. */\n")
    fh.write("window.__v585Atlas = {\n")
    for pet, url in atlas.items():
        taille = len(url)
        fh.write('  "%s": "%s",  /* %d Ko */\n' % (pet, url, taille // 1024))
    fh.write("};\n")
    fh.write("window.__v585Frames = ")
    fh.write(json.dumps(frames_meta, ensure_ascii=False))
    fh.write(";\n")

print(json.dumps(rapport, ensure_ascii=False, indent=1))
print("pets assembles :", len(atlas))
total = sum(len(u) for u in atlas.values()) // 1024
print("poids total data URLs : %d Ko" % total)
