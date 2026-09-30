#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""build_doctrines.py — extrait la base DOCTRINES de historicalchristian.faith
(dépôt GitHub public HistoricalChristianFaith/Doctrine-Database).

Chaque doctrine (151 pages) = question + TIMELINE de témoins (père, année,
position, texte) + ARGUMENTS (988 pages : claim / preuves / évaluation).

Sortie : tradition/doctrines.json
  { ds: [ { s: slug, t: titre, q: question,
            tl: [ {w: témoin+année+note, t: texte ≤700} ],
            ar: [ {q: question de l'argument, c: claim ≤600, a: évaluation ≤450} ] } ] }
Textes en anglais → bouton 🌐 FR (cache v171) dans l'app.

Usage : py -3.12 tools/build_doctrines.py [répertoire_du_dépôt]
"""
import json, re, sys, time, html as H
from pathlib import Path

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else 'C:/tmp/hcfdoc/Doctrine-Database-master')
DOCS = ROOT / 'docs' / 'doctrines'
OUT = Path(__file__).resolve().parent.parent / 'tradition' / 'doctrines.json'

def clean(s):
    s = re.sub(r'<[^>]+>', ' ', s)
    return H.unescape(re.sub(r'\s+', ' ', s)).strip()

def clip(s, n):
    return s[:n] + ('…' if len(s) > n else '')

def read(p):
    try:
        return p.read_text(encoding='utf-8', errors='replace')
    except Exception:
        return ''

def sections_between(h, tag_pat):
    """Rend [(titre, html_de_section)] pour chaque h2."""
    out = []
    for m in re.finditer(r'<h2[^>]*>(.*?)</h2>', h, re.S):
        start = m.end()
        nxt = re.search(r'<h2[^>]*>', h[start:])
        end = start + nxt.start() if nxt else len(h)
        out.append((clean(m.group(1)), h[start:end]))
    return out

def para_after(h, marker):
    """Premier <p>…</p> (nettoyé) qui suit le marker (h1 du titre)."""
    i = h.find(marker)
    if i < 0:
        return ''
    m = re.search(r'<p[^>]*>(.*?)</p>', h[i:i+8000], re.S)
    return clean(m.group(1)) if m else ''

def main():
    if not DOCS.exists():
        sys.exit('dépôt introuvable : %s' % DOCS)
    t0 = time.time()
    ds = []
    pages = sorted(DOCS.glob('*.html'))
    print('doctrines :', len(pages))
    for f in pages:
        h = read(f)
        if not h or '<h1' not in h:
            continue
        title = clean(re.search(r'<h1[^>]*>(.*?)</h1>', h, re.S).group(1))
        # question = premier paragraphe après le h1
        q = para_after(h, '</h1>')
        # timeline : la section <h2>Timeline</h2> contient un <h3> par témoin
        tl = []
        mtl = re.search(r'<h2[^>]*>\s*Timeline\s*</h2>(.*?)(?=<h2|$)', h, re.S)
        if mtl:
            for m in re.finditer(r'<h3[^>]*>(.*?)</h3>', mtl.group(1), re.S):
                wt = clean(m.group(1))
                start = m.end()
                nxt = re.search(r'<h3[^>]*>', mtl.group(1)[start:])
                end = start + (nxt.start() if nxt else len(mtl.group(1)) - start)
                body = clean(mtl.group(1)[start:end])
                if wt and len(body) >= 60:
                    tl.append({'w': wt, 't': clip(body, 700)})
        # arguments : docs/doctrines/<slug>/arguments/*.html
        ar = []
        adir = f.parent / f.stem / 'arguments'
        for af in sorted(adir.glob('*.html')):
            ah = read(af)
            if not ah or '<h1' not in ah:
                continue
            aq = clean(re.search(r'<h1[^>]*>(.*?)</h1>', ah, re.S).group(1))
            sec = dict(sections_between(ah, 'h2'))
            claim = clip(sec.get('The claim', ''), 600)
            assess = clip(sec.get('Assessment', ''), 450)
            adv = clip(sec.get('Adversarial assessment', ''), 0)  # réservé
            if not claim:
                continue
            ar.append({'q': clip(aq, 160), 'c': claim, 'a': assess,
                       'u': 'https://historicalchristian.faith/doctrine/doctrines/%s/arguments/%s'
                            % (f.stem, af.name)})
        ds.append({'s': f.stem, 't': title, 'q': clip(q, 700), 'tl': tl, 'ar': ar})
    meta = {'v': 1, 'source': 'historicalchristian.faith (Doctrine-Database)',
            'built': time.strftime('%Y-%m-%d'), 'n': len(ds),
            'args': sum(len(d['ar']) for d in ds), 'ds': ds}
    OUT.write_text(json.dumps(meta, ensure_ascii=False), encoding='utf-8')
    print('écrit', OUT, '—', len(ds), 'doctrines,', meta['args'], 'arguments,',
          round(OUT.stat().st_size/1048576, 1), 'Mo,', round(time.time()-t0), 's')

if __name__ == '__main__':
    main()
