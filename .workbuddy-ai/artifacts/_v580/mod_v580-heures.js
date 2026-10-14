
/* ═══════════════════════════════════════════════════════════════════
   v580 — LITURGIE DES HEURES SIMPLIFIÉE (matin / soir), guidée à la
   voix. Psaumes + cantiques lus hors-ligne (Segond) ; lectures brèves
   et intercessions embarquées ; version simplifiée, inspirée de la
   Liturgie des Heures (ce n’est pas l’office officiel complet).
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  if (window.__v580Heures) return;
  function toast(m, k) { try { if (typeof window.toast === "function") window.toast(m, k || "info"); } catch (e) {} }

  const PSAUMES_MATIN = { 0: 63, 1: 5, 2: 19, 3: 40, 4: 63, 5: 51, 6: 92 };
  const PSAUMES_SOIR = { 0: 141, 1: 121, 2: 126, 3: 131, 4: 133, 5: 130, 6: 134 };
  const LECT_MATIN = ["Jn 15:5", "Rm 8:28", "2Co 4:16", "Mt 11:28", "Jn 14:27", "Ga 2:20", "Lm 3:22-23"];
  const LECT_SOIR = ["Ph 4:6-7", "Mt 6:31-33", "Ps 4:9", "1P 5:7", "Jn 16:33", "1Jn 4:18", "Dt 31:6"];
  const INTERC_MATIN = ["Pour l’Église, appelée à rayonner ce jour : Seigneur, exauce-nous. | Pour ceux qui travaillent et portent le monde : Seigneur, exauce-nous. | Pour les malades et les souffrants : Seigneur, exauce-nous. | Pour nous-mêmes, que cette journée soit vécue avec toi : Seigneur, exauce-nous."];
  const INTERC_SOIR = ["Pour l’Église qui se rassemble ce soir : Seigneur, exauce-nous. | Pour les veilleurs de la nuit, malades et isolés : Seigneur, exauce-nous. | Pour les défunts, que la lumière leur soit donnée : Seigneur, exauce-nous. | Pour nous, que la nuit soit un gage du repos en Dieu : Seigneur, exauce-nous."];
  const PATER = "Notre Père qui es aux cieux, que ton nom soit sanctifié, que ton règne vienne, que ta volonté soit faite sur la terre comme au ciel. Donne-nous aujourd’hui notre pain de ce jour. Pardonne-nous nos offenses, comme nous pardonnons aussi à ceux qui nous ont offensés. Et ne nous soumets pas à la tentation, mais délivre-nous du mal. Amen.";

  function parseFichier(t) {
    const ancre = t.indexOf("||{})[");
    let pos = -1;
    if (ancre >= 0) pos = t.indexOf("=", ancre);
    if (pos < 0) pos = t.lastIndexOf("=");
    return JSON.parse(t.slice(pos + 1).replace(/;\s*$/, ""));
  }
  async function textePassage(fichier, c, v1, v2) {
    try {
      const r = await fetch(fichier);
      if (!r.ok) return "";
      const j = parseFichier(await r.text());
      const ch = j[c];
      if (!ch || typeof ch !== "object") return "";
      const out = [];
      for (let v = v1; v <= v2; v++) {
        const t = ch[v];
        if (typeof t === "string" && t) out.push(t);
      }
      return out.join(" ");
    } catch (e) { return ""; }
  }
  function parsePlage(ref) {
    /* « Lc 1:68-79 » ou « Ps 4:9 » → [fichier, c, v1, v2] (réfs internes maîtrisées) */
    const M2 = /^(Lc)\s*(\d+):(\d+)(?:-(\d+))?$/.exec(ref.trim());
    if (M2) return ["bible/b42.js", +M2[2], +M2[3], M2[4] ? +M2[4] : +M2[3]];
    return null;
  }

  async function construire(office, dIn) {
    const d = dIn || new Date();
    const j = d.getDay();
    const st = [];
    if (office === "matin") {
      st.push({ k: "signe", t: "Au nom du Père, et du Fils, et du Saint-Esprit. Amen." });
      st.push({ k: "invoc", t: "Seigneur, ouvre mes lèvres, et ma bouche publiera ta louange." });
      const ps = PSAUMES_MATIN[j];
      const txPs = await textePassage("bible/b19.js", ps, 1, 30);
      st.push({ k: "psaume", ref: "Psaume " + ps, t: txPs || ("Psaume " + ps + " (texte indisponible hors-ligne).") });
      const refL = LECT_MATIN[j];
      st.push({ k: "lecture", ref: refL, t: "Parole de Dieu pour ce matin : " + refL + "." });
      const ben = parsePlage("Lc 1:68-79");
      const txBen = await textePassage(ben[0], ben[1], ben[2], ben[3]);
      st.push({ k: "cantique", ref: "Lc 1:68-79 (Benedictus)", t: txBen || "Cantique de Zacharie (Lc 1:68-79)." });
      st.push({ k: "interc", t: INTERC_MATIN[0] });
      st.push({ k: "pater", t: PATER });
      st.push({ k: "oraison", t: "Nous vous rendons grâce, Dieu tout-puissant, pour cette nuit passée et pour ce jour qui commence : conduisez nos pas, éclairez nos choix, gardez nos cœurs dans votre paix. Par le Christ notre Seigneur. Amen." });
      st.push({ k: "fin", t: "Bénissons le Seigneur. — Nous rendons grâce à Dieu." });
    } else {
      st.push({ k: "signe", t: "Au nom du Père, et du Fils, et du Saint-Esprit. Amen." });
      st.push({ k: "invoc", t: "Rappelons la présence de Dieu et rendons-lui grâce pour ce jour." });
      const ps = PSAUMES_SOIR[j];
      const txPs = await textePassage("bible/b19.js", ps, 1, 30);
      st.push({ k: "psaume", ref: "Psaume " + ps, t: txPs || ("Psaume " + ps + " (texte indisponible hors-ligne).") });
      const refL = LECT_SOIR[j];
      st.push({ k: "lecture", ref: refL, t: "Parole de Dieu pour ce soir : " + refL + "." });
      const mag = parsePlage("Lc 1:46-55");
      const txMag = await textePassage(mag[0], mag[1], mag[2], mag[3]);
      st.push({ k: "cantique", ref: "Lc 1:46-55 (Magnificat)", t: txMag || "Cantique de Marie (Lc 1:46-55)." });
      st.push({ k: "interc", t: INTERC_SOIR[0] });
      st.push({ k: "pater", t: PATER });
      st.push({ k: "oraison", t: "Que le tout-puissant Seigneur nous accorde une nuit paisible et une fin sainte. Nous vous bénissons, Seigneur, pour ce jour qui s’achève : pardonnez nos manquements et garde-nous dans votre paix. Amen." });
      st.push({ k: "fin", t: "Que le tout-puissant nous accorde une nuit de repos et une matinée de joie. Amen." });
    }
    return st;
  }

  let modal = null, steps = [], idx = 0, enMarche = false, timer = null, officeVue = "matin";
  function majUI() {
    if (!modal) return;
    const s = steps[idx] || null;
    const t = modal.querySelector("#v580-cour");
    const c = modal.querySelector("#v580-compte");
    if (t) t.textContent = s ? (s.ref ? "[" + s.ref + "] " : "") + s.t : "Priez pour nous.";
    if (c) c.textContent = (officeVue === "matin" ? "Office du matin" : "Office du soir") + " · étape " + (idx + 1) + "/" + steps.length;
  }
  function jouer() {
    if (!enMarche) return;
    if (idx >= steps.length) { enMarche = false; toast("✝ Office achevé — que la paix du Seigneur demeure avec vous.", "success"); majUI(); return; }
    majUI();
    const s = steps[idx];
    try {
      if (typeof ttsEmission === "function") ttsEmission(s.t.slice(0, 1400), "francais", function () { if (!enMarche) return; idx++; jouer(); }, function () { if (!enMarche) return; idx++; jouer(); });
      else { timer = setTimeout(function () { idx++; jouer(); }, 4000); }
    } catch (e) { timer = setTimeout(function () { idx++; jouer(); }, 4000); }
  }
  function stop() {
    enMarche = false;
    if (timer) { clearTimeout(timer); timer = null; }
    try { if (typeof ttsStop === "function") ttsStop(); } catch (e) {}
  }

  function panneau() {
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "v580-modal";
    modal.innerHTML = '<style>#v580-modal{position:fixed;inset:0;z-index:140960;display:none;align-items:flex-start;justify-content:center;background:rgba(2,6,12,.72);backdrop-filter:blur(4px)}#v580-modal.open{display:flex}#v580-modal .b{width:min(640px,95vw);max-height:88vh;margin-top:5vh;display:flex;flex-direction:column;background:var(--ui-panel,#0d1626);border:1px solid var(--ui-border,#2a2a3a);border-radius:12px;box-shadow:0 18px 60px rgba(0,0,0,.6);overflow:hidden}#v580-modal .hd{display:flex;align-items:center;gap:.5rem;padding:.7rem .9rem;border-bottom:1px solid var(--ui-border,#2a2a3a)}#v580-modal .hd h3{margin:0;font-size:.95rem;color:var(--ui-accent,#e5c15a);flex:1}#v580-modal .corps{padding:.7rem .9rem;display:flex;flex-direction:column;gap:.55rem;overflow:auto}#v580-modal #v580-cour{min-height:6em;background:rgba(255,255,255,.04);border:1px solid var(--ui-border,#2a2a3a);border-radius:8px;padding:.6rem;font-size:.85rem;line-height:1.6;white-space:pre-wrap}#v580-modal #v580-compte{font-size:.7rem;color:var(--ui-dim,#8a8896)}#v580-modal .cts{display:flex;gap:.4rem;flex-wrap:wrap}#v580-modal .cts button{background:rgba(79,142,247,.14);color:#cfe0ff;border:1px solid rgba(79,142,247,.35);border-radius:8px;padding:.35rem .7rem;cursor:pointer;font-size:.78rem}</style>'
      + '<div class="b"><div class="hd"><h3>⏳ Liturgie des Heures (simplifiée)</h3><button type="button" id="v580-x" style="background:none;border:none;color:inherit;font-size:16px;cursor:pointer">✕</button></div>'
      + '<div class="corps"><div id="v580-compte"></div><div id="v580-cour"></div>'
      + '<div class="cts"><button type="button" id="v580-matin">🌅 Matin</button><button type="button" id="v580-soir">🌙 Soir</button><button type="button" id="v580-play">▶ Prier</button><button type="button" id="v580-pause">⏸ Pause</button><button type="button" id="v580-suiv">Suivant ▶</button><button type="button" id="v580-stop">⏹ Arrêter</button></div>'
      + '<div style="font-size:.62rem;color:var(--ui-dim,#8a8896)">Version simplifiée, inspirée de la Liturgie des Heures — psaumes et cantiques lus hors-ligne (Segond). Ce n’est pas l’office officiel complet.</div></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener("click", function (e) { if (e.target === modal) { stop(); modal.classList.remove("open"); } });
    modal.querySelector("#v580-x").addEventListener("click", function () { stop(); modal.classList.remove("open"); });
    modal.querySelector("#v580-matin").addEventListener("click", function () { charger("matin"); });
    modal.querySelector("#v580-soir").addEventListener("click", function () { charger("soir"); });
    modal.querySelector("#v580-play").addEventListener("click", function () {
      if (idx >= steps.length) idx = 0;
      enMarche = true;
      jouer();
    });
    modal.querySelector("#v580-pause").addEventListener("click", stop);
    modal.querySelector("#v580-suiv").addEventListener("click", function () { stop(); if (idx < steps.length) idx++; majUI(); });
    modal.querySelector("#v580-stop").addEventListener("click", function () { stop(); idx = 0; majUI(); });
    return modal;
  }
  async function charger(office, dIn) {
    officeVue = office;
    panneau().classList.add("open");
    const corps = modal.querySelector("#v580-cour");
    corps.textContent = "Préparation hors-ligne du psaume et du cantique…";
    steps = await construire(office, dIn);
    idx = 0; enMarche = false;
    majUI();
  }
  function ouvrir() {
    panneau().classList.add("open");
    const h = new Date().getHours();
    charger(h >= 8 && h < 17 ? "matin" : "soir");   /* bascule manuelle dans le panneau */
  }
  function menuEntry() {
    const m = document.getElementById("v6-more-menu");
    if (!m || m.querySelector("#v580-menu-entry")) return;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "hud-btn";
    b.id = "v580-menu-entry";
    b.textContent = "⏳ HEURES (matin/soir)";
    b.title = "Liturgie des Heures simplifiée, guidée à la voix";
    b.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); ouvrir(); });
    m.appendChild(b);
  }
  function init() { menuEntry(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  const ivM = setInterval(function () { menuEntry(); if (document.getElementById("v580-menu-entry")) clearInterval(ivM); }, 750);
  window.__v580Heures = { ouvrir: ouvrir, charger: charger, construire: construire, stop: stop, getIdx: function () { return idx; } };
})();

