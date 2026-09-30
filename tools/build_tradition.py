#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""build_tradition.py — construit tradition/ta.json depuis traditionapostolique.fr

Récupère les 146 pages /sujets/ (florilèges patristiques FR), extrait
auteur → citations → œuvre, repère les références bibliques dans chaque
citation (format français « Jn 8, 58 », « 1 Co 12, 3 », « Jean 14, 1-2 »)
et indexe le tout par verset : { "43:8:58": [ {a, w, wu, ch, s, su, q} ] }.

Usage : py -3.12 tools/build_tradition.py
Respecte le site : délai 0.4 s entre les requêtes, attribution + lien
vers la page source conservés dans chaque entrée.
"""
import json, re, sys, time, html, urllib.request, unicodedata
from pathlib import Path

BASE = 'https://traditionapostolique.fr'
OUT = Path(__file__).resolve().parent.parent / 'tradition' / 'ta.json'
DELAY = 0.4

def fetch(url, retries=2):
    for i in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'THEOLOGICUS-corpus-builder/1.0 (offline patristic index)'})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read().decode('utf-8', 'replace')
        except Exception as e:
            if i == retries:
                print('  !! échec', url, e)
                return None
            time.sleep(1.5)

def clean(s):
    s = re.sub(r'<!--\[?-?\d*--?>|<!--]--?>|<!---->', '', s)
    s = re.sub(r'<[^>]+>', ' ', s)
    return html.unescape(re.sub(r'\s+', ' ', s)).strip()

def norm(s):
    s = unicodedata.normalize('NFD', s.lower())
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9 ]', ' ', s).replace('  ', ' ').strip()

# livres : clé normalisée sans accents -> numéro Segond (0 = à préfixe obligatoire)
BOOKS = {
    'genese':1,'gn':1,'exode':2,'ex':2,'levitique':3,'lv':3,'nombres':4,'nb':4,
    'deuteronome':5,'dt':5,'josue':6,'jos':6,'juges':7,'jg':7,'ruth':8,'rt':8,
    'esdras':15,'esd':15,'nehemie':16,'ne':16,'esther':17,'job':18,'jb':18,
    'psaume':19,'psaumes':19,'ps':19,'proverbes':20,'prov':20,'pr':20,
    'ecclesiaste':21,'eccl':21,'qohelet':21,'cantique':22,'ct':22,
    'esaie':23,'is':23,'isaie':23,'jeremie':24,'jer':24,'jr':24,'lamentations':25,'lam':25,
    'ezechiel':26,'ez':26,'daniel':27,'dan':27,'dn':27,'osee':28,'os':28,'ho':28,
    'joel':29,'jl':29,'amos':30,'am':30,'jonas':32,'jon':32,'michee':33,'mi':33,
    'nahum':34,'na':34,'habacuc':35,'hab':35,'sophonie':36,'sop':36,'aggee':37,'ag':37,
    'zacharie':38,'za':38,'malachie':39,'mal':39,'matthieu':40,'matt':40,'mt':40,
    'marc':41,'mc':41,'luc':42,'lc':42,'jean':43,'jn':43,'actes':44,'ac':44,
    'romains':45,'rom':45,'rm':45,'galates':48,'gal':48,'ga':48,'ephesiens':49,'eph':49,
    'philippiens':50,'phil':50,'colossiens':51,'col':51,'tite':56,'tit':56,'tt':56,
    'philemon':57,'phlm':57,'hebreux':58,'heb':58,'he':58,'jacques':59,'jac':59,'jc':59,
    'jude':65,'jud':65,'jd':65,'apocalypse':66,'apoc':66,'ap':66,
    'sagesse':0,'sap':0,'siracide':0,'si':0,'baruc':0,'bar':0,'tobie':0,'tob':0,
    'judith':0,'jdt':0,'maccabees':0,'machabees':0,'ecclesiastique':0,
}
SPLIT = {'samuel':[9,10],'rois':[11,12],'chroniques':[13,14],'corinthiens':[46,47],
         'thessaloniciens':[52,53],'timothee':[54,55],'pierre':[60,61],'maccabees':[0]}

NAMES = '|'.join(sorted((k for k in BOOKS if len(k) > 2), key=len, reverse=True))
REF_RE = re.compile(
    r'\b((?:[1-4]\s*|I{1,3}\s*|IV\s*)?(?:' + NAMES + r'))\s+(\d{1,3})\s*[,;:]\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?',
    re.IGNORECASE)

def res_book2(name, p):
    base = BOOKS.get(name)
    if base is None:
        return None
    if base == 0:
        arr = SPLIT.get(name)
        if not arr or not p or p > len(arr) or not arr[p-1]:
            return None
        return arr[p-1]
    if (name in ('jean', 'jn')) and p:
        return 61 + p
    if p and base >= 9:
        return None
    return base

def res_book(raw):
    raw = norm(raw)
    m = re.match(r'^([1-4])\s*(.*)$', raw)
    if m:
        return res_book2(m.group(2), int(m.group(1)))
    m = re.match(r'^(I{1,3}|IV)\s*(.*)$', raw)
    if m:
        rom = {'I': 1, 'II': 2, 'III': 3, 'IV': 4}[m.group(1)]
        return res_book2(m.group(2), rom)
    return res_book2(raw, 0)

def verse_keys(b, c, v1, v2):
    c = str(int(c))
    v1 = int(v1)
    v2 = int(v2) if v2 else v1
    if v2 < v1:
        v1, v2 = v2, v1
    return ['%s:%s:%d' % (b, c, v) for v in range(v1, min(v2, v1 + 9) + 1)]

def main():
    # la page /sujets liste TOUS les sujets (le sitemap peut être tronqué
    # si le site limite le débit après plusieurs passages)
    idx_page = fetch(BASE + '/sujets')
    if not idx_page:
        sys.exit('index /sujets inaccessible')
    sujets = sorted(set(
        m.group(1) if m.group(1).startswith('http') else BASE + m.group(1)
        for m in re.finditer(r'href="(/sujets/[a-z0-9-]+)"', idx_page)
    ))
    if len(sujets) < 100:
        sm = fetch(BASE + '/sitemap.xml')
        if sm:
            sujets = sorted(set(u for u in re.findall(r'<loc>([^<]+)</loc>', sm)
                                if '/sujets/' in u and u.count('/') >= 4))
    print('pages sujets :', len(sujets))
    idx = {}
    ok = 0
    for n, url in enumerate(sujets, 1):
        h = fetch(url)
        if not h:
            continue
        time.sleep(DELAY)
        m_title = re.search(r'<h1[^>]*>(.*?)</h1>', h, re.S)
        sujet = clean(m_title.group(1)) if m_title else url.rsplit('/', 1)[-1]
        # citations dans l'ordre de la page, avec leur position
        quotes = []   # {pos, author, work, work_url, chap, quote}
        for m_sec in re.finditer(r'<section aria-label="Citations de ([^"]+)"(.*?)</section>', h, re.S):
            author = clean(m_sec.group(1))
            for m_chunk in re.finditer(r'<div id="q-\d+"(.*?)(?=<div id="q-\d+"|</section>)', m_sec.group(2), re.S):
                chunk = m_chunk.group(1)
                mq = re.search(r'<span>“(.*?)”</span>', chunk, re.S)
                if not mq:
                    continue
                quote = clean(mq.group(1))
                if len(quote) < 25:
                    continue
                mw = re.search(r'<a href="(/oeuvres/[^"]+)"[^>]*>(.*?)</a>', chunk, re.S)
                work = clean(mw.group(2)) if mw else ''
                work_url = (BASE + mw.group(1)) if mw else url
                mch = re.search(r'<span class="italic">([^<]*)</span>', chunk, re.S)
                chap = clean(mch.group(1)).lstrip(', ').strip() if mch else ''
                quotes.append({'pos': m_sec.start(2) + m_chunk.start(), 'author': author,
                               'work': work, 'work_url': work_url, 'chap': chap, 'quote': quote})
        if not quotes:
            continue
        # texte lisible de la page, dans l'ordre
        text = clean(re.sub(r'<script.*?</script>', ' ', h, flags=re.S))
        pos_map = []
        # positions approximatives : on balaye le html nettoyé par tranches de citation
        # (les positions du texte nettoyé ne correspondent plus au html — on
        # associe donc par SEGMENT : le texte entre deux citations successives
        # est le commentaire qui les relie ; chaque ref d'un segment est
        # rattachée à la citation qui PRÉCÈDE le segment, sinon à la première.)
        segments = re.split(r'<div id="q-\d+"', h)
        added = 0
        seen = set()
        for si, seg in enumerate(segments):
            seg_text = clean(seg)
            target = quotes[si - 1] if si >= 1 and si - 1 < len(quotes) else quotes[0]
            tid = id(target)
            for m in REF_RE.finditer(seg_text):
                b = res_book(m.group(1))
                if not b:
                    continue
                for key in verse_keys(b, m.group(2), m.group(3), m.group(4)):
                    if (key, tid) in seen:
                        continue
                    seen.add((key, tid))
                    idx.setdefault(key, []).append({
                        'a': target['author'], 'w': target['work'], 'wu': target['work_url'],
                        'ch': target['chap'], 's': sujet, 'su': url,
                        'q': target['quote'][:700] + ('…' if len(target['quote']) > 700 else '')
                    })
                    added += 1
        if added:
            ok += 1
        print('%3d/%d  %-55s %d refs' % (n, len(sujets), sujet[:55], added))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    meta = {'v': 1, 'source': 'traditionapostolique.fr', 'built': time.strftime('%Y-%m-%d'),
            'sujets': ok, 'entries': sum(len(v) for v in idx.values()), 'idx': idx}
    OUT.write_text(json.dumps(meta, ensure_ascii=False), encoding='utf-8')
    print('écrit', OUT, '—', ok, 'sujets,', meta['entries'], 'entrées,', len(idx), 'versets')

if __name__ == '__main__':
    main()
