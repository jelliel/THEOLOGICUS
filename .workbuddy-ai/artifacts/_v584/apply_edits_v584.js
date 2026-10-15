/* v584 — assembleur : concatene les 7 parties et insere le module
   devant le DERNIER </body> (methode slice, jamais replace). */
const fs = require("fs");
const DIR = "C:/tmp/theoverify/.workbuddy-ai/artifacts/_v584/";
const F = "C:/tmp/theoverify/THEOLOGICUS.html";

let src = fs.readFileSync(F, "utf8");
if (/(?<!\r)\n/.test(src)) { console.error("LF seuls presents — abort"); process.exit(1); }
if (src.indexOf("v584-pets") !== -1) { console.error("v584 deja present — abort"); process.exit(1); }

const PARTIES = ["1", "2a", "2b", "2c", "2d", "2e", "3", "4", "5", "6", "7"];
let MOD = "";
for (const n of PARTIES) {
  const p = DIR + "_part" + n + ".txt";
  if (!fs.existsSync(p)) { console.error("manque " + p); process.exit(1); }
  MOD += fs.readFileSync(p, "utf8") + "\r\n";
}

const avant = src.length;
const idx = src.lastIndexOf("</body>");
if (idx === -1) { console.error("</body> introuvable"); process.exit(1); }
src = src.slice(0, idx) + MOD + src.slice(idx);

if (/(?<!\r)\n/.test(src)) { console.error("LF seuls INTRODUITS — abort (aucune ecriture)"); process.exit(1); }
if (src.length <= avant) { console.error("module vide — abort"); process.exit(1); }
fs.writeFileSync(F, src, "utf8");

/* extraction pour verification syntaxique (faite ensuite en Bash) */
const tag = '<script id="v584-pets">';
const d = src.indexOf(tag) + tag.length;
const f = src.indexOf("</scr" + "ipt>", d);
fs.writeFileSync(DIR + "module_extrait.js", src.slice(d, f), "utf8");
console.log("MODULE INSERE — " + avant + " -> " + src.length + " (+" + (src.length - avant) + ")");
