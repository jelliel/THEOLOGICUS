# -*- coding: utf-8 -*-
"""v207 — Reparation des numeros EMV et des titres manquants.

Constat (02/10) : 36 recits n'avaient pas d'EMV. Pour 17 d'entre eux le
sommaire du site donnait le numero a la place du titre (« 167 », « 168 » ...)
-> l'EMV etait perdu ET le titre aussi. Ces numeros apparaissaient a tort
comme « chapitres manquants » (167-176, 179-185, 207).

On repare depuis le numero, puis on relit la page du recit pour recuperer le
vrai titre (ancre sur la ligne portant exactement le numero EMV, cf.
fill_gaps_valtorta.extract_title).
"""
import json, os, re, sys, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from fill_gaps_valtorta import extract_title, EMV_RE  # noqa: E402

VLT = os.path.join(ROOT, "tradition", "valtorta.json")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) THEOLOGICUS-indexer/1.0"}
BASE = "https://www.maria-valtorta.org/Publication/"
PAUSE = 3.3
NUM_RE = re.compile(r"^\s*(\d{1,3})\s*(.*)$")


def fetch(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request("https://r.jina.ai/" + url, headers=UA)
            with urllib.request.urlopen(req, timeout=50) as r:
                return r.read().decode("utf-8", "replace")
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(6 * (i + 1))


def main():
    d = json.load(open(VLT, encoding="utf-8"))
    eps = d["episodes"]
    a_reparer = []
    for e in eps:
        if e.get("emv"):
            continue
        t = (e.get("title") or "").strip()
        m = NUM_RE.match(t)
        if not m:
            continue
        n = int(m.group(1))
        if not (0 < n <= 700):
            continue
        e["emv"] = n
        reste = m.group(2).strip(" .-–—:")
        if len(reste) >= 8:
            e["title"] = reste            # le titre suivait le numero
        else:
            a_reparer.append(e)           # titre a relire sur la page
    print("emv repares depuis le titre : %d | titres a relire : %d"
          % (sum(1 for e in eps if e.get("emv")), len(a_reparer)), flush=True)

    for i, e in enumerate(a_reparer, 1):
        try:
            md = fetch(e["u"])
        except Exception as ex:
            print("  %d %s ERREUR %s" % (i, e["fid"], str(ex)[:50]), flush=True)
            time.sleep(PAUSE)
            continue
        t = extract_title(md, e.get("emv"))
        if t:
            t = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", t)
            t = re.sub(r"\s+", " ", t).strip(" .-–—|")
            if len(t) >= 6:
                e["title"] = t
        print("  %d %s emv %s -> %s" % (i, e["fid"], e.get("emv"),
                                        (e.get("title") or "")[:58]), flush=True)
        time.sleep(PAUSE)

    d["meta"]["emv_repares"] = True
    json.dump(d, open(VLT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    emvs = set(x["emv"] for x in eps if x.get("emv"))
    manq = [n for n in range(1, 653) if n not in emvs]
    print("OK — emv manquants restants : %d %s" % (len(manq), manq))


if __name__ == "__main__":
    main()
