#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""build_hcf.py — indexe le corpus historicalchristian.faith (Writings-Database)
par verset biblique, pour le panneau « Pères & homélies » de THEOLOGICUS.

Source : dépôt GitHub public historicalchristianfaith/Writings-Database
(5464 œuvres HTML de 439 pères, ~322 Mo). Le dépôt est extrait dans
C:/tmp/hcf/Writings-Database-master — ce script scanne les fichiers LOCAUX,
aucune requête réseau.

Sortie : tradition/hcf_idx.json
  { "43:8:58": [ {f: père, w: œuvre, y: année, h: homélie?, sn: extrait ≤600,
                  u: lien profond historicalchristian.faith} ] }
Clés identiques à l'index v167 (numérotation Segond) → intégration directe
dans le panneau existant (bouton 🌐 FR + cache v171 fonctionnent sans change).

Usage : py -3.12 tools/build_hcf.py [répertoire_du_dépôt]
"""
import json, re, sys, time, html as H
from pathlib import Path

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else 'C:/tmp/hcf/Writings-Database-master')
OUT = Path(__file__).resolve().parent.parent / 'tradition' / 'hcf_idx.json'

# ── numérotation Segond, IDENTIQUE au module v167 de THEOLOGICUS ──
BOOKS = {
    'genesis':1,'gen':1,'exodus':2,'ex':2,'exod':2,'leviticus':3,'lev':3,'numbers':4,'num':4,
    'deuteronomy':5,'deut':5,'joshua':6,'josh':6,'jos':6,'judges':7,'judg':7,'ruth':8,
    'ezra':15,'esdras':15,'nehemiah':16,'nehem':16,'esther':17,'job':18,
    'psalm':19,'psalms':19,'ps':19,'psa':19,'proverbs':20,'prov':20,'ecclesiastes':21,'eccl':21,
    'isaiah':23,'isa':23,'jeremiah':24,'jer':24,'jeremias':24,'lamentations':25,'lam':25,
    'ezekiel':26,'ezek':26,'daniel':27,'dan':27,'hosea':28,'osee':28,'hos':28,'joel':29,
    'amos':30,'jonah':32,'jon':32,'micah':33,'mic':33,'nahum':34,'nah':34,'habakkuk':35,'hab':35,
    'zephaniah':36,'sophonias':36,'zeph':36,'haggai':37,'aggeus':37,'hag':37,'zechariah':38,
    'zacharias':38,'zech':38,'malachi':39,'malachias':39,'mal':39,
    'matthew':40,'matt':40,'mt':40,'mark':41,'mk':41,'luke':42,'luk':42,'lk':42,'john':43,'jn':43,
    'acts':44,'romans':45,'rom':45,'galatians':48,'gal':48,'ephesians':49,'eph':49,
    'philippians':50,'phil':50,'colossians':51,'col':51,'titus':56,'tit':56,'philemon':57,
    'philem':57,'hebrews':58,'heb':58,'james':59,'jas':59,'jude':65,
    'revelation':66,'apocalypse':66,'rev':66,'apoc':66,
    'canticles':22,'canticle':22,'cant':22,'wisdom':0,'wis':0,'sirach':0,'sir':0,
    'ecclesiasticus':0,'baruch':0,'tobit':0,'judith':0,'maccabees':0,'machabees':0,
    'samuel':0,'kings':0,'chronicles':0,'corinthians':0,'thessalonians':0,'timothy':0,'peter':0,
}
SPLIT = {'samuel':[9,10],'kings':[11,12],'chronicles':[13,14],'corinthians':[46,47],
         'thessalonians':[52,53],'timothy':[54,55],'peter':[60,61]}
NAMES = '|'.join(sorted((k for k in BOOKS if len(k) >= 2), key=len, reverse=True))
REF_RE = re.compile(
    r'\b(?:(\d)\s{0,3})?(' + NAMES + r')\.?\s+(\d{1,3})\s*[.:,]\s*(\d{1,3})(?:\s*[-\u2013]\s*(\d{1,3}))?',
    re.IGNORECASE)
HOMILY_RE = re.compile(r'homil|sermon|oration|letter|epistle', re.I)

def res_book2(name, p):
    base = BOOKS.get(name)
    if base is None:
        return None
    if base == 0:
        arr = SPLIT.get(name)
        if not arr or not p or p > len(arr):
            return None
        return arr[p-1]
    if name in ('john', 'jn') and p:
        return 61 + p
    if p and base >= 9:
        return None
    return base

def res_book(raw, p):
    name = raw.lower()
    return res_book2(name, p)

def verse_keys(b, c, v1, v2):
    c = str(int(c))
    v1 = int(v1); v2 = int(v2) if v2 else v1
    if v2 < v1:
        v1, v2 = v2, v1
    return ['%s:%s:%d' % (b, c, v) for v in range(v1, min(v2, v1 + 45) + 1)]

def clean(s):
    s = re.sub(r'<[^>]+>', ' ', s)
    return H.unescape(re.sub(r'\s+', ' ', s)).strip()

def blocks_of(h):
    """Découpe une œuvre en blocs de texte plausibles."""
    h = re.sub(r'<script.*?</script>|<style.*?</style>', ' ', h, flags=re.S|re.I)
    # retirer la section « Historical Introductions » (citations d'AUTRES auteurs)
    i = h.find('Historical Introductions')
    if i >= 0:
        nxt = h.find('<h2', i + 10)
        h = h[:i] + (h[nxt:] if nxt >= 0 else '')
    h = re.sub(r'<sup.*?</sup>', '', h, flags=re.S)      # notes de bas de page
    # frontières de blocs : titres + sauts de paragraphe
    h = re.sub(r'</h[1-6]>', '\u0001', h)
    h = re.sub(r'(?:<br\s*/?>\s*){2,}', '\u0001', h)
    parts = h.split('\u0001')
    for p in parts:
        t = clean(p)
        if 80 <= len(t) <= 900:
            yield t

def deep_link(rel):
    """Lien profond vers le site (paramètre file double-encodé, comme la home)."""
    from urllib.parse import quote
    q = quote(rel, safe='')
    return 'https://historicalchristian.faith/by_father.php?file=' + q.replace('%20', '%2520')

def main():
    if not ROOT.exists():
        sys.exit('dépôt introuvable : %s' % ROOT)
    idx = {}
    nworks = 0
    t0 = time.time()
    files = sorted(ROOT.rglob('*.html'))
    print('œuvres à scanner :', len(files))
    for f in files:
        rel = f.relative_to(ROOT).as_posix()
        top = rel.split('/')[0]
        sub = '/'.join(rel.split('/')[1:-1])
        work = (sub + ' · ' if sub else '') + f.stem
        # année depuis le metadata.toml du dossier racine du père
        y = None
        mp = f.parent
        while mp != mp.parent:
            mt = mp / 'metadata.toml'
            if mt.exists():
                m = re.search(r'default_year=(\d+)', mt.read_text(encoding='utf-8', errors='replace'))
                if m: y = int(m.group(1))
                break
            mp = mp.parent
        try:
            h = f.read_text(encoding='utf-8', errors='replace')
        except Exception:
            continue
        hom = bool(HOMILY_RE.search(f.stem))
        got = False
        seen_vw = set()
        for b in blocks_of(h):
            for m in REF_RE.finditer(b):
                p = int(m.group(1)) if m.group(1) else 0
                book = res_book(m.group(2), p)
                if not book:
                    continue
                for key in verse_keys(book, m.group(3), m.group(4), m.group(5)):
                    vw = (key, rel)
                    if vw in seen_vw:
                        continue
                    seen_vw.add(vw)
                    lst = idx.get(key)
                    if lst is None:
                        lst = idx[key] = []
                    if len(lst) >= 6:          # plafond par verset
                        continue
                    lst.append({
                        'f': top, 'w': work, 'y': y, 'h': 1 if hom else 0,
                        'sn': b[:600] + ('…' if len(b) > 600 else ''),
                        'u': deep_link(rel),
                    })
                    got = True
        if got:
            nworks += 1
    meta = {'v': 1, 'source': 'historicalchristian.faith (Writings-Database)',
            'built': time.strftime('%Y-%m-%d'), 'works': nworks,
            'entries': sum(len(v) for v in idx.values()), 'idx': idx}
    OUT.write_text(json.dumps(meta, ensure_ascii=False), encoding='utf-8')
    print('écrit', OUT, '—', nworks, 'œuvres,', meta['entries'], 'entrées,', len(idx), 'versets,',
          round(OUT.stat().st_size/1048576, 1), 'Mo,', round(time.time()-t0), 's')

if __name__ == '__main__':
    main()
