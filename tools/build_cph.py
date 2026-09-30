# -*- coding: utf-8 -*-
"""build_cph.py — exploite christianpublishinghouse.co (WordPress REST API) pour THEOLOGICUS.

Sources locales (téléchargées par cph_dl_meta.py / cph_dl_content.py) :
  cph/api/meta_*.json      — 9365 posts : id,date,link,slug,title,excerpt,categories,tags
  cph/api/content_*.json   — 94 pages : id,content.rendered
  cph_cats.json + cph_cats2.json (dans C:\tmp ; copiés aussi dans cph/api si présent)

Sorties :
  tradition/cph_idx.json   — INDEX COMPLET : { built, src, cats:[{n,c}], ps:[[id,t,d,cats,ex,u]] }
  tradition/cph.json       — TEXTES INTÉGRAUX (catégories théologiques, cap 8000 c/post) :
                             { built, src, nps, ps:[{i,t,d,c,u,s:[[h,x],...]}] }
"""
import json
import os
import re
import time

ROOT = r'C:\tmp\theoverify'
API = os.path.join(ROOT, 'cph', 'api')

FULL_CATS = set()
for n in [
    # apologétique / questions
    'Christian Apologetics', 'Apologetics & Theology', 'Apologetics: Youths 12-25',
    'Defending the Faith', 'Skepticism Answered', 'Agnostic Dr. Bart D. Ehrman',
    'Questions Asked and Answered', 'Scriptures Often Misunderstood', 'Faith & Doubt',
    # théologie / doctrines
    'Christian Theology', 'Bible Doctrines', 'Salvation Doctrine', 'Salvation (Soteriology)',
    'The Trinity', 'The Holy Spirit', 'The Soul and Spirit', 'Hellfire Doctrine',
    'God (Theology Proper)', 'The Church: (Ecclesiology)', 'Last Things: (Eschatology)',
    'Humanity and Sin', 'Foreknowledge', 'Problem of Evil', 'Calvinism VS Arminianism',
    'Speaking In Tongues', 'Introduction (Prolegomena)', 'Bible (Bibliology)',
    'The Doctrine of Inerrancy of Scripture', 'Inerrancy of Scripture',
    'Biblical Criticism Assault on the Bible',
    # fiabilité / critique textuelle / manuscrits
    'Battle for the Bible - New Testament', 'Battle for the Bible - Old Testament',
    'Can New Testament Documents Be Trusted', 'Can Old Testament Documents Be Trusted',
    'New Testament Textual Criticism Articles', 'Old Testament Textual Criticism Articles',
    'New Testament Textual Commentary', 'Old Testament Textual Commentary',
    'New Testament Textual Criticism Source Articles', 'Old Testament Textual Criticism Sources',
    'Introduction to New Testament Textual Studies',
    'Textual Scholars of the New Testament', 'Textual Scholars of the Old Testament',
    'Papyrus Manuscripts', 'Majuscule Manuscript', 'Minuscule Manuscripts',
    'Lectionary Manuscripts', 'Manuscripts of Hebrew Scriptures',
    'Versions (Latin, Syriac, Coptic, etc.)', 'Versions of the Old Testament',
    'New Testament Exegetical Commentary', 'Old Testament Exegetical Commentary',
    'New Testament Bible Books Authorship', 'Old Testament Bible Books Authorship',
    'Patristic Quotations of the New Testament',
    'Bible Translation Philosophy', 'Bible Translators and Bible Translations',
    'Translating Truth', 'Literal Translation vs Interpretive Translation',
    'King James Version Versus Modern Translations',
    # étude biblique
    'Bible Difficulty Articles', 'Old Testament Bible Difficulties', 'New Testament Bible Difficulties',
    'Old Testament Bible Background', 'New Testament Bible Background',
    'Biblical Interpretation', 'Basic-Intermediate Bible Interpretation',
    'How To Study the Bible', 'Bible Terms', 'Biblical Studies Articles', 'Biblical Prophecy',
    'Biblical Greek', 'Biblical Hebrew', 'People of the Bible', 'Places In the Bible',
    'Events of the Bible', 'The Biblical Setting', 'The Promised Land',
    'The Old Testament Period', 'The New Testament Period',
    'Old Testament Exegetical Insight', 'New Testament Exegetical Insight',
    'Jesus and the Gospels', 'Gospels and Acts',
    'Matthew - Acts - (GENTI)', 'Romans - Titus (GENTI)', 'Hebrews - Revelation (GENTI)',
    'GENESIS - RUTH - (HEOTI)', 'FIRST SAMUEL - NEHEMIAH - (HEOTI)',
    'JOB - SONG OF SONGS - (HEOTI)', 'ISAIAH - DANIEL - (HEOTI)', 'HOSEA - ZECHARIAH - (HEOTI)',
    'Part 1-Creation to the Flood', 'Part 2 The Flood to the Deliverance From Egypt',
    "Part 3-Deliverance From Egypt to Israel's First King",
    "Part 4 Israel's First King to Captivity in Babylon",
    'Part 5-Captivity in Babylon to the Completion of the Book of Malachi',
    'Part 6-From Malachi to the Birth of Jesus',
    'Part 7-Birth of Jesus to His Death and Resurrection',
    "Part 8-Jesus' Resurrection to death of the Apostle John",
    # histoire de l'Église
    'Early Christianity', 'Constantine the Great to Pre-Reformation',
    'The Reformation to the Present', 'Early Christian Martyrs', 'Christian Church',
    'History of Religion', 'Protestantism vs Catholicism',
    # archéologie
    'People—Old Testament Archaeology', 'People—New Testament Archaeology',
    'Places—Old Testament Archaeology', 'Places—New Testament Archaeology',
    'Artifacts—Old Testament Archaeology', 'Artifacts—New Testament Archaeology',
    'Events—Old Testament Archaeology', 'Events—New Testament Archaeology',
    'Apocrypha—New Testament Archaeology', 'Apocrypha—Old Testament Archaeology',
    # sciences / religions / éthique
    'Science and the Bible', 'Intelligent Design', 'Days of Creation', 'Creation',
    'Evolution Versus Creation', 'The Universe and Astronomy', 'Belief in a Creator',
    'Understanding Islam', 'Understanding the Quran of Islam', 'Evangelizing Other Religions',
    'Mormonism-Book of Mormon', "Understanding Jehovah's Witnesses",
    'Understanding the New World Translation of Jehovah\'s Witnesses',
    'The Christian Mind', 'Christian Ethics (Morals)', 'Heroes of Faith',
]:
    FULL_CATS.add(n)

TAIL_MARKERS = ['You May Also Enjoy', 'About the Author', 'Related posts', 'Share this:',
                'Recommended Resource', 'Further Reading', 'Get Your Copy', 'Our new book',
                'Check out our', 'Subscribe', 'Follow Blog', 'Leave a comment', 'Post navigation']


def unent(s):
    s = s.replace('&amp;', '&').replace('&#8211;', '–').replace('&#8217;', "'")
    s = s.replace('&#8216;', "'").replace('&#8220;', '"').replace('&#8221;', '"')
    s = re.sub(r'&#(\d+);', lambda m: chr(int(m.group(1))), s)
    return s


def strip_html(html):
    html = re.sub(r'<(script|style|iframe|form|button)[^>]*>.*?</\1>', ' ', html, flags=re.S)
    html = re.sub(r'<img[^>]*>', ' ', html)
    html = re.sub(r'<!--.*?-->', ' ', html, flags=re.S)
    html = re.sub(r'<br\s*/?>', '\n', html)
    html = re.sub(r'</(p|h1|h2|h3|h4|h5|li|blockquote|figcaption)>', '\n', html)
    html = re.sub(r'<[^>]+>', '', html)
    html = html.replace('&nbsp;', ' ').replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
    html = re.sub(r'&#8217;', "'", html).replace('&#8216;', "'")
    html = re.sub(r'&#8220;|&#8221;', '"', html)
    html = re.sub(r'&#8211;|&#8212;', '-', html)
    lines = [' '.join(l.split()) for l in html.split('\n')]
    out, prev = [], None
    for l in lines:
        if l and l != prev:
            out.append(l)
        prev = l
    return '\n'.join(out).strip()


TAIL_RE = re.compile(r'(Please Help Us|Growing and Free for All|^\$\d+([.,]\d\d)?\s*$|'
                     r'Make a donation|GoFundMe|Patreon|PayPal|donation of any amount|'
                     r'Click here to purchase|Purchase here|Buy now on|Available on Amazon|'
                     r'^Kindle\s*\$|^\s*Paperback\s*\$)', re.I)


def cut_promo_lines(text):
    return '\n'.join(l for l in text.split('\n') if not TAIL_RE.search(l))


def clean_content(html):
    """Contenu brut WP -> sections [h2/h3/h4, texte] + coupe le boilerplate de fin."""
    html = re.sub(r'<(script|style|iframe|form|button)[^>]*>.*?</\1>', ' ', html, flags=re.S)
    html = re.sub(r'<img[^>]*>', ' ', html)
    html = re.sub(r'<!--.*?-->', ' ', html, flags=re.S)
    # tables = souvent blocs promo/don (prix, Amazon, achat) — on les retire si signal
    def table_promo(m):
        t = strip_html(m.group(0))
        if any(k in t for k in ('$', 'Amazon', 'Buy now', 'Paperback', 'Hardcover', 'eBook',
                                'Please Help Us', 'Donate', 'donation', 'free for all')):
            return ' '
        return m.group(0)
    html = re.sub(r'<table[^>]*>.*?</table>', table_promo, html, flags=re.S)
    # coupe le boilerplate final
    for m in TAIL_MARKERS:
        i = html.find(m)
        if i > 2000:
            html = html[:i]
    parts = re.split(r'<h([234])[^>]*>(.*?)</h\1>', html, flags=re.S)
    sections = []
    # parts[0] = intro avant le premier titre
    intro = strip_html(parts[0]) if parts else ''
    intro = cut_promo_lines(intro)
    if intro.strip():
        sections.append(['', intro[:4000]])
    for k in range(1, len(parts) - 1, 3):
        h = ' '.join(strip_html(parts[k + 1]).split())[:200]
        body = cut_promo_lines(strip_html(parts[k + 2]))
        if body:
            sections.append([h, body[:3500]])
    # limite totale
    total, out = 0, []
    for h, x in sections:
        if total >= 8000:
            break
        room = 8000 - total
        if len(x) > room:
            x = x[:room].rsplit(' ', 1)[0] + '…'
        out.append([h, x])
        total += len(x) + len(h) + 8
    return out


def main():
    cmap_path1 = os.path.join(API, 'cats1.json')
    cmap_path2 = os.path.join(API, 'cats2.json')
    cats = []
    for p in [cmap_path1, cmap_path2]:
        if os.path.exists(p):
            cats.extend(json.load(open(p, encoding='utf-8')))
    if not cats:
        for p in [r'C:\tmp\cph_cats.json', r'C:\tmp\cph_cats2.json']:
            if os.path.exists(p):
                cats.extend(json.load(open(p, encoding='utf-8')))
    cmap = {c['id']: unent(c['name']) for c in cats}
    print('categories:', len(cmap))

    meta = json.load(open(os.path.join(API, 'meta_all.json'), encoding='utf-8'))
    print('posts meta:', len(meta))

    # contenu : id -> sections
    content = {}
    for f in sorted(os.listdir(API)):
        if not f.startswith('content_'):
            continue
        for p in json.load(open(os.path.join(API, f), encoding='utf-8')):
            content[p['id']] = p['content']['rendered']
    print('posts avec contenu:', len(content))

    idx_ps, full_ps = [], []
    for p in meta:
        t = ' '.join(strip_html(p['title']['rendered']).split())
        if not t:
            continue
        d = p['date'][:10]
        u = p['link']
        cnames = sorted(set(cmap.get(cid, '') for cid in p['categories'] if cmap.get(cid, '')))
        cs = ' · '.join(cnames)
        ex = strip_html(p.get('excerpt', {}).get('rendered', ''))[:280]
        idx_ps.append([p['id'], t, d, cs, ex, u])
        if FULL_CATS.intersection(cnames) and p['id'] in content:
            secs = clean_content(content[p['id']])
            if secs:
                full_ps.append({'i': p['id'], 't': t, 'd': d, 'c': cs, 'u': u, 's': secs})

    # catégories avec effectifs réels
    from collections import Counter
    cc = Counter()
    for _, _, _, cs, _, _ in idx_ps:
        for c in (cs.split(' · ') if cs else ['(sans catégorie)']):
            cc[c] += 1
    idx = {'built': time.strftime('%Y-%m-%d %H:%M'), 'src': 'christianpublishinghouse.co',
           'ncats': len(cc), 'nps': len(idx_ps),
           'cats': [[c, n] for c, n in cc.most_common()],
           'ps': idx_ps}
    full = {'built': time.strftime('%Y-%m-%d %H:%M'), 'src': 'christianpublishinghouse.co',
            'nps': len(full_ps), 'ps': full_ps}

    os.makedirs(os.path.join(ROOT, 'tradition'), exist_ok=True)
    with open(os.path.join(ROOT, 'tradition', 'cph_idx.json'), 'w', encoding='utf-8') as f:
        json.dump(idx, f, ensure_ascii=False, separators=(',', ':'))
    with open(os.path.join(ROOT, 'tradition', 'cph.json'), 'w', encoding='utf-8') as f:
        json.dump(full, f, ensure_ascii=False, separators=(',', ':'))
    i1 = os.path.getsize(os.path.join(ROOT, 'tradition', 'cph_idx.json'))
    i2 = os.path.getsize(os.path.join(ROOT, 'tradition', 'cph.json'))
    print('OK cph_idx.json : %d posts, %.1f MB' % (len(idx_ps), i1 / 1e6))
    print('OK cph.json     : %d posts intégraux, %.1f MB' % (len(full_ps), i2 / 1e6))


if __name__ == '__main__':
    main()
