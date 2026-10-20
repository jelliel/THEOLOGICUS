# -*- coding: utf-8 -*-
"""Banc v621 : message multi-paragraphes (le cadre doit tenir DANS la zone
visible, `.message-content` rogne) + le surlignage passe par le menu de
couleurs (✏️ ouvre le nuancier, ce n'est pas un clic unique)."""
import io

p = ".workbuddy-ai/artifacts/_v621/verify_v621_cadre_traversant.js"
s = io.open(p, encoding="utf-8", newline="").read()

old = """    state.messages = [{
      role: 'assistant',
      content: 'La notion de Kyrios designe la seigneurie divine, mais avec une hierarchie d economie.',
      ts: ts, annotations: [], marks: []
    }];"""
assert s.count(old) == 1
new = """    state.messages = [{
      role: 'assistant',
      content: 'La notion de Kyrios designe la seigneurie divine.\\n\\n'
        + 'Mais avec une hierarchie d economie : le Pere est la source, le Fils est envoye.\\n\\n'
        + 'Citation cle : Cyrille d Alexandrie, De Adoratione in Spiritu 1.',
      ts: ts, annotations: [], marks: []
    }];"""
s = s.replace(old, new)

old2 = """    const rg0 = document.createRange();
    rg0.setStart(n0, 0); rg0.setEnd(n0, Math.min(40, n0.nodeValue.length));
    const rt = rg0.getBoundingClientRect();"""
assert s.count(old2) == 1
new2 = """    const rg0 = document.createRange();
    rg0.setStart(n0, 0); rg0.setEnd(n0, Math.min(40, n0.nodeValue.length));
    const rt = rg0.getBoundingClientRect();
    window.__v621rt = rt;"""
s = s.replace(old2, new2)

old3 = """    const hl = bulle ? bulle.querySelector('[data-act="hl"]') : null;
    if (hl) hl.click();
    await new Promise(r => setTimeout(r, 350));"""
assert s.count(old3) == 1
new3 = """    const hl = bulle ? bulle.querySelector('[data-act="hl"]') : null;
    if (hl) hl.click();
    await new Promise(r => setTimeout(r, 200));
    /* ✏️ ouvre le NUANCIER : c'est le choix d'une couleur qui crée le
       surlignage (un simple clic sur ✏️ n'en crée aucun). */
    const dot = document.querySelector('.cc-dot[data-color]');
    if (dot) dot.click();
    await new Promise(r => setTimeout(r, 350));"""
s = s.replace(old3, new3)

io.open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")
