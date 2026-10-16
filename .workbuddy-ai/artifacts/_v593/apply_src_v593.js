/* v593 — T4 : vérification des références à la SOMME (corpus français Drioux).
   Modifie la source du module v591 (src_v591.txt) : ajout de `texteSumma`,
   `marquerSumma`, du verdict « deplace », et de l'appel depuis `marquerBloc`.
   Remplacement par ancres uniques vérifiées, via FONCTION (jamais "$"). */
const fs = require("fs"), path = require("path");
const F = path.join(__dirname, "..", "_v591", "src_v591.txt");
let s = fs.readFileSync(F, "utf8");

function rempl(ancre, remplacement, etiquette) {
  const n = s.split(ancre).length - 1;
  if (n !== 1) { console.error("ANCRE NON UNIQUE (" + n + ") : " + etiquette); process.exit(1); }
  s = s.replace(ancre, () => remplacement);
  console.log("  ok  " + etiquette);
}

/* 1. verdicts : ajout de « deplace » */
rempl(
  '  var CLASSE = { conforme: "ok", approximatif: "proche", divergent: "ecart" };\n' +
  '  var GLYPHE = { conforme: "\\u2713", approximatif: "\\u2248", divergent: "\\u2260" };\n' +
  '  var TITRE = {\n' +
  '    conforme: "Texte cité CONFORME au corpus local",\n' +
  '    approximatif: "Texte cité PROCHE, mais non identique au corpus local",\n' +
  '    divergent: "Ce texte ne correspond PAS au verset cité"\n' +
  '  };',
  '  var CLASSE = { conforme: "ok", approximatif: "proche", divergent: "ecart", deplace: "deplace" };\n' +
  '  var GLYPHE = { conforme: "\\u2713", approximatif: "\\u2248", divergent: "\\u2260", deplace: "\\u21c4" };\n' +
  '  var TITRE = {\n' +
  '    conforme: "Texte cité CONFORME au corpus local",\n' +
  '    approximatif: "Texte cité PROCHE, mais non identique au corpus local",\n' +
  '    divergent: "Ce texte ne correspond PAS au verset cité",\n' +
  '    deplace: "Texte présent dans la QUESTION, mais pas dans l\'ARTICLE cité"\n' +
  '  };',
  "verdict-deplace"
);

/* 2. couleur du verdict « deplace » (bleu, comme le « gap » de l'appareil) */
rempl(
  '      + ".v591-ecart{color:#f85149}";',
  '      + ".v591-ecart{color:#f85149}"\n' +
  '      + ".v591-deplace{color:#7fb3ff}";',
  "css-deplace"
);

/* 3. texteSumma + marquerSumma, insérés avant demarquer */
rempl(
  '  function demarquer(racine) {',
  [
    '  /* ═══ T4 — la SOMME (traduction Drioux, domaine public, 613 questions) ═══',
    '     Le corpus local est une OCR de 1851 : le texte porte des scories de',
    '     numérisation (« Mar.ière dout Aristolc »). On ne s\'en sert donc que pour',
    '     CONFIRMER, jamais pour accuser — voir marquerSumma. */',
    '  function texteSumma(qid, artN) {',
    '    return new Promise(function (res) {',
    '      if (!window.__ensureSummaFrQuestion) return res(null);',
    '      window.__ensureSummaFrQuestion(String(qid)).then(function (ok) {',
    '        if (!ok) return res(null);',
    '        var q = (window.__summaFrQuestions || {})[String(qid)];',
    '        if (!q || !q.articles) return res(null);',
    '        var arts = q.articles;',
    '        var txt = function (liste) {',
    '          var out = [];',
    '          liste.forEach(function (a) {',
    '            (a.paragraphs || []).forEach(function (p) { out.push(String(p.text || "")); });',
    '          });',
    '          return out.join(" ");',
    '        };',
    '        var art = artN ? arts.filter(function (a) { return a.n === artN; })[0] : null;',
    '        res({ lang: q.lang || "fr", titre: q.title || "",',
    '              article: art ? txt([art]) : null, question: txt(arts) });',
    '      }, function () { res(null); });',
    '    });',
    '  }',
    '',
    '  /* Règle, et elle est PROUVABLE : on ne marque QUE ce qu\'on a trouvé.',
    '     ✓  le texte est dans l\'ARTICLE cité ;',
    '     ⇄  le texte est dans la QUESTION mais pas dans l\'article cité (mauvaise',
    '        attribution — un vrai signal, et lui aussi vérifiable) ;',
    '     rien  introuvable : AUCUNE marque. Le corpus est une OCR de 1851 ; une',
    '        différence peut venir de la traduction ou de la numérisation, pas',
    '        d\'une erreur du modèle. Accuser à tort une citation magistérielle',
    '        serait pire que se taire. */',
    '  function marquerSumma(racine) {',
    '    var r = racine || document;',
    '    var refs = r.querySelectorAll("a[data-summa]");',
    '    if (!refs.length) return Promise.resolve(0);',
    '    var taches = [];',
    '    Array.prototype.forEach.call(refs, function (el) {',
    '      if (el.getAttribute("data-v591") === "1") return;',
    '      var c = C.citationAssociee(el);',
    '      if (!c) { el.setAttribute("data-v591", "1"); return; }',
    '      var qid = el.getAttribute("data-summa");',
    '      var artN = parseInt(el.getAttribute("data-summa-a"), 10) || null;',
    '      el.setAttribute("data-v591", "1");',
    '      taches.push(texteSumma(qid, artN).then(function (res) {',
    '        if (!res) return;',
    '        var v = null;',
    '        if (res.article) {',
    '          var va = C.comparer(c.cite, res.article);',
    '          if (va.verdict === "conforme" || va.verdict === "approximatif") v = va;',
    '          else {',
    '            var vq = C.comparer(c.cite, res.question);',
    '            if (vq.verdict === "conforme" || vq.verdict === "approximatif") {',
    '              v = { verdict: "deplace", score: vq.score, partiel: vq.partiel };',
    '            }',
    '          }',
    '        } else {',
    '          var vq2 = C.comparer(c.cite, res.question);',
    '          if (vq2.verdict === "conforme" || vq2.verdict === "approximatif") v = vq2;',
    '        }',
    '        if (!v) return;                       /* introuvable → silence assumé */',
    '        if (modeVerif() === "souple" && v.verdict === "conforme") return;',
    '        assurerStyle();',
    '        poserMarque(c, v);',
    '      }));',
    '    });',
    '    return Promise.all(taches);',
    '  }',
    '',
    '  function demarquer(racine) {'
  ].join("\n"),
  "texteSumma+marquerSumma"
);

/* 4. appel depuis marquerBloc (dans le try, avant le catch) */
rempl(
  '    } catch (e) { /* jamais bloquant : le marquage est un ornement */ }',
  '      try { marquerSumma(r); } catch (e2) {}\n' +
  '    } catch (e) { /* jamais bloquant : le marquage est un ornement */ }',
  "appel-marquerSumma"
);

/* 5. API publique */
rempl(
  '    marquerBloc: marquerBloc,\n    demarquer: demarquer,\n    texteVerset: texteVerset,',
  '    marquerBloc: marquerBloc,\n    marquerSumma: marquerSumma,\n    demarquer: demarquer,\n    texteVerset: texteVerset,\n    texteSumma: texteSumma,',
  "api"
);

fs.writeFileSync(F, s, "utf8");
console.log("src_v591.txt mis a jour");
