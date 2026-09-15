#!/usr/bin/env py -3
# -*- coding: utf-8 -*-
"""
THEOLOGICUS v33 — Découpage du corpus Bible en livres chargés à la demande.

Transforme le monolithe `bible_data.js` (window.BIBLE_DATA = {livre:{chapitre:{verset:texte}}})
en :
  bible/b<p>.js    — une tranche par livre (1..66), auto-enregistrée dans
                     window.__bibleBooks au chargement (aucun conflit possible).
  bible/index.js   — stub ~0,5 Ko qui marque le corpus « prêt »
                     (window.__corpusReady.bible = true).

Le runtime (THEOLOGICUS.html) charge l'index au premier besoin, puis chaque
livre à la volée via window.__ensureBibleBook(p) quand une référence est
survolée. Plus de parse de 4,3 Mo d'un coup.

Usage :
    py tools/split_bible.py [source] [dossier_sortie]
    (défauts : bible_data.js  ->  bible/)

Relancer ce script après chaque régénération du corpus biblique.
"""
import json
import os
import re
import sys

VAR = "BIBLE_DATA"
DEFAULT_SRC = "bible_data.js"
DEFAULT_OUT = "bible"
NB_BOOKS = 66

# executed at project root by build/QA; resolve paths relative to this file's
# parent's parent (project root) so the script works from any cwd
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def extract_json(text):
    """Extrait l'objet JSON après `window.<VAR> =` (robuste, tolère le trailing)."""
    m = re.search(r"window\." + VAR + r"\s*=\s*", text)
    if not m:
        sys.exit("ERREUR : '%s' introuvable dans %s" % (VAR, sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SRC))
    start = m.end()
    obj, _ = json.JSONDecoder().raw_decode(text[start:])
    return obj


def main():
    src = os.path.join(ROOT, sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SRC)
    out = os.path.join(ROOT, sys.argv[2] if len(sys.argv) > 2 else DEFAULT_OUT)

    with open(src, "r", encoding="utf-8") as f:
        data = extract_json(f.read())

    books = sorted(data.keys(), key=int)
    if len(books) != NB_BOOKS:
        print("AVERTISSEMENT : %d livres trouvés (attendu %d)" % (len(books), NB_BOOKS))

    os.makedirs(out, exist_ok=True)

    total = 0
    for p in books:
        payload = json.dumps(data[p], ensure_ascii=False, separators=(",", ":"))
        chunk = "(window.__bibleBooks=window.__bibleBooks||{})[%d]=%s;" % (int(p), payload)
        path = os.path.join(out, "b%s.js" % p)
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(chunk)
        total += os.path.getsize(path)

    index = (
        "/* THEOLOGICUS v33 - index du corpus Bible.\n"
        "   Les livres sont dans bible/b<p>.js, charges a la volee par\n"
        "   window.__ensureBibleBook(p) quand une reference biblique est survolee. */\n"
        "(function(){\n"
        "  if (window.__bibleIndexLoaded) return;   /* garde anti double-execution */\n"
        "  window.__bibleIndexLoaded = true;\n"
        "  window.__bibleBooks = window.__bibleBooks || {};\n"
        "  window.__corpusReady = window.__corpusReady || {};\n"
        "  window.__corpusReady.bible = true;   /* signale : corpus pret, livres a la volee */\n"
        "  try { document.documentElement.setAttribute('data-bible-index', '1'); } catch(e) {}\n"
        "})();\n"
    )
    with open(os.path.join(out, "index.js"), "w", encoding="utf-8", newline="\n") as f:
        f.write(index)

    print("OK : %d tranches + index.js dans %s/ (%.1f Mo au total)"
          % (len(books), out, (total + len(index)) / 1e6))


if __name__ == "__main__":
    main()
