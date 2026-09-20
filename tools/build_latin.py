# -*- coding: utf-8 -*-
"""Construit le corpus latin mot a mot : latin/mots.js

Source des analyses : **Whitaker's Words**, reimplementation Python
`blagae/whitakers_words` (MIT — le programme Ada d'origine de William
Whitaker avait une licence « tres liberale » ecrite par lui-meme, proche
du domaine public). Environ 39 000 entrees latin-anglais avec la
morphologie flexionnelle complete.

    pip install git+https://github.com/blagae/whitakers_words.git

Portee : seul corpus latin de l'application, Denzinger (Enchiridion
Symbolorum, 11e ed., Bannwart S.J., 1911).

Regle d'or, tenue comme pour l'hebreu et le grec :
  - une forme que l'analyseur ne reconnait PAS n'a aucune entree, et
    l'infobulle n'affiche alors rien. Le texte de 1911 est une OCR : il
    contient des formes aberrantes (« Symbob », « mterrogationes »).
    On ne les devine pas ;
  - une forme AMBIGUE porte **toutes** ses analyses (dans la limite de 4),
    comme le ferait un dictionnaire. On ne tranche pas a sa place ;
  - les sens sont anglais, traduits en local par LibreTranslate et
    affiches etiquetes « trad. auto. » (voir _m/traduit_latin.py).

Sortie : latin/mots.js
    window.__latinMots = { "deus": [ [lemme, type, flexion, sens, sens_fr] ] }
"""
import io
import json
import os
import re
import sys

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DZ = os.path.join(RACINE, 'denzinger')
OUT = os.path.join(RACINE, 'latin')
FR = os.path.join(RACINE, '.workbuddy-ai', 'artifacts', '_m', 'latin_fr.json')

TOKEN = re.compile(r'[A-Za-zĀāĒēĪīŌōŪūȲȳÆæŒœ]+')

MAX_ANA = 4          # analyses conservees par forme
MAX_FLEX = 4         # flexions differentes affichees par analyse

CAS = {'Nominative': 'nominatif', 'Vocative': 'vocatif', 'Genitive': 'génitif',
       'Dative': 'datif', 'Accusative': 'accusatif', 'Ablative': 'ablatif',
       'Locative': 'locatif'}
NOMBRE = {'Singular': 'singulier', 'Plural': 'pluriel'}
GENRE = {'Masculine': 'masculin', 'Feminine': 'féminin', 'Neuter': 'neutre',
         'Common': 'commun'}
# Les VALEURS des enums sont latines (« Praesens »), pas anglaises :
# relevees sur le module, pas devinees.
TEMPS = {'Praesens': 'présent', 'Imperfectum': 'imparfait',
         'Perfectum': 'parfait', 'Futurum Simplex': 'futur',
         'Futurum Exactum': 'futur antérieur',
         'Plusquamperfectum': 'plus-que-parfait'}
VOIX = {'Active': 'actif', 'Passive': 'passif'}
MODE = {'Indicative': 'indicatif', 'Subjunctive': 'subjonctif',
        'Imperative': 'impératif', 'Infinitive': 'infinitif',
        'Participle': 'participe', 'Gerund': 'gérondif',
        'Gerundive': 'adjectif verbal'}
DEGRE = {'Positive': 'positif', 'Comparative': 'comparatif', 'Superlative': 'superlatif'}
TYPE = {'Noun': 'nom', 'Verb': 'verbe', 'Adjective': 'adjectif',
        'Adverb': 'adverbe', 'Pronoun': 'pronom', 'Preposition': 'préposition',
        'Conjunction': 'conjonction', 'Interjection': 'interjection',
        'Numeral': 'numéral', 'Verbal Participle': 'participe',
        'Supine': 'supin', 'Packon': 'packon', 'Tackon': 'enclitique',
        'Suffix': 'suffixe', 'Prefix': 'préfixe'}

# ordre d'affichage des traits
ORDRE = ['Person', 'Tense', 'Voice', 'Mood', 'Case', 'Number', 'Gender', 'Degree']
TRAD = {'Person': None, 'Tense': TEMPS, 'Voice': VOIX, 'Mood': MODE,
        'Case': CAS, 'Number': NOMBRE, 'Gender': GENRE, 'Degree': DEGRE}


def lire_oeuvre(f):
    t = io.open(f, encoding='utf-8').read()
    m = re.search(r'window\.__denzingerWorks\["([^"]+)"\] = (\{.*\});\s*$', t, re.S)
    return json.loads(m.group(2)) if m else None


def textes(w):
    out = []
    for c in w.get('c', []):
        if c.get('t'):
            out.append(c['t'])
        for s in c.get('s', []):
            if s.get('t'):
                out.append(s['t'])
            out.extend(s.get('p', []))
    return out


def champ(o, k, defaut=None):
    """whitakers_words expose des objets (Lexeme, Inflection) dont les
    versions precedentes donnaient des dicts : on accepte les deux."""
    if isinstance(o, dict):
        return o.get(k, defaut)
    return getattr(o, k, defaut)


def flexion(inflections):
    """Regroupe les traits de toutes les flexions d'une meme analyse."""
    vals = {}
    for inf in inflections[:MAX_FLEX]:
        for k, v in (champ(inf, 'features') or {}).items():
            nom = getattr(k, '__name__', None) or str(k)
            # Person porte un ENTIER (1, 2, 3) : on normalise en chaine
            val = str(getattr(v, 'value', v))
            vals.setdefault(nom, [])
            if val not in vals[nom]:
                vals[nom].append(val)
    bits = []
    for nom in ORDRE:
        if nom not in vals:
            continue
        table = TRAD.get(nom)
        rendus = []
        for v in vals[nom]:
            if v == 'Unknown':
                continue
            if nom == 'Person':
                rendus.append({'1': '1re pers.', '2': '2e pers.',
                               '3': '3e pers.'}.get(v, v))
                continue
            rendus.append((table or {}).get(v, v))
        bits.append(' / '.join(rendus))
    return ', '.join(bits)


def lemme(lex):
    r = [x for x in (champ(lex, 'roots') or []) if x and x != '-']
    if not r:
        return ''
    if len(r) > 1 and r[1] != r[0]:
        return r[0] + ', ' + r[1]
    return r[0]


def main():
    try:
        from whitakers_words.parser import Parser
    except ImportError:
        print("whitakers_words absent :")
        print("  pip install git+https://github.com/blagae/whitakers_words.git")
        return 1

    os.makedirs(OUT, exist_ok=True)
    freq = {}
    for f in sorted(os.listdir(DZ)):
        if not f.endswith('.js'):
            continue
        w = lire_oeuvre(os.path.join(DZ, f))
        if not w:
            continue
        for s in textes(w):
            for tk in TOKEN.findall(s):
                k = tk.lower()
                freq[k] = freq.get(k, 0) + 1

    print('formes distinctes : %d' % len(freq))
    fr = {}
    if os.path.exists(FR):
        fr = json.load(io.open(FR, encoding='utf-8'))

    # SEUIL DE FREQUENCE — mesure, pas devine (voir _m/mesure_seuil.py).
    # Le defaut de la bibliotheque est frequency='C' : il laisse passer
    # « caritas » mais PAS « suus », « sacramentum », « omnino », « tanquam »
    # — un comble pour du latin ecclesiastique. Sur les 3 000 formes les
    # plus frequentes du corpus :
    #     C (defaut)  -> 74 % resolues, 1,64 analyse/mot
    #     X           -> 84 % resolues, 1,82 analyse/mot
    # On prend X : 10 points de couverture pour une ambiguite qui reste
    # tres faible.
    p = Parser(frequency='X')
    d = {}
    sens_attendus = {}
    nul = 0
    for i, (mot, n) in enumerate(sorted(freq.items(), key=lambda x: -x[1])):
        try:
            w = p.parse(mot)
        except Exception:
            w = None
        analyses = []
        if w:
            for form in w.forms:
                for a in list(champ(form, 'analyses', {}).values()):
                    lx = a.lexeme
                    wt = champ(lx, 'wordType')
                    t = getattr(wt, 'value', wt)
                    sens = ' ; '.join(champ(lx, 'senses') or [])
                    if not sens:
                        continue
                    fle = flexion(a.inflections)
                    encl = champ(a, 'enclitic')
                    if encl and champ(encl, 'senses'):
                        fle = (fle + ' + ' + champ(encl, 'senses')[0][:40]).strip(' ,')
                    # [lemme, type, flexion, sens_en, sens_fr]
                    analyses.append([lemme(lx), TYPE.get(t, t or ''), fle, sens,
                                     fr.get(sens, '')])
                    if len(analyses) >= MAX_ANA:
                        break
                if len(analyses) >= MAX_ANA:
                    break
        if not analyses:
            nul += 1
            continue
        d[mot] = analyses
        for a in analyses:
            sens_attendus[a[3]] = True
        if (i + 1) % 5000 == 0:
            print('  %d/%d -> %d entrees' % (i + 1, len(freq), len(d)))

    with io.open(os.path.join(OUT, 'mots.js'), 'w', encoding='utf-8',
                 newline='') as fp:
        fp.write('window.__latinMots=')
        fp.write(json.dumps(d, ensure_ascii=False, separators=(',', ':')))
        fp.write(';')

    io.open(os.path.join(os.path.dirname(FR), 'latin_sens_en.json'), 'w',
            encoding='utf-8').write(json.dumps(sorted(sens_attendus),
                                               ensure_ascii=False))
    print('entrees emises      : %d' % len(d))
    print('formes non reconnues: %d (%.0f %%)'
          % (nul, 100.0 * nul / max(len(freq), 1)))
    print('sens distincts      : %d' % len(sens_attendus))
    taille = os.path.getsize(os.path.join(OUT, 'mots.js'))
    print('latin/mots.js       : %.1f Mo' % (taille / 1e6))
    return 0


if __name__ == '__main__':
    sys.exit(main())
