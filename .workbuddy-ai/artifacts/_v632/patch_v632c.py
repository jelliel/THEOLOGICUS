# -*- coding: utf-8 -*-
"""v632c — accesseur d'ETAT pour le banc.

`state` est un `let` de portee script : il n'est PAS sur `window` (regle dure
deja notee en memoire). Le banc v632 mesure les ancres, il a besoin de LIRE les
donnees (source de verite) sans imiter le rendu. On expose donc un accesseur
en lecture, dans le module d'annotation (qui a `state` en portee)."""
import io
P = r"C:\tmp\theoverify\THEOLOGICUS.html"
s = io.open(P, "r", encoding="utf-8", newline="").read()
assert s.count("\r\n") == s.count("\n")
s = s.replace("\r\n", "\n")

OLD = ("  window.__atcInsertFig = function(target, forme){\n")
NEW = ("  /* v632c — LECTURE SEULE de l'etat (les donnees sont la source de verite ;\n"
       "     le DOM est lazy-rendu, donc incomplet hors viewport). */\n"
       "  window.__atcState = function(){ try { return state; } catch (e) { return null; } };\n"
       "  window.__atcInsertFig = function(target, forme){\n")
assert s.count(OLD) == 1
s = s.replace(OLD, NEW, 1)

assert "\r" not in s
s = s.replace("\n", "\r\n")
io.open(P, "w", encoding="utf-8", newline="").write(s)
print("OK v632c accesseur d'etat")
