# -*- coding: utf-8 -*-
"""v632g — CAPTURE des annotations dans l'espace CANONIQUE.

`onAddToChat` memorise `start/end` via `computeOffsetInBox`, qui mesure
`Range.toString()` sur TOUT le contenu : y compris les blocs injectes (fiches
Wikipedia) et — pire — il insere des `\\n` entre blocs qui n'existent pas dans
le DOM. Or depuis v632e la RESTITUTION (`wrapByOffsetCanon`) resolve dans
l'espace canonique. Capture et restitution divergent donc d'un decalage qui
grandit a chaque fiche ajoutee : c'est precisement le surlignage qui « saute »
sur un autre mot au redemarrage.

Correctif : la capture delimiter le Range par OFFSETS canoniques
(`computeOffsetInBoxFiltre`, symetrique exact de la restitution), avec l'ancien
calcul en repli si la mesure canonique echoue. Le texte de l'annotation est pris
dans le contenu canonique (sans les `\\n` fantomes de `range.toString()`)."""
import io
P = r"C:\tmp\theoverify\THEOLOGICUS.html"
s = io.open(P, "r", encoding="utf-8", newline="").read()
assert s.count("\r\n") == s.count("\n")
s = s.replace("\r\n", "\n")

def once(old, new, label):
    global s
    n = s.count(old)
    assert n == 1, "ANCRE NON UNIQUE (%d) : %s" % (n, label)
    s = s.replace(old, new, 1)

# ── 1) computeOffsetInBox : canonique d'abord, repli sur l'ancien calcul ──
OLD = """   function computeOffsetInBox(box, range){
     const total = (function(){ const r = document.createRange(); r.selectNodeContents(box); return r.toString().length; })();"""
NEW = """   function computeOffsetInBox(box, range){
     /* v632g — la mesure canonique est SYMETRIQUE de la restitution
        (wrapByOffsetCanon). On la prefere toujours ; l'ancien calcul reste en
        repli si elle echoue (Range hors des noeuds visibles). */
     try {
       if (typeof computeOffsetInBoxFiltre === 'function') {
         const f = computeOffsetInBoxFiltre(box, range);
         if (f && f.end > f.start) return f;
       }
     } catch (e) {}
     const total = (function(){ const r = document.createRange(); r.selectNodeContents(box); return r.toString().length; })();"""
once(OLD, NEW, "computeOffsetInBox canonique")

# ── 2) onAddToChat : le TEXTE de l'annotation aussi dans le canonique ──
OLD2 = """    let _annOff = null;
    const _annBox = document.getElementById('mc-' + s.msgTs);
    if (_annBox && s.range) { try { _annOff = computeOffsetInBox(_annBox, s.range); } catch(e) {} }"""
NEW2 = """    let _annOff = null;
    const _annBox = document.getElementById('mc-' + s.msgTs);
    if (_annBox && s.range) { try { _annOff = computeOffsetInBox(_annBox, s.range); } catch(e) {} }"""
once(OLD2, NEW2, "onAddToChat offset (inchange, delegue)")

assert "\r" not in s
s = s.replace("\n", "\r\n")
io.open(P, "w", encoding="utf-8", newline="").write(s)
print("OK v632g capture canonique des annotations")
