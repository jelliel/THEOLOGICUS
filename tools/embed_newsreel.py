# -*- coding: utf-8 -*-
"""
THEOLOGICUS — embarquer newsreel.html DANS THEOLOGICUS.html.

Pourquoi
-------
AI VIDEO (ai-video.html) ouvre un SECOND studio compagnon : NewsReel
(newsreel.html), le « JT généré par IA ». Comme ai-video.html, il est chargé
par un iframe ; l'application Windows packagée sert THEOLOGICUS.html depuis le
dossier de l'exe, où newsreel.html peut manquer (build incomplet) — l'iframe
serait alors VIDE. On rend donc le document AUTONOME : son contenu (base64,
UTF-8) est injecté dans THEOLOGICUS.html (balise <div id="newsreel-b64">). Le
JavaScript du modal décode ce bloc et l'injecte via `srcdoc` si la route
/newsreel.html échoue. Le fichier séparé reste la source « live » en dev ;
l'embarqué est le filet de sécurité universel (exe, dossiers d'installation).

Même mécanique que tools/embed_aivideo.py (voir ce fichier pour le détail du
piège d'écriture : on écrit `contenu` SORTI DE LA MÉMOIRE, jamais en relisant
SOURCE, sinon la cible racine tronquerait le compagnon à 0 octet).

Mode binaire (newline="") pour ne pas altérer les fins de ligne du HTML.

Usage
-----
    python tools/embed_newsreel.py            # injecte dans toutes les cibles
    python tools/embed_newsreel.py --check    # vérifie sans écrire
"""

import base64
import os
import re
import sys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = "newsreel.html"
DIV_ID = "newsreel-b64"

# Toutes les copies de THEOLOGICUS.html qui peuvent être servies par un exe.
CIBLES = [
    "THEOLOGICUS.html",
    "mobile/www/index.html",
    "dist/THEOLOGICUS/THEOLOGICUS.html",
    "_inst_v102/THEOLOGICUS.html",
    "_pub_v167/THEOLOGICUS.html",
    ".workbuddy-ai/artifacts/_v123/_pub/installe/THEOLOGICUS.html",
]

TAG_RE = re.compile((r'<div id="%s"[^>]*>.*?</div>' % DIV_ID).encode("ascii"), re.S)


def _balise(b64: str) -> bytes:
    return ('<div id="%s" hidden>' % DIV_ID).encode("ascii") + b64.encode("ascii") + b'</div>'


def injecte(p_chemin: str, b64: str, contenu: bytes, seul_verif: bool) -> bool:
    if not os.path.isfile(p_chemin):
        print("[--] %-60s absent, ignore" % p_chemin)
        return False
    data = open(p_chemin, "rb").read()
    deja = TAG_RE.search(data)
    if deja and b64 in data.decode("ascii", "replace"):
        print("[OK] %-60s deja embarque" % p_chemin)
        return False
    if seul_verif:
        print("[!!] %-60s NON embarque" % p_chemin)
        return True
    nu = TAG_RE.sub(b"", data)
    balise = _balise(b64)
    idx = nu.rfind(b"</body>")
    if idx != -1:
        nu = nu[:idx] + balise + b"\n" + nu[idx:]
    else:
        nu = nu + balise
    open(p_chemin, "wb").write(nu)
    # Copie aussi le compagnon a cote (route /newsreel.html en dev).
    dossier = os.path.dirname(p_chemin)
    with open(os.path.join(dossier, SOURCE), "wb") as f:
        f.write(contenu)
    print("[OK] %-60s embarque (+ compagnon copie)" % p_chemin)
    return True


def run() -> int:
    seul_verif = "--check" in sys.argv
    src_chemin = os.path.join(RACINE, SOURCE)
    if not os.path.isfile(src_chemin):
        print("[X] Source introuvable : %s" % SOURCE)
        return 1
    with open(src_chemin, "rb") as f:
        contenu = f.read()
    b64 = base64.b64encode(contenu).decode("ascii")
    print("[SOURCE] %s  %d octets  base64 %d caracteres"
          % (SOURCE, len(contenu), len(b64)))
    ecarts = 0
    for c in CIBLES:
        if injecte(os.path.join(RACINE, c), b64, contenu, seul_verif):
            ecarts += 1
    print("")
    if seul_verif:
        print("VERDICT : %d cible(s) non embarquee(s)." % ecarts)
        return 1 if ecarts else 0
    print("VERDICT : %d cible(s) embarquee(s)." % ecarts)
    return 0


if __name__ == "__main__":
    sys.exit(run())
