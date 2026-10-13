
/* ═══════════════════════════════════════════════════════════════════
   v575 — VOIX SUPERTONIC (option de voix TTS pour Adeodat, voie 1) :
   serveur local « supertonic serve » (supertone-oss-archive/supertonic-
   py, port 7788, OpenRAIL-M). La page appelle le serveur PAR LE RELAIS
   même-origine /fla/127.0.0.1:<port>/… : pas de CORS (et l'autre
   appareil passe par le PC via le même relais). Échec quelconque →
   repli AUTOMATIQUE sur la voix système (jamais de silence).
     • rangée de config : 🎙️ Voix [Système|Supertonic] · port · voix
       (M1-M5/F1-F5) · bouton Tester (sonde GET /v1/health) ;
     • wrapper ttsEmission : chaque phrase de la file d'Adeodat (et de
       la lecture « lire ») part au serveur quand Supertonic est choisi.
   Réglages : theo_adeodat_tts_mode (sys|supa), theo_adeodat_tts_port
   (7788), theo_adeodat_tts_supa_voix (M1). ══════════════════════════ */
(function () {
  "use strict";
  if (window.__v575TtsVoice) return;

  function toast(m, k) { try { if (typeof window.toast === "function") window.toast(m, k || "info"); } catch (e) {} }
  const CLE_MODE = "theo_adeodat_tts_mode", CLE_PORT = "theo_adeodat_tts_port", CLE_VOIX = "theo_adeodat_tts_supa_voix";
  const VOIX = ["M1", "M2", "M3", "M4", "M5", "F1", "F2", "F3", "F4", "F5"];
  let alerteFaite = false;

  function modeActif() { try { return localStorage.getItem(CLE_MODE) || "sys"; } catch (e) { return "sys"; } }
  function portSupa() { try { const p = parseInt(localStorage.getItem(CLE_PORT) || "7788", 10); return (p > 0 && p < 65536) ? p : 7788; } catch (e) { return 7788; } }
  function voixSupa() { try { return localStorage.getItem(CLE_VOIX) || "M1"; } catch (e) { return "M1"; } }
  function urlFla(chemin) { return location.origin + "/fla/127.0.0.1:" + portSupa() + chemin; }

  /* ── sonde /v1/health (bouton Tester) ── */
  async function tester() {
    const port = portSupa();
    try {
      const res = await fetch(urlFla("/v1/health"), { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const d = await res.json();
      alerteFaite = false;
      toast("🎙️ Supertonic disponible — " + (d.model || "?") + " · " + (d.sample_rate || "?") + " Hz · voix chargées : " + (d.voices_loaded != null ? d.voices_loaded : "?"), "success");
    } catch (e) {
      toast("🎙️ Serveur Supertonic injoignable sur 127.0.0.1:" + port + " — lancez « supertonic serve » sur ce PC (pip install supertonic, puis supertonic serve)", "error");
    }
  }

  /* ── synthèse : POST /v1/tts → WAV → Audio ── */
  function syntheseSupa(texte, lang, onEnd, onErr, orig) {
    function repli(raison) {
      if (!alerteFaite) {
        alerteFaite = true;
        toast("🎙️ Supertonic injoignable (" + String(raison).slice(0, 80) + ") — voix système utilisée", "warn");
      }
      try { return orig(texte, lang, onEnd, onErr); } catch (e2) {}
    }
    (async function () {
      let urlA = null;
      try {
        const ctl = ("AbortController" in window) ? new AbortController() : null;
        const timer = ctl ? setTimeout(function () { try { ctl.abort(); } catch (eT) {} }, 20000) : null;
        const res = await fetch(urlFla("/v1/tts"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: String(texte || "").slice(0, 1000), voice: voixSupa(), lang: "fr" }),
          signal: ctl ? ctl.signal : undefined
        });
        if (timer) clearTimeout(timer);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const blob = await res.blob();
        urlA = URL.createObjectURL(blob);
        const a = new Audio(urlA);
        a.onended = function () { try { URL.revokeObjectURL(urlA); } catch (eR1) {} if (onEnd) try { onEnd(); } catch (eR2) {} };
        a.onerror = function () { try { URL.revokeObjectURL(urlA); } catch (eR3) {} repli("lecture impossible"); };
        const p = a.play();
        if (p && p.catch) p.catch(function () { repli("lecture bloquée"); });
      } catch (e) {
        if (urlA) { try { URL.revokeObjectURL(urlA); } catch (eR4) {} }
        repli(e && e.message || e);
      }
    })();
  }

  /* ── wrapper ttsEmission (réinstallable pour les bancs) ── */
  function installerTts() {
    if (typeof window.ttsEmission !== "function" || window.ttsEmission.__v575) return;
    const orig = window.ttsEmission;
    window.ttsEmission = function (texte, lang, onEnd, onErr) {
      if (modeActif() !== "supa") return orig(texte, lang, onEnd, onErr);
      syntheseSupa(String(texte || ""), lang, onEnd, onErr, orig);
    };
    window.ttsEmission.__v575 = true;
  }

  /* ── rangée de config dans le panneau ── */
  function majVisible() {
    const supa = modeActif() === "supa";
    ["adeodat-tts-port", "adeodat-tts-voix", "adeodat-tts-test"].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.style.display = supa ? "" : "none";
    });
  }
  function installerUI() {
    const pan = document.getElementById("adeodat-pan");
    const msgs = document.getElementById("adeodat-msgs");
    if (!pan || !msgs || document.getElementById("adeodat-tts-mode")) return;
    const sel = document.createElement("select");
    sel.id = "adeodat-tts-mode";
    sel.title = "Voix de lecture — Supertonic : serveur local « supertonic serve » (port 7788 par défaut)";
    sel.setAttribute("aria-label", "Voix de lecture");
    sel.style.cssText = "font-size:.65rem;background:rgba(255,255,255,.05);color:inherit;border:1px solid var(--ui-border,#2a2a3a);border-radius:6px;padding:.25rem .35rem";
    sel.innerHTML = '<option value="sys">🔊 Voix système</option><option value="supa">🎙️ Supertonic (serveur)</option>';
    sel.value = modeActif();
    const portIn = document.createElement("input");
    portIn.id = "adeodat-tts-port";
    portIn.type = "text";
    portIn.value = String(portSupa());
    portIn.title = "Port du serveur Supertonic (supertonic serve, défaut 7788)";
    portIn.setAttribute("aria-label", "Port Supertonic");
    portIn.style.cssText = "width:58px;font-size:.65rem;background:rgba(255,255,255,.05);color:inherit;border:1px solid var(--ui-border,#2a2a3a);border-radius:6px;padding:.25rem .3rem";
    const selV = document.createElement("select");
    selV.id = "adeodat-tts-voix";
    selV.title = "Voix Supertonic (M = masculines, F = féminines)";
    selV.setAttribute("aria-label", "Voix Supertonic");
    selV.style.cssText = "font-size:.65rem;background:rgba(255,255,255,.05);color:inherit;border:1px solid var(--ui-border,#2a2a3a);border-radius:6px;padding:.25rem .3rem";
    VOIX.forEach(function (v) { const o = document.createElement("option"); o.value = v; o.textContent = v; selV.appendChild(o); });
    selV.value = voixSupa();
    const btnT = document.createElement("button");
    btnT.type = "button";
    btnT.id = "adeodat-tts-test";
    btnT.textContent = "Tester";
    btnT.title = "Vérifier que le serveur Supertonic répond (sonde /v1/health)";
    btnT.style.cssText = "background:none;border:1px solid var(--ui-border,#2a2a3a);border-radius:6px;color:inherit;cursor:pointer;font-size:.62rem;padding:.22rem .4rem";
    const rang = document.createElement("div");
    rang.style.cssText = "display:flex;gap:.4rem;align-items:center;padding:.35rem .7rem;border-bottom:1px solid var(--ui-border,#2a2a3a)";
    rang.appendChild(sel); rang.appendChild(portIn); rang.appendChild(selV); rang.appendChild(btnT);
    pan.insertBefore(rang, msgs);
    sel.addEventListener("change", function () {
      try { localStorage.setItem(CLE_MODE, sel.value); } catch (e) {}
      majVisible();
      toast(sel.value === "supa" ? "🎙️ Voix Supertonic (serveur local) — cliquez Tester pour vérifier" : "🔊 Voix système", "success");
    });
    portIn.addEventListener("change", function () {
      const p = parseInt(portIn.value, 10);
      try { localStorage.setItem(CLE_PORT, String((p > 0 && p < 65536) ? p : 7788)); } catch (e) {}
      portIn.value = String(portSupa());
    });
    selV.addEventListener("change", function () {
      try { localStorage.setItem(CLE_VOIX, selV.value); } catch (e) {}
      toast("🎙️ Voix Supertonic : " + selV.value, "info");
    });
    btnT.addEventListener("click", tester);
    majVisible();
  }

  function init() { installerTts(); installerUI(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  setTimeout(init, 1800);
  try {
    const obs = new MutationObserver(function () { installerUI(); });
    obs.observe(document.body, { childList: true });
  } catch (e) {}

  window.__v575TtsVoice = { installe: installerTts, tester: tester, modeActif: modeActif, voixSupa: voixSupa, portSupa: portSupa };
})();

