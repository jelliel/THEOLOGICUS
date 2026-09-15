# -*- coding: utf-8 -*-
"""Genere les icones Android de l'app (mipmap + adaptive) depuis THEOLOGICUS.ico.

Usage : py tools/make_android_icons.py
"""
import os
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")

# dossier mipmap -> taille px de l'icone
DENSITIES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}


def main() -> int:
    ico = os.path.join(ROOT, "THEOLOGICUS.ico")
    if not os.path.isfile(ico):
        print("ERREUR : THEOLOGICUS.ico introuvable")
        return 1
    if not os.path.isdir(RES):
        print("ERREUR : android/app/src/main/res absent — lance d'abord : npx cap add android")
        return 1

    src = Image.open(ico).convert("RGBA")
    side = min(src.size)
    sq = src.crop((0, 0, side, side))  # l'ico source est carree

    for folder, size in DENSITIES.items():
        d = os.path.join(RES, folder)
        os.makedirs(d, exist_ok=True)
        # icone classique (lanceur)
        img = sq.resize((size, size), Image.LANCZOS)
        img.save(os.path.join(d, "ic_launcher.png"))
        # foreground adaptatif : icone a ~66% dans une zone transparente 2x plus grande
        fg = Image.new("RGBA", (size * 2, size * 2), (0, 0, 0, 0))
        inner = sq.resize((int(size * 1.32), int(size * 1.32)), Image.LANCZOS)
        off = (size * 2 - inner.size[0]) // 2
        fg.paste(inner, (off, off), inner)
        fg.save(os.path.join(d, "ic_launcher_foreground.png"))
        print("  %s : %dpx OK" % (folder, size))

    print("Icones Android generees depuis THEOLOGICUS.ico")
    return 0


if __name__ == "__main__":
    sys.exit(main())
