/* v586ter — (a) duree de secours par etat (la geometrie importee n en a pas) ;
   (b) chargement des compagnons importes RETENTE au demarrage (la base peut
   ne pas etre prete quand le module s execute). */
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

/* a) duree de l animation : celle de la geometrie, sinon celle du moteur */
remplacer("      if (clePet) s += \"#v584-pet[data-pet=\\\"\" + clePet + \"\\\"][data-anim=\\\"\" + cleEtat + \"\\\"] .v584-bob{animation:\" + nomkf + \" \" + e.dur + \"s steps(1,end) infinite;}\";",
          "      var dur = e.dur || (ETATS[cleEtat] && ETATS[cleEtat].dur) || 1.5;\r\n      if (clePet) s += \"#v584-pet[data-pet=\\\"\" + clePet + \"\\\"][data-anim=\\\"\" + cleEtat + \"\\\"] .v584-bob{animation:\" + nomkf + \" \" + dur + \"s steps(1,end) infinite;}\";",
          "duree de secours par etat");

/* b) chargement retente (la base n est pas forcement prete au boot) */
remplacer("  chargerImportes().then(function (n) { if (n) majSelecteur(); });",
          "  var essaisCharge = 0;\r\n  var ivCharge = setInterval(function () {\r\n    essaisCharge++;\r\n    chargerImportes().then(function (n) {\r\n      if (n > 0) {\r\n        majSelecteur();\r\n        try { if (window.__v584Pets) window.__v584Pets.appliquer(); } catch (e) {}\r\n        clearInterval(ivCharge);\r\n      } else if (essaisCharge > 40) {\r\n        clearInterval(ivCharge);\r\n      }\r\n    });\r\n  }, 700);",
          "chargement retente au demarrage");

if (/(?<!\r)\n/.test(src)) { console.error("LF seuls INTRODUITS — abort"); process.exit(1); }
fs.writeFileSync(F, src, "utf8");
const d = src.indexOf("<script id=\"v586-pets-import\">") + "<script id=\"v586-pets-import\">".length;
const f = src.indexOf("</scr" + "ipt>", d);
fs.writeFileSync("C:/tmp/theoverify/.workbuddy-ai/artifacts/_v586/module_extrait_586ter.js", src.slice(d, f), "utf8");
const d2 = src.indexOf("<script id=\"v584-pets\">") + "<script id=\"v584-pets\">".length;
const f2 = src.indexOf("</scr" + "ipt>", d2);
fs.writeFileSync("C:/tmp/theoverify/.workbuddy-ai/artifacts/_v586/module_extrait_584ter.js", src.slice(d2, f2), "utf8");
console.log("CORRECTIFS v586ter (" + LOG.length + ") :");
LOG.forEach(l => console.log("  ok " + l));
