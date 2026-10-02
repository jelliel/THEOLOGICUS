# -*- coding: utf-8 -*-
"""v212 — Chronologie complete de la vie de Jesus (Synoptique.xls).

Source : https://www.maria-valtorta.org/Calendrier/Synoptique.xls
Classeur BIFF8 (.xls) -> necessite xlrd (installe dans un dossier local, cf.
`py -3.12 -m pip install --target C:/tmp/pyxls xlrd`). openpyxl ne lit PAS le
.xls ancien format.

Structure : feuille « Calendrier synoptique », une ligne par annee.
  col 0 = annee (valeur POSITIVE, le signe se deduit de la POSITION)
  col 1-3 = « Chronologie de la vie de Jesus »
  col 4-7 = « Chronologie des evenements historiques »
Repere : la feuille a 134 lignes = an -53 a +80. Les lignes 1..53 sont AVANT
notre ere, les suivantes apres. Verifie : la ligne « Mort de Jesus » donne
l'an 30, coherent avec la derniere Cene du 4 avril 30 des recits.
"""
import json, os, sys

sys.path.insert(0, r"C:\tmp\pyxls")
import xlrd  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEC = os.path.join(ROOT, "tradition", "valtorta_sec.json")
XLS = r"C:\tmp\synoptique.xls"


def main():
    b = xlrd.open_workbook(XLS)
    s = b.sheet_by_name("Calendrier synoptique")
    chrono = []
    for r in range(1, s.nrows):
        try:
            an = int(float(str(s.cell_value(r, 0)).strip()))
        except Exception:
            continue
        annee = -an if r <= 53 else an          # 53 premieres lignes = avant notre ere
        j = " ".join(str(s.cell_value(r, c)).strip() for c in (1, 2, 3)
                     if str(s.cell_value(r, c)).strip())
        h = " ".join(str(s.cell_value(r, c)).strip() for c in (4, 5, 6, 7)
                     if str(s.cell_value(r, c)).strip())
        j, h = " ".join(j.split()), " ".join(h.split())
        if j or h:
            chrono.append({"a": annee, "j": j, "h": h})

    d = json.load(open(SEC, encoding="utf-8"))
    for sec in d["sections"]:
        if sec["id"] == "calendrier":
            sec["chrono"] = chrono
            sec["note"] = ("Chronologie reconstituee d'apres l'oeuvre et les travaux "
                           "de Jean Aulagnier — an -53 a +80 (%d annees renseignees)."
                           % len(chrono))
    json.dump(d, open(SEC, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("chronologie : %d annees (%d a %d)" % (len(chrono), chrono[0]["a"], chrono[-1]["a"]))
    for x in chrono:
        if x["a"] in (-5, -4, 1, 26, 30, 33):
            print("  %4d | %s | %s" % (x["a"], x["j"][:56], x["h"][:40]))


if __name__ == "__main__":
    main()
