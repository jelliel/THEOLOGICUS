# -*- coding: utf-8 -*-
"""v617b — deux corrections après relecture :
  1. ne journaliser que les ÉCHECS (sinon 12 succès chassent la panne du journal) ;
  2. `reseauInstable` doit sortir par le message détaillé des formateurs.
"""
import sys

P = "THEOLOGICUS.html"
with open(P, encoding="utf-8", newline="") as f:
    s = f.read().replace("\r\n", "\n")

def une_fois(ancre):
    n = s.count(ancre)
    if n != 1:
        raise SystemExit("ANCRE %r : %d occurrence(s)" % (ancre[:60], n))
    return s.index(ancre)

# 1 — journal : seulement les réponses en échec
a = "        journaliser({ type: 'direct', url: url, statut: res.status, rejoue: false });\n        return res;"
if s.count(a) != 1:
    raise SystemExit("ancre journal : %d" % s.count(a))
s = s.replace(a,
    "        /* un 2xx n'apprend rien au diagnostic : on ne garde que les échecs,\n"
    "           sinon douze succès chassent la panne du journal borné. */\n"
    "        if (res.status >= 400) journaliser({ type: 'direct', url: url, statut: res.status, rejoue: false });\n"
    "        return res;")

# 2 — formateurs : reseauInstable sort par son message détaillé
ancre_f = "  if (e && (e.cleRefusee || e.accesRefuse || e.parametresRefuses || e.modeleIndisponible || e.creditEpuise)) return e.message; // v603/v610/v611b/v613/v614"
if s.count(ancre_f) != 2:
    raise SystemExit("ancre formateur : %d" % s.count(ancre_f))
s = s.replace(ancre_f, ancre_f.replace("|| e.creditEpuise)", "|| e.creditEpuise || e.reseauInstable)"))

with open(P, "w", encoding="utf-8", newline="") as f:
    f.write(s.replace("\n", "\r\n"))
print("OK")
