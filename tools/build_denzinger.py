# -*- coding: utf-8 -*-
"""T6 — le Denzinger : les documents du magistère, en latin.

Source : **Denzinger, *Enchiridion symbolorum definitionum et declarationum*,
11e édition** revue par Clemens Bannwart S.J., Fribourg-en-Brisgau 1911 —
domaine public, archive.org (`enchiridionsymbo01denz`), 1,7 Mo d'OCR.

C'est la tranche la plus coûteuse du plan, et la moins docile.  Trois
mesures faites avant d'écrire une ligne, toutes les trois négatives :

* les **numéros marginaux** — ce qui fait la célébrité du Denzinger
  (« Denzinger 3020 ») — sont mal reconnus : on n'en retrouve qu'environ
  1100 sur 2200, et la suite n'est **pas monotone**.  On ne peut donc pas
  découper par numéro ;
* les **numéros de page imprimés** ne sont pas récupérables (67 lignes
  isolées sur ~950 pages, non monotones) : impossible de découper par page ;
* les **titres du corps**, eux, sont bons.  C'est la seule chose fiable, et
  c'est celle qu'on utilise.

Découpage retenu : une **section** par pontife ou par concile
(« S. LEO I M. 440—461. », « Conc. TRIDENTINUM 1545—1563. »), les sessions
et les canons devenant des chapitres à l'intérieur.

**Deux scans de la même édition existent** (`...01denz` et `...00denz`).
Mesuré : `...00denz` a le meilleur OCR pour la *table*, `...01denz` pour le
*corps*.  Comme les titres viennent du corps, on prend `...01denz`.  Ne pas
« corriger » les titres avec la table : un rapprochement par similarité de
nom (seuil 0,55) a remplacé « S. HYGINUS » par « S. ZOSIMUS » et produit un
corpus où chaque document était attribué au mauvais pontife — exactement ce
que la règle d'or du projet interdit.

Sortie : `denzinger/d<id>.js` + `index.js` + `names.js`, même forme que
`orthodox/` et `islamic/`.
"""
import json
import os
import re
import unicodedata
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'tools', '.denzinger_cache')
OUT = os.path.join(ROOT, 'denzinger')

IDENT = 'enchiridionsymbo01denz'
BASE_URL = 'https://archive.org/details/' + IDENT
AUTHOR = 'Denzinger (1819-1883) — 11e éd., Bannwart S.J., 1911'

# Bornes mesurees sur ce scan :
#   0-560    pages de garde du microfilm
#   600-823  les prefaces de Bannwart
#   823-2875 l'index chronologique (table des matieres)
#   2875     « SYMBOLUM APOSTOLICUM », premiere page du corps
#   39007    l'index alphabetique final : ce n'est plus du contenu
PREFACE_START = 600
BODY_START = 2875
BODY_END = 39007

YEAR = re.compile(r'\d{2,4}')
PAGE = re.compile(r'^[\s\d\.\-—ivxlcIVXLC\*]{1,12}$')
# Titre : il commence par un mot majuscule d'au moins trois lettres.  Sans
# ca, « VI 5, 24), CLEMENS X (ep. d. 20. Aug. 1628) » — une note — passait.
NAME_START = re.compile(r'^(?:S\.|Conc\.|€onc\.)?\s*[A-ZÀ-Ý]{3,}')

# En-tetes de page : ce ne sont jamais des titres.
RUNNING = {
    'Denzinger, Enchiridion.', 'Denzinger, Enchiridion', 'Index chronologicus.',
    'Index alphabeticus.', 'Numeri', 'Numeri novi', 'Num.', 'sqq.', 'veteres',
}
# Les grandes divisions, sans annee : elles echappent a la regle des dates.
MAJOR = ('SYMBOLUM APOSTOLICUM', 'SYMBOLA ANTIPRISCILLIANA', 'APPENDIX',
         'DOCUMENTA ROMANORUM PONTIFICUM')
# Sous-structure : ce sont des chapitres, pas des sections.
CHAP = re.compile(r'^(SESSIO|CANONES|CANON|DECRETUM|CAPUT|TEXTUS|FONTES|ACTA|'
                  r'COLLATIO|PROFESSIO|PRAEFATIO)\b')
# Sigles et renvois d'apparat : « ML 52, 865 D. », « cf. n. 12 », « sqq ».
SIGLA = re.compile(r'\b(ML|MG|PL|PG|CSEL|ASS|AL|Csp|cf\.|sqq?|n\.|ed\.|p\.|Num|Pag)')


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


def upper_ratio(l):
    letters = [c for c in l if c.isalpha()]
    if len(letters) < 4:
        return 0.0
    return sum(1 for c in letters if c.isupper()) / len(letters)


def read_lines(raw):
    return [re.sub(r'[ \t]{2,}', ' ', ln).strip() for ln in raw.split('\n')]


def is_section(l):
    """Un titre de section : pontife ou concile, avec une annee."""
    if not l or len(l) > 74 or l in RUNNING:
        return False
    if l.lstrip('•* ').startswith(MAJOR):
        return True
    if CHAP.match(l) or SIGLA.search(l) or not NAME_START.match(l):
        return False
    if len(YEAR.findall(l)) > 3:
        return False
    if not YEAR.search(l):
        return False
    # La particule « Conc. » est en minuscules : la compter ferait tomber
    # « Conc. NICAENUM I 325. » a 0,77 et Nicee disparaitrait du corpus.
    return upper_ratio(re.sub(r'^(?:S\.|Conc\.|€onc\.)\s*', '', l)) >= 0.8


def clean_title(l):
    """« 472 PIUS IX 1846-1 878. » -> « PIUS IX 1846—1878. »"""
    l = re.sub(r'\s+', ' ', l).strip().lstrip('•* ')
    l = re.sub(r'^\d{1,3}\s*\*?\s+(?=[A-Z])', '', l)   # numero de page colle
    l = re.sub(r'^[\\/]\w+\s+', '', l)                  # « \T CLEMENS VI »
    l = re.sub(r'([0-9])\s+([0-9]{2,4})', r'\1—\2', l)  # « 1846-1 878 »
    l = l.replace('YI', 'VI')                           # « CLEMENS YI »
    l = re.sub(r'[\s,;:\.]+$', '', l)
    return l.strip(' .—-\\')


def years_of(t):
    """Les annees d'un titre, avec les lettres que l'OCR prend pour des
    chiffres (« I676 » pour 1676).  Sert a reconnaitre deux variantes du
    meme pontife, qui sinon sortent en deux entrees."""
    out = []
    for y in YEAR.findall(t):
        y = y.translate(str.maketrans('IlOoSBG', '1100566'))
        if y.isdigit():
            out.append(y)
    return tuple(out)


def name_of(t):
    """La partie « nom » d'un titre, sans les annees : « PIUS IX »."""
    return re.sub(r'[\d(].*$', '', t).strip(' .—-,;')


def join_lines(buf):
    """Rassemble un paragraphe ; ressoude les mots coupes par l'OCR."""
    out = []
    for l in buf:
        if out and out[-1].endswith('-') and l[:1].islower():
            out[-1] = out[-1][:-1] + l
        else:
            out.append(l)
    return re.sub(r'\s+', ' ', ' '.join(out)).strip()


def junky(p):
    """Ni latin ni grec : c'est du bruit d'OCR."""
    words = [w for w in p.split() if len(w) >= 2]
    if len(words) < 4:
        return True
    alpha = sum(1 for w in words
                if sum(1 for c in w if c.isalpha()) / len(w) > 0.5)
    return alpha < 3


def source_ref(l):
    """« [Ex Encycl. «Libertas...», 20. Iunii 1888.] » -> le titre cite."""
    m = re.match(r'^\[?\s*(Ex|Ep\.|Ex Ep\.|Ex Encycl\.|Ex Bulla|Ex Const\.)\b(.*)$', l)
    if not m:
        return None
    t = m.group(2).strip(' .[]')
    t = re.sub(r'\s*,\s*\d{1,2}\s+\w+\s+\d{4}\s*$', '', t)
    return re.sub(r'\s+', ' ', t).strip(' .[]«»')[:90] or None


def paragraphs(lines, a, b, title):
    """-> [{'t': titre, 'p': [...]}] entre deux sections."""
    secs, cur, buf = [], {'t': title, 'p': []}, []

    def flush():
        if buf:
            p = join_lines(buf)
            if p and not junky(p):
                cur['p'].append(p)
            del buf[:]

    def new(title_):
        nonlocal cur
        if cur['p']:
            secs.append(cur)
        cur = {'t': title_, 'p': []}

    i = a
    while i < b:
        l = lines[i]
        if not l:
            flush()
            i += 1
            continue
        if PAGE.match(l) or l in RUNNING or l == title:
            i += 1
            continue
        if re.match(r'^[\*\^°†‡§]', l) and len(l) < 90:
            i += 1
            continue
        ref = source_ref(l)
        if ref and len(ref) > 12:
            flush()
            new(ref)
            i += 1
            continue
        if CHAP.match(l) and len(l) < 70 and upper_ratio(l) >= 0.6:
            flush()
            new(re.sub(r'\s+', ' ', l).strip(' .—-'))
            i += 1
            continue
        buf.append(l)
        i += 1
    flush()
    if cur['p']:
        secs.append(cur)
    return secs


# Alias generalistes : ils pointent vers les prefaces, la seule entree qui
# parle du livre lui-meme.
GENERAL = ['denzinger', 'enchiridion', 'enchiridion symbolorum',
           'enchiridion symbolorum definitionum', 'magistere', 'magistère',
           'documents du magistere', 'symboles de foi', 'professions de foi']

# Alias français : ce qu'un utilisateur francophone tape vraiment.  La cle
# est un fragment du titre normalise ; la valeur, les alias a ajouter.
# Les racines, pas les mots entiers : l'OCR ecorne la finale
# (« EPHESINU]1I », « CABTHAGINENSE ») et un fragment complet ne
# reconnaitrait pas le titre.
FR = [
    ('tridentinu', ['concile de trente', 'trente', 'tridentin']),
    ('nicaenu', ['nicee', 'concile de nicee', 'nicée']),
    ('constantinopolitanu', ['constantinople', 'concile de constantinople']),
    ('chalcedonens', ['chalcedoine', 'concile de chalcedoine', 'chalcédoine']),
    ('ephesinu', ['ephese', "concile d'ephese", 'éphèse']),
    ('florentinu', ['florence', 'concile de florence']),
    ('lateranens', ['latran', 'concile de latran', 'concile du latran']),
    ('lugdunens', ['lyon', 'concile de lyon']),
    ('ahausican', ['orange', "concile d orange"]),
    ('araustican', ['orange', "concile d orange"]),
    ('cabthaginens', ['carthage', 'concile de carthage']),
    ('carthaginens', ['carthage', 'concile de carthage']),
    ('toletanu', ['tolede', 'concile de tolede']),
    ('milevitanu', ['mileve', 'concile de mileve']),
    ('francofordens', ['francfort', 'concile de francfort']),
    ('fomoiuliens', ['frioul', 'concile de frioul']),
    ('foroiuliens', ['frioul', 'concile de frioul']),
    ('vaticanu', ['vatican i', 'concile vatican i', 'concile du vatican']),
    ('symbolum apostolicum', ['symbole des apotres', 'credo']),
    ('symbola antipriscilliana', ['symboles antipriscilliens']),
    ('appendix', ['appendice', 'supplement']),
    # Vatican I n'a pas de titre propre : il n'apparait que dans les
    # en-tetes de page doubles.  Ses documents sont dans Pie IX.
    ('pius ix', ['pie ix', 'pius ix', 'syllabus', 'ineffabilis deus',
                 'vatican i', 'concile vatican i', 'concile du vatican']),
    ('leo xiii', ['leon xiii', 'leo xiii', 'rerum novarum', 'libertas']),
    ('pius vi', ['pie vi', 'pius vi', 'auctorem fidei']),
    ('gregorius xvi', ['gregoire xvi', 'gregorius xvi', 'mirari vos']),
    ('benedictus xiv', ['benoit xiv', 'benedictus xiv']),
    ('clemens xi', ['clemens xi', 'clement xi', 'unigenitus']),
    ('innocentius x 1644', ['innocent x', 'innocentius x']),
    ('pius iv', ['pie iv', 'pius iv']),
    ('pius v', ['pie v', 'pius v']),
    ('leo x 1513', ['leon x', 'leo x', 'exsurge domine']),
    ('paulus iii', ['paul iii', 'paulus iii']),
    ('pius x', ['pie x', 'pius x', 'pascendi', 'lamentabili', 'modernisme']),
]


def register(names, eid, title):
    t = key(title)
    if len(t) > 4:
        names.setdefault(t, eid)


def write_entry(ent):
    with open(os.path.join(OUT, 'd%s.js' % ent['id']), 'w', encoding='utf-8') as f:
        f.write('window.__denzingerWorks = window.__denzingerWorks || {};\n')
        f.write('window.__denzingerWorks["%s"] = %s;\n'
                % (ent['id'], json.dumps(ent, ensure_ascii=False,
                                         separators=(',', ':'))))


def build_intro(lines, start, end):
    """Les prefaces de Bannwart : ce qu'est l'Enchiridion, d'ou viennent les
    numeros marginaux.  Point d'accroche des alias generalistes."""
    cur, buf = {'t': 'Praefatio', 'p': []}, []

    def flush():
        if buf:
            p = join_lines(buf)
            if p and not junky(p):
                cur['p'].append(p)
            del buf[:]

    for i in range(start, min(end, len(lines))):
        l = lines[i]
        if not l:
            flush()
        elif PAGE.match(l) or l in RUNNING or len(l) < 30:
            continue
        else:
            buf.append(l)
    flush()
    if not cur['p']:
        return None
    return {
        'id': 'dz_intro',
        'a': 'Bannwart, Clemens S.J. (1870-1936)',
        't': 'Introduction à l’Enchiridion (préfaces)',
        'u': BASE_URL,
        'c': [{'t': 'Praefatio', 's': [cur]}],
    }


def main():
    os.makedirs(OUT, exist_ok=True)
    raw = fetch('https://archive.org/download/%s/%s_djvu.txt' % (IDENT, IDENT),
                '%s.txt' % IDENT)
    lines = read_lines(raw)
    print('  %d lignes' % len(lines), flush=True)

    marks, last = [], None
    for i in range(BODY_START, min(BODY_END, len(lines))):
        if is_section(lines[i]):
            t = clean_title(lines[i])
            y = years_of(t) or (key(t),)
            if y == last:
                continue          # l'en-tete de page repete la section
            last = y
            marks.append((i, t))
    print('  %d sections' % len(marks), flush=True)

    ents = []
    for n, (i, t) in enumerate(marks):
        end = marks[n + 1][0] if n + 1 < len(marks) else BODY_END
        secs = paragraphs(lines, i + 1, end, t)
        if not secs:
            continue
        # deux frontieres pour une meme section : on fusionne
        if ents and ents[-1]['t'] == t:
            ents[-1]['c'][0]['s'].extend(secs)
            continue
        eid = 'dz_%03d' % (len(ents) + 1)
        ents.append({
            'id': eid, 'a': AUTHOR, 't': t, 'u': BASE_URL,
            'c': [{'t': t, 's': secs}],
        })
        print('    %-8s %-46s %d par.'
              % (eid, t[:46], sum(len(s['p']) for s in secs)), flush=True)

    intro = build_intro(lines, PREFACE_START, BODY_START - 1600)
    if intro:
        ents.insert(0, intro)
        print('    %-8s %-46s %d par.'
              % ('dz_intro', intro['t'][:46],
                 sum(len(s['p']) for s in intro['c'][0]['s'])), flush=True)

    index, names, total = {}, {}, 0
    for e in ents:
        write_entry(e)
        index[e['id']] = {'a': e['a'], 't': e['t'], 'n': len(e['c'])}
        register(names, e['id'], e['t'])
        register(names, e['id'], name_of(e['t']))
        total += os.path.getsize(os.path.join(OUT, 'd%s.js' % e['id']))
    for al in GENERAL:
        names.setdefault(key(al), 'dz_intro')
    for frag, als in FR:
        for e in ents:
            if frag in key(e['t']):
                for al in als:
                    names.setdefault(key(al), e['id'])

    with open(os.path.join(OUT, 'index.js'), 'w', encoding='utf-8') as f:
        f.write('window.__denzingerIndex = %s;\n'
                % json.dumps(index, ensure_ascii=False, separators=(',', ':')))
    with open(os.path.join(OUT, 'names.js'), 'w', encoding='utf-8') as f:
        f.write('window.__denzingerNames = %s;\n'
                % json.dumps(names, ensure_ascii=False, separators=(',', ':')))
    print('entrees : %d' % len(ents))
    print('corpus  : %.1f Mo' % (total / 1e6))
    print('alias   : %d' % len(names))


if __name__ == '__main__':
    main()
