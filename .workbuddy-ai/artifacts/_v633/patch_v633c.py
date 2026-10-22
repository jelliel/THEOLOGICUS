# -*- coding: utf-8 -*-
"""v633c — UNE BOITE LIBEREE PAR L'UTILISATEUR NE DOIT PAS ETRE RE-ANCRÉE.

Regression trouvee par le banc v632 `verify_ancrage_encadres` 5a :
    [ECHEC] 5a. redimensionnement -> ancre retiree -- {"w":455,"ancre":true}
Apres un redimensionnement, `persistFig` fait bien `delete f.ancre`, MAIS
`_ancPlace` passe juste apres : elle voit `!f.ancre`, appelle `_ancFit`, et
RECREE l'ancre -> le redimensionnement perd son effet (le cadre redevient lie
au texte et reprend la geometrie du texte au rendu suivant).

Distinction necessaire (et c'est tout l'enjeu) :
  · figure ANCIENNE (creee avant v633, jamais ancree) -> il FAUT reparer ;
  · figure DELIBEREMENT liberee par un redimensionnement -> il NE FAUT PAS.

On pose donc un drapeau durable `f.libre = 1` au moment ou l'utilisateur
liberere la boite, et `_ancFit` refuse de reparer une figure libre.
"""
import io, os, sys

ICI = os.path.dirname(os.path.abspath(__file__))
ROOT = ICI
for _ in range(3):
    ROOT = os.path.dirname(ROOT)
CIBLE = os.path.join(ROOT, "THEOLOGICUS.html")

src = io.open(CIBLE, "r", encoding="utf-8", newline="").read()
crlf_avant = src.count("\r\n")
lf_isoles_avant = src.count("\n") - crlf_avant
s = src.replace("\r\n", "\n")
print("avant : CRLF %d / LF isoles %d / %d octets" % (crlf_avant, lf_isoles_avant, len(src)))
if lf_isoles_avant != 0:
    sys.exit("REFUS : LF isoles presents")

bak = os.path.join(ICI, "THEOLOGICUS_pre_v633c.bak")
io.open(bak, "w", encoding="utf-8", newline="").write(src)

def once(old, new, quoi):
    global s
    n = s.count(old)
    if n != 1:
        sys.exit("REFUS [%s] : %d occurrences (attendu 1)" % (quoi, n))
    s = s.replace(old, new)
    print("  OK  " + quoi)

# ── 1. persistFig : marquer la boite comme LIBEREE au redimensionnement ─────
once(
"""        const dResize = (Math.abs(nw - o.w) > 1 || Math.abs(nh - o.h) > 1);
        if (dResize) delete f.ancre;""",
"""        const dResize = (Math.abs(nw - o.w) > 1 || Math.abs(nh - o.h) > 1);
        /* v633c — un redimensionnement LIBERE la boite : on le memorise pour
           que la reparation v633 ne la re-ancre pas au rendu suivant. */
        if (dResize) { delete f.ancre; f.libre = 1; }""",
"v633c : marquer f.libre au redimensionnement")

# ── 2. _ancFit : ne jamais reparer une figure LIBEREE ───────────────────────
once(
"""  function _ancFit(box, f, figEl){
    if (!box || !f || !figEl) return false;
    try {""",
"""  function _ancFit(box, f, figEl){
    if (!box || !f || !figEl) return false;
    /* v633c — boite volontairement liberee (redimensionnement) : on ne la
       re-ancre pas, sinon le geste de l'utilisateur est annule au rendu suivant. */
    if (f.libre) return false;
    try {""",
"v633c : _ancFit respecte f.libre")

# ── 3. insertFigureAt / clone : une figure neuve est ancreable ──────────────
# (rien a faire : f.libre est absent par defaut)

out = s.replace("\n", "\r\n")
crlf = out.count("\r\n")
lf = out.count("\n") - crlf
if lf != 0:
    sys.exit("REFUS : LF isoles apres normalisation : %d" % lf)
io.open(CIBLE, "w", encoding="utf-8", newline="").write(out)
print("OK — v633c applique. CRLF %d/%d, taille %d" % (crlf, crlf, len(out)))
