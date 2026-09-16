# -*- coding: utf-8 -*-
"""v56 — remplacement pur des partiels natifs (anti-doublons definitif).

La video montre le transcript 'donne-moidonne-moidonne-moidonne-moi' :
le moteur Android envoie des INSTANTANES cumulatifs avec micro-variations
('donne moi' -> 'donne-moi') ; l'ancienne fusion echouait sur la variation
et concatenait chaque revision. Correctif : afficher le dernier instantane,
jamais fusionner. Le garde 'final aberrant' passe a 0.4 en longueur sans
espaces (compare des instantanes equivalents).

Usage : py tools/fix_v56_partials.py
"""
import io
import re

PATH = "THEOLOGICUS.html"
src = io.open(PATH, encoding="utf-8", newline="").read()

# 1) supprimer la fonction mergePartial (bloc entre sa signature et son accolade fermante)
pat_merge = re.compile(
    r"      function mergePartial\(prev, next\) \{.*?\n      \}\r?\n",
    re.DOTALL)
m = pat_merge.search(src)
assert m, "mergePartial introuvable"
src = src[:m.start()] + (
    "      /* v56 — PAS de fusion : les partiels natifs sont des INSTANTANES\r\n"
    "         cumulatifs (la meilleure transcription complete du moment).\r\n"
    "         Toute heuristique de fusion echoue sur les micro-variations\r\n"
    "         ('donne moi' -> 'donne-moi') et recree les doublons — c'etait\r\n"
    "         exactement le bug 'donne-moidonne-moidonne-moi'. On AFFICHE\r\n"
    "         le dernier instantane, point. */\r\n"
) + src[m.end():]

# 2) usage du partiel : remplacement pur
old_use = (
    "          if (!ev.final) {\r\n"
    "            var merged = mergePartial(self._shown, txt);\r\n"
    "            self._shown = merged;\r\n"
    "            render(merged, false);\r\n"
)
new_use = (
    "          if (!ev.final) {\r\n"
    "            self._shown = txt;                      /* remplacement pur */\r\n"
    "            render(txt, false);\r\n"
)
assert old_use in src, "bloc partiel introuvable"
src = src.replace(old_use, new_use, 1)
src = src.replace(
    "                results: { length: 1, 0: { isFinal: false, 0: { transcript: merged }, length: 1 } } });",
    "                results: { length: 1, 0: { isFinal: false, 0: { transcript: txt }, length: 1 } } });", 1)

# 3) garde 'final aberrant' : 0.6 -> 0.4 (longueur sans espaces)
old_guard = "if (txt.length < self._shown.replace(/\\s+/g,'').length * 0.6) {"
new_guard = "if (txt.replace(/\\s+/g,'').length < self._shown.replace(/\\s+/g,'').length * 0.4) {"
assert old_guard in src, "garde introuvable"
src = src.replace(old_guard, new_guard, 1)

io.open(PATH, "w", encoding="utf-8", newline="").write(src)
print("v56 applique : partiels = remplacement pur, garde final 0.4")
