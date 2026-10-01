# -*- coding: utf-8 -*-
"""
build_quranx.py — THEOLOGICUS v183 (2.0.325)
Construit, par verset coranique (S:V) :
  - les TAFSIRS référencés par quranx.com   (https://quranx.com/Tafsirs/S.V)
  - les HADITHS attribués à ce verset       (https://quranx.com/Hadiths/S.V)

Sources (recon 2026-10-01) :
  * /Tafsirs/S.V : <div><dl class="boxed"><dt><a><span class="verse__reference">
    S.V</span></a> {AUTEUR - OEUVRE}</dt><dd class=" highlightable">…</dd>…</dl></div>
    → 8 tafsirs possibles : Abbas, Asrar, Jalal, Kashani, Kathir, Maududi,
      Qushairi, Tustari (variable selon le verset).
  * /Hadiths/S.V : <div class="hadith"> avec hadith__references
    (Collection / n°) + hadith__text (EN) + hadith__text arabic (AR).
  * WAF IIS : exige en-têtes navigateur complets (Referer + Sec-Fetch-*),
    sinon 403 « Forbidden: Access is denied. »

Sorties (tradition/) :
  qtafsir/s<p>.js  : (window.__qtafsirX=window.__qtafsirX||{})[p]={"<v>":[{s,n,x}]}
  qhadith/s<p>.js  : (window.__qhadithX=window.__qhadithX||{})[p]={"<v>":[{c,r,x,ar,u}]}
  qtafsir_idx.json : index de couverture (pour le panneau v183)

Reprise : le cache disque quranx/cache/{tafsir,hadith}/S_V.html est l'unité
de reprise — relancer le script complète simplement les manquants.
"""
import concurrent.futures as cf
import html as htmlmod
import json
import os
import re
import sys
import threading
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'quranx', 'cache')
T_DIR = os.path.join(CACHE, 'tafsir')
H_DIR = os.path.join(CACHE, 'hadith')
OUT = os.path.join(ROOT, 'tradition')

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')
HDRS = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Upgrade-Insecure-Requests': '1',
}

# ── verrou d'impression + compteur de progression ──────────────────────────
_lock = threading.Lock()
_done = 0
_err = 0
_t0 = time.time()


def log(msg):
    with _lock:
        print(msg, flush=True)


def verse_counts():
    src = open(os.path.join(ROOT, 'quran', 'versification.js'),
               encoding='utf-8').read()
    m = re.search(r'window\.__quranVerseCounts\s*=\s*(\{.*?\});', src, re.S)
    if not m:
        raise SystemExit('versification.js illisible')
    return json.loads(m.group(1))


def fetch(url, referer, dest):
    """Télécharge url dans dest (si absent). Retourne le texte, 'empty'
    (404 = pas de contenu pour ce verset) ou None (échec réseau)."""
    if os.path.exists(dest) and os.path.getsize(dest) > 500:
        try:
            return open(dest, encoding='utf-8').read()
        except Exception:
            pass
    if os.path.exists(dest + '.404'):
        return 'empty'
    h = dict(HDRS)
    h['Referer'] = referer
    last = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers=h)
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
            try:
                text = data.decode('utf-8')
            except UnicodeDecodeError:
                text = data.decode('cp1252', 'replace')
            tmp = dest + '.part'
            with open(tmp, 'w', encoding='utf-8') as f:
                f.write(text)
            os.replace(tmp, dest)
            return text
        except urllib.error.HTTPError as e:
            if e.code == 404:
                # pas de contenu pour ce verset (ex. /Hadiths/S.V sans hadith)
                open(dest + '.404', 'w').close()
                return 'empty'
            last = e
            time.sleep(1.5 * (attempt + 1))
        except Exception as e:                     # noqa: BLE001
            last = e
            time.sleep(1.5 * (attempt + 1))
    log('  !! FETCH %s : %s' % (url, last))
    return None


# ── parsing tafsirs ─────────────────────────────────────────────────────────
DT_RE = re.compile(
    r'<dt>\s*<a[^>]*><span class="verse__reference">[^<]*</span></a>\s*(.*?)</dt>',
    re.S)
DL_RE = re.compile(r'<dl class="boxed">(.*?)</dl>', re.S)
DD_RE = re.compile(r'<dd[^>]*>(.*?)</dd>', re.S)
TAG_RE = re.compile(r'<[^>]+>')


def clean(t):
    t = TAG_RE.sub(' ', t)
    t = htmlmod.unescape(t)
    return ' '.join(t.split())


def parse_tafsirs(page):
    """→ [{s: auteur-court, n: oeuvre complète, x: texte}, …]"""
    out = []
    for block in DL_RE.findall(page):
        dt = DT_RE.search(block)
        if not dt:
            continue
        raw_name = ' '.join(htmlmod.unescape(re.sub(r'<[^>]+>', ' ', dt.group(1))).split())
        # "Jalal - Al-Jalalayn" → s=Jalal, n=Al-Jalalayn ; sinon s=n=name
        if ' - ' in raw_name:
            s, n = raw_name.split(' - ', 1)
        else:
            s = n = raw_name
        paras = [clean(d) for d in DD_RE.findall(block)]
        paras = [p for p in paras if p]
        if not paras:
            continue
        out.append({'s': s.strip(), 'n': n.strip(), 'x': '\n\n'.join(paras)})
    return out


# ── parsing hadiths ─────────────────────────────────────────────────────────
REFNAME_RE = re.compile(r'<div class="hadith__reference-name"[^>]*>(.*?)</div>\s*'
                        r'<div class="hadith__reference-value"[^>]*>(.*?)</div>', re.S)
HREF_RE = re.compile(r'href="(/Hadith/[^"]+)"', re.S)
P_RE = re.compile(r'<p class="highlightable">(.*?)</p>', re.S)
VERSES_RE = re.compile(r'class="hadith__reference-verse-numbers".*?</ul>', re.S)
LI_RE = re.compile(r'<li[^>]*>\s*(?:<a[^>]*>)?([\d.]+)')


def parse_hadiths(page):
    """→ [{c: collection, r: réf, u: lien, x: EN, ar: AR, v: versets liés}, …]"""
    out = []
    parts = re.split(r'<div class="hadith">', page)[1:]
    for part in parts:
        # zone EN = tout avant le div arabic ; zone AR = ce qui suit
        if '<div class="hadith__text arabic"' in part:
            en_zone, ar_rest = part.split('<div class="hadith__text arabic"', 1)
        else:
            en_zone, ar_rest = part, ''
        # texte EN : le div exact class="hadith__text" (sans " arabic")
        en = ''
        i = en_zone.find('<div class="hadith__text"')
        if i >= 0:
            ps = [clean(p) for p in P_RE.findall(en_zone[i:])]
            en = '\n\n'.join(p for p in ps if p)
        # texte AR : paragraphes de la zone arabic
        ar = ''
        if ar_rest:
            ps = [clean(p) for p in P_RE.findall(ar_rest)]
            ar = '\n\n'.join(p for p in ps if p)
        if not en:
            continue
        refs = [(clean(a), clean(b)) for a, b in REFNAME_RE.findall(en_zone)]
        coll, num = '', ''
        for name, val in refs:
            ln = name.lower()
            if ln == 'collection':
                coll = val
            elif 'reference' in ln or 'translation' in ln:
                if not num and val:
                    num = val
        link = HREF_RE.search(en_zone)
        vsearch = VERSES_RE.search(en_zone)
        verse_links = LI_RE.findall(vsearch.group(0)) if vsearch else []
        out.append({
            'c': coll or 'Hadith',
            'r': num or '',
            'u': ('https://quranx.com' + link.group(1)) if link else '',
            'x': en,
            'ar': ar,
            'v': verse_links,
        })
    return out


def do_verse(s, v):
    global _done, _err
    url_base = 'https://quranx.com'
    ref = '%d.%d' % (s, v)
    tp = os.path.join(T_DIR, '%d_%d.html' % (s, v))
    hp = os.path.join(H_DIR, '%d_%d.html' % (s, v))
    ok = True
    tp_ = fetch(url_base + '/Tafsirs/' + ref, url_base + '/' + ref, tp)
    hp_ = fetch(url_base + '/Hadiths/' + ref, url_base + '/' + ref, hp)
    if tp_ is None or hp_ is None:
        with _lock:
            _err += 1
        ok = False
    with _lock:
        _done += 1
        if _done % 250 == 0:
            el = time.time() - _t0
            log('[%5d/6236] %5.1f versets/min — erreurs %d' %
                (_done, _done * 60.0 / max(el, 1), _err))
    time.sleep(0.15)   # politeness : ~4 req/s max par domaine
    return ok


def main():
    for d in (T_DIR, H_DIR):
        os.makedirs(d, exist_ok=True)
    counts = verse_counts()
    jobs = [(int(s), v) for s, n in counts.items() for v in range(1, n + 1)]
    log('build_quranx : %d versets à couvrir' % len(jobs))
    with cf.ThreadPoolExecutor(max_workers=8) as ex:
        futs = [ex.submit(do_verse, s, v) for s, v in jobs]
        for f in cf.as_completed(futs):
            f.result()

    # ── agrégation depuis le cache ──
    tafsir_by = {}
    hadith_by = {}
    nver_t = nver_h = 0
    for s in sorted(counts, key=int):
        s = int(s)
        tmap, hmap = {}, {}
        for v in range(1, counts[s] + 1):
            tp = os.path.join(T_DIR, '%d_%d.html' % (s, v))
            if os.path.exists(tp) and os.path.getsize(tp) > 500:
                try:
                    items = parse_tafsirs(open(tp, encoding='utf-8').read())
                except Exception as e:                       # noqa: BLE001
                    log('  !! PARSE tafsir %d:%d %s' % (s, v, e))
                    items = []
                if items:
                    tmap[str(v)] = items
            hp = os.path.join(H_DIR, '%d_%d.html' % (s, v))
            if os.path.exists(hp) and os.path.getsize(hp) > 500:
                try:
                    items = parse_hadiths(open(hp, encoding='utf-8').read())
                except Exception as e:                       # noqa: BLE001
                    log('  !! PARSE hadith %d:%d %s' % (s, v, e))
                    items = []
                if items:
                    hmap[str(v)] = items
        if tmap:
            tafsir_by[s] = tmap
            nver_t += len(tmap)
        if hmap:
            hadith_by[s] = hmap
            nver_h += len(hmap)
        # écriture incrémentale par sourate
        if tmap:
            p = os.path.join(OUT, 'qtafsir')
            os.makedirs(p, exist_ok=True)
            with open(os.path.join(p, 's%d.js' % s), 'w', encoding='utf-8') as f:
                f.write('(window.__qtafsirX=window.__qtafsirX||{})[%d]=' % s)
                json.dump(tmap, f, ensure_ascii=False, separators=(',', ':'))
                f.write(';')
        if hmap:
            p = os.path.join(OUT, 'qhadith')
            os.makedirs(p, exist_ok=True)
            with open(os.path.join(p, 's%d.js' % s), 'w', encoding='utf-8') as f:
                f.write('(window.__qhadithX=window.__qhadithX||{})[%d]=' % s)
                json.dump(hmap, f, ensure_ascii=False, separators=(',', ':'))
                f.write(';')

    idx = {
        'v': 1,
        'surahs': [{'p': s,
                    'nt': sum(len(m) for m in tafsir_by.get(s, {}).values()),
                    'nv': len(tafsir_by.get(s, {})),
                    'nh': sum(len(m) for m in hadith_by.get(s, {}).values()),
                    'hv': len(hadith_by.get(s, {}))}
                   for s in sorted(counts, key=int)],
        'versets_tafsir': nver_t,
        'versets_hadith': nver_h,
    }
    with open(os.path.join(OUT, 'qtafsir_idx.json'), 'w', encoding='utf-8') as f:
        json.dump(idx, f, ensure_ascii=False)
    log('OK — versets avec tafsirs : %d / avec hadiths : %d' % (nver_t, nver_h))
    log('erreurs de fetch : %d' % _err)


if __name__ == '__main__':
    main()
