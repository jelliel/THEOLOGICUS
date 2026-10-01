# -*- coding: utf-8 -*-
"""v204d — Comblement des recits ABSENTS des sommaires de maria-valtorta.org.

Constat verifie : les sommaires du site ne referencent pas tous les fichiers.
Ex. 01-004 (EMV 3), 02-003 (EMV 45), 03-046 (EMV 185) existent et sont des
recits complets, mais aucun sommaire ne les liste. On enumere donc les numeros
de fichiers presents dans les intervalles connus, on sonde la frontiere haute
de chaque tome, et on lit chaque page via le relais r.jina.ai.

Champs extraits : numero EMV (en-tete Jina « Title: EMV N »), titre francais
(apres « Nouvelle edition: Tome X, chapitre N. »), date de vision, refs AELF.
"""
import json, re, sys, time, urllib.request, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from scan_valtorta import parse_ref, AELF_RE, clean_title  # noqa: E402

OUT = os.path.join(ROOT, "tradition", "valtorta.json")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) THEOLOGICUS-indexer/1.0"}
BASE = "https://www.maria-valtorta.org/Publication/"
PAUSE = 3.2
PROBE = int(os.environ.get("VLT_PROBE", "4"))   # numeros sondes au-dela du max connu

DATE_RE = re.compile(
    r"Le\s+((?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)[^\n<>]{3,70}?\d{4})", re.I)
EV_RE = re.compile(r"gile\s*:(.{0,3000}?)(?:\n\s*\*\s*\*\s*\*|$)", re.S | re.I)
EMV_RE = re.compile(r"^Title:\s*EMV\s*(\d{1,3})", re.M | re.I)
# titre francais : ligne portant EXACTEMENT le numero EMV, puis le titre.
# (l'ancre sur le numero resiste aux notes editoriales inserees entre
#  « Nouvelle edition » et le titre, ex. 06-122 -> EMV 430)
# repli : juste apres la ligne « Nouvelle edition: Tome X, chapitre N. »
TITLE_RE = re.compile(r"Nouvelle\s+[eé]dition:[^\n]*\n(?:.{0,300}?)\n\s*(\d{1,3})\s*\n\s*([^\n]{8,220})",
                      re.I | re.S)


def extract_title(md, emv):
    if emv:
        m = re.search(r"\n\s*%d\s*\n\s*([^\n]{8,220})" % emv, md)
        if m:
            return m.group(1)
    m = TITLE_RE.search(md)
    if m:
        return m.group(2)
    return None


def fetch(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request("https://r.jina.ai/" + url, headers=UA)
            with urllib.request.urlopen(req, timeout=45) as r:
                return r.read().decode("utf-8", "replace")
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(6 * (i + 1))


def parse_page(md, fid):
    ep = {"fid": fid, "tome": int(fid[:2]), "refs": [],
          "u": BASE + "TOME%%20%s/%s.htm" % (fid[:2], fid)}
    m = EMV_RE.search(md)
    if m:
        ep["emv"] = int(m.group(1))
    raw_title = extract_title(md, ep.get("emv"))
    if raw_title:
        title = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", raw_title)
        title = re.sub(r"\s+", " ", title).strip(" .-–—|")
        title = clean_title(title)
        if len(title) >= 5:
            ep["title"] = title
    if "title" not in ep:
        return None                     # page sans titre exploitable
    t = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", md)
    m = EV_RE.search(t)
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
            ep["refs"].append(r)
    flat = re.sub(r"\s+", " ", t)
    m = DATE_RE.search(flat)
    if m:
        d = re.sub(r"\s+", " ", m.group(1)).strip(" ._-–—")
        if 8 <= len(d) <= 80:
            ep["d"] = d
    return ep


def main():
    d = json.load(open(OUT, encoding="utf-8"))
    eps = d["episodes"]
    have = set(e["fid"] for e in eps)

    cand = []
    for t in range(1, 11):
        nums = sorted(int(e["fid"][3:]) for e in eps if e["tome"] == t)
        if not nums:
            continue
        for n in range(min(nums), max(nums) + PROBE + 1):
            fid = "%02d-%03d" % (t, n)
            if fid not in have:
                cand.append(fid)
    print("candidats : %d" % len(cand), flush=True)

    added, t0 = 0, time.time()
    for i, fid in enumerate(cand, 1):
        url = BASE + "TOME%%20%s/%s.htm" % (fid[:2], fid)
        try:
            md = fetch(url)
        except Exception as ex:
            print("  %3d %s ERR %s" % (i, fid, str(ex)[:50]), flush=True)
            time.sleep(PAUSE)
            continue
        ep = None
        try:
            ep = parse_page(md, fid)
        except Exception as ex:
            print("  %3d %s parse ERR %s" % (i, fid, str(ex)[:50]), flush=True)
        if ep:
            eps.append(ep)
            added += 1
            print("  %3d %s EMV %s | %s | refs %d | %s"
                  % (i, fid, ep.get("emv"), (ep.get("title") or "")[:46],
                     len(ep["refs"]), ep.get("d") or "-"), flush=True)
        else:
            print("  %3d %s -> inexistant/illisible" % (i, fid), flush=True)
        if i % 20 == 0:
            eps.sort(key=lambda e: (e["tome"], e["fid"]))
            d["episodes"] = eps
            d["meta"]["episodes"] = len(eps)
            d["meta"]["avec_refs"] = sum(1 for x in eps if x["refs"])
            d["meta"]["refs"] = sum(len(x["refs"]) for x in eps)
            json.dump(d, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        time.sleep(PAUSE)

    eps.sort(key=lambda e: (e["tome"], e["fid"]))
    d["episodes"] = eps
    d["meta"]["episodes"] = len(eps)
    d["meta"]["avec_refs"] = sum(1 for x in eps if x["refs"])
    d["meta"]["refs"] = sum(len(x["refs"]) for x in eps)
    d["meta"]["dates"] = sum(1 for x in eps if x.get("d"))
    d["meta"]["comble"] = time.strftime("%Y-%m-%d")
    json.dump(d, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("OK : +%d recits -> %d au total (%.0fs)" % (added, len(eps), time.time() - t0))


if __name__ == "__main__":
    main()
