# -*- coding: utf-8 -*-
"""v204c — Enrichissement des recits Valtorta : date de vision + refs d'en-tete.

Les sommaires (v204b) donnent titres / numeros EMV / refs, mais pas les dates
de vision. On complete en lisant la page de chaque recit via le relais
r.jina.ai (le site bloque l'acces direct) : bloc « Evangile : » + « Le <jour>
<date> <annee> ». Sauvegarde incrementale toutes les 25 pages.
"""
import json, re, time, urllib.request

OUT = r"C:\tmp\theoverify\tradition\valtorta.json"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) THEOLOGICUS-indexer/1.0"}
PAUSE = 3.3          # relais : 20 req/min

import sys
sys.path.insert(0, r"C:\tmp")
from scan_valtorta2 import parse_ref, AELF_RE, clean_title  # noqa: E402

DATE_RE = re.compile(
    r"Le\s+((?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)[^\n<>]{3,70}?\d{4})", re.I)
# bloc d'en-tete : « Evangile: ... » jusqu'a la regle horizontale suivante
EV_RE = re.compile(r"gile\s*:(.{0,3000}?)(?:\n\s*\*\s*\*\s*\*|$)", re.S | re.I)


def fetch(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request("https://r.jina.ai/" + url, headers=UA)
            with urllib.request.urlopen(req, timeout=45) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as ex:
            if i == tries - 1:
                raise
            print("   retry : %s" % str(ex)[:70], flush=True)
            time.sleep(6 * (i + 1))


def parse_page(md):
    out = {"refs": [], "d": None}
    md_ = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", md)     # images
    m = EV_RE.search(md_)
    if m:
        seen = set()
        for mr in AELF_RE.finditer(m.group(1)):
            r = parse_ref(mr.group(1))
            if not r:
                continue
            k = (r["b"], r["c"], r["v1"], r["v2"])
            if k in seen:
                continue
            seen.add(k)
            out["refs"].append(r)
    md_ = re.sub(r"\s+", " ", md_)
    m = DATE_RE.search(md_)
    if m:
        d = re.sub(r"\s+", " ", m.group(1)).strip(" ._-–—")
        if 8 <= len(d) <= 80:
            out["d"] = d
    return out


def main():
    d = json.load(open(OUT, encoding="utf-8"))
    eps = d["episodes"]
    todo = [e for e in eps if not e.get("d") or not e["refs"]]
    print("a enrichir : %d recits" % len(todo), flush=True)
    done = 0
    t0 = time.time()
    for e in todo:
        try:
            md = fetch(e["u"])
            got = parse_page(md)
        except Exception as ex:
            print("  ! %s : %s" % (e["fid"], str(ex)[:70]), flush=True)
            continue
        if got["d"] and not e.get("d"):
            e["d"] = got["d"]
        if got["refs"]:
            seen = set((r["b"], r["c"], r["v1"], r["v2"]) for r in e["refs"])
            for r in got["refs"]:
                k = (r["b"], r["c"], r["v1"], r["v2"])
                if k not in seen:
                    seen.add(k)
                    e["refs"].append(r)
        done += 1
        print("  %3d/%d %s d=%s refs=%d" % (done, len(todo), e["fid"],
              (got["d"] or "-")[:22], len(got["refs"])), flush=True)
        if done % 25 == 0:
            with_refs = sum(1 for x in eps if x["refs"])
            print("  %d/%d — dates %d, avec refs %d (%.0fs)"
                  % (done, len(todo), sum(1 for x in eps if x.get("d")), with_refs,
                     time.time() - t0), flush=True)
            d["meta"]["avec_refs"] = with_refs
            d["meta"]["refs"] = sum(len(x["refs"]) for x in eps)
            json.dump(d, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        time.sleep(PAUSE)

    eps.sort(key=lambda e: (e["tome"], e["fid"]))
    d["episodes"] = eps
    d["meta"]["avec_refs"] = sum(1 for x in eps if x["refs"])
    d["meta"]["refs"] = sum(len(x["refs"]) for x in eps)
    d["meta"]["dates"] = sum(1 for x in eps if x.get("d"))
    d["meta"]["enrichi"] = time.strftime("%Y-%m-%d")
    json.dump(d, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("OK : %d recits, %d avec refs, %d refs, %d dates — %.0fs"
          % (len(eps), d["meta"]["avec_refs"], d["meta"]["refs"], d["meta"]["dates"],
             time.time() - t0))


if __name__ == "__main__":
    main()
