#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Moissonnage du site Corpus Coranicum (https://corpuscoranicum.de) pour THEOLOGICUS.

Récolte, pour chaque sourate / verset, l'ensemble des données ouvertes de l'API :
  - commentaire (niveau sourate)        -> /api/data/commentary/sura/{s}
  - lectures variantes (par verset)     -> /api/data/variants/sura/{s}/verse/{v}
  - manuscrits / codex (par verset)     -> /api/data/manuscripts/sura/{s}/verse/{v}
  - rapports intertextuels (par verset) -> /api/data/intertexts/sura/{s}/verse/{v}
  - concordance / morphologie (par mot) -> /api/data/language/{lang}/concordance/sura/{s}/verse/{v}/word/{w}
  - occurrences de la concordance       -> /api/data/concordance/references/word_cc/{word_cc}  (dédupliqué globalement)

Sortie (compacte, sans les champs lourds / HTML Word):
  tradition/cc/s{NNN}.json            -> {sura, comm, verses:{v:{var,mss,itt,conc}}}
  tradition/cc/concordance_occ.json  -> {word_cc: {count, refs:[...]} }  (occurrences dans le Coran)

Reprise automatique : un fichier de sourate déjà écrit est sauté, sauf --force.
Usage :
  python tools/scan_corpuscoranicum.py --suras 1,2,18,36,50,55,112,114
  python tools/scan_corpuscoranicum.py --suras all
  python tools/scan_corpuscoranicum.py --suras all --force
"""
import argparse, json, os, re, sys, time, threading, urllib.request, urllib.error, urllib.parse, html

BASE = "https://api.corpuscoranicum.de"
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUTDIR = os.path.join(ROOT, "tradition", "cc")
CONC_OCC = os.path.join(OUTDIR, "concordance_occ.json")

LANGS_CONC = ["fr"]            # langue de la gloss de morphologie (fr = public francophone)
WORKERS = 14                   # parallélisme pool
MIN_DELAY = 0.05              # délai mini entre démarrages de requêtes (politesse)
MSS_CAP = 12                   # manuscrits conservés par verset (ceux avec image)
OCC_CAP = 40                   # occurrences conservées par racine (concordance)

_lock = threading.RLock()
_seen_wc = {}                  # word_cc -> True (déjà récupéré)
_occ_cache = {}                # word_cc -> {count, refs}
_last_req = [0.0]
_fail = [0]

# ---- versification (depuis quran/versification.js) ----
def load_verse_counts():
    p = os.path.join(ROOT, "quran", "versification.js")
    with open(p, encoding="utf-8") as f:
        txt = f.read()
    m = re.search(r"__quranVerseCounts\s*=\s*(\{.*?\});", txt, re.S)
    return json.loads(m.group(1))

# ---- requête HTTP avec retry / backoff ----
def fetch(path, timeout=40, tries=6):
    url = BASE + path
    for attempt in range(tries):
        with _lock:
            now = time.time()
            wait = MIN_DELAY - (now - _last_req[0])
            if wait > 0:
                time.sleep(wait)
            _last_req[0] = time.time()
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "THEOLOGICUS-harvester/1.0 (+https://github.com/)",
                "Accept": "application/json",
            })
            with urllib.request.urlopen(req, timeout=timeout) as r:
                if r.status == 200:
                    return json.loads(r.read().decode("utf-8"))
                if r.status == 404:
                    return None
                # autre statut -> retry
                _fail[0] += 1
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(min(8, 1.5 * (attempt + 1)))
                continue
            if e.code == 404:
                return None
            time.sleep(min(8, 1.5 * (attempt + 1)))
        except Exception as e:
            time.sleep(min(8, 1.5 * (attempt + 1)))
    return None

# ---- compacteurs ----
def compact_commentary(d):
    if not d:
        return None
    structure = []
    for row in d.get("text_structure") or []:
        structure.append({
            "v": row.get("verse"),
            "p": row.get("verse_part"),
            "ar": row.get("ar"),
            "de": row.get("de"),
            "sec": row.get("section"),
            "dec": row.get("decade"),
            "rh": row.get("rhyme"),
        })
    sections = []
    for s in d.get("sections") or []:
        vcs = []
        for blk in s.get("verse_content") or []:
            c = blk.get("content") if isinstance(blk, dict) else None
            if c:
                vcs.append(c)
        sections.append({
            "gt": s.get("general_title"),
            "st": s.get("specific_title"),
            "vc": vcs,
            "wc": s.get("works_cited"),
        })
    return {
        "sura": d.get("sura"),
        "title": d.get("title"),
        "author": d.get("author"),
        "cite": d.get("how_to_cite"),
        "structure": structure,
        "sections": sections,
    }

def compact_variants(d):
    if not d:
        return None
    ref = {}
    for w, val in (d.get("reference") or {}).items():
        ref[w] = {"tr": val.get("transcription"), "ar": val.get("arab")}
    reads = []
    for r in d.get("variant_readings") or []:
        reads.append({
            "r": [rd.get("display_name") for rd in (r.get("readers") or [])],
            "s": [rd.get("sigle") for rd in (r.get("readers") or []) if rd.get("sigle")],
            "w": r.get("variants"),
            "wk": (r.get("work") or {}).get("display_name"),
            "c": r.get("reading_commentary"),
        })
    return {
        "ref": ref,
        "read": reads,
        "com": d.get("commentary"),
        "cit": [c.get("source") for c in (d.get("citations") or []) if c.get("source")],
    }

def compact_manuscripts(d, cap=MSS_CAP):
    if not d:
        return {"n": 0, "list": []}
    out = []
    for m in d:
        # trouver la 1re page ayant une image
        pick = None
        for pg in m.get("pages") or []:
            imgs = pg.get("images") or []
            if imgs:
                pick = (pg, imgs[0])
                break
        if not pick:
            continue
        pg, img = pick
        arch = m.get("archive") or {}
        out.append({
            "id": m.get("manuscript_id"),
            "t": m.get("title"),
            "arch": arch.get("name"),
            "city": arch.get("city"),
            "cc": arch.get("country_code"),
            "link": arch.get("link"),
            "folio": pg.get("folio"),
            "side": pg.get("side"),
            "img": img.get("image_url"),
        })
        if len(out) >= cap:
            break
    return {"n": len(d), "list": out}

def compact_intertexts(d):
    if not d:
        return []
    out = []
    for it in d:
        rng = it.get("range") or {}
        out.append({
            "id": it.get("id"),
            "t": it.get("title"),
            "ea": it.get("entry_author"),
            "ia": it.get("intertext_author"),
            "lang": it.get("language"),
            "loc": it.get("location"),
            "dated": it.get("dated"),
            "src": it.get("source"),
            "cat": it.get("category"),
            "sup": it.get("supercategory"),
            "rs": rng.get("start"),
            "re": rng.get("end"),
        })
    return out

def compact_concordance(d):
    if not d:
        return None
    an = (d.get("analyses") or [])
    if not an:
        return None
    a = an[0]
    wc = a.get("word_cc")
    return {
        "w": a.get("word"),
        "wc": wc,
        "root": a.get("root"),
        "base": a.get("base"),
        "pos": a.get("part_of_speech"),
        "gen": a.get("gender"),
        "num": a.get("number"),
        "pers": a.get("person"),
        "def": a.get("definite"),
        "sem": a.get("semantic"),
        "sem2": a.get("semantic2"),
        "fa": a.get("full_analyse"),
    }

def fetch_occurrences(word_cc):
    if not word_cc:
        return
    with _lock:
        if word_cc in _seen_wc:
            return
        _seen_wc[word_cc] = True
    d = fetch("/api/data/concordance/references/word_cc/" + urllib.parse.quote(word_cc))
    if not d:
        return
    arr = d.get("data") if isinstance(d, dict) else d
    refs = []
    for o in (arr or []):
        refs.append("%s:%s" % (o.get("sura"), o.get("verse")))
    with _lock:
        _occ_cache[word_cc] = {"count": len(refs), "refs": refs[:OCC_CAP]}

# ---- moissonnage d'une sourate ----
def harvest_sura(s, counts, force=False):
    fn = os.path.join(OUTDIR, "s%03d.json" % s)
    if os.path.exists(fn) and not force:
        return "skip"
    nvers = counts.get(str(s)) or counts.get(s)
    if not nvers:
        return "noverse"
    rec = {"sura": s, "comm": None, "verses": {}}
    # commentaire (niveau sourate)
    rec["comm"] = compact_commentary((fetch("/api/data/commentary/sura/%d" % s) or {}).get("data"))
    # par verset — parallélisé
    from concurrent.futures import ThreadPoolExecutor, as_completed
    verses_out = {}
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = [ex.submit(harvest_verse, s, v) for v in range(1, nvers + 1)]
        for f in as_completed(futs):
            v, rec_v = f.result()
            verses_out[str(v)] = rec_v
    rec["verses"] = verses_out
    with open(fn, "w", encoding="utf-8") as f:
        json.dump(rec, f, ensure_ascii=False, separators=(",", ":"))
    return "ok"

def harvest_verse(s, v):
    """Moissonne un verset (variantes, manuscrits, intertextes, concordance)."""
    var = compact_variants((fetch("/api/data/variants/sura/%d/verse/%d" % (s, v)) or {}).get("data"))
    mss = compact_manuscripts((fetch("/api/data/manuscripts/sura/%d/verse/%d" % (s, v)) or {}).get("data"))
    itt = compact_intertexts((fetch("/api/data/intertexts/sura/%d/verse/%d" % (s, v)) or {}).get("data"))
    # concordance : d'abord le mot 1 pour connaître le nombre de mots
    conc = {}
    c1 = (fetch("/api/data/language/%s/concordance/sura/%d/verse/%d/word/1" % (LANGS_CONC[0], s, v)) or {}).get("data")
    if c1 and (c1.get("analyses") or []):
        ca = compact_concordance(c1)
        if ca:
            conc["1"] = ca
            fetch_occurrences(ca["wc"])
        # nombre de mots = len(arabic_text)
        nwords = len((c1.get("arabic_text") or []))
        for w in range(2, nwords + 1):
            cw = (fetch("/api/data/language/%s/concordance/sura/%d/verse/%d/word/%d" % (LANGS_CONC[0], s, v, w)) or {}).get("data")
            if cw and (cw.get("analyses") or []):
                cwc = compact_concordance(cw)
                if cwc:
                    conc[str(w)] = cwc
                    fetch_occurrences(cwc["wc"])
    return v, {"var": var, "mss": mss, "itt": itt, "conc": conc}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--suras", default="all", help="all | 1,2,18 | 1-10")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    os.makedirs(OUTDIR, exist_ok=True)
    counts = load_verse_counts()
    # charger cache occurrences existant
    if os.path.exists(CONC_OCC):
        with open(CONC_OCC, encoding="utf-8") as f:
            _occ_cache.update(json.load(f))
        _seen_wc.update(_occ_cache)
    # résoudre la liste de sourates
    if args.suras == "all":
        suras = list(range(1, 115))
    else:
        suras = []
        for part in args.suras.split(","):
            if "-" in part:
                a, b = part.split("-")
                suras += range(int(a), int(b) + 1)
            else:
                suras.append(int(part))
    print("Sourates à moissonner : %s (%d)" % (suras[:12], len(suras)), file=sys.stderr)
    t0 = time.time()
    done = skip = 0
    for i, s in enumerate(suras, 1):
        r = harvest_sura(s, counts, force=args.force)
        if r == "ok":
            done += 1
        elif r == "skip":
            skip += 1
        # sauvegarde périodique des occurrences
        if i % 10 == 0:
            with open(CONC_OCC, "w", encoding="utf-8") as f:
                json.dump(_occ_cache, f, ensure_ascii=False, separators=(",", ":"))
        print("[%d/%d] sourate %d -> %s  (%ds, occ=%d, fails=%d)" % (
            i, len(suras), s, r, int(time.time() - t0), len(_occ_cache), _fail[0]), file=sys.stderr)
    with open(CONC_OCC, "w", encoding="utf-8") as f:
        json.dump(_occ_cache, f, ensure_ascii=False, separators=(",", ":"))
    print("TERMINE : %d ok, %d skip, %d occurrences, %d echecs, %ds" % (
        done, skip, len(_occ_cache), _fail[0], int(time.time() - t0)), file=sys.stderr)

if __name__ == "__main__":
    main()
