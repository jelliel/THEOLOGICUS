"""Compare eleven_v3 et eleven_multilingual_v2 sur le contrôle du débit.

Mesuré : sur eleven_v3, ni <prosody rate> ni voice_settings.speed n'ont d'effet.
Hypothèse : v3 ignore voice_settings (c'est un modèle « expressif » piloté par le
texte seul). Si v2, lui, applique `speed`, alors le choix est clair :
  - v3  = expressivité naturelle, MAIS aucun réglage de débit/ton ;
  - v2  = moins expressif, MAIS le ton théologique est applicable.
C'est cette décision qu'il faut pouvoir présenter à l'utilisateur.
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

el = cfg.get('elevenlabs', {})
CLE, VOIX = el.get('cle', ''), el.get('voix', '')
BASE = el.get('base', 'https://api.elevenlabs.io/v1')

P = ("Le Seigneur est mon berger, je ne manque de rien. "
     "Il me fait reposer dans de verts pâturages, il me conduit près des eaux "
     "tranquilles, il restaure mon âme.")

BASE_VS = {'stability': 0.35, 'similarity_boost': 0.8, 'style': 0.4,
           'use_speaker_boost': True}

ESSAIS = [
    ('v2  speed 1.0', 'eleven_multilingual_v2', dict(BASE_VS), 2),
    ('v2  speed 0.7', 'eleven_multilingual_v2', dict(BASE_VS, speed=0.7), 2),
    ('v2  speed 1.2', 'eleven_multilingual_v2', dict(BASE_VS, speed=1.2), 2),
    ('v3  speed 0.7', 'eleven_v3', dict(BASE_VS, speed=0.7), 2),
]

url = BASE + '/text-to-speech/' + VOIX + '?output_format=mp3_44100_128'


def generer(modele, vs):
    corps = json.dumps({'text': P, 'model_id': modele, 'voice_settings': vs}).encode('utf-8')
    req = urllib.request.Request(url, data=corps, method='POST', headers={
        'xi-api-key': CLE, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg'})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            return len(r.read()) * 8 / 128000
    except urllib.error.HTTPError as e:
        print('   HTTP %d : %s' % (e.code, e.read().decode('utf-8', 'replace')[160:400]))
        return None


print('(%d caractères, moyenne sur 2 échantillons)' % len(P))
print('=' * 70)
res = {}
for nom, modele, vs, n in ESSAIS:
    d = [x for x in (generer(modele, vs) for _ in range(n)) if x]
    if not d:
        print('%-15s -> ECHEC' % nom)
        continue
    res[nom] = statistics.mean(d)
    print('%-15s -> ~%.2f s   (écart %.2f s)' % (nom, res[nom], max(d) - min(d)))

print('=' * 70)
ref = res.get('v2  speed 1.0')
if ref:
    for nom, d in res.items():
        if '1.0' in nom:
            continue
        print('%-15s : %+.1f %% de durée vs v2 speed 1.0' % (nom, (d - ref) * 100.0 / ref))
    v2l, v2r = res.get('v2  speed 0.7', 0), res.get('v2  speed 1.2', 0)
    if v2l > ref * 1.15 and v2r < ref * 0.95:
        print('\nVERDICT : eleven_multilingual_v2 APPLIQUE speed.')
        print('          -> le ton théologique est réalisable en v2, pas en v3.')
    else:
        print('\nVERDICT : v2 n\'applique pas non plus speed.')
