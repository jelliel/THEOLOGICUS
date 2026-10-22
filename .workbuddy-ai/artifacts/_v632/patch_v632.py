# -*- coding: utf-8 -*-
"""
v632 — ANCRAGE TEXTE DUNABLE DES ENCADRES.

Bogue mesure (capture utilisateur 2026-10-22) : apres redemarrage, les
encadrements se deplacent. Cause racine :

  `noeudsTexteVisibles()` exclut les noeuds texte des `.atc-figbox`, mais
  `wrapByOffset` / `locateInBox` (surlignages, marques) utilisent
  `document.createTreeWalker` SANS filtre -> l'espace d'offsets n'est PAS le
  meme. Or les `<script>` inline de THEOLOGICUS.html ne sont PAS differes :
  le navigateur INSERE « le texte de tout script inline » dans le DOM, au
  milieu de `.message-content`. `Range.toString()` (utilise par
  `computeOffsetInBox` pour les surlignages) compte ce texte, la walker non
  filtree aussi ; les walkers filtres non. Autrement dit, la position de
  reference d'un encadre change selon l'ordre, le nombre et la TAILLE des
  scripts (et donc selon que la CSP/navigateur execute ou non), et surtout
  `locateInBoxFiltre(start/end)` finit par designer un autre mot des que le
  contenu du message evolue (streaming, markdown, regeneration).

Correctif : un encadre n'est plus re-ancre par un OFFSET nu mais par le TEXTE
qu'il entoure (`f.ancre.texte`), retrouve dans l'espace FILTRE avec repli
tolerant (NFKC/NFD, ponctuation et espaces ignores) et choix de l'occurrence
la plus proche de l'ancre precedente. Tout encadre dont l'ancre n'a pas de
texte exploitable est re-ancre par l'offset, puis l'ancre est REPAREE avec le
texte retrouve (les anciens encadres deviennent fiables apres un seul rendu).

De plus : l'ancre est conservee quand on DEPLACE seulement le cadre (la
position manuelle est mémorisée finement) ; elle n'est abandonnee qu'au
REDIMENSIONNEMENT, qui rend la taille texte incoherente. Avant, un simple
glissement cassait l'ancre pour toujours.
"""
import sys, io, os

ROOT = r"C:\tmp\theoverify"
P = os.path.join(ROOT, "THEOLOGICUS.html")

s = io.open(P, "r", encoding="utf-8", newline="").read()
orig = s
assert s.count("\r\n") == s.count("\n"), "fichier non CRLF : refus"
s = s.replace("\r\n", "\n")          # travail en LF, restauration en fin

def once(old, new, label):
    global s
    n = s.count(old)
    assert n == 1, "ANCRE NON UNIQUE (%d) : %s" % (n, label)
    s = s.replace(old, new, 1)

# ─────────────────────────────────────────────────────────────────────────
# 1) noeudsTexteVisibles : etendre l'exclusion a tout l'instrumentation ? NON
#    (les marques/highlights doivent rester comptees : elles n'ajoutent aucun
#    caractere). On garde tel quel mais on ajoute un drapeau _atcCleanV132
#    pour documenter.
# ─────────────────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────────────────────
# 2) computeOffsetInBoxFiltre : mettre aussi en forme le TEXTE de l'ancre
#    (le texte brut encode dans f.ancre.texte sert de verite).
#    -> on ne modifie pas la fonction ; on ajoute apres locateInBoxFiltre
#    les nouveaux helpers d'ancrage.
# ─────────────────────────────────────────────────────────────────────────
ANCHOR_HELPERS = r"""  /* ═══ v632 — ANCHE TEXTE ROBUSTE DES ENCADRES ═══
     `noeudsTexteVisibles` definit l'espace d'offsets des encadres. Il EXCLUT
     le texte des `.atc-figbox` ; l'ajout d'un encadre ne decale donc jamais
     les suivants. Mais un offset nu reste fragile des que le contenu du
     message change (streaming, markdown, regeneration, changement de police
     peut aussi re-brasser les retours). On ancre donc sur le TEXTE. */
  function _ancNorm(str){
    /* NFKC compose les ligatures, NFD separe les accents, on retire les
       diacritiques, on met en minuscule puis on garde lettres + chiffres :
       une ancre survit a « ’ » vs « ' », aux espaces insecables, aux puces. */
    const NF = String(str == null ? '' : str).normalize('NFKC').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toLowerCase();
    let norm = '', map = [];
    for (let i = 0; i < NF.length; i++) {
      const ch = NF[i];
      if (/[a-z0-9]/.test(ch)) { norm += ch; map.push(i); }
    }
    return { norm: norm, map: map };
  }
  /* Toutes les positions possibles de `texte` dans le contenu filtre. */
  function _ancOccurrences(container, texte){
    const nodes = noeudsTexteVisibles(container);
    if (!nodes.length) return [];
    let full = '', starts = [];
    for (let i = 0; i < nodes.length; i++) { starts.push(full.length); full += nodes[i].nodeValue; }
    const F = _ancNorm(full), T = _ancNorm(texte);
    if (!T.norm) return [];
    const out = []; let k = 0;
    while ((k = F.norm.indexOf(T.norm, k)) !== -1) {
      out.push({ start: F.map[k], end: F.map[k + T.norm.length - 1] + 1, idx: k });
      k += 1;
    }
    return out;
  }
  /* Position (px, relative au conteneur) du contenu de l'ancre. */
  function _ancRect(box, start, end){
    const a = locateInBoxFiltre(box, start, false);
    const b = locateInBoxFiltre(box, end, true);
    if (!a || !b) return null;
    try {
      const rng = document.createRange();
      rng.setStart(a.node, Math.max(0, Math.min(a.off, a.node.nodeValue.length)));
      rng.setEnd(b.node, Math.max(0, Math.min(b.off, b.node.nodeValue.length)));
      const rr = rng.getBoundingClientRect();
      if (!rr || rr.width <= 2) return null;
      const br = box.getBoundingClientRect();
      return { x: rr.left - br.left + box.scrollLeft, y: rr.top - br.top + box.scrollTop,
               w: rr.width, h: rr.height };
    } catch (e) { return null; }
  }
  /* Ancre un encadre : cherche le texte dans la mise en page ACTUELLE, choisit
     l'occurrence la plus proche de l'ancre memorisee, retourne le rect. */
  function _ancResolve(box, f){
    if (!f || !f.ancre) return null;
    const an = f.ancre;
    const texte = (typeof an.texte === 'string') ? an.texte : '';
    if (!_ancNorm(texte).norm) return null;      /* ancre « muette » : offset seul */
    const occ = _ancOccurrences(box, texte);
    if (!occ.length) return null;
    let best = occ[0], bd = Infinity;
    const ref = (typeof an.start === 'number') ? an.start : 0;
    for (let i = 0; i < occ.length; i++) {
      const d = Math.abs(occ[i].start - ref);
      if (d < bd) { bd = d; best = occ[i]; }
    }
    const r = _ancRect(box, best.start, best.end);
    if (!r) return null;
    return { r: r, start: best.start, end: best.end };
  }
  /* Repare l'ancre (texte + offsets reels) — utilise aussi pour les anciens
     encadres crees avant v632, dont `ancre.texte` pouvait etre vide. */
  function _ancRepair(box, f, solve){
    if (!f || !f.ancre || !solve) return;
    const an = f.ancre;
    if (!_ancNorm(an.texte || '').norm) {
      /* pas de texte memorise : on le LIT dans la mise en page courante a
         l'offset courant (le seul indice disponible), puis on le conserve. */
      const nodes = noeudsTexteVisibles(box);
      let full = '', starts = [];
      for (let i = 0; i < nodes.length; i++) { starts.push(full.length); full += nodes[i].nodeValue; }
      const a = Math.max(0, Math.min(an.start | 0, full.length));
      const b = Math.max(a, Math.min(an.end | 0, full.length));
      const t = full.slice(a, b).trim();
      if (_ancNorm(t).norm) an.texte = t.slice(0, 200);
    }
    if (solve) { an.start = solve.start; an.end = solve.end; }
  }
"""

once("""  /* v628 — LAZY-APPLY : on ne traite que les messages VISIBLES (viewport +""",
     ANCHOR_HELPERS + """  /* v628 — LAZY-APPLY : on ne traite que les messages VISIBLES (viewport +""",
     "helpers d'ancrage v632")

# ─────────────────────────────────────────────────────────────────────────
# 3) applyShapes : re-ancrage par TEXTE (et non plus par offset nu).
# ─────────────────────────────────────────────────────────────────────────
OLD_REANCHOR = """        if (f.ancre && typeof locateInBoxFiltre === 'function') {
          try {
            const a = locateInBoxFiltre(box, f.ancre.start, false);
            const b = locateInBoxFiltre(box, f.ancre.end, true);
            if (a && b) {
              const rng = document.createRange();
              rng.setStart(a.node, a.off); rng.setEnd(b.node, b.off);
              const rr = rng.getBoundingClientRect();
              if (rr && rr.width > 2) {
                const br = box.getBoundingClientRect();
                const nx = rr.left - br.left + box.scrollLeft - 8;
                const ny = rr.top - br.top + box.scrollTop - 6;
                const nw = Math.max(rr.width + 16, 90);
                const nh = Math.max(rr.height + 16, 44);
                /* v621 — même borne qu'à la création : le cadre reste dans
                   la zone visible, sinon ses bords sont rognés. */
                const bx = Math.min(Math.max(0, Math.round(nx)), Math.max(0, box.clientWidth - Math.round(nw)));
                const by = Math.min(Math.max(0, Math.round(ny)), Math.max(0, box.clientHeight - Math.round(nh)));
                if (Math.abs(bx - f.x) > 1 || Math.abs(by - f.y) > 1 ||
                    Math.abs(nw - f.w) > 1 || Math.abs(nh - f.h) > 1) {
                  f.x = bx; f.y = by;
                  f.w = Math.round(nw); f.h = Math.round(nh);
                  figEl.style.left = f.x + 'px'; figEl.style.top = f.y + 'px';
                  figEl.style.width = f.w + 'px'; figEl.style.height = f.h + 'px';
                  if (typeof markChatDirty === 'function') markChatDirty();
                }
              }
            }
          } catch (e) {}
        }"""

NEW_REANCHOR = """        /* ═══ v632 — RE-ANCRAGE PAR TEXTE ═══
           L'ancre precedente (offset nu, v609) designait un AUTRE mot des que
           le contenu du message bougeait : la walker filtree des encadres
           n'a pas le meme espace d'offsets que Range.toString(), donc un
           decalage d'un seul caractere suffisait a deplacer le cadre d'une
           ligne. On retrouve d'abord le TEXTE de l'ancre ; l'offset ne sert
           plus que de repli ET de departage entre occurrences. */
        if (f.ancre) {
          try {
            let sol = _ancResolve(box, f);
            if (!sol && typeof locateInBoxFiltre === 'function' &&
                typeof f.ancre.start === 'number' && typeof f.ancre.end === 'number') {
              /* repli : ancien encadre dont l'ancre n'a pas encore de texte,
                 ou texte introuvable -> on garde l'offset comme depart. */
              const rr0 = _ancRect(box, f.ancre.start, f.ancre.end);
              if (rr0) sol = { r: rr0, start: f.ancre.start, end: f.ancre.end };
            }
            _ancRepair(box, f, sol);
            if (sol && sol.r) {
              const rr = sol.r;
              const nx = rr.x - 8, ny = rr.y - 6;
              const nw = Math.max(rr.w + 16, 90);
              const nh = Math.max(rr.h + 16, 44);
              /* v621 — même borne qu'à la création : le cadre reste dans
                 la zone visible, sinon ses bords sont rognés. */
              const bx = Math.min(Math.max(0, Math.round(nx)), Math.max(0, box.clientWidth - Math.round(nw)));
              const by = Math.min(Math.max(0, Math.round(ny)), Math.max(0, box.clientHeight - Math.round(nh)));
              if (Math.abs(bx - f.x) > 1 || Math.abs(by - f.y) > 1 ||
                  Math.abs(nw - f.w) > 1 || Math.abs(nh - f.h) > 1) {
                f.x = bx; f.y = by;
                f.w = Math.round(nw); f.h = Math.round(nh);
                figEl.style.left = f.x + 'px'; figEl.style.top = f.y + 'px';
                figEl.style.width = f.w + 'px'; figEl.style.height = f.h + 'px';
                if (typeof markChatDirty === 'function') markChatDirty();
              }
            }
          } catch (e) {}
        }"""

once(OLD_REANCHOR, NEW_REANCHOR, "applyShapes re-ancrage")

# ─────────────────────────────────────────────────────────────────────────
# 4) insertFigureAt : stocker TOUJOURS un texte d'ancre exploitable (et
#    prendre le texte tel qu'il apparait dans le contenu filtre : le
#    `range.toString()` d'une selection multi-blocs insere des \n absents du
#    DOM, ce qui rendait l'ancre introuvable a la relecture).
# ─────────────────────────────────────────────────────────────────────────
OLD_INSERT = """    var ancreFig = null;
    if (target.selRect && target.range) {
      try {
        const _ab = document.getElementById('mc-' + target.msgTs);
        const _off = _ab ? computeOffsetInBoxFiltre(_ab, target.range) : null;
        if (_off) ancreFig = { start: _off.start, end: _off.end,
          texte: (target.texte || (target.range ? target.range.toString() : '') || '').slice(0, 200) };
      } catch (e) {}
    }"""

NEW_INSERT = """    var ancreFig = null;
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

once(OLD_INSERT, NEW_INSERT, "insertFigureAt ancre texte")

# ─────────────────────────────────────────────────────────────────────────
# 5) persistFig : un DEPLACEMENT conserve l'ancre ; seul le redimensionnement
#    la retire (la geometrie texte n'est plus coherente avec la boite).
#    On memorise aussi le decalage manuel (dx/dy) pour rester fidele.
# ─────────────────────────────────────────────────────────────────────────
OLD_PERSIST = """    f.x = nx; f.y = ny; f.w = nw; f.h = nh;
    /* v609 — déplacement/retaille MANUELS : l'ancre texte est retirée (la
       position manuelle prime sur le ré-ancrage automatique). */
    if (aBouge && f.ancre) { delete f.ancre; }"""

NEW_PERSIST = """    f.x = nx; f.y = ny; f.w = nw; f.h = nh;
    /* ═══ v632 — ON NE CASSE PLUS L'ANCRE EN DEPLACANT ═══
       v609 retirait l'ancre au moindre mouvement : un simple glissement (ou
       un clic qui « bouge de 1 px ») rendait le cadre definitivement solidaire
       des PIXELS, donc il se Decalait au redemarrage suivant — c'est le bug
       rapporte. Desormais :
         · DEPLACEMENT  -> l'ancre est CONSERVEE ; le decalage voulu par
           l'utilisateur est memorise dans ancre.dx/dy et reapplique (le cadre
           reste « decale » mais suit son texte) ;
         · REDIMENSIONNEMENT -> l'ancre est retiree (geometrie texte inadaptee),
           la boite devient libre — comportement voulu, et desormais le SEUL. */
    if (aBouge) {
      if (f.ancre) {
        const dResize = (Math.abs(nw - o.w) > 1 || Math.abs(nh - o.h) > 1);
        if (dResize) delete f.ancre;
        else {
          f.ancre.dx = Math.round((f.ancre.dx || 0) + (nx - o.l));
          f.ancre.dy = Math.round((f.ancre.dy || 0) + (ny - o.t));
        }
      }
    }"""

once(OLD_PERSIST, NEW_PERSIST, "persistFig ancre conservee")

# ─────────────────────────────────────────────────────────────────────────
# 6) appliquer dx/dy au re-ancrage (et resoudre le decalage dans _ancResolve)
# ─────────────────────────────────────────────────────────────────────────
OLD_APPLY_RECT = """            if (sol && sol.r) {
              const rr = sol.r;
              const nx = rr.x - 8, ny = rr.y - 6;"""
NEW_APPLY_RECT = """            if (sol && sol.r) {
              const rr = sol.r;
              /* v632 — decalage manuel meme si le texte a bouge. */
              const _dx = (f.ancre && typeof f.ancre.dx === 'number') ? f.ancre.dx : 0;
              const _dy = (f.ancre && typeof f.ancre.dy === 'number') ? f.ancre.dy : 0;
              const nx = rr.x - 8 + _dx, ny = rr.y - 6 + _dy;"""
once(OLD_APPLY_RECT, NEW_APPLY_RECT, "decalage manuel applique")

assert "\r" not in s, "CR isole apres travail"
s = s.replace("\n", "\r\n")          # CRLF OBLIGATOIRE (remplacement LITTERAL)
io.open(P, "w", encoding="utf-8", newline="").write(s)
print("OK — v632 applique (%d -> %d octets)" % (len(orig), len(s)))
