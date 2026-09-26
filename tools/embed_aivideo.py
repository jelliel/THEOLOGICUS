# -*- coding: utf-8 -*-
"""
THEOLOGICUS — embarquer ai-video.html DANS THEOLOGICUS.html.

Pourquoi
-------
Le modal AI VIDEO charge un document séparé (ai-video.html) via un iframe.
En développement (proxy_server.py depuis C:\\Theologicus) le fichier est servi.
Mais l'application Windows packagée sert THEOLOGICUS.html depuis le DOSSIER de
l'exe : si ai-video.html n'y est pas (oubli de propagation, build incomplet),
l'iframe reçoit un 404 et reste VIDE — invisible en développement, réel chez
l'utilisateur. Le correctif v126d (titre + repli) masquait la panne mais ne la
réglait pas.

On rend le document AUTONOME : son contenu (base64, UTF-8) est injecté dans
THEOLOGICUS.html (balise <div id="aivideo-b64">). Le JavaScript du modal, en
cas d'échec de la route /ai-video.html, décode ce bloc et injecte le document
via `srcdoc`. Le studio s'affiche alors MÊME si le fichier séparé est absent.
Le fichier séparé reste la source « live » en développement ; l'embarqué est le
filet de sécurité universel (exe, dossiers d'installation, mobile…).

Mode binaire (newline="") pour ne pas altérer les fins de ligne du HTML.

Usage
-----
    python tools/embed_aivideo.py            # injecte dans toutes les cibles
    python tools/embed_aivideo.py --check    # vérifie sans écrire
"""

import base64
import os
import re
import sys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOURCE = "ai-video.html"

# Toutes les copies de THEOLOGICUS.html qui peuvent être servies par un exe :
# le source, les cibles de sync_html, plus les dossiers d'installation réels
# que sync_html.py ne couvre pas (build versionné sous .workbuddy-ai/artifacts).
CIBLES = [
    "THEOLOGICUS.html",
    "mobile/www/index.html",
    "dist/THEOLOGICUS/THEOLOGICUS.html",
    "_inst_v102/THEOLOGICUS.html",
    "_pub_v167/THEOLOGICUS.html",
    ".workbuddy-ai/artifacts/_v123/_pub/installe/THEOLOGICUS.html",
]

TAG_RE = re.compile(rb'<div id="aivideo-b64"[^>]*>.*?</div>', re.S)


def _balise(b64: str) -> bytes:
    return ('<div id="aivideo-b64" hidden>' + b64 + '</div>').encode("ascii")


def injecte(p_chemin: str, b64: str, contenu: bytes, seul_verif: bool) -> bool:
    if not os.path.isfile(p_chemin):
        print("[--] %-60s absent, ignore" % p_chemin)
        return False
    data = open(p_chemin, "rb").read()
    # Déjà embarqué et à jour ?
    deja = TAG_RE.search(data)
    if deja and b64 in data.decode("ascii", "replace"):
        print("[OK] %-60s déjà embarqué" % p_chemin)
        return False
    if seul_verif:
        print("[!!] %-60s NON embarqué" % p_chemin)
        return True
    nu = TAG_RE.sub(b"", data)
    balise = _balise(b64)
    idx = nu.rfind(b"</body>")
    if idx != -1:
        nu = nu[:idx] + balise + b"\n" + nu[idx:]
    else:
        nu = nu + balise
    open(p_chemin, "wb").write(nu)
    # Copie aussi le compagnon à côté (route /ai-video.html en dev). On écrit
    # `contenu` SORTI DE LA MÉMOIRE : jamais on ne relit SOURCE pour écrire
    # dessus — sinon, pour la cible racine (dossier == ""), on tronquerait
    # ai-video.html à 0 octet AVANT de le relire (open(dst,"wb") est évalué
    # avant l'argument, qui lit alors un fichier déjà vide).
    dossier = os.path.dirname(p_chemin)
    with open(os.path.join(dossier, "ai-video.html"), "wb") as f:
        f.write(contenu)
    print("[OK] %-60s embarqué (+ compagnon copié)" % p_chemin)
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
    print("[SOURCE] %s  %d octets  base64 %d caractères"
          % (SOURCE, len(contenu), len(b64)))
    ecarts = 0
    for c in CIBLES:
        if injecte(os.path.join(RACINE, c), b64, contenu, seul_verif):
            ecarts += 1
    print("")
    if seul_verif:
        print("VERDICT : %d cible(s) non embarquée(s)." % ecarts)
        return 1 if ecarts else 0
    print("VERDICT : %d cible(s) embarquée(s)." % ecarts)
    return 0


if __name__ == "__main__":
    sys.exit(run())
