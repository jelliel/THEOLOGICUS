# -*- coding: utf-8 -*-
"""v206 — Catéchèses de Maria Valtorta.

Constat (02/10) : 18 fichiers de la numerotation des tomes ne sont pas des
recits. Verifie sur piece : ce sont des CATECHESES — des dictees rattachees a
un chapitre de l'oeuvre (ex. 01-026 -> « Le mercredi 8 mars 1944 ... 118>
17.16- »), plus une page supprimee (09-005). On les indexe a part, avec leur
date de vision, leur chapitre parent et un court extrait ; le texte reste sur
le site (droits CEV), comme pour les recits.
"""
import json, os, re, sys, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from scan_valtorta_sections import NAV_RE  # noqa: E402  (navigation du site)
VLT = os.path.join(ROOT, "tradition", "valtorta.json")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) THEOLOGICUS-indexer/1.0"}
BASE = "https://www.maria-valtorta.org/Publication/"
PAUSE = 3.3

DATE_RE = re.compile(r"(?:Cat[eé]ch[eè]se du\s+|Vision du\s+|Le\s+)([^_.]{6,45}?)(?:\._|\s*_)", re.I)
PARENT_RE = re.compile(r"\b\d{1,4}\s*>\s*(\d{1,3}\s*\.\s*\d{1,2})")
EXCERPT_RE = re.compile(r"\d{1,4}\s*>\s*\d{1,3}\s*\.\s*\d{1,2}\s*[-–—]?\s*(.{20,240})", re.S)
EMV_RE = re.compile(r"^Title:\s*EMV\s*(\d{1,3})", re.M | re.I)


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


def clean(s):
    s = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", s)
    s = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", s)
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def parse(md):
    if "Title: Supprimé" in md or "404 Not Found" in md[:200]:
        return None
    raw = md[md.find("Markdown Content:") + 17:] if "Markdown Content:" in md else md
    txt = NAV_RE.sub(" ", clean(raw))
    txt = re.sub(r"\s+", " ", txt).lstrip("_*  ").strip()
    # discriminant : une page de catechèse commence par sa date (« Catéchèse
    # du … », « Vision du … », « Le … ») une fois la navigation retiree.
    if not re.match(r"^(Cat[eé]ch[eè]se du\s+|Vision du\s+|Le\s+)", txt):
        return None
    head = txt[:300]
    out = {}
    m = EMV_RE.search(md)
    if m:
        out["emv"] = int(m.group(1))
    m = PARENT_RE.search(head)
    if m:
        out["parent"] = re.sub(r"\s+", "", m.group(1))
    m = DATE_RE.search(head)
    if m:
        d = m.group(1).strip(" ._-–—")
        if re.search(r"\d{4}", d):
            out["d"] = d
    m = EXCERPT_RE.search(txt)
    if m:
        out["ex"] = re.sub(r"^(?:-\s*)?", "", m.group(1).strip())[:220]
    return out if (out.get("parent") or out.get("d") or out.get("ex")) else None


def main():
    d = json.load(open(VLT, encoding="utf-8"))
    eps = d["episodes"]
    have = set(e["fid"] for e in eps)
    cand = []
    for t in range(1, 11):
        nums = sorted(int(e["fid"][3:]) for e in eps if e["tome"] == t)
        if not nums:
            continue
        for n in range(min(nums), max(nums) + 1):
            fid = "%02d-%03d" % (t, n)
            if fid not in have:
                cand.append(fid)
    print("fichiers hors recits : %d" % len(cand), flush=True)

    cates, ko = [], []
    for i, fid in enumerate(cand, 1):
        url = BASE + "TOME%%20%s/%s.htm" % (fid[:2], fid)
        try:
            md = fetch(url)
        except Exception as ex:
            ko.append(fid)
            print("  %2d %s ERREUR %s" % (i, fid, str(ex)[:40]), flush=True)
            time.sleep(PAUSE)
            continue
        p = parse(md)
        if p:
            p.update({"fid": fid, "tome": int(fid[:2]), "u": url})
            cates.append(p)
            print("  %2d %s catéchèse | parent %s | %s | %s"
                  % (i, fid, p.get("parent", "-"), (p.get("d") or "-")[:26],
                     (p.get("ex") or "")[:52]), flush=True)
        else:
            ko.append(fid)
            print("  %2d %s -> pas une catéchèse (supprimée ou vide)" % (i, fid), flush=True)
        time.sleep(PAUSE)

    d["catecheses"] = cates
    d["meta"]["catecheses"] = len(cates)
    d["meta"]["hors_recits"] = len(ko)
    json.dump(d, open(VLT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("OK : %d catéchèses indexées, %d fichiers écartés" % (len(cates), len(ko)))


if __name__ == "__main__":
    main()
