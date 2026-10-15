/* ═══════════════════════════════════════════════════════════════
   v584bis — correctifs + fluidite (pet revient a l etat initial).
   Substitutions ancrees uniques, verification d occurrence = 1.
   ═══════════════════════════════════════════════════════════════ */
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

/* 1 + 2. les deux accents fautifs dans les handlers de reglages */
remplacer("if (arm\u00e9()) montrer(familleDe(etatAgent()));", "if (arme()) montrer(familleDe(etatAgent()));", "accent arme (taille)");
remplacer("if (arm\u00e9()) onAgent(etatAgent());", "if (arme()) onAgent(etatAgent());", "accent arme (mascotte)");

/* 3. fluxFin : apres happy, retour a l ETAT INITIAL (composeur), pas au coin */
remplacer("      if (t === seq && !paroleRecente() && !fluxActif) { ancre(\"coin\"); animer(\"idle\"); }",
          "      if (t === seq && !paroleRecente() && !fluxActif) { ancre(\"composeur\"); animer(\"idle\"); }",
          "fluxFin -> etat initial (composeur)");

/* 4. parole : silence apres la voix → retour a l etat initial */
remplacer("      if (t === seq && !fluxActif) { ancre(\"coin\"); animer(\"idle\"); }",
          "      if (t === seq && !fluxActif) { ancre(\"composeur\"); animer(\"idle\"); }",
          "parole silencieuse -> etat initial");

/* 5. montrer : ajout du corps flottant (enfant du host de voyage) */
remplacer("  function montrer(cle) {\r\n    if (!host) {\r\n      host = document.createElement(\"div\");\r\n      host.id = \"v584-pet\";\r\n      host.className = \"v584-pet\";\r\n      document.body.appendChild(host);\r\n    }\r\n    if (host.getAttribute(\"data-pet\") !== cle) { host.setAttribute(\"data-pet\", cle); assureAtlas(cle); }\r\n    animer(\"idle\");\r\n  }",
          "  function montrer(cle) {\r\n    if (!host) {\r\n      host = document.createElement(\"div\");\r\n      host.id = \"v584-pet\";\r\n      host.className = \"v584-pet\";\r\n      document.body.appendChild(host);\r\n      var bob = document.createElement(\"div\");\r\n      bob.className = \"v584-bob\";\r\n      host.appendChild(bob);\r\n    }\r\n    if (host.getAttribute(\"data-pet\") !== cle) { host.setAttribute(\"data-pet\", cle); assureAtlas(cle); }\r\n    animer(\"idle\");\r\n  }",
          "montrer : corps flottant .v584-bob");

/* 6. assureAtlas : l image porte sur le corps flottant */
remplacer("    regleCss(\"#v584-pet[data-pet=\\\"\" + cle + \"\\\"]\", \"background-image:url(\\\"\" + url + \"\\\")\");",
          "    regleCss(\"#v584-pet[data-pet=\\\"\" + cle + \"\\\"] .v584-bob\", \"background-image:url(\\\"\" + url + \"\\\")\");",
          "atlas regle sur le corps flottant");

/* 7. cssBase : vol organique (rebond leger) + flottement permanent du corps */
remplacer("  function cssBase() {\r\n    return \"#v584-pet{position:fixed;left:0;top:0;z-index:calc(var(--z-modal-lg,2000) - 100);\"\r\n      + \"pointer-events:none;background-repeat:no-repeat;transform:translate(-320px,-320px);\"\r\n      + \"transition:transform .55s cubic-bezier(.3,.9,.35,1);will-change:transform}\";\r\n  }",
          "  function cssBase() {\r\n    return \"#v584-pet{position:fixed;left:0;top:0;z-index:calc(var(--z-modal-lg,2000) - 100);\"\r\n      + \"pointer-events:none;transform:translate(-320px,-320px);\"\r\n      + \"transition:transform .62s cubic-bezier(.34,1.28,.42,1);will-change:transform}\"\r\n      + \"#v584-pet .v584-bob{width:100%;height:100%;background-repeat:no-repeat;\"\r\n      + \"animation:v584-bob 2.8s ease-in-out infinite alternate}\"\r\n      + \"@keyframes v584-bob{from{transform:translateY(0) rotate(-0.8deg)}to{transform:translateY(-3.5px) rotate(1.2deg)}}\"\r\n      + \"@media (prefers-reduced-motion: reduce){#v584-pet .v584-bob{animation:none}}\";\r\n  }",
          "cssBase : vol organique + flottement");

/* 8. cssDynamique : selecteurs descendants (le voyage reste sur le host) */
remplacer("    var s = \"#v584-pet{width:\" + t + \"px;height:\" + hs + \"px;background-size:\" + aws + \"px \" + ahs + \"px;}\";",
          "    var s = \"#v584-pet{width:\" + t + \"px;height:\" + hs + \"px;}\";",
          "host : dimensions seules");
remplacer("        if (cleEtat === \"idle\") s += \"#v584-pet[data-anim=\\\"idle\\\"]{background-position:0 0;}\";",
          "        if (cleEtat === \"idle\") s += \"#v584-pet[data-anim=\\\"idle\\\"] .v584-bob{background-position:0 0;}\";",
          "reduire : position sur le corps");
remplacer("      s += \"#v584-pet[data-anim=\\\"\" + cleEtat + \"\\\"]{animation:v584-\" + cleEtat + \" \" + e.dur + \"s steps(1,end) infinite;}\";",
          "      s += \"#v584-pet[data-anim=\\\"\" + cleEtat + \"\\\"] .v584-bob{animation:v584-\" + cleEtat + \" \" + e.dur + \"s steps(1,end) infinite;}\";\r\n      s += \"#v584-pet .v584-bob{background-size:\" + aws + \"px \" + ahs + \"px;}\";",
          "frames + taille de fond sur le corps");

/* verifications finales */
if (/(?<!\r)\n/.test(src)) { console.error("LF seuls INTRODUITS — abort"); process.exit(1); }
fs.writeFileSync(F, src, "utf8");
const tag = '<script id="v584-pets">';
const d = src.indexOf(tag) + tag.length;
const f = src.indexOf("</scr" + "ipt>", d);
fs.writeFileSync("C:/tmp/theoverify/.workbuddy-ai/artifacts/_v584/module_extrait_bis.js", src.slice(d, f), "utf8");
console.log("PATCH APPLIQUE (" + LOG.length + ") :");
LOG.forEach(l => console.log("  ok " + l));
console.log("Taille : " + src.length);
