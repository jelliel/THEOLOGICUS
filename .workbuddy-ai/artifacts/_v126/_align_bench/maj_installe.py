# -*- coding: utf-8 -*-
"""Met a jour THEOLOGICUS.html dans l'application INSTALLEE que l'utilisateur
lance (cible du raccourci du Bureau), avec la version corrigee du depot.

Pourquoi seulement le HTML : le correctif des cadres d'annotation est
purement HTML/JS. L'exe lit THEOLOGICUS.html dans son propre dossier
(app.py : `base = app_dir()` puis `os.chdir(base)`), donc remplacer ce seul
fichier suffit — aucune recompilation PyInstaller/Inno n'est necessaire.

Securite : sauvegarde de la version en place avant ecriture, et refus
d'ecraser si le fichier de destination ne ressemble pas a THEOLOGICUS.
"""
import os
import re
import shutil
import sys

SRC = r"C:\tmp\theoverify\THEOLOGICUS.html"
DST_DIR = r"C:\Theologicus\.workbuddy-ai\artifacts\_v123\_pub\installe"
DST = os.path.join(DST_DIR, "THEOLOGICUS.html")
BACKUP_DIR = r"C:\tmp\theoverify\.workbuddy-ai\artifacts\_v126\_align_bench\installe_avant"
# 2.0.225 et non 2.0.215 : la version installee est 2.0.224 (verifie sur piece —
# son HTML est identique au HEAD du depot a 9 caracteres pres, ceux du tampon).
# Le « 2.0.214 » que portait ce fichier venait d'un deploiement ANTERIEUR de la
# meme journee ; le suivant, plus haut, n'avait pas ete reporte ici. Tamponner un
# numero INFERIEUR a celui en place ferait « reculer » l'application dans le
# temps, et le garde ci-dessous (version_deja_en_place) le refuse desormais.
VERSION = "2.0.225"

# Correctifs que le HTML source DOIT porter avant d'ecraser l'application.
# Chacun correspond a une version livree : un marqueur absent = on installe
# une regression. v126m = cadres d'annotation (offset + garde d'alignement),
# v127 = remplissage et rotation des figures, v128 = fluidite (fin des
# calques GPU par message et du scrollIntoView par image de defilement),
# v129 = preregages de performance + fiche GPU (remplace les interrupteurs
# bruts de la v35/v39 : verifier les DEUX, car un montage partiel laisserait
# deux commandes pour un meme reglage).
MARQUEURS = [
    ("v126m cadres d'annotation", "_hlAlign"),
    ("v127 remplissage des figures", "applyFigPaint"),
    ("v127 rotation des figures", "applyFigRot"),
    ("v128 fluidite : animation d'entree opt-in", "msg-enter"),
    ("v128 fluidite : minimap paresseuse", "_rebuildMinimap = function"),
    ("v129 preregages de performance", "v129-presets"),
    ("v129 fiche GPU : lecture du moteur", "WEBGL_debug_renderer_info"),
    ("v129 retrait des interrupteurs bruts", "retirerInterrupteursBruts"),
    ("v129 prereglage AUTO", "configDe"),
    # v130 = lisibilite des themes anciens (glass/cyber/midnight) et du bloc
    # v129 en theme clair. On verifie les DEUX moities du correctif : les jetons
    # de surface ajoutes aux themes anciens, ET la surface de carte du bloc v129.
    ("v130 jetons de surface : bulles de conversation", "--chat-assistant: #0a1524"),
    ("v130 jetons de surface : cartes", "--bg-card: #0e1c30"),
    ("v130 bloc v129 : surface de carte", "background: var(--bg-card, #ffffff)"),
    # v131 = les douze jetons morts, la specificite des themes clairs, et la
    # fuite de --glass-bg dans les themes v6. Chaque marqueur vise un correctif
    # distinct : un seul present signifierait un montage partiel.
    ("v131 jetons derives (partages)", "--text-muted: var(--text-dim)"),
    ("v131 surcharge sombre de l'or", "--gold: #ffd166"),
    ("v131 theme clair : specificite", 'html[data-theme="light"] {'),
    ("v131 theme midnight : specificite", 'html[data-theme="midnight"] {'),
    ("v131 panneaux vitres des themes v6", "--glass-bg:rgba(18,12,28,0.62)"),
    ("v131 icone de reference", "color: var(--cyan);\n}"),
    # v132 = les deux familles de defauts des themes clairs. `<style
    # id="v9-palette">` pose sa palette DEUX fois : sur `:root` et sur
    # `.tpai-shell`. Un jeton pose sur la coque masque la valeur heritee pour
    # TOUS ses descendants — donc la surcharge `html[data-theme=...]`, pourtant
    # plus specifique ((0,1,1) contre (0,1,0)), ne l'atteint jamais : la
    # specificite ne sert a rien contre un jeton pose plus bas dans l'arbre.
    # Cinq correctifs distincts, chacun verifie separement — un seul present
    # signifierait un montage partiel, c'est-a-dire un theme clair a moitie
    # repare (plus trompeur qu'aucun correctif).
    ("v132 coque claire : les jetons de surface", 'html[data-theme="light"] .tpai-shell{'),
    ("v132 coque v6-light completee (--hull, --cyan, --wire, --ok)", "--neon:#185fa5; --text-code:#185fa5;"),
    ("v132 panneaux toujours sombres : palette locale", "#references-panel, #archives-panel{"),
    ("v132 exception archives en v6-light", 'html[data-theme="v6-light"] #archives-panel{\n  --text:#1c2a3a;'),
    ("v132 libelle de bulle utilisateur", 'html[data-theme="light"] .message.user .msg-label,'),
]


def version_en_place(dst):
    """Lit le numero de version tamponne dans le HTML installe.

    Attention : le tampon n'est PAS en tete de fichier. Dans THEOLOGICUS.html
    il tombe vers la ligne 33000 d'un fichier de 1,8 Mo (le script qui
    l'affiche est tout en bas) ; lire les premiers 200 ko renvoie donc
    toujours « inconnue ». On lit le fichier entier.
    """
    try:
        with open(dst, encoding="utf-8", newline="") as f:
            txt = f.read()
    except OSError:
        return "inconnue"
    m = re.search(r"STAMPED\s*=\s*'([^']*)'", txt)
    return m.group(1) if m else "inconnue"


def _tup(v):
    """« 2.0.225 » -> (2, 0, 225). None si la forme n'est pas numerique.

    Comparer les versions en CHAINES est faux : « 2.0.9 » > « 2.0.10 »
    lexicographiquement. Le garde ci-dessous doit donc comparer des nombres.
    """
    try:
        return tuple(int(p) for p in v.split("."))
    except (ValueError, AttributeError):
        return None


def main():
    if not os.path.isfile(SRC):
        print("[X] source introuvable :", SRC)
        return 1
    if not os.path.isfile(DST):
        print("[X] cible introuvable :", DST)
        return 1

    with open(SRC, encoding="utf-8", newline="") as f:
        html = f.read()
    if "__THEO_VERSION__" not in html:
        print("[X] le HTML source ne porte pas le tampon __THEO_VERSION__")
        return 1
    manquants = [nom for nom, marq in MARQUEURS if marq not in html]
    if manquants:
        print("[X] le HTML source ne porte PAS : " + ", ".join(manquants) + " — abandon")
        return 1

    # Garde de MONOTONIE. Sans lui, un VERSION reste a une valeur ancienne
    # tamponne l'application avec un numero INFERIEUR a celui en place : l'app
    # « recule » dans le temps, et le diagnostic suivant part d'un numero faux.
    # C'est arrive : ce fichier portait 2.0.214 alors que l'installe etait deja
    # en 2.0.224 (deploiement intermediaire non reporte ici).
    en_place = version_en_place(DST)
    a, b = _tup(en_place), _tup(VERSION)
    if a and b and a >= b:
        print("[X] version en place %s >= %s — refus d'ecraser par une version non superieure."
              % (en_place, VERSION))
        print("    Augmenter VERSION (au-dela de %s), ou verifier qu'on ne deploie pas un recul." % en_place)
        return 1

    # Sauvegarde de la version en place, nommee d'apres son propre tampon.
    os.makedirs(BACKUP_DIR, exist_ok=True)
    avant = version_en_place(DST)
    cur = os.path.join(BACKUP_DIR, "THEOLOGICUS.%s.html" % avant)
    if not os.path.isfile(cur):
        shutil.copy2(DST, cur)
        print("[ok] sauvegarde :", cur)
    else:
        print("[info] sauvegarde deja presente :", cur)

    # Controle : la cible doit bien etre THEOLOGICUS (garde-fou anti-ecrasement)
    with open(DST, encoding="utf-8", newline="") as f:
        old = f.read(4000)
    if "THEOLOGICUS" not in old:
        print("[X] la cible ne ressemble pas a THEOLOGICUS — abandon")
        return 1

    stamped = html.replace("__THEO_VERSION__", VERSION, 1)
    tmp = DST + ".new"
    with open(tmp, "w", encoding="utf-8", newline="") as f:
        f.write(stamped)
    shutil.move(tmp, DST)
    with open(os.path.join(DST_DIR, "version.txt"), "w", encoding="utf-8") as f:
        f.write(VERSION + "\n")
    print("[ok] HTML installe mis a jour ->", DST, "(", len(stamped), "octets )")
    print("[ok] version.txt ->", VERSION)
    return 0


if __name__ == "__main__":
    sys.exit(main())
