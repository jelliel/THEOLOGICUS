/* v585 — régénère le module atlas DANS THEOLOGICUS.html (idempotent) */
const fs = require("fs");
const F = "C:/tmp/theoverify/THEOLOGICUS.html";
const DIR = "C:/tmp/theoverify/.workbuddy-ai/artifacts/_v585/";
let src = fs.readFileSync(F, "utf8");
if (/(?<!\r)\n/.test(src)) { console.error("LF seuls presents — abort"); process.exit(1); }
const tag = "<script id=\"v585-atlas\">";
const d = src.indexOf(tag);
if (d === -1) { console.error("module atlas absent — abort"); process.exit(1); }
const f = src.indexOf("</scr" + "ipt>", d);
const contenu = fs.readFileSync(DIR + "atlas_gen.js", "utf8")
  .replace(/(?<!\r)\n/g, "\r\n").trim();
src = src.slice(0, d + tag.length) + "\r\n" + contenu + "\r\n" + src.slice(f);
if (/(?<!\r)\n/.test(src)) { console.error("LF seuls INTRODUITS — abort"); process.exit(1); }
fs.writeFileSync(F, src, "utf8");
console.log("module atlas regenere — taille fichier : " + src.length);
