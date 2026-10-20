# -*- coding: utf-8 -*-
"""v621b — les BORDS saisissables passent À L'INTÉRIEUR du cadre.

Mesuré : `.message-content` a `overflow:hidden auto`. Des bords posés à -4 px
sortent de la zone visible et ne sont PLUS hit-testés : le cadre devenait
impossible à déplacer. Les bords sont donc DANS la boîte (8 px), la poignée
aussi.
"""
import sys

P = "THEOLOGICUS.html"
with open(P, encoding="utf-8", newline="") as f:
    s = f.read().replace("\r\n", "\n")

ancien = """.atc-figbox .fb-edge[data-bord="t"]{left:0;right:0;top:-4px;height:9px}
.atc-figbox .fb-edge[data-bord="b"]{left:0;right:0;bottom:-4px;height:9px}
.atc-figbox .fb-edge[data-bord="l"]{top:0;bottom:0;left:-4px;width:9px}
.atc-figbox .fb-edge[data-bord="r"]{top:0;bottom:0;right:-4px;width:9px}
.atc-figbox .fb-grip{
  position:absolute; left:50%; top:-10px; transform:translateX(-50%);
  width:26px; height:9px; border-radius:5px; pointer-events:auto; cursor:move;
  background:rgba(13,22,38,.9); border:1px solid var(--fc); z-index:12;
  opacity:0; transition:opacity .12s;
}"""
if s.count(ancien) != 1:
    raise SystemExit("ancre bords : %d" % s.count(ancien))

nouveau = """/* 🔴 Les bords restent DANS la boîte : `.message-content` a `overflow:hidden`,
   un bord posé à -4 px est rogné et n'est plus hit-testé (cadre impossible à
   déplacer — mesuré au banc). 8 px suffisent pour saisir à la souris. */
.atc-figbox .fb-edge[data-bord="t"]{left:0;right:0;top:0;height:8px}
.atc-figbox .fb-edge[data-bord="b"]{left:0;right:0;bottom:0;height:8px}
.atc-figbox .fb-edge[data-bord="l"]{top:0;bottom:0;left:0;width:8px}
.atc-figbox .fb-edge[data-bord="r"]{top:0;bottom:0;right:0;width:8px}
.atc-figbox .fb-grip{
  position:absolute; left:50%; top:1px; transform:translateX(-50%);
  width:26px; height:7px; border-radius:4px; pointer-events:auto; cursor:move;
  background:rgba(13,22,38,.9); border:1px solid var(--fc); z-index:12;
  opacity:0; transition:opacity .12s;
}"""
s = s.replace(ancien, nouveau)

with open(P, "w", encoding="utf-8", newline="") as f:
    f.write(s.replace("\n", "\r\n"))
print("OK — v621b appliqué")
