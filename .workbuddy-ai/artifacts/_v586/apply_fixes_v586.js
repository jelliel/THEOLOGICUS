/* v586bis — correctifs reveles par le banc :
   a) atlasSvg(cle) : cle inconnue (pet importe) → chaine vide, jamais de crash
   b) assureAtlas : cle ni illustree ni vectorielle → ne rien poser (retente plus tard)
   c) message WebP plus clair quand le decodage rend 0x0 */
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

/* a) atlasSvg : cle inconnue → vide (les pets importes n ont pas de vectoriel) */
remplacer("  function atlasSvg(cle) {\r\n    var def = MASC[cle];\r\n    def.cle = cle;",
          "  function atlasSvg(cle) {\r\n    var def = MASC[cle];\r\n    if (!def) return \"\";\r\n    def.cle = cle;",
          "atlasSvg : cle inconnue sans crash");

/* b) assureAtlas : rien a poser si la cle n est ni illustree ni maison */
remplacer("    var illustre = window.__v585Atlas && window.__v585Atlas[cle] && window.__v585Frames && window.__v585Frames[cle] && window.__v585Frames[cle].idle >= 2;",
          "    var illustre = window.__v585Atlas && window.__v585Atlas[cle] && window.__v585Frames && window.__v585Frames[cle] && window.__v585Frames[cle].idle >= 2;\r\n    if (!illustre && !MASC[cle]) return;   /* atlas importe pas encore charge : on retentera */",
          "assureAtlas : attente si atlas pas pret");

/* c) message WebP : distinguer dimensions illisibles et non conformes */
remplacer("    if (bmp.width !== 1536 || bmp.height !== attenduH) {\r\n      try { bmp.close(); } catch (e2) {}\r\n      throw new Error(\"WebP : dimensions attendues 1536x\" + attenduH + \" (recu \" + bmp.width + \"x\" + bmp.height + \")\");\r\n    }",
          "    if (bmp.width !== 1536 || bmp.height !== attenduH) {\r\n      var lu = bmp.width + \"x\" + bmp.height;\r\n      try { bmp.close(); } catch (e2) {}\r\n      if (!bmp.width || !bmp.height) throw new Error(\"WebP : dimensions illisibles (\" + lu + \") — attendu 1536x\" + attenduH);\r\n      throw new Error(\"WebP : dimensions attendues 1536x\" + attenduH + \" (recu \" + lu + \")\");\r\n    }",
          "message WebP precis");

if (/(?<!\r)\n/.test(src)) { console.error("LF seuls INTRODUITS — abort"); process.exit(1); }
fs.writeFileSync(F, src, "utf8");
const d = src.indexOf("<script id=\"v584-pets\">") + "<script id=\"v584-pets\">".length;
const f = src.indexOf("</scr" + "ipt>", d);
fs.writeFileSync("C:/tmp/theoverify/.workbuddy-ai/artifacts/_v586/module_extrait_584bis.js", src.slice(d, f), "utf8");
const d2 = src.indexOf("<script id=\"v586-pets-import\">") + "<script id=\"v586-pets-import\">".length;
const f2 = src.indexOf("</scr" + "ipt>", d2);
fs.writeFileSync("C:/tmp/theoverify/.workbuddy-ai/artifacts/_v586/module_extrait_586bis.js", src.slice(d2, f2), "utf8");
console.log("CORRECTIFS v586bis (" + LOG.length + ") :");
LOG.forEach(l => console.log("  ok " + l));
