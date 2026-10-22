# -*- coding: utf-8 -*-
"""v632e — L'ESPACE D'OFFSETS DES ENCADRES EXCLUT TOUT CE QUI EST INJECTE
APRES COUP DANS LE MESSAGE.

Cause racine trouvee au banc (reproduite, pas supposee) : un module d'illustration
INSERE une fiche Wikipedia (`.theo-fig`, avec titre, extrait de 170 caracteres et
« Article Wikipédia → ») DANS `.message-content`, GENERALEMENT AVANT le passage
etudie, et seulement APRES le premier rendu (fetch reseau). Le texte concatene du
message passe alors de 439 a ~700 caracteres, donc :
  - tout offset memorise (surlignage, marque, ancre d'encadre) designe un AUTRE
    endroit — c'est exactement le « mes encadrements ont change de place » ;
  - `Range.toString()` (utilise pour CAPTURER l'offset) et la walker des encadres
    ne voient pas le meme texte, donc la capture et la restitution divergent.

Correctif : `noeudsTexteVisibles` exclut desormais les BLOCS INJECTES connus
(`.atc-figbox`, `.theo-fig`, `.theo-src-chips`, `.msv2-*`) : l'espace d'offsets
devient « le texte de l'auteur », stable quel que soit l'etat des illustrations.
Et la CAPTURE utilise ce meme espace (`Range` borne par offsets, pas
`Range.toString()`), donc capture et restitution sont symetriques.

En complement, les marques/surlignages v628+ passent aussi par l'espace filtre :
un texte injecte ne peut plus deplacer un surlignage."""
import io
P = r"C:\tmp\theoverify\THEOLOGICUS.html"
s = io.open(P, "r", encoding="utf-8", newline="").read()
assert s.count("\r\n") == s.count("\n")
s = s.replace("\r\n", "\n")

def once(old, new, label):
    global s
    n = s.count(old)
    assert n == 1, "ANCRE NON UNIQUE (%d) : %s" % (n, label)
    s = s.replace(old, new, 1)

# ── 1) noeudsTexteVisibles : exclusion par CLASSE injectee, pas par un seul cas
OLD = """  function noeudsTexteVisibles(box){
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        const pp = n.parentElement;
        if (pp && pp.closest && pp.closest('.atc-figbox')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = []; let n;
    while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
  }"""

NEW = """  /* ═══ v632e — ESPACE D'OFFSETS CANONIQUE ═══
     On EXCLUT toute la « chrome » injectee par l'app dans le message :
       · `.atc-figbox`      — les encadres eux-memes (libelle, badge) ;
       · `.theo-fig`        — les fiches Wikipedia ajoutees APRES le rendu
                              (titre + extrait + lien : plusieurs centaines de
                              caracteres inseres AVANT le passage etudie !) ;
       · `.theo-src-chips`  — les puces de sources cliquables ;
       · `[data-no-anchor]` — marqueur generique pour tout futur ajout.
     Sans cela, chaque fiche ajoutee DECALE d'autant tous les offsets
     memorises : c'etait la cause du deplacement des encadrements au
     redemarrage (mesure : 439 -> ~700 caracteres apres un seul fetch). */
  var _ANC_EXCLUS = '.atc-figbox, .theo-fig, .theo-src-chips, [data-no-anchor]';
  function noeudsTexteVisibles(box){
    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        const pp = n.parentElement;
        if (pp && pp.closest && pp.closest(_ANC_EXCLUS)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = []; let n;
    while ((n = walker.nextNode())) nodes.push(n);
    return nodes;
  }"""

once(OLD, NEW, "noeudsTexteVisibles exclusions")

# ── 2) CAPTURE symetrique : l'offset se calcule dans l'espace canonique, meme
#    si le Range vient d'une selection qui traverse une fiche injectee.
OLD2 = """  function computeOffsetInBoxFiltre(box, range){
    const nodes = noeudsTexteVisibles(box);
    let acc = 0, start = null, end = null;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n === range.startContainer) start = acc + range.startOffset;
      if (n === range.endContainer) end = acc + range.endOffset;
      acc += n.nodeValue.length;
    }
    if (start === null || end === null || end <= start) return null;
    return { start: start, end: end };
  }"""

NEW2 = """  function computeOffsetInBoxFiltre(box, range){
    const nodes = noeudsTexteVisibles(box);
    let acc = 0, start = null, end = null;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n === range.startContainer) start = acc + range.startOffset;
      if (n === range.endContainer) end = acc + range.endOffset;
      acc += n.nodeValue.length;
    }
    /* v632e — la selection peut COMMENCER ou FINIR dans un noeud EXCLU (fiche
       Wikipedia, libelle d'encadre). On retombe alors sur les bornes utiles :
       debut -> 0, fin -> longueur totale, au lieu d'abandonner l'ancre. */
    const total = acc;
    if (start === null) start = 0;
    if (end === null) end = total;
    if (end <= start) return null;
    return { start: start, end: end };
  }"""

once(OLD2, NEW2, "computeOffsetInBoxFiltre bornes")

# ── 3) Surlignages/marques : utiliser le MEME espace (sinon une fiche inseree
#    decale leurs offsets et le gardien d'alignement les re-ancre "au hasard").
OLD3 = """   function wrapByOffset(container, start, end, hlId, cls){
     if (typeof start !== 'number' || typeof end !== 'number' || end <= start) return false;
     const a = locateInBox(container, start, false);
     const b = locateInBox(container, end, true);
     return extractWrap(container, a, b, hlId, cls);
   }"""

NEW3 = """   function wrapByOffset(container, start, end, hlId, cls){
     if (typeof start !== 'number' || typeof end !== 'number' || end <= start) return false;
     const a = locateInBox(container, start, false);
     const b = locateInBox(container, end, true);
     return extractWrap(container, a, b, hlId, cls);
   }
   /* v632e — l'offset d'un surlignage est memorise dans l'espace CANONIQUE
      (sans les blocs injectes). Pour le re-coller il faut donc resoudre dans ce
      meme espace, sinon l'insertion d'une fiche Wikipedia decale le span. */
   function wrapByOffsetCanon(container, start, end, hlId, cls){
     if (typeof start !== 'number' || typeof end !== 'number' || end <= start) return false;
     if (typeof noeudsTexteVisibles !== 'function' || typeof locateInBoxFiltre !== 'function') {
       return wrapByOffset(container, start, end, hlId, cls);
     }
     const a = locateInBoxFiltre(container, start, false);
     const b = locateInBoxFiltre(container, end, true);
     if (!a || !b) return false;
     return extractWrap(container, a, b, hlId, cls);
   }"""

once(OLD3, NEW3, "wrapByOffsetCanon")

# ── 4) applyHighlights : passer par l'espace canonique
OLD4 = """        if (!ok && typeof a.start === 'number' && typeof a.end === 'number') {
          ok = wrapByOffset(box, a.start, a.end, a.id, 'atc-hl');"""
NEW4 = """        if (!ok && typeof a.start === 'number' && typeof a.end === 'number') {
          ok = wrapByOffsetCanon(box, a.start, a.end, a.id, 'atc-hl');"""
once(OLD4, NEW4, "applyHighlights canonique")

# ── 5) applyMarks : idem
OLD5 = """        if (typeof mk.start === 'number' && typeof mk.end === 'number') {
          ok = wrapByOffset(box, mk.start, mk.end, mk.id, 'atc-mark');"""
NEW5 = """        if (typeof mk.start === 'number' && typeof mk.end === 'number') {
          ok = wrapByOffsetCanon(box, mk.start, mk.end, mk.id, 'atc-mark');"""
once(OLD5, NEW5, "applyMarks canonique")

assert "\r" not in s
s = s.replace("\n", "\r\n")
io.open(P, "w", encoding="utf-8", newline="").write(s)
print("OK v632e espace canonique")
