# -*- coding: utf-8 -*-
"""v648 — UN GESTE MANUEL N'EST JAMAIS JETE, MEME SUR UNE MISE EN PAGE QUI BOUGE.

Defaut mesure (banc _v648/verify_v648_geste_instable.js, 5/9 sur le build
publie v4.0.662) :

    A-1  le glissement deplace bien le cadre        94/0 -> 138/26   [OK]
    A0   `__atcStable` est bien false au mouseup                    [OK]
    A1   juste apres le mouseup, le cadre est a       138/26        [OK]
    A2   apres stabilisation, le cadre est RAPPELE    94/0          [ECHEC]
    B    le store a x=94 y=0 (le geste ignore)                      [ECHEC]
    C    apres reload : 94/0                                       [ECHEC]
    D    l'ancre n'a plus d'ox/oy                                   [ECHEC]

Cause : le garde v635 de `persistFig` passait AVANT le calcul de `aBouge` :

    if (window.__atcStable === false && origine !== 'creation-manuelle') {
      markChatDirty(); return;      // <- f.x/f.y NON mis a jour, RIEN enregistre
    }
    const nx = ...; const o = ...; const aBouge = ...;
    f.x = nx; f.y = ny; ...

Son commentaire disait « le prochain passage, sur contenu stable, fera foi ».
Mais `_ancPlace` recalcule JUSTEMENT depuis l'ancre et ecrit par-dessus :

    if (!_dejaBon) { f.x = bx; f.y = by; figEl.style.left = f.x + 'px'; }

donc le cadre etait rappele sur son ancre — dans la session ET au demarrage.
`__atcGeste` (v647) ne protege que PENDANT le glissement : il est leve au
`mouseup`, AVANT `persistFig`.

Correctif : ce qui est provisoire sur une mise en page mouvante, c'est la
position ABSOLUE. Ce que l'utilisateur vient de decider — l'ecart a son ancre
(`ox/oy`) — est durable, et `_ancPlace` reconstruit l'absolu depuis l'ancre
(`bx = rr.x + ox` boucle a l'identique). On enregistre donc TOUJOURS un geste
qui a vraiment bouge quelque chose ; le garde ne sert plus que pour un CLIC
qui n'a rien bouge, cas ou il n'y a de toute facon rien a enregistrer.
"""
import io, os, shutil, sys

# Le script vit dans <racine>/.workbuddy-ai/artifacts/_v648/ : `_ici` est deja le
# dossier du script, donc trois remontees suffisent pour atteindre la racine.
_ici = os.path.dirname(os.path.abspath(__file__))
CIBLE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(_ici))),
                     "THEOLOGICUS.html")

with io.open(CIBLE, "r", encoding="utf-8", newline="") as f:
    s = f.read()

AVANT = (
    "  function persistFig(f, fb, origine){\r\n"
    "    /* \u2550\u2550\u2550 v635 \u2014 PAS DE PERSISTANCE SUR UNE MISE EN PAGE MOUVANTE \u2550\u2550\u2550\r\n"
    "       Un cadre deplace ou redimensionne a la main pendant que le contenu\r\n"
    "       s'insere encore enregistrerait une position provisoire (la hauteur de\r\n"
    "       zone a change depuis le debut du cycle). On l'ignore : le prochain\r\n"
    "       passage, sur contenu stable, fera foi. */\r\n"
    "    if (window.__atcStable === false && origine !== 'creation-manuelle') {\r\n"
    "      try { if (typeof markChatDirty === 'function') markChatDirty(); } catch (e) {}\r\n"
    "      return;\r\n"
    "    }\r\n"
    "    const nx = fb.offsetLeft, ny = fb.offsetTop, nw = fb.offsetWidth, nh = fb.offsetHeight;\r\n"
    "    /* v618/v621 \u2014 un CLIC (down+up sans mouvement) appelle aussi persistFig :\r\n"
    "       il ne doit PAS retirer l'ancre, sinon le cadre cesse de suivre son texte\r\n"
    "       apr\u00e8s un simple appui (le correctif v609 \u00e9tait annul\u00e9 sans qu'on le voie).\r\n"
    "       \U0001f534 La comparaison se fait avec la g\u00e9om\u00e9trie du D\u00c9BUT du geste, pas avec\r\n"
    "       f.x/f.y : ceux-ci peuvent \u00eatre p\u00e9rim\u00e9s par rapport au DOM (r\u00e9-ancrage,\r\n"
    "       borne au contenu), et un simple clic \u00ab bougeait \u00bb alors de 10 px. */\r\n"
    "    const o = origine || { l: f.x, t: f.y, w: f.w, h: f.h };\r\n"
    "    const aBouge = (Math.abs(nx - o.l) > 1 || Math.abs(ny - o.t) > 1 ||\r\n"
    "                    Math.abs(nw - o.w) > 1 || Math.abs(nh - o.h) > 1);\r\n"
    "    f.x = nx; f.y = ny; f.w = nw; f.h = nh;\r\n"
)

APRES = (
    "  function persistFig(f, fb, origine){\r\n"
    "    const nx = fb.offsetLeft, ny = fb.offsetTop, nw = fb.offsetWidth, nh = fb.offsetHeight;\r\n"
    "    /* v618/v621 \u2014 un CLIC (down+up sans mouvement) appelle aussi persistFig :\r\n"
    "       il ne doit PAS retirer l'ancre, sinon le cadre cesse de suivre son texte\r\n"
    "       apr\u00e8s un simple appui (le correctif v609 \u00e9tait annul\u00e9 sans qu'on le voie).\r\n"
    "       \U0001f534 La comparaison se fait avec la g\u00e9om\u00e9trie du D\u00c9BUT du geste, pas avec\r\n"
    "       f.x/f.y : ceux-ci peuvent \u00eatre p\u00e9rim\u00e9s par rapport au DOM (r\u00e9-ancrage,\r\n"
    "       borne au contenu), et un simple clic \u00ab bougeait \u00bb alors de 10 px. */\r\n"
    "    const o = origine || { l: f.x, t: f.y, w: f.w, h: f.h };\r\n"
    "    const aBouge = (Math.abs(nx - o.l) > 1 || Math.abs(ny - o.t) > 1 ||\r\n"
    "                    Math.abs(nw - o.w) > 1 || Math.abs(nh - o.h) > 1);\r\n"
    "    /* \u2550\u2550\u2550 v648 \u2014 UN GESTE MANUEL N'EST JAMAIS JET\u00c9 \u2550\u2550\u2550\r\n"
    "       Le garde v635 passait AVANT le calcul de `aBouge` : un cadre d\u00e9plac\u00e9 \u00e0 la\r\n"
    "       main pendant que le contenu s'ins\u00e8re encore (`__atcStable === false`)\r\n"
    "       faisait `return` SANS mettre \u00e0 jour `f.x/f.y` et SANS enregistrer. Or\r\n"
    "       `_ancPlace` recalcule juste apr\u00e8s depuis l'ancre et \u00e9crit par-dessus\r\n"
    "       (`if (!_dejaBon) { f.x = bx; f.y = by; figEl.style.left = ... }`) : le\r\n"
    "       cadre \u00e9tait RAPPEL\u00c9 sur son ancre \u2014 dans la session ET au d\u00e9marrage.\r\n"
    "       Mesure (banc v648) : glissement +44/+26 accept\u00e9, cadre rendu \u00e0 94/0\r\n"
    "       apr\u00e8s stabilisation, store x=94 y=0. `__atcGeste` (v647) ne prot\u00e8ge que\r\n"
    "       PENDANT le glissement : il est lev\u00e9 au `mouseup`, AVANT `persistFig`.\r\n"
    "       Ce qui est provisoire sur une mise en page mouvante, c'est la position\r\n"
    "       ABSOLUE. Ce que l'utilisateur vient de d\u00e9cider \u2014 l'\u00e9cart \u00e0 son ancre\r\n"
    "       (`ox/oy`) \u2014 est durable, et `_ancPlace` reconstruit l'absolu depuis\r\n"
    "       l'ancre (`bx = rr.x + ox` boucle \u00e0 l'identique). On enregistre donc\r\n"
    "       TOUJOURS un geste qui a vraiment bouge quelque chose ; le garde ne sert\r\n"
    "       plus que pour un CLIC qui n'a rien bouge, cas o\u00f9 il n'y a de toute\r\n"
    "       fa\u00e7on rien \u00e0 enregistrer. */\r\n"
    "    if (!aBouge && window.__atcStable === false && origine !== 'creation-manuelle') {\r\n"
    "      try { if (typeof markChatDirty === 'function') markChatDirty(); } catch (e) {}\r\n"
    "      return;\r\n"
    "    }\r\n"
    "    f.x = nx; f.y = ny; f.w = nw; f.h = nh;\r\n"
)

def once(s, avant, apres, etiquette):
    n = s.count(avant)
    if n != 1:
        print("[ECHEC] %s : %d occurrence(s) de l'ancre (attendu 1)." % (etiquette, n))
        sys.exit(1)
    print("[OK] %s" % etiquette)
    return s.replace(avant, apres, 1)

s = once(s, AVANT, APRES, "A. garde de persistFig deplace apres le calcul de aBouge")

# Le remplacement DOIT changer le fichier.
if s == io.open(CIBLE, "r", encoding="utf-8", newline="").read():
    print("[ECHEC] aucune difference produite.")
    sys.exit(1)

# Controle des fins de ligne AVANT ecriture.
crlf = s.count("\r\n")
lf_iso = len([1 for i, c in enumerate(s) if c == "\n" and (i == 0 or s[i - 1] != "\r")])
if lf_iso:
    print("[ECHEC] %d fin(s) de ligne LF isolee(s) dans le resultat." % lf_iso)
    sys.exit(1)

bak = CIBLE + ".v648.bak"
if not os.path.exists(bak):
    shutil.copy2(CIBLE, bak)
    print("[OK] sauvegarde : %s" % os.path.basename(bak))

with io.open(CIBLE, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("OK \u2014 v648 appliqu\u00e9. CRLF : %d, LF isol\u00e9s : %d" % (crlf, lf_iso))
