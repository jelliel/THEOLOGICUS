# -*- coding: utf-8 -*-
"""v633b — LA REPARATION D'UNE FIGURE SANS ANCRE DOIT ETRE PERSISTEE.

Mesure (diag_fit.js) : apres le rendu, l'etat EN MEMOIRE porte bien
    ancre = {start:0, end:33, texte:"Kyrios comme titre christologique"}
mais le store localStorage porte encore ancre:null. `_ancFit` ne fait que
`markChatDirty()` ; c'est `persistFig` qui appelle `atcPersist()`, et il n'est
jamais atteint par le chemin de reparation. Resultat : la reparation est
recalculee a chaque rendu et perdue a chaque redemarrage — exactement le bug
rapporte par l'utilisateur.

Correctif : dans `_ancPlace`, si `_ancFit` vient de CREER l'ancre, on persiste
une fois (throttle 350 ms en place, donc pas de gel).
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
    sys.exit("REFUS : le fichier contient deja des LF isoles")

bak = os.path.join(ICI, "THEOLOGICUS_pre_v633b.bak")
io.open(bak, "w", encoding="utf-8", newline="").write(src)

def once(old, new, quoi):
    global s
    n = s.count(old)
    if n != 1:
        sys.exit("REFUS [%s] : %d occurrences (attendu 1)" % (quoi, n))
    s = s.replace(old, new)
    print("  OK  " + quoi)

# ── 1. _ancPlace : persister si la reparation a CREE l'ancre ────────────────
once(
"""      if (!f.ancre) {
        if (!_ancFit(box, f, figEl)) return;
      }""",
"""      var _repare = false;
      if (!f.ancre) {
        if (!_ancFit(box, f, figEl)) return;
        _repare = true;
      }""",
"v633b : memoriser que l'ancre vient d'etre creee")

once(
"""      f.x = bx; f.y = by;
      f.w = Math.round(nw); f.h = Math.round(nh);
      figEl.style.left = f.x + 'px'; figEl.style.top = f.y + 'px';
      figEl.style.width = f.w + 'px'; figEl.style.height = f.h + 'px';
      if (typeof markChatDirty === 'function') markChatDirty();
    } catch (e) {}
  }""",
"""      f.x = bx; f.y = by;
      f.w = Math.round(nw); f.h = Math.round(nh);
      figEl.style.left = f.x + 'px'; figEl.style.top = f.y + 'px';
      figEl.style.width = f.w + 'px'; figEl.style.height = f.h + 'px';
      if (typeof markChatDirty === 'function') markChatDirty();
      /* ═══ v633b — UNE REPARATION PERDUE EST UNE REPARATION INUTILE ═══
         `_ancFit` cree l'ancre mais seul `persistFig` appelait `atcPersist()` :
         l'ancre vivait en memoire et disparaissait au redemarrage, ce qui
         remettait la figure « dans les pixels » — le bug rapporte. On persiste
         donc explicitement quand l'ancre vient d'etre creee. `atcPersist` est
         deja throttle (leading + trailing 350 ms), donc pas de gel. */
      if (_repare && typeof atcPersist === 'function') {
        try { atcPersist(); } catch (e) {}
      }
    } catch (e) {}
  }""",
"v633b : persister l'ancre reparee")

# ── 2. _ancFit ne doit pas laisser une ancre VIDE (texte vide = inutilisable)
once(
"""      const txt = full.slice(best.start, best.end).trim();
      if (!txt) return false;
      f.ancre = { start: best.start, end: best.end, texte: txt.slice(0, 200) };""",
"""      const txt = full.slice(best.start, best.end).trim();
      if (!txt) return false;
      /* v633b — recalage : les blancs de bord font diverger l'offset du texte.
         On avance `start` jusqu'au premier caractere non blanc, sinon
         `_ancResolve` cherche un texte qui ne commence pas la ou on croit. */
      let st2 = best.start;
      while (st2 < best.end && /\\s/.test(full.charAt(st2))) st2++;
      const txt2 = full.slice(st2, best.end).trim();
      if (!txt2) return false;
      f.ancre = { start: st2, end: st2 + txt2.length, texte: txt2.slice(0, 200) };""",
"v633b : ancre recalee sur le premier caractere non blanc")

out = s.replace("\n", "\r\n")
crlf = out.count("\r\n")
lf = out.count("\n") - crlf
if lf != 0:
    sys.exit("REFUS : LF isoles apres normalisation : %d" % lf)
io.open(CIBLE, "w", encoding="utf-8", newline="").write(out)
print("OK — v633b applique. CRLF %d/%d, taille %d" % (crlf, crlf, len(out)))
