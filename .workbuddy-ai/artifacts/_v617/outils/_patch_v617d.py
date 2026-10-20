# -*- coding: utf-8 -*-
"""v617d — le panneau doit être VISIBLE : `.modal-overlay` est en display:none,
il faut la classe `active` (défaut attrapé par la capture, pas par le banc)."""
import sys

P = "THEOLOGICUS.html"
with open(P, encoding="utf-8", newline="") as f:
    s = f.read().replace("\r\n", "\n")

a = "      ov.className = 'modal-overlay';\n      ov.style.zIndex = '9999';"
if s.count(a) != 1:
    raise SystemExit("ancre classe : %d" % s.count(a))
s = s.replace(a,
    "      /* 🔴 `.modal-overlay` est en display:none : sans `active` le panneau\n"
    "         existe dans le DOM mais reste INVISIBLE (attrapé à la capture).\n"
    "         On garde le z-index du design system (--z-overlay), comme toutes\n"
    "         les autres modales : la porte d'accès doit rester au-dessus. */\n"
    "      ov.className = 'modal-overlay active';")

with open(P, "w", encoding="utf-8", newline="") as f:
    f.write(s.replace("\n", "\r\n"))
print("OK")
