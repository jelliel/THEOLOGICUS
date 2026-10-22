# -*- coding: utf-8 -*-
"""v633f — UNE FIGURE REPAREE GARDE SA TAILLE ET SON DECALAGE D'ORIGINE.

Mesure sur DONNEE REELLE (verify_donnees_reelles.js) : apres v633e, 27/28
figures du chat « Kyrios » recoivent bien une ancre, mais **1 seule sur 27
couvre son texte**. Cause mesuree : `_ancPlace` RECALCULE la geometrie a partir
du rect d'une ligne —

    nw = rr.w + 16 ; nh = Math.max(rr.h + 16, 44)

or le store contient majoritairement des cadres MULTI-LIGNES (mesure : hauteur
mediane 90 px, p75 118, max 321 ; largeur mediane 675, max 1822). Un cadre de
321 px de haut est ramene a 44 px : il ne couvre plus qu'une ligne, donc
« l'encadrement change de place » — exactement le symptome rapporte.

Principe corrige :
  · `_ancFit` memorise, dans l'ancre, la geometrie d'ORIGINE de la figure
    (`ow`, `oh`) et son decalage par rapport au TEXTE de tete
    (`ox = f.x - rr.x`, `oy = f.y - rr.y`) ;
  · `_ancPlace` RESTITUE cette geometrie : `x = rr.x + ox`, `y = rr.y + oy`,
    `w = ow`, `h = oh`. La taille choisie par l'utilisateur est donc preservee,
    et seule la POSITION suit le texte.

Les cadres crees par v609+ (qui ont deja une ancre sans `ow`) gardent le
comportement actuel : aucune regression sur les bancs v632.
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

bak = os.path.join(ICI, "THEOLOGICUS_pre_v633f.bak")
io.open(bak, "w", encoding="utf-8", newline="").write(src)

def once(old, new, quoi):
    global s
    n = s.count(old)
    if n != 1:
        sys.exit("REFUS [%s] : %d occurrences (attendu 1)" % (quoi, n))
    s = s.replace(old, new)
    print("  OK  " + quoi)

# ── 1. _ancFit : memoriser taille d'origine + decalage au texte de tete ─────
once(
"""      f.ancre = { start: st2, end: st2 + txt2.length, texte: txt2.slice(0, 200) };
      if (typeof markChatDirty === 'function') markChatDirty();
      return true;""",
"""      /* ═══ v633f — MEMORISER LA GEOMETRIE D'ORIGINE ═══
         Le store contient surtout des cadres MULTI-LIGNES (h mediane 90 px,
         max 321). Recalculer la boite a partir d'une seule ligne la ramenait a
         44 px : le cadre ne couvrait plus son texte. On garde donc la taille
         voulue par l'utilisateur (`ow`/`oh`) et son decalage au texte de tete
         (`ox`/`oy`) ; seule la POSITION suivra le texte. */
      const _r0 = _ancRect(box, st2, st2 + txt2.length);
      f.ancre = { start: st2, end: st2 + txt2.length, texte: txt2.slice(0, 200) };
      if (_r0) {
        f.ancre.ow = (typeof f.w === 'number' && f.w > 0) ? f.w : (_r0.w + 16);
        f.ancre.oh = (typeof f.h === 'number' && f.h > 0) ? f.h : (_r0.h + 16);
        f.ancre.ox = (typeof f.x === 'number') ? Math.round(f.x - _r0.x) : -8;
        f.ancre.oy = (typeof f.y === 'number') ? Math.round(f.y - _r0.y) : -6;
      }
      if (typeof markChatDirty === 'function') markChatDirty();
      return true;""",
"v633f : _ancFit memorise ow/oh/ox/oy")

# ── 2. _ancPlace : restituer la geometrie memorisee ─────────────────────────
once(
"""      const rr = sol.r;
      /* v632 — decalage manuel meme si le texte a bouge. */
      const _dx = (typeof f.ancre.dx === 'number') ? f.ancre.dx : 0;
      const _dy = (typeof f.ancre.dy === 'number') ? f.ancre.dy : 0;
      const nx = rr.x - 8 + _dx, ny = rr.y - 6 + _dy;
      const nw = Math.max(rr.w + 16, 90);
      const nh = Math.max(rr.h + 16, 44);""",
"""      const rr = sol.r;
      /* v632 — decalage manuel meme si le texte a bouge. */
      const _dx = (typeof f.ancre.dx === 'number') ? f.ancre.dx : 0;
      const _dy = (typeof f.ancre.dy === 'number') ? f.ancre.dy : 0;
      /* ═══ v633f — RESTITUER LA GEOMETRIE, PAS LA RECALCULER ═══
         Si l'ancre porte `ow`/`oh` (figure reparee), on reprend la taille
         d'origine et le decalage `ox`/`oy` au texte de tete. Sinon on garde le
         calcul historique (cadres crees par v609+, aucune regression). */
      var nx, ny, nw, nh;
      if (typeof f.ancre.ow === 'number' && typeof f.ancre.oh === 'number') {
        const _ox = (typeof f.ancre.ox === 'number') ? f.ancre.ox : -8;
        const _oy = (typeof f.ancre.oy === 'number') ? f.ancre.oy : -6;
        nx = rr.x + _ox + _dx; ny = rr.y + _oy + _dy;
        nw = Math.max(f.ancre.ow, 46); nh = Math.max(f.ancre.oh, 34);
      } else {
        nx = rr.x - 8 + _dx; ny = rr.y - 6 + _dy;
        nw = Math.max(rr.w + 16, 90);
        nh = Math.max(rr.h + 16, 44);
      }""",
"v633f : _ancPlace restitue ow/oh/ox/oy")

out = s.replace("\n", "\r\n")
crlf = out.count("\r\n")
lf = out.count("\n") - crlf
if lf != 0:
    sys.exit("REFUS : LF isoles apres normalisation : %d" % lf)
io.open(CIBLE, "w", encoding="utf-8", newline="").write(out)
print("OK — v633f applique. CRLF %d/%d, taille %d" % (crlf, crlf, len(out)))
