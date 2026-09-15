#!/usr/bin/env py -3
# -*- coding: utf-8 -*-
"""
THEOLOGICUS v33 — Découpage du corpus Tafsir en sourates chargées à la demande.

Transforme le monolithe `tafsir_data_monolith.js`
(window.TAFSIR_DATA = {"tafsirs":[{position, nom, nom_phonetique, versets:[{position, text}]}]})
en :
  tafsir/s<p>.js   — une tranche par sourate (1..114), auto-enregistrée dans
                     window.__tafsirSurahs au chargement (aucun conflit possible).
  tafsir/index.js  — stub ~1 Ko qui marque le corpus « prêt »
                     (window.__corpusReady.tafsir = true).
  tafsir/index.json— métadonnées (positions + noms), doc/comm.

Le runtime (THEOLOGICUS.html) charge l'index au premier besoin (v32), puis
chaque sourate à la volée via window.__ensureTafsirSurah(p) quand une
référence « Tafsir p:v » est survolée. Plus de parse de 40 Mo d'un coup.

Usage :
    py tools/split_tafsir.py [source] [dossier_sortie]
    (défauts : tafsir_data_monolith.js  ->  tafsir/)

Relancer ce script après chaque régénération du corpus tafsir
(fetch_tafsir.py / convert_tafsir.py).
"""
import json
import os
import re
import sys

VAR = "TAFSIR_DATA"
DEFAULT_SRC = "tafsir_data_monolith.js"
DEFAULT_OUT = "tafsir"
NB_SURAHS = 114

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

    tafsirs = data.get("tafsirs") if isinstance(data, dict) else data
    if not tafsirs:
        sys.exit("ERREUR : aucune entree 'tafsirs' trouvee")

    os.makedirs(out, exist_ok=True)

    index_entries = []
    total = 0
    for t in tafsirs:
        p = int(t["position"])
        entry = {
            "position": p,
            "nom": t.get("nom", ""),
            "nom_phonetique": t.get("nom_phonetique", t.get("nomPhon", "")),
            "versets": t.get("versets", []),
        }
        payload = json.dumps(entry, ensure_ascii=False, separators=(",", ":"))
        chunk = "(window.__tafsirSurahs=window.__tafsirSurahs||{})[%d]=%s;" % (p, payload)
        path = os.path.join(out, "s%d.js" % p)
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(chunk)
        total += os.path.getsize(path)
        index_entries.append({"p": p, "n": entry["nom"], "np": entry["nom_phonetique"]})

    index_entries.sort(key=lambda x: x["p"])

    meta = json.dumps({"v": 1, "surahs": index_entries}, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(out, "index.json"), "w", encoding="utf-8", newline="\n") as f:
        f.write(meta)

    index = (
        "/* THEOLOGICUS v33 - index du tafsir (noms des %d sourates).\n"
        "   Les textes sont dans tafsir/s<p>.js, charges a la volee\n"
        "   par window.__ensureTafsirSurah(p) quand une reference est survolee. */\n"
        "(function(){\n"
        "  if (window.__tafsirIndexLoaded) return;   /* garde anti double-execution */\n"
        "  window.__tafsirIndexLoaded = true;\n"
        "  window.__tafsirIndex = {\"v\":1,\"surahs\":%s};\n"
        "  window.__corpusReady = window.__corpusReady || {};\n"
        "  window.__corpusReady.tafsir = true;   /* signale : index disponible, sourates a la volee */\n"
        "  try { document.documentElement.setAttribute('data-tafsir-index', '1'); } catch(e) {}\n"
        "})();\n"
    ) % (len(index_entries), meta)
    with open(os.path.join(out, "index.js"), "w", encoding="utf-8", newline="\n") as f:
        f.write(index)

    print("OK : %d tranches + index.js dans %s/ (%.1f Mo au total)"
          % (len(index_entries), out, (total + len(index)) / 1e6))


if __name__ == "__main__":
    main()
