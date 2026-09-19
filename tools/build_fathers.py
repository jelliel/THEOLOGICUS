#!/usr/bin/env python3
"""Build a local offline corpus of the Church Fathers from newadvent.org.

Measured structure (2026-09-19, verified on 419 work pages + 40 chapter pages):
  * https://www.newadvent.org/fathers/               -> index, 419 works, 69 authors
  * https://www.newadvent.org/fathers/<NNWW>.htm     -> work page, NNWW = NN(group) + WW(work)
      - LEAF  : the whole text is on the page (315 of 419)
      - TOC   : only a table of contents; the text lives on child pages whose id
                starts with the work id and is longer (104 of 419 -> 2857 children)
      - child ids are 5 or 6 digits depending on the work (1101 -> 110101,
        3402 -> 34021). Rule used: child page id startswith(work id) and longer.
      - children are always leaves (no third level was observed)
  * inside a page:  <h1> title, <h2>/<h3> sections, <p> paragraphs
  * the tail block <div class="pub"> holds the "About this page" boilerplate
    (source / translator / copyright) and is dropped.

The whole corpus is ~200 MB of text, far too big for an APK: only CORE below
is built. Output mirrors the Summa layout so the app loader is identical.

Usage:
  python tools/build_fathers.py --probe 110101   # parse one page and print it
  python tools/build_fathers.py --build          # build fathers/
  python tools/build_fathers.py --build --limit 5
"""
import re
import os
import sys
import json
import html
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'tools', '.fathers_cache')
OUT = os.path.join(ROOT, 'fathers')
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) THEOLOGICUS/1.0'}
DELAY = 0.45
RETRIES = 3

# ---------------------------------------------------------------- curated core
# 118 works: apostolic fathers, apologists, the great dogmatic treatises,
# the councils. Chosen for theological weight, not for completeness.
CORE = [
    # Apostolic fathers
    '0101', '0102', '0124', '0125', '0136', '0201', '0714', '1010', '1011',
    '0104', '0105', '0106', '0107', '0108', '0109', '0110', '0123',
    # Apologists
    '0126', '0127', '0128', '0131', '0202', '0204', '0205', '0206', '0410', '1012',
    # Against heresies
    '0103', '0134', '0501', '0521',
    # Tertullian
    '0301', '0311', '0317', '0315', '0316', '0321', '0310', '0320', '0322',
    # Alexandria
    '0412', '0416', '0414', '0207', '0208', '0209', '0210',
    # Cyprian / Novatian
    '0507', '0506', '0511', '0508',
    # Athanasius
    '2801', '2802', '2809', '2810', '2811', '2816', '2817', '2821',
    # Cappadocians
    '3203', '3201', '3102', '2901', '2903', '2905', '2908', '2914', '2915',
    # Chrysostom
    '2001', '1922', '2401',
    # Jerome / Rufinus
    '3001', '3007', '2711',
    # Augustine
    '1101', '1201', '1301', '1302', '1202', '1401', '1502', '1503', '1510',
    '1701', '1312',
    # Other Latin and Greek fathers
    '3101', '3302', '3304', '3402', '3404', '3405', '3603', '3604', '3506',
    '3509', '3601', '0701',
    # Church history
    '2501', '2502', '2601',
    # Ecumenical and ancient councils
    '3801', '3802', '3803', '3804', '3805', '3806', '3808', '3809', '3810',
    '3811', '3812', '3813', '3814', '3815', '3816', '3817', '3818', '3819',
]

# French aliases used to resolve a citation written in French to a work id.
# Left side is normalised (lowercase, accents kept, punctuation dropped).
FR = {
    '0101': ['epitre a diagnete', 'a diagnete'],
    '0102': ['martyre de polycarpe'],
    '0103': ['contre les heresies', 'adversus haereses', 'contre les hérésies'],
    '0104': ['aux ephesiens', 'epitre aux ephesiens'],
    '0105': ['aux magnesiens'],
    '0106': ['aux tralliens'],
    '0107': ['aux romains'],
    '0108': ['aux philadelphiens'],
    '0109': ['aux smyrniotes'],
    '0110': ['a polycarpe'],
    '0123': ['martyre d ignace', 'martyre de saint ignace'],
    '0124': ['epitre de barnabe', 'barnabe'],
    '0126': ['premiere apologie', 'apologie'],
    '0127': ['seconde apologie'],
    '0128': ['dialogue avec tryphon', 'dialogue avec trypho'],
    '0131': ['fragments sur la resurrection'],
    '0136': ['aux philippiens'],
    '0201': ['le pasteur', 'pasteur d hermas', 'berger d hermas', 'hermas'],
    '0202': ['aux grecs'],
    '0204': ['a autolycos', 'theophile a autolycus'],
    '0205': ['supplique pour les chretiens', 'legation pour les chretiens'],
    '0206': ['resurrection des morts'],
    '0207': ['quel riche sera sauve'],
    '0208': ['exhortation aux gentils', 'protreptique'],
    '0209': ['le pedagogue'],
    '0210': ['stromates'],
    '0301': ['apologetique', 'apologeticum'],
    '0310': ['traite de l ame', 'de anima'],
    '0311': ['prescription contre les heretiques', 'de praescriptione'],
    '0315': ['la chair du christ', 'de carne christi'],
    '0316': ['resurrection de la chair', 'de resurrectione carnis'],
    '0317': ['contre praxeas'],
    '0320': ['penitence'],
    '0321': ['bapteme', 'du bapteme', 'de baptismo'],
    '0322': ['de la priere', 'de oratione'],
    '0410': ['octavius'],
    '0412': ['des principes', 'de principiis', 'traite des principes'],
    '0414': ['origene a africanus'],
    '0416': ['contre celse', 'contra celsum'],
    '0501': ['refutation de toutes les heresies'],
    '0506': ['lettres de cyprien', 'epitres de cyprien'],
    '0507': ['traites de cyprien'],
    '0508': ['septieme concile de carthage'],
    '0511': ['traite de la trinite'],
    '0521': ['contre noet', 'contre l heresie de noet'],
    '0701': ['institutions divines'],
    '0714': ['didache', 'doctrine des douze apotres', 'didache'],
    '1010': ['premiere epitre de clement', 'clement de rome', '1 clement'],
    '1011': ['seconde epitre de clement', '2 clement'],
    '1012': ['apologie d aristide'],
    '1101': ['confessions', 'les confessions'],
    '1201': ['cite de dieu', 'la cite de dieu', 'de civitate dei'],
    '1202': ['doctrine chretienne', 'de doctrina christiana'],
    '1301': ['la trinite', 'de la trinite', 'de trinitate'],
    '1302': ['enchiridion', 'manuel', 'foi esperance charite'],
    '1312': ['du mensonge', 'mentir'],
    '1401': ['moeurs de l eglise catholique'],
    '1502': ['esprit et la lettre', 'de l esprit et de la lettre'],
    '1503': ['nature et grace', 'de la nature et de la grace'],
    '1510': ['grace et libre arbitre', 'de la grace et du libre arbitre'],
    '1701': ['traite sur jean', 'commentaire sur jean', 'homelies sur jean'],
    '1922': ['sacerdoce', 'du sacerdoce'],
    '2001': ['homelies sur matthieu', 'sur matthieu'],
    '2401': ['homelies sur jean'],
    '2501': ['histoire ecclesiastique'],
    '2502': ['vie de constantin'],
    '2601': ['histoire ecclesiastique de socrate'],
    '2711': ['commentaire sur le symbole des apotres', 'symbole des apotres'],
    '2801': ['contre les paiens', 'contre les gentils'],
    '2802': ['incarnation du verbe', 'de l incarnation', 'sur l incarnation'],
    '2809': ['decrets', 'de decretis'],
    '2810': ['sentence de denys'],
    '2811': ['vie de saint antoine', 'antoine'],
    '2816': ['quatre discours contre les ariens', 'contre les ariens'],
    '2817': ['des synodes', 'de synodis'],
    '2821': ['profession de foi'],
    '2901': ['contre eunome'],
    '2903': ['le saint esprit', 'du saint esprit', 'contre macedonius'],
    '2905': ['il n y a pas trois dieux', 'a ablalius', 'a ablable'],
    '2908': ['grand catechisme', 'catechetique', 'discours catechetique'],
    '2914': ['creation de l homme', 'de la creation de l homme'],
    '2915': ['ame et la resurrection', 'de l ame et de la resurrection'],
    '3001': ['lettres de jerome', 'lettres de saint jerome'],
    '3007': ['virginite perpetuelle de marie'],
    '3101': ['catecheses', 'lectures catechetiques'],
    '3102': ['discours theologiques', 'orations de nazianze'],
    '3201': ['hexaemeron', 'homelies sur l hexaemeron'],
    '3203': ['traite du saint esprit', 'de spiritu sancto'],
    '3302': ['la trinite de hilaire', 'de trinitate hilaire'],
    '3304': ['exposition de la foi', 'de fide orthodoxa', 'foi orthodoxe'],
    '3402': ['le saint esprit d ambroise'],
    '3404': ['de la foi', 'de fide', 'foi chretienne'],
    '3405': ['des mysteres', 'de mysteriis'],
    '3506': ['commonitoire', 'memento'],
    '3509': ['incarnation du seigneur', 'contre nestorius'],
    '3601': ['regle pastorale', 'pastorale'],
    '3603': ['sermons de leon', 'sermons du pape leon'],
    '3604': ['lettres de leon', 'tome a flavien'],
    '3801': ['nicee', 'nicee i', 'concile de nicee', 'symbole de nicee'],
    '3808': ['constantinople i', 'concile de constantinople'],
    '3810': ['ephese', 'concile d ephese'],
    '3811': ['chalcedoine', 'concile de chalcedoine'],
    '3812': ['constantinople ii'],
    '3813': ['constantinople iii'],
    '3819': ['nicee ii'],
}


# ------------------------------------------------------------------- plumbing
def fetch(page, use_cache=True):
    p = os.path.join(CACHE, page + '.htm')
    if use_cache and os.path.exists(p):
        with open(p, 'r', encoding='utf-8', errors='replace') as f:
            return f.read()
    url = 'https://www.newadvent.org/fathers/%s.htm' % page
    for i in range(RETRIES):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=40) as r:
                raw = r.read().decode('utf-8', 'replace')
            os.makedirs(CACHE, exist_ok=True)
            with open(p, 'w', encoding='utf-8') as f:
                f.write(raw)
            time.sleep(DELAY)
            return raw
        except Exception as e:
            if i == RETRIES - 1:
                print('  FAIL %s %s' % (page, e))
                return None
            time.sleep(2.0 * (i + 1))
    return None


def fetch_index():
    p = os.path.join(CACHE, 'INDEX.htm')
    if os.path.exists(p):
        with open(p, 'r', encoding='utf-8', errors='replace') as f:
            return f.read()
    req = urllib.request.Request('https://www.newadvent.org/fathers/', headers=UA)
    with urllib.request.urlopen(req, timeout=40) as r:
        raw = r.read().decode('utf-8', 'replace')
    os.makedirs(CACHE, exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f:
        f.write(raw)
    return raw


def page_title(raw):
    m = re.search(r'<title>(.*?)</title>', raw, re.S | re.I)
    if not m:
        return ''
    t = re.sub(r'\s+', ' ', html.unescape(m.group(1))).strip()
    t = re.sub(r'\s*[-|]\s*(New Advent|CHURCH FATHERS).*$', '', t, flags=re.I)
    return t.strip()


def children_of(raw, page):
    out = set()
    for m in re.finditer(r'fathers/(\d{3,8})\.htm', raw):
        cid = m.group(1)
        if cid != page and cid.startswith(page) and len(cid) > len(page):
            out.add(cid)
    return sorted(out, key=lambda x: (len(x), x))


SKIP_PARA = re.compile(r'^(please help support|this text is part of|'
                       r'buy the|click here)', re.I)


def parse_page(raw):
    """-> {'t': h1 title, 'sections': [{'t': heading, 'p': [para, ...]}]}"""
    m = re.search(r'<h1', raw, re.I)
    if not m:
        return None
    start = m.start()
    end = len(raw)
    for pat in (r'<div class="pub"', r"<div class='pub'"):
        k = re.search(pat, raw[start:], re.I)
        if k:
            end = start + k.start()
            break
    if end <= start:
        end = len(raw)
    frag = raw[start:end]

    frag = re.sub(r'<script.*?</script>', '', frag, flags=re.S | re.I)
    frag = re.sub(r'<style.*?</style>', '', frag, flags=re.S | re.I)
    frag = re.sub(r'<ins\b.*?</ins>', '', frag, flags=re.S | re.I)
    frag = re.sub(r'<br\s*/?>', '\n', frag, flags=re.I)
    for tag in ('h1', 'h2', 'h3', 'p', 'blockquote', 'li', 'div'):
        frag = re.sub(r'<%s[^>]*>' % tag, '\n@@%s@@\n' % tag.upper(), frag, flags=re.I)
    frag = re.sub(r'<[^>]+>', '', frag)
    frag = html.unescape(frag).replace('\xa0', ' ')

    title, sections = '', []
    cur = None
    parts = re.split(r'@@(H1|H2|H3|P|BLOCKQUOTE|LI|DIV)@@', frag)
    for i in range(1, len(parts) - 1, 2):
        kind, body = parts[i], parts[i + 1]
        text = re.sub(r'\s+', ' ', body).strip()
        if not text:
            continue
        if kind == 'H1':
            if not title:
                title = text
            continue
        if kind in ('H2', 'H3'):
            if re.match(r'^about this page$', text, re.I):
                cur = None
                continue
            cur = {'t': text, 'p': []}
            sections.append(cur)
            continue
        if kind in ('P', 'BLOCKQUOTE', 'LI', 'DIV'):
            if SKIP_PARA.match(text) or 'gumroad' in text:
                continue
            if cur is None:
                cur = {'t': '', 'p': []}
                sections.append(cur)
            cur['p'].append(text)
    return {'t': title, 's': [s for s in sections if s['p'] or s['t']]}


def build_work(wid, author, title, verbose=True):
    raw = fetch(wid)
    if raw is None:
        return None
    kids = children_of(raw, wid)
    pages = kids if kids else [wid]
    chapters = []
    for pid in pages:
        praw = fetch(pid)
        if praw is None:
            continue
        parsed = parse_page(praw)
        if not parsed or not parsed['s']:
            continue
        chapters.append({'i': pid, 't': parsed['t'], 's': parsed['s']})
    if not chapters:
        return None
    work = {'id': wid, 'a': author, 't': title or page_title(raw), 'c': chapters}
    if verbose:
        nsec = sum(len(c['s']) for c in chapters)
        nch = sum(len(s['p']) for c in chapters for s in c['s'])
        print('  %-5s %-34s %2d pgs %4d sec %5d par'
              % (wid, work['t'][:34], len(chapters), nsec, nch))
    return work


def slice_js(work):
    return ('window.__fathersWorks = window.__fathersWorks || {};\n'
            'window.__fathersWorks["%s"] = %s;\n'
            % (work['id'], json.dumps(work, ensure_ascii=False, separators=(',', ':'))))


def catalogue():
    """author/work list straight from the index page (419 entries)."""
    raw = fetch_index()
    m = re.search(r'<body[^>]*>(.*?)</body>', raw, re.S)
    b = m.group(1) if m else raw
    out = {}
    for pm in re.finditer(r'<p>(.*?)</p>', b, re.S):
        blk = pm.group(1)
        am = re.search(r'<strong>(.*?)</strong>', blk, re.S)
        if not am:
            continue
        author = re.sub(r'\s+', ' ', html.unescape(
            re.sub(r'<[^>]+>', '', am.group(1)))).strip()
        for wm in re.finditer(r'fathers/(\d{4})\.htm"[^>]*>(.*?)</a>', blk, re.S):
            wid = wm.group(1)
            title = re.sub(r'\s+', ' ', html.unescape(
                re.sub(r'<[^>]+>', '', wm.group(2)))).strip()
            out[wid] = (author, title)
    return out


def main():
    argv = sys.argv[1:]
    probe = '--probe' in argv
    limit = None
    if '--limit' in argv:
        limit = int(argv[argv.index('--limit') + 1])

    if probe:
        pid = argv[argv.index('--probe') + 1]
        raw = fetch(pid)
        r = parse_page(raw)
        print(json.dumps(r, ensure_ascii=False, indent=1)[:3000])
        return

    cat = catalogue()
    os.makedirs(OUT, exist_ok=True)
    ids = [x for x in CORE if x in cat]
    missing = [x for x in CORE if x not in cat]
    if missing:
        print('WARNING ids not in the index:', missing)
    if limit:
        ids = ids[:limit]
    print('building %d works' % len(ids))

    index, total, built = {}, 0, 0
    for n, wid in enumerate(ids):
        author, title = cat[wid]
        w = build_work(wid, author, title)
        if not w:
            continue
        with open(os.path.join(OUT, 'f%s.js' % wid), 'w', encoding='utf-8') as f:
            f.write(slice_js(w))
        size = os.path.getsize(os.path.join(OUT, 'f%s.js' % wid))
        index[wid] = {'a': author, 't': w['t'], 'n': len(w['c'])}
        total += size
        built += 1
        if n % 20 == 0:
            print('  .. %d/%d  %.1f MB' % (n, len(ids), total / 1e6), flush=True)

    names = {}
    for wid, (author, title) in cat.items():
        if wid not in index:
            continue
        for key in [title.lower(), (author.split('(')[0].strip() + ' ' + title).lower()]:
            key = re.sub(r'[^a-z0-9à-ÿœ ]+', ' ', key)
            key = re.sub(r'\s+', ' ', key).strip()
            if len(key) > 3:
                names.setdefault(key, wid)
    for wid, aliases in FR.items():
        if wid in index:
            for a in aliases:
                names.setdefault(a, wid)

    with open(os.path.join(OUT, 'index.js'), 'w', encoding='utf-8') as f:
        f.write('window.__fathersIndex = %s;\n'
                % json.dumps(index, ensure_ascii=False, separators=(',', ':')))
    with open(os.path.join(OUT, 'names.js'), 'w', encoding='utf-8') as f:
        f.write('window.__fathersNames = %s;\n'
                % json.dumps(names, ensure_ascii=False, separators=(',', ':')))

    print('works built: %d' % built)
    print('corpus size: %.1f MB (%d files)'
          % (total / 1e6, built + 2))
    print('name aliases: %d' % len(names))


if __name__ == '__main__':
    main()
