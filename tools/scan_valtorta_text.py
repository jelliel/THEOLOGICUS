# -*- coding: utf-8 -*-
"""v210 — Texte integral des 652 chapitres (mariavaltorta.online).

L'utilisateur a explicitement demande le texte hors-ligne (choix assume, l'app
est personnelle ; la source est citee dans l'app et chaque chapitre garde son
lien d'origine).

Structure : https://mariavaltorta.online/fr/biblio/01-levangile-tel-quil-ma-ete-revele/chapitre-NNN/
Le texte est dans div.entry-content (la navigation « Suivant / Précédent » est
retirée). Acces direct, pas de relais -> moissonnage parallele.
"""
import concurrent.futures as cf
import json, os, re, sys, time, urllib.request
from bs4 import BeautifulSoup

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "tradition", "valtorta_text.json")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) THEOLOGICUS-indexer/1.0"}
BASE = ("https://mariavaltorta.online/fr/biblio/"
        "01-levangile-tel-quil-ma-ete-revele/chapitre-%03d/")
NAV = re.compile(r"^(Suivant|Pr[eé]c[eé]dent|Suivant\s*:|Pr[eé]c[eé]dent\s*:)", re.I)


def get(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=45) as r:
                return r.read().decode("utf-8", "replace")
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(2 * (i + 1))


def chap(n):
    url = BASE % n
    try:
        h = get(url)
    except Exception:
        return None
    s = BeautifulSoup(h, "lxml")
    box = s.select_one(".entry-content") or s.select_one("article")
    if box is None:
        return None
    for t in box.select("script, style, .sharedaddy, .jp-relatedposts, nav, .addtoany_share_save_container"):
        t.decompose()
    lignes = []
    for ln in box.get_text("\n", strip=True).split("\n"):
        ln = ln.strip()
        if not ln or NAV.match(ln):
            continue
        lignes.append(ln)
    txt = "\n".join(lignes).strip()
    if len(txt) < 400:
        return None
    titre = ""
    if s.title:
        titre = re.sub(r"\s+", " ", s.title.get_text(strip=True))
        titre = re.sub(r"^(\d{1,3})\.\s*", "", titre)
        titre = re.sub(r"\s*[-–|]\s*Maria Valtorta.*$", "", titre, flags=re.I).strip()
    return {"n": n, "t": titre, "u": url, "x": txt}


def main():
    t0 = time.time()
    nums = list(range(1, 653))
    out = {}
    if os.path.isfile(OUT):
        try:
            out = {int(k): v for k, v in json.load(open(OUT, encoding="utf-8")).items()}
        except Exception:
            out = {}
    todo = [n for n in nums if n not in out]
    print("chapitres a moissonner : %d" % len(todo), flush=True)
    done = 0
    with cf.ThreadPoolExecutor(max_workers=6) as pool:
        for r in pool.map(chap, todo):
            done += 1
            if r:
                out[r["n"]] = r
            if done % 50 == 0:
                print("  %d/%d (%.0fs)" % (done, len(todo), time.time() - t0), flush=True)
                json.dump({str(k): out[k] for k in sorted(out)}, open(OUT, "w", encoding="utf-8"),
                          ensure_ascii=False, indent=0)
    json.dump({str(k): out[k] for k in sorted(out)}, open(OUT, "w", encoding="utf-8"),
              ensure_ascii=False, indent=0)
    tot = sum(len(v["x"]) for v in out.values())
    print("OK : %d chapitres, %.2f Mo de texte (%.0fs)" % (len(out), tot / 1048576, time.time() - t0))


if __name__ == "__main__":
    main()
