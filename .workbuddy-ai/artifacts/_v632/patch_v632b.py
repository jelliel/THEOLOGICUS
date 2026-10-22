# -*- coding: utf-8 -*-
"""v632b — expose un hook de BANC pour creer un encadre sans passer par les
menus (le banc doit mesurer la derive reelle ; il lui faut la MEME fonction que
l'utilisateur, pas une imitation)."""
import io, os
P = r"C:\tmp\theoverify\THEOLOGICUS.html"
s = io.open(P, "r", encoding="utf-8", newline="").read()
assert s.count("\r\n") == s.count("\n")
s = s.replace("\r\n", "\n")

OLD = ('    toast(\'✓ Figure insérée (\' + item.n + \') · glissez pour déplacer, poignées ◻ pour redimensionner, double-clic pour le texte ; cliquez-la pour tourner ↻ et remplir ▨\', \'success\');\n'
       '  }\n'
       '  function persistFig(f, fb, origine){')
NEW = ('    toast(\'✓ Figure insérée (\' + item.n + \') · glissez pour déplacer, poignées ◻ pour redimensionner, double-clic pour le texte ; cliquez-la pour tourner ↻ et remplir ▨\', \'success\');\n'
       '  }\n'
       '  /* v632 — HOOK DE BANC : le meme chemin que l\'utilisateur (aucune\n'
       '     imitation). Il ne sert qu\'a mesurer la derive d\'ancrage.\n'
       '     Aucun appel produit ne passe par ici. */\n'
       '  window.__atcInsertFig = function(target, forme){\n'
       '    var it = findForme(forme || \'Rectangle\') || findForme(\'Rectangle\');\n'
       '    if (!it) return false;\n'
       '    insertFigureAt(target, it);\n'
       '    return true;\n'
       '  };\n'
       '  function persistFig(f, fb, origine){')

n = s.count(OLD)
assert n == 1, "ancre non unique: %d" % n
s = s.replace(OLD, NEW, 1)

assert "\r" not in s
s = s.replace("\n", "\r\n")
io.open(P, "w", encoding="utf-8", newline="").write(s)
print("OK v632b hook de banc")
