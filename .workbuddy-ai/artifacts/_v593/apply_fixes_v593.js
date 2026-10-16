/* v593 (suite, corrigé) — la Somme exige la PRÉSENCE CONTIGUË et respecte le
   mode « off ». Version REPRISE : la précédente avait une entrée de tableau
   non concaténée, qui produisait du code invalide.
   Chaque remplacement est ici une chaîne UNIQUE construite explicitement. */
const fs = require("fs"), path = require("path");
const F = path.join(__dirname, "..", "_v591", "src_v591.txt");
let s = fs.readFileSync(F, "utf8");

function rempl(ancre, remplacement, etiquette) {
  const n = s.split(ancre).length - 1;
  if (n !== 1) { console.error("ANCRE NON UNIQUE (" + n + ") : " + etiquette); process.exit(1); }
  s = s.replace(ancre, () => remplacement);
  console.log("  ok  " + etiquette);
}

const ANCIEN = [
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
  '        if (modeVerif() === "souple" && v.verdict === "conforme") return;'
].join("\n");

const NOUVEAU = [
  '        /* On exige la PRÉSENCE CONTIGUË, pas une couverture de vocabulaire :',
  '           sur un texte long, `comparer` donnait 86 % à une citation d\'un',
  '           AUTRE article de la même question (mesuré par le banc _v593). */',
  '        var v = null;',
  '        if (C.contient(res.article, c.cite)) v = { verdict: "conforme", score: 1 };',
  '        else if (C.contient(res.question, c.cite)) v = { verdict: "deplace", score: 1 };',
  '        if (!v) return;                       /* introuvable → silence assumé */',
  '        var mode = modeVerif();',
  '        if (mode === "off") return;           /* le mode vaut AUSSI pour la Somme */',
  '        if (mode === "souple" && v.verdict === "conforme") return;'
].join("\n");

rempl(ANCIEN, NOUVEAU, "somme-contient+mode-off");

fs.writeFileSync(F, s, "utf8");
console.log("src_v591.txt corrige");
