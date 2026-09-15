#!/usr/bin/env py -3
# -*- coding: utf-8 -*-
"""
THEOLOGICUS v33 — Découpage du corpus Coran en sourates chargées à la demande.

Transforme le monolithe `quran_data.js` (window.QURAN_DATA = {sourate:{nomPhon, versets:{v:{text, arabe}}}})
en :
  quran/q<p>.js    — une tranche par sourate (1..114), auto-enregistrée dans
                     window.__quranSurahs au chargement (aucun conflit possible).
  quran/index.js   — stub ~0,5 Ko qui marque le corpus « prêt »
                     (window.__corpusReady.quran = true).

Le runtime (THEOLOGICUS.html) charge l'index au premier besoin, puis chaque
sourate à la volée via window.__ensureQuranSurah(p) quand une référence
« Coran p:v » est survolée. Plus de parse de 5,1 Mo d'un coup.

Usage :
    py tools/split_quran.py [source] [dossier_sortie]
    (défauts : quran_data.js  ->  quran/)

Relancer ce script après chaque régénération du corpus coranique.
"""
import json
import os
import re
import sys

VAR = "QURAN_DATA"
DEFAULT_SRC = "quran_data.js"
DEFAULT_OUT = "quran"
NB_SURAHS = 114

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def extract_json(text):
    r"""Extrait l'objet après `window.<VAR> =`.

    quran_data.js est un LITTÉRAL JAVASCRIPT, pas du JSON : clés non quotées
    (1:, nomPhon:, versets:) et virgules finales. Ce fichier n'utilise que des
    chaînes double-quotées sans \' ni \" échappés (vérifié : seuls des \uXXXX),
    donc chaque guillemet bascule exactement intérieur/extérieur de chaîne.
    On traite ainsi les segments HORS chaînes (quoter les clés, virgules
    finales) et on recolle les chaînes telles quelles.
    """
    m = re.search(r"window\." + VAR + r"\s*=\s*", text)
    if not m:
        sys.exit("ERREUR : '%s' introuvable dans %s" % (VAR, sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SRC))
    body = text[m.end():].lstrip()

    segments = body.split('"')          # pair = hors chaîne, impair = chaîne
    KEY_RE = re.compile(r'(?<![\w$])([A-Za-z_$][\w$]*|\d+)\s*:')
    TRAILING_RE = re.compile(r',\s*([}\]])')
    for i in range(0, len(segments), 2):
        seg = segments[i]
        seg = KEY_RE.sub(r'"\1":', seg)
        seg = TRAILING_RE.sub(r'\1', seg)
        segments[i] = seg
    fixed = '"'.join(segments)

    start = fixed.find('{')
    end = fixed.rfind('}')
    if start < 0 or end <= start:
        sys.exit("ERREUR : objet principal introuvable")
    obj = json.loads(fixed[start:end + 1])
    return obj


def main():
    src = os.path.join(ROOT, sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SRC)
    out = os.path.join(ROOT, sys.argv[2] if len(sys.argv) > 2 else DEFAULT_OUT)

    with open(src, "r", encoding="utf-8") as f:
        data = extract_json(f.read())

    surahs = sorted(data.keys(), key=int)
    if len(surahs) != NB_SURAHS:
        print("AVERTISSEMENT : %d sourates trouvées (attendu %d)" % (len(surahs), NB_SURAHS))

    os.makedirs(out, exist_ok=True)

    total = 0
    for p in surahs:
        payload = json.dumps(data[p], ensure_ascii=False, separators=(",", ":"))
        chunk = "(window.__quranSurahs=window.__quranSurahs||{})[%d]=%s;" % (int(p), payload)
        path = os.path.join(out, "q%s.js" % p)
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(chunk)
        total += os.path.getsize(path)

    index = (
        "/* THEOLOGICUS v33 - index du corpus Coran.\n"
        "   Les sourates sont dans quran/q<p>.js, chargees a la volee par\n"
        "   window.__ensureQuranSurah(p) quand une reference coranique est survolee. */\n"
        "(function(){\n"
        "  if (window.__quranIndexLoaded) return;   /* garde anti double-execution */\n"
        "  window.__quranIndexLoaded = true;\n"
        "  window.__quranSurahs = window.__quranSurahs || {};\n"
        "  window.__corpusReady = window.__corpusReady || {};\n"
        "  window.__corpusReady.quran = true;   /* signale : corpus pret, sourates a la volee */\n"
        "  try { document.documentElement.setAttribute('data-quran-index', '1'); } catch(e) {}\n"
        "})();\n"
    )
    with open(os.path.join(out, "index.js"), "w", encoding="utf-8", newline="\n") as f:
        f.write(index)

    print("OK : %d tranches + index.js dans %s/ (%.1f Mo au total)"
          % (len(surahs), out, (total + len(index)) / 1e6))


if __name__ == "__main__":
    main()
