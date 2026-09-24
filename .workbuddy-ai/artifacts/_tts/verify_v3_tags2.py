"""Contre-épreuve v116b : les audio tags eleven_v3 sont-ils un levier réel ?

Le premier passage (verify_v3_tags.py) n'avait qu'un échantillon par condition,
or la génération ElevenLabs est NON DÉTERMINISTE (mesuré : ±15 % de durée pour
un texte identique). Un écart de 5 % n'y est donc pas une preuve.

Ici : 3 échantillons par condition, moyenne ET valeur extrême retenues.
Une balise n'est considérée « active » que si son écart moyen dépasse ~15 %.
"""
import json
import os
import statistics
import urllib.error
import urllib.request

CFG = os.path.join(os.environ.get('LOCALAPPDATA') or os.path.expanduser('~'),
                   'THEOLOGICUS', 'theologicus_config.json')
with open(CFG, encoding='utf-8') as f:
    cfg = json.load(f)
el = cfg['elevenlabs']
CLE, VOIX, BASE = el['cle'], el['voix'], el['base']

P = ("Le Seigneur est mon berger, je ne manque de rien. "
     "Il me fait reposer dans de verts pâturages, il me conduit près des eaux "
     "tranquilles, il restaure mon âme.")
VS = {'stability': 0.35, 'similarity_boost': 0.8, 'style': 0.4, 'use_speaker_boost': True}
url = BASE + '/text-to-speech/' + VOIX + '?output_format=mp3_44100_128'
N = 3


def generer(texte):
    corps = json.dumps({'text': texte, 'model_id': 'eleven_v3', 'voice_settings': VS}).encode('utf-8')
    req = urllib.request.Request(url, data=corps, method='POST', headers={
        'xi-api-key': CLE, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg'})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return len(r.read()) * 8 / 128000, ''
    except urllib.error.HTTPError as e:
        return None, e.read().decode('utf-8', 'replace')[:400]


CANDIDATS = [
    ('brut', P),
    ('[slowly]', '[slowly] ' + P),
    ('[softly]', '[softly] ' + P),
    ('[sad]', '[sad] ' + P),
]

print('eleven_v3 — %d échantillons par condition, %d caractères' % (N, len(P)))
print('=' * 72)
res = {}
for nom, texte in CANDIDATS:
    durs = []
    for i in range(N):
        d, err = generer(texte)
        if err:
            print('%-10s -> ERREUR %s' % (nom, err[:120]))
            break
        durs.append(d)
    if len(durs) != N:
        continue
    m = statistics.mean(durs)
    res[nom] = (m, min(durs), max(durs))
    print('%-10s -> moy %.2f s   (min %.2f / max %.2f)' % (nom, m, min(durs), max(durs)))

print('=' * 72)
ref = res.get('brut')
if ref:
    print('référence « brut » : moy %.2f s, min %.2f, max %.2f' % ref)
    print('-' * 72)
    for nom, (m, lo, hi) in res.items():
        if nom == 'brut':
            continue
        ecart = (m - ref[0]) * 100.0 / ref[0]
        # Test conservateur : l'écart moyen dépasse-t-il le bruit ?
        verdict = 'ACTIF' if abs(ecart) >= 15 else 'dans le bruit'
        print('%-10s : %+.1f %% (moy)  -> %s' % (nom, ecart, verdict))
