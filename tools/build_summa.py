# -*- coding: utf-8 -*-
"""Aspire et structure la Somme théologique depuis newadvent.org.

Source : https://www.newadvent.org/summa/  (traduction anglaise dominicaine,
domaine public). 619 pages de questions, UNE PAGE = UNE QUESTION qui contient
tous ses articles.

Structure observée (vérifiée sur 1001.htm, pas supposée) :
    <h1>Question 1. The nature and extent of sacred doctrine</h1>
    <h2 id="article1">Article 1. Whether ... ?</h2>
    <p><strong>Objection 1.</strong> ...</p>
    <p><strong>On the contrary,</strong> ...</p>
    <p><strong>I answer that</strong> ...</p>
    <p><strong>Reply to Objection 1.</strong> ...</p>
    <h2 id="article2">Article 2. ...</h2>

Les libellés <strong> sont CONSERVÉS : c'est la structure dialectique de la
Somme (objection / sed contra / réponse / répliques), ce qui fait la valeur
théologique du texte.

Usage :
    py tools/build_summa.py --probe 1001        # prouver sur UNE question
    py tools/build_summa.py --build --limit 5   # essai sur 5 questions
    py tools/build_summa.py --build             # les 619

Le HTML brut est mis en cache (tools/.summa_cache/) : on ne re-télécharge
jamais deux fois la même page, ce qui évite de bourrer le serveur.
"""
import argparse
import html as html_mod
import json
import os
import re
import ssl
import sys
import time
import urllib.request
import urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'tools', '.summa_cache')
OUT = os.path.join(ROOT, 'summa')
BASE = 'https://www.newadvent.org/summa/'

DELAY = 0.9      # politesse envers le serveur
RETRIES = 3

CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36')

PARTS = {
    1: 'Prima Pars', 2: 'Prima Secundae', 3: 'Secunda Secundae',
    4: 'Tertia Pars', 5: 'Supplement',
}


def fetch(qid, use_cache=True):
    """Télécharge une page de question (avec cache disque)."""
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, '%d.html' % qid)
    if use_cache and os.path.isfile(path) and os.path.getsize(path) > 1000:
        return open(path, encoding='utf-8').read()

    url = BASE + '%d.htm' % qid
    last = None
    for attempt in range(RETRIES):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            r = urllib.request.urlopen(req, timeout=30, context=CTX)
            data = r.read().decode('utf-8', 'replace')
            if '<h1' not in data:
                raise ValueError('pas de <h1> : page inattendue')
            with open(path, 'w', encoding='utf-8') as f:
                f.write(data)
            time.sleep(DELAY)
            return data
        except Exception as e:
            last = e
            time.sleep(DELAY * (attempt + 1))
    raise RuntimeError('%d : echec (%s)' % (qid, last))


def text_of(fragment):
    """HTML -> texte propre, en gardant le texte des liens."""
    t = re.sub(r'(?is)<(script|style)[^>]*>.*?</\1>', ' ', fragment)
    t = re.sub(r'(?i)<br\s*/?>', ' ', t)
    t = re.sub(r'(?s)<[^>]+>', '', t)
    t = html_mod.unescape(t)
    t = t.replace('\xa0', ' ')
    t = re.sub(r'\s+', ' ', t)
    return t.strip()


def parse(qid, raw):
    """Extrait la question et ses articles. Retourne None si structure absente."""
    h1 = re.search(r'(?is)<h1[^>]*>(.*?)</h1>', raw)
    if not h1:
        return None
    q_title = text_of(h1.group(1))
    m = re.match(r'Question\s+(\d+)\.?\s*(.*)$', q_title)
    q_num = int(m.group(1)) if m else qid % 1000
    q_title = (m.group(2) if m else q_title).strip()

    # positions des articles
    arts = list(re.finditer(
        r'(?is)<h2[^>]*id="article(\d+)"[^>]*>(.*?)</h2>', raw))
    if not arts:
        arts = list(re.finditer(r'(?is)<h2[^>]*>(.*?)</h2>', raw))
        arts = [(None, a) for a in arts]

    out = []
    for i, a in enumerate(arts):
        if isinstance(a, tuple):
            a_num, title_html = i + 1, a[1]
        else:
            a_num, title_html = int(a.group(1)), a.group(2)
        start = a.end()
        end = arts[i + 1].start() if i + 1 < len(arts) else len(raw)
        block = raw[start:end]

        paras = []
        for p in re.finditer(r'(?is)<p[^>]*>(.*?)</p>', block):
            inner = p.group(1)
            lab = re.match(r'(?is)\s*<(strong|b)[^>]*>(.*?)</\1>', inner)
            label, rest = '', inner
            if lab:
                label = text_of(lab.group(2))
                rest = inner[lab.end():]
            txt = text_of(rest)
            if not txt:
                continue
            paras.append({'label': label, 'text': txt})

        a_title = text_of(title_html)
        a_title = re.sub(r'^Article\s+\d+\.?\s*', '', a_title).strip()
        out.append({
            'n': a_num,
            'title': a_title,
            'paragraphs': paras,
        })

    return {
        'id': str(qid),
        'part': qid // 1000,
        'question': q_num,
        'title': q_title,
        'articles': out,
    }


def render_text(q):
    """Rendu lisible pour inspection humaine."""
    L = []
    L.append('QUESTION %d — %s   (partie %d %s)'
             % (q['question'], q['title'], q['part'],
                PARTS.get(q['part'], '?')))
    for a in q['articles']:
        L.append('')
        L.append('  ARTICLE %d — %s' % (a['n'], a['title']))
        for p in a['paragraphs']:
            tag = ('[%s] ' % p['label']) if p['label'] else ''
            L.append('    %s%s' % (tag, p['text'][:150]))
    return '\n'.join(L)


def slice_js(q):
    """Tranche JS, même motif que bible/b1.js."""
    return ('window.__summaQuestions = window.__summaQuestions || {};\n'
            'window.__summaQuestions["%s"] = %s;\n'
            % (q['id'], json.dumps(q, ensure_ascii=False, separators=(',', ':'))))


def list_questions():
    """Liste les 619 questions depuis les 5 index de parties."""
    qids = []
    for p in range(1, 6):
        url = BASE + '%d.htm' % p
        req = urllib.request.Request(url, headers={'User-Agent': UA})
        h = urllib.request.urlopen(req, timeout=30, context=CTX).read().decode('utf-8', 'replace')
        found = sorted(set(int(x) for x in re.findall(r'summa/(\d{3,4})\.htm', h)
                           if x.isdigit() and len(x) == 4 and int(x) // 1000 == p))
        qids.extend(found)
        print('  partie %d (%s) : %d questions' % (p, PARTS[p], len(found)))
        time.sleep(DELAY)
    return sorted(set(qids))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--probe', type=int, metavar='QID',
                    help='aspire et affiche UNE question (ex. 1001)')
    ap.add_argument('--build', action='store_true',
                    help='genere summa/ pour toutes les questions')
    ap.add_argument('--limit', type=int, default=0,
                    help='borne le nombre de questions (--build)')
    ap.add_argument('--no-cache', action='store_true')
    args = ap.parse_args()

    if args.probe:
        raw = fetch(args.probe, use_cache=not args.no_cache)
        q = parse(args.probe, raw)
        if not q:
            print('ECHEC : structure inattendue sur %d' % args.probe)
            return 1
        print(render_text(q)[:2600])
        print('')
        print('articles : %d · paragraphes : %d'
              % (len(q['articles']),
                 sum(len(a['paragraphs']) for a in q['articles'])))
        return 0

    if args.build:
        qids = list_questions()
        if args.limit:
            qids = qids[:args.limit]
        print('questions a traiter : %d' % len(qids))
        os.makedirs(OUT, exist_ok=True)
        index, ok, bad = {}, 0, []
        for i, qid in enumerate(qids, 1):
            try:
                raw = fetch(qid, use_cache=not args.no_cache)
                q = parse(qid, raw)
                if not q:
                    raise ValueError('structure absente')
                with open(os.path.join(OUT, 's%s.js' % qid), 'w',
                          encoding='utf-8') as f:
                    f.write(slice_js(q))
                index[str(qid)] = {'q': q['question'], 't': q['title'],
                                   'p': q['part'],
                                   'a': len(q['articles'])}
                ok += 1
                if i % 25 == 0:
                    print('  %d/%d' % (i, len(qids)))
            except Exception as e:
                bad.append((qid, str(e)))
        with open(os.path.join(OUT, 'index.js'), 'w', encoding='utf-8') as f:
            f.write('window.__summaIndex = %s;\n'
                    % json.dumps(index, ensure_ascii=False, separators=(',', ':')))
        print('\nOK : %d · ECHECS : %d' % (ok, len(bad)))
        for qid, e in bad[:20]:
            print('  %d : %s' % (qid, e))
        return 0 if not bad else 1

    ap.print_help()
    return 0


if __name__ == '__main__':
    sys.exit(main())
