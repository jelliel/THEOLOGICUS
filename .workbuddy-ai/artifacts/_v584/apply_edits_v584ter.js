/* v584ter — le flottement passe sur un niveau interne (.v584-float)
   pour ne plus entrer en conflit avec l animation d etat du bob. */
const fs = require("fs");
const F = "C:/tmp/theoverify/THEOLOGICUS.html";
let src = fs.readFileSync(F, "utf8");
if (/(?<!\r)\n/.test(src)) { console.error("LF seuls presents — abort"); process.exit(1); }
const LOG = [];
function remplacer(ancre, nouveau, note) {
  const n = src.split(ancre).length - 1;
  if (n !== 1) { console.error("ancre trouvee " + n + " fois (attendu 1) : " + note); process.exit(1); }
  src = src.replace(ancre, () => nouveau);
  LOG.push(note);
}

/* montrer : le bob (frames) enveloppe un float (flottement) */
remplacer("      var bob = document.createElement(\"div\");\r\n      bob.className = \"v584-bob\";\r\n      host.appendChild(bob);",
          "      var bob = document.createElement(\"div\");\r\n      bob.className = \"v584-bob\";\r\n      host.appendChild(bob);\r\n      var flt = document.createElement(\"div\");\r\n      flt.className = \"v584-float\";\r\n      bob.appendChild(flt);",
          "montrer : .v584-float interne");

/* cssBase : le flottement porte sur .v584-float (plus de conflit d animation) */
remplacer("#v584-pet .v584-bob{width:100%;height:100%;background-repeat:no-repeat;\"\r\n      + \"animation:v584-bob 2.8s ease-in-out infinite alternate}\"",
          "#v584-pet .v584-bob{width:100%;height:100%;background-repeat:no-repeat;}\"\r\n      + \"#v584-pet .v584-float{width:100%;height:100%;\"\r\n      + \"animation:v584-bob 2.8s ease-in-out infinite alternate}\"");
remplacer("@media (prefers-reduced-motion: reduce){#v584-pet .v584-bob{animation:none}}",
          "@media (prefers-reduced-motion: reduce){#v584-pet .v584-float{animation:none}}");

if (/(?<!\r)\n/.test(src)) { console.error("LF seuls INTRODUITS — abort"); process.exit(1); }
fs.writeFileSync(F, src, "utf8");
const tag = '<script id="v584-pets">';
const d = src.indexOf(tag) + tag.length;
const f = src.indexOf("</scr" + "ipt>", d);
fs.writeFileSync("C:/tmp/theoverify/.workbuddy-ai/artifacts/_v584/module_extrait_ter.js", src.slice(d, f), "utf8");
console.log("PATCH TER APPLIQUE (" + LOG.length + ") :");
LOG.forEach(l => console.log("  ok " + l));
