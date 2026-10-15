/* v584quater — ERRANCE : le compagnon se deplace LIBREMENT dans toute
   l interface du chat (au lieu de rester fiche sur une ancre).
   Methode : on isole le module <script id="v584-pets"> par TRANCHES
   (indexOf), on applique des remplacements CIBLES (chacun unique, verifie
   par comptage) via une fonction de remplacement (jamais "$" interprete),
   puis on reinjecte. Aucun replace global sur le fichier. */
const fs = require("fs"), path = require("path");
const F = path.join(__dirname, "..", "..", "..", "THEOLOGICUS.html");
let html = fs.readFileSync(F, "utf8");

const DEB = '<script id="v584-pets">';
const start = html.indexOf(DEB);
if (start < 0) { console.error("ancre module introuvable"); process.exit(1); }
const finTag = html.indexOf("</script>", start);
if (finTag < 0) { console.error("fermeture module introuvable"); process.exit(1); }
const fin = finTag + "</script>".length;
let mod = html.slice(start, fin);
/* le fichier est en CRLF : on normalise le module en LF pour que les
   ancres multi-lignes (ecrites en LF) correspondent ; la reinjection
   finale remet le CRLF. */
mod = mod.replace(/\r\n/g, "\n");

function rempl(ancre, remplacement, etiquette) {
  const n = mod.split(ancre).length - 1;
  if (n !== 1) { console.error("ANCRE NON UNIQUE (" + n + ") : " + etiquette); process.exit(1); }
  mod = mod.replace(ancre, () => remplacement);
  console.log("  ok  " + etiquette);
}

/* ── 0. en-tete : documenter l errance ── */
rempl(
  "     la voix, happy a la fin) ; puis retour au coin bas-gauche. */",
  "     la voix, happy a la fin) ; puis il se repose et DEAMBULE LIBREMENT\n" +
  "     dans toute l interface du chat (reglage « Deambulation libre »). */",
  "en-tete"
);

/* ── 1. CSS : miroir horizontal quand il marche vers la gauche ── */
rempl(
  '      + "#v584-pet .v584-bob{width:100%;height:100%;background-repeat:no-repeat;}"',
  '      + "#v584-pet .v584-bob{width:100%;height:100%;background-repeat:no-repeat;}"\n' +
  '      + "#v584-pet[data-face=\\"gauche\\"] .v584-bob{transform:scaleX(-1)}"',
  "css-face"
);

/* ── 2. ancre() -> poser() + bloc ERRANCE ── */
rempl(
  '  function ancre(nom) {\n' +
  '    if (!host) return;\n' +
  '    cibleNom = nom;\n' +
  '    var p = ciblePos(nom);\n' +
  '    host.style.transform = "translate(" + p.x + "px," + p.y + "px)";\n' +
  '  }',
  [
    '  function ancre(nom) {',
    '    if (!host) return;',
    '    cibleNom = nom;',
    '    var p = ciblePos(nom);',
    '    poser(p.x, p.y, 0.62, 0);',
    '  }',
    '',
    '  /* ── errance : deambulation LIBRE dans toute l interface du chat ──',
    '     Le compagnon choisit un point aleatoire de la zone de chat, y',
    '     marche (duree proportionnelle a la distance, miroir selon le sens),',
    '     marque une pause, puis recommence. Interrompu a chaque evenement',
    '     (agent, generation, voix) et repris au repos. */',
    '  var pos = { x: -320, y: -320 }, face = 1;',
    '  var ERR = { actif: false, pas: null };',
    '  function erranceOn() { return lit("theo_pets_errance") !== "0"; }',
    '  /* zone = conversation (#chat-wrap) etendue jusqu au bas du composeur */',
    '  function zoneErrance() {',
    '    var vw = window.innerWidth || 1024, vh = window.innerHeight || 768;',
    '    var z = { x: 8, y: 8, w: Math.max(80, vw - 16), h: Math.max(80, vh - 16) };',
    '    try {',
    '      var wrap = document.getElementById("chat-wrap");',
    '      var r = wrap ? wrap.getBoundingClientRect() : null;',
    '      if (r && r.width > 140 && r.height > 140) {',
    '        var bas = r.bottom;',
    '        var inp = document.getElementById("input-area");',
    '        if (inp) { var ir = inp.getBoundingClientRect(); if (ir.height > 0) bas = Math.max(bas, ir.bottom); }',
    '        z = { x: r.left, y: r.top, w: r.width, h: Math.max(80, bas - r.top) };',
    '      }',
    '    } catch (e) {}',
    '    return z;',
    '  }',
    '  function choisirPoint() {',
    '    var z = zoneErrance();',
    '    var w = host ? (host.offsetWidth || 76) : 76, h = host ? (host.offsetHeight || 82) : 82;',
    '    var m = 10, x0 = z.x + m, y0 = z.y + m;',
    '    var x1 = Math.max(x0, z.x + z.w - w - m), y1 = Math.max(y0, z.y + z.h - h - m);',
    '    return { x: R(x0 + Math.random() * (x1 - x0)), y: R(y0 + Math.random() * (y1 - y0)) };',
    '  }',
    '  function poser(x, y, duree, sens) {',
    '    if (!host) return;',
    '    pos.x = R(x); pos.y = R(y);',
    '    host.style.transitionDuration = R(duree || 0.62) + "s";',
    '    if (sens) {',
    '      var f = sens > 0 ? 1 : -1;',
    '      if (f !== face) { face = f; host.setAttribute("data-face", f > 0 ? "droite" : "gauche"); }',
    '    }',
    '    host.style.transform = "translate(" + pos.x + "px," + pos.y + "px)";',
    '  }',
    '  function pasErrance() {',
    '    ERR.pas = null;',
    '    if (!host || !arme() || !ERR.actif) return null;',
    '    if (fluxActif || paroleRecente()) { ERR.pas = setTimeout(pasErrance, 1000); return null; }',
    '    var best = null, bd = -1, i, c, dx, dy, d;',
    '    for (i = 0; i < 6; i++) {          /* on garde le point le plus eloigne */',
    '      c = choisirPoint();',
    '      dx = c.x - pos.x; dy = c.y - pos.y; d = Math.sqrt(dx * dx + dy * dy);',
    '      if (d > bd) { bd = d; best = c; }',
    '    }',
    '    dx = best.x - pos.x;',
    '    var duree = Math.min(3.6, Math.max(1, bd / 180));',
    '    cibleNom = "errance";',
    '    animer("idle");',
    '    poser(best.x, best.y, duree, dx === 0 ? face : (dx > 0 ? 1 : -1));',
    '    ERR.pas = setTimeout(pasErrance, R((duree + 0.7 + Math.random() * 2.2) * 1000));',
    '    return best;',
    '  }',
    '  function demarrerErrance(delai) {',
    '    arreterErrance();',
    '    if (!arme() || !host || !erranceOn()) return;',
    '    ERR.actif = true;',
    '    ERR.pas = setTimeout(pasErrance, delai == null ? 2800 : delai);',
    '  }',
    '  function arreterErrance() {',
    '    ERR.actif = false;',
    '    if (ERR.pas) { clearTimeout(ERR.pas); ERR.pas = null; }',
    '  }'
  ].join("\n"),
  "ancre+errance"
);

/* ── 3. cacher() : stopper l errance et remettre la position a zero ── */
rempl(
  '  function cacher() {\n' +
  '    seq++;\n' +
  '    if (rafraichir) { clearInterval(rafraichir); rafraichir = null; }',
  '  function cacher() {\n' +
  '    seq++;\n' +
  '    arreterErrance();\n' +
  '    if (rafraichir) { clearInterval(rafraichir); rafraichir = null; }',
  "cacher-stop"
);
rempl(
  '    if (host) { host.remove(); host = null; }\n' +
  '    cibleNom = "coin";',
  '    if (host) { host.remove(); host = null; }\n' +
  '    cibleNom = "coin";\n' +
  '    pos.x = -320; pos.y = -320; face = 1;',
  "cacher-reset"
);

/* ── 4. montrer() : sens initial ── */
rempl(
  '      host.id = "v584-pet";\n' +
  '      host.className = "v584-pet";\n' +
  '      document.body.appendChild(host);',
  '      host.id = "v584-pet";\n' +
  '      host.className = "v584-pet";\n' +
  '      host.setAttribute("data-face", "droite");\n' +
  '      face = 1;\n' +
  '      document.body.appendChild(host);',
  "montrer-face"
);

/* ── 5. onAgent : salue puis se repose ET commence a deambuler ── */
rempl(
  '  function onAgent(ag) {\n' +
  '    if (!arme() || !ag) { cacher(); return; }\n' +
  '    montrer(familleDe(ag));',
  '  function onAgent(ag) {\n' +
  '    if (!arme() || !ag) { cacher(); return; }\n' +
  '    arreterErrance();\n' +
  '    montrer(familleDe(ag));',
  "onAgent-stop"
);
rempl(
  '    quiet = setTimeout(function () { if (t === seq) animer("idle"); }, 2300);',
  '    quiet = setTimeout(function () { if (t === seq) { animer("idle"); demarrerErrance(); } }, 2300);',
  "onAgent-repos"
);

/* ── 6. fluxDebut : la generation interrompt l errance ── */
rempl(
  '  function fluxDebut() {\n' +
  '    if (!arme() || !host) return;\n' +
  '    fluxActif = true;',
  '  function fluxDebut() {\n' +
  '    if (!arme() || !host) return;\n' +
  '    arreterErrance();\n' +
  '    fluxActif = true;',
  "fluxDebut-stop"
);

/* ── 7. fluxFin : retour au repos puis errance ── */
rempl(
  '      if (t === seq && !paroleRecente() && !fluxActif) { ancre("composeur"); animer("idle"); }\n' +
  '    }, 2200);',
  '      if (t === seq && !paroleRecente() && !fluxActif) { ancre("composeur"); animer("idle"); demarrerErrance(); }\n' +
  '    }, 2200);',
  "fluxFin-repos"
);

/* ── 8. parole : la voix interrompt l errance, puis reprise ── */
rempl(
  '  function parole() {\n' +
  '    if (!arme() || !host) return;\n' +
  '    paroleT = Date.now();',
  '  function parole() {\n' +
  '    if (!arme() || !host) return;\n' +
  '    arreterErrance();\n' +
  '    paroleT = Date.now();',
  "parole-stop"
);
rempl(
  '      if (t === seq && !fluxActif) { ancre("composeur"); animer("idle"); }\n' +
  '    }, 1700);',
  '      if (t === seq && !fluxActif) { ancre("composeur"); animer("idle"); demarrerErrance(); }\n' +
  '    }, 1700);',
  "parole-repos"
);

/* ── 9. resize : reclamp dans la zone si en errance ── */
rempl(
  '      rafP = 0;\n' +
  '      if (!host) return;\n' +
  '      rafraichirStyle();\n' +
  '      ancre(cibleNom);',
  '      rafP = 0;\n' +
  '      if (!host) return;\n' +
  '      rafraichirStyle();\n' +
  '      if (cibleNom === "errance") {\n' +
  '        var z = zoneErrance(), w = host.offsetWidth || 76, h = host.offsetHeight || 82, m = 10;\n' +
  '        poser(Math.max(z.x + m, Math.min(pos.x, z.x + z.w - w - m)), Math.max(z.y + m, Math.min(pos.y, z.y + z.h - h - m)), 0.3, 0);\n' +
  '      } else ancre(cibleNom);',
  "resize-clamp"
);

/* ── 10. reglages : case « Deambulation libre » ── */
rempl(
  '    row.appendChild(document.createTextNode("Afficher le compagnon quand un agent est sélectionné"));\n' +
  '    g.appendChild(row);',
  '    row.appendChild(document.createTextNode("Afficher le compagnon quand un agent est sélectionné"));\n' +
  '    g.appendChild(row);\n' +
  '    var rowE = document.createElement("label");\n' +
  '    rowE.className = "field-label";\n' +
  '    rowE.style.cssText = "display:flex;align-items:center;gap:8px;font-weight:600;cursor:pointer;margin:6px 0;";\n' +
  '    var chkE = document.createElement("input");\n' +
  '    chkE.type = "checkbox"; chkE.id = "v584-errance"; chkE.checked = erranceOn();\n' +
  '    rowE.appendChild(chkE);\n' +
  '    rowE.appendChild(document.createTextNode("Déambulation libre — le compagnon se promène dans toute l’interface du chat"));\n' +
  '    g.appendChild(rowE);',
  "reglage-case"
);
rempl(
  '    selP.addEventListener("change", function () {\n' +
  '      ecrit("theo_pets_pet", selP.value);\n' +
  '      if (arme()) onAgent(etatAgent());\n' +
  '    });',
  '    selP.addEventListener("change", function () {\n' +
  '      ecrit("theo_pets_pet", selP.value);\n' +
  '      if (arme()) onAgent(etatAgent());\n' +
  '    });\n' +
  '    chkE.addEventListener("change", function () {\n' +
  '      ecrit("theo_pets_errance", chkE.checked ? "1" : "0");\n' +
  '      if (!chkE.checked) {\n' +
  '        arreterErrance();\n' +
  '        if (host) { ancre("composeur"); animer("idle"); }\n' +
  '      } else if (arme() && host) demarrerErrance(400);\n' +
  '    });',
  "reglage-handler"
);

/* ── 11. texte d aide ── */
rempl(
  'hint.textContent = "Le compagnon vit près du composeur, suit votre question pendant la génération, s’agite quand il parle, puis regagne son coin en bas à gauche. Mascottes au format OpenPets (MIT) — import de compagnons supplémentaires à venir.";',
  'hint.textContent = "Le compagnon se promène librement dans toute l’interface du chat, suit votre question pendant la génération et s’agite quand il parle, puis reprend sa promenade. Décochez « Déambulation libre » pour qu’il reste près du composeur. Mascottes au format OpenPets (MIT) — import de compagnons supplémentaires à venir.";',
  "aide"
);

/* ── 12. API publique : exposer l errance (bancs) ── */
rempl(
  '    appliquer: appliquer,\n' +
  '    familleDe: familleDe\n' +
  '  };',
  '    appliquer: appliquer,\n' +
  '    familleDe: familleDe,\n' +
  '    errance: function () {\n' +
  '      return { on: erranceOn(), actif: ERR.actif, zone: zoneErrance(), pos: { x: pos.x, y: pos.y }, face: face, taille: host ? host.offsetWidth : 0 };\n' +
  '    },\n' +
  '    choisirPoint: choisirPoint\n' +
  '  };',
  "api"
);

/* ── reinjection par TRANCHES + CRLF ── */
const nouveau = html.slice(0, start) + mod + html.slice(fin);
if (nouveau.indexOf("</body>") < 0) { console.error("</body> disparu — abandon"); process.exit(1); }
const crlf = nouveau.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
fs.writeFileSync(F, crlf, "utf8");

/* ── verification : extraire le module et node --check ── */
const i2 = crlf.indexOf(DEB), f2 = crlf.indexOf("</script>", i2);
const js = crlf.slice(i2 + DEB.length, f2);
fs.writeFileSync(path.join(__dirname, "module_extrait_584quater.js"), js, "utf8");
console.log("\nmodule reinjecte — " + js.length + " octets de JS extraits");
