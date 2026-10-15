/* v585bis — repli progressif : atlas illustre SEULEMENT si le pet a des
   frames d animation reelles (idle >= 2), sinon le vectoriel anime. */
const fs = require("fs");
const F = "C:/tmp/theoverify/THEOLOGICUS.html";
let src = fs.readFileSync(F, "utf8");
if (/(?<!\r)\n/.test(src)) { console.error("LF seuls presents — abort"); process.exit(1); }

const ancre = "    var url = (window.__v585Atlas && window.__v585Atlas[cle])\r\n      ? window.__v585Atlas[cle]\r\n      : (\"data:image/svg+xml;charset=utf-8,\" + encodeURIComponent(atlasSvg(cle)));";
const nouveau = "    var illustre = window.__v585Atlas && window.__v585Atlas[cle] && window.__v585Frames && window.__v585Frames[cle] && window.__v585Frames[cle].idle >= 2;\r\n    var url = illustre\r\n      ? window.__v585Atlas[cle]\r\n      : (\"data:image/svg+xml;charset=utf-8,\" + encodeURIComponent(atlasSvg(cle)));";
const n = src.split(ancre).length - 1;
if (n !== 1) { console.error("ancre trouvee " + n + " fois (attendu 1)"); process.exit(1); }
src = src.replace(ancre, () => nouveau);
if (/(?<!\r)\n/.test(src)) { console.error("LF seuls INTRODUITS — abort"); process.exit(1); }
fs.writeFileSync(F, src, "utf8");
const d = src.indexOf("<script id=\"v584-pets\">") + "<script id=\"v584-pets\">".length;
const f = src.indexOf("</scr" + "ipt>", d);
fs.writeFileSync("C:/tmp/theoverify/.workbuddy-ai/artifacts/_v585/module_extrait_585bis.js", src.slice(d, f), "utf8");
console.log("repli progressif applique — taille : " + src.length);
