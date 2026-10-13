
/* ═══════════════════════════════════════════════════════════════════
   v576 — VOIX UNIFIÉE : Adeodat suit PARAMÈTRES → Lecture vocale.
   Le moteur de lecture (v109) a UN SEUL point de sortie : ttsEmission(),
   que les files d'Adeodat empruntent déjà — donc quand Supertonic 3
   (port 8091, service lancé par le serveur de l'app, modèles dans
   ~/.cache/supertonic3) ou ElevenLabs est choisi dans PARAMÈTRES,
   Adeodat le parle DIRECTEMENT. Ce module ajoute seulement :
     • un badge « 🎙️ Voix : … » dans le panneau, lu dans LA MÊME clé de
       configuration (theologicus-tts-moteurs), rafraîchi à l'ouverture
       du panneau et sur l'événement storage ;
     • clic sur le badge → PARAMÈTRES ouvert sur l'onglet Lecture vocale.
   (Remplace le doublon v575 : deux réglages de voix = deux vérités.)
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  if (window.__v576AdeodatVoix) return;

  const CLE = "theologicus-tts-moteurs";
  const NOMS = { system: "🔊 Voix système", elevenlabs: "🎙️ ElevenLabs", supertonic: "🎙️ Supertonic 3" };

  function cfgMoteur() {
    try {
      const b = JSON.parse(localStorage.getItem(CLE) || "null");
      return (b && b.moteur && NOMS[b.moteur]) ? b.moteur : "system";
    } catch (e) { return "system"; }
  }
  function majBadge() {
    const b = document.getElementById("adeodat-voix");
    if (!b) return;
    b.textContent = NOMS[cfgMoteur()] || NOMS.system;
    b.title = "Voix active (PARAMÈTRES → Lecture vocale) — cliquez pour régler";
  }
  function ouvrirParametres() {
    try {
      const btn = document.getElementById("open-settings-modal");
      if (btn) btn.click();
      if (typeof window.__settingsOuvrirOnglet === "function") window.__settingsOuvrirOnglet("tts");
    } catch (e) {}
  }
  function installerUI() {
    const pan = document.getElementById("adeodat-pan");
    const msgs = document.getElementById("adeodat-msgs");
    if (!pan || !msgs || document.getElementById("adeodat-voix")) return;
    const rang = document.createElement("div");
    rang.style.cssText = "display:flex;padding:.3rem .7rem;border-bottom:1px solid var(--ui-border,#2a2a3a)";
    const b = document.createElement("button");
    b.type = "button";
    b.id = "adeodat-voix";
    b.setAttribute("aria-label", "Voix active — ouvrir PARAMÈTRES, onglet Lecture vocale");
    b.style.cssText = "flex:1;text-align:left;background:rgba(255,255,255,.04);color:var(--ui-dim,#8a8896);border:1px solid var(--ui-border,#2a2a3a);border-radius:6px;cursor:pointer;font-size:.62rem;padding:.28rem .45rem";
    b.addEventListener("click", ouvrirParametres);
    rang.appendChild(b);
    pan.insertBefore(rang, msgs);
    majBadge();
  }
  function init() { installerUI(); majBadge(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  setTimeout(init, 1900);
  try {
    window.addEventListener("storage", function (e) { if (e && e.key === CLE) majBadge(); });
  } catch (e) {}
  try {
    const obs = new MutationObserver(function () { installerUI(); majBadge(); });
    obs.observe(document.body, { childList: true });
  } catch (e) {}
  try {
    const obs2 = new MutationObserver(function () { majBadge(); });
    const iv = setInterval(function () {
      const p = document.getElementById("adeodat-pan");
      if (p) { obs2.observe(p, { attributes: true, attributeFilter: ["style"] }); clearInterval(iv); }
    }, 400);
  } catch (e) {}
  window.__v576AdeodatVoix = { majBadge: majBadge, moteurActif: cfgMoteur };
})();

