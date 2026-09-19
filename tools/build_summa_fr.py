# -*- coding: utf-8 -*-
"""La Somme théologique **en français** — le dernier trou du corpus.

Source : **Drioux (abbé Claude-Joseph), *La Somme théologique de saint
Thomas d'Aquin***, 8 volumes, ~1851-1865, domaine public, archive.org
(`lasommethologi0Nthom`), 26 Mo d'OCR.

Pourquoi celle-là et pas une autre : deux traductions françaises intégrales
sont disponibles, **Lachat** (16 volumes) et **Drioux** (8 volumes).  Mesuré :
l'édition Lachat est **bilingue**, latin et français entrelacés ligne à ligne,
ce qui rend l'extraction du seul français incertaine.  Drioux est **français
seul**.  C'est donc Drioux.

## Ce que la mesure a donné (rien n'est deviné)

Structure d'une question :

    QUESTION II.                        <- en-tête (chiffre romain)
    DIEU EXISTE-T-IL?                   <- titre, en majuscules
    <introduction>
    ARTICLE I. — <titre>                <- article
    1. Il semble que ...                <- objection
    Mais c'est le contraire. ...         <- sed contra
    CONCLUSION. — ...                    <- résumé
    Il faut répondre que ...             <- corpus de l'article

Cinq pièges, tous mesurés sur l'OCR :

1. chaque volume finit par une **table des matières** qui répète ses
   questions.  Volume 4 l'intitule « CONTENUES DANS LE QUATRIÈME VOLUME » et
   non « TABLE DES MATIÈRES » — on coupe sur les deux formes.  Volume 7
   contient en plus 55 000 lignes d'index latin après la table : même coupe.
2. les **mots-clés sont eux-mêmes mangés** par l'OCR : `QIESTION`, `OIJESTION`,
   `giiKsrioN`, `OIKSTION`, `QUESTIOxN`, `QUESTlOiN`, `QU^ESTIO`, `QLESTION`.
   On ne cherche donc pas une chaîne exacte mais une **forme** : 6 à 11
   lettres, initiale Q/O/G/C/I, finale N ou O, contenant `ST` ou `SR`.
3. les **chiffres romains sont illisibles** en décodage direct (`XIL` lu 39,
   `XLV` lu 85).  On génère donc *toutes* les valeurs romaines **syntaxiquement
   valides** que le token peut représenter, chaque caractère ayant ses
   confusions documentées (G→C, U→V ou II, Y→V, H→II, J→I, L→L ou I…), puis
   on choisit celle que la **séquence attend**.
4. le numéro retenu n'est **jamais** le chiffre lu : c'est la position dans la
   suite, contrôlée par le compte de questions de chaque volume (74, 84, 75,
   91, 98, 71, 19, 99 — soit 611, le compte canonique).
5. le volume 8 se termine par un **APPENDICE** de deux questions après la
   q. XCIX ; elles sont numérotées 100 et 101 et marquées `appendix`.

Sortie : `summafr/s<p><qqq>.js` + `index.js`, **la même forme que `summa/`**
(mêmes identifiants : `1001` = partie 1 question 1).
"""
import itertools
import json
import os
import re
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = os.path.join(ROOT, 'tools', '.summafr_cache')
OUT = os.path.join(ROOT, 'summafr')

VOLUMES = ['lasommethologi0%dthom' % i for i in range(1, 9)]
AUTHOR = "Thomas d'Aquin (1225-1274) — trad. Drioux"

# La Somme est decoupee en 5 parties ; on sait ou chaque volume commence.
PART_NAMES = {1: 'Prima Pars', 2: 'Prima Secundae', 3: 'Secunda Secundae',
              4: 'Tertia Pars', 5: 'Supplementum'}
PART_TITLES = {1: 'PREMIÈRE PARTIE', 2: 'PREMIÈRE PARTIE DE LA SECONDE PARTIE',
               3: 'SECONDE PARTIE DE LA SECONDE PARTIE',
               4: 'TROISIÈME PARTIE', 5: 'SUPPLÉMENT'}
# (partie, numero de la premiere question du volume)
VOL_START = {1: (1, 1), 2: (1, 75), 3: (2, 40), 4: (3, 1), 5: (3, 92),
             6: (4, 1), 7: (4, 72), 8: (5, 1)}
# rang de la premiere question de la partie suivante, a l'interieur du volume.
# Seul le volume 2 chevauche deux parties (Prima Pars 75-119, puis Prima
# Secundae 1-39).  Mesure : 119 - 75 + 1 = 45.
VOL_SPLIT = {1: None, 2: 45, 3: None, 4: None, 5: None, 6: None, 7: None,
             8: None}
# compte de questions par volume, mesure puis verifie a chaque generation
# (le volume 8 = Supplementum 1-99 + les 2 questions de l'appendice)
VOL_EXPECT = {1: 74, 2: 84, 3: 75, 4: 91, 5: 98, 6: 71, 7: 19, 8: 101}

# --- chiffres romains -------------------------------------------------------
# confusions d'OCR relevees une par une sur le corpus
CANDS = {'I': ('I',), 'L': ('L', 'I'), 'V': ('V',), 'U': ('V', 'II'),
         'Y': ('V', 'II'), 'X': ('X',), 'C': ('C',), 'G': ('C',), 'E': ('C',),
         'D': ('D',), 'M': ('M', 'III'), 'H': ('II',), 'N': ('II',),
         'J': ('I',), 'F': ('I',), 'T': ('I',), 'R': ('I',), '1': ('I',),
         '!': ('I',), '[': ('I',), ']': ('I',), '|': ('I',),
         u'Ï': ('I',), u'Î': ('I',)}
ROMAN_RX = re.compile(r'^(M*)(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$')
ROMAN_VAL = {'M': 1000, 'D': 500, 'C': 100, 'L': 50, 'X': 10, 'V': 5, 'I': 1}

# --- lignes -----------------------------------------------------------------
# « ARTICULUS I. » (les deux questions restees en latin), « AKTICLE II. »,
# « ARTICULIJS I. », « ARTICLE I. »… : meme mot, orthographies d'OCR
# differentes.  Une liste fermee ne suffit pas (mesure : « AKTICLE » passait
# a travers et faisait avaler l'article suivant), d'ou la distance approchee.
ARTICLE = re.compile(r'^(?:ARTIC|ARÏIC|ABTIC|AHTIC|APITIC|AUTIC|ART1C|AKTIC|RTIC)')
ARTICLE_LOOSE = re.compile(r'IC[UE]L|ICU')
ARTICLE_WORDS = ('ARTICLE', 'ARTICULUS')


def lev(a, b):
    """Distance d'edition, pour reconnaitre un mot-clé massacre par l'OCR."""
    if abs(len(a) - len(b)) > 3:
        return 4
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1,
                           prev[j - 1] + (ca != cb)))
        prev = cur
    return prev[-1]
PAGE = re.compile(r'^[\s\d\.\-—ivxlcIVXLC\*]{1,10}$')
NOTE = re.compile(r'^\(\s*[IVXLC0-9]')
OBJ = re.compile(r'^(\d{1,2}|[il]{1,3})[°\.\)\]]\s*(.*)$')
ROMAN_HEAD = re.compile(r'\b[IVXLCDM]{1,8}\b')


def fetch(ident):
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, ident + '.txt')
    if os.path.exists(p) and os.path.getsize(p) > 100000:
        return open(p, encoding='utf-8', errors='replace').read()
    print('  telechargement %s' % ident)
    req = urllib.request.Request(
        'https://archive.org/download/%s/%s_djvu.txt' % (ident, ident),
        headers={'User-Agent': 'Mozilla/5.0'})
    txt = urllib.request.urlopen(req, timeout=300).read().decode('utf-8', 'replace')
    with open(p, 'w', encoding='utf-8') as f:
        f.write(txt)
    return txt


def rval(s):
    tot = p = 0
    for c in reversed(s):
        v = ROMAN_VAL[c]
        tot = tot - v if v < p else tot + v
        p = max(p, v)
    return tot


def romans(tok):
    """Toutes les valeurs romaines valides que ce token peut representer."""
    if tok[:1] in '([':
        return ()
    # attention : ne pas supprimer « ! » ni « [ » (lus pour I), sinon « !X »
    # (pour IX) devient « X » et 9 se lit 10.  Les parentheses, elles,
    # signalent un appel de note : on les refuse.
    if tok[:1] == '(':
        return ()
    u = re.sub(u'[ .,:;—\\-\'"()]', '', tok.upper())
    pool = []
    for c in u:
        if c == '0':
            continue
        if c not in CANDS:
            return ()
        pool.append(CANDS[c])
    if not pool or len(pool) > 10:
        return ()
    n = 1
    for p in pool:
        n *= len(p)
    if n > 4096:
        return ()
    out = set()
    for combo in itertools.product(*pool):
        s = ''.join(combo)
        if ROMAN_RX.match(s):
            v = rval(s)
            if 0 < v <= 200:
                out.add(v)
    return tuple(sorted(out))


def is_kw(t):
    """Le mot-cle QUESTION, meme massacré par l'OCR."""
    u = re.sub(r'[^A-ZÀ-Ý]', '', t.upper())
    return (6 <= len(u) <= 11 and u[0] in 'QOGIC' and u[-1] in 'NO'
            and ('ST' in u or 'SR' in u))


def read_lines(raw):
    return [re.sub(r'[ \t]{2,}', ' ', ln).strip() for ln in raw.split('\n')]


def upperish(l):
    letters = [c for c in l if c.isalpha()]
    if len(letters) < 4:
        return False
    return sum(1 for c in letters if c.isupper()) / len(letters) >= 0.8


def drop(l):
    """Une ligne qui n'est pas du texte : folio, en-tête, appel de note."""
    if not l:
        return True
    if PAGE.match(l):
        return True
    if NOTE.match(l):
        return True
    # titre courant de page, meme massacré (« 30 SOMME TIiÊOL0€IQCE... »)
    if len(l) < 70 and re.search(r'SOMME\s+T[IHL1]', l.upper()):
        return True
    if l.isupper() and len(l) < 62 and re.search(r'\d{1,4}\s*$', l):
        return True
    return False


def join_lines(buf):
    """Rassemble un paragraphe ; ressoude les mots coupes par l'OCR."""
    out = []
    for l in buf:
        if out and out[-1].endswith('-') and l[:1].islower():
            out[-1] = out[-1][:-1] + l
        else:
            out.append(l)
    return re.sub(r'\s+', ' ', ' '.join(out)).strip()


def label_of(t):
    """L'etiquette d'un paragraphe d'article, d'apres son debut."""
    m = OBJ.match(t)
    if m:
        g = m.group(1).lower()
        return 'Objection %s.' % (OBJLBL.get(g) or int(g) if g.isdigit() else g)
    if re.match(r'^Mais c.?est le contraire', t):
        return 'Sed contra.'
    if re.match(r'^CONCLUSION', t):
        return 'Conclusion.'
    if re.match(r'^(Il faut r|Réponse|Je réponds)', t):
        return 'Réponse.'
    if re.match(r'^(Réponse à|Il faut répondre aux|Aux )', t):
        return 'Réponse aux objections.'
    return ''


# appel de note de fin de titre, y compris massacré : « (1) », « (2) », « (!}? »
FOOT = re.compile(r'\s*[\(\[]\s*[0-9iIvxl]{0,3}[^A-Za-zÀ-ÿ]{0,2}[\)\]]?\s*$')
ART_IN_TITLE = re.compile(r'\bARTIC\w*\b')


def clean_title(t):
    t = re.sub(r'\s+', ' ', t).strip(' .—-')
    # le titre a parfois englouti la ligne d'article suivante
    m = ART_IN_TITLE.search(t)
    if m and m.start() > 8:
        t = t[:m.start()]
    # le point d'interrogation final fait partie du titre : on le garde
    q = t.endswith('?')
    if q:
        t = t[:-1]
    for _ in range(3):
        t2 = FOOT.sub('', t)
        t2 = re.sub(r'\s*\d{1,4}\s*$', '', t2)
        if t2 == t:
            break
        t = t2
    t = t.replace('\\', '').replace('^', '')
    t = re.sub(r'\s+', ' ', t).strip(' .—-')
    return (t + '?') if q and t else t


# Deux questions (IIa-IIae q.154, Supplementum q.64) sont restees en latin
# chez Drioux : on ne les presente pas pour du francais, on les marque.
FR_MARKS = ('il semble', 'il faut répondre', "c'est le contraire")
LA_MARKS = ('utrùm', 'utrum', 'quaeritur', 'respondeo', 'dicendum',
            'proceditur', 'praeterea')


def lang_of(e):
    txt = ' '.join(p['text'] for a in e['articles'] for p in a['paragraphs'])
    txt = txt.lower()
    fr = sum(txt.count(m) for m in FR_MARKS)
    la = sum(txt.count(m) for m in LA_MARKS)
    # latin seulement si AUCUN marqueur francais : sinon c'est du francais
    # qui cite du latin (verifie sur Suppl. q.41 et q.49)
    return 'la' if fr == 0 and la >= 3 else 'fr'


JUNK = '<>[]{}^~\\@#%&*|'


def noisy(t):
    """Une ligne que l'OCR a reduite en bouillie (mesure : seuil 3 %)."""
    if len(t) < 20:
        return False
    return sum(t.count(c) for c in JUNK) / len(t) > 0.03


def body_end(lines):
    """Coupe le volume a sa table des matieres (deux intitules possibles)."""
    for j, l in enumerate(lines):
        u = l.upper()
        if (u.startswith('TABLE DES MATI') or 'CONTENUES DANS LE' in u) and len(l) < 70:
            return j
    return len(lines)


def find_heads(lines, end):
    """-> [(ligne, valeurs possibles)] dans l'ordre du document.

    L'OCR coupe parfois le chiffre romain (« QUESTION XXX !X. » pour
    XXXIX) : on essaye donc le token seul, puis colle au suivant.  Toutes
    les lectures possibles sont retenues ; c'est la suite qui tranche.
    """
    out = []
    for j in range(end):
        l = lines[j]
        if not l or len(l) > 40:
            continue
        tk = l.split()
        for k, t in enumerate(tk[:-1]):
            if not is_kw(t):
                continue
            r = set(romans(tk[k + 1]))
            if k + 2 < len(tk):
                r |= set(romans(tk[k + 1] + tk[k + 2]))
            if k + 3 < len(tk):
                r |= set(romans(tk[k + 1] + tk[k + 2] + tk[k + 3]))
            if r:
                out.append((j, tuple(sorted(r))))
                break
    return out


def title_of(lines, j, end):
    """Le titre d'une question : la ligne (ou les 2) qui suit l'en-tête."""
    k = j + 1
    while k < end and not lines[k]:
        k += 1
    if k >= end:
        return ''
    t = clean_title(lines[k])
    nxt = k + 1
    while nxt < end and not lines[nxt]:
        nxt += 1
    # un titre coupe par l'OCR sur deux lignes (ex. « ... AVEC LE PÉCHÉ »
    #                                                « ORIGINEL SEUL. »)
    if nxt < end and len(t) > 25 and upperish(lines[nxt]) and len(lines[nxt]) < 40:
        t = clean_title(t + ' ' + lines[nxt])
    if not t or len(t) < 3:
        return ''
    return t


# « ARTICLE » suivi d'un chiffre : c'est un en-tête.  Sans le chiffre, c'est
# le mot courant (« article. C'est ainsi que... ») — piege mesure sur la q.2.
ARTICLE_NUM = re.compile(
    r'^artic\w{0,6}(?:[.\-—–:]+\s*|\s+)[IVXLCDM0-9]{1,6}(?![A-Za-zÀ-ÿ\'])', re.I)
# le chiffre a fondu dans du texte (« ARTICLE UAfIQUE. — » pour UNIQUE) :
# on accepte un pseudo-chiffre suivi d'un separateur, sur une ligne courte.
ARTICLE_TXT = re.compile(
    r'^artic\w{0,6}(?:[.\-—–:]+\s*|\s+)[A-Za-z0-9\\\'\^]{1,9}[.\-—–]\s*\S', re.I)
OBJLBL = {'i': 1, 'ii': 2, 'iii': 3, 'l': 1, 'il': 2}


def is_article(l):
    # « ARTICLE I. — <titre> » : le titre peut etre long, on ne coupe pas.
    if ARTICLE_NUM.match(l):
        return True
    if len(l) > 70:
        return False
    if ARTICLE_TXT.match(l):
        return True
    u = l.upper()
    head = re.split(r'[^A-ZÀ-Ý]', u)[0]
    if not (5 <= len(head) <= 12):
        return False
    if min(lev(head, w) for w in ARTICLE_WORDS) > 3:
        return False
    # « U\IQUE » pour UNIQUE : le chiffre est parfois illisible, la ligne
    # reste reconnaissance a sa casse et a sa brievete.
    return upperish(l) or bool(ROMAN_HEAD.search(l))


def article_title(l):
    t = re.sub(r'^[^—\-–]*[—\-–]', '', l, count=1)
    return clean_title(t) or clean_title(l)


def parse_volume(vno, ident):
    """-> (entrees, rapport) pour un volume."""
    lines = read_lines(fetch(ident))
    end = body_end(lines)
    heads = find_heads(lines, end)
    # Le numero n'est JAMAIS le chiffre lu : c'est le rang dans la suite.
    # Le chiffre lu ne sert qu'a confirmer (on compte les confirmations).
    part0, q0 = VOL_START[vno]
    split = VOL_SPLIT[vno]
    placed = []          # (ligne, partie, numero, valeurs lues)
    lu = 0
    for idx, (j, cands) in enumerate(heads):
        if split is not None and idx >= split:
            part, num = part0 + 1, idx - split + 1
        else:
            part, num = part0, q0 + idx
        if num in cands:
            lu += 1
        placed.append((j, part, num, cands))
    out = []
    for idx, (j, part, num, _c) in enumerate(placed):
        stop = placed[idx + 1][0] if idx + 1 < len(placed) else end
        cur = {'id': '%d%03d' % (part, num), 'part': part, 'question': num,
               'title': title_of(lines, j, stop), 'intro': [], 'articles': []}
        article = None
        buf = []

        def flush():
            if not buf:
                return
            p = join_lines(buf)
            del buf[:]
            if len(p) < 12 or noisy(p):
                return
            if article is not None:
                lab = label_of(p)
                if lab.startswith('Objection '):
                    p = OBJ.sub(r'\2', p, count=1).strip()
                article['paragraphs'].append({'label': lab, 'text': p})
            else:
                cur['intro'].append(p)

        for k in range(j + 1, stop):
            l = lines[k]
            if is_article(l):
                flush()
                article = {'n': len(cur['articles']) + 1,
                           'title': article_title(l), 'paragraphs': []}
                cur['articles'].append(article)
            elif drop(l):
                flush()
            elif l:
                buf.append(l)
            else:
                flush()
        flush()
        out.append(cur)
    rep = {'volume': vno, 'end': end, 'heads': len(heads),
           'expect': VOL_EXPECT[vno], 'conf': lu,
           'last': (placed[-1][2] if placed else 0),
           'articles': sum(len(e['articles']) for e in out)}
    return out, rep


def write_entry(e, appendix, lang):
    ent = {'id': e['id'], 'part': e['part'], 'question': e['question'],
           'title': e['title'], 'articles': e['articles']}
    if e['intro']:
        ent['intro'] = e['intro']
    if appendix:
        ent['appendix'] = True
    if lang != 'fr':
        ent['lang'] = lang
    with open(os.path.join(OUT, 's%s.js' % e['id']), 'w', encoding='utf-8') as f:
        f.write('window.__summaFrQuestions = window.__summaFrQuestions || {};\n')
        f.write('window.__summaFrQuestions["%s"] = %s;\n'
                % (e['id'], json.dumps(ent, ensure_ascii=False,
                                       separators=(',', ':'))))


def main():
    os.makedirs(OUT, exist_ok=True)
    ents = []
    bad = 0
    for vno, v in enumerate(VOLUMES, 1):
        got, rep = parse_volume(vno, v)
        ok = rep['heads'] == rep['expect']
        bad += 0 if ok else 1
        pct = 100.0 * rep['conf'] / max(1, rep['heads'])
        print('  %-24s %3d/%3d questions, %4d articles, fin q.%-3d '
              'chiffres confirmes %3.0f%% %s'
              % (v, rep['heads'], rep['expect'], rep['articles'], rep['last'],
                 pct, 'OK' if ok else 'ANOMALIE'), flush=True)
        ents += got
    if bad:
        print('  !! %d volume(s) en anomalie — corpus non ecrit' % bad)
        return 1
    total = 0
    latin = []
    for e in ents:
        lang = lang_of(e)
        if lang != 'fr':
            latin.append(e['id'])
        write_entry(e, e['question'] > 99, lang)
        total += os.path.getsize(os.path.join(OUT, 's%s.js' % e['id']))
    index = {}
    for e in ents:
        index[e['id']] = {'q': e['question'], 't': e['title'],
                          'p': e['part'], 'a': len(e['articles'])}
        if e['id'] in latin:
            index[e['id']]['l'] = 'la'
    with open(os.path.join(OUT, 'index.js'), 'w', encoding='utf-8') as f:
        f.write('window.__summaFrIndex = %s;\n'
                % json.dumps(index, ensure_ascii=False, separators=(',', ':')))
    bypart = {}
    for e in ents:
        bypart[e['part']] = bypart.get(e['part'], 0) + 1
    arts = sum(len(e['articles']) for e in ents)
    print('questions : %d' % len(ents))
    print('articles  : %d' % arts)
    print('par partie:', dict(sorted(bypart.items())))
    print('en latin  : %s' % (latin or 'aucune'))
    print('corpus    : %.1f Mo' % (total / 1e6))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
