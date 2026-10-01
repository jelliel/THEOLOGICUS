# -*- coding: utf-8 -*-
"""v204c — Enrichissement des recits Valtorta.

Par page (via le relais r.jina.ai, le site bloquant l'acces direct) :
  - references du bloc « Evangile : » d'en-tete ;
  - date de VISION (« Le mardi 24 octobre 1944 ») ;
  - date de l'EVENEMENT raconte (« Mercredi 7 avril 27 ») + date juive
    (« 14 Nissan 3787 ») + lieu (« Jerusalem ») ;
  - les references « X a,b jusqu'a c,d » sont etendues en un ref par chapitre.
Sauvegarde incrementale toutes les 25 pages.
"""
import json, re, time, urllib.request, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from scan_valtorta import parse_ref, AELF_RE, clean_title, expand_refs  # noqa: E402

OUT = os.path.join(ROOT, "tradition", "valtorta.json")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) THEOLOGICUS-indexer/1.0"}
PAUSE = 3.3          # relais : 20 req/min
MODE = os.environ.get("VLT_MODE", "full")   # 'full' | 'lieu'

DATE_RE = re.compile(
    r"Le\s+((?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)[^\n<>]{3,70}?\d{4})", re.I)
# date de l'EVENEMENT raconte (dans la vie de Jesus), ex. « Mercredi 7 avril 27 ».
# Annee sur 1-2 chiffres -> exclut la date de vision (« Le mardi 24 octobre 1944 »).
EVENT_RE = re.compile(
    r"(?<![Ll]e )((?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+\d{1,2}\s+"
    r"(?:janvier|f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|"
    r"d[eé]cembre)\s+-?\d{1,2})(?!\d)", re.I)
JEW_RE = re.compile(r"_\((\d{1,2}\s+[A-Za-zÀ-ÿ]+\s+\d{3,4})\)_")
# Deux mises en page selon les tomes :
#   tomes 2+ : « _(15 Nissan 3790)_  [Jérusalem](url), le Cénacle »
#   tome 1   : « DATE. Calendrier actuel: _Lundi 1 octobre -22._ ... Calendrier
#                juif: _24 Tishri 3740._ LIEU.[Jérusalem](url). »
JEW_RE2 = re.compile(r"Calendrier\s+juif\s*:\s*_([^_]{3,40})_", re.I)
LIEU_RE = re.compile(r"_\([^)]*\)_\s*\[([^\]]{2,40})\]\([^)]*\)([^\n\[]{0,40})")
LIEU_RE2 = re.compile(r"LIEU\s*\.\s*\[([^\]]{2,40})\]\([^)]*\)([^\n\[]{0,40})", re.I)
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
    out = {"refs": [], "cit": [], "d": None}
    md_ = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", md)     # images
    # 1) references OFFICIELLES : bloc « Evangile : » de l'en-tete
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
    out["refs"] = expand_refs(out["refs"])
    # 2) references CITEES dans le recit et les notes (liens AELF du corps) :
    #    elles etoffent la concordance des versets que le site ne met pas en
    #    en-tete. Donnee du site, marquee « citee » pour ne pas la confondre.
    off = set((r["b"], r["c"], r["v1"], r["v2"]) for r in out["refs"])
    cit, seen_c = [], set()
    for mr in AELF_RE.finditer(md_):
        r = parse_ref(mr.group(1))
        if not r:
            continue
        k = (r["b"], r["c"], r["v1"], r["v2"])
        if k in off or k in seen_c:
            continue
        seen_c.add(k)
        cit.append(r)
    out["cit"] = expand_refs(cit)[:60]
    md_ = re.sub(r"\s+", " ", md_)
    m = DATE_RE.search(md_)
    if m:
        d = re.sub(r"\s+", " ", m.group(1)).strip(" ._-–—")
        if 8 <= len(d) <= 80:
            out["d"] = d
    # date de l'evenement raconte + date juive + lieu (en-tete de page)
    m = EVENT_RE.search(md_)
    if m:
        ev = re.sub(r"\s+", " ", m.group(1)).strip(" ._-–—")
        if 6 <= len(ev) <= 40:
            out["ev"] = ev
    for rx in (JEW_RE, JEW_RE2):
        m = rx.search(md_)
        if m:
            out["evj"] = re.sub(r"\s+", " ", m.group(1)).strip(" ._-–—")
            break
    for rx in (LIEU_RE, LIEU_RE2):
        m = rx.search(md_)
        if not m:
            continue
        tail = re.split(r"\s\*|\||\[|Accueil", m.group(2) or "")[0]
        lieu = re.sub(r"\s+", " ", (m.group(1) + tail)).strip(" .,;:-–—")
        lieu = re.sub(r"\s*\([^)]*$", "", lieu).strip()
        if 2 <= len(lieu) <= 48 and "aelf" not in lieu.lower() and "http" not in lieu.lower():
            out["lieu"] = lieu
            break
    return out


def main():
    d = json.load(open(OUT, encoding="utf-8"))
    eps = d["episodes"]
    if MODE == "lieu":
        todo = [e for e in eps if not e.get("lieu") or not e.get("evj")]
    else:
        todo = [e for e in eps if not e.get("d") or not e["refs"] or not e.get("ev")
                or not e.get("cit")]
    print("a enrichir : %d recits (mode %s)" % (len(todo), MODE), flush=True)
    # etendre les plages de chapitres deja presentes (« Jean 13,1 jusqu'a 17,26 »)
    for e in eps:
        e["refs"] = expand_refs(e["refs"])
    done = 0
    t0 = time.time()
    for e in todo:
        try:
            md = fetch(e["u"])
            got = parse_page(md)
        except Exception as ex:
            print("  ! %s : %s" % (e["fid"], str(ex)[:70]), flush=True)
            continue
        for k in ("d", "ev", "evj", "lieu"):
            if got.get(k) and not e.get(k):
                e[k] = got[k]
        if got["refs"]:
            seen = set((r["b"], r["c"], r["v1"], r["v2"]) for r in e["refs"])
            for r in got["refs"]:
                k = (r["b"], r["c"], r["v1"], r["v2"])
                if k not in seen:
                    seen.add(k)
                    e["refs"].append(r)
        if got["cit"]:
            e.setdefault("cit", [])
            seen = set((r["b"], r["c"], r["v1"], r["v2"]) for r in e["cit"])
            for r in got["cit"]:
                k = (r["b"], r["c"], r["v1"], r["v2"])
                if k not in seen:
                    seen.add(k)
                    e["cit"].append(r)
        done += 1
        print("  %3d/%d %s vision=%s evenement=%s refs=%d citees=%d" % (
            done, len(todo), e["fid"], (got["d"] or "-")[:18],
            (got.get("ev") or "-")[:20], len(got["refs"]), len(got["cit"])), flush=True)
        if done % 25 == 0:
            with_refs = sum(1 for x in eps if x["refs"])
            ncit = sum(len(x.get("cit", [])) for x in eps)
            print("  --- vision %d, evenements %d, avec refs %d, citees %d (%.0fs)"
                  % (sum(1 for x in eps if x.get("d")), sum(1 for x in eps if x.get("ev")),
                     with_refs, ncit, time.time() - t0), flush=True)
            d["meta"]["avec_refs"] = with_refs
            d["meta"]["refs"] = sum(len(x["refs"]) for x in eps)
            d["meta"]["citees"] = ncit
            json.dump(d, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        time.sleep(PAUSE)

    eps.sort(key=lambda e: (e["tome"], e["fid"]))
    d["episodes"] = eps
    d["meta"]["avec_refs"] = sum(1 for x in eps if x["refs"])
    d["meta"]["refs"] = sum(len(x["refs"]) for x in eps)
    d["meta"]["citees"] = sum(len(x.get("cit", [])) for x in eps)
    d["meta"]["dates"] = sum(1 for x in eps if x.get("d"))
    d["meta"]["evenements"] = sum(1 for x in eps if x.get("ev"))
    d["meta"]["enrichi"] = time.strftime("%Y-%m-%d")
    json.dump(d, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("OK : %d recits, %d avec refs (%d refs) + %d citees, %d dates de vision, "
          "%d dates d'evenement — %.0fs"
          % (len(eps), d["meta"]["avec_refs"], d["meta"]["refs"], d["meta"]["citees"],
             d["meta"]["dates"], d["meta"]["evenements"], time.time() - t0))


if __name__ == "__main__":
    main()
