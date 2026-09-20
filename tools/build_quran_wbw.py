"""Construit le corpus « mot a mot » du Coran.

Source : api.quran.com/api/v4 (glose anglaise + translitteration par mot).

REGLE D'OR : un mot a mot decale est pire que pas de mot a mot. On ne
fait donc jamais confiance a l'API les yeux fermes : pour chaque verset
on verifie que le nombre de mots de l'API correspond au nombre de mots
de NOTRE texte arabe (signes d'annotation coraniques exclus). En cas de
desaccord, le verset est **ignore** et compte dans le rapport — on
n'affiche jamais une glose qui pourrait etre attachee au mauvais mot.

Sortie : quranwbw/qN.js = (window.__quranWbw=...)[N] = { verset: [[glose, translit], ...] }
"""
import io, json, os, re, sys, time, urllib.request

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QURAN = os.path.join(RACINE, 'quran')
SORTIE = os.path.join(RACINE, 'quranwbw')

SIGNES = re.compile('[\u06d6-\u06ed\u08e2]')
UA = 'theologicus-build/1.0'


def notre_arabe(num):
    p = os.path.join(QURAN, 'q%d.js' % num)
    txt = io.open(p, encoding='utf-8').read()
    j = txt.find(']=')
    i = txt.find('{', j if j >= 0 else 0)
    obj = json.loads(txt[i:txt.rfind('}') + 1])
    out = {}
    for k, v in obj['versets'].items():
        a = (v.get('arabe') or '').replace('\ufeff', '').strip()
        mots = [m for m in re.split(r'\s+', a) if m and not SIGNES.fullmatch(m)]
        out[int(k)] = mots
    return out


def api_verses(num):
    """Rend {numero_verset: [(glose, translit), ...]}."""
    out, page = {}, 1
    while True:
        url = ('https://api.quran.com/api/v4/verses/by_chapter/%d'
               '?language=en&words=true&per_page=50&page=%d' % (num, page))
        req = urllib.request.Request(url, headers={'User-Agent': UA})
        for essai in range(3):
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    d = json.loads(r.read().decode('utf-8'))
                break
            except Exception:
                if essai == 2:
                    raise
                time.sleep(2)
        for v in d.get('verses', []):
            n = v.get('verse_number')
            mots = [w for w in v.get('words', []) if w.get('char_type_name') == 'word']
            out[n] = [((w.get('translation') or {}).get('text') or '',
                       (w.get('transliteration') or {}).get('text') or '') for w in mots]
        pages = (d.get('pagination') or {}).get('total_pages', 1)
        if page >= pages:
            break
        page += 1
        time.sleep(0.25)
    return out


def main():
    os.makedirs(SORTIE, exist_ok=True)
    total_mots = 0
    total_versets = 0
    desaccords = []
    vides = 0

    for num in range(1, 115):
        try:
            nous = notre_arabe(num)
            api = api_verses(num)
        except Exception as e:
            print('sourate %d : ECHEC %s' % (num, e))
            continue
        livre = {}
        for v in sorted(nous):
            attendu = len(nous[v])
            obtenu = api.get(v) or []
            if attendu != len(obtenu):
                desaccords.append((num, v, attendu, len(obtenu)))
                continue
            if not attendu:
                vides += 1
                continue
            # Filet supplementaire : une glose vide sur un verset complet
            # n'apporte rien, mais on garde le verset (la translitteration
            # peut etre presente meme sans glose).
            livre[str(v)] = obtenu
            total_mots += attendu
            total_versets += 1
        with io.open(os.path.join(SORTIE, 'q%d.js' % num), 'w', encoding='utf-8', newline='') as f:
            f.write('(window.__quranWbw=window.__quranWbw||{})[%d]=' % num)
            f.write(json.dumps(livre, ensure_ascii=False, separators=(',', ':')))
            f.write(';')
        if num % 20 == 0:
            print('  ... %d/114 sourates' % num, flush=True)

    idx = {str(n): n for n in range(1, 115)}
    with io.open(os.path.join(SORTIE, 'index.js'), 'w', encoding='utf-8', newline='') as f:
        f.write('window.__quranWbwIndex=' + json.dumps(idx, separators=(',', ':')) + ';')

    print()
    print('mots avec glose      : %d' % total_mots)
    print('versets couverts     : %d' % total_versets)
    print('versets en desaccord : %d  (ignores, jamais affiches)' % len(desaccords))
    print('versets vides        : %d' % vides)
    if desaccords:
        print('exemples :')
        for d in desaccords[:10]:
            print('   S%d:%d  nous=%d mots  api=%d mots' % d)
    taux = 100.0 * total_versets / max(1, total_versets + len(desaccords))
    print('couverture           : %.2f %%' % taux)


if __name__ == '__main__':
    main()
