# -*- coding: utf-8 -*-
"""T4 — le corpus orthodoxe local.

Deux sources, l'une et l'autre dans le domaine public :

  A. Hapgood, « Service Book of the Holy Orthodox-Catholic Apostolic
     Church » (1906), archive.org cu31924029363128.  C'est le texte qui
     manquait le plus : liturgie, mystères, office divin, grandes fêtes.
     L'OCR est propre ; les titres de section y sont des lignes entièrement
     en majuscules, les en-têtes de page (« running heads ») portent un
     numéro.

  B. Schaff, « Creeds of Christendom » vol. II (CCEL, ThML) — les symboles
     grecs et russes : la Confession orthodoxe de Pierre Mogila (1643), la
     Confession de Dositheus (Jérusalem, 1672), le Grand Catéchisme de
     Philaret.  Le XML est déjà en cache et le parseur ThML est repris de
     build_reformed.

Sortie : orthodox/o<id>.js + index.js + names.js.  Même forme que
`reformed/` : une œuvre = {'id', 'a', 't', 'u', 'c' : [{'t', 's' : [{'t',
'p' : [...]}]}]}.
"""
import html
import json
import os
import re
import sys
import unicodedata
import urllib.request
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
CACHE = os.path.join(ROOT, 'tools', '.orthodox_cache')
OUT = os.path.join(ROOT, 'orthodox')

HAPGOOD_URL = 'https://archive.org/download/cu31924029363128/' \
              'cu31924029363128_djvu.txt'
SCHAFF_URL = 'https://ccel.org/ccel/schaff/creeds2'

# --------------------------------------------------------------- utilitaires
def fetch(url, name, delay=0.0):
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, name)
    if os.path.exists(p) and os.path.getsize(p) > 1000:
        return open(p, encoding='utf-8', errors='replace').read()
    print('  telechargement %s' % url)
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    raw = urllib.request.urlopen(req, timeout=120).read()
    txt = raw.decode('utf-8', 'replace')
    with open(p, 'w', encoding='utf-8') as f:
        f.write(txt)
    return txt


def key(s):
    """Exactement la normalisation de theoNorm() côté application.

    Les clés d'alias DOIVENT passer par la même fonction que la requête,
    sinon un alias accentué ne sera jamais retrouvé (theoNorm retire les
    diacritiques de la citation mais pas des clés).
    """
    s = unicodedata.normalize('NFD', str(s or ''))
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = s.lower().replace('’', "'")
    s = re.sub(r'[^a-z0-9]+', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


# ------------------------------------------------------------ A. le Service Book
# Bornes mesurées sur le texte OCR (indices de lignes, stables : le
# nettoyage ne supprime jamais de ligne, il les vide au pire).
HAP = [
    ('h_symbolism',   'The Symbolism of the Church',                        2454),
    ('h_vigil',       'The All-Night Vigil Service',                        3221),
    ('h_hours',       'The Canonical Hours',                                6259),
    ('h_liturgy',     'The Divine Liturgy of St John Chrysostom',           7839),
    ('h_presanct',    'The Liturgy of the Presanctified Gifts',            12995),
    ('h_compline',    'The Office of Grand Compline',                      14990),
    ('h_nativtheo',   'Nativity of the Most Holy Birth-giver of God',      16074),
    ('h_cross',       'Elevation of the Precious Cross',                   16173),
    ('h_entrance',    'Entrance of the Birth-giver of God into the Temple', 16467),
    ('h_nativity',    'The Nativity of Christ',                            16571),
    ('h_theophany',   'The Holy Epiphany and the Blessing of Waters',      17168),
    ('h_meeting',     'The Meeting of the Lord',                           18108),
    ('h_annunciation', 'The Annunciation',                                 18284),
    ('h_palms',       'The Entrance of the Lord into Jerusalem',           18526),
    ('h_thursday',    'Great Thursday',                                    18688),
    ('h_friday',      'Great and Holy Friday',                             19082),
    ('h_pascha',      'Great Saturday and Holy Pascha',                    19439),
    ('h_ascension',   'The Ascension of our Lord',                         20778),
    ('h_pentecost',   'Pentecost (Whitsunday)',                            20967),
    ('h_transfig',    'The Transfiguration of the Lord',                   21720),
    ('h_dormition',   'The Falling-asleep of the Birth-giver of God',      22042),
    ('h_churching',   'Prayers at Childbirth and the Churching of Women',  22142),
    ('h_baptism',     'Holy Baptism and Chrismation',                      22416),
    ('h_confession',  'The Rite of Confession',                            23378),
    ('h_marriage',    'The Rite of Holy Matrimony',                        23628),
    ('h_orders',      'Ordinations',                                       24708),
    ('h_unction',     'Visitation of the Sick and Holy Unction',           26260),
    ('h_burial',      'The Order for the Burial of the Dead',              28508),
    ('h_panikhida',   'The Panikhida for the Departed',                    32796),
    ('h_converts',    'The Reception of Converts',                         33944),
    ('h_blessings',   'The Lesser Blessing of Water and of Objects',       34970),
    ('h_church',      'The Founding and Consecration of a Church',         35563),
    ('h_thanks',      'Services of Thanksgiving',                          37595),
    ('h_manyyears',   'Many Years, House and Blessing of Objects',         40366),
    ('h_prayer',      'A General Service of Prayer',                       40438),
    ('h_requiem',     'The General Panikhida or Requiem Service',          40738),
    ('h_communion',   'Prayers in Preparation for Holy Communion',         41123),
    ('h_tones',       'The Eight Tones (Oktoikh)',                         41397),
    ('h_appendix',    'Appendix — Explanation of the Services',            42261),
]
HAP_END = 43567          # avant l'errata
PAGE_NUM = re.compile(r'^\d+\s+|\s+\d+$|^[ivxlc]+\s+', re.I)
JUNK = re.compile(r'[\^~#|]{2,}')
DIGITISH = re.compile(r'^[0-9\.\s,]*$')
# Un numéro de page mal OCRisé : chiffres, ou lettres que l'OCR confond avec
# des chiffres (« 28o », « xxxi », « II8 », « 3SS »…).
DIGITISH_TOKEN = re.compile(r'^[0-9oOlIilsSxzZvVgbqBQG^]{1,4}$')
# Pages d'illustration que l'OCR a retournées.  Deux occurrences dans tout
# le volume : une liste vaut mieux qu'une heuristique qui risquerait
# d'emporter de vrais titres.
MIRRORED = {'HDHAHD 3H1 JO WSnOaiMAS SHX'}


def strip_pagenum(t):
    t = re.sub(r'\s*\([0-9ivxlc]+\)\s*$', '', t, flags=re.I)
    parts = t.split()
    while len(parts) > 1 and DIGITISH_TOKEN.match(parts[0]):
        parts.pop(0)
    while len(parts) > 1 and DIGITISH_TOKEN.match(parts[-1]):
        parts.pop()
    return ' '.join(parts).strip(' .,')


def clean_lines(raw):
    """-> (lignes nettoyées, masque 'h' pour les titres de section)."""
    lines = [re.sub(r'[ \t]{2,}', ' ', ln).strip() for ln in raw.split('\n')]

    def norm_head(s):
        s = re.sub(r'^\d+\s+', '', s)
        s = re.sub(r'\s+\d+$', '', s)
        s = re.sub(r'^[ivxlc]+\s+', '', s, flags=re.I)
        return re.sub(r'[*]', '', s).strip()

    def upperish(s):
        if not s or len(s) > 80:
            return False
        letters = [c for c in s if c.isalpha()]
        if len(letters) < 6:
            return False
        return sum(1 for c in letters if c.isupper()) / len(letters) >= 0.85

    ups = [norm_head(s) for s in lines if upperish(s)]
    cnt = Counter(ups)

    out, kind = [], []
    for i, s in enumerate(lines):
        if not s:
            out.append('')
            kind.append('')
            continue
        n = norm_head(s)
        up = upperish(s)
        if up and (PAGE_NUM.search(s) or cnt[n] >= 8):
            out.append('')            # en-tête courant de page
            kind.append('')
            continue
        if DIGITISH.match(s) or JUNK.search(s):
            out.append('')
            kind.append('')
            continue
        if up:
            t = strip_pagenum(re.sub(r'\s*\*+$', '', s))
            if not t or t in MIRRORED:
                out.append('')
                kind.append('')
                continue
            out.append(t)
            kind.append('h')
            continue
        out.append(s)
        kind.append('p')
    return out, kind


def join_lines(buf):
    """Rassemble les lignes d'un paragraphe ; ressoude les mots coupés."""
    out = []
    for l in buf:
        if out and out[-1].endswith('-') and l[:1].islower():
            out[-1] = out[-1][:-1] + l
        else:
            out.append(l)
    return re.sub(r'\s+', ' ', ' '.join(out)).strip()


def slices(lines, kind, start, end):
    """-> [{'t': titre de section, 'p': [paragraphes]}]."""
    secs, cur_t, buf = [], '', []

    def emit(p):
        """Range un paragraphe dans la section courante."""
        if not p:
            return
        if secs and secs[-1]['t'] == cur_t:
            secs[-1]['p'].append(p)
        else:
            secs.append({'t': cur_t, 'p': [p]})

    for i in range(start, min(end, len(lines))):
        if kind[i] == 'h':
            emit(join_lines(buf))
            buf = []
            t = lines[i]
            if secs and not secs[-1]['p']:
                # Un titre qui suit un titre sans paragraphe : soit l'OCR a
                # coupé le titre par une césure (« THE ORDI- » / « NATION
                # OF A DEACON »), soit c'est un surtitre.  On recolle.
                prev = secs[-1]['t']
                secs[-1]['t'] = (prev[:-1] + t) if prev.endswith('-') \
                    else ((prev + ' ' + t).strip() if prev else t)
                cur_t = secs[-1]['t']
                continue
            # Un titre déjà ouvert qui se répète n'ouvre pas de section :
            # c'est l'en-tête de page.  Comparaison EXACTE, car « THE OFFICE
            # OF HOLY BAPTISM » et « … HOLY CHRISMATION » partagent leurs 18
            # premières lettres mais sont deux sections distinctes.
            if not (secs and secs[-1]['t'].upper() == t.upper()):
                secs.append({'t': t, 'p': []})
                cur_t = t
            continue
        if not lines[i]:
            emit(join_lines(buf))
            buf = []
            continue
        buf.append(lines[i])
    emit(join_lines(buf))
    return [s for s in secs if s['p']]


def build_hapgood(raw):
    lines, kind = clean_lines(raw)
    ents = []
    for n, (eid, title, start) in enumerate(HAP):
        end = HAP[n + 1][2] if n + 1 < len(HAP) else HAP_END
        secs = slices(lines, kind, start, end)
        if not secs:
            print('  %-14s VIDE' % eid)
            continue
        ents.append({
            'id': eid,
            'a': 'Église orthodoxe d’Orient',
            't': title,
            'u': 'https://archive.org/details/cu31924029363128',
            'c': [{'t': title, 's': secs}],
        })
        print('  %-14s %-52s %d paragraphes'
              % (eid, title[:52], sum(len(s['p']) for s in secs)), flush=True)
    return ents


# ------------------------------------------------------- B. les symboles grecs
# (titre du div2/div3, id, auteur)
# Le motif est ANCRE.  Piège mesuré : le volume II est une édition critique
# qui ne donne les symboles qu'en GREC et en LATIN (en colonnes parallèles,
# donc dans des <table> que le parseur écarte).  Le texte anglais des
# confessions de l'Église grecque est dans le volume I, chapitre 3.
SCH = [
    ('creeds1', r'^Chapter 2\.', 's_oecumenical',
     'Schaff, Philip (1819-1893)'),
    ('creeds1', r'^Chapter 3\.', 's_greekchurch',
     'Schaff, Philip (1819-1893)'),
    ('creeds2', r'^Rules of Faith', 's_rules', 'Pères de l’Église'),
    ('creeds2', r'^The Longer Catechism', 's_philaret',
     'Philaret de Moscou (1782-1867)'),
]
SCH_SKIP = re.compile(r'index|facsimile|table of|title page|subject|words and phrases',
                      re.I)


def fix_titles(x):
    """Remonte `title="…"` juste après le nom de la balise.

    Le tokenizer de build_reformed ne lit le titre que s'il suit immédiate-
    ment `<divN`.  Or creeds2 écrit `<div2 id="…" title="…">` : tous les
    titres passaient à la trappe.  On réécrit la chaîne d'attributs au lieu
    de réécrire le parseur, pour rester compatible avec les deux volumes.
    """
    def repl(m):
        attrs = m.group(2)
        t = re.search(r'title="([^"]*)"', attrs)
        if not t:
            return m.group(0)
        rest = attrs[:t.start()] + attrs[t.end():]
        return '<%s title="%s"%s>' % (m.group(1), t.group(1), rest)
    return re.sub(r'<(div[123])([^>]*)>', repl, x)


def find_divs(node, pat, out=None):
    out = [] if out is None else out
    for k in node.kids:
        if k.kind == 'div':
            if re.search(pat, k.t or '', re.I):
                out.append(k)
            find_divs(k, pat, out)
    return out


def chapters_of(node, flatten):
    """Divisions à présenter comme « livres » : on descend tant qu'il n'y
    en a qu'une, sinon on s'arrête au niveau qui en offre plusieurs."""
    kids = [k for k in node.kids if k.kind == 'div']
    while len(kids) == 1:
        sub = [k for k in kids[0].kids if k.kind == 'div']
        if not sub:
            break
        kids = sub
    if not kids:
        return [flatten(node)]
    return [flatten(k) for k in kids]


def build_schaff():
    import build_reformed as br
    trees, ents = {}, []
    for vol, pat, eid, author in SCH:
        if vol not in trees:
            page = br.fetch('https://ccel.org/ccel/schaff/%s' % vol,
                            'page_schaff_%s.htm' % vol)
            m = re.search(r'href="(/ccel/[^"]*?/schaff/%s\.xml)"' % vol, page or '')
            if not m:
                print('  %s : pas de XML' % vol)
                trees[vol] = None
                continue
            x = br.fetch('https://ccel.org' + m.group(1), 'schaff_%s.xml' % vol)
            meta, tree = br.parse_work(fix_titles(x))
            rights = (meta.get('rights') or '').strip()
            if rights and 'public domain' not in rights.lower():
                print('  %s REFUSE (droits : %s)' % (vol, rights))
                trees[vol] = None
                continue
            trees[vol] = tree
            print('  %s : %s' % (vol, (meta.get('title') or '')[:64]))
        tree = trees[vol]
        if tree is None:
            continue

        divs = find_divs(tree, pat)
        divs = [d for d in divs if not SCH_SKIP.match(d.t or '')]
        if not divs:
            print('  %-14s introuvable' % eid)
            continue
        # la division la plus riche, pas la première : les volumes répètent
        # les titres (une notice historique, puis le texte intégral).
        best = max(divs, key=lambda d: len(json.dumps(br.flatten_chapter(d))))
        chaps = chapters_of(best, br.flatten_chapter)
        chaps = [c for c in chaps if c['s'] and not SCH_SKIP.match(c['t'] or '')]
        if not chaps:
            print('  %-14s vide' % eid)
            continue
        t = re.sub(r'\s*\(?\d*\)?\s*$', '', best.t or eid).strip()
        ents.append({'id': eid, 'a': author, 't': t,
                     'u': 'https://ccel.org/ccel/schaff/' + vol,
                     'c': chaps})
        print('  %-14s %-52s %d parties'
              % (eid, t[:52], len(chaps)), flush=True)
    return ents


# ------------------------------------------------------------------ les alias
# Clés : fragment de titre normalisé (accents et ponctuation retirés).
# Valeurs : alias français, écrits naturellement — ils sont normalisés à
# l'enregistrement.
FR = {
    'symbolism of the church': ['symbolisme de l eglise', 'symbolisme de l eglise orthodoxe'],
    'all night vigil': ['vigile', 'grandes vetres', 'vepres', 'matines', 'office de la vigile'],
    'canonical hours': ['les heures', 'office des heures', 'prime', 'tierce', 'sexte', 'none', 'psaumes typiques'],
    'divine liturgy of st john chrysostom': ['liturgie de saint jean chrysostome', 'liturgie de saint jean bouche d or', 'divine liturgie', 'liturgie byzantine', 'messe orthodoxe'],
    'presanctified': ['liturgie des presanctifies', 'presanctifies', 'messe des presanctifies'],
    'grand compline': ['grandes complies', 'complies'],
    'nativity of the most holy birth giver': ['nativite de la mere de dieu', 'nativite de la vierge'],
    'elevation of the precious cross': ['exaltation de la croix', 'elevation de la croix', 'croix'],
    'entrance of the birth giver': ['entree de la mere de dieu au temple', 'presentation de la vierge'],
    'nativity of christ': ['nativite du christ', 'noel', 'naissance du christ'],
    'holy epiphany': ['theophanie', 'epiphanie', 'benediction des eaux'],
    'meeting of the lord': ['rencontre du seigneur', 'purification', 'presentation de jesus au temple', 'chandeleur'],
    'annunciation': ['annonciation'],
    'entrance of the lord into jerusalem': ['rameaux', 'dimanche des rameaux', 'entree a jerusalem'],
    'great thursday': ['jeudi saint'],
    'great and holy friday': ['vendredi saint', 'grand vendredi'],
    'great saturday and holy pascha': ['paques', 'samedi saint', 'resurrection', 'heures de paques'],
    'ascension': ['ascension'],
    'pentecost': ['pentecote'],
    'transfiguration': ['transfiguration'],
    'falling asleep': ['dormition', 'assomption'],
    'churching': ['relevailles', 'prieres apres l accouchement'],
    'holy baptism': ['bapteme', 'bapteme orthodoxe'],
    'chrismation': ['chrismation', 'confirmation'],
    'rite of confession': ['confession', 'penitence', 'sacrement de penitence'],
    'holy matrimony': ['mariage', 'couronnement du mariage', 'fiancailles'],
    'ordinations': ['ordination', 'ordination des pretres', 'sacrement de l ordre', 'consécration d un eveque'],
    'holy unction': ['onction', 'sacrement des saintes huiles', 'huile sainte', 'visite des malades'],
    'burial of the dead': ['funerailles', 'enterrement', 'office des funerailles'],
    'panikhida': ['panikhida', 'office des defunts'],
    'reception of converts': ['reception des convertis'],
    'lesser blessing of water': ['petite benediction des eaux', 'benediction des objets'],
    'founding and consecration of a church': ['dedicace d une eglise', 'consécration d une eglise', 'fondation d une eglise'],
    'thanksgiving': ['action de grace', 'te deum'],
    'many years': ['grand many years', 'priere pour une maison'],
    'general service of prayer': ['office de priere generale'],
    'general panikhida': ['requiem', 'grand panikhida'],
    'preparation for holy communion': ['prieres avant la communion', 'preparation a la communion', 'action de grace apres la communion'],
    'eight tones': ['huit tons', 'oktoikh', 'canons des huit tons'],
    'appendix': ['explication des offices', 'appendice'],
    'rules of faith': ['regles de foi', 'regle de foi', 'symboles ante niceens', 'credo d irenee', 'credo de tertullien'],
    'cumenical creeds': ['symboles oecumeniques', 'symbole de nicee', 'symbole de nicee constantinople', 'symbole de chalcedoine', 'symbole athanasien', 'symbole des apotres'],
    'creeds of the greek church': ['eglise grecque', 'confessions de l eglise grecque', 'confession orthodoxe', 'confession de mogila', 'synode de jerusalem', 'confession de dosythee', 'confession de dostthee', 'eglises orientales'],
    'confession of dositheus': ['confession de dostthee', 'confession de dosythee', 'synode de jerusalem', 'dix huit decrets', 'confession orthodoxe de dosythee'],
    'longer catechism': ['grand catechisme', 'catechisme de philaret', 'catechisme orthodoxe'],
}


def register(names, eid, title):
    t = key(title)
    if len(t) > 4:
        names.setdefault(t, eid)
    for frag, aliases in FR.items():
        if key(frag) in t:
            for al in aliases:
                names.setdefault(key(al), eid)


def write_entry(ent):
    with open(os.path.join(OUT, 'o%s.js' % ent['id']), 'w', encoding='utf-8') as f:
        f.write('window.__orthodoxWorks = window.__orthodoxWorks || {};\n')
        f.write('window.__orthodoxWorks["%s"] = %s;\n'
                % (ent['id'], json.dumps(ent, ensure_ascii=False,
                                         separators=(',', ':'))))


def main():
    os.makedirs(OUT, exist_ok=True)
    print('A. Service Book (Hapgood 1906)')
    ents = build_hapgood(fetch(HAPGOOD_URL, 'hapgood_1906.txt'))
    print('B. Symboles grecs et russes (Schaff, Creeds vol. II)')
    ents += build_schaff()

    index, names, total = {}, {}, 0
    for e in ents:
        write_entry(e)
        index[e['id']] = {'a': e['a'], 't': e['t'], 'n': len(e['c'])}
        register(names, e['id'], e['t'])
        total += os.path.getsize(os.path.join(OUT, 'o%s.js' % e['id']))

    with open(os.path.join(OUT, 'index.js'), 'w', encoding='utf-8') as f:
        f.write('window.__orthodoxIndex = %s;\n'
                % json.dumps(index, ensure_ascii=False, separators=(',', ':')))
    with open(os.path.join(OUT, 'names.js'), 'w', encoding='utf-8') as f:
        f.write('window.__orthodoxNames = %s;\n'
                % json.dumps(names, ensure_ascii=False, separators=(',', ':')))
    print('entrees : %d' % len(ents))
    print('corpus  : %.1f Mo' % (total / 1e6))
    print('alias   : %d' % len(names))


if __name__ == '__main__':
    main()
