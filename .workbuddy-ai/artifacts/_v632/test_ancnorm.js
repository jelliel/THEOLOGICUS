// Vérifie _ancNorm/_ancOccurrences en isolation, sur le texte réel du banc.
const fs = require("fs"), vm = require("vm");
const src = fs.readFileSync(process.argv[2] || "THEOLOGICUS.html", "utf8");
const i = src.indexOf("function _ancNorm");
const j = src.indexOf("function _ancResolve");
if (i < 0 || j < 0) { console.log("helpers absents"); process.exit(1); }
const code = src.slice(i, j) + "\nthis.N=_ancNorm; this.OC=_ancOccurrences;";
const ctx = {};
vm.createContext(ctx);
// noeudsTexteVisibles n'existe pas hors page : on stubbe un faux conteneur.
ctx.noeudsTexteVisibles = () => ctx.__nodes;
vm.runInContext(code, ctx);

const TEXTE = `Le titre **Kurios** est central. Paul de Tarse utilise Kurios pour designer Jesus comme Seigneur.
Le mot Seigneur revient souvent : c'est le Seigneur des Seigneurs.
Enfin, « personne ne peut dire Jesus est Seigneur si ce n'est par l'Esprit ».`;
// le texte du DOM réel (markdown rendu sans balises) :
const DOM = TEXTE.replace(/\*\*/g, "");
const n = ctx.N(DOM);
console.log("len NF", DOM.length, "len norm", n.norm.length);
console.log("index de 's' dans norm :", n.norm.indexOf("seigneurdes"), "-> offset source", n.map[n.norm.indexOf("seigneurdes")]);
// là où JS trouve 'Seigneur des' en indexOf brut :
console.log("indexOf brut 'Seigneur des' =", DOM.indexOf("Seigneur des"));
const nodes = [{ nodeValue: DOM }];
ctx.__nodes = nodes;
console.log("occurrences =", JSON.stringify(ctx.OC({}, "Seigneur des")));
