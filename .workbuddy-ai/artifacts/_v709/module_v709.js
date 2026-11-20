<script id="v709-clefs-backup">
/* ═══ v709 — CLÉS API DANS LES SAUVEGARDES ═══
   Le backup auto de fermeture (v604) ne contenait que `data.chats`, donc
   une restauration redemandait la clé Mistral. Désormais :
   - export manuel ET backup auto embarquent `data.apiKeys` ;
   - importData restaure ces clés dans state, cookies, app_config (IDB)
     et le localStorage pour les clés annexes.

   ⚠ Le fichier de sauvegarde contient des clés EN CLAIR : ne pas le partager. */
(function () {
  'use strict';
  var LOCAUX = ['agnes_api_key', 'theologicus_apologetics_key'];

  function net(k) {
    try { return cleanApiKey(k); } catch (e) { return String(k || '').replace(/[\r\n\s]+/g, '').trim(); }
  }
  function cookie(nom) {
    try { return typeof getCookie === 'function' ? getCookie(nom) : ''; } catch (e) { return ''; }
  }
  function poser(nom, val) {
    try { if (typeof setCookie === 'function') setCookie(nom, val); } catch (e) {}
  }

  function collecter() {
    var out = { providers: {}, mistral: '', local: {} };
    try {
      (typeof PROVIDERS !== 'undefined' ? PROVIDERS : []).forEach(function (p) {
        var v = cookie('key_' + p.id) || ((typeof state !== 'undefined' && state.keys) ? state.keys[p.id] : '');
        if (v) out.providers[p.id] = net(v);
      });
    } catch (e) {}
    try {
      out.mistral = net(cookie('mistral_api_key')
        || (typeof state !== 'undefined' && state.apiKey)
        || out.providers.mistral || '');
      if (out.mistral) out.providers.mistral = out.mistral;
    } catch (e) {}
    try {
      LOCAUX.forEach(function (k) { var v = localStorage.getItem(k); if (v) out.local[k] = v; });
    } catch (e) {}
    return out;
  }

  function restaurer(keys) {
    if (!keys || typeof keys !== 'object') return 0;
    var n = 0;
    try {
      Object.keys(keys.providers || {}).forEach(function (id) {
        var v = net(keys.providers[id]);
        if (!v) return;
        if (typeof state !== 'undefined') { state.keys = state.keys || {}; state.keys[id] = v; }
        poser('key_' + id, v); n++;
      });
    } catch (e) {}
    var m = net(keys.mistral || (keys.providers && keys.providers.mistral));
    if (m) {
      try {
        if (typeof state !== 'undefined') { state.apiKey = m; state.keys = state.keys || {}; state.keys.mistral = m; }
        poser('mistral_api_key', m); poser('key_mistral', m);
        if (typeof markApiOnline === 'function') markApiOnline();
      } catch (e) {}
    }
    try {
      Object.keys(keys.local || {}).forEach(function (k) {
        if (LOCAUX.indexOf(k) !== -1 && keys.local[k]) localStorage.setItem(k, keys.local[k]);
      });
    } catch (e) {}
    if (n) {
      try { if (typeof saveAppConfig === 'function') saveAppConfig(); } catch (e) {}
      try { if (typeof refreshModelSelect === 'function') refreshModelSelect(); } catch (e) {}
    }
    return n;
  }

  /* Avertissement visible dans GESTION DES DONNÉES. */
  function avertir() {
    var btn = document.getElementById('btn-export');
    if (!btn || document.getElementById('v709-avert')) return;
    var d = document.createElement('div');
    d.id = 'v709-avert'; d.className = 'info-block';
    d.style.cssText = 'border-left-color:var(--danger,#e55);margin-bottom:12px';
    d.innerHTML = '<strong style="color:var(--danger,#e55)">⚠ Cette sauvegarde contient vos clés API en clair</strong><br>'
      + 'La restauration remet les conversations <em>et</em> la clé Mistral : ne partagez pas le fichier.';
    btn.parentNode.insertBefore(d, btn);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avertir);
  else avertir();
  setTimeout(avertir, 900);
  setInterval(avertir, 1500);

  window.__v709Keys = { version: 709, collecter: collecter, restaurer: restaurer, locaux: LOCAUX };
})();
</script>
