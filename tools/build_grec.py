# -*- coding: utf-8 -*-
"""Construit le corpus grec mot a mot : biblegr/b<n>.js + biblegr/strongs.js

Source : MorphGNT — edition SBLGNT (James K. Tauber), 27 fichiers
         BBCCVV POS parsing texte mot mot_normalise lemme

Licences (verifiees, pas supposees) :
  - texte SBLGNT     -> CC BY 4.0      (sblgnt.com/license : la page
                        s'intitule « EULA » mais son contenu est bien la
                        licence Creative Commons Attribution 4.0)
  - morphologie et lemmatisation MorphGNT -> CC BY-SA 3.0
  Notre corpus derive biblegr/ est donc publie sous CC BY-SA 3.0.

Deux mesures faites AVANT d'ecrire ce script (voir _m/inv*_grec.py) :

1. COUVERTURE STRONG. Les 5 449 lemmes distincts de MorphGNT ont ete
   confrontes aux 5 523 entrees grecques de strongs.xhtml :
        94,1 % des occurrences -> une seule entree Strong   (reliees)
         4,4 %                 -> plusieurs entrees         (NON reliees)
         1,6 %                 -> aucune entree             (NON reliees)
   Regle : un lemme ambigu n'est pas relie. On n'invente pas un numero.

2. ALIGNEMENT. La numerotation des versets ne se decale pas dans le texte
   critique : les versets absents sont simplement sautes, leurs voisins
   gardent leur numero (verifie : Jn 8 grec = 12..59, Rm 16 = 1..24,
   Ap 12 = 1..18). On peut donc emettre un chapitre des que chaque verset
   grec appartient a la plage francaise — et signaler les manques.

Marques d'appareil critique : SBLGNT ecrit ⸀ ⸁ ⸂ ⸃ ⸄ ⸅. Observees sur
137 554 mots : ⸀ x5114, ⸂ et ⸃ x1764/1765. Elles ne se posent pas toujours
sur le meme mot (Mt 1,5 : « ⸂Βόες … Βόες⸃ » encadre cinq mots), on n'a donc
PAS pu etablir leur sens avec certitude. Plutot que de les interpreter —
donc de risquer d'affirmer a tort qu'un mot est douteux — on les retire du
mot affiche et on le dit dans LICENCES.md et dans l'infobulle.

Sortie par verset : " mot|translit|Strong|morph|lemme ... " (espaces).
"""
import io
import json
import os
import re
import unicodedata

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GNT = os.path.join(RACINE, '.workbuddy-ai', 'artifacts', '_m', 'data', 'gnt')
STRONGS = os.path.join(RACINE, '.workbuddy-ai', 'artifacts', '_m', 'data',
                       'strongs.xhtml')
FR_STRONGS = os.path.join(RACINE, '.workbuddy-ai', 'artifacts', '_m',
                          'gr_fr.json')
OUT = os.path.join(RACINE, 'biblegr')

# numero de livre dans la REFERENCE (01..27) -> numero du corpus francais.
# Attention : le nom de fichier suit une autre numerotation (61-Mt … 87-Ap,
# heritage CCAT) — on se cale sur la reference, pas sur le nom de fichier.
G2NUM = {
    '01': 40, '02': 41, '03': 42, '04': 43, '05': 44, '06': 45, '07': 46,
    '08': 47, '09': 48, '10': 49, '11': 50, '12': 51, '13': 52, '14': 53,
    '15': 54, '16': 55, '17': 56, '18': 57, '19': 58, '20': 59, '21': 60,
    '22': 61, '23': 62, '24': 63, '25': 64, '26': 65, '27': 66,
}

def omis_connus():
    """Versets que le texte critique omet (liste connue, TR/KJV vs NA28).

    Si un manque n'est pas dans cette liste, le script le signale
    BRUYAMMENT : c'est le garde-fou contre un decalage de numerotation
    qui serait passe inapercu.
    """
    d = set()
    for c, v in ((17, 21), (18, 11), (23, 14)):
        d.add((40, c, v))
    for c, v in ((7, 16), (9, 44), (9, 46), (11, 26), (15, 28)):
        d.add((41, c, v))
    for c, v in ((17, 36), (23, 17)):
        d.add((42, c, v))
    d.add((43, 5, 4))
    d.add((43, 7, 53))
    for v in range(1, 12):
        d.add((43, 8, v))
    for c, v in ((8, 37), (15, 34), (24, 7), (28, 29)):
        d.add((44, c, v))
    for v in (25, 26, 27):
        d.add((45, 16, v))
    return d


# ── Marques d'appareil critique ──────────────────────────────────────────────
MARQUES = re.compile('[\u2e00-\u2e05]')

ROUGH = '\u0314'      # esprit rude (dasia)
SMOOTH = '\u0313'     # esprit doux (psili)
IOTA = '\u0345'       # iota souscrit
LONGUE = ('\u0304', '\u0342', '\u0345')   # macron, perispomene, iota souscrit
DIAERESE = '\u0308'

BASE = {
    'α': 'a', 'β': 'b', 'γ': 'g', 'δ': 'd', 'ε': 'e', 'ζ': 'z', 'η': 'e',
    'θ': 'th', 'ι': 'i', 'κ': 'k', 'λ': 'l', 'μ': 'm', 'ν': 'n', 'ξ': 'x',
    'ο': 'o', 'π': 'p', 'ρ': 'r', 'σ': 's', 'ς': 's', 'τ': 't', 'υ': 'u',
    'φ': 'ph', 'χ': 'ch', 'ψ': 'ps', 'ω': 'o',
}
VOYELLE = set('αεηιουω')
LONGUE_BASE = {'α': 'ā', 'η': 'ē', 'ι': 'ī', 'υ': 'ū', 'ω': 'ō'}
# eta et omega sont TOUJOURS longs
TOUJOURS_LONG = {'η': 'ē', 'ω': 'ō'}
DIPHT = {
    'αι': 'ai', 'ει': 'ei', 'οι': 'oi', 'υι': 'ui',
    'αυ': 'au', 'ευ': 'eu', 'ου': 'ou', 'ηυ': 'ēu', 'ωυ': 'ōu',
}
NASALE = {'γγ': 'ng', 'γκ': 'nk', 'γξ': 'nx', 'γχ': 'nch'}


def grec(c):
    o = ord(c)
    return 0x0370 <= o <= 0x03FF or 0x1F00 <= o <= 0x1FFF


def translit(mot):
    """Translitteration MECANIQUE — une table, pas une reecriture.

    Documentee dans LICENCES.md : esprit rude -> h, iota souscrit -> voyelle
    longue, diphtongues et gamma nasal resolus par lecture anticipee.
    """
    t = unicodedata.normalize('NFD', mot)
    i, n, out = 0, len(t), []
    while i < n:
        if not grec(t[i]):
            i += 1
            continue
        j = i + 1
        marques = ''
        while j < n and 0x0300 <= ord(t[j]) <= 0x036F:
            marques += t[j]
            j += 1
        # minuscule : les majuscules (Ἐν, Βίβλος, Ἰησοῦ) sont hors table sinon
        a = unicodedata.normalize('NFC', t[i]).lower()
        b = ''
        if j < n and grec(t[j]):
            b = unicodedata.normalize('NFC', t[j]).lower()

        r = 'h' if ROUGH in marques else ''
        long_ = any(m in marques for m in LONGUE)

        if a == 'ρ':
            out.append(r + 'r')
            i = j
            continue
        if a in BASE and b in BASE:
            couple = a + b
            if couple in NASALE and a == 'γ':
                out.append(r + NASALE[couple])
                i = j + 1
                continue
            if b in VOYELLE and couple in DIPHT and DIAERESE not in marques:
                out.append(r + DIPHT[couple])
                i = j + 1
                continue
        if a in TOUJOURS_LONG:
            out.append(r + TOUJOURS_LONG[a])
        elif long_ and a in LONGUE_BASE:
            out.append(r + LONGUE_BASE[a])
        elif a in BASE:
            out.append(r + BASE[a])
        i = j
    return ''.join(out)


def nettoyer(t):
    """Garde les lettres grecques (NFD puis NFC) — retire ponctuation."""
    t = unicodedata.normalize('NFD', t)
    out = [c for c in t if 0x0370 <= ord(c) <= 0x03FF or 0x1F00 <= ord(c) <= 0x1FFF]
    return unicodedata.normalize('NFC', ''.join(out))


def lire_strongs():
    """-> {"1": ["Α", "al'-fah", "Alpha", "Alpha (fr)"]}"""
    s = io.open(STRONGS, encoding='utf-8').read()
    fr = {}
    if os.path.exists(FR_STRONGS):
        fr = json.load(io.open(FR_STRONGS, encoding='utf-8'))
    d = {}
    for m in re.finditer(r'<li value="(\d+)" id="nt:\1">(.*?)</li>', s, re.S):
        num, corps = m.group(1), m.group(2)
        i = re.search(r'<i title="\{([^}]*)\}"[^>]*>(.*?)</i>', corps, re.S)
        tr = i.group(1).strip() if i else ''
        lem = nettoyer(i.group(2)) if i else ''
        kjv = re.search(r'<span class="kjv_def">(.*?)</span>', corps, re.S)
        definition = ' '.join(kjv.group(1).split()) if kjv else ''
        d[num] = [lem, tr, definition, fr.get(num, '')]
    return d


def versets_fr():
    s = io.open(os.path.join(RACINE, 'bible', 'versification.js'),
                encoding='utf-8').read()
    i = s.find('window.__bibleVerseCounts')
    o, _ = json.JSONDecoder().raw_decode(s[s.find('{', i):])
    return o


def main():
    if not os.path.isdir(GNT):
        print('MorphGNT absent : %s' % GNT)
        return 1
    os.makedirs(OUT, exist_ok=True)
    fr = versets_fr()
    connus = omis_connus()

    # 1. lien lemme -> Strong (univoque seulement)
    formes = {}
    s = io.open(STRONGS, encoding='utf-8').read()
    amb = set()
    for m in re.finditer(r'<li value="(\d+)" id="nt:\1">(.*?)</li>', s, re.S):
        num, corps = m.group(1), m.group(2)
        i = re.search(r'<i title="\{([^}]*)\}"[^>]*>(.*?)</i>', corps, re.S)
        if not i:
            continue
        f = nettoyer(i.group(2))
        if not f:
            continue
        if f in formes and formes[f] != num:
            amb.add(f)
        formes[f] = num

    # 2. corpus
    total = 0
    lies = 0
    chapitres = 0
    ignores = []
    suspets = []
    livres = {}
    for f in sorted(os.listdir(GNT)):
        if not f.endswith('.txt'):
            continue
        for ln in io.open(os.path.join(GNT, f), encoding='utf-8'):
            ln = ln.rstrip('\n')
            if not ln.strip():
                continue
            p = ln.split(' ')
            if len(p) < 7:
                continue
            ref, pos, code, mot, lem = p[0], p[1], p[2], p[4], p[6]
            num = G2NUM.get(ref[:2])
            if num is None:
                continue
            ch = int(ref[2:4])
            v = int(ref[4:6])
            mot = MARQUES.sub('', mot)
            if not mot:
                continue
            L = nettoyer(lem)
            st = ''
            if L and L not in amb:
                st = formes.get(L, '')
                if st:
                    lies += 1
            # ATTENTION : les mots d'un verset sont separes par des ESPACES.
            # MorphGNT ecrit « N- ----NSF- » — un espace dans le code casserait
            # le decoupage. On stocke donc pos+code SANS espace (« N-----NSF- »)
            # et l'affichage le reconstitue (voir __grAnalyser).
            livres.setdefault(num, {}).setdefault(ch, {}).setdefault(v, []).append(
                '%s|%s|%s|%s|%s' % (mot, translit(mot), st, pos + code, L))

    for num in sorted(livres):
        livre = livres[num]
        attendu = fr.get(str(num), {})
        sortie = {}
        for ch in sorted(livre):
            nb_fr = int(attendu.get(str(ch), -1))
            if nb_fr <= 0:
                ignores.append((num, ch, 'chapitre absent du corpus FR'))
                continue
            vs = livre[ch]
            dehors = sorted(v for v in vs if v < 1 or v > nb_fr)
            if dehors:
                # Un verset grec hors plage francaise est ECARTE, le reste du
                # chapitre est emis. Cas mesure : Ap 12 — le grec a un
                # verset 18 (« il se tint sur le sable ») que le francais
                # rattache a 13,1. Seul ce verset est perdu.
                ignores.append((num, ch, 'ecartes %s' % dehors[:6]))
                for v in dehors:
                    vs.pop(v, None)
            manquants = [v for v in range(1, nb_fr + 1) if v not in vs]
            for v in manquants:
                if (num, ch, v) not in connus:
                    suspets.append((num, ch, v))
            chapitres += 1
            sortie[str(ch)] = {str(v): ' '.join(vs[v]) for v in sorted(vs)}
            total += sum(len(vs[v]) for v in vs)

        with io.open(os.path.join(OUT, 'b%d.js' % num), 'w', encoding='utf-8',
                     newline='') as fp:
            fp.write('(window.__bibleGr=window.__bibleGr||{})[%d]=' % num)
            fp.write(json.dumps(sortie, ensure_ascii=False, separators=(',', ':')))
            fp.write(';')

    st = lire_strongs()
    with io.open(os.path.join(OUT, 'strongs.js'), 'w', encoding='utf-8',
                 newline='') as fp:
        fp.write('window.__strongsGr=')
        fp.write(json.dumps(st, ensure_ascii=False, separators=(',', ':')))
        fp.write(';')

    print('entrees Strong grec    : %d' % len(st))
    print('mots grecs emis        : %d' % total)
    print('  dont lies a Strong   : %d (%.1f %%)' % (lies, 100.0 * lies / max(total, 1)))
    print('chapitres emis         : %d' % chapitres)
    print('chapitres ignores      : %d' % len(ignores))
    for ig in ignores:
        print('   livre %d ch %s : %s' % ig)
    print('manques NON connus     : %d' % len(suspets))
    for sp in suspets[:40]:
        print('   livre %d ch %d verset %d' % sp)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
