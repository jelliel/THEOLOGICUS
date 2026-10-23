# -*- coding: utf-8 -*-
"""v649 — L'INTERFACE REVIENT FLUIDE : une seule mesure de proximite par passe.

Regression mesuree (sonde _v649/sonde_perf.js, 60 messages, 2 figures chacune) :

                              reference   build courant
    reflows pendant scroll        0            1302
    heap JS                      18 Mo          43 Mo

`_atcBoxNear(box)` appelle `box.getBoundingClientRect()`, ce qui FORCE un
reflow synchrone. Il est appele pour CHAQUE message de `state.messages` dans
`applyHighlights`, `applyMarks` ET `applyShapes` — et ce avant tout filtre.
`_atcSettle` rejoue 4 passes. Un message est donc mesure 3 x 4 = 12 fois par
sequence de stabilisation, la ou 1 suffit.

Correctif : la proximite est memorisee par message PENDANT une passe de
stabilisation, et REMISE A ZERO a chaque passe (le contenu grandit entre les
passes — c'est exactement ce que la stabilisation guette, il faut donc
re-mesurer). Le cache est ACTIF uniquement dans `passe()` : tous les autres
points d'appel (rendu direct, repli d'erreur) mesurent comme avant, donc aucun
n'est expose a une valeur perimee.

La position d'un message ne peut pas changer pendant une passe synchrone : les
seules ecritures de style portent sur des figures en position absolue, qui ne
deplacent pas les boites de message. La memorisation est donc sans effet sur
le resultat.
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

# ─────────────── A. `_atcBoxNear` : memorisation par passe ───────────────
AVANT_A = (
    "  var _ATC_VIEW_MARGIN = 300;\r\n"
    "  function _atcBoxNear(box){\r\n"
    "    try {\r\n"
    "      var r = box.getBoundingClientRect();\r\n"
    "      var vh = (window.innerHeight || document.documentElement.clientHeight || 800);\r\n"
    "      var vw = (window.innerWidth || document.documentElement.clientWidth || 1200);\r\n"
    "      return (r.bottom >= -_ATC_VIEW_MARGIN) && (r.top <= vh + _ATC_VIEW_MARGIN) && (r.right >= 0) && (r.left <= vw);\r\n"
    "    } catch (e) { return true; }\r\n"
    "  }\r\n"
)

APRES_A = (
    "  var _ATC_VIEW_MARGIN = 300;\r\n"
    "  /* v649 — cache de proximite, ACTIF uniquement pendant une passe de\r\n"
    "     stabilisation. Voir `_atcBoxNear` : hors passe, on mesure toujours. */\r\n"
    "  var _atcNearActif = false;\r\n"
    "  var _atcPasseId = 0;\r\n"
    "  function _atcBoxNear(box){\r\n"
    "    try {\r\n"
    "      /* \U0001f534 v649 — UNE SEULE MESURE PAR MESSAGE ET PAR PASSE.\r\n"
    "         `getBoundingClientRect` FORCE un reflow synchrone. `_atcBoxNear`\r\n"
    "         etait appele trois fois par message et par passe (une fois dans\r\n"
    "         `applyHighlights`, une dans `applyMarks`, une dans\r\n"
    "         `applyShapes`), soit 12 mesures par message pour une sequence de\r\n"
    "         4 passes. Mesure (sonde _v649/sonde_perf.js, 60 messages) :\r\n"
    "         744 reflows par settle et 1302 par defilement, la ou le build\r\n"
    "         d'avant la refonte en coutait 0 — c'est la regression de fluidite\r\n"
    "         signalee par l'utilisateur.\r\n"
    "         La position d'un message ne peut pas changer pendant une passe\r\n"
    "         synchrone : les seules ecritures de style portent sur des figures\r\n"
    "         en position absolue, qui ne deplacent pas les boites de message.\r\n"
    "         La memorisation est donc sans effet sur le resultat.\r\n"
    "         Le cache n'est ACTIF que dans `passe()` : tout autre point d'appel\r\n"
    "         mesure comme avant, donc aucun n'est expose a une valeur perimee.\r\n"
    "         Et l'identifiant de passe change a chaque passe, car le contenu\r\n"
    "         grandit ENTRE les passes — c'est ce que la stabilisation guette. */\r\n"
    "      if (_atcNearActif && box.__atcPasseVue === _atcPasseId) return box.__atcPasseVal;\r\n"
    "      var r = box.getBoundingClientRect();\r\n"
    "      var vh = (window.innerHeight || document.documentElement.clientHeight || 800);\r\n"
    "      var vw = (window.innerWidth || document.documentElement.clientWidth || 1200);\r\n"
    "      var _pres = (r.bottom >= -_ATC_VIEW_MARGIN) && (r.top <= vh + _ATC_VIEW_MARGIN) && (r.right >= 0) && (r.left <= vw);\r\n"
    "      if (_atcNearActif) { box.__atcPasseVue = _atcPasseId; box.__atcPasseVal = _pres; }\r\n"
    "      return _pres;\r\n"
    "    } catch (e) { return true; }\r\n"
    "  }\r\n"
)
s = once(s, AVANT_A, APRES_A, "A. _atcBoxNear : mesure memorisee par passe")

# ─────────────── B. `passe()` : activer le cache, changer de passe ───────────────
AVANT_B = (
    "      if (window.__atcFigEditing) return;\r\n"
    "      if (window.__atcGeste && window.__atcGeste > _seq0) return;\r\n"
    "      window.__atcApplying = true;\r\n"
    "      try { applyHighlights(); applyMarks(); applyShapes(); } catch (e) {}\r\n"
    "      setTimeout(function(){ window.__atcApplying = false; }, 0);\r\n"
)

APRES_B = (
    "      if (window.__atcFigEditing) return;\r\n"
    "      if (window.__atcGeste && window.__atcGeste > _seq0) return;\r\n"
    "      window.__atcApplying = true;\r\n"
    "      /* v649 — nouvelle passe : le cache de proximite est remis a zero,\r\n"
    "         puis active le temps des trois apply. Hors de ce bloc, le cache\r\n"
    "         est inactif et `_atcBoxNear` mesure comme avant. */\r\n"
    "      _atcPasseId++;\r\n"
    "      _atcNearActif = true;\r\n"
    "      try { applyHighlights(); applyMarks(); applyShapes(); } catch (e) {}\r\n"
    "      _atcNearActif = false;\r\n"
    "      setTimeout(function(){ window.__atcApplying = false; }, 0);\r\n"
)
s = once(s, AVANT_B, APRES_B, "B. passe() : identifiant de passe + cache actif")

# Le remplacement DOIT changer le fichier.
with io.open(CIBLE, "r", encoding="utf-8", newline="") as f:
    avant_ecriture = f.read()
if s == avant_ecriture:
    print("[ECHEC] aucune difference produite.")
    sys.exit(1)

crlf = s.count("\r\n")
lf_iso = len([1 for i, c in enumerate(s) if c == "\n" and (i == 0 or s[i - 1] != "\r")])
if lf_iso:
    print("[ECHEC] %d fin(s) de ligne LF isolee(s) dans le resultat." % lf_iso)
    sys.exit(1)

bak = CIBLE + ".v649.bak"
if not os.path.exists(bak):
    shutil.copy2(CIBLE, bak)
    print("[OK] sauvegarde : %s" % os.path.basename(bak))

with io.open(CIBLE, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("OK \u2014 v649 appliqu\u00e9. CRLF : %d, LF isol\u00e9s : %d" % (crlf, lf_iso))
