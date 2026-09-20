"""Traduit en francais les gloses du mot a mot coranique.

Source : LibreTranslate tournant en local (tools/start_libretranslate.py).
Aucune cle API, rien ne sort de la machine.

Deux precautions :
  - on ne traduit que les gloses UNIQUES (77 000 mots mais un vocabulaire
    bien plus petit), sinon le job est interminable ;
  - en cas d'echec sur une glose, on garde l'anglais. Une glose absente
    est preferable a une glose fausse : l'application affichera alors
    l'anglais etiquete « (en) » plutot que du francais inventé.

Sortie : quranwbw/qN.js devient [ [glose_en, translit, glose_fr], ... ]
"""
import io, json, os, re, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CORPUS = os.path.join(RACINE, 'quranwbw')
CACHE = os.path.join(RACINE, 'tools', '.glosses_fr.json')
BASE = os.environ.get('THEO_LT', 'http://127.0.0.1:5000')


# ── Glossaire verifie ──────────────────────────────────────────────────────
# ArgosTranslate (le moteur de LibreTranslate) traduit tres bien le vocabulaire
# courant mais se trompe sur le vocabulaire theologique, ou il produit parfois
# un contresens : « the Most Gracious » devenait « les plus gracieuses »,
# « charity » (l'aumone legale) « organismes de bienfaisance », « the
# punishment » « la peine ». Or ces termes sont les plus visibles : la Basmala
# est recitee a chaque priere.
#
# On ne remplace donc la machine QUE la ou elle a tort, avec les rendus
# francais usuels. C'est un correctif, pas une reecriture : tout le reste
# reste la traduction automatique, affichee comme telle dans l'application.

CORRECTIONS = {
    'In (the) name': 'Au nom',
    'Say': 'Dis',
    'charity': 'aumône',
    'the punishment': 'le châtiment',
    'punishment': 'châtiment',
    'a punishment': 'un châtiment',
    '(is) a punishment': '(est) un châtiment',
    'disbelieve': 'mécroient',
    'disbelieved': 'ont mécru',
}

# Epithetes divines : on remplace le nom, puis les particules anglaises.
EPITHETES = {
    'Most Gracious': 'Tout-Miséricordieux',
    'Most Merciful': 'Très-Miséricordieux',
    'Most Forbearing': 'Très-Indulgent',
    'Most High': 'Très-Haut',
    'Most Great': 'Très-Grand',
    'Most Kind': 'Très-Bienveillant',
    'Most Generous': 'Très-Généreux',
    'Most Powerful': 'Tout-Puissant',
    'All-Mighty': 'Tout-Puissant',
    'All-Powerful': 'Tout-Puissant',
    'All-Wise': 'Sage',
    'All-Knowing': 'Omniscient',
    'All-Hearing': 'Audient',
    'All-Seeing': 'Clairvoyant',
    'Oft-Forgiving': 'Très-Pardonneur',
    'Oft-Returning': 'Accueillant au repentir',
    'Oft-Relenting': 'Très-Pardonneur',
}
VOYELLE = 'aeiouyhéôàâAEIOUYHÉÔÀÂ'


def corriger(en, fr_auto):
    """Rend le francais corrige, ou la traduction automatique telle quelle."""
    if en in CORRECTIONS:
        return CORRECTIONS[en]
    for epic in sorted(EPITHETES, key=len, reverse=True):
        if epic in en:
            r = en.replace(epic, EPITHETES[epic])
            r = r.replace('(of) the ', '(du) ').replace('(of) ', '(de) ')
            r = r.replace('(is) surely ', '(est) certes ')
            r = r.replace('(is) the ', '(est) le ').replace('(is) ', '(est) ')
            r = r.replace('to the ', 'au ').replace('for the ', 'pour le ')
            r = r.replace('And ', 'Et ').replace('and ', 'et ')
            if r.startswith('The '):
                r = 'Le ' + r[4:]
            elif r.startswith('the '):
                suite = r[4:]
                r = ("l'" if suite[:1] in VOYELLE else 'le ') + suite
            return r
    return fr_auto


def lt(texte, essais=3):
    """Un appel LibreTranslate. Rend None si indisponible."""
    corps = json.dumps({'q': texte, 'source': 'en', 'target': 'fr'}).encode('utf-8')
    for e in range(essais):
        try:
            req = urllib.request.Request(BASE + '/translate', data=corps,
                                         headers={'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=60) as r:
                d = json.loads(r.read().decode('utf-8'))
            t = (d.get('translatedText') or '').strip()
            return t or None
        except Exception:
            time.sleep(1.5 * (e + 1))
    return None


def main():
    # 1. rassembler les gloses uniques
    livre = {}
    uniques = set()
    for n in range(1, 115):
        p = os.path.join(CORPUS, 'q%d.js' % n)
        if not os.path.exists(p):
            continue
        txt = io.open(p, encoding='utf-8').read()
        # v89 — ``find('=')`` tombait sur le PREMIER ``=`` de la ligne, celui de
        # ``(window.__quranWbw=window.__quranWbw||{})[1]={...}`` : on decodait
        # donc ``window.__quranWbw||{})[1]={...}`` et json.loads plantait.
        # Le bon point d'ancrage est le crochet fermant de l'indexation.
        j = txt.find(']=')
        if j == -1:
            print('  format inattendu, ignore : %s' % p)
            continue
        d = json.loads(txt[j + 2:].rstrip().rstrip(';'))
        livre[n] = d
        for v in d.values():
            for w in v:
                if w and w[0]:
                    uniques.add(w[0])
    print('gloses uniques : %d' % len(uniques))

    cache = {}
    if os.path.exists(CACHE):
        cache = json.load(io.open(CACHE, encoding='utf-8'))
    a_faire = sorted(u for u in uniques if u not in cache)
    print('deja traduites : %d | a traduire : %d' % (len(uniques) - len(a_faire), len(a_faire)))
    if not a_faire:
        print('rien a faire')
    else:
        # le serveur doit etre vivant
        try:
            urllib.request.urlopen(BASE + '/languages', timeout=8)
        except Exception as e:
            print('LibreTranslate injoignable sur %s : %s' % (BASE, e))
            print('Lance : python tools/start_libretranslate.py')
            return 1
        with ThreadPoolExecutor(max_workers=6) as ex:
            for k, res in enumerate(ex.map(lt, a_faire), 1):
                if res is not None:
                    cache[a_faire[k - 1]] = res
                if k % 500 == 0:
                    print('  %d/%d' % (k, len(a_faire)), flush=True)
                    json.dump(cache, io.open(CACHE, 'w', encoding='utf-8'), ensure_ascii=False)
        json.dump(cache, io.open(CACHE, 'w', encoding='utf-8'), ensure_ascii=False)

    # 2. reecriture des tranches avec la glose francaise en 3e position
    traduites = 0
    total = 0
    for n, d in sorted(livre.items()):
        for v in d.values():
            for w in v:
                total += 1
                fr = corriger(w[0], cache.get(w[0])) if w and w[0] else None
                if fr and fr != w[0]:
                    while len(w) < 3:
                        w.append('')
                    w[2] = fr
                    traduites += 1
        with io.open(os.path.join(CORPUS, 'q%d.js' % n), 'w', encoding='utf-8', newline='') as f:
            f.write('(window.__quranWbw=window.__quranWbw||{})[%d]=' % n)
            f.write(json.dumps(d, ensure_ascii=False, separators=(',', ':')))
            f.write(';')
    print('mots total %d | avec glose francaise %d (%.1f %%)'
          % (total, traduites, 100.0 * traduites / max(1, total)))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
