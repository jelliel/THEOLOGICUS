# -*- coding: utf-8 -*-
"""build_beliefmap.py — exploit https://beliefmap.org/ for THEOLOGICUS.

Crawls the content URLs listed in tools/beliefmap_urls.txt (derived from
beliefmap.org/sitemap.xml, excluding ?view= and /blog), with a disk cache
(beliefmap/cache/<slug>.html) so re-runs never re-fetch.

Parse (verified on /god-exists/divine-hiddenness):
  div.arguments-page                       -> one argument page
    a.classic-question-keeper__question    -> question (h1 equivalent)
    ol[data-atlas-question-trail]          -> breadcrumb path
    h2#orient ... "Orient yourself"        -> orientation prose section
    div[id^=atlas-stance-section-]         -> stance (yes/no) with
         .classic-section-divider__stance    -> label (Yes/No)
         .classic-section-divider__context   -> "Reasons challenging/supporting..."
    li.point-li (top-level)                -> one point
      h2.accordion-header                  -> point heading
      div[data-edit-block-field=raw_expanded]   -> point content (incl. <evid>)
      div.footnotes[data-edit-block-field=raw_footnotes] -> scholar quotes/citations
      nested li.point-li inside            -> sub-responses

Output: tradition/beliefmap.json
  { built, src, pages: [ { u, q, path: [...], orient, stances: [
      { s, label, ctx, points: [ { h, c, fn, resp: [same shape] } ] } ] } ],
    skipped: [ { u, t } ] }
"""
import json
import os
import re
import sys
import time
import urllib.request
from bs4 import BeautifulSoup

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'beliefmap', 'cache')
OUT = os.path.join(ROOT, 'tradition', 'beliefmap.json')
URLS = os.path.join(ROOT, 'tools', 'beliefmap_urls.txt')

DELAY = 2.0
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                    '(KHTML, like Gecko) Chrome/126.0 Safari/537.36'}

SKIP_PREFIXES = ('https://beliefmap.org/about-us/',)
SKIP_EXACT = {'https://beliefmap.org/', 'https://beliefmap.org/about-us/donation-form/',
              # genuine redirect loop on the site (ad-30 <-> palestine-verisimilitude)
              'https://beliefmap.org/gospel-stories/spew/ad-30',
              'https://beliefmap.org/gospel-stories/spew/palestine-verisimilitude'}


def slug(u):
    s = u.replace('https://beliefmap.org/', '').strip('/').replace('/', '_')
    s = re.sub(r'[^A-Za-z0-9_.-]', '_', s)
    return s or 'home'


def fetch(u, refresh=False):
    p = os.path.join(CACHE, slug(u) + '.html')
    if not refresh and os.path.exists(p) and os.path.getsize(p) > 2000:
        with open(p, encoding='utf-8') as f:
            return f.read()
    for i in range(5):
        try:
            req = urllib.request.Request(u, headers=UA)
            with urllib.request.urlopen(req, timeout=40) as r:
                h = r.read().decode('utf-8', 'replace')
            with open(p, 'w', encoding='utf-8') as f:
                f.write(h)
            time.sleep(DELAY)
            return h
        except Exception as e:
            wait = 2 + 3 * i
            print('  ! %s (%s) retry in %ss' % (u, e, wait), flush=True)
            time.sleep(wait)
    return ''


def txt(node):
    if node is None:
        return ''
    return ' '.join(node.get_text(' ', strip=True).split())


def clean_content(div):
    """Content div -> readable text preserving structure via newlines."""
    if div is None:
        return ''
    for t in div.find_all(['script', 'style', 'sup']):
        t.decompose()
    for a in div.find_all('a'):
        a.unwrap()
    for tag in div.find_all(['evid']):
        tag.insert_before('\n')
        tag.insert_after('\n')
    for br in div.find_all('br'):
        br.replace_with('\n')
    for li in div.find_all('li'):
        li.insert(0, '• ')
        li.insert_after('\n')
    for blk in div.find_all(['p', 'ul', 'ol', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'evid']):
        blk.append('\n')
    t = div.get_text()
    t = re.sub(r'\n{3,}', '\n\n', t)
    lines = [' '.join(l.split()) if not l.startswith('• ') else ' '.join(l.split())
             for l in t.split('\n')]
    t = '\n'.join(lines)
    t = re.sub(r' ?\n ?', '\n', t)
    t = re.sub(r'\n{2,}', '\n', t)
    return t.strip()[:3000]


def clean_footnotes(div):
    if div is None:
        return ''
    for t in div.find_all(['script', 'style', 'sup']):
        t.decompose()
    t = div.get_text(' ', strip=True)
    return ' '.join(t.split())[:2200]


def parse_point(li):
    d = {'h': txt(li.find('h2', class_='accordion-header'))}
    d['c'] = clean_content(li.find('div', attrs={'data-edit-block-field': 'raw_expanded'}))
    d['fn'] = clean_footnotes(li.find('div', class_='footnotes'))
    # nested sub-responses: point-li inside this li
    d['resp'] = []
    for sub in li.find_all('li', class_='point-li'):
        # only direct descendants of this li (i.e., nested inside, in a ul under it)
        par = sub.find_parent('li')
        if par is li or (par and par.find_parent('li') is li):
            d['resp'].append(parse_point(sub))
    return d


def parse_orientation(soup):
    cards = []
    sec = soup.find('section', class_='atlas-orientation')
    if sec is None:
        return cards
    for det in sec.find_all('details', class_='atlas-orientation-card'):
        h = txt(det.find('summary'))
        h = re.sub(r'^\d+\s*', '', h)
        c = clean_content(det.find('div', class_='atlas-orientation-prose'))
        if h or c:
            cards.append({'h': h, 'c': c})
    return cards


def parse_page(u, h):
    soup = BeautifulSoup(h, 'lxml')
    page_div = soup.find('div', class_='arguments-page')
    if page_div is None:
        return None
    q = txt(soup.find('a', class_='classic-question-keeper__question')) or \
        txt(soup.find('h1'))
    if not q:
        return None
    cards = parse_orientation(soup)
    orient = '\n\n'.join(('# ' + c['h'] + '\n' + c['c']) if c['h'] else c['c']
                         for c in cards)
    # Stance divider divs are SIBLINGS followed by <ul> lists of points.
    stances = []
    cur = None
    for el in page_div.find_all(recursive=False):
        if el.name == 'div' and el.get('data-atlas-stance-section'):
            cur = {'s': el['data-atlas-stance-section'],
                   'label': txt(el.find(class_='classic-section-divider__stance')),
                   'ctx': txt(el.find(class_='classic-section-divider__context')),
                   'points': []}
            cur['ctx'] = re.sub(r'\s*(Divine Hiddenness.*)$', '', cur['ctx'])
            stances.append(cur)
        elif el.name == 'ul' and el.find('li', class_='point-li'):
            if cur is None:
                cur = {'s': 'x', 'label': '', 'ctx': '', 'points': []}
                stances.append(cur)
            for li in el.find_all('li', class_='point-li', recursive=False):
                cur['points'].append(parse_point(li))
        elif el.name == 'section' and el.find('li', class_='point-li'):
            # points occasionally wrapped in a section
            if cur is None:
                cur = {'s': 'x', 'label': '', 'ctx': '', 'points': []}
                stances.append(cur)
            for li in el.find_all('li', class_='point-li'):
                if li.find_parent('li', class_='point-li') is None:
                    cur['points'].append(parse_point(li))
    # drop empty stances
    stances = [s for s in stances if s['points']]
    # thematic group from first URL segment
    seg = u.replace('https://beliefmap.org/', '').strip('/').split('/')
    g = seg[0].replace('_', ' ').replace('-', ' ') if seg and seg[0] else 'racine'
    return {'u': u, 'q': q, 'g': g, 'orient': orient, 'stances': stances}


def parse_editorial(u, h):
    """Fallback: editorial/guide pages — h1[data-edit-page-field=title] + prose,
    no argument points (e.g. /god/designed-designer, /gospel)."""
    soup = BeautifulSoup(h, 'lxml')
    h1 = soup.find('h1', attrs={'data-edit-page-field': 'title'})
    if h1 is None:
        return None
    q = txt(h1)
    main = soup.find('main') or soup.find('article') or soup.body
    body = ''
    if main is not None:
        for t in main.find_all(['script', 'style', 'nav', 'header', 'footer', 'form']):
            t.decompose()
        body = clean_content(main)
    seg = u.replace('https://beliefmap.org/', '').strip('/').split('/')
    g = seg[0].replace('_', ' ').replace('-', ' ') if seg and seg[0] else 'racine'
    return {'u': u, 'q': q, 'g': g, 'orient': '',
            'stances': [{'s': 'x', 'label': '', 'ctx': '',
                         'points': ([{'h': '', 'c': body, 'fn': '', 'resp': []}]
                                    if body else [])}]}


def main():
    refresh = '--refresh' in sys.argv
    os.makedirs(CACHE, exist_ok=True)
    with open(URLS, encoding='utf-8') as f:
        urls = [l.strip() for l in f if l.strip().startswith('http')]
    seen = set()
    uniq = []
    for u in urls:
        n = u.rstrip('/')
        if n in seen:
            continue
        seen.add(n)
        uniq.append(u)
    print('%d unique URLs' % len(uniq), flush=True)
    pages, skipped = [], []
    for n, u in enumerate(uniq, 1):
        if u in SKIP_EXACT or any(u.startswith(p) for p in SKIP_PREFIXES):
            skipped.append({'u': u, 't': ''})
            continue
        h = fetch(u, refresh)
        if not h:
            skipped.append({'u': u, 't': 'FETCH FAILED'})
            continue
        p = parse_page(u, h)
        if p is None:
            p = parse_editorial(u, h)
        if p is None:
            t = txt(BeautifulSoup(h, 'lxml').find('h1'))
            skipped.append({'u': u, 't': t or '(no arguments-page)'})
        else:
            pages.append(p)
        if n % 10 == 0:
            print('%d/%d  pages=%d' % (n, len(uniq), len(pages)), flush=True)
    data = {
        'built': time.strftime('%Y-%m-%d %H:%M'),
        'src': 'beliefmap.org',
        'npages': len(pages),
        'pages': pages,
        'skipped': skipped,
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print('OK %s : %d pages, %d skipped, %.1f MB' % (
        OUT, len(pages), len(skipped), os.path.getsize(OUT) / 1e6), flush=True)


if __name__ == '__main__':
    main()
