/* ═══════════════════════════════════════════════════════════════
   v585 — le moteur pets consomme les atlas ILLUSTRES (WebP).
   Patch du module v584-pets, insertion du module d atlas.
   Méthode slice (jamais replace), ancres uniques vérifiées.
   ═══════════════════════════════════════════════════════════════ */
const fs = require("fs");
const F = "C:/tmp/theoverify/THEOLOGICUS.html";
const DIR = "C:/tmp/theoverify/.workbuddy-ai/artifacts/_v585/";
let src = fs.readFileSync(F, "utf8");
if (/(?<!\r)\n/.test(src)) { console.error("LF seuls presents — abort"); process.exit(1); }
if (src.indexOf("v585-atlas") !== -1) { console.error("v585 deja present — abort"); process.exit(1); }
const LOG = [];
function remplacer(ancre, nouveau, note) {
  const n = src.split(ancre).length - 1;
  if (n !== 1) { console.error("ancre trouvee " + n + " fois (attendu 1) : " + note); process.exit(1); }
  src = src.replace(ancre, () => nouveau);
  LOG.push(note);
}

/* 1. géométrie : atlas 8 colonnes x 4 rangées (idle/thinking/happy/wave) */
remplacer("  var FW = 192, FH = 208, COLS = 8, ROWS = 11;\r\n  var AW = COLS * FW, AH = ROWS * FH;\r\n  var ETATS = {\r\n    idle: { row: 0, n: 6, dur: 1.8 },\r\n    wave: { row: 3, n: 4, dur: 1.15 },\r\n    happy: { row: 4, n: 5, dur: 1.25 },\r\n    thinking: { row: 8, n: 6, dur: 1.5 }\r\n  };",
          "  var FW = 256, FH = 278, COLS = 8, ROWS = 4;\r\n  var AW = COLS * FW, AH = ROWS * FH;\r\n  var ETATS = {\r\n    idle: { row: 0, n: 6, dur: 1.9 },\r\n    thinking: { row: 1, n: 4, dur: 1.4 },\r\n    happy: { row: 2, n: 5, dur: 1.2 },\r\n    wave: { row: 3, n: 4, dur: 1.15 }\r\n  };\r\n  function nbFrames(cle, etat) {\r\n    try {\r\n      var f = window.__v585Frames && window.__v585Frames[cle];\r\n      var n = (f && f[etat]) || 1;\r\n      return Math.max(1, Math.min(n, COLS, ETATS[etat].n));\r\n    } catch (e) { return 1; }\r\n  }",
          "geometrie 8x4 + nbFrames");

/* 2. assureAtlas : l image illustree est prioritaire, SVG vectoriel en repli */
remplacer("  function assureAtlas(cle) {\r\n    if (atlasFaits[cle]) return;\r\n    var url = \"data:image/svg+xml;charset=utf-8,\" + encodeURIComponent(atlasSvg(cle));\r\n    regleCss(\"#v584-pet[data-pet=\\\"\" + cle + \"\\\"] .v584-bob\", \"background-image:url(\\\"\" + url + \"\\\")\");\r\n    atlasFaits[cle] = true;\r\n  }",
          "  function assureAtlas(cle) {\r\n    if (atlasFaits[cle]) return;\r\n    var url = (window.__v585Atlas && window.__v585Atlas[cle])\r\n      ? window.__v585Atlas[cle]\r\n      : (\"data:image/svg+xml;charset=utf-8,\" + encodeURIComponent(atlasSvg(cle)));\r\n    regleCss(\"#v584-pet[data-pet=\\\"\" + cle + \"\\\"] .v584-bob\", \"background-image:url(\\\"\" + url + \"\\\")\");\r\n    atlasFaits[cle] = true;\r\n  }",
          "atlas image prioritaire");

/* 3. cssDynamique : keyframes PAR PET (le nombre de frames diffère) */
remplacer("  function cssDynamique() {",
          "  function cssDynamique(clePet) {");
remplacer("    for (cleEtat in ETATS) {\r\n      e = ETATS[cleEtat];\r\n      if (reduire) {\r\n        if (cleEtat === \"idle\") s += \"#v584-pet[data-anim=\\\"idle\\\"] .v584-bob{background-position:0 0;}\";\r\n        continue;\r\n      }\r\n      s += \"#v584-pet[data-anim=\\\"\" + cleEtat + \"\\\"] .v584-bob{animation:v584-\" + cleEtat + \" \" + e.dur + \"s steps(1,end) infinite;}\";\r\n      s += \"#v584-pet .v584-bob{background-size:\" + aws + \"px \" + ahs + \"px;}\";\r\n      stops = \"\";\r\n      for (f = 0; f < e.n; f++) {\r\n        stops += (f / e.n * 100).toFixed(4) + \"%{background-position:\" + R(-f * FW * k) + \"px \" + R(-e.row * FH * k) + \"px;}\";\r\n      }\r\n      s += \"@keyframes v584-\" + cleEtat + \"{\" + stops + \"}\";\r\n    }\r\n    return s;\r\n  }",
          "    s += \"#v584-pet .v584-bob{background-size:\" + aws + \"px \" + ahs + \"px;}\";\r\n    for (cleEtat in ETATS) {\r\n      e = ETATS[cleEtat];\r\n      if (reduire) {\r\n        if (cleEtat === \"idle\") s += \"#v584-pet[data-anim=\\\"idle\\\"] .v584-bob{background-position:0 0;}\";\r\n        continue;\r\n      }\r\n      var nf = clePet ? nbFrames(clePet, cleEtat) : 1;\r\n      var nomkf = \"v584-\" + cleEtat + (clePet ? \"-\" + clePet : \"\");\r\n      if (clePet) s += \"#v584-pet[data-pet=\\\"\" + clePet + \"\\\"][data-anim=\\\"\" + cleEtat + \"\\\"] .v584-bob{animation:\" + nomkf + \" \" + e.dur + \"s steps(1,end) infinite;}\";\r\n      stops = \"\";\r\n      for (f = 0; f < nf; f++) {\r\n        stops += (f / nf * 100).toFixed(4) + \"%{background-position:\" + R(-f * FW * k) + \"px \" + R(-e.row * FH * k) + \"px;}\";\r\n      }\r\n      if (nf > 1) s += \"@keyframes \" + nomkf + \"{\" + stops + \"}\";\r\n    }\r\n    return s;\r\n  }",
          "keyframes par pet");

/* 4. rafraichirStyle : reçoit (ou devine) la clé du pet courant */
remplacer("  function rafraichirStyle() { styleEl.textContent = cssBase() + cssDynamique() + reglesAtlas.join(\"\"); }",
          "  function rafraichirStyle(cleArg) {\r\n    var cle = cleArg;\r\n    if (!cle && host) cle = host.getAttribute(\"data-pet\");\r\n    styleEl.textContent = cssBase() + cssDynamique(cle) + reglesAtlas.join(\"\");\r\n  }",
          "rafraichirStyle contextuel");

/* 5. atlas : keyframes régénérées quand une clé est appliquée */
remplacer("    if (host.getAttribute(\"data-pet\") !== cle) { host.setAttribute(\"data-pet\", cle); assureAtlas(cle); }",
          "    if (host.getAttribute(\"data-pet\") !== cle) { host.setAttribute(\"data-pet\", cle); assureAtlas(cle); rafraichirStyle(cle); }",
          "rafraichir apres atlas");

/* 6. insertion du module d atlas AVANT le module pets */
const atlasMod = "<script id=\"v585-atlas\">\r\n" +
  fs.readFileSync(DIR + "atlas_gen.js", "utf8").replace(/(?<!\r)\n/g, "\r\n").trim() +
  "\r\n</script>\r\n";
const idxPets = src.indexOf('<script id="v584-pets">');
if (idxPets === -1) { console.error("module v584-pets introuvable"); process.exit(1); }
src = src.slice(0, idxPets) + atlasMod + src.slice(idxPets);
LOG.push("module atlas insere avant v584-pets");

if (/(?<!\r)\n/.test(src)) { console.error("LF seuls INTRODUITS — abort"); process.exit(1); }
fs.writeFileSync(F, src, "utf8");
const d = src.indexOf("<script id=\"v584-pets\">") + "<script id=\"v584-pets\">".length;
const f = src.indexOf("</scr" + "ipt>", d);
fs.writeFileSync(DIR + "module_extrait_585.js", src.slice(d, f), "utf8");
console.log("PATCH v585 APPLIQUE (" + LOG.length + ") :");
LOG.forEach(l => console.log("  ok " + l));
console.log("Taille : " + src.length);
