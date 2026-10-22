# -*- coding: utf-8 -*-
"""Expose les fonctions d'ancrage sur le hook de debug __DBG_FIG.

But : pouvoir MESURER (_ancRect, _ancResolve, noeudsTexteVisibles) depuis un
banc, sans toucher au chemin produit. Le hook existait deja pour insertFigureAt.

Regles respectees :
  - les ancres sont uniques (assertion once) ;
  - ecriture en LF, restauration CRLF LITTERALE ;
  - sauvegarde .bak avant modification.
"""
import io
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
CIBLE = os.path.join(ROOT, "THEOLOGICUS.html")

OLD = ("  window.__DBG_FIG = { buildFigEl: buildFigEl, figSvgInner: figSvgInner, "
       "insertFigureAt: insertFigureAt };  function insertFigureAt(target, item){")

NEW = ("  window.__DBG_FIG = { buildFigEl: buildFigEl, figSvgInner: figSvgInner, "
       "insertFigureAt: insertFigureAt };\n"
       "  /* v633 — sondes de MESURE (aucun appel depuis le produit) : permettent\n"
       "     au banc de comparer ce que le re-ancrage calcule a ce qui est rendu. */\n"
       "  window.__ANC = {\n"
       "    rect: function(b, s, e){ return _ancRect(b, s, e); },\n"
       "    resolve: function(b, f){ return _ancResolve(b, f); },\n"
       "    occurrences: function(b, t){ return _ancOccurrences(b, t); },\n"
       "    place: function(b, f, el){ return _ancPlace(b, f, el); },\n"
       "    noeuds: function(b){ return noeudsTexteVisibles(b); },\n"
       "    norm: function(s){ return _ancNorm(s); },\n"
       "    shapes: function(){ try { return applyShapes(); } catch (e) { return String(e); } },\n"
       "  };\n"
       "  function insertFigureAt(target, item){")


def main():
    with io.open(CIBLE, "r", encoding="utf-8", newline="") as f:
        brut = f.read()
    assert brut.count("\r\n") == brut.count("\n"), "fichier non CRLF uniforme"
    s = brut.replace("\r\n", "\n")
    n = s.count(OLD)
    if n != 1:
        print("ANCRE : %d occurrence(s) — attendu 1" % n)
        sys.exit(1)
    bak = os.path.join(ROOT, ".workbuddy-ai", "artifacts", "_v633", "THOLOGICUS_pre_v633.bak")
    os.makedirs(os.path.dirname(bak), exist_ok=True)
    shutil.copy2(CIBLE, bak)
    s = s.replace(OLD, NEW, 1)
    out = s.replace("\n", "\r\n")
    with io.open(CIBLE, "w", encoding="utf-8", newline="") as f:
        f.write(out)
    # controles
    with io.open(CIBLE, "r", encoding="utf-8", newline="") as f:
        chk = f.read()
    assert chk.count("\r\n") == chk.count("\n"), "CRLF casse"
    assert chk.count("window.__ANC") == 1
    print("OK — __ANC expose ; CRLF %d/%d" % (chk.count("\r\n"), chk.count("\n")))


if __name__ == "__main__":
    main()
