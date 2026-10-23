# -*- coding: utf-8 -*-
"""v655 — NE PAS PERDRE LES MUTATIONS QUI ARRIVENT PENDANT UNE PASSE.

MECANISME MESURE (diagnostic _v655/diag_layout.js, conversation reelle
« Kyrios », 15 messages de 11 000 a 14 000 caracteres) :

    hauteur du conteneur, apres le rendu
      614 ms -> 74 832 px
     1645 ms -> 77 094 px
     3816 ms -> 77 886 px        (+3 177 px en 4 s)
    hauteur FINALE, sur 3 ouvertures : 78 009 / 78 009 / 78 009 px
    insertions : 28 x `message`, 12 x `theo-lex`

Deux faits :
  1. la mise en page converge parfaitement (meme hauteur finale a chaque
     ouverture) ;
  2. elle met ~4 s a converger, alors que `_atcSettle` s'arrete a 1 600 ms.

Donc quelque chose doit replacer les figures APRES 1,6 s. Le MutationObserver
le fait — sauf que son garde jette les mutations qui arrivent pendant une passe :

    if (window.__atcStreaming || window.__atcApplying || window.__atcFigEditing) return;

Une insertion `theo-lex` qui tombe pendant `applyShapes` est donc **perdue** :
aucun settle ne la suit, et la figure reste a la position d'avant la croissance.
Comme le moment de l'insertion varie, le resultat varie : c'est la course.

CORRECTIF : quand le garde rejette une mutation, on note le fait ; a la fin de
la passe, on relance un settle. Les mutations ne sont plus perdues.

On garde evidemment le garde : il existe pour eviter de relancer un apply sur
nos PROPRES mutations (unwrap/re-wrap d'applyHighlights, flicker v149). On ne
le supprime pas, on rattrape seulement ce qu'il rejette.
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

# ───── A. le garde de l'observer note les mutations rejetees ─────
AVANT_A = (
    "  if (cc) {\r\n"
    "    const mo = new MutationObserver(function(){\r\n"
    "      /* v149 \u2014 ignorer nos PROPREs mutations (unwrap/re-wrap d'applyHighlights) :\r\n"
    "         c'\u00e9tait le flicker du surlignage. v625 : coalescence par requestAnimationFrame\r\n"
    "         (aligne sur le paint, plus fluide au scroll que setTimeout 60ms). */\r\n"
    "      if (window.__atcStreaming || window.__atcApplying || window.__atcFigEditing) return;\r\n"
    "      _atcScheduleApply();\r\n"
    "    });\r\n"
)
APRES_A = (
    "  if (cc) {\r\n"
    "    const mo = new MutationObserver(function(){\r\n"
    "      /* v149 \u2014 ignorer nos PROPREs mutations (unwrap/re-wrap d'applyHighlights) :\r\n"
    "         c'\u00e9tait le flicker du surlignage. v625 : coalescence par requestAnimationFrame\r\n"
    "         (aligne sur le paint, plus fluide au scroll que setTimeout 60ms). */\r\n"
    "      if (window.__atcStreaming || window.__atcApplying || window.__atcFigEditing) {\r\n"
    "        /* \U0001f534 v655 \u2014 UNE MUTATION REJETEE N'EST PAS UNE MUTATION INUTILE.\r\n"
    "           Mesure (diagnostic _v655) : la mise en page de « Kyrios » grandit de\r\n"
    "           3 177 px pendant ~4 s apres le rendu (74 832 -> 78 009 px), alors que\r\n"
    "           `_atcSettle` s'arrete a 1 600 ms. Les insertions `theo-lex` qui\r\n"
    "           tombent PENDANT une passe etaient jetees ici : aucun settle ne les\r\n"
    "           suivait, et la figure restait a la position d'avant la croissance.\r\n"
    "           Comme le moment d'insertion varie, le resultat varie \u2014 c'est la\r\n"
    "           course qui fait « changer les cadres d'emplacement ».\r\n"
    "           On note le fait, et `passe()` relancera un settle en fin de passe. */\r\n"
    "        window.__atcMutationManquee = true;\r\n"
    "        return;\r\n"
    "      }\r\n"
    "      _atcScheduleApply();\r\n"
    "    });\r\n"
)
s = once(s, AVANT_A, APRES_A, "A. observer : note les mutations rejetees")

# ───── B. `passe()` relance un settle si une mutation a ete manquee ─────
AVANT_B = (
    "      try { applyHighlights(); applyMarks(); applyShapes(); } catch (e) {}\r\n"
    "      setTimeout(function(){ window.__atcApplying = false; }, 0);\r\n"
    "    };\r\n"
)
APRES_B = (
    "      try { applyHighlights(); applyMarks(); applyShapes(); } catch (e) {}\r\n"
    "      setTimeout(function(){\r\n"
    "        window.__atcApplying = false;\r\n"
    "        /* v655 \u2014 on vient de rejeter des mutations pendant cette passe :\r\n"
    "           elles ont peut-etre change la mise en page. On rejoue un settle\r\n"
    "           MAINTENANT que `__atcApplying` est retombe, sinon la figure reste\r\n"
    "           a la position d'avant la croissance (mesure : 3 177 px d'ecart). */\r\n"
    "        if (window.__atcMutationManquee) {\r\n"
    "          window.__atcMutationManquee = false;\r\n"
    "          try { _atcScheduleApply(); } catch (e2) {}\r\n"
    "        }\r\n"
    "      }, 0);\r\n"
    "    };\r\n"
)
s = once(s, AVANT_B, APRES_B, "B. passe() : relance un settle apres une mutation manquee")

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

bak = CIBLE + ".v655.bak"
if not os.path.exists(bak):
    shutil.copy2(CIBLE, bak)
    print("[OK] sauvegarde : %s" % os.path.basename(bak))

with io.open(CIBLE, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("OK \u2014 v655 appliqu\u00e9. CRLF : %d, LF isol\u00e9s : %d" % (crlf, lf_iso))
