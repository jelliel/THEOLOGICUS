# -*- coding: utf-8 -*-
"""Assemble mobile/www : copie de l'app web + patchs specifiques Android.

Usage : py tools/prepare_mobile.py

Sources (racine du depot) : THEOLOGICUS.html, bible/, quran/, tafsir/, libs/
Sortie                   : mobile/www/   (regeneree de zero a chaque appel)

Patchs appliques a la COPIE (jamais au fichier source) :
  1. Viewport Android : on retire user-scalable=no / maximum-scale=1.0
     (accessibilite mobile ; le zoom reste de toute facon desactive par
     l'echelle CSS de l'app).
  2. Verification que le shim mobile v34 est bien present dans le HTML
     source (il est inerte sur desktop, actif dans la coque Capacitor).

Le fichier theologicus_keys.json n'est JAMAIS copie : les cles API ne
doivent pas voyager dans un APK. Sur mobile elles sont saisies dans
l'app (localStorage).
"""
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "mobile", "www")

COPY_DIRS = ["bible", "quran", "tafsir", "libs", "summa", "fathers", "reformed",
             "orthodox", "islamic"]
EXPECTED = {
    "bible": ("b", ".js", 66),
    "quran": ("q", ".js", 114),
    "tafsir": ("s", ".js", 114),
}


def main() -> int:
    html_src = os.path.join(ROOT, "THEOLOGICUS.html")
    if not os.path.isfile(html_src):
        print("ERREUR : THEOLOGICUS.html introuvable a la racine")
        return 1

    src = open(html_src, encoding="utf-8", newline="").read()
    if "shim mobile (Capacitor" not in src:
        print("ERREUR : shim mobile v34 absent du HTML source — lance d'abord _patch_v34.py")
        return 1

    # 1) Repertoire de sortie propre
    if os.path.isdir(OUT):
        shutil.rmtree(OUT)
    os.makedirs(OUT)

    # 2) HTML + patch viewport
    old_vp = '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">'
    new_vp = '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">'
    if old_vp not in src:
        print("AVERTISSEMENT : viewport standard non trouve — copie sans patch viewport")
    html_out = src.replace(old_vp, new_vp, 1)
    # Tampon de version : APK_VERSION_NAME (CI) sinon fichier VERSION a la racine.
    version = os.environ.get("APK_VERSION_NAME", "").strip()
    if not version:
        try:
            with open(os.path.join(ROOT, "VERSION"), encoding="utf-8") as vf:
                version = vf.read().strip()
        except OSError:
            version = ""
    if version:
        html_out = html_out.replace("__THEO_VERSION__", version, 1)
        with open(os.path.join(OUT, "version.txt"), "w", encoding="utf-8") as vf:
            vf.write(version + "\n")
        print("  version : " + version)
    with open(os.path.join(OUT, "index.html"), "w", encoding="utf-8", newline="") as f:
        f.write(html_out)

    # 3) Dossiers de donnees / bibliotheques
    for d in COPY_DIRS:
        s = os.path.join(ROOT, d)
        if not os.path.isdir(s):
            print("ERREUR : dossier source manquant : " + d)
            return 1
        shutil.copytree(s, os.path.join(OUT, d))

    # 4) Controles de coherence
    ok = True
    for d, (prefix, ext, n) in EXPECTED.items():
        got = len([f for f in os.listdir(os.path.join(OUT, d)) if f.startswith(prefix) and f.endswith(ext) and f != "index.js"])
        if got != n:
            print("AVERTISSEMENT : %s : %d tranches (attendu %d) — relance tools/split_*.py ?" % (d, got, n))
            ok = ok and got > 0
        else:
            print("  %s : %d tranches OK" % (d, got))
    libs_js = len([f for f in os.listdir(os.path.join(OUT, "libs")) if f.endswith(".js")])
    print("  libs : %d fichiers js OK" % libs_js)

    total = sum(len(files) for _, _, files in os.walk(OUT))
    size = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(OUT) for f in fs)
    print("mobile/www pret : %d fichiers, %.1f Mo%s" % (total, size / 1e6, "" if ok else " (avec avertissements)"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
