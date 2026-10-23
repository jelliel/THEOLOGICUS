# -*- coding: utf-8 -*-
"""v649c — LA PROXIMITE NE COUTE PLUS RIEN PENDANT UN SCROLL.

Etat apres v649 + v649b (sonde _v649, 60 messages) :

                              reference   apres v649b
    reflows / scroll (10 pas)     0            858
    reflows / settle             —             272

Le reste du cout du scroll, c'est `_atcBoxNear` : UNE mesure par message et par
passe. Or la position d'un message dans le DOCUMENT ne change que lorsque le
contenu AU-DESSUS de lui change — jamais parce qu'on a fait defiler la vue.

Correctif : on memorise la position DOCUMENT du message (haut + hauteur), et on
calcule la proximite par arithmetic (`y - scrollTop` contre le viewport), SANS
aucun `getBoundingClientRect`. Le cache est invalide par une signature de mise
en page peu coûteuse : la hauteur de contenu du conteneur. Des que le contenu
grandit, la hauteur change et tout le monde re-mesure — ce qui est exactement
la condition que la stabilisation doit guetter.

Consequence : un defilement continu ne force plus AUCUN reflow de proximite.
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
    "  var _ATC_VIEW_MARGIN = 300;\r\n"
    "  /* v649 \u2014 cache de proximite, ACTIF uniquement pendant une passe de\r\n"
    "     stabilisation. Voir `_atcBoxNear` : hors passe, on mesure toujours. */\r\n"
    "  var _atcNearActif = false;\r\n"
    "  var _atcPasseId = 0;\r\n"
    "  function _atcBoxNear(box){\r\n"
    "    try {\r\n"
    "      /* \U0001f534 v649 \u2014 UNE SEULE MESURE PAR MESSAGE ET PAR PASSE.\r\n"
    "         `getBoundingClientRect` FORCE un reflow synchrone. `_atcBoxNear`\r\n"
    "         etait appele trois fois par message et par passe (une fois dans\r\n"
    "         `applyHighlights`, une dans `applyMarks`, une dans\r\n"
    "         `applyShapes`), soit 12 mesures par message pour une sequence de\r\n"
    "         4 passes. Mesure (sonde _v649/sonde_perf.js, 60 messages) :\r\n"
    "         744 reflows par settle et 1302 par defilement, la ou le build\r\n"
    "         d'avant la refonte en coutait 0 \u2014 c'est la regression de fluidite\r\n"
    "         signalee par l'utilisateur.\r\n"
    "         La position d'un message ne peut pas changer pendant une passe\r\n"
    "         synchrone : les seules ecritures de style portent sur des figures\r\n"
    "         en position absolue, qui ne deplacent pas les boites de message.\r\n"
    "         La memorisation est donc sans effet sur le resultat.\r\n"
    "         Le cache n'est ACTIF que dans `passe()` : tout autre point d'appel\r\n"
    "         mesure comme avant, donc aucun n'est expose a une valeur perimee.\r\n"
    "         Et l'identifiant de passe change a chaque passe, car le contenu\r\n"
    "         grandit ENTRE les passes \u2014 c'est ce que la stabilisation guette. */\r\n"
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

APRES = (
    "  var _ATC_VIEW_MARGIN = 300;\r\n"
    "  /* v649c \u2014 position DOCUMENT memorisee par message, invalidee par la\r\n"
    "     hauteur de contenu du conteneur. Voir `_atcBoxNear`. */\r\n"
    "  var _atcNearH = -1;\r\n"
    "  var _atcNearGen = 0;\r\n"
    "  function _atcConteneurScroll(){\r\n"
    "    var el = document.querySelector('#chat-container') || document.querySelector('.message-content');\r\n"
    "    if (!el) el = document.scrollingElement || document.documentElement;\r\n"
    "    return el;\r\n"
    "  }\r\n"
    "  function _atcBoxNear(box){\r\n"
    "    try {\r\n"
    "      /* \U0001f534 v649/v649c \u2014 LA PROXIMITE NE DOIT PLUS COUTER DE REFLOW.\r\n"
    "         `getBoundingClientRect` FORCE un reflow synchrone. Histoire mesuree\r\n"
    "         (sonde _v649, 60 messages, 2 figures) :\r\n"
    "           v648 ( builds publies )  744 reflows / settle, 1302 / defilement\r\n"
    "           v649 ( cache par passe )  272 / settle,  858 / defilement\r\n"
    "         La position d'un message dans le DOCUMENT ne change que lorsque le\r\n"
    "         contenu AU-DESSUS change \u2014 jamais parce qu'on a fait defiler la\r\n"
    "         vue. On memorise donc cette position, et la proximite devient un\r\n"
    "         calcul arithmetique : `y - scrollTop` contre le viewport.\r\n"
    "         Invalidation par la hauteur de contenu du conteneur : des que le\r\n"
    "         contenu grandit, elle change et tout le monde re-mesure \u2014 exactement\r\n"
    "         la condition que la stabilisation doit guetter. Un defilement, lui,\r\n"
    "         ne change pas cette hauteur : il ne coute donc PLUS AUCUN reflow.\r\n"
    "         `_atcConteneurScroll` est indispensable : `document.scrollingElement`\r\n"
    "         NE DEFILE PAS dans cette app (scrollHeight == clientHeight == 900),\r\n"
    "         le vrai conteneur est `#chat-container` (24175 / 697). */\r\n"
    "      var sc = _atcConteneurScroll();\r\n"
    "      var h = (sc === document.documentElement || sc === document.body)\r\n"
    "        ? (document.documentElement.scrollHeight || document.body.scrollHeight)\r\n"
    "        : sc.scrollHeight;\r\n"
    "      if (h !== _atcNearH) { _atcNearH = h; _atcNearGen++; }\r\n"
    "      if (box.__atcNearGen === _atcNearGen) {\r\n"
    "        var st = sc.scrollTop || 0;\r\n"
    "        var vh2 = (window.innerHeight || document.documentElement.clientHeight || 800);\r\n"
    "        var top = box.__atcNearY, bot = top + (box.__atcNearHH || 0);\r\n"
    "        return (bot >= st - _ATC_VIEW_MARGIN) && (top <= st + vh2 + _ATC_VIEW_MARGIN);\r\n"
    "      }\r\n"
    "      var r = box.getBoundingClientRect();\r\n"
    "      var st2 = sc.scrollTop || 0;\r\n"
    "      box.__atcNearY = r.top + st2;\r\n"
    "      box.__atcNearHH = r.height;\r\n"
    "      box.__atcNearGen = _atcNearGen;\r\n"
    "      var vh = (window.innerHeight || document.documentElement.clientHeight || 800);\r\n"
    "      var vw = (window.innerWidth || document.documentElement.clientWidth || 1200);\r\n"
    "      return (r.bottom >= -_ATC_VIEW_MARGIN) && (r.top <= vh + _ATC_VIEW_MARGIN) && (r.right >= 0) && (r.left <= vw);\r\n"
    "    } catch (e) { return true; }\r\n"
    "  }\r\n"
)
s = once(s, AVANT, APRES, "A. _atcBoxNear : proximite calculee sans reflow")

# La passe de stabilisation n'a plus besoin d'activer un cache par passe :
# l'invalidation se fait par la hauteur de contenu. On retire les deux lignes
# devenues inutiles, SANS toucher au reste de `passe()`.
AVANT_B = (
    "      _atcPasseId++;\r\n"
    "      _atcNearActif = true;\r\n"
    "      try { applyHighlights(); applyMarks(); applyShapes(); } catch (e) {}\r\n"
    "      _atcNearActif = false;\r\n"
)
APRES_B = (
    "      /* v649c \u2014 plus de cache par passe : l'invalidation de `_atcBoxNear`\r\n"
    "         se fait par la hauteur de contenu, ce qui est plus precis (une passe\r\n"
    "         apres une insertion re-mesure, une passe apres un simple scroll non). */\r\n"
    "      try { applyHighlights(); applyMarks(); applyShapes(); } catch (e) {}\r\n"
)
s = once(s, AVANT_B, APRES_B, "B. passe() : cache par passe retire")

with io.open(CIBLE, "r", encoding="utf-8", newline="") as f:
    ref = f.read()
if s == ref:
    print("[ECHEC] aucune difference produite.")
    sys.exit(1)

crlf = s.count("\r\n")
lf_iso = len([1 for i, c in enumerate(s) if c == "\n" and (i == 0 or s[i - 1] != "\r")])
if lf_iso:
    print("[ECHEC] %d fin(s) de ligne LF isolee(s) dans le resultat." % lf_iso)
    sys.exit(1)

bak = CIBLE + ".v649c.bak"
if not os.path.exists(bak):
    shutil.copy2(CIBLE, bak)
    print("[OK] sauvegarde : %s" % os.path.basename(bak))

with io.open(CIBLE, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("OK \u2014 v649c appliqu\u00e9. CRLF : %d, LF isol\u00e9s : %d" % (crlf, lf_iso))
