"""Discriminateur v116b : [slowly] est-il une DIRECTIVE ou un MOT LU ?

Risque : si eleven_v3 ne reconnaît pas la balise, il la prononce. On entendrait
alors « slowly » en anglais au milieu d'une lecture biblique française — pire
que pas de ton du tout.

Deux tests indépendants :

1) MISE À L'ÉCHELLE. Si [slowly] est une directive de débit, le supplément de
   durée est proportionnel à la longueur du texte (parole ×3 => écart ×3).
   S'il est prononcé, le supplément est une CONSTANTE (le temps de dire le mot),
   indépendante de la longueur.

2) CONTRÔLE. Une balise inventée de même longueur syllabique. Si elle produit le
   même écart que [slowly], c'est que les deux sont simplement prononcées.
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

COURT = ("Le Seigneur est mon berger, je ne manque de rien. "
         "Il me fait reposer dans de verts pâturages, il me conduit près des eaux "
         "tranquilles, il restaure mon âme.")
LONG = COURT + " " + (
    "Il me conduit dans les sentiers de la justice à cause de son nom. "
    "Quand je marche dans la vallée de l'ombre de la mort, je ne crains aucun mal, "
    "car tu es avec moi : ta houlette et ton bâton, voilà mon réconfort. "
    "Tu dresses devant moi une table, en face de mes ennemis ; "
    "tu verses sur ma tête une huile parfumée, ma coupe déborde. "
    "Oui, le bonheur et la grâce m'accompagneront tous les jours de ma vie, "
    "et j'habiterai la maison du Seigneur pour de longs jours.")

VS = {'stability': 0.35, 'similarity_boost': 0.8, 'style': 0.4, 'use_speaker_boost': True}
url = BASE + '/text-to-speech/' + VOIX + '?output_format=mp3_44100_128'
N = 3


def generer(texte):
    corps = json.dumps({'text': texte, 'model_id': 'eleven_v3', 'voice_settings': VS}).encode('utf-8')
    req = urllib.request.Request(url, data=corps, method='POST', headers={
        'xi-api-key': CLE, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg'})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return len(r.read()) * 8 / 128000, ''
    except urllib.error.HTTPError as e:
        return None, e.read().decode('utf-8', 'replace')[:400]


def moyenne(texte, n=N):
    durs = []
    for _ in range(n):
        d, err = generer(texte)
        if err:
            return None, err
        durs.append(d)
    return statistics.mean(durs), None


print('court = %d car., long = %d car. (rapport %.2f)' % (len(COURT), len(LONG), len(LONG) / len(COURT)))
print('=' * 72)
out = {}
for nom, txt in (('court', COURT), ('long', LONG)):
    for cond, t in (('brut', txt), ('[slowly]', '[slowly] ' + txt)):
        m, err = moyenne(t)
        if err:
            print('%-6s %-9s -> ERREUR %s' % (nom, cond, err[:120]))
            continue
        out[(nom, cond)] = m
        print('%-6s %-9s -> moy %.2f s' % (nom, cond, m))

# contrôle : balise inventée, même gabarit
m, err = moyenne('[trelmofix] ' + COURT, n=2)
if err:
    print('court  [trelmofix]  -> ERREUR %s' % err[:120])
else:
    out[('court', '[trelmofix]')] = m
    print('court  [trelmofix]  -> moy %.2f s  (contrôle)' % m)

print('=' * 72)
try:
    dc = out[('court', '[slowly]')] - out[('court', 'brut')]
    dl = out[('long', '[slowly]')] - out[('long', 'brut')]
    print('écart court : %+.2f s' % dc)
    print('écart long  : %+.2f s' % dl)
    print('rapport des écarts : %.2f   (attendu ~%.2f si directive, ~1.0 si mot lu)'
          % (dl / dc, len(LONG) / len(COURT)))
    print('VERDICT : %s' % ('DIRECTIVE de débit' if dl / dc > 2.0 else 'MOT PRONONCÉ — ne pas utiliser'))
except KeyError as e:
    print('mesure incomplète', e)

if ('court', '[trelmofix]') in out:
    d = out[('court', '[trelmofix]')] - out[('court', 'brut')]
    print('\ncontrôle [trelmofix] : %+.2f s (si proche de l\'écart [slowly], les deux sont prononcés)' % d)
