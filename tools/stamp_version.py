# -*- coding: utf-8 -*-
"""Tamponne la version dans le build desktop : HTML + version.txt.

Source de verite : fichier VERSION a la racine du depot.
Utilise par build_installer.bat et par le job Windows de la CI.

Usage : py tools/stamp_version.py [chemin/vers/dist/THEOLOGICUS]
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main(argv):
    out_dir = argv[1] if len(argv) > 1 else os.path.join(ROOT, "dist", "THEOLOGICUS")
    with open(os.path.join(ROOT, "VERSION"), encoding="utf-8") as f:
        version = f.read().strip()
    html_path = os.path.join(out_dir, "THEOLOGICUS.html")
    with open(html_path, encoding="utf-8", newline="") as f:
        html = f.read()
    if "__THEO_VERSION__" in html:
        html = html.replace("__THEO_VERSION__", version, 1)
        with open(html_path, "w", encoding="utf-8", newline="") as f:
            f.write(html)
    with open(os.path.join(out_dir, "version.txt"), "w", encoding="utf-8") as f:
        f.write(version + "\n")
    print("version tamponnee :", version)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
