
/* v590 — VÉRIFICATION DE FIDÉLITÉ DES CITATIONS (tranche 1 : le comparateur).
   Constat VÉRIFIÉ : initVerifyMarks() (l.27539) marque déjà les références
   bibliques/coraniques ✅/⚠️/✏️ — mais à partir des SEULS NUMÉROS du verset
   (window.__bibleVerseCounts). Le ✅ porte donc sur la RÉFÉRENCE, jamais sur
   le TEXTE CITÉ : une réponse peut écrire « Jn 3,16 : "Dieu a tant aimé le
   monde qu'il a donné son Fils unique" » et obtenir ✅ avec un texte ALTÉRÉ.
   Ce module fournit le comparateur manquant : (texte cité, texte réel) →
   verdict. ADDITIF et PUR : aucun DOM, aucun réseau, aucun minuteur.
   Comparaison PAR MOTS (sous-séquence commune) et non par caractères : sur un
   verset long, une similarité de caractères à 99 % laisserait passer un mot
   substitué — c'est précisément ce qu'on veut attraper. */
(function () {
  "use strict";
  if (window.__v590Citations) return;

  /* conforme = TOUS les mots cités sont dans le verset, dans l'ordre.
     approximatif = la citation reste proche mais un mot diverge.
     divergent = ce n'est pas une citation de ce texte (paraphrase incluse).
     Seuils calibrés par le banc _v590 ; toute modification doit passer par lui. */
  var SEUILS = { approximatif: 0.8 };
  var MIN_JETONS = 3;      /* en deçà, « conforme » ne prouverait rien */
  var MAX_CAR = 2000;      /* au-delà, ce n'est plus un verset : on ne compare pas */

  /* Normalisation PARTAGÉE : les deux textes passent par la MÊME fonction.
     Sans elle, les variantes typographiques légitimes (« » vs " ", ’ vs ',
     accents, majuscules) produiraient des « divergents » qui n'en sont pas. */
  function normaliser(s) {
    if (s == null) return "";
    var t = String(s);
    try { t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); } catch (e) {}
    t = t.toLowerCase().replace(/[^a-z0-9]+/g, " ");
    return t.replace(/\s+/g, " ").trim();
  }
  function R3(n) { return Math.round(n * 1000) / 1000; }

  /* Longueur de la plus longue sous-séquence commune, à deux lignes de mémoire. */
  function sousSequence(a, b) {
    var n = a.length, m = b.length, i, j, prev, cur, tmp;
    if (!n || !m) return 0;
    prev = new Array(m + 1);
    cur = new Array(m + 1);
    for (j = 0; j <= m; j++) prev[j] = 0;
    for (i = 1; i <= n; i++) {
      cur[0] = 0;
      for (j = 1; j <= m; j++) {
        cur[j] = (a[i - 1] === b[j - 1]) ? (prev[j - 1] + 1) : Math.max(prev[j], cur[j - 1]);
      }
      tmp = prev; prev = cur; cur = tmp;
    }
    return prev[m];
  }

  /* comparer(texte cité, texte réel du corpus) → {verdict, score, partiel?}
     La comparaison porte sur la FORME. Une reformulation qui conserve le sens
     mais change les mots ressort en « divergent » : c'est voulu (ce n'est pas
     une citation). La fidélité SÉMANTIQUE n'est pas de notre ressort. */
  function comparer(cite, reel) {
    var c = normaliser(cite), r = normaliser(reel);
    if (!c || !r) return { verdict: "indetermine", score: 0, motif: "entree-vide" };
    if (c.length > MAX_CAR || r.length > MAX_CAR) return { verdict: "indetermine", score: 0, motif: "trop-long" };
    if (c === r) return { verdict: "conforme", score: 1, partiel: false };
    var A = c.split(" "), B = r.split(" ");
    if (A.length < MIN_JETONS) return { verdict: "indetermine", score: 0, motif: "trop-court" };
    var couv = sousSequence(A, B) / A.length;
    if (couv === 1) return { verdict: "conforme", score: 1, partiel: (A.length < B.length) };
    if (couv >= SEUILS.approximatif) return { verdict: "approximatif", score: R3(couv), partiel: false };
    return { verdict: "divergent", score: R3(couv), partiel: false };
  }

  window.__v590Citations = {
    comparer: comparer,
    normaliser: normaliser,
    SEUILS: SEUILS,
    MIN_JETONS: MIN_JETONS,
    MAX_CAR: MAX_CAR
  };
})();
