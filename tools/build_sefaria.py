#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""build_sefaria.py — exploite sefaria.org pour THEOLOGICUS (v177).

Récupère TOUS les commentaires de la Tanakh disponibles en anglais :
  phase 1 (scan)  : pour chaque titre candidat (sef_comm_cands.json, 542 œuvres),
                    sonde /api/texts/<T>.1.1-1.30?version=english → dispo EN ?
  phase 2 (fetch) : pour chaque œuvre EN, chaque chapitre :
                    /api/texts/<T>.<ch>.1-<ch>.200?version=english (plage clampée
                    par Sefaria → un seul appel par chapitre, texte imbriqué
                    [verset][commentaires])
  phase 3 (build) : index par verset, clés « b:c:v » numérotation Segond
                    (identiques v167/hcf) → tradition/sefaria_idx.json
                    { "<b>:<c>:<v>": [ {c: commentateur, w: œuvre, sn ≤700,
                                        u: lien sefaria.org} ] }
Cache disque : sefaria/cache/<slug>.json (sondes + chapitres) — relancer le
script ne re-télécharge jamais ce qui est déjà en cache.
"""
import json
import os
import re
import sys
import time
import urllib.request
import urllib.error
import urllib.parse

ROOT = r'C:\tmp\theoverify'
CACHE = os.path.join(ROOT, 'sefaria', 'cache')
OUT = os.path.join(ROOT, 'tradition', 'sefaria_idx.json')
CANDS = r'C:\tmp\sef_comm_cands.json'

UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                    '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Accept': 'application/json'}
DELAY = 0.4
CAP_SN = 700
CAP_PER_VERSE = 8

SEF_BOOKS = {
    'Genesis': 1, 'Exodus': 2, 'Leviticus': 3, 'Numbers': 4, 'Deuteronomy': 5,
    'Joshua': 6, 'Judges': 7, 'I Samuel': 9, 'II Samuel': 10,
    'I Kings': 11, 'II Kings': 12, 'Isaiah': 23, 'Jeremiah': 24, 'Ezekiel': 26,
    'Hosea': 28, 'Joel': 29, 'Amos': 30, 'Obadiah': 31, 'Jonah': 32, 'Micah': 33,
    'Nahum': 34, 'Habakkuk': 35, 'Zephaniah': 36, 'Haggai': 37, 'Zechariah': 38,
    'Malachi': 39, 'Psalms': 19, 'Proverbs': 20, 'Job': 18, 'Song of Songs': 22,
    'Ruth': 8, 'Lamentations': 25, 'Ecclesiastes': 21, 'Esther': 17, 'Daniel': 27,
    'Ezra': 15, 'Nehemiah': 16, 'I Chronicles': 13, 'II Chronicles': 14,
    'Ezra - Nehemiah': 15, 'Daniel - Ezra': 27,
}


def slug(t):
    s = re.sub(r'[^A-Za-z0-9]+', '_', t).strip('_')
    return s[:90]


def api(url, tries=5):
    for a in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read().decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code in (404, 400):
                return None
            wait = 3 + 4 * a
            print('  ! HTTP %s %s retry %ss' % (e.code, url[-60:], wait), flush=True)
            time.sleep(wait)
        except Exception as e:
            wait = 3 + 4 * a
            print('  ! %s retry %ss' % (str(e)[:70], wait), flush=True)
            time.sleep(wait)
    return None


def strip_tags(s):
    s = re.sub(r'<[^>]+>', '', s or '')
    s = s.replace('&nbsp;', ' ').replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
    s = re.sub(r'&#8217;', "'", s).replace('&#8216;', "'")
    s = re.sub(r'&#8220;|&#8221;', '"', s)
    s = re.sub(r'&#8211;|&#8212;', '-', s)
    s = re.sub(r'&quot;', '"', s)
    return ' '.join(s.split())


def flatten_text(t):
    """text Sefaria -> liste (verset_relatif, [commentaires str])."""
    out = []
    for i, item in enumerate(t):
        if isinstance(item, list):
            out.append((i, [c for c in item if isinstance(c, str) and c.strip()]))
        elif isinstance(item, str) and item.strip():
            out.append((i, [item]))
    return out


def cached(name, url, refresh=False):
    p = os.path.join(CACHE, name + '.json')
    if not refresh and os.path.exists(p) and os.path.getsize(p) > 3:
        try:
            return json.load(open(p, encoding='utf-8'))
        except Exception:
            pass
    d = api(url)
    if d is not None:
        json.dump(d, open(p, 'w', encoding='utf-8'), ensure_ascii=False)
    time.sleep(DELAY)
    return d


def probe(title):
    """Œuvre dispo en anglais ? -> {title, length, base} | None"""
    d = cached('probe_' + slug(title),
               'https://www.sefaria.org/api/texts/%s.1.1-1.30?version=english' % urllib.parse.quote(title))
    if not d or not d.get('text'):
        # sonde chapitre 2 puis 3 (certains commentaires sautent le ch.1)
        for ch in (2, 3):
            d = cached('probe_%s_c%d' % (slug(title), ch),
                       'https://www.sefaria.org/api/texts/%s.%d.1-%d.30?version=english'
                       % (urllib.parse.quote(title), ch, ch))
            if d and d.get('text'):
                break
        else:
            return None
    base = ''
    bt = d.get('baseTexTitles') or []
    if bt:
        base = bt[0]
    else:
        m = re.search(r'\bon\s+(.+)$', title)
        base = m.group(1) if m else ''
    return {'title': title, 'length': d.get('length') or 0, 'base': base,
            'collective': d.get('collectiveTitle') or d.get('commentator') or title}


def main():
    only = None
    if len(sys.argv) > 1 and sys.argv[1] == '--scan-only':
        only = True
    reverse = any(a == '--reverse' for a in sys.argv[1:])
    os.makedirs(CACHE, exist_ok=True)
    titles = json.load(open(CANDS, encoding='utf-8'))
    print('%d œuvres candidates' % len(titles), flush=True)

    # ── phase 1 : scan ──
    scan_p = os.path.join(CACHE, '_scan.json')
    if os.path.exists(scan_p):
        works = json.load(open(scan_p, encoding='utf-8'))
    else:
        works = []
        for n, t in enumerate(titles, 1):
            w = probe(t)
            if w and w['length']:
                works.append(w)
                print('%4d/%d  EN  %-55s base=%-20s ch=%d' % (n, len(titles), t[:55], w['base'][:20], w['length']), flush=True)
            if n % 40 == 0:
                json.dump(works, open(scan_p, 'w', encoding='utf-8'), ensure_ascii=False)
        json.dump(works, open(scan_p, 'w', encoding='utf-8'), ensure_ascii=False)
    print('œuvres avec anglais : %d' % len(works), flush=True)
    if only:
        return
    if reverse:
        works.reverse()
        print('mode REVERSE (2e instance parallèle)', flush=True)

    # ── phase 2 + 3 : fetch chapitres + index ──
    idx = {}
    n_ent = 0
    for wi, w in enumerate(works, 1):
        T = urllib.parse.quote(w['title'])
        b = SEF_BOOKS.get(w['base'])
        if b is None:
            print('SKIP (base inconnue) %s -> %r' % (w['title'], w['base']), flush=True)
            continue
        for ch in range(1, w['length'] + 1):
            d = cached('%s_c%03d' % (slug(w['title']), ch),
                       'https://www.sefaria.org/api/texts/%s.%d.1-%d.200?version=english' % (T, ch, ch))
            if not d or not d.get('text'):
                continue
            for vi, comments in flatten_text(d['text']):
                v = vi + 1
                kept = 0
                for c in comments:
                    sn = strip_tags(c)
                    if len(sn) < 12:
                        continue
                    if len(sn) > CAP_SN:
                        sn = sn[:CAP_SN].rsplit(' ', 1)[0] + '…'
                    key = '%d:%d:%d' % (b, ch, v)
                    idx.setdefault(key, []).append(
                        {'c': w['collective'], 'w': w['title'], 'sn': sn,
                         'u': 'https://www.sefaria.org/%s.%d.%d' % (w['title'].replace(' ', '_'), ch, v)})
                    n_ent += 1
                    kept += 1
                    if kept >= CAP_PER_VERSE:
                        break
        if wi % 10 == 0:
            print('%3d/%d œuvres — %d entrées' % (wi, len(works), n_ent), flush=True)

    data = {'built': time.strftime('%Y-%m-%d %H:%M'), 'src': 'sefaria.org',
            'nworks': len(works), 'nentries': n_ent, 'idx': idx}
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print('OK %s : %d clés, %d entrées, %.1f MB' % (
        OUT, len(idx), n_ent, os.path.getsize(OUT) / 1e6), flush=True)


if __name__ == '__main__':
    main()
