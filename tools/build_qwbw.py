# -*- coding: utf-8 -*-
"""
build_qwbw.py — THEOLOGICUS v183 (2.0.325)
Construit, par verset coranique (S:V), le lexique arabe MOT À MOT du
Quranic Arabic Corpus (https://corpus.quran.com/wordbyword.jsp?chapter=S&verse=V).

Structure d'une ligne <tr> de la table .morphologyTable (recon 2026-10-01) :
  <td><span class="location">(S:V:W)</span><br/>
      <a href="/qurandictionary.jsp?q=Alh#...">al-lahu</a>  ou <span class="phonetic">lā</span>
      <br/>Allah -</td>
  <td class="ic">…<img src="/wordimage?id=5174" /></td>
  <td class="col3"><b class="segBlue">PN</b> – nominative proper noun → Allah
      <div class="arabicGrammar">لفظ الجلالة مرفوع</div></td>

Sortie : tradition/qwbw/s<p>.js
  (window.__qwbwX=window.__qwbwX||{})[p]={"<v>":[{w,tr,g,seg,d,ar,q,img}, …]}

Reprise : cache disque corpus/cache/S_V.html.
"""
import concurrent.futures as cf
import html as htmlmod
import json
import os
import re
import threading
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'corpus', 'cache')
OUT = os.path.join(ROOT, 'tradition')

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36')
HDRS = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
}

_lock = threading.Lock()
_done = 0
_err = 0
_t0 = time.time()
_ban_until = [0.0]   # epoch : pause WAF commune a tous les workers


def log(msg):
    with _lock:
        print(msg, flush=True)


def verse_counts():
    src = open(os.path.join(ROOT, 'quran', 'versification.js'),
               encoding='utf-8').read()
    m = re.search(r'window\.__quranVerseCounts\s*=\s*(\{.*?\});', src, re.S)
    return json.loads(m.group(1))


def fetch(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 500:
        try:
            return open(dest, encoding='utf-8').read()
        except Exception:
            pass
    if os.path.exists(dest + '.404'):
        return 'empty'
    while time.time() < _ban_until[0]:
        time.sleep(5)
    last = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers=dict(HDRS))
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
                open(dest + '.404', 'w').close()
                return 'empty'
            if e.code in (403, 429):
                if _ban_until[0] < time.time():
                    _ban_until[0] = time.time() + 600
                return None
            last = e
            time.sleep(1.5 * (attempt + 1))
        except Exception as e:                              # noqa: BLE001
            last = e
            time.sleep(1.5 * (attempt + 1))
    return None   # echec apès retries : compté via _err, pas de print worker


LOC_RE = re.compile(r'<span class="location">\((\d+):(\d+):(\d+)\)</span>')
LEX_RE = re.compile(r'href="/qurandictionary\.jsp\?q=([^"&#]+)')
PHON_RE = re.compile(r'<span class="phonetic">(.*?)</span>', re.S)
IMG_RE = re.compile(r'/wordimage\?id=(\d+)')
SEG_RE = re.compile(r'<b class="seg[A-Za-z]+">(.*?)</b>(.*?)(?=<div class="arabicGrammar">|</td>|$)', re.S)
ARGRAM_RE = re.compile(r'<div class="arabicGrammar">(.*?)</div>', re.S)
TAG_RE = re.compile(r'<[^>]+>')


def clean(t):
    t = TAG_RE.sub(' ', t)
    t = htmlmod.unescape(t)
    return ' '.join(t.split())


def parse_wbw(page):
    """→ [{w, tr, g, seg, d, ar, q, img}, …] pour le verset affiché."""
    rows = re.split(r'<tr><td><span class="location">', page)[1:]
    out = []
    for row in rows:
        m = LOC_RE.search('<tr><td><span class="location">' + row)
        if not m:
            continue
        _s, _v, w = int(m.group(1)), int(m.group(2)), int(m.group(3))
        # translittération : texte du lien lexique, sinon span.phonétique
        tr = ''
        lm = re.search(r'<a href="/qurandictionary\.jsp\?q=[^"]*"[^>]*>(.*?)</a>', row, re.S)
        if lm:
            tr = clean(lm.group(1))
        if not tr:
            pm = PHON_RE.search(row)
            if pm:
                tr = clean(pm.group(1))
        # gloss : texte de la cellule 1 hors location/lien/phonétique
        cell1 = row.split('</td>')[0]
        c1 = re.sub(r'^\s*\(\d+:\d+:\d+\)\s*</span>', '', cell1)
        c1 = re.sub(r'<a[^>]*>.*?</a>', '', c1, flags=re.S)
        c1 = re.sub(r'<span class="phonetic">.*?</span>', '', c1, flags=re.S)
        gloss = clean(c1).lstrip('-').strip()
        gloss = re.sub(r'^[-\s]+', '', gloss)
        lex = LEX_RE.search(row)
        img = IMG_RE.search(row)
        seg, desc = '', ''
        sm = SEG_RE.search(row)
        if sm:
            seg = clean(sm.group(1))
            desc = clean(sm.group(2))
            desc = re.sub(r'^[-\s–]+', '', desc)
        ar = ''
        am = ARGRAM_RE.search(row)
        if am:
            ar = clean(am.group(1))
        out.append({
            'w': w,
            'tr': tr,
            'g': gloss,
            'seg': seg,
            'd': desc,
            'ar': ar,
            'q': (lex.group(1) if lex else ''),
            'img': int(img.group(1)) if img else 0,
        })
    return out


def do_verse(s, v):
    # PAS de print / lock ici : un print de worker qui bloque sur le pipe
    # stdout en gardant _lock deadlockait tout le pool (gel a done=250).
    global _done, _err
    url = 'https://corpus.quran.com/wordbyword.jsp?chapter=%d&verse=%d' % (s, v)
    dest = os.path.join(CACHE, '%d_%d.html' % (s, v))
    if os.path.exists(dest) and os.path.getsize(dest) > 500:
        _done += 1          # deja en cache : ni fetch ni delai
        return True
    page = fetch(url, dest)
    if page is None:
        _err += 1
    _done += 1
    time.sleep(0.3)
    return page is not None


def main():
    os.makedirs(CACHE, exist_ok=True)
    counts = verse_counts()
    jobs = [(int(s), v) for s, n in counts.items() for v in range(1, n + 1)]
    log('build_qwbw : %d versets à couvrir' % len(jobs))
    prog = open(os.path.join(CACHE, '..', 'build_qwbw_progress.log'), 'a', encoding='utf-8')
    def prog_log(m):
        prog.write('[%s] %s\n' % (time.strftime('%H:%M:%S'), m))
        prog.flush()
    with cf.ThreadPoolExecutor(max_workers=2) as ex:
        futs = [ex.submit(do_verse, s, v) for s, v in jobs]
        last = 0
        for f in cf.as_completed(futs):
            f.result()
            if _done - last >= 250:
                last = _done
                el = time.time() - _t0
                prog_log('[%5d/6236] %5.1f versets/min — erreurs %d'
                         % (_done, _done * 60.0 / max(el, 1), _err))
    prog.close()

    total_w = 0
    nver = 0
    for s in sorted(counts, key=int):
        s = int(s)
        wmap = {}
        for v in range(1, counts[str(s)] + 1):
            dest = os.path.join(CACHE, '%d_%d.html' % (s, v))
            if not (os.path.exists(dest) and os.path.getsize(dest) > 500):
                continue
            try:
                words = parse_wbw(open(dest, encoding='utf-8').read())
            except Exception as e:                          # noqa: BLE001
                log('  !! PARSE wbw %d:%d %s' % (s, v, e))
                words = []
            words = [x for x in words if x['tr'] or x['g']]
            if words:
                wmap[str(v)] = words
                total_w += len(words)
        if wmap:
            p = os.path.join(OUT, 'qwbw')
            os.makedirs(p, exist_ok=True)
            with open(os.path.join(p, 's%d.js' % s), 'w', encoding='utf-8') as f:
                f.write('(window.__qwbwX=window.__qwbwX||{})[%d]=' % s)
                json.dump(wmap, f, ensure_ascii=False, separators=(',', ':'))
                f.write(';')
            nver += len(wmap)
    with open(os.path.join(OUT, 'qwbw_idx.json'), 'w', encoding='utf-8') as f:
        json.dump({'v': 1, 'versets': nver, 'mots': total_w}, f, ensure_ascii=False)
    log('OK — versets avec lexique : %d, mots au total : %d' % (nver, total_w))
    log('erreurs de fetch : %d' % _err)


if __name__ == '__main__':
    main()
