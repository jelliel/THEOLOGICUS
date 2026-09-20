# -*- coding: utf-8 -*-
"""Construit le corpus hebreu mot a mot : biblehb/b<n>.js + biblehb/strongs.js

Source : WLC (Westminster Leningrad Codex) publie par Open Scriptures,
         fichiers wlc/*.xml — texte VOCALISE, lemme Strong et morphologie.

Pourquoi le WLC et pas morphhb/oshb.js :
  oshb.js est numerote selon la KJV — le titre d'un psaume y est fondu dans
  le verset 1. Notre corpus francais (BJ) suit la numerotation massoretique,
  ou le titre est un verset a part entiere. Mesure :
      FR vs oshb.js -> 84,6 % de chapitres alignes
      FR vs WLC     -> 98,9 % de chapitres alignes
  On garde donc le WLC.

Regle d'or : aucune donnee inventee.
  - un chapitre dont le nombre de versets ne concorde pas exactement avec le
    corpus francais est IGNORE (et liste) : un mot a mot desaligne est pire
    qu'un mot a mot absent ;
  - la translitteration est MECANIQUE (table lettre par lettre), pas une
    reecriture. Le Tetragramme est rendu YHWH, convention documentee ;
  - aucune « racine » trilitere n'est proposee : elle n'est pas dans les
    donnees sous licence utilisees. On affiche le LEMME (entree lexicale).

Sortie par verset : une chaine compacte
    " Hebreu|translit|Strong|morph Hebreu|translit|Strong|morph ... "
separee par des espaces — bien plus leger que des tableaux JSON imbriques.
"""
import io
import json
import os
import re
import sys
import unicodedata

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WLC = os.path.join(RACINE, '.workbuddy-ai', 'artifacts', '_m', 'data', 'wlc')
STRONGS = os.path.join(RACINE, '.workbuddy-ai', 'artifacts', '_m', 'data',
                       'strongs.xhtml')
HB_FR = os.path.join(RACINE, '.workbuddy-ai', 'artifacts', '_m', 'hb_fr.json')
OUT = os.path.join(RACINE, 'biblehb')

# fichier WLC -> numero de livre dans notre corpus francais (ordre catholique)
F2NUM = {
    'Gen': 1, 'Exod': 2, 'Lev': 3, 'Num': 4, 'Deut': 5, 'Josh': 6,
    'Judg': 7, 'Ruth': 8, '1Sam': 9, '2Sam': 10, '1Kgs': 11, '2Kgs': 12,
    '1Chr': 13, '2Chr': 14, 'Ezra': 15, 'Neh': 16, 'Esth': 17, 'Job': 18,
    'Ps': 19, 'Prov': 20, 'Eccl': 21, 'Song': 22, 'Isa': 23, 'Jer': 24,
    'Lam': 25, 'Ezek': 26, 'Dan': 27, 'Hos': 28, 'Joel': 29, 'Amos': 30,
    'Obad': 31, 'Jonah': 32, 'Mic': 33, 'Nah': 34, 'Hab': 35, 'Zeph': 36,
    'Hag': 37, 'Zech': 38, 'Mal': 39,
}

# ── Filtres Unicode ─────────────────────────────────────────────────────────
# On garde : lettres, voyelles (niqqud), dagesh, points du shin/sin, maqqef.
# On retire : cantillation (signes de lecture), meteg, paseq, sof pasuq.
GARDER = set([0x05BC, 0x05C1, 0x05C2, 0x05C7, 0x05BE])


def nettoyer(t):
    """Retire cantillation et signes de lecture ; garde lettres + voyelles.

    v90 — strongs.xhtml ecrit ses lemmes avec des formes HEBRAIQUES
    PRECOMPOSEES (bloc U+FB1D-FB4F) : U+FB2A « shin avec point », U+FB4B
    « vav avec holam », U+FB33 « dalet avec dagesh »... Elles tombent hors
    de la plage des lettres, donc le filtre les supprimait : H4210 devenait
    « מִזְמר » au lieu de « מִזְמוֹר », H1732 « ָוִיד » au lieu de
    « דָּוִד ». La decomposition NFD les ramene a lettre + diacritique.
    """
    t = unicodedata.normalize('NFD', t)
    out = []
    for ch in t:
        c = ord(ch)
        if 0x05D0 <= c <= 0x05EA or 0x05F0 <= c <= 0x05F2:
            out.append(ch)
        elif 0x05B0 <= c <= 0x05BC:          # niqqud + dagesh + sheva
            out.append(ch)
        elif c in GARDER:
            out.append(ch)
        # tout le reste (0591-05AF cantillation, 05BD meteg, 05C0 paseq,
        # 05C3 sof pasuq, 05C4-05C6) est abandonne
    s = ''.join(out)
    return s.replace('/', '')                # separateur de morphemes OSHB


# ── Translitteration mecanique ──────────────────────────────────────────────
CONS = {
    'א': ('ʾ', 'ʾ'), 'ב': ('v', 'b'), 'ג': ('g', 'g'), 'ד': ('d', 'd'),
    'ה': ('h', 'h'), 'ו': ('w', 'w'), 'ז': ('z', 'z'), 'ח': ('ḥ', 'ḥ'),
    'ט': ('ṭ', 'ṭ'), 'י': ('y', 'y'), 'כ': ('kh', 'k'), 'ך': ('kh', 'kh'),
    'ל': ('l', 'l'), 'מ': ('m', 'm'), 'ם': ('m', 'm'), 'נ': ('n', 'n'),
    'ן': ('n', 'n'), 'ס': ('s', 's'), 'ע': ('ʿ', 'ʿ'), 'פ': ('f', 'p'),
    'ף': ('f', 'f'), 'צ': ('ṣ', 'ṣ'), 'ץ': ('ṣ', 'ṣ'), 'ק': ('q', 'q'),
    'ר': ('r', 'r'), 'ש': ('š', 'š'), 'ת': ('t', 't'),
}
VOY = {
    'ְ': '', 'ֱ': 'e', 'ֲ': 'a', 'ֳ': 'o',   # sheva (traite a part), hataf
    'ִ': 'i', 'ֵ': 'e', 'ֶ': 'e', 'ַ': 'a', 'ָ': 'a',
    'ֹ': 'o', 'ֻ': 'u', 'ׇ': 'o',             # qamats qatan -> o
}
DAGESH = 'ּ'
SHIN = 'ׁ'
SIN = 'ׂ'
MAQQEF = '־'


def translit(mot):
    """Translitteration lettre a lettre. Deterministe, jamais inventive.

    Aucune voyelle n'est « devinee » : on ne fait que rendre les signes
    presents dans le texte vocalise du WLC.
    """
    if not mot:
        return ''
    # Tetragramme : convention documentee (Qere perpetuel).
    if ''.join(c for c in mot if 0x05D0 <= ord(c) <= 0x05EA) == 'יהוה':
        return 'YHWH'

    # 1. decoupage en unites (consonne + point shin/sin + dagesh + voyelle)
    unites = []
    i, n = 0, len(mot)
    while i < n:
        o = ord(mot[i])
        if 0x05D0 <= o <= 0x05EA:
            u = {'l': mot[i], 'd': False, 'v': None, 's': None, 'sv': None}
            i += 1
            # v90 — l'ordre des diacritiques n'est pas fixe dans la nature :
            # certains textes ecrivent bet+dagesh+voyelle, d'autres le
            # dagesh apres la voyelle. On ramasse les signes dans n'importe
            # quel ordre, en s'arretant des qu'une lettre (ou un maqqef)
            # apparait.
            j = i
            while j < n and j < i + 3:
                cj = mot[j]
                if cj == SHIN:
                    u['s'] = 'š'
                elif cj == SIN:
                    u['s'] = 'ś'
                elif cj == DAGESH:
                    u['d'] = True
                elif cj in VOY:
                    u['v'] = cj
                else:
                    break
                j += 1
            i = j
            unites.append(u)
        elif mot[i] == MAQQEF:
            unites.append({'l': '-', 'd': False, 'v': None, 's': None,
                           'sv': None})
            i += 1
        else:
            i += 1

    # 2. sheva : vocal en tete de mot, ou apres un sheva muet. Regle standard.
    prev = 'none'
    for u in unites:
        if u['l'] == '-':
            continue
        if u['v'] == 'ְ':
            u['sv'] = 'vocal' if prev in ('none', 'muet') else 'muet'
            prev = u['sv']
        else:
            prev = 'pleine'

    # 3. rendu
    out = []
    dern = None                 # derniere voyelle rendue (matres lectionis)
    for u in unites:
        if u['l'] == '-':
            out.append('-'); dern = None; continue
        l, dag, v, sh, sv = u['l'], u['d'], u['v'], u['s'], u['sv']
        if l == 'ו':
            if dag and v is None:            # shuruk
                out.append('u'); dern = 'u'; continue
            if v is None and dern == 'o':    # holam male : mater, deja rendu
                dern = None; continue
            # v90 — holam male ecrit « vav porteur du o » (שָׁלוֹם) : le vav
            # n'est pas une consonne, c'est la mater lectionis. Sans ce cas
            # on produisait « šalwom ».
            if v == 'ֹ' and dern is None:
                out.append('o'); dern = 'o'; continue
        if l == 'י' and v is None and dern in ('i', 'e'):
            dern = None; continue            # mater lectionis
        base = CONS.get(l, ('', ''))
        out.append(base[1] if dag else base[0])
        if l == 'ש' and sh:
            out[-1] = sh
        if v:
            if v == 'ְ':
                if sv == 'vocal':
                    out.append('e'); dern = 'e'
            else:
                out.append(VOY.get(v, '')); dern = VOY.get(v, '')
        else:
            dern = None
    return ''.join(out).replace('ʾʾ', 'ʾ')


# ── Parsing WLC ─────────────────────────────────────────────────────────────
RE_VERSE = re.compile(r'<verse osisID="([^."]+)\.(\d+)\.(\d+)"'
                      r'(?:[^>]*)?>(.*?)</verse>', re.S)
RE_ITEM = re.compile(r'<(w|seg)([^>]*)>(.*?)</\1>', re.S)
RE_ATTR = re.compile(r'(\w+)="([^"]*)"')


def norm_strong(lem):
    """'l/1732' -> '1732' ; '1121 a' -> '1121' ; 'b/1272' -> '1272'."""
    if not lem:
        return ''
    part = lem.split('/')[-1].strip()
    m = re.match(r'(\d+)', part)
    return m.group(1) if m else ''


def lire_livre(fichier):
    """-> {ch: {v: "mot|tr|H|morph ..."}}"""
    s = io.open(fichier, encoding='utf-8').read()
    livre = {}
    for _bk, ch, v, corps in RE_VERSE.findall(s):
        mots = []
        en_attente = ''       # maqqef : rattache au mot precedent
        for kind, attrs, texte in RE_ITEM.findall(corps):
            if kind == 'seg':
                a = dict(RE_ATTR.findall(attrs))
                t = a.get('type', '')
                if t == 'x-maqqef':
                    en_attente = MAQQEF
                continue        # paseq, sof pasuq : ignores
            a = dict(RE_ATTR.findall(attrs))
            heb = nettoyer(texte)
            if not heb:
                continue
            if en_attente:
                heb = en_attente + heb
                en_attente = ''
            tr = translit(heb)
            H = norm_strong(a.get('lemma', ''))
            morph = a.get('morph', '')
            if '|' in heb or '|' in tr or ' ' in tr:
                tr = tr.replace('|', '').replace(' ', '')
            mots.append('%s|%s|%s|%s' % (heb, tr, H, morph))
        livre.setdefault(int(ch), {})[int(v)] = ' '.join(mots)
    return livre


def lire_strongs():
    """-> {"7225": ["רֵאשִׁית", "ray-sheeth'", "beginning...", "commencement..."]}

    Le 4e champ est la definition TRADUITE EN LOCAL (LibreTranslate/Argos,
    voir _m/traduit_strongs.py) : vide si _m/hb_fr.json n'existe pas encore.
    Traduction automatique : l'application l'etiquette « trad. auto. » et
    garde l'anglais dessous. Meme regle que pour l'arabe et le grec.
    """
    s = io.open(STRONGS, encoding='utf-8').read()
    fr = {}
    if os.path.exists(HB_FR):
        fr = json.load(io.open(HB_FR, encoding='utf-8'))
    d = {}
    for m in re.finditer(r'<li value="(\d+)" id="ot:\1">(.*?)</li>', s, re.S):
        num, corps = m.group(1), m.group(2)
        i = re.search(r'<i title="\{([^}]*)\}"[^>]*>(.*?)</i>', corps, re.S)
        tr = i.group(1).strip() if i else ''
        heb = nettoyer(i.group(2)) if i else ''
        kjv = re.search(r'<span class="kjv_def">(.*?)</span>', corps, re.S)
        definition = ' '.join(kjv.group(1).split()) if kjv else ''
        d[num] = [heb, tr, definition, fr.get(num, '')]
    return d


def versets_fr():
    s = io.open(os.path.join(RACINE, 'bible', 'versification.js'),
                encoding='utf-8').read()
    i = s.find('window.__bibleVerseCounts')
    o, _ = json.JSONDecoder().raw_decode(s[s.find('{', i):])
    return o


def main():
    if not os.path.isdir(WLC):
        print('WLC absent : %s' % WLC)
        return 1
    os.makedirs(OUT, exist_ok=True)
    fr = versets_fr()

    total_mots = 0
    ignores = []
    for f, num in sorted(F2NUM.items(), key=lambda x: x[1]):
        p = os.path.join(WLC, f + '.xml')
        if not os.path.exists(p):
            print('  manque %s.xml' % f)
            continue
        livre = lire_livre(p)
        attendu = fr.get(str(num), {})
        sortie = {}
        for ch in sorted(livre):
            nb_wlc = len(livre[ch])
            nb_fr = int(attendu.get(str(ch), -1))
            if nb_fr != nb_wlc:
                ignores.append((num, f, ch, nb_fr, nb_wlc))
                continue          # on n'emet RIEN : alignement non verifie
            sortie[str(ch)] = {str(v): livre[ch][v] for v in sorted(livre[ch])}
            total_mots += sum(len(x.split(' ')) for x in sortie[str(ch)].values()
                              if x)
        with io.open(os.path.join(OUT, 'b%d.js' % num), 'w', encoding='utf-8',
                     newline='') as fp:
            fp.write('(window.__bibleHb=window.__bibleHb||{})[%d]=' % num)
            fp.write(json.dumps(sortie, ensure_ascii=False,
                                separators=(',', ':')))
            fp.write(';')

    st = lire_strongs()
    with io.open(os.path.join(OUT, 'strongs.js'), 'w', encoding='utf-8',
                 newline='') as fp:
        fp.write('window.__strongsHb=')
        fp.write(json.dumps(st, ensure_ascii=False, separators=(',', ':')))
        fp.write(';')

    print('entrees Strong hebreu : %d' % len(st))
    print('mots hebreu emis      : %d' % total_mots)
    print('chapitres ignores     : %d' % len(ignores))
    for ig in ignores:
        print('   livre %2d %-5s ch %s : FR %s vs WLC %s -> ignore'
              % (ig[0], ig[1], ig[2], ig[3], ig[4]))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
