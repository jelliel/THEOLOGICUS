# -*- coding: utf-8 -*-
"""v586 — fabrique des paquets de test OpenPets (valide + invalides)."""
import json, os, zipfile
from PIL import Image, ImageDraw

OUT = "C:/tmp/theoverify/.workbuddy-ai/artifacts/_v586/paquets"
os.makedirs(OUT, exist_ok=True)

# spritesheet 1536x2288 (8x11) : chaque frame = carre colore numerote
def planche(couleur, w=1536, h=2288, cw=192, ch=208):
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for r in range(h // ch):
        for c in range(w // cw):
            x, y = c * cw, r * ch
            d.rounded_rectangle([x + 8, y + 8, x + cw - 8, y + ch - 8], radius=18,
                                fill=couleur + (255,), outline=(40, 40, 60, 255), width=3)
            d.ellipse([x + 60, y + 60, x + cw - 60, y + ch - 60], fill=(255, 255, 255, 230))
    return im

# 1) paquet VALIDE (v2, 1536x2288)
im = planche((90, 160, 220))
im.save(os.path.join(OUT, "spritesheet.webp"), "WEBP", quality=80, method=6)
with zipfile.ZipFile(os.path.join(OUT, "cygne.zip"), "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("cygne/pet.json", json.dumps({
        "id": "cygne", "displayName": "Cygne de Test",
        "description": "Compagnon de test importe", "spritesheetPath": "spritesheet.webp",
        "spriteVersionNumber": 2
    }, ensure_ascii=False, indent=1))
    z.write(os.path.join(OUT, "spritesheet.webp"), "cygne/spritesheet.webp")

# 2) paquet aux MAUVAISES dimensions (1024x1024)
Image.new("RGBA", (1024, 1024), (200, 90, 90, 255)).save(os.path.join(OUT, "petit.webp"), "WEBP")
with zipfile.ZipFile(os.path.join(OUT, "faux.zip"), "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("faux/pet.json", json.dumps({
        "id": "faux", "displayName": "Faux", "spritesheetPath": "spritesheet.webp"
    }))
    z.write(os.path.join(OUT, "petit.webp"), "faux/spritesheet.webp")

# 3) SVG HOSTILE (script) — doit etre refuse
svg = ('<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1872" viewBox="0 0 1536 1872">'
       '<script>alert(1)</script><circle cx="10" cy="10" r="5" fill="#fff"/></svg>')
with zipfile.ZipFile(os.path.join(OUT, "hostile.zip"), "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("hostile/pet.json", json.dumps({
        "id": "hostile", "displayName": "Hostile", "spritesheetPath": "spritesheet.svg"
    }))
    z.writestr("hostile/spritesheet.svg", svg)

# 4) SVG CONFORME (doit passer) — geometrie v1 1536x1872
svg2 = ('<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1872" viewBox="0 0 1536 1872">'
        '<rect x="10" y="10" width="180" height="190" rx="16" fill="#c9a227"/></svg>')
with zipfile.ZipFile(os.path.join(OUT, "simple.zip"), "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("simple/pet.json", json.dumps({
        "id": "simple", "displayName": "Simple Vectoriel", "spritesheetPath": "spritesheet.svg"
    }))
    z.writestr("simple/spritesheet.svg", svg2)

for f in sorted(os.listdir(OUT)):
    print("%-18s %8d octets" % (f, os.path.getsize(os.path.join(OUT, f))))
