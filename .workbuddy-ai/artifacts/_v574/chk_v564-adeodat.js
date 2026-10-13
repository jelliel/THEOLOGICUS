
/* ═══════════════════════════════════════════════════════════════════════
   v564 — ADEODAT, LE COMPAGNON (V3.0, lot V3a)
   Demande : un assistant IA qui PARLE, ÉCOUTE, PENSE et INTERAGIT.
   Décisions utilisateur : cerveau = modèle actif de l'app (resolveModelConfig
   → callLLM) ; persona dédiée « Adeodat » + les agents théologiques en
   complément ; version affichée v3.0 (workflow passé à 3.0.$N) ; nom = Adeodat.

   V3a (ce lot) : orbe flottante + panneau de conversation + PARLE (TTS
   existant ttsEmission/speechSynthesis polyfillé) + ÉCOUTE (SpeechRecognition
   polyfillé v53, fr-FR) + PENSE (callLLM, historique borné, persona).
   V3b (à venir) : calque d'OUTILS (ouvrir un verset, citer les Pères…).
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.__v564Adeodat) return;

  var CLE_HIST = 'theo_adeodat_v1', CLE_PERSO = 'theo_adeodat_persona', CLE_TTS = 'theo_adeodat_tts';
  var MAX_HIST = 100;         /* messages conservés */
  var MAX_CTX = 12;           /* messages envoyés au modèle (v574 : mémoire d'échange plus longue) */

  function ST() { try { return (typeof state !== 'undefined') ? state : window.state; } catch (e) { return window.state; } }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"');
  }
  function toast(m, k) { try { if (typeof window.toast === 'function') window.toast(m, k || 'info'); } catch (e) {} }

  /* ── persona ── */
  function persona() { try { return localStorage.getItem(CLE_PERSO) || 'adeodat'; } catch (e) { return 'adeodat'; } }
  function systemPrompt() {
    var base = "Tu es Adeodat, le compagnon de l'utilisateur dans THEOLOGICUS, une application d'étude théologique (Bible, Coran, Pères de l'Église, Denzinger, conciles). " +
      "Réponds en français, avec précision et bienveillance. Cite les sources quand tu en mobilises (références bibliques, conciliaires, patristiques). " +
      "Reste concis (3 à 8 phrases) sauf demande d'exposé. Tu ne remplaces pas le magistère : pour une question de foi engageante, renvoie aux textes et au confesseur de l'utilisateur.";
    var pid = persona();
    if (pid && pid !== 'adeodat') {
      try {
        var presets = (window.__v527Agents && window.__v527Agents.presets) || [];
        for (var i = 0; i < presets.length; i++) {
          if (presets[i].id === pid && presets[i].instructions) {
            base += '\n\nSTYLE DEMANDÉ — ' + (presets[i].name || pid) + ' : ' + presets[i].instructions;
            break;
          }
        }
      } catch (e) {}
    }
    return base;
  }

  /* ── historique (persistant, borné) ── */
  function lireH() {
    try { var a = JSON.parse(localStorage.getItem(CLE_HIST) || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function ecrireH(a) { try { localStorage.setItem(CLE_HIST, JSON.stringify(a.slice(-MAX_HIST))); } catch (e) {} }
  function ajouterH(role, texte) { var a = lireH(); a.push({ role: role, texte: String(texte || ''), ts: Date.now() }); ecrireH(a); }

  /* ── PARLER (TTS existant) ── */
  function ttsActif() { try { return localStorage.getItem(CLE_TTS) !== '0'; } catch (e) { return true; } }
  /* V3f (v570) — `fin` : callback de FIN de lecture. La session micro
     continue est suspendue tant que Adeodat parle (sinon, sur Android, le
     micro entend le TTS → boucle d\'écho + bips de reconnaissance). */
  function parler(t, fin) {
    if (!ttsActif() || !t) return;
    try {
      if (typeof ttsEmission === 'function') ttsEmission(String(t).slice(0, 1200), 'fr-FR', fin || null, fin || null);
      else if (window.speechSynthesis) {
        var u = new window.SpeechSynthesisUtterance(String(t).slice(0, 1200));
        u.lang = 'fr-FR';
        if (fin) { u.onend = fin; u.onerror = fin; }
        window.speechSynthesis.speak(u);
      }
    } catch (e) { if (fin) try { fin(); } catch (e2) {} }
  }
  function taire() { try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {} }

  /* ── ÉCOUTER (SpeechRecognition polyfillé v53) ── */
  var rec = null;
  function ecouter() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast('Reconnaissance vocale indisponible ici', 'error'); return; }
    taire();
    if (rec) { try { rec.stop(); } catch (e) {} rec = null; majMic(); return; }
    rec = new SR();
    rec.lang = 'fr-FR'; rec.interimResults = false; rec.continuous = false;
    rec.onresult = function (ev) {
      var t = '';
      for (var i = 0; i < ev.results.length; i++) t += (ev.results[i][0] || {}).transcript || '';
      t = String(t || '').trim();
      if (t) {
        var inp = document.getElementById('adeodat-in');
        if (inp) inp.value = t;
        envoyer(t);
      }
    };
    rec.onerror = function () { toast('🎙️ Écoute interrompue', 'warn'); majMic(); };
    rec.onend = function () { rec = null; majMic(); };
    try { rec.start(); toast('🎙️ Adeodat vous écoute…', 'info'); majMic(); } catch (e) { toast('Micro indisponible', 'error'); }
  }
  function majMic() {
    var b = document.getElementById('adeodat-mic');
    if (b) { b.textContent = rec ? '⏺' : '🎤'; b.title = rec ? 'Arrêter l\'écoute' : 'Parler à Adeodat'; }
  }

  /* ── PENSER (le modèle actif de l'app) ── */
  async function penser(texteUser, onChunk, onStatus) {
    var st = ST() || {};
    var cfg = null;
    /* V3g (v571) — le cerveau d'Adeodat est CHOISISSABLE dans le panneau
       (base de modèles de l'app + modèles personnalisés) ; '' = modèle actif. */
    try { cfg = (typeof resolveModelConfig === 'function') ? resolveModelConfig((window.__v571Adeodat && window.__v571Adeodat.modeleChoisi && window.__v571Adeodat.modeleChoisi()) || st.model) : null; } catch (e) {}
    if (!cfg || !cfg.endpoint) throw new Error('Aucun modèle actif — PARAMÈTRES → choisissez un modèle et une clé');
    var h = lireH().slice(-MAX_CTX).filter(function (m) { return m.role === 'user' || m.role === 'assistant'; });
    var msgs = [{ role: 'system', content: systemPrompt() }];
    for (var i = 0; i < h.length; i++) msgs.push({ role: h[i].role, content: h[i].texte });
    /* v574 — SOURCES : avant l'appel, recherche des passages pertinents dans
       les corpus EMBARQUÉS (Bible Segond, Coran — fichiers locaux ; Pères —
       index v167 ; Valtorta — tradition/valtorta.json). Les extraits sont
       injectés comme contexte système et Adeodat est prié de les citer.
       Toute erreur = pas d'injection : la réponse reste normale. */
    try {
      const CH = window.__v574Chercher;
      if (CH && typeof CH.chercher === 'function') {
        if (onStatus) onStatus('🔎 Je fouille les corpus (Bible, Coran, Pères)…');
        const srcOk = await CH.chercher(texteUser, 6);
        if (srcOk && srcOk.bloc) msgs.push({ role: 'system', content: srcOk.bloc });
        if (onStatus) onStatus('…');
      }
    } catch (eSrc) {}
    msgs.push({ role: 'user', content: texteUser });
    /* V3c — STREAMING : la bulle se remplit au fil de l'eau ; le calque
       d'outils (v566) parse les ACTION sur le texte complet. */
    /* V3e — latence : réponses bornées (700 tokens) — le systemPrompt impose
       déjà la concision ; la latence perçue est surtout traitée par le
       TTS phrase-par-phrase. */
    return await callLLMStream(cfg, msgs, { temperature: 0.6, max_tokens: 700 }, function (delta) { if (onChunk) onChunk(delta); });
  }

  /* ── panneau + orbe ── */
  var pan = null;

  function orbe() {
    var o = document.getElementById('adeodat-orbe');
    if (o) return o;
    o = document.createElement('button');
    o.type = 'button';
    o.id = 'adeodat-orbe';
    o.className = 'adeodat-orbe';           /* PAS de classe ui-* : invariant v513 */
    /* v564bis — style par RÈGLE CSS (pas inline) : un module d'accessibilité
       retire l'attribut style des boutons ; une règle #id !important y
       survit (défaut mesuré sur mobile : orbe position:static 390×844). */
    if (!document.getElementById('adeodat-orbe-css')) {
      const st = document.createElement('style');
      st.id = 'adeodat-orbe-css';
      st.textContent = '#adeodat-orbe{position:fixed!important;right:18px!important;bottom:18px!important;width:52px!important;height:52px!important;border-radius:50%!important;border:1px solid rgba(229,193,90,.55)!important;background:radial-gradient(circle at 30% 30%,#1a2436,#0d1522)!important;color:#e5c15a!important;font-size:22px!important;cursor:pointer!important;box-shadow:0 8px 24px rgba(0,0,0,.5)!important;z-index:139000!important;display:block!important;padding:0!important;line-height:50px!important;text-align:center!important}@media (max-width:640px){#adeodat-orbe{bottom:96px!important}}';
      document.head.appendChild(st);
    }
    o.title = 'Adeodat — le Compagnon (V3.0)';
    o.setAttribute('aria-label', 'Ouvrir Adeodat, le compagnon');
    o.textContent = '🕊️';
    o.addEventListener('click', ouvrir);
    document.body.appendChild(o);
    return o;
  }

  function construire() {
    if (pan) return pan;
    pan = document.createElement('div');
    pan.id = 'adeodat-pan';
    pan.setAttribute('role', 'dialog');
    pan.setAttribute('aria-modal', 'false');
    pan.setAttribute('aria-label', 'Adeodat, le compagnon');
    var st = 'position:fixed;right:18px;bottom:82px;z-index:139100;width:min(400px,94vw);height:min(560px,80vh);' +
      'display:none;flex-direction:column;background:var(--ui-panel,#0d1626);color:var(--ui-ink,#e8e6e0);' +
      'border:1px solid var(--ui-border,#2a2a3a);border-radius:var(--ui-radius,12px);box-shadow:var(--ui-shadow,0 18px 60px rgba(0,0,0,.6));overflow:hidden';
    pan.style.cssText = st;
    pan.innerHTML =
      '<div style="display:flex;align-items:center;gap:.5rem;padding:.6rem .8rem;border-bottom:1px solid var(--ui-border,#2a2a3a)">' +
      '<span style="font-size:18px">🕊️</span>' +
      '<div style="flex:1;min-width:0"><div style="font-weight:700;font-size:.9rem;color:var(--ui-accent,#e5c15a)">Adeodat</div>' +
      '<div style="font-size:.62rem;color:var(--ui-dim,#8a8896)" id="adeodat-sous">le Compagnon — V3.0</div></div>' +
      '<select id="adeodat-perso" title="Personnalité" style="max-width:130px;font-size:.7rem;background:none;color:inherit;border:1px solid var(--ui-border,#2a2a3a);border-radius:6px;padding:.2rem"></select>' +
      '<button id="adeodat-neuf" type="button" title="Nouveau sujet — efface la mémoire" style="background:none;border:none;color:inherit;cursor:pointer;font-size:14px">🧹</button>' +
      '<button id="adeodat-tts" type="button" title="Lire les réponses à voix haute" style="background:none;border:none;color:inherit;cursor:pointer;font-size:15px">🔊</button>' +
      '<button id="adeodat-x" type="button" title="Fermer (Échap)" style="background:none;border:none;color:inherit;cursor:pointer;font-size:16px">✕</button></div>' +
      '<div id="adeodat-msgs" style="flex:1;overflow-y:auto;padding:.7rem;display:flex;flex-direction:column;gap:.5rem"></div>' +
      '<div style="display:flex;gap:.4rem;padding:.6rem;border-top:1px solid var(--ui-border,#2a2a3a)">' +
      '<button id="adeodat-mic" type="button" title="Parler à Adeodat" style="background:none;border:1px solid var(--ui-border,#2a2a3a);border-radius:8px;color:inherit;cursor:pointer;font-size:15px;padding:.3rem .5rem">🎤</button>' +
      '<input id="adeodat-in" type="text" placeholder="Parler à Adeodat…" aria-label="Message pour Adeodat" ' +
      'style="flex:1;background:rgba(255,255,255,.05);color:inherit;border:1px solid var(--ui-border,#2a2a3a);border-radius:8px;padding:.45rem .6rem;font:inherit;font-size:.85rem">' +
      '<button id="adeodat-env" type="button" title="Envoyer" style="background:none;border:1px solid var(--ui-border,#2a2a3a);border-radius:8px;color:var(--ui-accent,#e5c15a);cursor:pointer;font-size:14px;padding:.3rem .6rem">➤</button></div>';
    document.body.appendChild(pan);
    pan.querySelector('#adeodat-x').addEventListener('click', fermer);
    pan.addEventListener('click', function (e) { if (e.target === pan) fermer(); });
    pan.querySelector('#adeodat-tts').addEventListener('click', function () {
      const on = !ttsActif();
      try { localStorage.setItem(CLE_TTS, on ? '1' : '0'); } catch (e) {}
      this.textContent = on ? '🔊' : '🔇';
      if (!on) taire(); else parler('Adeodat vous écoute.');
    });
    pan.querySelector('#adeodat-neuf').addEventListener('click', function () {
      const nAvant = lireH().length;
      ecrireH([]);
      taire();
      const msgsN = document.getElementById('adeodat-msgs');
      if (msgsN) {
        msgsN.innerHTML = '';
        bulle('assistant', '🕊️ Peace be with you. Nouveau sujet — la mémoire est vide.');
        scrollBas();
      }
      majMem();
      toast('🧹 Nouveau sujet — ' + nAvant + ' message(s) effacé(s)', 'success');
    });
    pan.querySelector('#adeodat-env').addEventListener('click', function () {
      const inp = document.getElementById('adeodat-in');
      if (inp && inp.value.trim()) { const t = inp.value; inp.value = ''; envoyer(t); }
    });
    document.getElementById('adeodat-in').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && this.value.trim()) { const t = this.value; this.value = ''; envoyer(t); }
    });
    /* V3e — le micro pilote la SESSION CONTINUE (v566) : plus d'one-shot qui
       s'arrête au timeout SR (défaut Windows constaté). Relance auto sur
       onend/no-speech tant que la session est active. */
    document.getElementById('adeodat-mic').addEventListener('click', function () {
      if (window.__v566Libre) window.__v566Libre.continuSet(!window.__v566Libre.continuGet());
      else ecouter();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && pan && pan.style.display === 'flex') fermer();
    });
    peuplerPersona();
    return pan;
  }

  function peuplerPersona() {
    const sel = document.getElementById('adeodat-perso');
    if (!sel || sel.options.length) return;
    let html = '<option value="adeodat">🕊️ Adeodat (compagnon)</option>';
    try {
      const presets = (window.__v527Agents && window.__v527Agents.presets) || [];
      presets.forEach(function (p) { html += '<option value="' + esc(p.id) + '">✝ ' + esc(p.name || p.id) + '</option>'; });
    } catch (e) {}
    sel.innerHTML = html;
    sel.value = persona();
    sel.addEventListener('change', function () {
      try { localStorage.setItem(CLE_PERSO, sel.value); } catch (e) {}
      toast(sel.value === 'adeodat' ? '🕊️ Persona Adeodat' : '✝ Persona : ' + (sel.options[sel.selectedIndex] || {}).textContent, 'success');
    });
  }

  function bulle(role, texte) {
    const msgs = document.getElementById('adeodat-msgs');
    if (!msgs) return null;
    const d = document.createElement('div');
    d.className = 'ad-bulle ad-' + role;
    d.style.cssText = 'max-width:88%;padding:.5rem .65rem;border-radius:10px;font-size:.82rem;line-height:1.5;white-space:pre-wrap;' +
      (role === 'user'
        ? 'align-self:flex-end;background:rgba(79,142,247,.22);border:1px solid rgba(79,142,247,.35)'
        : 'align-self:flex-start;background:rgba(229,193,90,.10);border:1px solid rgba(229,193,90,.30)');
    d.innerHTML = '<span class="ad-tx">' + esc(texte) + '</span>';
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
    return d;
  }
  function scrollBas() {
    const msgs = document.getElementById('adeodat-msgs');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }

  /* v574 — mémoire : compteur d'échanges dans le sous-titre du panneau */
  function majMem() {
    const sous = document.getElementById('adeodat-sous');
    if (sous) sous.textContent = 'le Compagnon — V3.0 · mémoire : ' + Math.floor(lireH().length / 2) + ' échange(s)';
  }

  async function envoyer(texte) {
    texte = String(texte || '').trim();
    if (!texte) return;
    taire();
    construire();
    ajouterH('user', texte);
    bulle('user', texte);
    const bulleA = bulle('assistant', '…');
    /* V3f (v570) — MICRO SUSPENDU pendant toute la réponse : sur Android le
       micro resté actif entendait le TTS d'Adeodat → boucle d'écho (il
       s'envoyait ses propres réponses) + bip du recognizer à chaque
       redémarrage = « son de notification en permanence ». La session
       continue est suspendue ici, puis REPRISE quand la réponse est finie
       d'être dite (ou immédiatement si TTS muet / en cas d'erreur). */
    try { if (window.__v566Libre && window.__v566Libre.microPause) window.__v566Libre.microPause(); } catch (e) {}
    const file = []; let fileEnCours = false; let resteEnParcours = false;
    let reponseFinie = false;
    function tenterReprise() {
      if (!reponseFinie || fileEnCours || resteEnParcours) return;
      reponseFinie = false;                 /* la reprise ne survient qu\'une fois */
      try { if (window.__v566Libre && window.__v566Libre.microReprendre) window.__v566Libre.microReprendre(); } catch (e) {}
    }
    try {
      /* V3e — TTS PHRASE-PAR-PHRASE : la première phrase est lue PENDANT
         que la suite se génère (latence perçue divisée). File séquentielle.
         t = tampon global de la réponse ; parlé = offset déjà lu à voix haute. */
      let tampon = '', parleDeja = 0;
      /* file / fileEnCours : remontés au niveau de la fonction (v570) pour
         que la reprise du micro attende la fin RÉELLE de la file TTS. */
      function parlerSuivant() {
        if (!ttsActif()) { file.length = 0; fileEnCours = false; tenterReprise(); return; }
        if (!file.length) { fileEnCours = false; tenterReprise(); return; }
        const phrase = file.shift(); fileEnCours = true;
        try { if (typeof ttsEmission === 'function') ttsEmission(phrase, 'fr-FR', function () { parlerSuivant(); }, function () { parlerSuivant(); }); else { fileEnCours = false; tenterReprise(); } } catch (e) { fileEnCours = false; tenterReprise(); }
      }
      function ttsx(chunk) {
        if (chunk && bulleA) { const tx = bulleA.querySelector('.ad-tx'); if (tx) tx.textContent += chunk; scrollBas(); }
        if (!chunk) return;
        tampon += chunk;
        for (let i = parleDeja; i < tampon.length; i++) {
          const c = tampon.charAt(i);
          if (c === '.' || c === '!' || c === '?' || c === '\n') {
            const phrase = tampon.slice(parleDeja, i + 1).trim();
            if (phrase.length > 1) {
              file.push(phrase);
              if (!fileEnCours) parlerSuivant();
            }
            parleDeja = i + 1;
          }
        }
      }
      const plein = await penser(texte, ttsx, function (s) { if (bulleA) { const tx = bulleA.querySelector('.ad-tx'); if (tx) tx.textContent = s; } });
      const txt = String(plein || '').trim() || '(réponse vide)';
      if (bulleA) { const tx = bulleA.querySelector('.ad-tx'); if (tx) tx.textContent = txt; }
      ajouterH('assistant', txt);
      scrollBas();
      majMem();
      /* V3e — la file TTS a déjà lu la quasi-totalité : on ne prononce que
         la fin restée en attente (sinon la réponse serait lue deux fois). */
      reponseFinie = true;
      const reste = txt.slice(Math.min(parleDeja, txt.length)).trim();
      if (ttsActif() && reste.length > 1) {
        resteEnParcours = true;
        parler(reste, function () { resteEnParcours = false; tenterReprise(); });
      }
      tenterReprise();                      /* reprise du micro (fin de réponse) */
    } catch (e) {
      reponseFinie = true; fileEnCours = false; resteEnParcours = false;
      tenterReprise();                      /* ne jamais laisser le micro suspendu */
      const msg = '⚠️ ' + String(e && e.message || e);
      if (bulleA) { const tx = bulleA.querySelector('.ad-tx'); if (tx) tx.textContent = msg; }
      toast('Adeodat : ' + String(e && e.message || e), 'error');
    }
  }

  function ouvrir() {
    construire();
    pan.style.display = 'flex';
    peuplerPersona();
    /* replier l'historique récent à l'ouverture */
    const msgs = document.getElementById('adeodat-msgs');
    if (msgs) {
      msgs.innerHTML = '';
      const h = lireH().slice(-30);
      if (!h.length) bulle('assistant', '🕊️ Peace be with you. Je suis Adeodat, votre compagnon. Posez-moi une question de foi, d\'Écriture ou d\'histoire de l\'Église — ou parlez-moi avec le micro.');
      else h.forEach(function (m) { bulle(m.role, m.texte); });
      scrollBas();
    }
    majMem();
    const inp = document.getElementById('adeodat-in');
    if (inp) inp.focus();
    /* V3e — l'orbe passe en mode ÉCOUTE : la session micro démarre avec le
       panneau (mains libres d'office ; toggle 🎤 pour couper). */
    /* V3f (v570) — (ré)amorcer TOUJOURS la session à l'ouverture : après une
       fermeture (session stoppée avec le panneau) ou un drapeau '1' resté
       sur une session morte (défaut Windows « le micro ne fait rien »),
       l\'orbe doit redonner un micro VIVANT. continuSet(true) est idempotent. */
    try { if (window.__v566Libre) window.__v566Libre.continuSet(true); } catch (e) {}
    try { if (window.__v574Wake && window.__v574Wake.panOuvre) window.__v574Wake.panOuvre(); } catch (e) {}
  }
  /* V3f (v570) — fermer le panneau ARRÊTE la session micro : plus de
     reconnaissance qui tourne « en permanence en arrière-plan » (bips
     système répétés constatés sur Android). L\'orbe la relance à la
     réouverture. */
  function fermer() {
    if (pan) pan.style.display = 'none';
    taire();
    try { if (window.__v566Libre && window.__v566Libre.fermerSession) window.__v566Libre.fermerSession(); } catch (e) {}
    try { if (window.__v574Wake && window.__v574Wake.panFerme) window.__v574Wake.panFerme(); } catch (e) {}
  }

  /* amorçage : l'orbe existe dès le chargement (hors ui-* — invariant v513) */
  function init() { orbe(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.__v564Adeodat = {
    ouvrir: ouvrir, fermer: fermer, envoyer: envoyer, parler: parler, taire: taire,
    systemPrompt: systemPrompt, persona: persona
  };
})();

