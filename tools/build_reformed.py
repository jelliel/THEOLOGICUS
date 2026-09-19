#!/usr/bin/env python3
"""Build a local offline corpus of Reformation and Protestant texts from CCEL.

Measured structure (2026-09-19, verified on 48 works and the A-Z index):
  * https://ccel.org/index/author/<A..Z>          -> 1409 works, 454 authors
  * https://ccel.org/ccel/<author>/<work>         -> work page; it links
    /ccel/<letter>/<author>/<work>.xml            (letter = first letter of
    the author id). Not every work has an XML.
  * the XML is ThML: Dublin Core metadata in <ThML.head> (Title, Creator,
    **Rights**), then <ThML.body> with
        <div1 title="...">  book / part
          <div2 title="...">  chapter
            <div3 title="...">  section
              <h1..h6>, <p>
    Facsimile pages are <table><img>; <pb> marks page breaks.

Rights: CCEL states that editions are based on US public-domain books and
that the few books under another publisher's copyright "are noted on the
book information page". Here that note lives in <DC.Rights>: either
"Public Domain" or empty (= nothing noted, therefore public domain).
The builder refuses any work whose DC.Rights is set to something else.

Usage:
  python tools/build_reformed.py --probe luther/bondage
  python tools/build_reformed.py --build
  python tools/build_reformed.py --build --limit 4
"""
import re
import os
import sys
import json
import html
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'tools', '.ccel_cache')
OUT = os.path.join(ROOT, 'reformed')
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) THEOLOGICUS/1.0'}
DELAY = 0.3
RETRIES = 3

# (author, work, split level or None)
CORE = [
    # ── Symbolique : les confessions de foi ──
    ('schaff', 'creeds3', 'div2'),          # Symboles de la Réforme (Schaff vol. III)
    ('brannan', 'hstcrcon', 'div1'),        # Confessions historiques
    ('schaff', 'creeds2', None),            # Symboles anciens (Schaff vol. II)
    ('melanchthon', 'apology', None),       # Apologie de la Confession d'Augsbourg
    ('luther', 'smalcald', None),           # Articles de Smalkalde
    ('luther', 'largecatechism', None),     # Grand Catéchisme
    ('luther', 'smallcat', None),           # Petit Catéchisme
    ('cranmer', 'doctrine', None),
    ('knox', 'prayer', None),
    # ── Luther ──
    ('luther', 'bondage', None),            # Du Serf Arbitre
    ('luther', 'galatians', None),
    ('luther', 'christianliberty', None),   # De la liberté du chrétien
    ('luther', 'first_prin', None),         # 95 thèses
    ('luther', 'good_works', None),
    ('luther', 'prefacetoromans', None),
    ('luther', 'tabletalk', None),
    # ── Calvin ──
    ('calvin', 'institutes', None),         # L'Institution
    ('calvin', 'chr_life', None),
    ('calvin', 'prayer', None),
    # ── Réformés et puritains ──
    ('owen', 'deathofdeath', None),
    ('owen', 'just', None),
    ('owen', 'communion', None),
    ('owen', 'mort', None),
    ('owen', 'temptation', None),
    ('owen', 'trinity', None),
    ('owen', 'glory', None),
    ('owen', 'display', None),
    ('owen', 'indwellingsin', None),
    ('baxter', 'saints_rest', None),
    ('baxter', 'pastor', None),
    ('baxter', 'unconverted', None),
    ('bunyan', 'pilgrim', None),
    ('bunyan', 'holy_war', None),
    ('bunyan', 'grace', None),
    # ── Après la Réforme ──
    ('edwards', 'affections', None),
    ('edwards', 'will', None),
    ('edwards', 'sermons', None),
    ('edwards', 'treatiseongrace', None),
    # ── Anglican, méthodiste, baptiste ──
    ('wesley', 'perfection', None),
    ('spurgeon', 'grace', None),
    ('spurgeon', 'catechism', None),
    # ── Théologie systématique ──
    ('hodge', 'theology1', None),
    ('hodge', 'theology2', None),
    ('hodge', 'theology3', None),
    ('berkhof', 'systematictheology', None),
    ('berkhof', 'summary', None),
    ('bavinck', 'revelation', None),
]

# Titres de division qui ne sont pas du contenu.
# NB : « title page » n'est pas ancre, certains recueils l'intitulent
# « Part Fourth. Title Page. ».
SKIP_TITLE = re.compile(
    r'^\s*.*(title page|index(es)?|index to volume|subject index|'
    r'original table of contents|fac-?simile|frontispiece|illustrations?)\s*$'
    r'|^\s*(contents|introduction|preface|table of contents)\s*$', re.I)

# Alias français, appliqués au titre normalisé d'une entrée ou d'un nœud.
FR = {
    'schaff/creeds3': ['symboles de la reforme', 'creeds of christendom'],
    'brannan/hstcrcon': ['confessions historiques', 'historic creeds'],
    'schaff/creeds2': ['symboles anciens'],
    'melanchthon/apology': ['apologie de la confession d augsbourg', 'apologie d augsbourg'],
    'luther/smalcald': ['articles de smalkalde', 'articles de schmalkalde'],
    'luther/largecatechism': ['grand catechisme', 'large catechism'],
    'luther/smallcat': ['petit catechisme', 'small catechism'],
    'luther/bondage': ['du serf arbitre', 'le serf arbitre', 'de servo arbitrio'],
    'luther/galatians': ['commentaire sur les galates', 'epitre aux galates'],
    'luther/christianliberty': ['liberte du chretien', 'de la liberte chretienne'],
    'luther/first_prin': ['95 theses', 'quatre vingt quinze theses', 'theses de luther'],
    'luther/good_works': ['des bonnes oeuvres', 'traite des bonnes oeuvres'],
    'luther/prefacetoromans': ['preface aux romains', 'preface sur l epitre aux romains'],
    'luther/tabletalk': ['propos de table'],
    'calvin/institutes': ['institution de la religion chretienne', 'institution',
                          'institutes', 'l institution chretienne'],
    'calvin/chr_life': ['vie chretienne', 'de la vie chretienne'],
    'calvin/prayer': ['de la priere'],
    'owen/deathofdeath': ['la mort de la mort', 'mort de la mort dans la mort de christ'],
    'owen/just': ['justification par la foi', 'doctrine de la justification'],
    'owen/communion': ['communion avec dieu'],
    'owen/mort': ['mortification du peche', 'de la mortification du peche'],
    'owen/temptation': ['de la tentation'],
    'owen/trinity': ['declaration sur la trinite'],
    'owen/glory': ['gloire de christ', 'la gloire du christ'],
    'owen/display': ['l arminianisme etale', 'display of arminianism'],
    'owen/indwellingsin': ['le peche qui habite en nous'],
    'baxter/saints_rest': ['repos eternel des saints', 'le repos des saints'],
    'baxter/pastor': ['pasteur reforme', 'le pasteur reforme'],
    'baxter/unconverted': ['appel aux non convertis'],
    'bunyan/pilgrim': ['voyage du pelerin', 'le voyage du chretien', 'pelerin'],
    'bunyan/holy_war': ['guerre sainte'],
    'bunyan/grace': ['grace abondante', 'la grace surabondante'],
    'edwards/affections': ['affections religieuses', 'religious affections'],
    'edwards/will': ['liberte de la volonte', 'freedom of the will'],
    'edwards/sermons': ['sermons choisis'],
    'edwards/treatiseongrace': ['traite de la grace'],
    'wesley/perfection': ['perfection chretienne'],
    'spurgeon/grace': ['toute par grace'],
    'spurgeon/catechism': ['catechisme puritain'],
    'hodge/theology1': ['theologie systematique i'],
    'hodge/theology2': ['theologie systematique ii'],
    'hodge/theology3': ['theologie systematique iii'],
    'berkhof/systematictheology': ['theologie systematique de berkhof'],
    'berkhof/summary': ['resume de la doctrine chretienne'],
    'bavinck/revelation': ['philosophie de la revelation'],
    'cranmer/doctrine': ['doctrine necessaire'],
    'knox/prayer': ['traite de la priere'],
}

# Alias français pour les nœuds extraits d'un recueil (confessions de foi).
FR_NODE = {
    'westminster confession': ['confession de foi de westminster', 'confession de westminster'],
    'westminster shorter catechism': ['petit catechisme de westminster'],
    'westminster larger': ['grand catechisme de westminster'],
    'heidelberg catechism': ['catechisme de heidelberg'],
    'belgic confession': ['confession belge', 'confession des pays bas'],
    'canons of the synod of dort': ['canons de dordrecht', 'canons de dort'],
    'augsburg confession': ['confession d augsbourg', 'confession d augsburg'],
    'thirty-nine articles': ['trente neuf articles', '39 articles'],
    'second helvetic': ['seconde confession helvetique'],
    'first helvetic': ['premiere confession helvetique'],
    'scotch confession': ['confession ecossaise'],
    'french confession': ['confession de la rochelle', 'confession de foi des eglises reformees'],
    'apostles': ['symbole des apotres'],
    'nicene': ['symbole de nicee'],
    'athanasian': ['symbole d athanase'],
    'irish articles': ['articles irlandais'],
    'lambeth articles': ['articles de lambeth'],
    'arminian articles': ['articles arminiens', 'cinq articles des remonstrants'],
    'baptist': ['confessions baptistes'],
    'congregational': ['confessions congregationalistes'],
    'zwingli': ['articles de zwingli'],
    'ten theses of berne': ['theses de berne'],
}


# ------------------------------------------------------------------- plumbing
def fetch(url, cache, delay=DELAY):
    p = os.path.join(CACHE, cache)
    if os.path.exists(p):
        with open(p, 'r', encoding='utf-8', errors='replace') as f:
            return f.read()
    for i in range(RETRIES):
        try:
            raw = urllib.request.urlopen(
                urllib.request.Request(url, headers=UA), timeout=180).read().decode('utf-8', 'replace')
            os.makedirs(CACHE, exist_ok=True)
            with open(p, 'w', encoding='utf-8') as f:
                f.write(raw)
            time.sleep(delay)
            return raw
        except Exception as e:
            if i == RETRIES - 1:
                print('  FAIL %s %s' % (url, e))
                return None
            time.sleep(2.0 * (i + 1))
    return None


def dc(head, tag, scheme=None):
    """Dublin Core. For a Creator the useful form is the one carrying
    scheme="file-as" ("Calvin, John (1509-1564)"); taking the first
    <DC.Creator> would only yield the CCEL id ("calvin")."""
    if scheme:
        m = re.search(r'<DC\.%s[^>]*scheme="%s"[^>]*>(.*?)</DC\.%s>' % (tag, scheme, tag), head, re.S)
    else:
        m = re.search(r'<DC\.%s[^>]*>(.*?)</DC\.%s>' % (tag, tag), head, re.S)
    return html.unescape(re.sub(r'<[^>]+>', '', m.group(1))).strip() if m else ''


def dc_author(head):
    for sch in ('file-as', 'short-form'):
        v = dc(head, 'Creator', sch)
        if v:
            return v
    return dc(head, 'Creator')


def norm(s):
    """Minuscules, apostrophes droites, traits d'union et ponctuation en
    espaces. « Thirty-Nine Articles » doit donner « thirty nine articles »
    pour retrouver l'alias français."""
    return re.sub(r'\s+', ' ', str(s or '').lower()
                  .replace('\u2019', "'")
                  .replace('&nbsp;', ' ')
                  .replace('-', ' ')
                  ).strip()


# -------------------------------------------------------------------- parsing
def tokenize(body):
    """-> list of ('open'|'close'|'text', kind, title) for div/h/p."""
    b = re.sub(r'<!--.*?-->', ' ', body, flags=re.S)
    b = re.sub(r'<pb\b[^>]*/?>', ' ', b, flags=re.I)
    b = re.sub(r'<img\b[^>]*>', ' ', b, flags=re.I)
    b = re.sub(r'<table\b.*?</table>', ' ', b, flags=re.S | re.I)
    b = re.sub(r'<script\b.*?</script>', ' ', b, flags=re.S | re.I)

    def div_open(m):
        return '\n@@OPEN|DIV|%s@@\n' % html.unescape(m.group(2) or '')
    b = re.sub(r'<div([123])(?:\s+title="([^"]*)")?[^>]*>', div_open, b, flags=re.I)
    b = re.sub(r'</div[123]\s*>', '\n@@CLOSE|DIV@@\n', b, flags=re.I)
    b = re.sub(r'<h([1-6])[^>]*>', '\n@@OPEN|H@@\n', b, flags=re.I)
    b = re.sub(r'</h[1-6]\s*>', '\n@@CLOSE|H@@\n', b, flags=re.I)
    b = re.sub(r'<p\b[^>]*>', '\n@@OPEN|P@@\n', b, flags=re.I)
    b = re.sub(r'</p\s*>', '\n@@CLOSE|P@@\n', b, flags=re.I)
    b = re.sub(r'<br\s*/?>', '\n', b, flags=re.I)
    b = re.sub(r'<[^>]+>', '', b)
    b = html.unescape(b).replace('\xa0', ' ')
    return b


class Node(object):
    """`kind` distingue une division d'un simple titre d'affichage ;
    `lvl` est le niveau de division (1, 2, 3) — il ne se déduit pas de la
    profondeur réelle, car du ThML mal formé peut sauter un niveau."""
    __slots__ = ('t', 'paras', 'kids', 'lvl', 'kind')

    def __init__(self, t, lvl=0, kind='div'):
        self.t = t
        self.paras = []
        self.kids = []
        self.lvl = lvl
        self.kind = kind


def build_tree(frag):
    """Parse a body fragment into a Node tree (divs nested, H/P flattened)."""
    text = tokenize(frag)
    root = Node('')
    stack = [root]
    cur_h = [None]
    buf = []

    def flush():
        s = re.sub(r'\s+', ' ', ' '.join(buf)).strip()
        buf[:] = []
        return s

    for line in text.split('\n'):
        line = line.strip()
        m = re.match(r'^@@(OPEN|CLOSE)\|(DIV|H|P)(?:\|(.*))?@@$', line)
        if m:
            act, kind, title = m.group(1), m.group(2), (m.group(3) or '')
            if kind == 'P':
                if act == 'OPEN':
                    buf[:] = []
                else:
                    s = flush()
                    if s:
                        stack[-1].paras.append(s)
                continue
            if kind == 'H':
                if act == 'OPEN':
                    buf[:] = []
                else:
                    s = flush()
                    if s:
                        stack[-1].kids.append(Node(s, len(stack), 'h'))
                continue
            # DIV
            if act == 'OPEN':
                n = Node(title, len(stack))
                stack[-1].kids.append(n)
                stack.append(n)
            else:
                if len(stack) > 1:
                    stack.pop()
            continue
        if line:
            buf.append(line)
    flush()
    return root


def prune(node):
    node.kids = [k for k in node.kids
                 if not (k.kind == 'div' and SKIP_TITLE.match(k.t or ''))]
    for k in node.kids:
        prune(k)
    return node


def all_divs(node, lvl, out=None):
    """Toutes les divisions de niveau `lvl`, quelle que soit leur place.

    Indispensable : dans creeds3 un </div1> est écrit « /div&gt; », donc les
    symboles luthériens (Confession d'Augsbourg…) se retrouvent orphelins
    sous « Original Table of Contents » au lieu d'être au niveau 2 franc."""
    out = [] if out is None else out
    for k in node.kids:
        if k.kind == 'div':
            if k.lvl == lvl:
                out.append(k)
            elif k.lvl < lvl:
                all_divs(k, lvl, out)
    return out


def flatten_chapter(node):
    """A chapter node -> {'t': title, 's': [{'t','p'}]}.

    Walks the subtree in order: every descendant div or heading opens a new
    section, paragraphs accumulate in the current one."""
    sections = []
    cur = {'t': '', 'p': []}

    def walk(n, depth):
        nonlocal cur
        if depth > 0:
            if n.t:
                if cur['p'] or cur['t']:
                    sections.append(cur)
                cur = {'t': n.t, 'p': []}
            elif depth > 0 and not sections and not cur['p']:
                pass
        for p in n.paras:
            cur['p'].append(p)
        for k in n.kids:
            walk(k, depth + 1)

    walk(node, 0)
    if cur['p'] or cur['t'] or not sections:
        sections.append(cur)
    # Un titre sans paragraphe n'est qu'un titre d'affichage : on le retire.
    return {'t': node.t, 's': [s for s in sections if s['p']]}


def content_chapters(node, split=None):
    """-> list of chapter nodes. `split` selects the level to cut at."""
    if split == 'div1':
        return [k for k in all_divs(node, 1) if k.kids or k.paras]
    if split == 'div2':
        return [k for k in all_divs(node, 2) if k.kids or k.paras]
    # no split: the outermost level, but go deeper if it is a single node
    lvl = [k for k in node.kids if k.kind == 'div']
    while len(lvl) == 1 and lvl[0].kids:
        lvl = [k for k in lvl[0].kids if k.kind == 'div']
    return lvl


def parse_work(raw, prune_tree=True):
    i = raw.find('<ThML.body')
    head, body = raw[:i if i > 0 else 0], raw[i:] if i > 0 else raw
    meta = {
        'title': dc(head, 'Title'),
        'author': dc_author(head),
        'rights': dc(head, 'Rights'),
        'date': dc(head, 'Date'),
    }
    tree = build_tree(body)
    # En mode « split » on ne doit PAS élaguer : les divisions orphelines
    # (ThML mal formé) vivent souvent sous une division qu'on élaguerait.
    if prune_tree:
        prune(tree)
    return meta, tree


# --------------------------------------------------------------------- build
def main():
    argv = sys.argv[1:]
    if '--probe' in argv:
        a, w = argv[argv.index('--probe') + 1].split('/')
        raw = fetch('https://ccel.org/ccel/%s/%s' % (a, w), 'page_%s_%s.htm' % (a, w))
        m = re.search(r'href="(/ccel/[^"]*?/%s/%s\.xml)"' % (a, w), raw)
        x = fetch('https://ccel.org' + m.group(1), '%s_%s.xml' % (a, w))
        meta, tree = parse_work(x)
        print(json.dumps(meta, ensure_ascii=False))
        for c in content_chapters(tree)[:6]:
            ch = flatten_chapter(c)
            print('  CHAP %-60s sections=%d' % (ch['t'][:60], len(ch['s'])))
            for s in ch['s'][:3]:
                print('      - %s | %s' % (s['t'][:44], (s['p'][0][:90] if s['p'] else '')))
        return

    os.makedirs(OUT, exist_ok=True)
    works = CORE[:int(argv[argv.index('--limit') + 1])] if '--limit' in argv else CORE
    print('building %d works' % len(works))

    index, names, total, built = {}, {}, 0, 0
    for n, (a, w, split) in enumerate(works):
        key = '%s/%s' % (a, w)
        page = fetch('https://ccel.org/ccel/%s/%s' % (a, w), 'page_%s_%s.htm' % (a, w))
        if page is None:
            continue
        m = re.search(r'href="(/ccel/[^"]*?/%s/%s\.xml)"' % (a, w), page)
        if not m:
            print('  %-22s pas de XML' % key)
            continue
        raw = fetch('https://ccel.org' + m.group(1), '%s_%s.xml' % (a, w))
        if raw is None:
            continue
        meta, tree = parse_work(raw, prune_tree=not split)
        rights = (meta.get('rights') or '').strip()
        if rights and 'public domain' not in rights.lower():
            print('  %-22s REFUSE (droits : %s)' % (key, rights))
            continue
        chapters = content_chapters(tree, split)
        if not chapters:
            print('  %-22s vide' % key)
            continue

        if split:
            # une entree par confession / symbole
            for i, c in enumerate(chapters):
                title = c.t or meta['title']
                if SKIP_TITLE.match(title or ''):
                    continue
                eid = '%s_%s_%02d' % (a, w, i)
                ent = {'id': eid, 'a': meta['author'], 't': title,
                       'u': 'https://ccel.org/ccel/%s/%s' % (a, w),
                       'c': [flatten_chapter(c)]}
                write_entry(ent)
                index[eid] = {'a': meta['author'], 't': title, 'n': 1,
                              'u': 'https://ccel.org/ccel/%s/%s' % (a, w)}
                register(names, eid, title, FR_NODE)
                total += os.path.getsize(os.path.join(OUT, 'r%s.js' % eid))
                built += 1
        else:
            chs = [flatten_chapter(c) for c in chapters]
            chs = [c for c in chs if c['s']]
            if not chs:
                print('  %-22s vide' % key)
                continue
            eid = '%s_%s' % (a, w)
            ent = {'id': eid, 'a': meta['author'], 't': meta['title'] or w,
                   'u': 'https://ccel.org/ccel/%s/%s' % (a, w),
                   'c': chs}
            write_entry(ent)
            index[eid] = {'a': meta['author'], 't': ent['t'], 'n': len(chs),
                          'u': 'https://ccel.org/ccel/%s/%s' % (a, w)}
            register(names, eid, ent['t'], FR, key)
            total += os.path.getsize(os.path.join(OUT, 'r%s.js' % eid))
            built += 1
        nsec = sum(len(c['s']) for c in ([]))
        print('  %-22s %-46s %s' % (key, (meta['title'] or w)[:46],
                                    '%d entree(s)' % len(chapters) if split else '%d chap.' % len(chs)),
              flush=True)

    with open(os.path.join(OUT, 'index.js'), 'w', encoding='utf-8') as f:
        f.write('window.__reformedIndex = %s;\n'
                % json.dumps(index, ensure_ascii=False, separators=(',', ':')))
    with open(os.path.join(OUT, 'names.js'), 'w', encoding='utf-8') as f:
        f.write('window.__reformedNames = %s;\n'
                % json.dumps(names, ensure_ascii=False, separators=(',', ':')))
    print('entrees : %d' % built)
    print('corpus  : %.1f MB' % (total / 1e6))
    print('alias   : %d' % len(names))


def write_entry(ent):
    with open(os.path.join(OUT, 'r%s.js' % ent['id']), 'w', encoding='utf-8') as f:
        f.write('window.__reformedWorks = window.__reformedWorks || {};\n')
        f.write('window.__reformedWorks["%s"] = %s;\n'
                % (ent['id'], json.dumps(ent, ensure_ascii=False, separators=(',', ':'))))


def register(names, eid, title, table, key=None):
    keys = []
    if key and key in table:
        for a in table[key]:
            names.setdefault(a, eid)
    t = norm(title)
    t = re.sub(r'[^a-z0-9\u00e0-\u00ff\u0153 ]+', ' ', t)
    t = re.sub(r'\s+', ' ', t).strip()
    if len(t) > 4:
        names.setdefault(t, eid)
    for frag, aliases in table.items():
        # les clés d'alias sont comparées après la même normalisation
        # (traits d'union en espaces) que le titre.
        if frag.replace('-', ' ') in t:
            for al in aliases:
                names.setdefault(al, eid)


if __name__ == '__main__':
    main()
