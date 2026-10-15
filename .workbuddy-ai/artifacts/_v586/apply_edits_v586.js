/* ═══════════════════════════════════════════════════════════════
   v586 — geometrie PAR PET (les paquets OpenPets importes ont
   8x11 rangees) + insertion du module d import.
   ═══════════════════════════════════════════════════════════════ */
const fs = require("fs");
const F = "C:/tmp/theoverify/THEOLOGICUS.html";
const DIR = "C:/tmp/theoverify/.workbuddy-ai/artifacts/_v586/";
let src = fs.readFileSync(F, "utf8");
if (/(?<!\r)\n/.test(src)) { console.error("LF seuls presents — abort"); process.exit(1); }
if (src.indexOf("v586-pets-import") !== -1) { console.error("v586 deja present — abort"); process.exit(1); }
const LOG = [];
function remplacer(ancre, nouveau, note) {
  const n = src.split(ancre).length - 1;
  if (n !== 1) { console.error("ancre trouvee " + n + " fois (attendu 1) : " + note); process.exit(1); }
  src = src.replace(ancre, () => nouveau);
  LOG.push(note);
}

/* 1. geoDe + nbFrames conscient de la geometrie du pet */
remplacer("  function nbFrames(cle, etat) {\r\n    try {\r\n      var f = window.__v585Frames && window.__v585Frames[cle];\r\n      var n = (f && f[etat]) || 1;\r\n      return Math.max(1, Math.min(n, COLS, ETATS[etat].n));\r\n    } catch (e) { return 1; }\r\n  }",
          "  function geoDe(cle) {\r\n    try {\r\n      var g = cle && window.__v585Geo && window.__v585Geo[cle];\r\n      if (g && g.etats) return g;\r\n    } catch (e) {}\r\n    return { rows: ROWS, etats: ETATS };\r\n  }\r\n  function nbFrames(cle, etat) {\r\n    try {\r\n      var g = geoDe(cle);\r\n      var e2 = g.etats[etat] || { n: 1 };\r\n      var f = window.__v585Frames && window.__v585Frames[cle];\r\n      var n = (f && f[etat]) || 1;\r\n      return Math.max(1, Math.min(n, COLS, e2.n || 1));\r\n    } catch (e) { return 1; }\r\n  }",
          "geoDe + nbFrames par geometrie");

/* 2. cssDynamique : lignes et hauteur d atlas propres au pet */
remplacer("    var s = \"#v584-pet{width:\" + t + \"px;height:\" + hs + \"px;}\";",
          "    var g = geoDe(clePet);\r\n    var ahsPet = R((g.rows || ROWS) * FH * k);\r\n    var s = \"#v584-pet{width:\" + t + \"px;height:\" + hs + \"px;}\";",
          "hauteur d atlas par pet");
remplacer("    s += \"#v584-pet .v584-bob{background-size:\" + aws + \"px \" + ahs + \"px;}\";\r\n    for (cleEtat in ETATS) {\r\n      e = ETATS[cleEtat];",
          "    s += \"#v584-pet .v584-bob{background-size:\" + aws + \"px \" + ahsPet + \"px;}\";\r\n    for (cleEtat in g.etats) {\r\n      e = g.etats[cleEtat];",
          "boucle sur les etats du pet");

/* 3. insertion du module d import APRES le module pets */
const mod = "<script id=\"v586-pets-import\">\r\n" +
  ["1", "2", "3", "4"].map(n => fs.readFileSync(DIR + "_p" + n + ".txt", "utf8").replace(/(?<!\r)\n/g, "\r\n").trim().replace(/^<script id="v586-pets-import">\r\n/, "")).join("\r\n") +
  "\r\n";
const tagPets = "<script id=\"v584-pets\">";
const dPets = src.indexOf(tagPets);
if (dPets === -1) { console.error("module v584-pets introuvable"); process.exit(1); }
const fPets = src.indexOf("</scr" + "ipt>", dPets) + "</scr".length + "ipt>".length;
src = src.slice(0, fPets) + "\r\n" + mod + src.slice(fPets);
LOG.push("module v586-pets-import insere apres v584-pets");

if (/(?<!\r)\n/.test(src)) { console.error("LF seuls INTRODUITS — abort"); process.exit(1); }
fs.writeFileSync(F, src, "utf8");
const d = src.indexOf("<script id=\"v584-pets\">") + "<script id=\"v584-pets\">".length;
const f = src.indexOf("</scr" + "ipt>", d);
fs.writeFileSync(DIR + "module_extrait_584.js", src.slice(d, f), "utf8");
const d2 = src.indexOf("<script id=\"v586-pets-import\">") + "<script id=\"v586-pets-import\">".length;
const f2 = src.indexOf("</scr" + "ipt>", d2);
fs.writeFileSync(DIR + "module_extrait_586.js", src.slice(d2, f2), "utf8");
console.log("PATCH v586 APPLIQUE (" + LOG.length + ") :");
LOG.forEach(l => console.log("  ok " + l));
console.log("Taille : " + src.length);
