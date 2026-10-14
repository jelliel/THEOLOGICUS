
/* ═══════════════════════════════════════════════════════════════════
   v579 — CHAPELET GUIDÉ À LA VOIX. Mystères du jour : dim/sam =
   joyeux, mar/ven = douloureux, mer/dim = glorieux, jeu = lumineux.
   Deux modes : « complet » (toute la prière est parlée) et « guides »
   (les Ave sont comptés avec une courte pause). La voix suit
   PARAMÈTRES → Lecture vocale (ttsEmission → Supertonic 3 / système).
   Réglage : theo_adeodat… non — v579_silencieux. ════════════════════ */
(function () {
  "use strict";
  if (window.__v579Chapelet) return;
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">").replace(/"/g, "&quot;"); }

  const MYST = {
    joyeux: { nom: "Mystères joyeux", titres: ["L’Annonciation", "La Visitation", "La Nativité de Jésus", "La Présentation de Jésus au Temple", "Le Recouvrement de Jésus au Temple"],
      refs: ["Lc 1:26-38", "Lc 1:39-56", "Lc 2:1-20", "Lc 2:22-35", "Lc 2:41-52"],
      meds: ["L’ange Gabriel annonce à Marie qu’elle sera Mère de Dieu.", "Élisabeth bénit Marie : « Bénie êtes-vous entre toutes les femmes. »", "Jésus naît à Bethléem, dans la pauvreté d’une étable.", "Jésus est présenté au Temple ; Siméon reconnaît la lumière des nations.", "Jésus retrouvé au Temple, au milieu des docteurs."] },
    douloureux: { nom: "Mystères douloureux", titres: ["L’Agonie au Jardin des Oliviers", "La Flagellation", "Le Couronnement d’épines", "Le Portement de croix", "La Crucifixion et la mort de Jésus"],
      refs: ["Mt 26:36-46", "Mc 15:6-15", "Mc 15:16-20", "Jn 19:16-22", "Jn 19:25-37"],
      meds: ["« Que ma volonté se fasse, non la tienne. » Jésus prie et suinte le sang.", "Jésus est flagellé par ordre de Pilate, par amour pour nous.", "On couronne Jésus d’épines ; il est raillé comme Roi.", "Jésus porte sa croix vers le Golgotha, en silence.", "Jésus meurt sur la croix, remettant son esprit entre les mains du Père."] },
    glorieux: { nom: "Mystères glorieux", titres: ["La Résurrection de Jésus", "L’Ascension", "La Pentecôte", "L’Assomption de Marie", "Le Couronnement de Marie"],
      refs: ["Mt 28:1-10", "Ac 1:6-12", "Ac 2:1-13", "Lc 1:39-56 (tradition)", "Ap 12:1-6 (tradition)"],
      meds: ["Le tombeau est vide : Jésus est ressuscité, alléluia !", "Jésus monte au ciel et siège à la droite du Père.", "L’Esprit-Saint descend sur l’Église naissante, en langues de feu.", "Marie est élevée corps et âme au ciel.", "Marie est couronnée Reine du ciel et de la terre."] },
    lumineux: { nom: "Mystères lumineux", titres: ["Le Baptême de Jésus au Jourdain", "Les Noces de Cana", "L’annonce du Royaume", "La Transfiguration", "L’institution de l’Eucharistie"],
      refs: ["Mt 3:13-17", "Jn 2:1-11", "Mc 1:14-15", "Lc 9:28-36", "Mt 26:26-28"],
      meds: ["Le Père proclame : « Celui-ci est mon Fils bien-aimé. »", "Premier signe : l’eau devient vin, à la demande de Marie.", "« Convertissez-vous et croyez à la Bonne Nouvelle. »", "Sur la montagne, le visage de Jésus brille comme le soleil.", "« Ceci est mon corps, ceci est mon sang » — Jésus se donne en nourriture."] }
  };
  const PRIERES = {
    signe: "Au nom du Père, et du Fils, et du Saint-Esprit. Amen.",
    credo: "Je crois en Dieu, le Père tout-puissant, créateur du ciel et de la terre. Et en Jésus-Christ, son unique Fils, notre Seigneur, qui a été conçu du Saint-Esprit, est né de la Vierge Marie, a souffert sous Ponce Pilate, a été crucifié, est mort, a été enseveli, est descendu aux enfers, le troisième jour est ressuscité des morts, est monté aux cieux, est assis à la droite de Dieu le Père tout-puissant, d’où il viendra juger les vivants et les morts. Je crois en l’Esprit-Saint, à la sainte Église catholique, à la communion des saints, à la rémission des péchés, à la résurrection de la chair, à la vie éternelle. Amen.",
    pater: "Notre Père qui es aux cieux, que ton nom soit sanctifié, que ton règne vienne, que ta volonté soit faite sur la terre comme au ciel. Donne-nous aujourd’hui notre pain de ce jour. Pardonne-nous nos offenses, comme nous pardonnons aussi à ceux qui nous ont offensés. Et ne nous soumets pas à la tentation, mais délivre-nous du mal. Amen.",
    ave: "Je vous salue Marie, pleine de grâces, le Seigneur est avec vous. Vous êtes bénie entre toutes les femmes, et Jésus, le fruit de vos entrailles, est béni. Sainte Marie, Mère de Dieu, priez pour nous, pauvres pécheurs, maintenant et à l’heure de notre mort. Amen.",
    gloire: "Gloire au Père, et au Fils, et au Saint-Esprit, comme il était au commencement, maintenant et toujours, dans les siècles des siècles. Amen.",
    jesus: "Ô mon Jésus, pardonnez-nous nos péchés, préservez-nous du feu de l’enfer et conduisez au ciel toutes les âmes, surtout celles qui ont le plus besoin de votre miséricorde.",
    salve: "Salut, ô Reine, Mère de miséricorde, notre vie, notre douceur et notre espérance, salut ! Nous crions vers vous, enfants d’Ève ; vers vous nous soupirons, gémissants et pleurant dans cette vallée de larmes. Et cependant, ô notre avocate, tournez vers nous votre regard miséricordieux ; et, après cet exil, montrez-nous Jésus, le fruit béni de vos entrailles. Ô clémente, ô pieuse, ô douce Vierge Marie. Priez pour nous, sainte Mère de Dieu, afin que nous soyons rendus dignes des promesses de Notre-Seigneur Jésus-Christ. Amen."
  };
  const MOTS_AVE = ["un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix"];
  function setDuJour(d) {
    const j = (d || new Date()).getDay();
    return (j === 0 || j === 3 || j === 6) ? "glorieux" : (j === 2 || j === 5 ? "douloureux" : (j === 4 ? "lumineux" : "joyeux"));
  }

  let modal = null, steps = [], idx = 0, enMarche = false, timer = null;
  let silencieux = false;
  try { silencieux = localStorage.getItem("v579_silencieux") === "1"; } catch (e) {}
  function setSilencieux(v) { silencieux = !!v; try { localStorage.setItem("v579_silencieux", silencieux ? "1" : "0"); } catch (e) {} }

  function construire(setCle) {
    const M = MYST[setCle];
    const st = [];
    st.push({ k: "signe", t: PRIERES.signe });
    st.push({ k: "credo", t: PRIERES.credo });
    for (let i = 0; i < 5; i++) {
      st.push({ k: "mystere", n: i, t: "Premier|Deuxième|Troisième|Quatrième|Cinquième".split("|")[i] + " mystère : " + M.titres[i] + " (" + M.refs[i] + "). " + M.meds[i] });
      st.push({ k: "pater", t: PRIERES.pater });
      for (let a = 0; a < 10; a++) st.push({ k: "ave", n: a, t: silencieux ? (MOTS_AVE[a] + ".") : PRIERES.ave });
      st.push({ k: "gloire", t: PRIERES.gloire });
      st.push({ k: "jesus", t: PRIERES.jesus });
    }
    st.push({ k: "salve", t: PRIERES.salve });
    return st;
  }
  function majUI() {
    if (!modal) return;
    const s = steps[idx] || null;
    const t = modal.querySelector("#v579-cour");
    const c = modal.querySelector("#v579-compte");
    if (t) t.textContent = s ? s.t : "Que le Seigneur vous bénisse.";
    if (c) {
      const M = MYST[modal.getAttribute("data-set") || setDuJour()];
      let ligne = M.nom;
      if (s && s.k === "ave") ligne += " — Ave " + MOTS_AVE[s.n] + " (" + (s.n + 1) + "/10)";
      else if (s && s.n != null) ligne += " — " + (s.n + 1) + "ᵉ dizaine";
      c.textContent = ligne + " · " + (idx + 1) + "/" + steps.length;
    }
  }
  function jouer() {
    if (!enMarche) return;
    if (idx >= steps.length) { finir(); return; }
    majUI();
    const s = steps[idx];
    if (s.k === "ave" && silencieux) {
      timer = setTimeout(function () { idx++; jouer(); }, 2200);
    } else {
      try {
        if (typeof ttsEmission === "function") ttsEmission(s.t, "francais", function () { if (!enMarche) return; idx++; jouer(); }, function () { if (!enMarche) return; idx++; jouer(); });
        else { timer = setTimeout(function () { idx++; jouer(); }, 2500); }
      } catch (e) { timer = setTimeout(function () { idx++; jouer(); }, 2500); }
    }
  }
  function finir() {
    enMarche = false;
    majUI();
    toast("📿 Chapelet achevé — que la Vierge Marie vous garde.", "success");
  }
  function stop() {
    enMarche = false;
    if (timer) { clearTimeout(timer); timer = null; }
    try { if (typeof ttsStop === "function") ttsStop(); } catch (e) {}
  }


  function panneau() {
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "v579-modal";
    modal.innerHTML = '<style>#v579-modal{position:fixed;inset:0;z-index:140960;display:none;align-items:flex-start;justify-content:center;background:rgba(2,6,12,.72);backdrop-filter:blur(4px)}#v579-modal.open{display:flex}#v579-modal .b{width:min(620px,95vw);max-height:88vh;margin-top:5vh;display:flex;flex-direction:column;background:var(--ui-panel,#0d1626);border:1px solid var(--ui-border,#2a2a3a);border-radius:12px;box-shadow:0 18px 60px rgba(0,0,0,.6);overflow:hidden}#v579-modal .hd{display:flex;align-items:center;gap:.5rem;padding:.7rem .9rem;border-bottom:1px solid var(--ui-border,#2a2a3a)}#v579-modal .hd h3{margin:0;font-size:.95rem;color:var(--ui-accent,#e5c15a);flex:1}#v579-modal .corps{padding:.7rem .9rem;display:flex;flex-direction:column;gap:.55rem;overflow:auto}#v579-modal #v579-cour{min-height:5.2em;background:rgba(255,255,255,.04);border:1px solid var(--ui-border,#2a2a3a);border-radius:8px;padding:.6rem;font-size:.9rem;line-height:1.6}#v579-modal #v579-compte{font-size:.7rem;color:var(--ui-dim,#8a8896)}#v579-modal .cts{display:flex;gap:.4rem;flex-wrap:wrap}#v579-modal .cts button{background:rgba(79,142,247,.14);color:#cfe0ff;border:1px solid rgba(79,142,247,.35);border-radius:8px;padding:.35rem .7rem;cursor:pointer;font-size:.78rem}</style>'
      + '<div class="b"><div class="hd"><h3>📿 Chapelet</h3><label style="font-size:.66rem;color:var(--ui-dim,#8a8896);display:flex;gap:.3rem;align-items:center;cursor:pointer"><input type="checkbox" id="v579-sil" style="accent-color:#e5c15a"> Ave comptés</label><button type="button" id="v579-x" style="background:none;border:none;color:inherit;font-size:16px;cursor:pointer">✕</button></div>'
      + '<div class="corps"><div id="v579-compte"></div><div id="v579-cour"></div>'
      + '<div class="cts"><button type="button" id="v579-play">▶ Prier</button><button type="button" id="v579-pause">⏸ Pause</button><button type="button" id="v579-prec">◀ Précédent</button><button type="button" id="v579-suiv">Suivant ▶</button><button type="button" id="v579-stop">⏹ Arrêter</button></div></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener("click", function (e) { if (e.target === modal) { stop(); modal.classList.remove("open"); } });
    modal.querySelector("#v579-x").addEventListener("click", function () { stop(); modal.classList.remove("open"); });
    modal.querySelector("#v579-play").addEventListener("click", function () {
      if (idx >= steps.length) idx = 0;
      enMarche = true;
      if (idx === 0 && modal.querySelector("#v579-cour").textContent.indexOf(steps[0].t) === -1) majUI();
      jouer();
    });
    modal.querySelector("#v579-pause").addEventListener("click", function () { stop(); });
    modal.querySelector("#v579-prec").addEventListener("click", function () { if (idx > 0) idx--; majUI(); });
    modal.querySelector("#v579-suiv").addEventListener("click", function () { stop(); if (idx < steps.length) idx++; majUI(); });
    modal.querySelector("#v579-stop").addEventListener("click", function () { stop(); idx = 0; majUI(); });
    const sil = modal.querySelector("#v579-sil");
    sil.checked = silencieux;
    sil.addEventListener("change", function () {
      setSilencieux(sil.checked);
      const setCle = modal.getAttribute("data-set") || setDuJour();
      steps = construire(setCle);
      majUI();
      toast(silencieux ? "📿 Ave comptés — seuls les mystères et oraisons sont parlés" : "📿 Mode complet — toute la prière est parlée", "info");
    });
    return modal;
  }
  function ouvrir() {
    const setCle = setDuJour();
    steps = construire(setCle);
    idx = 0; enMarche = false;
    panneau().setAttribute("data-set", setCle);
    panneau().classList.add("open");
    majUI();
  }
  function menuEntry() {
    const m = document.getElementById("v6-more-menu");
    if (!m || m.querySelector("#v579-menu-entry")) return;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "hud-btn";
    b.id = "v579-menu-entry";
    b.textContent = "📿 CHAPELET";
    b.title = "Chapelet guidé à la voix — mystères du jour";
    b.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); ouvrir(); });
    m.appendChild(b);
  }
  function init() { menuEntry(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  const ivM = setInterval(function () { menuEntry(); if (document.getElementById("v579-menu-entry")) clearInterval(ivM); }, 700);
  window.__v579Chapelet = { ouvrir: ouvrir, setDuJour: setDuJour, construire: construire, stop: stop, getIdx: function () { return idx; } };
})();

