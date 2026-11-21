<script id="v710-fluide">
/* ═══ v710 — MODE FLUIDE (Honor X8b / WebView Android) ═══
   Injecté DANS <head>, avant tous les autres scripts, pour pouvoir
   limiter les timers dès leur création.

   - détection mobile / UA Android / écran étroit → actif par défaut ;
   - timers rapides (< 1000 ms) ramenés à 1000 ms (les tâches utiles
     restent, mais réveillent 2 à 4× moins souvent) ;
   - effets coûteux (ambiant, backdrop-filter, ombres, transitions)
     désactivés via un attribut sur <html> ;
   - réglage Auto / Toujours / Jamais dans PARAMÈTRES > Modèle.

   Sur desktop, sans opt-in, RIEN ne change (bancs v597/v598 protégés). */
(function () {
  'use strict';
  var KEY = 'theologicus_mode_fluide';
  var ua = String((navigator && navigator.userAgent) || '');
  var mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
    || !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
    || (window.screen && Math.min(screen.width, screen.height) <= 600);
  var reglages = { auto: 'auto', on: 'on', off: 'off' };
  function choix() {
    try {
      var v = localStorage.getItem(KEY);
      if (v === 'on' || v === 'off' || v === 'auto') return v;
    } catch (e) {}
    return 'auto';
  }
  function actif() {
    var c = choix();
    return c === 'on' || (c === 'auto' && mobile);
  }

  /* ── registre des timers pour réappliquer le réglage à chaud ── */
  var timers = [];
  var si = window.setInterval, ci = window.clearInterval;
  var clamps = 0;
  function borne(ms) {
    var n = Number(ms) || 0;
    return (n > 0 && n < 1000) ? 1000 : n;
  }
  window.setInterval = function (fn, ms) {
    var reelle = actif() ? borne(ms) : Number(ms);
    if (reelle !== Number(ms)) clamps++;
    var id = si.apply(this, [fn, reelle].concat(Array.prototype.slice.call(arguments, 2)));
    timers.push({ id: id, fn: fn, ms: Number(ms), reelle: reelle });
    return id;
  };
  window.clearInterval = function (id) {
    for (var i = timers.length - 1; i >= 0; i--) if (timers[i].id === id) { timers.splice(i, 1); break; }
    return ci.apply(this, arguments);
  };

  function css() {
    return 'html[data-v710-perf="on"] #theo-ambient,'
      + 'html[data-v710-perf="on"] .theo-ambient{display:none!important}'
      + 'html[data-v710-perf="on"] *{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;'
      + 'text-shadow:none!important;transition-duration:0ms!important;animation-duration:0ms!important;'
      + 'scroll-behavior:auto!important}'
      + 'html[data-v710-perf="on"] .message.msg-enter{animation:none!important}';
  }
  function injecterCss() {
    if (document.getElementById('v710-perf-css')) return;
    try {
      var s = document.createElement('style'); s.id = 'v710-perf-css';
      s.appendChild(document.createTextNode(css()));
      (document.head || document.documentElement).appendChild(s);
    } catch (e) {}
  }

  function appliquer() {
    var on = actif();
    try { document.documentElement.setAttribute('data-v710-perf', on ? 'on' : 'off'); } catch (e) {}
    if (on) {
      injecterCss();
      try { if (typeof window.theoMotionSet === 'function') window.theoMotionSet('off', true); } catch (e) {}
    }
    /* Réapplique les bornes aux timers déjà créés si l'utilisateur change. */
    timers.forEach(function (t) {
      var cible = on ? borne(t.ms) : t.ms;
      if (cible === t.reelle) return;
      try { ci.call(window, t.id); } catch (e) {}
      t.reelle = cible;
      t.id = si.call(window, t.fn, cible);
    });
    return on;
  }
  appliquer();
  /* Certains réglages (motion) n'existent qu'après le chargement du corps. */
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', appliquer);
  else setTimeout(appliquer, 0);
  setTimeout(appliquer, 1000);

  /* ── réglage UI, ajouté quand PARAMÈTRES est construit ── */
  function ui() {
    var panneau = document.getElementById('settings-panneau-model');
    if (!panneau || document.getElementById('v710-fluide-group')) return;
    var g = document.createElement('div');
    g.className = 'field-group'; g.id = 'v710-fluide-group';
    g.innerHTML = '<label class="field-label">⚡ Fluidité <span class="studio-help" title="Réduit les animations et les réveils périodiques sur les appareils modestes.">?</span></label>'
      + '<select class="field-input field-select" id="v710-fluide-select">'
      + '<option value="auto">Auto (mobile détecté)</option>'
      + '<option value="on">Toujours fluide</option>'
      + '<option value="off">Jamais (effets complets)</option></select>'
      + '<div class="field-hint">▸ Recommandé sur Honor X8b / Android.</div>';
    panneau.appendChild(g);
    var sel = document.getElementById('v710-fluide-select');
    sel.value = choix();
    sel.onchange = function () {
      try { localStorage.setItem(KEY, sel.value); } catch (e) {}
      appliquer();
      if (typeof toast === 'function') toast('Mode fluide : ' + sel.options[sel.selectedIndex].text, 'success');
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ui);
  else setTimeout(ui, 0);
  setTimeout(ui, 800);
  setInterval(ui, 3000);

  window.__v710Perf = {
    version: 710,
    estActif: actif,
    appliquer: appliquer,
    estMobile: mobile,
    stats: function () { return { timers: timers.length, clamps: clamps }; }
  };
})();
</script>
