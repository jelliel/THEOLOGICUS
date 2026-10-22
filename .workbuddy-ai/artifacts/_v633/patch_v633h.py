# -*- coding: utf-8 -*-
"""v633h — UN CADRE REPARE EST CENTRE SUR SON TEXTE, PAS DECALE D'UN PIXEL INCONNU.

Mesure sur DONNEE REELLE (chat « Kyrios », 28 figures, 0 ancre) : malgre
v633f/v633g, 19/27 cadres seulement couvrent leur ancre ; les 8 autres ont des
`ox` aberrants (49, 199, 223, 511, 701) et un cadre a 333 px de son texte.

Cause : `ox = f.x - _r0.x` MELANGE DEUX ESPACES. `f.x` est une position pixel
heritee d'une session precedente (le store contient `x = -5, y = 5671`), alors
que `_r0.x` est relatif au conteneur dans la mise en page ACTUELLE. Leur
difference n'a aucun sens : elle n'est ni un decalage voulu par l'utilisateur,
ni une erreur mesurable.

Principe corrige (et c'est la semantique attendue) : pour un cadre REPARE, on
ne peut pas connaitre le decalage voulu — il n'a jamais ete enregistre. On
GARDE LA TAILLE (choisie par l'utilisateur, donc fiable) et on CENTRE le cadre
sur le texte de son ancre. C'est la position qui « respecte le mot », ce que
demande l'utilisateur ; un decalage fin reste possible ensuite par glissement
(`dx`/`dy`, qui eux sont enregistres explicitement).
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

bak = os.path.join(ICI, "THEOLOGICUS_pre_v633h.bak")
io.open(bak, "w", encoding="utf-8", newline="").write(src)

def once(old, new, quoi):
    global s
    n = s.count(old)
    if n != 1:
        sys.exit("REFUS [%s] : %d occurrences (attendu 1)" % (quoi, n))
    s = s.replace(old, new)
    print("  OK  " + quoi)

# ── _ancFit : ne plus inventer de decalage ; marquer la figure comme REPAREE ──
once(
"""      const _r0 = _ancRect(box, st2, st2 + txt2.length);
      f.ancre = { start: st2, end: st2 + txt2.length, texte: txt2.slice(0, 200) };
      if (_r0) {
        f.ancre.ow = (typeof f.w === 'number' && f.w > 0) ? f.w : (_r0.w + 16);
        f.ancre.oh = (typeof f.h === 'number' && f.h > 0) ? f.h : (_r0.h + 16);
        f.ancre.ox = (typeof f.x === 'number') ? Math.round(f.x - _r0.x) : -8;
        f.ancre.oy = (typeof f.y === 'number') ? Math.round(f.y - _r0.y) : -6;
      }""",
"""      const _r0 = _ancRect(box, st2, st2 + txt2.length);
      f.ancre = { start: st2, end: st2 + txt2.length, texte: txt2.slice(0, 200) };
      if (_r0) {
        f.ancre.ow = (typeof f.w === 'number' && f.w > 0) ? f.w : (_r0.w + 16);
        f.ancre.oh = (typeof f.h === 'number' && f.h > 0) ? f.h : (_r0.h + 16);
        /* ═══ v633h — PAS DE DECALAGE INVENTE ═══
           `ox = f.x - _r0.x` melangeait une position pixel HERITEE (le store
           contient x = -5, y = 5671) et un rect relatif au conteneur dans la
           mise en page ACTUELLE : la difference ne veut rien dire (mesure :
           ox = 701, cadre a 333 px de son texte). On marque la figure comme
           REPAREE et on la CENTRE sur son texte, en gardant sa taille. */
        f.ancre.repare = 1;
        f.ancre.cx = 1;
      }""",
"v633h : _ancFit ne fabrique plus de decalage (marque repare/centre)")

# ── _ancPlace : centrer un cadre repare ─────────────────────────────────────
once(
"""      var nx, ny, nw, nh;
      if (typeof f.ancre.ow === 'number' && typeof f.ancre.oh === 'number') {""",
"""      var nx, ny, nw, nh;
      if (f.ancre.cx && typeof f.ancre.ow === 'number' && typeof f.ancre.oh === 'number') {
        /* v633h — cadre REPARE : centre sur le texte de son ancre, taille gardee. */
        nw = Math.max(f.ancre.ow, 46); nh = Math.max(f.ancre.oh, 34);
        nx = rr.x + (rr.w - nw) / 2 + _dx;
        ny = rr.y + (rr.h - nh) / 2 + _dy;
      } else if (typeof f.ancre.ow === 'number' && typeof f.ancre.oh === 'number') {""",
"v633h : _ancPlace centre un cadre repare")

out = s.replace("\n", "\r\n")
crlf = out.count("\r\n")
lf = out.count("\n") - crlf
if lf != 0:
    sys.exit("REFUS : LF isoles apres normalisation : %d" % lf)
io.open(CIBLE, "w", encoding="utf-8", newline="").write(out)
print("OK — v633h applique. CRLF %d/%d, taille %d" % (crlf, crlf, len(out)))
