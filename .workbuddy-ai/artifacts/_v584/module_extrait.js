
(function () {
  "use strict";
  if (window.__v584Pets) return;
  /* V4.0 — PETS : compagnons animes des agents, a la maniere de Codex, au
     format OpenPets (MIT). Atlas : frames 192x208, 8 colonnes, 11 lignes
     (1536x2288) ; etats : idle=0 (6 frames), wave=3 (4), happy=4 (5),
     thinking=8 (6). Mascottes vectorielles generees localement.
     Vie : selection d agent → pet au composeur ; envoi → il suit la
     question (thinking) ; la reponse arrive → il la suit (wave pendant
     la voix, happy a la fin) ; puis retour au coin bas-gauche. */
  var FW = 192, FH = 208, COLS = 8, ROWS = 11;
  var AW = COLS * FW, AH = ROWS * FH;
  var ETATS = {
    idle: { row: 0, n: 6, dur: 1.8 },
    wave: { row: 3, n: 4, dur: 1.15 },
    happy: { row: 4, n: 5, dur: 1.25 },
    thinking: { row: 8, n: 6, dur: 1.5 }
  };

  /* ── les 8 mascottes (definitions parametriques) ── */
  var MASC = {
    chouette: { nom: "Chouette du Scribe", corps: "#7a5c44", ventre: "#e9ddc8", fonc: "#43321f", acc: "rouleau" },
    colombe:  { nom: "Colombe des Pères", corps: "#e3eefc", ventre: "#ffffff", fonc: "#7f9fc9", acc: "halo" },
    cierge:   { nom: "Cierge de Prière", corps: "#fdf6dd", ventre: "#fffdf2", fonc: "#b39a5f", acc: "flamme" },
    lion:     { nom: "Lionceau de Juda", corps: "#e8a33d", ventre: "#ffe8b0", fonc: "#8f5a1c", acc: "balance" },
    perroquet:{ nom: "Perroquet des Langues", corps: "#3f9e4d", ventre: "#d8f0cf", fonc: "#1f5c2a", acc: "livre" },
    poisson:  { nom: "Poisson des Origines", corps: "#59b7e8", ventre: "#e2f3fd", fonc: "#2a6f96", acc: "bulles" },
    fennec:   { nom: "Fennec du Désert", corps: "#f2c187", ventre: "#fff4e2", fonc: "#9a662a", acc: "etoile" },
    phenix:   { nom: "Phénix", corps: "#e85d3d", ventre: "#ffd9a8", fonc: "#8f2f1c", acc: "braises" }
  };
  /* familles theologiques → mascotte (par defaut : phenix) */
  var FAMILLES = [
    [/ex.g|thomist|cat.ch/i, "chouette"],
    [/patrist|augustin|concile|orientale/i, "colombe"],
    [/liturg|mystiq/i, "cierge"],
    [/apolog|canonist|moralist|r.forme/i, "lion"],
    [/h.breu|grec|talmud|traduct/i, "perroquet"],
    [/histor|arch.olog/i, "poisson"],
    [/islamolog|coranolog/i, "fennec"]
  ];

  function lit(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function ecrit(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} }
  function arme() { return lit("theo_pets") === "1"; }
  function R(n) { return Math.round(n * 100) / 100; }
  function el(t, a) {
    var s = "<" + t, k;
    for (k in a) s += " " + k + "=\"" + a[k] + "\"";
    return s + "/>";
  }

  /* ── parametres d animation par etat et par frame ── */
  function params(etat, i) {
    var p = { bob: 0, jump: 0, blink: false, look: false, tilt: 0, mouth: 0, spark: 0, dots: 0, wing: 0, flam: 0, quill: 0 };
    var T = 6.2832;
    if (etat === "idle") {
      p.bob = 3 * Math.sin(i / 6 * T);
      p.wing = 6 * Math.sin(i / 6 * T);
      p.blink = (i === 2);
      p.flam = 2 * Math.sin(i / 6 * T);
      p.quill = 3 * Math.sin(i / 6 * T);
    } else if (etat === "wave") {
      p.paw = [5, 11, 14, 11][i] || 0;
      p.bob = 1.5 * Math.sin(i / 4 * T);
      p.wing = 8 + p.paw;
      p.flam = 2.5 * Math.sin(i / 4 * T);
      p.quill = 2 * Math.sin(i / 4 * T);
    } else if (etat === "happy") {
      p.jump = 13 * Math.abs(Math.sin((i + 0.5) / 5 * 3.1416));
      p.mouth = 1; p.spark = 1;
      p.wing = -12 * Math.sin((i + 0.5) / 5 * 3.1416);
      p.flam = 3; p.quill = -4;
    } else if (etat === "thinking") {
      p.tilt = [0, 2, 4, 5, 4, 2][i] || 0;
      p.look = true; p.dots = 1;
      p.flam = 3 * Math.sin(i / 6 * T);
      p.quill = 6 + 2 * Math.sin(i / 6 * T);
      p.bob = 1 * Math.sin(i / 6 * T);
    }
    return p;
  }

  function yeux(def, p, ey) {
    var sw = 2.2;
    if (p.blink) {
      return el("path", { d: "M75 " + ey + " q7 6 14 0", stroke: def.fonc, "stroke-width": sw, fill: "none", "stroke-linecap": "round" })
           + el("path", { d: "M103 " + ey + " q7 6 14 0", stroke: def.fonc, "stroke-width": sw, fill: "none", "stroke-linecap": "round" });
    }
    var dx = p.look ? -2.5 : 0, dy = p.look ? -3 : 0;
    return el("circle", { cx: 82, cy: ey, r: 7.5, fill: "#ffffff", stroke: def.fonc, "stroke-width": 1.6 })
         + el("circle", { cx: 110, cy: ey, r: 7.5, fill: "#ffffff", stroke: def.fonc, "stroke-width": 1.6 })
         + el("circle", { cx: R(82 + dx), cy: R(ey + dy), r: 3.4, fill: "#26313f" })
         + el("circle", { cx: R(110 + dx), cy: R(ey + dy), r: 3.4, fill: "#26313f" });
  }
  function etoile(x, y, r, fill, op) {
    return el("path", {
      d: "M" + x + " " + (y - r) + " L" + (x + r * 0.3) + " " + (y - r * 0.3) + " L" + (x + r) + " " + y +
         " L" + (x + r * 0.3) + " " + (y + r * 0.3) + " L" + x + " " + (y + r) +
         " L" + (x - r * 0.3) + " " + (y + r * 0.3) + " L" + (x - r) + " " + y +
         " L" + (x - r * 0.3) + " " + (y - r * 0.3) + " Z",
      fill: fill, opacity: op });
  }
  function etincelles(p) {
    if (!p.spark) return "";
    var a = 0.55 + 0.45 * Math.abs(Math.sin(p.jump / 13 * 3.1416));
    return etoile(38, 70, 9, "#ffd166", R(a))
         + etoile(156, 60, 7, "#ffd166", R(a * 0.9))
         + etoile(148, 108, 5, "#fff3c4", R(a * 0.8));
  }
  function pensee(p) {
    if (!p.dots) return "";
    var h = p.tilt || 0;
    return el("circle", { cx: 126, cy: R(44 - h), r: 2.4, fill: "#9fb7d8", opacity: 0.85 })
         + el("circle", { cx: 136, cy: R(34 - h), r: 3.4, fill: "#9fb7d8", opacity: 0.7 })
         + el("circle", { cx: 148, cy: R(22 - h), r: 4.6, fill: "#9fb7d8", opacity: 0.55 });
  }

  function oiseau(def, p) {
    var v = def.cle, s = "";
    if (v === "colombe") {
      s += el("ellipse", { cx: 60, cy: 148, rx: 17, ry: 8, transform: "rotate(-30 60 148)", fill: def.corps, stroke: def.fonc, "stroke-width": 2 });
      s += el("ellipse", { cx: 56, cy: 134, rx: 15, ry: 7, transform: "rotate(-16 56 134)", fill: def.corps, stroke: def.fonc, "stroke-width": 2 });
    } else if (v === "perroquet") {
      s += el("path", { d: "M66 152 q-28 24 -36 46 q22 -6 36 -18 q-2 12 6 20 q12 -20 8 -44 z", fill: def.fonc, opacity: 0.92 });
    } else {
      s += el("path", { d: "M62 156 q-20 10 -24 32 q15 -8 24 -14 q0 14 9 22 q9 -18 3 -38 z", fill: "#ff9f43" });
      s += el("path", { d: "M54 164 q-12 8 -14 24 q11 -6 16 -10 z", fill: "#ffd166" });
    }
    s += el("ellipse", { cx: 50, cy: 130, rx: 13, ry: 25, transform: "rotate(" + R(-26 - p.wing) + " 50 130)", fill: def.corps, stroke: def.fonc, "stroke-width": 2 });
    s += el("ellipse", { cx: 142, cy: 130, rx: 13, ry: 25, transform: "rotate(" + R(26 + p.wing) + " 142 130)", fill: def.corps, stroke: def.fonc, "stroke-width": 2 });
    s += el("ellipse", { cx: 96, cy: 142, rx: 34, ry: 31, fill: def.corps, stroke: def.fonc, "stroke-width": 2.4 });
    s += el("ellipse", { cx: 96, cy: 154, rx: 20, ry: 15, fill: def.ventre });
    s += el("circle", { cx: 96, cy: 88, r: 30, fill: def.corps, stroke: def.fonc, "stroke-width": 2.4 });
    if (v === "colombe") {
      s += el("polygon", { points: "90,94 102,94 96,106", fill: "#f2a94a", stroke: def.fonc, "stroke-width": 1.4 });
      if (p.mouth) s += el("polygon", { points: "90,94 102,94 96,110", fill: "#e8833a" });
      s += el("line", { x1: 86, y1: 174, x2: 86, y2: 186, stroke: def.fonc, "stroke-width": 2.4, "stroke-linecap": "round" });
      s += el("line", { x1: 106, y1: 174, x2: 106, y2: 186, stroke: def.fonc, "stroke-width": 2.4, "stroke-linecap": "round" });
    } else if (v === "perroquet") {
      s += el("ellipse", { cx: 78, cy: 96, rx: 10, ry: 12, fill: def.ventre, opacity: 0.9 });
      s += el("ellipse", { cx: 114, cy: 96, rx: 10, ry: 12, fill: def.ventre, opacity: 0.9 });
      s += el("path", { d: "M96 92 q-9 2 -8 10 q1 8 9 9 q9 -1 9 -10 q0 -8 -10 -9 z", fill: "#e8b23d", stroke: def.fonc, "stroke-width": 1.6 });
      s += el("path", { d: "M96 74 q-4 -14 6 -20 q2 10 -1 18 z", fill: "#e8574b" });
      s += el("path", { d: "M88 78 q-10 -8 -8 -18 q10 4 13 14 z", fill: "#3f7ec4" });
      if (p.mouth) s += el("path", { d: "M88 102 q8 8 17 1", stroke: def.fonc, "stroke-width": 2, fill: "none", "stroke-linecap": "round" });
    } else {
      s += el("path", { d: "M96 62 q-8 -16 2 -26 q4 12 10 18 q4 -8 12 -10 q-2 14 -12 20 z", fill: "#ffb347" });
      s += el("polygon", { points: "89,92 103,92 96,106", fill: "#ffb347", stroke: def.fonc, "stroke-width": 1.4 });
      s += el("line", { x1: 86, y1: 172, x2: 84, y2: 186, stroke: def.fonc, "stroke-width": 2.4, "stroke-linecap": "round" });
      s += el("line", { x1: 106, y1: 172, x2: 108, y2: 186, stroke: def.fonc, "stroke-width": 2.4, "stroke-linecap": "round" });
      s += etoile(150, 78, 5, "#ffd166", 0.8);
    }
    s += yeux(def, p, 82);
    return s;
  }

  function chouette(def, p) {
    var s = "", q = p.quill || 0, dx = p.look ? -2.5 : 0, dy = p.look ? -3 : 0;
    s += el("ellipse", { cx: 96, cy: 132, rx: 47, ry: 50, fill: def.corps, stroke: def.fonc, "stroke-width": 2.4 });
    s += el("ellipse", { cx: 96, cy: 152, rx: 28, ry: 26, fill: def.ventre });
    s += el("ellipse", { cx: 52, cy: 134, rx: 13, ry: 24, transform: "rotate(" + R(-18 - p.wing * 0.6) + " 52 134)", fill: def.fonc, opacity: 0.55 });
    s += el("ellipse", { cx: 140, cy: 134, rx: 13, ry: 24, transform: "rotate(" + R(18 + p.wing * 0.6) + " 140 134)", fill: def.fonc, opacity: 0.55 });
    s += el("polygon", { points: "70,52 64,30 84,44", fill: def.corps, stroke: def.fonc, "stroke-width": 2 });
    s += el("polygon", { points: "122,52 128,30 108,44", fill: def.corps, stroke: def.fonc, "stroke-width": 2 });
    s += el("circle", { cx: 79, cy: 86, r: 22, fill: def.ventre, stroke: def.fonc, "stroke-width": 2 });
    s += el("circle", { cx: 113, cy: 86, r: 22, fill: def.ventre, stroke: def.fonc, "stroke-width": 2 });
    if (p.blink) {
      s += el("path", { d: "M72 86 q7 6 14 0", stroke: def.fonc, "stroke-width": 2.4, fill: "none", "stroke-linecap": "round" });
      s += el("path", { d: "M106 86 q7 6 14 0", stroke: def.fonc, "stroke-width": 2.4, fill: "none", "stroke-linecap": "round" });
    } else {
      s += el("circle", { cx: 79, cy: 86, r: 9, fill: "#ffffff", stroke: def.fonc, "stroke-width": 1.4 });
      s += el("circle", { cx: 113, cy: 86, r: 9, fill: "#ffffff", stroke: def.fonc, "stroke-width": 1.4 });
      s += el("circle", { cx: R(79 + dx), cy: R(86 + dy), r: 4.2, fill: "#26313f" });
      s += el("circle", { cx: R(113 + dx), cy: R(86 + dy), r: 4.2, fill: "#26313f" });
    }
    s += el("polygon", { points: "91,96 101,96 96,106", fill: "#f2a94a", stroke: def.fonc, "stroke-width": 1.4 });
    s += el("ellipse", { cx: 80, cy: 182, rx: 8, ry: 5, fill: "#f2a94a", stroke: def.fonc, "stroke-width": 1.4 });
    s += el("ellipse", { cx: 112, cy: 182, rx: 8, ry: 5, fill: "#f2a94a", stroke: def.fonc, "stroke-width": 1.4 });
    s += el("rect", { x: 68, y: R(148 + q * 0.4), width: 56, height: 16, rx: 8, fill: "#fdf8ea", stroke: "#c9b183", "stroke-width": 2 });
    s += el("circle", { cx: 70, cy: R(156 + q * 0.4), r: 6, fill: "#e8d9b0", stroke: "#c9b183", "stroke-width": 1.6 });
    s += el("circle", { cx: 122, cy: R(156 + q * 0.4), r: 6, fill: "#e8d9b0", stroke: "#c9b183", "stroke-width": 1.6 });
    s += el("path", { d: "M126 " + R(150 + q) + " q14 -8 20 -22", stroke: "#fafafa", "stroke-width": 3.4, fill: "none", "stroke-linecap": "round" });
    return s;
  }

  function cierge(def, p) {
    var f = p.flam || 0, s = "";
    s += el("circle", { cx: R(96 + f * 1.6), cy: 56, r: 17, fill: "rgba(255,196,77,0.22)" });
    s += el("rect", { x: 72, y: 96, width: 48, height: 86, rx: 9, fill: def.corps, stroke: def.fonc, "stroke-width": 2.4 });
    s += el("path", { d: "M72 104 q10 12 14 0 q4 10 10 2", stroke: def.fonc, "stroke-width": 2, fill: "none", opacity: 0.7 });
    s += el("rect", { x: 66, y: 90, width: 60, height: 10, rx: 5, fill: "#e8c96a", stroke: def.fonc, "stroke-width": 2 });
    s += el("line", { x1: 96, y1: 82, x2: 96, y2: 90, stroke: "#6b5637", "stroke-width": 2.6 });
    s += el("path", { d: "M" + R(96 + f * 1.8) + " 46 q10 12 4 24 q-4 8 -8 8 q-8 -2 -9 -12 q-1 -12 13 -20 z", fill: "#ffb347" });
    s += el("path", { d: "M" + R(96 + f) + " 56 q5 7 2 13 q-3 4 -6 3 q-4 -3 -3 -9 q1 -5 7 -7 z", fill: "#fff3c4" });
    s += yeux(def, p, 124);
    if (p.mouth) s += el("ellipse", { cx: 96, cy: 142, rx: 6, ry: 8, fill: "#8f5a1c", opacity: 0.75 });
    else s += el("path", { d: "M88 142 q8 7 16 0", stroke: def.fonc, "stroke-width": 2, fill: "none", "stroke-linecap": "round" });
    return s;
  }

  function lion(def, p) {
    var s = "", i, a, x, y, x2, y2, x3, y3, q = p.quill || 0;
    for (i = 0; i < 10; i++) {
      a = i / 10 * 6.2832;
      x = 96 + Math.cos(a) * 42; y = 92 + Math.sin(a) * 42;
      x2 = 96 + Math.cos(a) * 58; y2 = 92 + Math.sin(a) * 58;
      x3 = 96 + Math.cos(a + 0.3) * 44; y3 = 92 + Math.sin(a + 0.3) * 44;
      s += el("polygon", { points: R(x) + "," + R(y) + " " + R(x2) + "," + R(y2) + " " + R(x3) + "," + R(y3), fill: "#d98a26" });
    }
    s += el("ellipse", { cx: 96, cy: 156, rx: 36, ry: 26, fill: def.corps, stroke: def.fonc, "stroke-width": 2.4 });
    s += el("ellipse", { cx: 96, cy: 164, rx: 20, ry: 14, fill: def.ventre });
    s += el("ellipse", { cx: 76, cy: 184, rx: 10, ry: 6, fill: def.corps, stroke: def.fonc, "stroke-width": 2 });
    s += el("ellipse", { cx: 116, cy: 184, rx: 10, ry: 6, fill: def.corps, stroke: def.fonc, "stroke-width": 2 });
    s += el("path", { d: "M132 160 q22 -4 24 -26", stroke: def.fonc, "stroke-width": 4, fill: "none", "stroke-linecap": "round" });
    s += el("circle", { cx: R(156 + p.wing * 0.3), cy: 132, r: 6, fill: def.fonc });
    s += el("circle", { cx: 96, cy: 92, r: 42, fill: "#d98a26" });
    s += el("circle", { cx: 96, cy: 92, r: 30, fill: def.corps });
    s += el("ellipse", { cx: 96, cy: 104, rx: 15, ry: 11, fill: def.ventre });
    s += el("polygon", { points: "91,96 101,96 96,103", fill: "#7a4a12" });
    if (p.mouth) s += el("ellipse", { cx: 96, cy: 108, rx: 7, ry: 5, fill: "#7a4a12" });
    else s += el("path", { d: "M89 107 q7 6 14 0", stroke: "#7a4a12", "stroke-width": 2, fill: "none", "stroke-linecap": "round" });
    s += yeux(def, p, 84);
    s += el("line", { x1: 146, y1: R(96 + q * 0.3), x2: 146, y2: R(122 + q * 0.3), stroke: "#8a6d3b", "stroke-width": 2.6 });
    s += el("line", { x1: 136, y1: R(100 + q * 0.3), x2: 156, y2: R(100 + q * 0.3), stroke: "#8a6d3b", "stroke-width": 2.4 });
    s += el("path", { d: "M130 " + R(114 + q * 0.3) + " q6 12 12 0 z", fill: "#e8c96a", stroke: "#8a6d3b", "stroke-width": 1.6 });
    s += el("path", { d: "M150 " + R(114 - q * 0.3) + " q6 12 12 0 z", fill: "#e8c96a", stroke: "#8a6d3b", "stroke-width": 1.6 });
    return s;
  }

  function poisson(def, p) {
    var w = p.wing, s = "";
    s += el("polygon", { points: "54,128 " + R(30 + w * 0.5) + ",112 " + R(30 - w * 0.5) + ",146", fill: def.corps, stroke: def.fonc, "stroke-width": 2 });
    s += el("polygon", { points: "56,134 36,130 36,142", fill: def.ventre, stroke: def.fonc, "stroke-width": 1.6 });
    s += el("ellipse", { cx: 100, cy: 132, rx: 44, ry: 28, fill: def.corps, stroke: def.fonc, "stroke-width": 2.4 });
    s += el("ellipse", { cx: 104, cy: 140, rx: 26, ry: 14, fill: def.ventre, opacity: 0.9 });
    s += el("path", { d: "M96 104 q6 -16 18 -18 q0 12 -8 20 z", fill: def.corps, stroke: def.fonc, "stroke-width": 2 });
    s += el("path", { d: "M92 136 q14 " + R(6 + w * 0.4) + " 26 2", stroke: def.fonc, "stroke-width": 2, fill: "none" });
    s += el("path", { d: "M84 124 q6 8 0 16 M96 120 q6 10 0 20 M108 122 q6 9 0 18", stroke: def.fonc, "stroke-width": 1.4, fill: "none", opacity: 0.5 });
    s += el("circle", { cx: 124, cy: 124, r: 6.5, fill: "#ffffff", stroke: def.fonc, "stroke-width": 1.6 });
    if (p.blink) s += el("path", { d: "M118 124 q6 5 12 0", stroke: def.fonc, "stroke-width": 2.2, fill: "none", "stroke-linecap": "round" });
    else s += el("circle", { cx: p.look ? 122.5 : 124, cy: p.look ? 121.5 : 124, r: 3, fill: "#26313f" });
    s += el("path", { d: "M138 136 q5 3 1 7", stroke: def.fonc, "stroke-width": 2, fill: "none", "stroke-linecap": "round" });
    return s;
  }

  function fennec(def, p) {
    var s = "";
    s += el("ellipse", { cx: 70, cy: 58, rx: 15, ry: 24, transform: "rotate(-14 70 58)", fill: def.corps, stroke: def.fonc, "stroke-width": 2.2 });
    s += el("ellipse", { cx: 122, cy: 58, rx: 15, ry: 24, transform: "rotate(14 122 58)", fill: def.corps, stroke: def.fonc, "stroke-width": 2.2 });
    s += el("ellipse", { cx: 71, cy: 62, rx: 8, ry: 15, transform: "rotate(-14 71 62)", fill: "#f6d7c4" });
    s += el("ellipse", { cx: 121, cy: 62, rx: 8, ry: 15, transform: "rotate(14 121 62)", fill: "#f6d7c4" });
    s += el("ellipse", { cx: 96, cy: 146, rx: 33, ry: 28, fill: def.corps, stroke: def.fonc, "stroke-width": 2.4 });
    s += el("ellipse", { cx: 96, cy: 156, rx: 19, ry: 15, fill: def.ventre });
    s += el("ellipse", { cx: 140, cy: 168, rx: 16, ry: 10, transform: "rotate(-24 140 168)", fill: def.corps, stroke: def.fonc, "stroke-width": 2.2 });
    s += el("circle", { cx: 152, cy: 160, r: 6, fill: def.ventre });
    s += el("line", { x1: 84, y1: 174, x2: 84, y2: 186, stroke: def.fonc, "stroke-width": 2.4, "stroke-linecap": "round" });
    s += el("line", { x1: 108, y1: 174, x2: 108, y2: 186, stroke: def.fonc, "stroke-width": 2.4, "stroke-linecap": "round" });
    s += el("circle", { cx: 96, cy: 92, r: 26, fill: def.corps, stroke: def.fonc, "stroke-width": 2.4 });
    s += el("polygon", { points: "90,98 102,98 96,112", fill: def.ventre, stroke: def.fonc, "stroke-width": 1.6 });
    s += el("circle", { cx: 96, cy: 106, r: 2.6, fill: "#3a2a18" });
    if (p.mouth) s += el("ellipse", { cx: 96, cy: 110, rx: 5, ry: 4, fill: "#7a4a12" });
    s += yeux(def, p, 86);
    return s;
  }

  function accessoire(def, p, etat, i) {
    var s = "", q = p.quill || 0, h = i * 2.4;
    if (def.acc === "halo") {
      s += el("ellipse", { cx: 96, cy: 34, rx: 26, ry: 8, fill: "none", stroke: "#e5c15a", "stroke-width": 4 });
      s += el("ellipse", { cx: 96, cy: 34, rx: 26, ry: 8, fill: "none", stroke: "#fff3c4", "stroke-width": 1.6 });
    } else if (def.acc === "livre") {
      s += el("rect", { x: 116, y: R(150 + q * 0.3), width: 34, height: 24, rx: 3, fill: "#8f4a2a", stroke: "#5e2f18", "stroke-width": 2, transform: "rotate(-8 133 " + R(162 + q * 0.3) + ")" });
      s += el("line", { x1: 133, y1: R(150 + q * 0.3), x2: 133, y2: R(174 + q * 0.3), stroke: "#fff3c4", "stroke-width": 2, transform: "rotate(-8 133 " + R(162 + q * 0.3) + ")" });
    } else if (def.acc === "bulles") {
      s += el("circle", { cx: 146, cy: R(96 - h), r: 3, fill: "none", stroke: "#bfe6f7", "stroke-width": 1.6 });
      s += el("circle", { cx: 154, cy: R(78 - h * 1.4), r: 4.4, fill: "none", stroke: "#bfe6f7", "stroke-width": 1.6 });
      s += el("circle", { cx: 142, cy: R(62 - h * 1.8), r: 2.4, fill: "none", stroke: "#bfe6f7", "stroke-width": 1.4 });
    } else if (def.acc === "etoile") {
      s += etoile(150, 34, 9, "#ffd166", 0.9);
      s += etoile(134, 48, 5, "#ffe8a3", 0.7);
    } else if (def.acc === "braises") {
      s += etoile(148, 70, 4, "#ffb347", 0.5);
      s += etincelles(p);
    }
    return s;
  }

  function creature(def, etat, i) {
    var p = params(etat, i), s = "";
    s += el("ellipse", { cx: 96, cy: 196, rx: R(Math.max(24, 50 - p.jump)), ry: 7, fill: "rgba(15,25,45,0.20)" });
    s += "<g transform=\"translate(0," + R(-(p.bob + p.jump)) + ")\">";
    var cle = def.cle;
    if (cle === "cierge") s += cierge(def, p);
    else if (cle === "lion") s += lion(def, p);
    else if (cle === "poisson") s += poisson(def, p);
    else if (cle === "fennec") s += fennec(def, p);
    else if (cle === "chouette") s += chouette(def, p);
    else s += oiseau(def, p);
    s += accessoire(def, p, etat, i);
    s += pensee(p);
    s += "</g>";
    return s;
  }

  function atlasSvg(cle) {
    var def = MASC[cle];
    def.cle = cle;
    var out = ["<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1536\" height=\"2288\" viewBox=\"0 0 1536 2288\">"];
    var e, f, cleEtat;
    for (cleEtat in ETATS) {
      e = ETATS[cleEtat];
      for (f = 0; f < e.n; f++) {
        out.push("<g transform=\"translate(" + (f * FW) + "," + (e.row * FH) + ")\">");
        out.push(creature(def, cleEtat, f));
        out.push("</g>");
      }
    }
    out.push("</svg>");
    return out.join("");
  }

  /* ── feuille de style dynamique (image d atlas en regle CSS, jamais en style inline) ── */
  var styleEl = document.createElement("style");
  styleEl.id = "v584-style";
  var reglesAtlas = [];
  function regleCss(sel, decl) { reglesAtlas.push(sel + "{" + decl + "}"); rafraichirStyle(); }
  function cssBase() {
    return "#v584-pet{position:fixed;left:0;top:0;z-index:calc(var(--z-modal-lg,2000) - 100);"
      + "pointer-events:none;background-repeat:no-repeat;transform:translate(-320px,-320px);"
      + "transition:transform .55s cubic-bezier(.3,.9,.35,1);will-change:transform}";
  }
  function tailleCourante() {
    if (window.innerWidth < 640) return 60;
    var t = parseInt(lit("theo_pets_taille"), 10);
    return (t === 60 || t === 76 || t === 96) ? t : 76;
  }
  function cssDynamique() {
    var t = tailleCourante();
    var k = t / FW, hs = R(FH * k), aws = R(AW * k), ahs = R(AH * k);
    var s = "#v584-pet{width:" + t + "px;height:" + hs + "px;background-size:" + aws + "px " + ahs + "px;}";
    var reduire = false;
    try { reduire = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
    var cleEtat, e, f, stops;
    for (cleEtat in ETATS) {
      e = ETATS[cleEtat];
      if (reduire) {
        if (cleEtat === "idle") s += "#v584-pet[data-anim=\"idle\"]{background-position:0 0;}";
        continue;
      }
      s += "#v584-pet[data-anim=\"" + cleEtat + "\"]{animation:v584-" + cleEtat + " " + e.dur + "s steps(1,end) infinite;}";
      stops = "";
      for (f = 0; f < e.n; f++) {
        stops += (f / e.n * 100).toFixed(4) + "%{background-position:" + R(-f * FW * k) + "px " + R(-e.row * FH * k) + "px;}";
      }
      s += "@keyframes v584-" + cleEtat + "{" + stops + "}";
    }
    return s;
  }
  function rafraichirStyle() { styleEl.textContent = cssBase() + cssDynamique() + reglesAtlas.join(""); }
  rafraichirStyle();
  if (document.head) document.head.appendChild(styleEl);
  else document.documentElement.appendChild(styleEl);

  /* ── ancres : coin bas-gauche / composeur / message suivi ── */
  var host = null, cibleNom = "coin";
  function ciblePos(nom) {
    var w = host ? host.offsetWidth : 76, h = host ? host.offsetHeight : 82;
    var vw = window.innerWidth || 1024, vh = window.innerHeight || 768;
    var mob = vw < 640, x = 14, y = vh - h - (mob ? 96 : 14);
    if (nom === "composeur") {
      var r = document.getElementById("input-area");
      var rr = r ? r.getBoundingClientRect() : null;
      if (rr) { x = rr.left + 16; y = rr.top - h * 0.82; }
    } else if (nom === "message") {
      var ms = document.querySelectorAll("#chat-container .message");
      var m = ms.length ? ms[ms.length - 1] : null;
      if (!m) return ciblePos("composeur");
      var mr = m.getBoundingClientRect();
      x = mr.right - w * 0.7;
      y = mr.top - h + 10;
    }
    x = Math.max(6, Math.min(x, vw - w - 6));
    y = Math.max(6, Math.min(y, vh - h - 6));
    return { x: R(x), y: R(y) };
  }
  function ancre(nom) {
    if (!host) return;
    cibleNom = nom;
    var p = ciblePos(nom);
    host.style.transform = "translate(" + p.x + "px," + p.y + "px)";
  }

  /* ── machine a etats : idle / wave / happy / thinking + voyage ── */
  var seq = 0, quiet = null, rafraichir = null, fluxActif = false, paroleT = 0;
  function animer(a) { if (host) host.setAttribute("data-anim", a); }
  function cacher() {
    seq++;
    if (rafraichir) { clearInterval(rafraichir); rafraichir = null; }
    if (quiet) { clearTimeout(quiet); quiet = null; }
    if (host) { host.remove(); host = null; }
    cibleNom = "coin";
  }
  var atlasFaits = {};
  function assureAtlas(cle) {
    if (atlasFaits[cle]) return;
    var url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(atlasSvg(cle));
    regleCss("#v584-pet[data-pet=\"" + cle + "\"]", "background-image:url(\"" + url + "\")");
    atlasFaits[cle] = true;
  }
  function montrer(cle) {
    if (!host) {
      host = document.createElement("div");
      host.id = "v584-pet";
      host.className = "v584-pet";
      document.body.appendChild(host);
    }
    if (host.getAttribute("data-pet") !== cle) { host.setAttribute("data-pet", cle); assureAtlas(cle); }
    animer("idle");
  }
  function familleDe(ag) {
    if (lit("theo_pets_pet") && lit("theo_pets_pet") !== "auto") return lit("theo_pets_pet");
    if (!ag) return "phenix";
    var t = (ag.name || "") + " " + (ag.desc || "");
    var i;
    for (i = 0; i < FAMILLES.length; i++) if (FAMILLES[i][0].test(t)) return FAMILLES[i][1];
    return "phenix";
  }
  function onAgent(ag) {
    if (!arme() || !ag) { cacher(); return; }
    montrer(familleDe(ag));
    ancre("composeur");
    animer("wave");
    var t = ++seq;
    if (quiet) { clearTimeout(quiet); quiet = null; }
    quiet = setTimeout(function () { if (t === seq) animer("idle"); }, 2300);
  }
  function fluxDebut() {
    if (!arme() || !host) return;
    fluxActif = true;
    var t = ++seq;
    if (quiet) { clearTimeout(quiet); quiet = null; }
    ancre("message");
    animer("thinking");
    if (rafraichir) clearInterval(rafraichir);
    rafraichir = setInterval(function () { if (t === seq && fluxActif && cibleNom === "message") ancre("message"); }, 700);
  }
  function paroleRecente() { return (Date.now() - paroleT) < 2000; }
  function fluxFin() {
    fluxActif = false;
    if (rafraichir) { clearInterval(rafraichir); rafraichir = null; }
    if (!arme() || !host) return;
    var t = ++seq;
    animer("happy");
    ancre("message");
    if (quiet) { clearTimeout(quiet); quiet = null; }
    quiet = setTimeout(function () {
      if (t === seq && !paroleRecente() && !fluxActif) { ancre("coin"); animer("idle"); }
    }, 2200);
  }
  function parole() {
    if (!arme() || !host) return;
    paroleT = Date.now();
    var t = ++seq;
    if (rafraichir) { clearInterval(rafraichir); rafraichir = null; }
    ancre("message");
    animer("wave");
    if (quiet) { clearTimeout(quiet); quiet = null; }
    quiet = setTimeout(function () {
      if (t === seq && !fluxActif) { ancre("coin"); animer("idle"); }
    }, 1700);
  }

  /* ── wrappers marques : le compagnon suit TOUT chemin de selection ── */
  function enroulerFlux() {
    var f = window.callLLMStream;
    if (typeof f !== "function" || f.__v584W) return;
    var w = function () {
      try { fluxDebut(); } catch (e) {}
      var r;
      try { r = f.apply(this, arguments); }
      catch (e) { try { fluxFin(); } catch (e2) {} throw e; }
      if (r && typeof r.then === "function") {
        r.then(function () { try { fluxFin(); } catch (e) {} }, function () { try { fluxFin(); } catch (e) {} });
      } else { try { fluxFin(); } catch (e) {} }
      return r;
    };
    for (var k in f) { try { w[k] = f[k]; } catch (e) {} }
    w.__v584W = true;
    window.callLLMStream = w;
  }
  function enroulerTts() {
    var f = window.ttsEmission;
    if (typeof f !== "function" || f.__v584W) return;
    var w = function () {
      try { parole(); } catch (e) {}
      return f.apply(this, arguments);
    };
    for (var k in f) { try { w[k] = f[k]; } catch (e) {} }
    w.__v584W = true;
    window.ttsEmission = w;
  }
  function reaffirmer() { enroulerFlux(); enroulerTts(); }

  /* ── scrutateur de selection d agent (tous chemins : modal, panneau, menus) ── */
  var dernierAgent = "__aucun__";
  setInterval(function () {
    reaffirmer();
    if (!arme()) { if (host) cacher(); return; }
    var ag = null;
    try { ag = state.agent || null; } catch (e) { ag = null; }
    if (ag !== dernierAgent) { dernierAgent = ag; onAgent(ag); }
  }, 600);

  /* ── reglages injectes dans PARAMETRES → mouvement ── */
  function monterReglages() {
    var pan = document.getElementById("settings-panneau-motion");
    if (!pan || document.getElementById("v584-on")) return false;
    var g = document.createElement("div");
    g.className = "field-group";
    var t = document.createElement("div");
    t.className = "field-label";
    t.textContent = "🐾 Compagnons (Pets) — mascottes des agents";
    g.appendChild(t);
    var row = document.createElement("label");
    row.className = "field-label";
    row.style.cssText = "display:flex;align-items:center;gap:8px;font-weight:600;cursor:pointer;margin:6px 0;";
    var chk = document.createElement("input");
    chk.type = "checkbox"; chk.id = "v584-on"; chk.checked = arme();
    row.appendChild(chk);
    row.appendChild(document.createTextNode("Afficher le compagnon quand un agent est sélectionné"));
    g.appendChild(row);
    var row2 = document.createElement("div");
    row2.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;margin:6px 0;";
    var labT = document.createElement("span");
    labT.className = "field-label"; labT.style.cssText = "margin:0;";
    labT.textContent = "Taille";
    var selT = document.createElement("select");
    selT.className = "field-input field-select"; selT.id = "v584-taille";
    selT.style.cssText = "max-width:150px;";
    var opT = [["60", "Petit"], ["76", "Normal"], ["96", "Grand"]];
    for (var i = 0; i < opT.length; i++) {
      var o = document.createElement("option");
      o.value = opT[i][0]; o.textContent = opT[i][1];
      if (String(tailleCourante()) === opT[i][0] || (window.innerWidth >= 640 && (lit("theo_pets_taille") || "76") === opT[i][0])) o.selected = true;
      selT.appendChild(o);
    }
    var labP = document.createElement("span");
    labP.className = "field-label"; labP.style.cssText = "margin:0;";
    labP.textContent = "Mascotte";
    var selP = document.createElement("select");
    selP.className = "field-input field-select"; selP.id = "v584-pet-sel";
    selP.style.cssText = "max-width:230px;";
    var o0 = document.createElement("option");
    o0.value = "auto"; o0.textContent = "Auto — selon la famille de l’agent";
    if ((lit("theo_pets_pet") || "auto") === "auto") o0.selected = true;
    selP.appendChild(o0);
    var cle;
    for (cle in MASC) {
      var op = document.createElement("option");
      op.value = cle; op.textContent = MASC[cle].nom;
      if (lit("theo_pets_pet") === cle) op.selected = true;
      selP.appendChild(op);
    }
    row2.appendChild(labT); row2.appendChild(selT);
    row2.appendChild(labP); row2.appendChild(selP);
    g.appendChild(row2);
    var hint = document.createElement("div");
    hint.className = "field-hint";
    hint.textContent = "Le compagnon vit près du composeur, suit votre question pendant la génération, s’agite quand il parle, puis regagne son coin en bas à gauche. Mascottes au format OpenPets (MIT) — import de compagnons supplémentaires à venir.";
    g.appendChild(hint);
    chk.addEventListener("change", function () {
      ecrit("theo_pets", chk.checked ? "1" : "0");
      appliquer();
    });
    selT.addEventListener("change", function () {
      ecrit("theo_pets_taille", selT.value);
      if (armé()) montrer(familleDe(etatAgent()));
      rafraichirStyle();
      ancre(cibleNom);
    });
    selP.addEventListener("change", function () {
      ecrit("theo_pets_pet", selP.value);
      if (armé()) onAgent(etatAgent());
    });
    pan.appendChild(g);
    return true;
  }
  function etatAgent() { try { return state.agent || null; } catch (e) { return null; } }
  function appliquer() {
    rafraichirStyle();
    if (arme()) {
      var ag = etatAgent();
      dernierAgent = ag;
      if (ag) onAgent(ag); else cacher();
    } else cacher();
  }
  var essais = 0;
  var ivRegl = setInterval(function () {
    if (monterReglages()) { clearInterval(ivRegl); return; }
    if (++essais > 50) clearInterval(ivRegl);
  }, 900);

  /* ── rappels redimensionnement / defilement (v128 : rAF, pas de burinage) ── */
  var rafP = 0;
  window.addEventListener("resize", function () {
    if (rafP) return;
    rafP = requestAnimationFrame(function () {
      rafP = 0;
      if (!host) return;
      rafraichirStyle();
      ancre(cibleNom);
    });
  });
  var chatEl = document.getElementById("chat-container");
  if (chatEl) {
    chatEl.addEventListener("scroll", function () {
      if (!host || cibleNom !== "message" || rafP) return;
      rafP = requestAnimationFrame(function () { rafP = 0; ancre("message"); });
    }, { passive: true });
  }

  /* ── API publique (bancs + futurs lots) ── */
  window.__v584Pets = {
    atlas: atlasSvg,
    etat: function () {
      return {
        arme: arme(),
        visible: !!host,
        pet: host ? host.getAttribute("data-pet") : null,
        anim: host ? host.getAttribute("data-anim") : null,
        cible: host ? cibleNom : null
      };
    },
    appliquer: appliquer,
    familleDe: familleDe
  };
})();
