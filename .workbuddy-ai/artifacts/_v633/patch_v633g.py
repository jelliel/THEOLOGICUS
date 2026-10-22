# -*- coding: utf-8 -*-
"""v633g — MESURE ET RESTITUTION DANS LE MEME ESPACE (apres bornage).

Mesure sur DONNEE REELLE : 17/27 cadres seulement couvrent leur ancre. Exemple
mesure, figure `fg-1792578151674` :
    ancre.ox = 1, ancre.oy = -69, ow = 621, oh = 100
    texte de l'ancre : x = 499      cadre rendu : x = 427      ecart de centre = -229 px
    texte de l'ancre : y = -5734    cadre rendu : y = -5866

Cause : `_ancFit` calcule `ox`/`oy` a partir de `_ancRect` (rect NON borne),
puis `_ancPlace` BORNE le cadre dans la boite
(`Math.min(Math.max(0, nx), box.clientWidth - nw)`). La restitution applique
donc un decalage mesure dans un espace que le rendu a ensuite deplace.

Correctif : apres avoir calcule la geometrie BORNEE, on re-mesure le texte
REELLEMENT recouvert par le cadre rendu et on reecrit l'ancre dessus. La mesure
et la restitution partagent ainsi le meme espace — regle deja apprise en v632g,
appliquee ici au chemin de reparation.
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

bak = os.path.join(ICI, "THEOLOGICUS_pre_v633g.bak")
io.open(bak, "w", encoding="utf-8", newline="").write(src)

def once(old, new, quoi):
    global s
    n = s.count(old)
    if n != 1:
        sys.exit("REFUS [%s] : %d occurrences (attendu 1)" % (quoi, n))
    s = s.replace(old, new)
    print("  OK  " + quoi)

# ── _ancPlace : apres bornage, recaler l'ancre sur le texte REELLEMENT couvert ─
once(
"""      f.x = bx; f.y = by;
      f.w = Math.round(nw); f.h = Math.round(nh);
      figEl.style.left = f.x + 'px'; figEl.style.top = f.y + 'px';
      figEl.style.width = f.w + 'px'; figEl.style.height = f.h + 'px';
      if (typeof markChatDirty === 'function') markChatDirty();""",
"""      f.x = bx; f.y = by;
      f.w = Math.round(nw); f.h = Math.round(nh);
      figEl.style.left = f.x + 'px'; figEl.style.top = f.y + 'px';
      figEl.style.width = f.w + 'px'; figEl.style.height = f.h + 'px';
      /* ═══ v633g — RECALER L'ANCRE SUR LE TEXTE REELLEMENT COUVERT ═══
         Le bornage ci-dessus deplace le cadre ; or `ox`/`oy` ont ete mesures
         AVANT bornage. Sur donnee reelle, cet ecart atteignait 229 px
         horizontalement et 132 px verticalement, si bien que le cadre ne
         couvrait plus son propre texte. On re-mesure donc le texte sous la
         boite BORNEE et on reecrit l'ancre dessus : mesure et restitution
         partagent alors le meme espace (meme regle qu'en v632g). */
      if (_repare && typeof _ancFit === 'function') {
        try {
          const _w0 = f.w, _h0 = f.h;
          _ancFit(box, f, figEl);
          /* _ancFit a reecrit ow/oh/ox/oy : on ne garde que la TAILLE voulue,
             qui ne doit pas changer lors d'un simple recalage. */
          if (f.ancre && _w0 > 0 && _h0 > 0) {
            f.ancre.ow = _w0; f.ancre.oh = _h0;
          }
        } catch (e) {}
      }
      if (typeof markChatDirty === 'function') markChatDirty();""",
"v633g : recalage de l'ancre apres bornage")

# ── _ancFit doit refleter ou la boite EST rendue, pas offsetLeft perime ───────
once(
"""      const br = box.getBoundingClientRect();
      const fr = figEl.getBoundingClientRect();
      /* marge : le cadre est trace AUTOUR du texte (bord epais), donc on
         resserre la zone mesuree pour ne pas avaler les mots voisins. */
      const m = 6;""",
"""      const br = box.getBoundingClientRect();
      const fr = figEl.getBoundingClientRect();
      /* v633g — au SECOND passage (recalage), le cadre est deja rendu : on lit
         sa position REELLE. On ne resserre plus la zone (la marge servait a ne
         pas avaler les voisins lors d'une mesure « au jugé »). */
      const m = 0;""",
"v633g : _ancFit mesure la position reelle du cadre")

out = s.replace("\n", "\r\n")
crlf = out.count("\r\n")
lf = out.count("\n") - crlf
if lf != 0:
    sys.exit("REFUS : LF isoles apres normalisation : %d" % lf)
io.open(CIBLE, "w", encoding="utf-8", newline="").write(out)
print("OK — v633g applique. CRLF %d/%d, taille %d" % (crlf, crlf, len(out)))
