# -*- coding: utf-8 -*-
"""v205b — Moisson du WIKI Maria Valtorta (fr.mariavaltorta.wiki).

Decouverte du 02/10 : le wiki de l'encyclopedie valtortienne a DEMENAGE. Les
liens /wiki/... de l'ancien site (maria-valtorta.org) renvoient 404 ; les pages
d'index redirigent (301) vers https://fr.mariavaltorta.wiki/wiki/Catégorie:XXX.
Le nouveau wiki est accessible EN DIRECT (pas besoin du relais r.jina.ai) mais
n'expose pas d'API (api.php -> 404, w/api.php -> 500) : on moissonne les pages
des categories, en parallele.

Le site autorise l'usage individuel de ces contenus -> texte conserve.
"""
import concurrent.futures as cf
import json, os, re, sys, time, urllib.request
from bs4 import BeautifulSoup

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "tradition", "valtorta_sec.json")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) THEOLOGICUS-indexer/1.0"}
BASE = "https://fr.mariavaltorta.wiki"
CATS = [("personnages", "Personnages", "Cat%C3%A9gorie:Personnages"),
        ("lieux", "Lieux", "Cat%C3%A9gorie:Lieux"),
        ("themes", "Thèmes d'enseignement", "Cat%C3%A9gorie:Th%C3%A8mes")]
SKIP = ("/wiki/Sp%C3%A9cial", "/wiki/Aide", "/wiki/Cat%C3%A9gorie", "/wiki/Fichier",
        "/wiki/Discussion", "/wiki/Mod%C3%A8le", "/wiki/Main_Page")


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


def membres(cat):
    h = get(BASE + "/wiki/" + cat)
    links = re.findall(r'href="(/wiki/[^"#]+)"', h)
    out = []
    for l in dict.fromkeys(links):
        if l.startswith(SKIP) or ":" in l.split("/wiki/", 1)[1][:14]:
            continue
        out.append(BASE + l)
    return out


def page(url):
    h = get(url)
    soup = BeautifulSoup(h, "lxml")
    h1 = soup.find("h1", id="firstHeading")
    titre = h1.get_text(" ", strip=True) if h1 else url.rsplit("/", 1)[-1].replace("_", " ")
    body = soup.find("div", class_="mw-parser-output")
    if body is None:
        return None
    for tag in body.select("script, style, .navbox, .metadata, .mw-editsection, "
                           "sup.reference, .reference, table.navbox, .catlinks"):
        tag.decompose()
    for br in body.find_all(["br"]):
        br.replace_with("\n")
    txt = body.get_text("\n", strip=True)
    txt = re.sub(r"[ \t]+", " ", txt)
    txt = re.sub(r"\n{3,}", "\n\n", txt)
    txt = txt.strip()
    if len(txt) < 60:
        return None
    return {"t": titre, "u": url, "x": txt[:60000]}


def main():
    only = sys.argv[1:] or [c[0] for c in CATS]
    data = json.load(open(OUT, encoding="utf-8"))
    t0 = time.time()
    for sid, nom, cat in CATS:
        if sid not in only:
            continue
        ms = membres(cat)
        print("=== %s : %d pages dans la catégorie" % (sid, len(ms)), flush=True)
        pages, done = [], 0
        with cf.ThreadPoolExecutor(max_workers=6) as pool:
            for r in pool.map(page, ms):
                done += 1
                if r:
                    pages.append(r)
                if done % 50 == 0:
                    print("   %d/%d (%.0fs)" % (done, len(ms), time.time() - t0), flush=True)
        sec = {"id": sid, "nom": nom, "kind": "texte",
               "note": "Encyclopédie valtortienne (fr.mariavaltorta.wiki) — "
                       "usage individuel autorisé par le site.",
               "pages": pages}
        data["sections"] = [s for s in data["sections"] if s["id"] != sid] + [sec]
        ordre = ["calendrier", "personnages", "lieux", "themes", "memo", "prieres",
                 "cartes", "cahiers", "azarias", "romains"]
        data["sections"].sort(key=lambda s: ordre.index(s["id"]) if s["id"] in ordre else 99)
        json.dump(data, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        print("   -> %d pages retenues (%.0fs)" % (len(pages), time.time() - t0), flush=True)
    print("OK — %.0fs" % (time.time() - t0))


if __name__ == "__main__":
    main()
