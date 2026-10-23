# -*- coding: utf-8 -*-
"""v654 — LE FILET localStorage NE DOIT PAS REMPLIR LE QUOTA.

CAUSE RACINE du « les encadrements changent d'emplacement a chaque ouverture »,
mesuree sur le store reel de l'utilisateur (om_pull0.json) :

    localStorage total ......... 23,90 Mo   (quota navigateur ~5 Mo)
    dont chat:: ................ 407 cles, 23,90 Mo
    theologicus_mssfig_v1 ...... ABSENT

`theologicus_mssfig_v1` est le cache des fiches Wikipedia. Il est ecrit par
`cset()`, dont le `catch (e) {}` avale silencieusement le QuotaExceededError.
Le cache n'a donc JAMAIS pu s'ecrire : a chaque ouverture, toutes les fiches
sont re-telechargees, s'inserent quand elles arrivent, decalent le texte — et
les cadres, correctement ancres, SUIVENT ce texte.

Mesure decisive qui a ecarte l'hypothese de l'ancrage (banc reel, 3 runs) :

    figures deplacees   ancre changee     position suivie (ancre identique)
    18                  0/18              18/18
    13                  1/13              12/13
    11                  1/11              10/11

Les ancres sont IDENTIQUES : ce n'est pas une reparation non deterministe. Les
figures suivent leur texte, et le texte se decale parce que les fiches arrivent
a des moments differents.

D'ou viennent les 23,90 Mo : `flushChatNow()` ecrit la conversation ENTIERE dans
localStorage a chaque changement d'annotation (c'est `atcPersist()`), en plus
d'IndexedDB qui est la source canonique. 407 conversations x ~59 Ko.

CORRECTIF : `localStorageBackup` reste inchange dans le cas normal. Si le quota
est atteint, il evince les AUTRES conversations du filet (IndexedDB les garde)
puis reessaie. Le filet continue de proteger la conversation courante — celle
qui est reellement en risque au dechargement — sans affamer le reste.
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
    " function localStorageBackup(id, payload) {\r\n"
    "   try { localStorage.setItem('theologicus_chat_' + id, JSON.stringify(payload)); } catch(e) {}\r\n"
    " }\r\n"
)

APRES = (
    " function localStorageBackup(id, payload) {\r\n"
    "   /* \U0001f534 v654 \u2014 LE FILET NE DOIT PAS REMPLIR LE QUOTA.\r\n"
    "      Mesure sur le store reel de l'utilisateur : 23,90 Mo de\n"
    "      `theologicus_chat_*` (407 conversations) pour un quota navigateur de\n"
    "      ~5 Mo. Consequence : `cset()` \u2014 le cache des fiches Wikipedia, cle\n"
    "      `theologicus_mssfig_v1` \u2014 ne pouvait JAMAIS s'ecrire (son\n"
    "      `catch (e) {}` avale le QuotaExceededError). Les fiches etaient donc\n"
    "      re-telechargees a chaque ouverture, s'inseraient quand elles\n"
    "      arrivaient, decalaient le texte \u2014 et les cadres, correctement\n"
    "      ancres, SUIVAIENT ce texte. C'etait la vraie cause du « ca change\n"
    "      d'emplacement a chaque ouverture » (mesure : ancre identique dans\n"
    "      18 cas sur 18, seule la position suivait).\r\n"
    "      IndexedDB est la source CANONIQUE ; ce filet n'est qu'un miroir. On\n"
    "      peut donc evincer les AUTRES conversations quand le quota est atteint,\n"
    "      sans rien perdre. Le cas normal (quota disponible) est inchange. */\r\n"
    "   var _cle = 'theologicus_chat_' + id, _val;\r\n"
    "   try { _val = JSON.stringify(payload); } catch (e) { return; }\r\n"
    "   try { localStorage.setItem(_cle, _val); return; } catch (e) {}\r\n"
    "   try {\r\n"
    "     var _autres = [];\r\n"
    "     for (var _i = 0; _i < localStorage.length; _i++) {\r\n"
    "       var _k = localStorage.key(_i);\r\n"
    "       if (_k && _k.indexOf('theologicus_chat_') === 0 && _k !== _cle) _autres.push(_k);\r\n"
    "     }\r\n"
    "     for (var _j = 0; _j < _autres.length; _j++) { try { localStorage.removeItem(_autres[_j]); } catch (e2) {} }\r\n"
    "     window.__atcFiletEvince = (window.__atcFiletEvince || 0) + _autres.length;\r\n"
    "     localStorage.setItem(_cle, _val);\r\n"
    "   } catch (e3) {}\r\n"
    " }\r\n"
)

# Normalisation : les blocs ci-dessus contiennent des \n litteraux dans les
# commentaires ; le fichier cible est en CRLF. On normalise AVANT usage.
def _crlf(t):
    return t.replace("\r\n", "\n").replace("\n", "\r\n")
AVANT, APRES = _crlf(AVANT), _crlf(APRES)

s = once(s, AVANT, APRES, "A. localStorageBackup : evince sur quota atteint")

# Diagnostic : que cset() signale son echec au lieu de le taire.
AVANT_B = (
    "  function cset(c) {\r\n"
    "    try {\r\n"
    "      /* v164 \u2014 purge : le cache ne dépasse pas ~450 entrées */\r\n"
    "      var ks = Object.keys(c);\r\n"
    "      if (ks.length > 500) ks.slice(0, ks.length - 450).forEach(function (k) { delete c[k]; });\r\n"
    "      localStorage.setItem(CKEY, JSON.stringify(c));\r\n"
    "    } catch (e) {}\r\n"
    "  }\r\n"
)
APRES_B = (
    "  function cset(c) {\r\n"
    "    try {\r\n"
    "      /* v164 \u2014 purge : le cache ne dépasse pas ~450 entrées */\r\n"
    "      var ks = Object.keys(c);\r\n"
    "      if (ks.length > 500) ks.slice(0, ks.length - 450).forEach(function (k) { delete c[k]; });\r\n"
    "      localStorage.setItem(CKEY, JSON.stringify(c));\r\n"
    "      window.__atcCacheFiches = 'ok';\r\n"
    "    } catch (e) {\r\n"
    "      /* v654 \u2014 NE PAS TAIRE L'ECHEC. Ce `catch` vide a cache pendant des\n"
    "         mois que le quota etait plein et que le cache des fiches n'etait\n"
    "         jamais ecrit : les fiches etaient re-telechargees a chaque\n"
    "         ouverture. On garde le meme comportement (on ne casse rien) mais on\n"
    "         laisse une trace mesurable. */\r\n"
    "      window.__atcCacheFiches = 'quota';\r\n"
    "    }\r\n"
    "  }\r\n"
)

AVANT_B, APRES_B = _crlf(AVANT_B), _crlf(APRES_B)
n = s.count(AVANT_B)
if n == 2:
    # Le bloc existe deux fois (module duplique) : on patche les deux.
    s = s.replace(AVANT_B, APRES_B)
    print("[OK] B. cset : echec signale (2 occurrences)")
elif n == 1:
    s = once(s, AVANT_B, APRES_B, "B. cset : echec signale")
else:
    print("[ECHEC] B. cset : %d occurrence(s) (attendu 1 ou 2)." % n)
    sys.exit(1)

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

bak = CIBLE + ".v654.bak"
if not os.path.exists(bak):
    shutil.copy2(CIBLE, bak)
    print("[OK] sauvegarde : %s" % os.path.basename(bak))

with io.open(CIBLE, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("OK \u2014 v654 appliqu\u00e9. CRLF : %d, LF isol\u00e9s : %d" % (crlf, lf_iso))
