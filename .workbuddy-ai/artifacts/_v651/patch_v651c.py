# -*- coding: utf-8 -*-
"""v651c — REPARER TOUT DE SUITE, PUIS CONVERGER.

v651 avait gate la reparation INITIALE sur le calme. Mesure : les bancs
d'ancrage ne voient plus aucune ancre (v634 : « AUCUNE ancre : controle vide »,
v633 donnees reelles en echec). Le contrat « une figure sans ancre est reparee
au rendu » est casse.

On separe donc les deux moments :

  - REPARATION INITIALE : immediate, comme avant. Le contrat est preserve.
  - CONVERGENCE : si la hauteur de contenu a bouge de plus de 40 px depuis la
    reparation (une fiche est arrivee), on REFait la reparation une fois la mise
    en page calme. Borne a 3 reprises.

Attendu : que les fiches soient en cache ou non, les deux ouvertures convergent
vers la meme ancre (mesure : end=139 dans les deux cas), au lieu de 199 / 139.
"""
import io, os, shutil, sys

_ici = os.path.dirname(os.path.abspath(__file__))
CIBLE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(_ici))),
                     "THEOLOGICUS.html")

with io.open(CIBLE, "r", encoding="utf-8", newline="") as f:
    s = f.read()

def once(s, avant, apres, etiquette):
    n = s.count(avant)
    if n != 1:
        print("[ECHEC] %s : %d occurrence(s) de l'ancre (attendu 1)." % (etiquette, n))
        sys.exit(1)
    print("[OK] %s" % etiquette)
    return s.replace(avant, apres, 1)

AVANT = (
    "      if (!f.ancre) {\r\n"
    "        /* v651 \u2014 ne pas reparer sur une mise en page qui bouge. */\r\n"
    "        if (!_atcCalmePasse) return;\r\n"
    "        if (!_ancFit(box, f, figEl)) return;\r\n"
    "        if (f.ancre) f.ancre._h = _atcCalmeH;\r\n"
    "        _repare = true;\r\n"
    "      }\r\n"
)
APRES = (
    "      if (!f.ancre) {\r\n"
    "        /* v651c \u2014 REPARATION IMMEDIATE, contrat inchange : une figure sans\r\n"
    "           ancre est reparee au rendu. C'est la CONVERGENCE ci-dessus qui\r\n"
    "           rattrape le cas d'une fiche arrivee trop tard ; gatder ici sur le\r\n"
    "           calme cassait le contrat (v634 : « AUCUNE ancre : controle vide »). */\r\n"
    "        if (!_ancFit(box, f, figEl)) return;\r\n"
    "        if (f.ancre) f.ancre._h = _atcCalmeH;\r\n"
    "        _repare = true;\r\n"
    "      }\r\n"
)
s = once(s, AVANT, APRES, "A. reparation initiale : immediate (contrat preserve)")

with io.open(CIBLE, "r", encoding="utf-8", newline="") as f:
    ref = f.read()
if s == ref:
    print("[ECHEC] aucune difference produite.")
    sys.exit(1)

crlf = s.count("\r\n")
lf_iso = len([1 for i, c in enumerate(s) if c == "\n" and (i == 0 or s[i - 1] != "\r")])
if lf_iso:
    print("[ECHEC] %d fin(s) de ligne LF isolee(s)." % lf_iso)
    sys.exit(1)

bak = CIBLE + ".v651c.bak"
if not os.path.exists(bak):
    shutil.copy2(CIBLE, bak)
    print("[OK] sauvegarde : %s" % os.path.basename(bak))

with io.open(CIBLE, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("OK \u2014 v651c appliqu\u00e9. CRLF : %d, LF isol\u00e9s : %d" % (crlf, lf_iso))
