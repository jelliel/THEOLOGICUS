
/* ═══════════════════════════════════════════════════════════════════════
   v571 — ADEODAT V3g :
     1. CERVEAU CHOISISSABLE (demande utilisateur) : un sélecteur de modèle
        dans le panneau liste LA BASE DE MODÈLES DE L'APP
        (_tousModelesSelectionnables : Mistral/Voxtral + fournisseurs à clé)
        + les modèles personnalisés (v563). "" = modèle actif de l'app.
     2. DICTÉE DE SECOURS WINDOWS (défaut constaté : « Micro indisponible
        (network) ») : la reconnaissance vocale du navigateur (Chrome)
        transite par les serveurs vocaux de Google, souvent injoignables.
        Repli : ENREGISTREMENT du micro (PCM → WAV) → TRANSCRIPTION par un
        modèle AUDIO de l'app (Voxtral via la clé Mistral, ou modèle
        personnalisé audio) → le texte part à Adeodat. Mains libres
        conservé : la capture reprend après chaque phrase (détection de
        silence), se suspend quand Adeodat répond (microPause/
        microReprendre) et s'arrête avec le panneau. Mode retenu
        (theo_adeodat_dictee="1") pour ne plus retenter le SR. */
(function () {
  "use strict";
  if (window.__v571Adeodat) return;

  function toast(m, k) { try { if (typeof window.toast === "function") window.toast(m, k || "info"); } catch (e) {} }
  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">").replace(/"/g, "&quot;"); }
  function ST() { try { return (typeof state !== "undefined") ? state : window.state; } catch (e) { return window.state; } }
  function cle(k) { try { return (typeof cleanApiKey === "function") ? cleanApiKey(k || "") : String(k || "").replace(/[\r\n\s]+/g, ""); } catch (e) { return String(k || ""); } }
  function majV566() { try { if (window.__v566Libre && typeof window.__v566Libre._majIc === "function") window.__v566Libre._majIc(); } catch (e) {} }

  /* ── 1. sélecteur de modèle (cerveau d'Adeodat) ── */
  function modeleChoisi() { try { return localStorage.getItem("theo_adeodat_modele") || ""; } catch (e) { return ""; } }

  function remplirModeles(sel) {
    let html = '<option value="">🕊️ Modèle actif de l\'app</option>';
    try {
      const st = ST() || {};
      const cms = st.customModels || [];
      if (cms.length) {
        html += '<optgroup label="⭐ Modèles personnalisés">';
        cms.forEach(function (cm) { html += '<option value="' + esc(cm.uid) + '">⭐ ' + esc(cm.name || cm.model || cm.uid) + '</option>'; });
        html += '</optgroup>';
      }
      if (typeof _tousModelesSelectionnables === "function") {
        const groupes = [];
        _tousModelesSelectionnables().forEach(function (m) {
          let g = groupes.find(x => x.nom === m.groupe);
          if (!g) { g = { nom: m.groupe, items: [] }; groupes.push(g); }
          g.items.push(m);
        });
        groupes.forEach(function (g) {
          html += '<optgroup label="' + esc(g.nom) + '">';
          g.items.forEach(function (m) { html += '<option value="' + esc(m.value) + '">' + esc(m.label) + '</option>'; });
          html += '</optgroup>';
        });
      }
    } catch (e) {}
    sel.innerHTML = html;
  }

  function installerUI() {
    const pan = document.getElementById("adeodat-pan");
    const msgs = document.getElementById("adeodat-msgs");
    if (!pan || !msgs || document.getElementById("adeodat-modele")) return;
    const sel = document.createElement("select");
    sel.id = "adeodat-modele";
    sel.title = "Cerveau d'Adeodat — base de modèles de THEOLOGICUS ('' = modèle actif de l'app)";
    sel.setAttribute("aria-label", "Modèle d'Adeodat");
    sel.style.cssText = "flex:1;min-width:0;font-size:.65rem;background:rgba(255,255,255,.05);color:inherit;border:1px solid var(--ui-border,#2a2a3a);border-radius:6px;padding:.25rem .35rem";
    remplirModeles(sel);
    const choix = modeleChoisi();
    sel.value = choix;
    if (sel.value !== choix) sel.value = "";   /* choix disparu de la liste */
    sel.addEventListener("change", function () {
      try { localStorage.setItem("theo_adeodat_modele", sel.value); } catch (e) {}
      const o = sel.options[sel.selectedIndex] || {};
      toast(sel.value ? "🧠 Cerveau d'Adeodat : " + (o.textContent || sel.value) : "🧠 Adeodat suit le modèle actif de l'app", "success");
    });
    const rang = document.createElement("div");
    rang.style.cssText = "display:flex;gap:.4rem;padding:.35rem .7rem;border-bottom:1px solid var(--ui-border,#2a2a3a)";
    rang.appendChild(sel);
    pan.insertBefore(rang, msgs);
  }

  /* ── 2. dictée de secours : capture → WAV → transcription ── */
  var dicteeDemandee = false, dicteeSuspendue = false;
  var veilleDemandee = false;   /* v574 — capture de VEILLE (mot d'éveil), panneau fermé */
  var flux = null, ctxA = null, proc = null, gainMuet = null;
  var tampons = [], echantillons = 0, parle = false, silence = 0;
  var enCoursTranscription = false;
  var SEUIL_RMS = 0.012, SILENCE_S = 1.6, MAX_S = 25;

  function dicteeActive() { return dicteeDemandee; }

  function cfgTranscription() {
    try {
      const st = ST() || {};
      /* v572bis — le CERVEAU CHOISI, s\'il traite l\'audio, sert à la dictée
         en priorité (demande utilisateur : la dictée doit suivre le modèle
         sélectionné dans la fenêtre d\'Adeodat). */
      const choix = modeleChoisi();
      if (choix) {
        const cmC = (st.customModels || []).find(m => m.uid === choix);
        if (cmC && cmC.audio && cmC.baseUrl && cle(cmC.apiKey)) {
          return { base: String(cmC.baseUrl).replace(/\/+$/, ""), key: cle(cmC.apiKey), model: cmC.model || "whisper-1", alt: "", cerveau: true };
        }
        if (/^mistral:/.test(choix) && /voxtral/i.test(choix)) {
          const cfgC = (typeof resolveModelConfig === "function") ? resolveModelConfig(choix) : null;
          if (cfgC && cle(cfgC.apiKey)) {
            return { base: String(cfgC.endpoint).replace(/\/chat\/completions.*$/, ""), key: cle(cfgC.apiKey), model: cfgC.model, alt: "", cerveau: true };
          }
        }
      }
      const cms = st.customModels || [];
      for (let i = 0; i < cms.length; i++) {
        const cm = cms[i];
        if (cm.audio && cm.baseUrl && cle(cm.apiKey)) {
          return { base: String(cm.baseUrl).replace(/\/+$/, ""), key: cle(cm.apiKey), model: cm.model || "whisper-1", alt: "" };
        }
      }
      const mk = cle((st.keys && st.keys.mistral) || st.apiKey || "");
      if (mk) return { base: "https://api.mistral.ai/v1", key: mk, model: "voxtral-small-2507", alt: "voxtral-mini-2507" };
      const ak = cle((st.keys && st.keys.agnes) || "");
      if (ak) return { base: "https://apihub.agnes-ai.com/v1", key: ak, model: "voxtral-small-2507", alt: "voxtral-mini-2507" };
    } catch (e) {}
    return null;
  }

  async function transcrire(dataUrl) {
    const cfg = cfgTranscription();
    if (!cfg) return null;
    const essais = [cfg.model, cfg.alt].filter(Boolean);
    const diag = [];
    for (let i = 0; i < essais.length; i++) {
      try {
        const res = await fetch(cfg.base + "/chat/completions", {
          method: "POST",
          headers: { "Authorization": "Bearer " + cfg.key, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: essais[i],
            messages: [
              { role: "system", content: "Tu es un transcribeur vocal. Transcris fidèlement l'audio en texte. Réponds UNIQUEMENT avec la transcription, sans commentaire." },
              { role: "user", content: (function () {
                  /* v572bis — l'API Mistral N\'ACCEPT PAS audio_url en tableau
                     de contenu (HTTP 422 « Input should be a valid string »,
                     mesuré sur pièce) : le format correct est input_audio
                     {data, format} (style OpenAI) → 200 mesuré. */
                  const mF = /^data:audio\/([^;]+);base64,(.*)$/.exec(String(dataUrl || "")) || [];
                  return mF[2]
                    ? [{ type: "input_audio", input_audio: { data: mF[2], format: mF[1] } }, { type: "text", text: "Transcris cet audio." }]
                    : [{ type: "text", text: "(audio illisible)" }];
                })() }
            ],
            temperature: 0.1,
            max_tokens: 1000
          })
        });
        if (!res.ok) { diag.push(essais[i] + " → HTTP " + res.status); continue; }
        const d = await res.json();
        const t = String((d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || "").trim();
        if (t) { window.__v571DicteeDiag = ""; return t; }
        diag.push(essais[i] + " → réponse vide");
      } catch (e) { diag.push(essais[i] + " → réseau : " + String(e && e.message || e).slice(0, 70)); }
    }
    window.__v571DicteeDiag = diag.join(" | ");
    return null;
  }

  function encoderWav(bufs, rate) {
    let total = 0;
    bufs.forEach(b => { total += b.length; });
    const out = new DataView(new ArrayBuffer(44 + total * 2));
    const chaine = (off, s) => { for (let i = 0; i < s.length; i++) out.setUint8(off + i, s.charCodeAt(i)); };
    chaine(0, "RIFF"); out.setUint32(4, 36 + total * 2, true); chaine(8, "WAVE");
    chaine(12, "fmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
    out.setUint32(24, rate, true); out.setUint32(28, rate * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true);
    chaine(36, "data"); out.setUint32(40, total * 2, true);
    let off = 44;
    for (const b of bufs) {
      for (let i = 0; i < b.length; i++, off += 2) {
        const v = Math.max(-1, Math.min(1, b[i]));
        out.setInt16(off, v < 0 ? v * 0x8000 : v * 0x7FFF, true);
      }
    }
    return out.buffer;
  }

  function enBase64(buf) {
    const octets = new Uint8Array(buf); let bin = "";
    const PAS = 0x8000;
    for (let i = 0; i < octets.length; i += PAS) bin += String.fromCharCode.apply(null, octets.subarray(i, i + PAS));
    return btoa(bin);
  }

  function couperCapture() {
    try { if (proc) proc.onaudioprocess = null; } catch (e) {}
    try { if (flux) flux.getTracks().forEach(t => t.stop()); } catch (e) {}
    try { if (ctxA) ctxA.close(); } catch (e) {}
    flux = ctxA = proc = gainMuet = null;
    tampons = []; echantillons = 0; parle = false; silence = 0;
  }

  async function capter() {
    try {
      tampons = []; echantillons = 0; parle = false; silence = 0;
      if (!navigator.mediaDevices || !window.isSecureContext) {
        /* v572ter — TypeError typique : contexte NON sécurisé (adresse LAN
           http://192.168.x.x ou 0.0.0.0) -> navigator.mediaDevices n\'existe
           pas. Le micro exige localhost (ou https) — message qui dit quoi
           faire au lieu d\'un « autorisez l\'accès » hors-sujet. */
        toast("🎙️ Micro indisponible : l\'adresse « " + location.origin + " » n\'est pas sécurisée. Sur l\'ordinateur serveur, ouvrez http://localhost:" + (location.port || "8765") + " ; depuis un autre appareil : https://<adresse-réseau-du-serveur>:8443 (acceptez le certificat une fois).", "error");
        dicteeArreter(true);
        veilleDemandee = false;
        try { if (window.__v574Wake && window.__v574Wake.echec) window.__v574Wake.echec(); } catch (eW1) {}
        return false;
      }
      flux = await navigator.mediaDevices.getUserMedia({ audio: true });
      try { ctxA = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 }); } catch (e2) { ctxA = new (window.AudioContext || window.webkitAudioContext)(); }
      const source = ctxA.createMediaStreamSource(flux);
      proc = ctxA.createScriptProcessor(4096, 1, 1);
      proc.onaudioprocess = function (ev) {
        if ((!dicteeDemandee && !veilleDemandee) || dicteeSuspendue || enCoursTranscription) return;
        const ch = ev.inputBuffer.getChannelData(0);
        let s = 0;
        for (let i = 0; i < ch.length; i++) s += ch[i] * ch[i];
        const rms = Math.sqrt(s / ch.length);
        if (rms > SEUIL_RMS) {
          parle = true; silence = 0;
          tampons.push(new Float32Array(ch)); echantillons += ch.length;
        } else if (parle) {
          silence += ch.length / ctxA.sampleRate;
          tampons.push(new Float32Array(ch)); echantillons += ch.length;
          if (silence >= SILENCE_S || echantillons / ctxA.sampleRate >= MAX_S) clorePhrase();
        }
      };
      source.connect(proc);
      gainMuet = ctxA.createGain(); gainMuet.gain.value = 0;
      proc.connect(gainMuet); gainMuet.connect(ctxA.destination);
      return true;
    } catch (e) {
      toast("🎙️ Micro indisponible (" + (e && e.name || e) + (e && e.message ? " : " + String(e.message).slice(0, 90) : "") + ") — autorisez l\'accès au micro", "error");
      dicteeArreter(true);
      veilleDemandee = false;
      try { if (window.__v574Wake && window.__v574Wake.echec) window.__v574Wake.echec(); } catch (eW2) {}
      return false;
    }
  }

  async function clorePhrase() {
    if (enCoursTranscription) return;
    const bufs = tampons, n = echantillons, rate = ctxA ? ctxA.sampleRate : 16000;
    tampons = []; echantillons = 0; parle = false; silence = 0;
    if (n < rate * 0.25) return;               /* trop court : on continue */
    enCoursTranscription = true;
    try {
      const wav = encoderWav(bufs, rate);
      const texte = await transcrire("data:audio/wav;base64," + enBase64(wav));
      if (veilleDemandee && !dicteeDemandee) {
        /* v574 — VEILLE : le texte n'est PAS envoyé à Adeodat ; il est confié
           au détecteur de mot d'éveil (il ouvre le panneau si le mot est entendu). */
        if (window.__v574Wake && window.__v574Wake.entendre) window.__v574Wake.entendre(texte);
      } else if (texte && window.__v564Adeodat && typeof window.__v564Adeodat.envoyer === "function") {
        window.__v564Adeodat.envoyer(texte);   /* envoyer suspend la dictée (microPause) */
      } else if (!texte) {
        toast("🎙️ Transcription impossible — " + String(window.__v571DicteeDiag || "aucun modèle audio joignable (📉 Jauge d'Adeodat)").slice(0, 130), "error");
      }
    } catch (e) {
      toast("🎙️ Dictée interrompue : " + String(e && e.message || e).slice(0, 60), "warn");
    }
    enCoursTranscription = false;
    /* boucle mains libres : re-capter si la session le demande encore */
    if ((dicteeDemandee || veilleDemandee) && !dicteeSuspendue) capter();
  }

  async function dicteeDemarrer() {
    if (dicteeDemandee) return;
    if (!cfgTranscription()) {
      toast("🎙️ Reconnaissance navigateur injoignable (network) — pour la dictée, configurez une clé Mistral ou un modèle audio personnalisé (PARAMÈTRES)", "error");
      return;
    }
    dicteeDemandee = true; dicteeSuspendue = false;
    const ok = await capter();
    if (!ok) { dicteeDemandee = false; majV566(); return; }
    toast("🎙️ Mode dictée activé — parlez, Adeodat transcrit (modèle audio de l\'app)", "success");
    majV566();
  }
  function dicteeSuspendre() { dicteeSuspendue = true; couperCapture(); majV566(); }
  function dicteeRelancer() { if (!dicteeDemandee) return; dicteeSuspendue = false; capter(); majV566(); }
  function dicteeArreter(silencieux) {
    const etait = dicteeDemandee;
    dicteeDemandee = false; dicteeSuspendue = false;
    couperCapture();
    if (etait && !silencieux) toast("🎙️ Dictée arrêtée", "info");
    majV566();
  }

  /* v574 — VEILLE (mot d'éveil) : même moteur de capture que la dictée,
     mais les transcriptions vont au détecteur v574 (jamais à envoyer) et
     la veille ne vit que panneau FERMÉ (opt-in, défaut OFF). */
  function veilleSet(on) {
    if (on) {
      if (veilleDemandee) return;
      veilleDemandee = true;
      capter();
    } else {
      if (!veilleDemandee) return;
      veilleDemandee = false;
      if (!dicteeDemandee) couperCapture();
      majV566();
    }
  }

  /* ── amorçage : le panneau peut être créé après le chargement ── */
  function init() { installerUI(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  setTimeout(init, 1500);
  try {
    const obsPan = new MutationObserver(function () { installerUI(); });
    obsPan.observe(document.body, { childList: true });
  } catch (e) {}

  window.__v571Adeodat = {
    modeleChoisi: modeleChoisi, installerUI: installerUI, remplirModeles: remplirModeles,
    dicteeActive: dicteeActive, dicteeDemarrer: dicteeDemarrer, dicteeArreter: dicteeArreter,
    dicteeSuspendre: dicteeSuspendre, dicteeRelancer: dicteeRelancer,
    cfgTranscription: cfgTranscription, encoderWav: encoderWav,
    /* v574 — VEILLE : capture de fond pilotée par v574 (mot d'éveil) */
    veilleSet: veilleSet, veilleActive: function () { return veilleDemandee; }
  };
})();

