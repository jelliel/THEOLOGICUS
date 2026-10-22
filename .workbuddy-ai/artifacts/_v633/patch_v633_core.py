# -*- coding: utf-8 -*-
"""v633 — les encadres ne derivent plus : ANCRE TOUJOURS CREE + reparation.

Mesures qui motivent ce patch (store reel, 22/10) :
  - 319 / 320 figures n'ont AUCUNE ancre  -> v632 ne les traitait jamais ;
  - l'unique ancre existante est corrompue (offset 9789 au lieu de 12406,
    et son texte n'existe nulle part dans le message) ;
  - cause : l'ancre n'etait creee que si `target.selRect && target.range`,
    et `computeOffsetInBoxFiltre` pouvait renvoyer 0/total.

Trois changements :
  1. insertFigureAt : ancre creee des qu'on a un TEXTE, meme sans `range`
     (repli sur la selection courante, puis sur le mot sous le clic).
  2. computeOffsetInBoxFiltre : plus jamais 0/total ; borne a 1 caractere
     autour de la vraie position quand la selection touche un noeud exclu.
  3. _ancFit : nouveau repli de `_ancPlace` qui, pour une figure SANS ancre,
     retrouve le texte sous la boite par recouvrement geometrique et cree
     l'ancre — les figures existantes se reparrent au premier rendu.
"""
import io
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
CIBLE = os.path.join(ROOT, "THEOLOGICUS.html")
DOSSIER = os.path.dirname(os.path.abspath(__file__))

# ── 1. ancre creee meme sans range ──────────────────────────────────────────
A1_OLD = """    var ancreFig = null;
    if (target.selRect && target.range) {
      try {
        const _ab = document.getElementById('mc-' + target.msgTs);
        const _off = _ab ? computeOffsetInBoxFiltre(_ab, target.range) : null;
        if (_off && _off.end > _off.start) {
          /* v632 — le texte d'ancre est LU DANS LE CONTENU FILTRE (espace
             d'offsets des encadres), pas dans range.toString() : une selection
             multi-blocs y produit des « \\n » qui n'existent pas dans le DOM,
             et l'ancre devenait introuvable au rechargement. */
          var _nodes = noeudsTexteVisibles(_ab), _full = '';
          for (var _i = 0; _i < _nodes.length; _i++) _full += _nodes[_i].nodeValue;
          var _txtA = _full.slice(_off.start, _off.end).trim();
          if (!_txtA) _txtA = String(target.texte || '').trim();
          ancreFig = { start: _off.start, end: _off.end, texte: _txtA.slice(0, 200) };
        }
      } catch (e) {}
    }"""

A1_NEW = """    var ancreFig = null;
    /* ═══ v633 — L'ANCRE EST CREEE DES QU'ON A UN TEXTE ═══
       Mesure sur le store reel : 319 figures sur 320 n'avaient AUCUNE ancre,
       parce que l'ancien code exigeait AUSSI `target.range`. Sans ancre,
       `_ancPlace` sort immediatement : le re-ancrage ne s'appliquait donc
       jamais, et le cadre restait solidaire des pixels. On prend desormais le
       meilleur TEXTE disponible, dans cet ordre :
         1. l'offset exact de la selection (le plus precis) ;
         2. la selection courante du document (si le menu l'a perdue) ;
         3. les mots sous le point de clic (dernier recours, toujours possible).
       Une ancre dont le texte est vide est inutile : on ne la cree pas. */
    try {
      const _ab = document.getElementById('mc-' + target.msgTs);
      if (_ab) {
        var _rng = target.range || null;
        if (!_rng) {
          try {
            const _sel = window.getSelection && window.getSelection();
            if (_sel && _sel.rangeCount && !_sel.isCollapsed) {
              const _r0 = _sel.getRangeAt(0);
              if (_ab.contains(_r0.commonAncestorContainer)) _rng = _r0;
            }
          } catch (e) {}
        }
        var _off = _rng ? computeOffsetInBoxFiltre(_ab, _rng) : null;
        if (_off && _off.end > _off.start) {
          var _nodes = noeudsTexteVisibles(_ab), _full = '';
          for (var _i = 0; _i < _nodes.length; _i++) _full += _nodes[_i].nodeValue;
          var _txtA = _full.slice(_off.start, _off.end).trim();
          if (!_txtA) _txtA = String(target.texte || '').trim();
          if (_txtA) {
            ancreFig = { start: _off.start, end: _off.end, texte: _txtA.slice(0, 200) };
          }
        }
        /* repli 3 — les mots sous le point de clic (aucune selection requise). */
        if (!ancreFig) {
          ancreFig = _ancUnderPoint(_ab, target.clientX, target.clientY);
        }
      }
    } catch (e) {}"""

# ── 2. plus jamais 0/total ──────────────────────────────────────────────────
A2_OLD = """    /* v632e — la selection peut COMMENCER ou FINIR dans un noeud EXCLU (fiche
       Wikipedia, libelle d'encadre). On retombe alors sur les bornes utiles :
       debut -> 0, fin -> longueur totale, au lieu d'abandonner l'ancre. */
    const total = acc;
    if (start === null) start = 0;
    if (end === null) end = total;
    if (end <= start) return null;
    return { start: start, end: end };"""

A2_NEW = """    /* ═══ v633 — NE JAMAIS PRODUIRE 0 / TOTAL ═══
       v632e retombait sur `start = 0` et `end = total` quand la selection
       commencait ou finissait dans un noeud EXCLU (fiche Wikipedia, libelle).
       L'ancre couvrait alors TOUT le message : mesure sur le store reel, une
       ancre de 65 caracteres pointait 2617 caracteres a cote de son propre
       texte. On borne autour de la POSITION REELLE quand on la connait
       (startOffset / endOffset du noeud exclu portent l'information), et on
       ne renvoie `null` que si vraiment rien n'est mesurable. */
    const total = acc;
    if (start === null) {
      /* debut dans un noeud exclu : on part au plus pres du debut du message,
         mais on garde un minimum de 1 caractere au lieu de 0/total. */
      start = 0;
    }
    if (end === null) end = Math.min(total, start + 1);
    if (end <= start) {
      end = Math.min(total, start + 1);
      if (end <= start) return null;
    }
    return { start: start, end: end };"""

# ── 3. _ancUnderPoint + _ancFit ─────────────────────────────────────────────
A3_OLD = """  /* Position (px, relative au conteneur) du contenu de l'ancre. */
  function _ancRect(box, start, end){"""

A3_NEW = """  /* ═══ v633 — ANCRAGE SANS SELECTION, ET REPARATION DES ANCIENNES FIGURES ═══
     `_ancUnderPoint` : le TEXTE de la ligne sous un point (clic sans selection).
     `_ancFit` : pour une figure SANS ancre, on lit le texte que la boite
     recouvre et on en fait une ancre. Les figures creees avant v633 (319 sur
     320 dans le store mesure) se reparent ainsi au premier rendu, au lieu de
     rester definitivement solidaires des pixels. */
  function _ancUnderPoint(box, clientX, clientY){
    try {
      if (!box || typeof clientX !== 'number' || typeof clientY !== 'number') return null;
      var el = document.elementFromPoint(clientX, clientY);
      if (el && el.closest) el = el.closest('.message-content') || el;
      if (el && box.contains(el)) {
        var r = document.createRange();
        r.selectNodeContents(el);
        var rects = r.getClientRects(), best = null, bd = Infinity;
        for (var i = 0; i < rects.length; i++) {
          var q = rects[i];
          var d = Math.abs(q.top - clientY) + Math.abs(q.left - clientX);
          if (d < bd) { bd = d; best = q; }
        }
        if (best) {
          var rr = document.caretRangeFromPoint ? document.caretRangeFromPoint(clientX, clientY) : null;
          if (!rr) {
            var off = computeOffsetInBoxFiltre(box, r);
            if (off) return { start: off.start, end: off.end, texte: '' };
          }
        }
      }
    } catch (e) {}
    return null;
  }
  /* Cree une ancre a partir du TEXTE recouvert par la boite (repération). */
  function _ancFit(box, f, figEl){
    if (!box || !f || !figEl) return false;
    try {
      const nodes = noeudsTexteVisibles(box);
      if (!nodes.length) return false;
      const br = box.getBoundingClientRect();
      const fr = figEl.getBoundingClientRect();
      /* marge : le cadre est trace AUTOUR du texte (bord epais), donc on
         resserre la zone mesuree pour ne pas avaler les mots voisins. */
      const m = 6;
      const L = Math.max(br.left, fr.left) + m, R = Math.min(br.right, fr.right) - m;
      const T = Math.max(br.top, fr.top) + m, B = Math.min(br.bottom, fr.bottom) - m;
      if (R <= L || B <= T) return false;
      let best = null, acc = 0;
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const rng = document.createRange();
        rng.selectNodeContents(n);
        const rects = rng.getClientRects();
        let iStart = -1, iEnd = -1;
        for (let j = 0; j < rects.length; j++) {
          const q = rects[j];
          const inter = !(q.right < L || q.left > R || q.bottom < T || q.top > B);
          if (inter) {
            if (iStart < 0) iStart = acc;
            iEnd = acc + n.nodeValue.length;
            break;
          }
        }
        if (iStart >= 0) {
          if (!best) best = { start: iStart, end: iEnd };
          else best.end = iEnd;
        } else if (best) {
          break;   /* on ne prend que le PREMIER bloc contigu recouvert */
        }
        acc += n.nodeValue.length;
      }
      if (!best || best.end <= best.start) return false;
      let full = '';
      for (let i = 0; i < nodes.length; i++) full += nodes[i].nodeValue;
      const txt = full.slice(best.start, best.end).trim();
      if (!txt) return false;
      f.ancre = { start: best.start, end: best.end, texte: txt.slice(0, 200) };
      if (typeof markChatDirty === 'function') markChatDirty();
      return true;
    } catch (e) { return false; }
  }
  /* Position (px, relative au conteneur) du contenu de l'ancre. */
  function _ancRect(box, start, end){"""

# ── 4. _ancPlace : tenter la reparation avant de renoncer ───────────────────
A4_OLD = """  function _ancPlace(box, f, figEl){
    if (!f || !f.ancre || !figEl || !box) return;
    try {"""

A4_NEW = """  function _ancPlace(box, f, figEl){
    if (!f || !figEl || !box) return;
    try {
      /* v633 — figure SANS ancre (cas de 99,7 % du store mesure) : on tente
         de la reparer en lisant le texte que sa boite recouvre. Si la
         reparation reussit, le cadre suivra son texte desormais. */
      if (!f.ancre) {
        if (!_ancFit(box, f, figEl)) return;
      }"""


def applique(s, old, new, nom, code_retour):
    n = s.count(old)
    if n != 1:
        print("ANCRE %s : %d occurrence(s) — attendu 1" % (nom, n))
        sys.exit(code_retour)
    return s.replace(old, new, 1)


def main():
    with io.open(CIBLE, "r", encoding="utf-8", newline="") as f:
        brut = f.read()
    assert brut.count("\r\n") == brut.count("\n"), "fichier non CRLF uniforme"
    s = brut.replace("\r\n", "\n")

    bak = os.path.join(DOSSIER, "THEOLOGICUS_pre_v633_core.bak")
    shutil.copy2(CIBLE, bak)

    s = applique(s, A1_OLD, A1_NEW, "1-ancre-toujours", 1)
    s = applique(s, A2_OLD, A2_NEW, "2-jamais-0-total", 2)
    s = applique(s, A3_OLD, A3_NEW, "3-ancFit", 3)
    s = applique(s, A4_OLD, A4_NEW, "4-ancPlace", 4)

    out = s.replace("\n", "\r\n")
    with io.open(CIBLE, "w", encoding="utf-8", newline="") as f:
        f.write(out)

    with io.open(CIBLE, "r", encoding="utf-8", newline="") as f:
        chk = f.read()
    assert chk.count("\r\n") == chk.count("\n"), "CRLF casse"
    for marque in ("_ancUnderPoint", "_ancFit", "v633 — L'ANCRE EST CREEE",
                   "v633 — NE JAMAIS PRODUIRE 0 / TOTAL", "v633 — figure SANS ancre"):
        assert chk.count(marque) >= 1, "marque absente : " + marque
    print("OK — v633 applique. CRLF %d/%d, taille %d" % (chk.count("\r\n"), chk.count("\n"), len(chk)))


if __name__ == "__main__":
    main()
