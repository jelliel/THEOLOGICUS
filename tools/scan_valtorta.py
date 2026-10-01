# -*- coding: utf-8 -*-
"""v204b — Index Valtorta COMPLET depuis les 10 sommaires de tomes.

Découverte (2026-10-01) : sur maria-valtorta.org, l'index d'un tome couvre une
PERIODE, pas un volume — TOME 01/index.htm liste 01-000..01-051 *et*
02-001..02-042. Filtrer par prefixe de tome (v204) perdait donc le debut de
chaque tome (~40 recits), dont les noces de Cana.

Mieux : chaque entree du sommaire porte le titre, le numero EMV ET les
references evangeliques (liens AELF). Dix requetes suffisent pour l'index
complet — inutile de telecharger les ~750 pages de recits.

Acces reseau : le site est injoignable en direct depuis cette machine (le
crawler v204 s'est fait bloquer) ; on passe par le relais r.jina.ai (20 req/min).
Les TEXTES restent sur le site (oeuvre sous droits CEV) : on ne garde que
titre / numero EMV / date de vision / references.
"""
import json, re, time, urllib.request, os

OUT = r"C:\tmp\theoverify\tradition\valtorta.json"
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) THEOLOGICUS-indexer/1.0"}
BASE = "https://www.maria-valtorta.org/Publication/"

BOOKS = {
    "matthieu": "mt", "mt": "mt", "matt": "mt", "marc": "mc", "mc": "mc",
    "luc": "lc", "lc": "lc", "jean": "jn", "jn": "jn", "actes": "ac", "ac": "ac",
    "romains": "rm", "rm": "rm", "1corinthiens": "1co", "2corinthiens": "2co",
    "1co": "1co", "2co": "2co", "galates": "ga", "ga": "ga", "ephesiens": "ep",
    "ep": "ep", "philippiens": "ph", "ph": "ph", "colossiens": "col", "col": "col",
    "1thessaloniciens": "1th", "2thessaloniciens": "2th", "1th": "1th", "2th": "2th",
    "1timothee": "1ti", "2timothee": "2ti", "1tim": "1ti", "2tim": "2ti",
    "tite": "ti", "philemon": "phm", "hebreux": "hb", "hb": "hb", "jacques": "jc",
    "jc": "jc", "1pierre": "1p", "2pierre": "2p", "1p": "1p", "2p": "2p",
    "1jean": "1jn", "2jean": "2jn", "3jean": "3jn", "1jn": "1jn", "2jn": "2jn",
    "3jn": "3jn", "jude": "jd", "apocalypse": "ap", "ap": "ap",
    "genese": "gn", "exode": "ex", "levitique": "lv", "nombres": "nb",
    "deuteronome": "dt", "josue": "js", "juges": "jg", "ruth": "rt",
    "1samuel": "1s", "2samuel": "2s", "1rois": "1r", "2rois": "2r",
    "1chroniques": "1ch", "2chroniques": "2ch", "esdras": "esd", "nehemie": "ne",
    "tobie": "tb", "judith": "jdt", "esther": "est", "job": "jb", "psaume": "ps",
    "psaumes": "ps", "proverbes": "pr", "ecclesiaste": "qo", "cantique": "ct",
    "sagesse": "sg", "siracide": "si", "isaie": "is", "is": "is", "jeremie": "jr",
    "lamentations": "lm", "baruch": "ba", "ezechiel": "ez", "ezekiel": "ez",
    "daniel": "dn", "osee": "os", "joel": "jl", "amos": "am", "abdias": "ab",
    "jonas": "jon", "michee": "mi", "nahum": "na", "habacuc": "hab",
    "sophonie": "so", "aggee": "ag", "zacharie": "za", "malachie": "ml",
}
REF_RE = re.compile(
    r"([1-3]?\s*[A-Za-zÀ-ÿ]+(?:\s*[A-Za-zÀ-ÿ]+)*)\s*(\d{1,3})\s*,\s*(\d{1,3})"
    r"(?:\s*[-–]\s*(?:(\d{1,3})\s*,\s*)?(\d{1,3}))?")
# ancre d'episode : /FID.htm "EMV N")  (suffixe ** optionnel selon la forme)
ANCHOR_RE = re.compile(r"/(\d\d-\d\d\d)\.htm\s*\"([^\"]{0,60})\"\)\s*\*{0,4}", re.S)
# suite : [liens intercalaires] NUM. TITRE](URL/FID.htm "tooltip")
TAIL_RE = re.compile(
    r"(?:\[[^\]]{0,80}\]\([^)]*\)\s*)*[\[*\s]*(\d{1,3})\s*\*{0,6}\s*\.\s*\*{0,6}\s*"
    r"(.{0,400}?)\]\((https?://[^)\s]*?/(\d\d-\d\d\d)\.htm[^)]*)\)", re.S)
AELF_RE = re.compile(r"\[([^\]]{2,60})\]\((https?://[^)]*aelf[^)]*)\)", re.I)


def norm(s):
    import unicodedata
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]", "", s.lower())


def parse_ref(raw):
    m = REF_RE.search(raw)
    if not m:
        return None
    book = norm(m.group(1))
    b = BOOKS.get(book)
    if not b:
        for k, v in BOOKS.items():
            if book.startswith(k):
                b = v
                break
    if not b:
        return None
    c = int(m.group(2))
    v1 = int(m.group(3))
    v2 = int(m.group(5)) if m.group(5) else (int(m.group(4)) if m.group(4) else v1)
    return {"raw": re.sub(r"\s+", " ", raw.strip()), "b": b, "c": c, "v1": v1, "v2": v2}


def clean_title(s):
    s = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", s)      # images markdown
    s = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", s)   # liens -> texte
    s = s.replace("**", " ").replace("*", " ")
    s = re.sub(r"[\[\]]", "", s)                     # liens imbriques casses :
    s = re.sub(r"\s+", " ", s).strip(" .-–—")        # on recolle le mot coupe
    s = re.sub(r"[.\s]\s*\d{1,4}$", "", s).strip(" .-–—")  # numero de page
    return s


def fetch(url, tries=4):
    """Relais r.jina.ai (le site bloque l'acces direct)."""
    for i in range(tries):
        try:
            req = urllib.request.Request("https://r.jina.ai/" + url, headers=UA)
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as ex:
            if i == tries - 1:
                raise
            print("   retry %s : %s" % (url[-24:], str(ex)[:80]), flush=True)
            time.sleep(6 * (i + 1))


def parse_index(md, tome_page):
    """Sommaire d'un tome -> {fid: episode} avec refs (cf. note d'en-tete)."""
    heads, last_end = [], 0
    for m in ANCHOR_RE.finditer(md):
        if m.start() < last_end:
            continue                      # deja consomme par l'entete precedente
        emv = None
        me = re.search(r"EMV\s+(\d{1,3})", m.group(2))
        if me:
            emv = int(me.group(1))
        mt = TAIL_RE.match(md, m.end())
        if not mt:
            continue
        title = clean_title(mt.group(2)).lstrip("[* ").strip()
        title = re.sub(r"\s+", " ", title).strip(" .-–—")
        if not title or len(title) < 4:
            continue
        heads.append({"fid": m.group(1), "emv": emv or int(mt.group(1)),
                      "title": title, "pos": m.start(), "end": mt.end()})
        last_end = mt.end()

    eps = {}
    for k, h in enumerate(heads):
        stop = heads[k + 1]["pos"] if k + 1 < len(heads) else len(md)
        block = md[h["end"]:stop]
        refs, seen = [], set()
        for mr in AELF_RE.finditer(block):
            r = parse_ref(mr.group(1))
            if not r:
                continue
            key = (r["b"], r["c"], r["v1"], r["v2"])
            if key in seen:
                continue
            seen.add(key)
            refs.append(r)
        fid = h["fid"]
        prev = eps.get(fid)
        if prev and len(prev["refs"]) >= len(refs):
            continue
        eps[fid] = {
            "fid": fid, "tome": int(fid[:2]), "title": h["title"], "emv": h["emv"],
            "u": BASE + "TOME%%20%s/%s.htm" % (fid[:2], fid),
            "refs": refs, "src_tome": tome_page,
        }
    return eps


def main():
    t0 = time.time()
    old = {}
    if os.path.isfile(OUT):
        d = json.load(open(OUT, encoding="utf-8"))
        old = {e["fid"]: e for e in d.get("episodes", [])}
        print("index existant : %d episodes" % len(old), flush=True)

    all_eps, per_page = {}, {}
    for t in range(1, 11):
        url = BASE + "TOME%%20%02d/index.htm" % t
        print("sommaire TOME %02d ..." % t, flush=True)
        md = fetch(url)
        eps = parse_index(md, "%02d" % t)
        per_page["%02d" % t] = len(eps)
        for fid, e in eps.items():
            if fid not in all_eps or len(e["refs"]) > len(all_eps[fid]["refs"]):
                all_eps[fid] = e
        print("   %d entrees (cumul %d)" % (len(eps), len(all_eps)), flush=True)
        time.sleep(3.3)          # relais : 20 req/min

    # fusion : union des refs + on recupere dates et ancres deja collectees
    added = 0
    for fid, e in all_eps.items():
        o = old.get(fid)
        if o:
            seen = set((r["b"], r["c"], r["v1"], r["v2"]) for r in e["refs"])
            for r in o.get("refs", []):
                k = (r["b"], r["c"], r["v1"], r["v2"])
                if k not in seen:
                    seen.add(k)
                    e["refs"].append(r)
            if o.get("d"):
                e["d"] = o["d"]
            if o.get("anchors"):
                e["anchors"] = o["anchors"]
            if not e.get("emv") and o.get("emv"):
                e["emv"] = o["emv"]
        else:
            added += 1
    # on conserve aussi les episodes connus absents des sommaires (robustesse)
    kept = 0
    for fid, o in old.items():
        if fid not in all_eps:
            all_eps[fid] = o
            kept += 1

    eps_list = sorted(all_eps.values(), key=lambda e: (e["tome"], e["fid"]))
    with_refs = sum(1 for e in eps_list if e["refs"])
    nrefs = sum(len(e["refs"]) for e in eps_list)
    data = {
        "meta": {
            "source": "maria-valtorta.org (edition CEV francaise)",
            "oeuvre": "L'Evangile tel qu'il m'a ete revele — Maria Valtorta",
            "note": "INDEX de concordance : references evangeliques + titres + dates. Textes sous droits CEV -> non telecharges ; chaque episode renvoie vers sa page officielle.",
            "episodes": len(eps_list), "avec_refs": with_refs, "refs": nrefs,
            "par_sommaire": per_page, "nouveaux": added, "conserves": kept,
            "erreurs": 0, "genere": time.strftime("%Y-%m-%d"),
        },
        "episodes": eps_list, "erreurs": [],
    }
    json.dump(data, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("OK %s : %d episodes (%d nouveaux), %d avec refs, %d refs — %.0fs"
          % (OUT, len(eps_list), added, with_refs, nrefs, time.time() - t0))


if __name__ == "__main__":
    main()
