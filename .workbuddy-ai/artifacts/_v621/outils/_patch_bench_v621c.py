# -*- coding: utf-8 -*-
"""Banc v621 : déplacer par le bord GAUCHE (le bord haut peut être rogné par
`overflow:hidden` quand le cadre touche le haut du message) et offsets réels
pour l'annotation du test 6."""
import io

p = ".workbuddy-ai/artifacts/_v621/verify_v621_cadre_traversant.js"
s = io.open(p, encoding="utf-8", newline="").read()

old = """    const e = fb.querySelector('.fb-edge[data-bord="t"]');"""
assert s.count(old) == 1
s = s.replace(old, """    /* bord GAUCHE : toujours à l'intérieur du message, donc hit-testable
       (le bord haut peut être rogné par .message-content{overflow:hidden}). */
    const e = fb.querySelector('.fb-edge[data-bord="l"]');""")

old2 = """    state.messages[0].annotations = [{ id: 'hl-x', text: 'seigneurie divine',
      a: 'Commentaire dans le cadre.', start: 0, end: 17 }];"""
assert s.count(old2) == 1
new2 = """    const CONT = state.messages[0].content;
    const MOT = 'seigneurie divine';
    const st = CONT.indexOf(MOT);
    state.messages[0].annotations = [{ id: 'hl-x', text: MOT,
      a: 'Commentaire dans le cadre.', start: st, end: st + MOT.length }];"""
s = s.replace(old2, new2)

io.open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")
