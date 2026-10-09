# -*- coding: utf-8 -*-
"""Vérifie la cohérence des ASSETS et des MODULES avant publication.

Trois contrôles, chacun motivé par un défaut RÉELLEMENT survenu :

1. ASSETS — un dossier de données du dépôt absent de `tools/corpus_list.py`
   serait chargé par l'application mais ABSENT des binaires (cas vécu :
   `biblelt` et `syriaque`). Inversement, un dossier listé mais inexistant
   ferait échouer le build.
2. COPIE EMBARQUÉE — `THEOLOGICUS.html` contient une copie base64 de
   `ai-video.html` (`#aivideo-b64`), servie en repli quand la route du relais
   échoue (c'est CETTE copie qui tourne dans l'APK). Oubliée une fois : l'APK
   servait une page périmée, en silence.
3. MODULES — les modules injectés sont identifiés par `<script id="vNNN">` ;
   un identifiant dupliqué ferait exécuter deux fois le même code.

Usage : py tools/verifier_assets.py      (code de sortie 1 si un contrôle échoue)
"""
import base64
import hashlib
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
from corpus_list import CORPUS, IGNORES, EXPECTED  # noqa: E402


def controle_assets():
    """Tout dossier de données du dépôt doit être dans la liste, et inversement."""
    erreurs, avertissements = [], []

    def est_dossier_de_donnees(nom):
        p = os.path.join(ROOT, nom)
        if not os.path.isdir(p):
            return False
        # heuristique : un dossier de données contient des tranches .js
        try:
            fichiers = os.listdir(p)
        except OSError:
            return False
        return any(f.endswith('.js') for f in fichiers)

    presents = []
    for nom in sorted(os.listdir(ROOT)):
        if nom.startswith('.') or nom in IGNORES:
            continue
        if est_dossier_de_donnees(nom):
            presents.append(nom)

    for nom in presents:
        if nom not in CORPUS:
            erreurs.append('dossier de données NON EMBARQUÉ : %s (à ajouter dans tools/corpus_list.py)' % nom)
    for nom in CORPUS:
        if not os.path.isdir(os.path.join(ROOT, nom)):
            erreurs.append('dossier listé mais ABSENT du dépôt : %s' % nom)

    for nom, (prefixe, ext, attendu) in EXPECTED.items():
        p = os.path.join(ROOT, nom)
        if not os.path.isdir(p):
            continue
        got = len([f for f in os.listdir(p) if f.startswith(prefixe) and f.endswith(ext) and f != 'index.js'])
        if got != attendu:
            avertissements.append('%s : %d tranches (attendu %d)' % (nom, got, attendu))
    return erreurs, avertissements


def controle_copie_embarquee():
    """Les copies base64 des compagnons doivent correspondre EXACTEMENT aux fichiers.

    v498 : il y a désormais DEUX compagnons embarqués — ai-video.html
    (#aivideo-b64) et newsreel.html (#newsreel-b64). Chacun doit être à jour,
    sinon l'app packagée sert une page périmée en silence."""
    html = io.open(os.path.join(ROOT, 'THEOLOGICUS.html'), encoding='utf-8').read()
    erreurs, infos = [], []
    for div_id, fichier in (('aivideo-b64', 'ai-video.html'),
                            ('newsreel-b64', 'newsreel.html')):
        m = re.search(r'<div id="%s" hidden>([A-Za-z0-9+/=]+)</div>' % div_id, html)
        if not m:
            erreurs.append('balise #%s introuvable dans THEOLOGICUS.html' % div_id)
            continue
        embarque = base64.b64decode(m.group(1))
        chemin = os.path.join(ROOT, fichier)
        if not os.path.isfile(chemin):
            erreurs.append('compagnon %s absent (copie embarquée #%s orpheline)' % (fichier, div_id))
            continue
        reel = io.open(chemin, 'rb').read()
        if hashlib.sha256(embarque).hexdigest() != hashlib.sha256(reel).hexdigest():
            erreurs.append('copie embarquée #%s PÉRIMÉE : lancer py tools/sync_html.py '
                           'puis committer THEOLOGICUS.html' % div_id)
            continue
        infos.append('copie embarquée %s à jour (%d octets)' % (fichier, len(reel)))
    return erreurs, infos


def controle_modules():
    """Identifiants de modules uniques dans THEOLOGICUS.html et ai-video.html."""
    erreurs, infos = [], []
    for nom in ('THEOLOGICUS.html', 'ai-video.html'):
        html = io.open(os.path.join(ROOT, nom), encoding='utf-8').read()
        ids = re.findall(r'<script id="([^"]+)">', html)
        doublons = sorted({i for i in ids if ids.count(i) > 1})
        if doublons:
            erreurs.append('%s : identifiant(s) de module DUPLIQUÉ(S) : %s' % (nom, ', '.join(doublons)))
        infos.append('%s : %d module(s) injecté(s)' % (nom, len(ids)))
    return erreurs, infos


def controle_bancs():
    """Les bancs doivent rester exécutables hors de cette machine.

    Leçon vécue : un banc lançait Chromium par un chemin Windows EN DUR
    (`executablePath: path.join(PW, ...)`) → il échouait en CI alors que tout
    le reste passait. Le chemin ne doit apparaître que derrière une condition
    sur PW_DIR."""
    import glob
    erreurs, infos = [], []
    bancs = sorted(glob.glob(os.path.join(ROOT, '.workbuddy-ai', 'artifacts', '_v4*', 'verify_*.js')))
    rigides = []
    for f in bancs:
        src = io.open(f, encoding='utf-8').read()
        if 'chrome-win64' in src and 'process.env.PW_DIR' not in src:
            rigides.append(os.path.basename(os.path.dirname(f)) + '/' + os.path.basename(f))
    if rigides:
        erreurs.append('banc(s) au chemin navigateur EN DUR (ajouter la condition PW_DIR) : ' + ', '.join(rigides))
    infos.append('%d banc(s) contrôlé(s) pour la portabilité' % len(bancs))
    return erreurs, infos


def main():
    erreurs, infos = [], []
    for controle in (controle_assets, controle_copie_embarquee, controle_modules, controle_bancs):
        e, i = controle()
        erreurs += e
        infos += i
    for i in infos:
        print('  · ' + i)
    if erreurs:
        print('\nÉCHEC :')
        for e in erreurs:
            print('  ✗ ' + e)
        return 1
    print('\nOK — assets, copie embarquée et modules cohérents.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
