# -*- coding: utf-8 -*-
"""v647 — UN GESTE MANUEL N'EST PLUS DEFAIT PAR LE RENDU.

Defaut mesure (sonde _v647/probe_snapback.js, banc v621 test 4 = 13/14) :
  pendant un glissement, chaque `fb.style.left = ...` mute le DOM ;
  MutationObserver de `cc` -> `_atcScheduleApply` -> `_atcSettle` ->
  `applyShapes` -> `_ancPlace` RECALCULE la position depuis l'ancre et
  ECRASE le geste. Journal des mutations du cadre :
      t+64ms  left=5px    (le geste)
      t+176ms left=0px    <-- le rendu defait le geste
      t+206ms left=10px
      t+430ms left=0px    <-- encore
      t+594ms left=0px    (apres le mouseup)
  Le banc mesurait donc {"l":0,"t":0} -> {"l":0,"t":0}.

Seconde cause, independante : meme apres un `persistFig` correct, la
branche `cx` de `_ancPlace` CENTRE la boite (`rr.x + (rr.w - nw)/2 + dx`).
Une boite plus large que son ancre donne un terme negatif, borne a 0 :
  dx=30 enregistre, cadre rendu a left=0px. Le decalage n'etait donc
  pas REPRODUCTIBLE, seulement memoired.

Trois invariants :
  1. `_ancPlace` s'abstient tant que le cadre est SAISI (`figEl.__atcGeste`).
  2. Le `mousedown` marque la saisie ; le `mouseup` la leve.
  3. Un DEPLACEMENT memorise l'ecart AU COIN de l'ancre (`ox/oy`,
     reference fixe) au lieu d'accumuler `dx/dy` sur un centrage.
     `ow/oh` restent immuables : l'idempotence v634 est conservee.
"""
import io, os, sys

SRC = "THEOLOGICUS.html"
BAK = SRC + ".v647.bak"

with io.open(SRC, "r", encoding="utf-8", newline="") as fd:
    raw = fd.read()

# ── normaliser en LF pour patcher (remplacement LITTERAL) ──
lf = raw.replace("\r\n", "\n")
if lf == raw:
    print("NOTE : fichier deja en LF")
if "\r" in lf:
    sys.exit("REFUS : CR isole present dans la copie de travail")

with io.open(BAK, "w", encoding="utf-8", newline="") as fd:
    fd.write(lf)

def once(old, new, tag):
    global lf
    n = lf.count(old)
    if n != 1:
        sys.exit("REFUS [%s] : %d occurrences (attendu 1)" % (tag, n))
    lf = lf.replace(old, new, 1)
    print("  [OK] %s" % tag)

# ══════════════════════════════════════════════════════════════
# 1. `_ancPlace` S'ABSTIENT pendant un geste
# ══════════════════════════════════════════════════════════════
once(
"""  function _ancPlace(box, f, figEl){
    if (!f || !figEl || !box) return;
    try {
""",
"""  function _ancPlace(box, f, figEl){
    if (!f || !figEl || !box) return;
    /* v647 — NE JAMAIS ECRASER UN GESTE EN COURS.
       Pendant un glissement, chaque ecriture de `style.left` mute le DOM ;
       le MutationObserver de `cc` relance `_atcSettle` -> `applyShapes` ->
       `_ancPlace`, qui RECALCULAIT la position depuis l'ancre et defaisait
       le geste (mesure : left=5px a t+64ms, left=0px a t+176ms, left=0px a
       t+594ms apres le mouseup). Un cadre SAISI n'est plus replace : le
       geste est seul maitre jusqu'au `mouseup`, ou `persistFig` enregistre
       la geometrie. Le banc v621 test 4 mesurait 0 -> 0. */
    if (figEl.__atcGeste) return;
    try {
""",
"A. _ancPlace s'abstient pendant un geste")

# ══════════════════════════════════════════════════════════════
# 2. Le `mousedown` MARQUE la saisie
# ══════════════════════════════════════════════════════════════
once(
"""    cc.querySelectorAll('.atc-figbox.sel').forEach(function(o){ if (o !== fb) o.classList.remove('sel'); });
    fb.classList.add('sel');
    showFigTools(fb, f, ts);
""",
"""    cc.querySelectorAll('.atc-figbox.sel').forEach(function(o){ if (o !== fb) o.classList.remove('sel'); });
    fb.classList.add('sel');
    showFigTools(fb, f, ts);
    /* v647 — le cadre est SAISI : `_ancPlace` s'abstient jusqu'au `mouseup`,
       sinon le rendu defait le glissement en cours. */
    fb.__atcGeste = true;
    window.__atcGeste = Date.now();
""",
"B. le mousedown marque la saisie")

# ══════════════════════════════════════════════════════════════
# 3. Le `mouseup` LEVE la marque AVANT de persister
# ══════════════════════════════════════════════════════════════
once(
"""      fb.classList.remove('dragging');
      persistFig(f, fb, { l: ol, t: ot, w: ow, h: oh });
""",
"""      fb.classList.remove('dragging');
      /* v647 — fin de la saisie : le rendu reprend la main. `persistFig`
         tourne AVANT, donc la geometrie enregistree est deja la bonne. */
      fb.__atcGeste = false;
      persistFig(f, fb, { l: ol, t: ot, w: ow, h: oh });
""",
"C. le mouseup leve la marque")

# ══════════════════════════════════════════════════════════════
# 4. Un DEPLACEMENT devient REPRODUCTIBLE (coin de l'ancre)
# ══════════════════════════════════════════════════════════════
once(
"""        else {
          f.ancre.dx = Math.round((f.ancre.dx || 0) + (nx - o.l));
          f.ancre.dy = Math.round((f.ancre.dy || 0) + (ny - o.t));
        }
""",
"""        else {
          /* v647 — UN DEPLACEMENT MANUEL DOIT ETRE REPRODUCTIBLE.
             Accumuler `dx/dy` ne suffisait pas : la branche `cx` de
             `_ancPlace` CENTRE la boite (`rr.x + (rr.w - nw)/2 + dx`).
             Une boite plus large que son ancre donne un terme negatif, puis
             le borne-bas a 0 ramene le cadre a sa position d'origine —
             mesure : dx=30 enregistre, cadre rendu a left=0px.
             On memorise donc l'ecart AU COIN de l'ancre (`ox/oy`), reference
             fixe : `rr.x + ox` restitue la position au pixel. `ow/oh` restent
             immuables, donc l'idempotence v634 est conservee.
             Repli : si l'ancre n'a pas de texte resoluble, on garde l'ancien
             cumul `dx/dy` (mieux que rien). */
          var _boxP = fb.closest ? (fb.closest('.message-content') || fb.parentElement) : null;
          var _oxN = null, _oyN = null;
          try {
            if (_boxP) {
              var _solP = _ancResolve(_boxP, f);
              if (_solP && _solP.r) {
                _oxN = Math.round(nx - _solP.r.x);
                _oyN = Math.round(ny - _solP.r.y);
              }
            }
          } catch (e) {}
          if (_oxN !== null) {
            f.ancre.ox = _oxN; f.ancre.oy = _oyN;
            f.ancre.dx = 0; f.ancre.dy = 0;
            delete f.ancre.cx;
          } else {
            f.ancre.dx = Math.round((f.ancre.dx || 0) + (nx - o.l));
            f.ancre.dy = Math.round((f.ancre.dy || 0) + (ny - o.t));
          }
        }
""",
"D. deplacement reproductible (coin de l'ancre)")

# ── post-condition : le contenu DOIT changer ──
if lf == raw.replace("\r\n", "\n"):
    sys.exit("REFUS : contenu IDENTIQUE — le correctif n'a rien change")

# ── rendre les CRLF (remplacement LITTERAL) ──
out = lf.replace("\n", "\r\n")

with io.open(SRC, "w", encoding="utf-8", newline="") as fd:
    fd.write(out)

o = raw.count("\r\n"); n = out.count("\r\n")
print("\nCRLF : %d -> %d" % (o, n))
if out.count("\n") != n:
    sys.exit("REFUS : LF isole apres normalisation")
print("OK — v647 applique. %d octets -> %d octets" % (len(raw), len(out)))
