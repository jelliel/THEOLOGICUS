# -*- coding: utf-8 -*-
"""v651b — CONVERGER VERS LA MISE EN PAGE FINALE (au lieu d'attendre).

v651 avait gate la reparation sur 700 ms de calme. Mesure : la reparation
arrive alors vers 1100 ms, ce qui casse v633/v634 (ils verifient avant) — et
surtout cela NE RESOUT PAS le cas d'une fiche qui arrive a 1 s : la reparation
a deja eu lieu sur la mise en page incomplete.

Le bon critere n'est pas le MOMENT, c'est la CONVERGENCE : une ancre mesuree sur
une mise en page incomplete doit etre REFaite quand cette mise en page a change.

    - seuil de calme ramene a 250 ms (assez tot pour les bancs) ;
    - on memorise la hauteur de contenu au moment de la reparation (`_h`) ;
    - des que cette hauteur a bouge de plus de 40 px ET que la mise en page est
      calme, on refait la reparation ;
    - borne a 3 reprises : au-dela on garde ce qu'on a, plutot que d'osciller.

Resultat attendu : que les fiches soient en cache ou non, les deux ouvertures
convergent vers la MEME ancre — c'est la stabilite demandee, sans sacrifier la
rapidite de la premiere reparation.
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

# ───── A. seuil de calme : 700 -> 250 ms ─────
AVANT_A = "      return (now - _atcCalmeT) >= 700;\r\n"
APRES_A = "      return (now - _atcCalmeT) >= 250;\r\n"
s = once(s, AVANT_A, APRES_A, "A. seuil de calme ramene a 250 ms")

# ───── B. reparation + convergence ─────
AVANT_B = (
    "      var _repare = false;\r\n"
    "      if (!f.ancre) {\r\n"
    "        /* \U0001f534 v651 \u2014 NE PAS REPARER SUR UNE MISE EN PAGE QUI BOUGE.\r\n"
    "           Mesure : ancre end=199 / position y=283 si une fiche s'insere\r\n"
    "           apres la reparation, contre end=139 / y=0 si elle est deja la.\r\n"
    "           La reparation etant PERSISTEE, l'ecart se fige et le cadre change\r\n"
    "           d'emplacement a l'ouverture suivante. On attend donc le calme\r\n"
    "           (700 ms sans changement de hauteur) ; une passe ulterieure\r\n"
    "           reprendra la figure. */\r\n"
    "        if (!_atcCalmePasse) return;\r\n"
    "        if (!_ancFit(box, f, figEl)) return;\r\n"
    "        _repare = true;\r\n"
    "      }\r\n"
)

APRES_B = (
    "      var _repare = false;\r\n"
    "      /* \U0001f534 v651b \u2014 CONVERGER VERS LA MISE EN PAGE FINALE.\r\n"
    "         Une fiche (`.theo-fig`) ou une puce de sources peut arriver APRES la\r\n"
    "         reparation : l'ancre a alors ete mesuree sur une mise en page\r\n"
    "         incomplete, et comme elle est PERSISTEE, l'ecart se fige. Mesure\r\n"
    "         (sonde _v651/sonde_reparation.js) : ancre end=199 et position y=283\r\n"
    "         quand la fiche arrive apres, contre end=139 et y=0 quand elle est\r\n"
    "         deja la \u2014 le cadre change donc d'emplacement a chaque ouverture,\r\n"
    "         selon que les fiches sont en cache ou non.\r\n"
    "         On memorise la hauteur de contenu au moment de la reparation (`_h`)\r\n"
    "         et on REFait la reparation des que cette hauteur a bouge de plus de\r\n"
    "         40 px, une fois la mise en page calme. Les deux ouvertures\r\n"
    "         convergent ainsi vers la MEME ancre. Borne a 3 reprises : au-dela on\r\n"
    "         garde ce qu'on a, plutot que d'osciller. */\r\n"
    "      if (f.ancre && _atcCalmePasse && typeof f.ancre._h === 'number' &&\r\n"
    "          _atcCalmeH > 0 && Math.abs(_atcCalmeH - f.ancre._h) > 40 &&\r\n"
    "          (f.ancre._n || 0) < 3) {\r\n"
    "        var _nRep = (f.ancre._n || 0) + 1;\r\n"
    "        delete f.ancre;\r\n"
    "        if (_ancFit(box, f, figEl) && f.ancre) { f.ancre._n = _nRep; f.ancre._h = _atcCalmeH; }\r\n"
    "        _repare = true;\r\n"
    "      }\r\n"
    "      if (!f.ancre) {\r\n"
    "        /* v651 \u2014 ne pas reparer sur une mise en page qui bouge. */\r\n"
    "        if (!_atcCalmePasse) return;\r\n"
    "        if (!_ancFit(box, f, figEl)) return;\r\n"
    "        if (f.ancre) f.ancre._h = _atcCalmeH;\r\n"
    "        _repare = true;\r\n"
    "      }\r\n"
)
s = once(s, AVANT_B, APRES_B, "B. convergence : re-reparation sur changement de hauteur")

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

bak = CIBLE + ".v651b.bak"
if not os.path.exists(bak):
    shutil.copy2(CIBLE, bak)
    print("[OK] sauvegarde : %s" % os.path.basename(bak))

with io.open(CIBLE, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("OK \u2014 v651b appliqu\u00e9. CRLF : %d, LF isol\u00e9s : %d" % (crlf, lf_iso))
