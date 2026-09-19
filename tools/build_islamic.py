# -*- coding: utf-8 -*-
"""T5 — le corpus islamique local : le hadith en français.

Le Coran (français + arabe) et le tafsir d'Ibn Kathir (anglais) étaient déjà
dans l'application.  Manquait le troisième pilier, le hadith — et il manquait
surtout en FRANÇAIS.

Source : **Houdas & Marçais, « Les traditions islamiques »**, la traduction
française du *Sahih* d'Al-Bukhari, 1903-1914, 4 tomes, domaine public,
archive.org (`lestraditionsisl0Nmuamuoft`).  Environ 6,7 Mo d'OCR.

Structure du livre, mesurée sur le texte :

    TITRE PREMIER.          <- le « livre » (kitab), en majuscules
    DE LA RÉVÉLATION ...    <- son nom, ligne suivante, en majuscules
    CHAPITRE PREMIER. — ... <- le chapitre (titre pouvant tenir plusieurs
                               lignes, jusqu'à la ligne vide)
    1. ...                  <- les traditions (hadiths) numérotées

Deux pièges, les mêmes que pour le *Service Book* :
  * les **en-têtes de page** répètent « TITRE xxx. » et « CHAPITRE xxx. » en
    haut de chaque page.  Un TITRE n'est un vrai titre que si la ligne
    suivante (non vide) est en majuscules — sinon c'est un en-tête au milieu
    du texte ;
  * un CHAPITRE d'en-tête répète le titre du chapitre déjà ouvert, donc la
    dédupplication par titre exact suffit.

Sortie : `islamic/i<id>.js` + `index.js` + `names.js`, même forme que
`orthodox/`.
"""
import json
import os
import re
import unicodedata
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'tools', '.islamic_cache')
OUT = os.path.join(ROOT, 'islamic')

VOLUMES = [
    (1, 'lestraditionsisl01muamuoft'),
    (2, 'lestraditionsisl02muamuoft'),
    (3, 'lestraditionsisl03muamuoft'),
    (4, 'lestraditionsisl04muamuoft'),
]
AUTHOR = 'Al-Bukhari (810-870) — trad. Houdas & Marçais'
BASE_URL = 'https://archive.org/details/'

# Majuscules obligatoires : sans ça la phrase « titre d'échange, mille
# dirhems… » (tome 4, en plein texte) passait pour un livre.
# Attention : la classe doit contenir C, D et M.
TITRE = re.compile(r'^T[Il1]TRE\s+(PREMIER|[IVXLCDM0-9]+[.,lI]*)')
CHAPITRE = re.compile(r'^CHAPITRE\s+', re.I)
DIGITS = re.compile(r'^[0-9\.\s,]*$')
END_MARK = re.compile(r'^TABLE DES MATI', re.I)


def fetch(url, name):
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, name)
    if os.path.exists(p) and os.path.getsize(p) > 1000:
        return open(p, encoding='utf-8', errors='replace').read()
    print('  telechargement %s' % url)
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    txt = urllib.request.urlopen(req, timeout=180).read().decode('utf-8', 'replace')
    with open(p, 'w', encoding='utf-8') as f:
        f.write(txt)
    return txt


def key(s):
    """La normalisation de theoNorm() côté application."""
    s = unicodedata.normalize('NFD', str(s or ''))
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = s.lower().replace('’', "'")
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def upperish(s):
    if not s:
        return False
    letters = [c for c in s if c.isalpha()]
    if len(letters) < 4:
        return False
    return sum(1 for c in letters if c.isupper()) / len(letters) >= 0.8


def join_lines(buf):
    """Rassemble un paragraphe ; ressoude les mots coupés par l'OCR."""
    out = []
    for l in buf:
        if out and out[-1].endswith('-') and l[:1].islower():
            out[-1] = out[-1][:-1] + l
        else:
            out.append(l)
    return re.sub(r'\s+', ' ', ' '.join(out)).strip()


def read_lines(raw):
    return [re.sub(r'[ \t]{2,}', ' ', ln).strip() for ln in raw.split('\n')]


def junky(p):
    """Ligne d'arabe passée à l'OCR (« ^^. V^^BMv ^I^hI »).

    Un paragraphe français a des mots ; ce bruit n'en a pas.
    """
    words = [w for w in p.split() if len(w) >= 2]
    if len(words) < 4:
        return True
    alpha = sum(1 for w in words
                if sum(1 for c in w if c.isalpha()) / len(w) > 0.6)
    return alpha < 3


def toc_start(lines):
    """Première ligne de la table des matières, ou len(lines).

    Piège mesuré : chaque tome porte **deux** séries de lignes « TITRE ».
    Celle du corps (numéros croissants), puis celle de la table des matières
    en fin de volume, en majuscules avec le nom après un tiret
    (« TITRE IV. — DES ABLUTIONS. »).  Les garder doublait le corpus et
    donnait des numéros absurdes (le numéro de la table écrasait celui du
    corps).  On coupe net.
    """
    for i, l in enumerate(lines):
        if END_MARK.match(l):
            return i
    return len(lines)


def find_books(lines, first=0):
    """-> [(index, rang)] des vrais titres de livre du corps.

    Le rang est **séquentiel**, pas le chiffre romain : l'OCR écorne les
    chiffres (« TITRE Ilï. » pour III, « VL » pour VI, « XL » pour XI) et un
    identifiant tiré du chiffre était faux une fois sur trois.  L'ordre du
    corps est fiable, le chiffre ne l'est pas.
    """
    out = []
    for i, l in enumerate(lines):
        if i < first or not TITRE.match(l):
            continue
        # Un « TITRE » isolé dont la ligne suivante n'est pas un nom en
        # majuscules est un bruit du texte, pas un livre.
        j = i + 1
        while j < len(lines) and not lines[j]:
            j += 1
        inline = len(l) > 22 or '—' in l or ' - ' in l
        if not inline and not (j < len(lines) and upperish(lines[j])):
            continue
        out.append((i, len(out) + 1))
    return out


VOWEL = re.compile(r'[aeiouyàâäéèêëîïôöûùüAEIOUYÀÂÄÉÈÊËÎÏÔÖÛÙÜ]')


def clean_name(s):
    """L'OCR colle aux noms de livre des puces, des guillemets et des
    appels de note (« DE L'UNITÉ DE DIEU ffl », « DES MALADES d) »)."""
    s = re.sub(r'\s+', ' ', s or '').strip()
    s = s.strip(' .—-•*"\'`')
    s = re.sub(r'\s*[(\[«]\s*[i1*]\s*[)\]]\s*$', '', s)
    # dernier mot sans voyelle et de moins de 4 lettres = bruit
    for _ in range(2):
        w = s.split()
        if w and len(w[-1]) <= 3 and not VOWEL.search(w[-1]):
            s = ' '.join(w[:-1])
    return s.strip(' .—-')


def book_name(lines, i):
    """Le nom du livre : la ligne en majuscules qui suit le TITRE.

    Le résidu inline (« TITRE LI Bis^). » → « Bis^) ») est un reste d'OCR,
    pas un nom : on ne le prend qu'à défaut de ligne suivante.
    """
    l = lines[i]
    m = TITRE.match(l)
    rest = l[m.end():].strip(' .—-')
    # « XCVII. — DE L'UNITÉ DE DIEU » : le numéro est déjà l'identifiant.
    rest = re.sub(r'^[IVXLCDMG0-9]+\s*[.\)]\s*(?:[—-]+\s*)?', '', rest).strip()
    j = i + 1
    while j < len(lines) and not lines[j]:
        j += 1
    # Le nom du livre manque parfois (OCR) : la ligne suivante est alors déjà
    # le premier CHAPITRE, en majuscules elle aussi.  Ne pas le prendre.
    if j < len(lines) and upperish(lines[j]) and not CHAPITRE.match(lines[j]):
        return clean_name(lines[j])
    return clean_name(rest) if len(rest) > 3 else ''


def chapters(lines, start, end):
    """-> [{'t': titre, 'p': [traditions]}] entre deux livres."""
    secs, cur, buf = [], {'t': '', 'p': []}, []

    def flush():
        if buf:
            p = join_lines(buf)
            if p:
                cur['p'].append(p)
            del buf[:]

    # Avant le premier CHAPITRE il n'y a que le bloc-titre du livre
    # (« DE LA FOI. » en majuscules) : ce n'est pas du contenu.
    i = start
    while i < end and not CHAPITRE.match(lines[i]):
        if END_MARK.match(lines[i]):
            break
        i += 1
    while i < end:
        l = lines[i]
        if END_MARK.match(l):
            break
        if CHAPITRE.match(l):
            flush()
            # le titre du chapitre peut tenir plusieurs lignes
            title = [l]
            i += 1
            while i < end and lines[i] and not CHAPITRE.match(lines[i]):
                title.append(lines[i])
                i += 1
            t = join_lines(title)
            # un en-tête de page répète le chapitre déjà ouvert
            if not (secs and secs[-1]['t'] == t and cur['p']):
                if cur['p'] or cur['t']:
                    secs.append(cur)
                    cur = {'t': '', 'p': []}
                cur['t'] = t
            continue
        if not l:
            flush()
            i += 1
            continue
        if DIGITS.match(l):
            i += 1
            continue
        buf.append(l)
        i += 1
    flush()
    if cur['p'] or cur['t']:
        secs.append(cur)
    return [s for s in secs if s['p']]


def build_volume(v, ident, first_id):
    raw = fetch('https://archive.org/download/%s/%s_djvu.txt' % (ident, ident),
                '%s.txt' % ident)
    lines = read_lines(raw)
    toc = toc_start(lines)
    marks = find_books(lines[:toc])
    print('  tome %d : %d lignes, TDM ligne %d, %d livres'
          % (v, len(lines), toc, len(marks)), flush=True)
    ents = []
    for n, (i, rank) in enumerate(marks):
        end = marks[n + 1][0] if n + 1 < len(marks) else toc
        secs = chapters(lines, i + 1, end)
        if not secs:
            continue
        name = book_name(lines, i)
        if not name:
            name = secs[0]['t'][:60] or ('Livre %d' % (n + 1))
        eid = 'bukh_%02d' % (first_id + n)
        title = clean_name(name) or ('Livre %d' % (n + 1))
        ents.append({
            'id': eid,
            'a': AUTHOR,
            't': title,
            'u': BASE_URL + ident,
            'c': [{'t': title, 's': secs}],
        })
        print('    %-10s %-52s %d traditions'
              % (eid, title[:52], sum(len(s['p']) for s in secs)), flush=True)
    return ents, lines, (marks[0][0] if marks else 0)


def build_intro(lines, first):
    """L'avant-propos de Houdas : ce qu'est un hadith, isnad, sahih…

    C'est la porte d'entrée naturelle du corpus, et le point d'accroche des
    alias génériques (« hadith », « boukhari »…)."""
    secs = []
    cur, buf = {'t': 'Avant-propos', 'p': []}, []

    def flush():
        if buf:
            p = join_lines(buf)
            if p:
                cur['p'].append(p)
            del buf[:]

    for i in range(0, first):
        l = lines[i]
        if not l:
            flush()
        elif DIGITS.match(l) or (upperish(l) and len(l) < 40):
            continue          # numéros de page et en-têtes
        else:
            buf.append(l)
    flush()
    cur['p'] = [p for p in cur['p'] if not junky(p)]
    if cur['p']:
        secs.append(cur)
    if not secs:
        return None
    return {
        'id': 'bukh_intro',
        'a': 'Houdas, Octave (1840-1916)',
        't': 'Introduction aux traditions islamiques',
        'u': BASE_URL + VOLUMES[0][1],
        'c': [{'t': 'Avant-propos', 's': secs}],
    }


# Alias génériques : ils pointent vers l'introduction, la seule entrée qui
# parle du hadith en général.
GENERAL = ['hadith', 'hadits', 'boukhari', 'bukhari', 'bokhari',
           'traditions islamiques', 'sahih', 'sunnah', 'sunna']


def register(names, eid, title):
    t = key(title)
    if len(t) > 4:
        names.setdefault(t, eid)


def write_entry(ent):
    with open(os.path.join(OUT, 'i%s.js' % ent['id']), 'w', encoding='utf-8') as f:
        f.write('window.__islamicWorks = window.__islamicWorks || {};\n')
        f.write('window.__islamicWorks["%s"] = %s;\n'
                % (ent['id'], json.dumps(ent, ensure_ascii=False,
                                         separators=(',', ':'))))


def main():
    os.makedirs(OUT, exist_ok=True)
    ents, first_lines, first_mark = [], None, 0
    for v, ident in VOLUMES:
        e, lines, mark = build_volume(v, ident, len(ents) + 1)
        if v == 1:
            first_lines, first_mark = lines, mark
        ents += e
    intro = build_intro(first_lines, first_mark)
    if intro:
        print('  %-10s %-52s %d paragraphes'
              % ('bukh_intro', intro['t'][:52],
                 sum(len(s['p']) for s in intro['c'][0]['s'])))
        ents.insert(0, intro)

    index, names, total = {}, {}, 0
    for e in ents:
        write_entry(e)
        index[e['id']] = {'a': e['a'], 't': e['t'], 'n': len(e['c'])}
        register(names, e['id'], e['t'])
        total += os.path.getsize(os.path.join(OUT, 'i%s.js' % e['id']))
    if intro:
        for al in GENERAL:
            names.setdefault(key(al), 'bukh_intro')

    with open(os.path.join(OUT, 'index.js'), 'w', encoding='utf-8') as f:
        f.write('window.__islamicIndex = %s;\n'
                % json.dumps(index, ensure_ascii=False, separators=(',', ':')))
    with open(os.path.join(OUT, 'names.js'), 'w', encoding='utf-8') as f:
        f.write('window.__islamicNames = %s;\n'
                % json.dumps(names, ensure_ascii=False, separators=(',', ':')))
    print('entrees : %d' % len(ents))
    print('corpus  : %.1f Mo' % (total / 1e6))
    print('alias   : %d' % len(names))


if __name__ == '__main__':
    main()
