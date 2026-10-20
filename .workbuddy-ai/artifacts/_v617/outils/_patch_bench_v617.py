# -*- coding: utf-8 -*-
"""Banc v617 : comparer l'empilement du panneau à celui de la modale de clé
(la porte d'accès, elle, DOIT rester au-dessus : c'est un contrôle d'accès)."""
import io

p = ".workbuddy-ai/artifacts/_v617/verify_v617_reseau.js"
s = io.open(p, encoding="utf-8", newline="").read()

old = """    const auCentre = (function () {
      const e = document.elementFromPoint(Math.round(window.innerWidth / 2), 120);
      return e && e.closest ? !!e.closest("#theo-diag-reseau") : false;
    })();"""
assert s.count(old) == 1, s.count(old)
new = """    /* Même étage que les autres modales (--z-overlay) : au-dessus du contenu,
       en dessous de la porte d'accès qui est un contrôle d'accès. */
    const zPanneau = cs ? parseInt(cs.zIndex || "0", 10) : -1;
    const apiModal = document.getElementById("api-modal");
    const zApi = apiModal ? parseInt(getComputedStyle(apiModal).zIndex || "0", 10) : -1;
    const auCentre = (zPanneau >= zApi && zPanneau > 0);"""
s = s.replace(old, new)

s = s.replace(
    """  ok("le panneau est au premier plan (élément au centre)", r11.auCentre === true, String(r11.auCentre));""",
    """  ok("le panneau est au même étage que la modale de clé", r11.auCentre === true, String(r11.auCentre));""")

io.open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")
