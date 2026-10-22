# -*- coding: utf-8 -*-
"""v647b — FILET DE SÉCURITÉ SUR LA MARQUE DE SAISIE.

v647 pose `fb.__atcGeste = true` au mousedown et le lève au `mouseup`
(posé sur `document`). Si ce `mouseup` est PERDU — bouton relâché hors de la
fenêtre, perte de focale, événement avalé — la marque resterait posée pour
toujours : `_ancPlace` s'abstiendrait à chaque rendu et le cadre NE SUIVRAIT
PLUS SON TEXTE. C'est très exactement la famille de défaut que l'utilisateur
signale (« les encadrements ne respectent pas leurs positions »).

Correctif : un écouteur de CAPTURE sur `window` rattrape le cas. Il s'exécute
avant le `mouseup` de `document`, donc `up()` trouve la marque déjà levée —
idempotent, sans changement de comportement dans le cas normal.
"""
import io, sys

SRC = "THEOLOGICUS.html"
BAK = SRC + ".v647b.bak"

with io.open(SRC, "r", encoding="utf-8", newline="") as fd:
    raw = fd.read()

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

# ── 1. mémoriser l'élément saisi + poser l'écouteur de capture une fois ──
once(
"""    /* v647 — le cadre est SAISI : `_ancPlace` s'abstient jusqu'au `mouseup`,
       sinon le rendu defait le glissement en cours. */
    fb.__atcGeste = true;
    window.__atcGeste = Date.now();
""",
"""    /* v647 — le cadre est SAISI : `_ancPlace` s'abstient jusqu'au `mouseup`,
       sinon le rendu defait le glissement en cours. */
    fb.__atcGeste = true;
    window.__atcGeste = Date.now();
    /* v647b — FILET DE SÉCURITÉ. Si le `mouseup` est perdu (bouton relâché
       hors de la fenêtre, perte de focale), la marque resterait posée et le
       cadre ne serait PLUS JAMAIS replacé : il ne suivrait plus son texte.
       L'écouteur de capture sur `window` passe AVANT le `mouseup` de
       `document`, donc `up()` retrouve la marque déjà levée — idempotent. */
    window.__atcGesteEl = fb;
    if (!window.__atcGesteFilet) {
      window.__atcGesteFilet = function () {
        var el = window.__atcGesteEl;
        if (el) { el.__atcGeste = false; window.__atcGesteEl = null; }
      };
      window.addEventListener('mouseup', window.__atcGesteFilet, true);
    }
""",
"A. filet de securite au mousedown")

# ── 2. `up()` oublie l'élément après avoir levé la marque ──
once(
"""      /* v647 — fin de la saisie : le rendu reprend la main. `persistFig`
         tourne AVANT, donc la geometrie enregistree est deja la bonne. */
      fb.__atcGeste = false;
""",
"""      /* v647 — fin de la saisie : le rendu reprend la main. `persistFig`
         tourne AVANT, donc la geometrie enregistree est deja la bonne. */
      fb.__atcGeste = false;
      if (window.__atcGesteEl === fb) window.__atcGesteEl = null;
""",
"B. up() oublie l'element saisi")

if lf == raw.replace("\r\n", "\n"):
    sys.exit("REFUS : contenu IDENTIQUE — le correctif n'a rien change")

out = lf.replace("\n", "\r\n")
with io.open(SRC, "w", encoding="utf-8", newline="") as fd:
    fd.write(out)

o = raw.count("\r\n"); n = out.count("\r\n")
print("\nCRLF : %d -> %d" % (o, n))
if out.count("\n") != n:
    sys.exit("REFUS : LF isole apres normalisation")
print("OK — v647b applique. %d octets -> %d octets" % (len(raw), len(out)))
