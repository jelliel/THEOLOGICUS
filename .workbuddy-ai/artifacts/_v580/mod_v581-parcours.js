
/* ═══════════════════════════════════════════════════════════════════
   v581 — PARCOURS PATRISTIQUES THÉMATIQUES. Six thèmes, cinq étapes
   chacun : verbe biblique + citation patristique notoire (auteur,
   œuvre, époque indiqués — traductions courantes) + méditation.
   Actions : ⚖ versions, ▶ lire, 🕊 approfondir avec Adeodat.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  if (window.__v581Parcours) return;
  function toast(m, k) { try { if (typeof window.toast === "function") window.toast(m, k || "info"); } catch (e) {} }

  const THEMES = {
    eucharistie: {
      nom: "L’Eucharistie chez les Pères",
      etapes: [
        { bib: "Jn 6:53-56", a: "saint Ignace d’Antioche", o: "Lettre aux Éphésiens (~107)", q: "L’Eucharistie est « le remède d’immortalité, l’antidote pour ne pas mourir, mais vivre en Jésus-Christ pour toujours. »", med: "Depuis l’aube du IIe siècle, l’Eucharistie est vécue comme vie qui se donne." },
        { bib: "1Co 11:23-26", a: "saint Justin martyr", o: "Première Apologie (~155)", q: "« Ce n’est pas du pain ordinaire ni une boisson ordinaire : de même que le Verbe s’est fait chair, ainsi cette nourriture consacrée devient chair et sang de Jésus. »", med: "La foi des premiers siècles confessait la réalité du Corps et du Sang." },
        { bib: "Mc 14:22-24", a: "saint Irénée de Lyon", o: "Adversus haereses IV,18,5 (~180)", q: "« Comment peuvent-ils dire que la chair est incapable du don de Dieu, alors qu’elle est nourrie du Corps et du Sang du Seigneur ? »", med: "Notre chair, nourrie de l’Eucharistie, est destinée à la résurrection." },
        { bib: "Jn 6:51", a: "saint Ambroise de Milan", o: "De sacramentis IV (~390)", q: "« Si la bénédiction a pu changer la nature de l’eau au baptême, peut-elle ne pas changer la nature du pain et du vin ? »", med: "La puissance créatrice de la Parole s’exerce encore à chaque messe." },
        { bib: "Lc 24:30-35", a: "saint Augustin d’Hippone", o: "Sermons (~400)", q: "« Sois ce que tu reçois ; reçois ce que tu es. »", med: "Devenir corps du Christ, c’est la grâce que le sacrement opère en nous." }
      ]
    },
    trinite: {
      nom: "La Trinité révélée et confessée",
      etapes: [
        { bib: "Mt 28:19", a: "Didachè", o: "Enseignement des douze Apôtres (~90)", q: "« Vous baptiserez au nom du Père et du Fils et du Saint-Esprit » — la triade baptisale des premiers chrétiens.", med: "La foi trinitaire précède les grandes controverses : elle vient du baptême." },
        { bib: "Jn 1:1-3", a: "saint Athanase d’Alexandrie", o: "Contre les ariens (~340)", q: "« Le Fils est de la substance même du Père : ce que dit le Père, c’est le Fils qui l’accomplit. »", med: "Face à l’arianisme, l’Église a défendu la pleine divinité du Fils." },
        { bib: "Mt 3:16-17", a: "saint Grégoire de Nazianze", o: "Discours 40 (~381)", q: "« Quand je dis Dieu, je dis Père, Fils et Saint-Esprit : ce ne sont pas trois dieux, mais un seul Dieu. »", med: "Les théologiens de Nicée ont gardé l’unité sans écraser les Personnes." },
        { bib: "2Co 13:13", a: "saint Augustin d’Hippone", o: "De Trinitate VIII (~417)", q: "« Si tu vois la charité, tu vois la Trinité. »", med: "La Trinité se contemple davantage qu’elle ne se démontre : elle se vit." },
        { bib: "Jn 15:26", a: "saint Cyrille d’Alexandrie", o: "Sur la Trinité (~430)", q: "« L’Esprit procède du Père, reçoit du Fils, et nous conduit à la ressemblance du Fils. »", med: "L’Esprit est le don partagé qui nous introduit dans la vie trinitaire." }
      ]
    },
    marie: {
      nom: "Marie dans la foi des Pères",
      etapes: [
        { bib: "Lc 1:38", a: "saint Irénée de Lyon", o: "Adversus haereses III,22,4 (~180)", q: "« Comme Ève, en désobéissant, causa la ruine, ainsi Marie, obéissant, devint cause de salut pour tout le genre humain. »", med: "Marie, nouvelle Ève : l’obéissance de la foi défait la chaîne du péché." },
        { bib: "Lc 1:43", a: "saint Cyrille d’Alexandrie", o: "Homélie à Éphèse (431)", q: "« Celui qui est né de la Vierge est Dieu incarné : on proclame donc la Mère de Dieu. »", med: "Éphèse a confessé l’unité de la personne du Verbe né de Marie." },
        { bib: "Lc 2:19", a: "saint Augustin d’Hippone", o: "Sermon 215 (~420)", q: "« Marie a conçu au cœur par la foi avant de concevoir au corps. »", med: "La fécondité de Marie est d’abord une foi qui accueille la Parole." },
        { bib: "Lc 2:34-35", a: "saint Ambroise de Milan", o: "De institutione virginis (~395)", q: "« Que les mères de famille entendent cette image de la virginité : la vie de Marie est un exemple pour tous. »", med: "Marie disciple, plus proche de nous que toute mère du monde." },
        { bib: "Jn 19:26-27", a: "saint Éphrem le Syrien", o: "Hymnes (~370)", q: "« Bénie sois-tu entre toutes les femmes, seule refuge des pécheurs. »", med: "Marie au pied de la croix reçoit l’Église comme fils. (Tradition syriaque)" }
      ]
    },
    bapteme: {
      nom: "Le Baptême, naissance nouvelle",
      etapes: [
        { bib: "Jn 3:5", a: "Tertullien", o: "De baptismo (~200)", q: "« Le baptême est le sceau de la foi, l’instrument de la vie nouvelle. »", med: "Premier traité chrétien consacré au baptême : le sacrement naît de l’Écriture." },
        { bib: "Rm 6:3-4", a: "saint Cyrille de Jérusalem", o: "Catéchèses mystagogiques (~350)", q: "« Vous avez été ensevelis avec le Christ dans l’eau, et vous en êtes sortis comme ressortissant à une nouvelle vie. »", med: "Les catéchèses mystagogiques expliquaient le sacrement aux néophytes." },
        { bib: "Ac 2:38", a: "saint Augustin d’Hippone", o: "Sermons (~400)", q: "« L’eau touche le corps et lave l’âme : le sacrement agit par la Parole. »", med: "Le visible porte l’invisible : le cœur de la foi sacramentelle." },
        { bib: "Tit 3:5", a: "saint Basile de Césarée", o: "Sur le Saint-Esprit (~375)", q: "« Dans le baptême, comme dans la création, l’Esprit se tient au-dessus des eaux pour sanctifier. »", med: "Le même Esprit qui a plané sur les eaux originelles sanctifie l’eau baptismale." },
        { bib: "Ac 8:36-38", a: "saint Ambroise de Milan", o: "De sacramentis II (~390)", q: "« Crois, et tu es arrivé ; crois, et l’eau te suffit. »", med: "La foi du demandeur rend féconde l’eau du baptême." }
      ]
    },
    eglise: {
      nom: "L’Église, corps du Christ",
      etapes: [
        { bib: "Mt 16:18", a: "saint Cyprien de Carthage", o: "De unitate Ecclesiae (~251)", q: "« Qui n’a pas l’Église pour mère ne peut avoir Dieu pour père. »", med: "L’unité de l’Église n’est pas une option : elle est condition de la foi." },
        { bib: "Ac 2:42", a: "saint Ignace d’Antioche", o: "Lettre aux Smyrniotes (~107)", q: "« Là où paraît l’évêque, que là soit la communauté, comme là où est le Christ Jésus se trouve l’Église catholique. »", med: "Première attestation de l’expression « Église catholique » (universelle)." },
        { bib: "1Co 12:12-13", a: "saint Augustin d’Hippone", o: "Enarrationes in Psalmos (~410)", q: "« Le Christ est la tête et nous sommes ses membres : l’Église entière chante comme un seul homme. »", med: "Les Psaumes deviennent la voix du Christ qui prie dans son corps." },
        { bib: "Ep 4:4-6", a: "saint Irénée de Lyon", o: "Adversus haereses IV,33,8 (~180)", q: "« Là où est l’Esprit de Dieu, là est l’Église et toute grâce. »", med: "L’Esprit constitue l’Église et la rend féconde en tout lieu." },
        { bib: "Jn 17:21", a: "saint Jean Chrysostome", o: "Homélies sur Jean (~390)", q: "« Rien ne force autant les païens à croire que la belle conduite des chrétiens. »", med: "L’unité visible des disciples est la première prédication." }
      ]
    },
    croix: {
      nom: "La Croix et l’espérance",
      etapes: [
        { bib: "Ga 2:19-20", a: "saint Ignace d’Antioche", o: "Lettre aux Romains (~107)", q: "« Mon amour est crucifié, et il n’y a plus en moi de feu qui aime la matière. »", med: "En chemin vers le martyre, l’apôtre fait sienne la Croix." },
        { bib: "1Co 1:23-24", a: "saint Augustin d’Hippone", o: "De civitate Dei X (~417)", q: "« La Croix n’était pas un remède pour les seuls ancêtres, mais pour nous et pour nos descendants. »", med: "Le bois de la mort devient l’arbre de vie pour toute l’histoire." },
        { bib: "Jn 19:30", a: "saint Léon le Grand", o: "Sermons sur la Passion (~450)", q: "« C’était la puissance de la croix que d’opérer par le pardon : le brigand reçoit le paradis, l’apôtre est réconcilié. »", med: "La Croix pardonne jusqu’au dernier souffle : nul n’est trop loin." },
        { bib: "Rm 8:18", a: "saint Grégoire de Nysse", o: "Homélies sur la Résurrection (~380)", q: "« Celui qui a vu le tombeau vide a compris que la mort n’est qu’un passage. »", med: "L’espérance chrétienne juge la mort à la lumière du matin de Pâques." },
        { bib: "Ph 3:10-11", a: "saint Irénée de Lyon", o: "Adversus haereses V (fin IIe s.)", q: "« La gloire de Dieu, c’est l’homme vivant ; et la vie de l’homme, c’est la vision de Dieu. »", med: "L’espérance finale : la gloire de Dieu qui vivifie l’homme tout entier." }
      ]
    }
  };
  const CLES = ["eucharistie", "trinite", "marie", "bapteme", "eglise", "croix"];

  let modal = null, themeVue = null, etape = 0;
  function panneau() {
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "v581-modal";
    modal.innerHTML = '<style>#v581-modal{position:fixed;inset:0;z-index:140960;display:none;align-items:flex-start;justify-content:center;background:rgba(2,6,12,.72);backdrop-filter:blur(4px)}#v581-modal.open{display:flex}#v581-modal .b{width:min(720px,95vw);max-height:88vh;margin-top:4vh;display:flex;flex-direction:column;background:var(--ui-panel,#0d1626);border:1px solid var(--ui-border,#2a2a3a);border-radius:12px;box-shadow:0 18px 60px rgba(0,0,0,.6);overflow:hidden}#v581-modal .hd{display:flex;align-items:center;gap:.5rem;padding:.7rem .9rem;border-bottom:1px solid var(--ui-border,#2a2a3a)}#v581-modal .hd h3{margin:0;font-size:.95rem;color:var(--ui-accent,#e5c15a);flex:1}#v581-modal .corps{padding:.7rem .9rem;overflow:auto;display:flex;flex-direction:column;gap:.55rem}#v581-modal .theme{background:rgba(255,255,255,.03);border:1px solid var(--ui-border,#2a2a3a);border-radius:8px;padding:.5rem .65rem;cursor:pointer;font-size:.85rem}#v581-modal .theme:hover{border-color:var(--ui-accent,#e5c15a)}#v581-modal .cit{background:rgba(229,193,90,.08);border:1px solid rgba(229,193,90,.3);border-radius:8px;padding:.6rem .7rem;font-size:.85rem;line-height:1.6}#v581-modal .aut{font-size:.7rem;color:var(--ui-dim,#8a8896);margin-top:.35rem}#v581-modal .med{font-size:.78rem;color:var(--ui-ink,#e8e6e0);opacity:.9}#v581-modal .cts{display:flex;gap:.4rem;flex-wrap:wrap}#v581-modal .cts button{background:rgba(79,142,247,.14);color:#cfe0ff;border:1px solid rgba(79,142,247,.35);border-radius:8px;padding:.32rem .65rem;cursor:pointer;font-size:.75rem}#v581-modal .liste{display:flex;flex-direction:column;gap:.4rem}</style>'
      + '<div class="b"><div class="hd"><h3>🕊 Parcours patristiques</h3><button type="button" id="v581-x" style="background:none;border:none;color:inherit;font-size:16px;cursor:pointer">✕</button></div><div class="corps" id="v581-corps"></div></div>';
    document.body.appendChild(modal);
    modal.addEventListener("click", function (e) { if (e.target === modal) modal.classList.remove("open"); });
    modal.querySelector("#v581-x").addEventListener("click", function () { modal.classList.remove("open"); });
    return modal;
  }
  function listeThemes() {
    const corps = document.getElementById("v581-corps");
    let h = '<div class="liste">';
    CLES.forEach(function (k) {
      h += '<div class="theme" data-t="' + k + '">📖 <b>' + THEMES[k].nom + '</b> <span style="opacity:.6">· ' + THEMES[k].etapes.length + ' étapes</span></div>';
    });
    h += '</div><div style="font-size:.62rem;color:var(--ui-dim,#8a8896);margin-top:.5rem">Citations patristiques notoires dans des traductions courantes — les œuvres sont indiquées pour aller plus loin.</div>';
    corps.innerHTML = h;
    corps.querySelectorAll(".theme").forEach(function (el) {
      el.addEventListener("click", function () { etape = 0; renderEtapes(el.getAttribute("data-t")); });
    });
  }
  function renderEtapes(k) {
    themeVue = k;
    const T = THEMES[k];
    const corps = document.getElementById("v581-corps");
    const e = T.etapes[etape];
    let h = '<div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.4rem">'
      + '<button type="button" id="v581-back" style="background:none;border:1px solid var(--ui-border,#2a2a3a);color:inherit;border-radius:6px;cursor:pointer;font-size:.7rem">← thèmes</button>'
      + '<div style="flex:1"><b>' + esc(T.nom) + '</b><div style="font-size:.7rem;color:var(--ui-accent,#e5c15a)">étape ' + (etape + 1) + '/' + T.etapes.length + '</div></div>'
      + (etape < T.etapes.length - 1 ? '<button type="button" id="v581-next" style="background:none;border:1px solid var(--ui-border,#2a2a3a);color:inherit;border-radius:6px;cursor:pointer">▶</button>' : "")
      + '</div>';
    h += '<div class="cit">« ' + esc(e.q) + ' »<div class="aut">— ' + esc(e.a) + ', ' + esc(e.o) + '</div></div>';
    h += '<div class="cts">'
      + (e.bib ? '<button type="button" id="v581-bib">📖 ' + esc(e.bib) + '</button>' : "")
      + (e.bib ? '<button type="button" id="v581-lire">▶ lire le verset</button>' : "")
      + '<button type="button" id="v581-adeodat">🕊 approfondir avec Adeodat</button>'
      + '</div>';
    h += '<div class="med">💡 ' + esc(e.med) + '</div>';
    corps.innerHTML = h;
    corps.querySelector("#v581-back").addEventListener("click", function () { listeThemes(); });
    const nxt = corps.querySelector("#v581-next");
    if (nxt) nxt.addEventListener("click", function () { etape++; renderEtapes(k); });
    const bib = corps.querySelector("#v581-bib");
    if (bib) bib.addEventListener("click", function () { if (window.__v578Versions) window.__v578Versions.ouvrir(e.bib); });
    const lire = corps.querySelector("#v581-lire");
    if (lire) lire.addEventListener("click", function () {
      try { if (typeof ttsEmission === "function") ttsEmission("Lecture : " + e.bib + ". ", "francais", null, null); toast("▶ Lecture confiée à la voix de PARAMÈTRES", "info"); } catch (e2) {}
    });
    corps.querySelector("#v581-adeodat").addEventListener("click", function () {
      try {
        if (window.__v564Adeodat) {
          window.__v564Adeodat.ouvrir();
          window.__v564Adeodat.envoyer("Approfondis ce parcours patristique : « " + e.q + " » (" + e.a + ", " + e.o + "), avec le verset " + (e.bib || "du thème") + ". Donne le contexte historique, le sens théologique et une application pour aujourd’hui.");
        }
      } catch (e3) {}
    });
  }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">").replace(/"/g, "&quot;"); }
  function ouvrir() {
    panneau().classList.add("open");
    listeThemes();
  }
  function menuEntry() {
    const m = document.getElementById("v6-more-menu");
    if (!m || m.querySelector("#v581-menu-entry")) return;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "hud-btn";
    b.id = "v581-menu-entry";
    b.textContent = "🕊 PÈRES — PARCOURS";
    b.title = "Parcours patristiques thématiques : citations, versets, méditations";
    b.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); ouvrir(); });
    m.appendChild(b);
  }
  function init() { menuEntry(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  const ivM = setInterval(function () { menuEntry(); if (document.getElementById("v581-menu-entry")) clearInterval(ivM); }, 800);
  window.__v581Parcours = { ouvrir: ouvrir, themes: function () { return CLES.map(function (k) { return { k: k, nom: THEMES[k].nom, n: THEMES[k].etapes.length }; }); } };
})();

