# -*- coding: utf-8 -*-
"""Contrôle : CRLF intègre + node --check sur TOUS les blocs <script>."""
import os
import re
import subprocess
import sys
import tempfile

P = "THEOLOGICUS.html"
NODE = r"C:\Users\toshr\.workbuddy-ai\binaries\node\versions\22.22.2-6\node.exe"

with open(P, encoding="utf-8", newline="") as f:
    s = f.read()

crlf = s.count("\r\n")
lf = s.count("\n") - crlf
print("CRLF=%d  LF isolés=%d  taille=%d" % (crlf, lf, len(s)))
if lf != 0:
    print("ECHEC : LF isolés présents")
    sys.exit(1)

blocs = re.findall(r"<script\b[^>]*>(.*?)</script>", s, re.S)
print("blocs <script> : %d" % len(blocs))
mauvais = 0
tmp = tempfile.mkdtemp()
for i, b in enumerate(blocs):
    if "src=" in b[:0]:
        continue
    f = os.path.join(tmp, "b%03d.js" % i)
    with open(f, "w", encoding="utf-8", newline="") as g:
        g.write(b)
    r = subprocess.run([NODE, "--check", f], capture_output=True, text=True)
    if r.returncode != 0:
        mauvais += 1
        print("SYNTAXE KO bloc %d : %s" % (i, (r.stderr or "").strip().splitlines()[:4]))
print("blocs en erreur : %d" % mauvais)
sys.exit(1 if mauvais else 0)
