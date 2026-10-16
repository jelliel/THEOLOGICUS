
/* v591 — MARQUAGE DES CITATIONS DANS LE CHAT (tranche 3 du vérificateur v590).
   Objet : rendre VISIBLE le verdict de fidélité sur le TEXTE CITÉ, sans
   toucher à la marque ✅ existante — celle-ci porte sur la RÉFÉRENCE (les
   numéros existent) et le réglage `theologicus_verify` la pilote déjà
   (initVerifyMarks, l.27539). Changer son sens serait un autre mensonge
   silencieux : on AJOUTE une marque distincte, placée sur la citation.

   Trois précautions, toutes dictées par du code VÉRIFIÉ dans l'app :
   1. pendant le streaming, la racine porte `.theo-streaming` (l.12376) : on ne
      touche PAS au DOM du message en cours — on replanifie après le flux ;
   2. le texte d'un livre est chargé À LA DEMANDE (`window.__ensureBibleBook`,
      l.7222) : un livre absent n'est pas une erreur, on le charge puis on
      re-marque ;
   3. la marque est INSÉRÉE après le nœud texte de la citation — jamais un
      découpage de nœud, qui invaliderait les références du moteur de rendu.

   ADDITIF. Le style n'est injecté qu'au PREMIER marquage (le module reste
   inerte au chargement). Tout est sous try/catch : ce module ne peut pas
   casser l'affichage du chat. */
(function () {
  "use strict";
  if (window.__v591CitationsUi) return;
  var C = window.__v590Citations;
  if (!C) return;                      /* sans le moteur, il n'y a rien à marquer */

  var STYLE_ID = "v591-style";
  var CLASSE = { conforme: "ok", approximatif: "proche", divergent: "ecart" };
  var GLYPHE = { conforme: "\u2713", approximatif: "\u2248", divergent: "\u2260" };
  var TITRE = {
    conforme: "Texte cité CONFORME au corpus local",
    approximatif: "Texte cité PROCHE, mais non identique au corpus local",
    divergent: "Ce texte ne correspond PAS au verset cité"
  };

  function modeVerif() {
    try { return localStorage.getItem("theologicus_verify") || "strict"; } catch (e) { return "strict"; }
  }
  function enFlux() {
    try { return document.documentElement.classList.contains("theo-streaming"); } catch (e) { return false; }
  }
  function assurerStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent =
      ".v591-cite{margin-left:3px;font-size:.72em;cursor:help;font-weight:700}"
      + ".v591-ok{color:#56d364}"
      + ".v591-proche{color:#f0a020}"
      + ".v591-ecart{color:#f85149}";
    (document.head || document.documentElement).appendChild(s);
  }

  /* Texte réel du verset (v1..v2 concaténés).
     undefined = LIVRE NON CHARGÉ (on le chargera) ; null = chapitre/verset
     ABSENT du corpus (rien à comparer, on ne marque pas). */
  function texteVerset(p) {
    try {
      var d = window.__bibleBooks;
      if (!d || !p || !d[p.book]) return undefined;
      var ch = d[p.book][p.ch];
      if (!ch) return null;
      var out = [], n = p.v1, fin = p.v2 || p.v1;
      for (; n <= fin; n++) { if (ch[n] === undefined) return null; out.push(ch[n]); }
      return out.length ? out.join(" ") : null;
    } catch (e) { return null; }
  }

  /* Insère la marque après le nœud texte qui PORTE la citation. */
  function poserMarque(c, v) {
    if (!c.noeud || !c.noeud.parentNode) return false;
    var s = document.createElement("span");
    s.className = "v591-cite v591-" + (CLASSE[v.verdict] || "proche");
    s.textContent = GLYPHE[v.verdict] || "\u2248";
    s.title = (TITRE[v.verdict] || "Vérification du texte cité")
      + " — " + Math.round((v.score || 0) * 100) + " % de correspondance."
      + (v.partiel ? " (citation partielle)" : "");
    c.noeud.parentNode.insertBefore(s, c.noeud.nextSibling);
    return true;
  }

  function demarquer(racine) {
    var r = racine || document;
    try {
      Array.prototype.forEach.call(r.querySelectorAll(".v591-cite"), function (s) {
        if (s.parentNode) s.parentNode.removeChild(s);
      });
      Array.prototype.forEach.call(r.querySelectorAll("[data-v591]"), function (el) {
        el.removeAttribute("data-v591");
      });
    } catch (e) {}
  }

  var reprisePrevue = false;
  function marquerBloc(racine) {
    var r = racine || document;
    var n = 0;
    try {
      var mode = modeVerif();
      if (mode === "off") return 0;
      if (enFlux()) {
        /* le message en cours de flux n'est jamais touché : on repasse après */
        if (!reprisePrevue) {
          reprisePrevue = true;
          setTimeout(function () { reprisePrevue = false; marquerBloc(r); }, 1200);
        }
        return 0;
      }
      var liste = C.citationsDuBloc(r);
      if (!liste.length) return 0;
      var aCharger = {}, besoin = false;
      for (var i = 0; i < liste.length; i++) {
        var c = liste[i];
        if (!c.el || c.el.getAttribute("data-v591") === "1") continue;
        if (!c.parse) continue;
        var reel = texteVerset(c.parse);
        if (reel === undefined) {           /* livre non chargé */
          if (window.__ensureBibleBook) { aCharger[c.parse.book] = true; besoin = true; }
          continue;
        }
        if (reel === null) { c.el.setAttribute("data-v591", "1"); continue; }  /* rien à comparer */
        var v = C.comparer(c.cite, reel);
        if (v.verdict === "indetermine") { c.el.setAttribute("data-v591", "1"); continue; }
        c.el.setAttribute("data-v591", "1");
        if (mode === "souple" && v.verdict === "conforme") continue;   /* souple = problèmes seuls */
        assurerStyle();
        if (poserMarque(c, v)) n++;
      }
      if (besoin) {
        var attentes = [];
        for (var b in aCharger) {
          if (!Object.prototype.hasOwnProperty.call(aCharger, b)) continue;
          try { attentes.push(window.__ensureBibleBook(b)); } catch (e) {}
        }
        if (attentes.length) {
          Promise.all(attentes).then(function () { marquerBloc(r); }, function () {});
        }
      }
    } catch (e) { /* jamais bloquant : le marquage est un ornement */ }
    return n;
  }

  /* Ré-affirmé à chaque rendu du chat, comme l'appareil existant. */
  var chat = document.getElementById("chat-container");
  if (chat) {
    var to = null;
    try {
      new MutationObserver(function () {
        if (to) clearTimeout(to);
        to = setTimeout(function () { marquerBloc(chat); }, 350);
      }).observe(chat, { childList: true, subtree: true });
    } catch (e) {}
  }
  window.addEventListener("theologicus-verify-mode-changed", function () {
    demarquer(document);
    marquerBloc(document);
  });
  /* le corpus biblique peut arriver après coup */
  try {
    if (typeof window.__corpusHook === "function") {
      window.__corpusHook("bible", function () { marquerBloc(chat || document); });
    }
  } catch (e) {}

  window.__v591CitationsUi = {
    marquerBloc: marquerBloc,
    demarquer: demarquer,
    texteVerset: texteVerset,
    modeVerif: modeVerif,
    enFlux: enFlux
  };
})();
