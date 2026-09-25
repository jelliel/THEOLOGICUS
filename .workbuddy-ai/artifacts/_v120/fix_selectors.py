# -*- coding: utf-8 -*-
"""Ajoute le '#' manquant aux selecteurs du bloc STUDIO de THEOLOGICUS.html.

`$` est `document.querySelector` : `$("studio-modal")` cherche un element de
balise <studio-modal> et rend null. Le bloc studio utilise massivement cette
forme fautive, alors que les liaisons directes utilisent `$("#...")`.

On ne corrige QUE la region studio, et on ne touche pas aux appels qui portent
deja '#'.
"""
import re

P = 'THEOLOGICUS.html'
s = open(P, encoding='utf-8').read()

start = s.index('async function studioStatus()')
end = s.index('window.__studioOpen = studioOpen;')
blk = s[start:end]

before_bad = re.findall(r'\$\(\"([a-z0-9\-]+)\"\)', blk)

# Forme 1 : $("studio-xxx")  ->  $("#studio-xxx")
blk2 = re.sub(r'\$\(\"([a-z0-9\-]+)\"\)', r'$("#\1")', blk)

# Forme 2 : $('studio-xxx')  ->  $('#studio-xxx')
blk2 = re.sub(r"\$\(\'([a-z0-9\-]+)\'\)", r"$('#\1')", blk2)

after_good = re.findall(r'\$\(\"#[a-z0-9\-]+\"\)', blk2) + re.findall(r"\$\(\'#[a-z0-9\-]+\'\)", blk2)
still_bad = re.findall(r'\$\(\"[a-z0-9\-]+\"\)', blk2) + re.findall(r"\$\(\'[a-z0-9\-]+\'\)", blk2)

s2 = s[:start] + blk2 + s[end:]
open(P, 'w', encoding='utf-8', newline='').write(s2)

print('selecteurs sans # avant :', len(before_bad))
print('selecteurs avec # apres :', len(after_good))
print('selecteurs encore sans # :', len(still_bad), still_bad[:10])
print()
print('identifiants corriges :', sorted(set(before_bad)))
