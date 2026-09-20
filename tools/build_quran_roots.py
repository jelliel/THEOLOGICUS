"""Construit le corpus « racines » du Coran a partir du Quranic Arabic Corpus.

Source : derive du Quranic Arabic Corpus (Dr Kais Dukes, universite de
Leeds) — **GNU GPL**, et sa notice precise « CHANGING IT IS NOT
ALLOWED ». On respecte donc les deux contraintes :
  1. le fichier source est LIVRE TEL QUEL dans quranroots/ (copie
     verbatim, jamais reecrite) ;
  2. l'application l'utilise avec attribution visible + lien
     corpus.quran.com (voir LICENCES).

Le fichier decoupe les mots en SEGMENTS (بِ + سْمِ pour بِسْمِ). Notre
texte et l'API comptent un mot la ou lui en compte deux : on regroupe
par (sourate, verset, mot) et on prend la racine du premier segment qui
en porte une (le prefixe « بِ » n'en a pas, la tige oui).

Meme regle d'or que pour le mot a mot : si le nombre de mots ne
correspond pas au notre, le verset est ignore, jamais devine.
"""
import io, json, os, re, shutil

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QURAN = os.path.join(RACINE, 'quran')
SORTIE = os.path.join(RACINE, 'quranroots')
SOURCE = os.path.join(RACINE, '.workbuddy-ai', 'artifacts', '_m', 'data', 'morph_master.txt')

SIGNES = re.compile('[\u06d6-\u06ed\u08e2]')
RE_ROOT = re.compile(r'ROOT:([^|]+)')
RE_LEM = re.compile(r'LEM:([^|]+)')


def notre_arabe(num):
    p = os.path.join(QURAN, 'q%d.js' % num)
    txt = io.open(p, encoding='utf-8').read()
    j = txt.find(']=')
    i = txt.find('{', j if j >= 0 else 0)
    obj = json.loads(txt[i:txt.rfind('}') + 1])
    out = {}
    for k, v in obj['versets'].items():
        a = (v.get('arabe') or '').replace('\ufeff', '').strip()
        out[int(k)] = [m for m in re.split(r'\s+', a) if m and not SIGNES.fullmatch(m)]
    return out


def main():
    if not os.path.exists(SOURCE):
        print('source absente :', SOURCE)
        return 1
    os.makedirs(SORTIE, exist_ok=True)

    # Copie verbatim (condition de la licence GPL du corpus).
    dst = os.path.join(SORTIE, 'quran-morphology.txt')
    if not os.path.exists(dst):
        shutil.copyfile(SOURCE, dst)
        print('copie verbatim :', dst, os.path.getsize(dst), 'octets')

    # s:v -> mot -> (racine, lemme, pos)
    par_verset = {}
    with io.open(SOURCE, encoding='utf-8') as f:
        for ligne in f:
            ligne = ligne.rstrip('\n').rstrip('\r')
            if not ligne:
                continue
            parts = ligne.split('\t')
            if len(parts) < 3:
                continue
            cle = parts[0]
            morceaux = cle.split(':')
            if len(morceaux) != 4:
                continue
            try:
                s, v, w = int(morceaux[0]), int(morceaux[1]), int(morceaux[2])
            except ValueError:
                continue
            pos = parts[2].strip() if len(parts) > 2 else ''
            feat = parts[3] if len(parts) > 3 else ''
            m_root = RE_ROOT.search(feat)
            m_lem = RE_LEM.search(feat)
            bucket = par_verset.setdefault((s, v), {})
            cur = bucket.get(w)
            if cur is None:
                cur = [None, None, pos]
                bucket[w] = cur
            # Le premier segment porteur de racine gagne (la tige, pas le prefixe).
            if m_root and not cur[0]:
                cur[0] = m_root.group(1).strip()
            if m_lem and not cur[1]:
                cur[1] = m_lem.group(1).strip()

    total_mots = 0
    avec_racine = 0
    desaccords = []
    versets_couverts = 0

    for num in range(1, 115):
        nous = notre_arabe(num)
        livre = {}
        for v in sorted(nous):
            attendu = len(nous[v])
            bucket = par_verset.get((num, v)) or {}
            if not bucket:
                continue
            maxw = max(bucket)
            if maxw != attendu:
                desaccords.append((num, v, attendu, maxw))
                continue
            suite = []
            for w in range(1, attendu + 1):
                r, lem, pos = bucket.get(w) or [None, None, '']
                suite.append([r or '', lem or '', pos or ''])
                total_mots += 1
                if r:
                    avec_racine += 1
            livre[str(v)] = suite
            versets_couverts += 1
        with io.open(os.path.join(SORTIE, 'q%d.js' % num), 'w', encoding='utf-8', newline='') as f:
            f.write('(window.__quranRoots=window.__quranRoots||{})[%d]=' % num)
            f.write(json.dumps(livre, ensure_ascii=False, separators=(',', ':')))
            f.write(';')

    with io.open(os.path.join(SORTIE, 'index.js'), 'w', encoding='utf-8', newline='') as f:
        f.write('window.__quranRootsIndex=' +
                json.dumps({str(n): n for n in range(1, 115)}, separators=(',', ':')) + ';')

    print()
    print('mots traites        : %d' % total_mots)
    print('dont avec racine    : %d (%.1f %%)' % (avec_racine, 100.0 * avec_racine / max(1, total_mots)))
    print('versets couverts    : %d' % versets_couverts)
    print('versets en desaccord: %d (ignores)' % len(desaccords))
    for d in desaccords[:8]:
        print('   S%d:%d  nous=%d mots  corpus=%d' % d)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
