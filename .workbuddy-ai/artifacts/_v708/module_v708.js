<script id="v708-longueur">
/* ═══ v708 : RÉPONSES PLUS LONGUES ═══
   Le défaut historique était max_tokens=4096 avec une consigne « sois concis ».
   Désormais : 8192 tokens par défaut, consigne « développe », et un réglage
   dans PARAMÈTRES > Modèle (Standard / Long / Très long / Max).
   Les appels techniques (sondes max_tokens:1, résumés, JSON…) ne sont pas
   touchés : on ne remplace que les appels de chat dont le prompt système
   est celui de la conversation. */
(function () {
  'use strict';
  var KEY = 'theologicus_longueur_reponse';
  var IDB_ID = 'reponse_longueur';
  var CHOIX = [
    { v: 4096,  l: 'Standard — 4096 caractères~' },
    { v: 8192,  l: 'Long — 8192 (défaut)' },
    { v: 12000, l: 'Très long — 12000' },
    { v: 16000, l: 'Maximum — 16000' }
  ];
  var REGLE = '6. Sois concis mais complet — évite les répétitions et les phrases vides.';
  var REGLE_LONGUE = '6. Développe ta réponse : sois complet et détaillé, avec des explications et des exemples quand c’est utile ; évite seulement les répétitions et les phrases vides.';

  function lire() {
    try {
      var n = parseInt(localStorage.getItem(KEY), 10);
      if (CHOIX.some(function (c) { return c.v === n; })) return n;
    } catch (e) {}
    return 8192;
  }
  function ecrire(n) {
    n = parseInt(n, 10);
    if (!CHOIX.some(function (c) { return c.v === n; })) n = 8192;
    try { localStorage.setItem(KEY, String(n)); } catch (e) {}
    try {
      if (typeof db !== 'undefined' && db && db.put) db.put('settings', { id: IDB_ID, value: n }).catch(function () {});
    } catch (e) {}
    return n;
  }
  function hydrater() {
    try {
      if (localStorage.getItem(KEY)) return;
      if (typeof db === 'undefined' || !db || !db.get) return;
      db.get('settings', IDB_ID).then(function (r) {
        if (r && CHOIX.some(function (c) { return c.v === Number(r.value); })) localStorage.setItem(KEY, String(r.value));
      }).catch(function () {});
    } catch (e) {}
  }
  setTimeout(hydrater, 700);

  /* ── consigne de style : on remplace UNIQUEMENT la règle connue ── */
  var origPrompt = window.buildSystemPrompt;
  if (typeof origPrompt === 'function' && !origPrompt.__v708) {
    var np = function () {
      var p = String(origPrompt.apply(this, arguments) || '');
      if (lire() > 4096 && p.indexOf(REGLE) !== -1) p = p.replace(REGLE, REGLE_LONGUE);
      return p;
    };
    np.__v708 = true; window.buildSystemPrompt = np;
  }

  /* ── max_tokens : seulement les appels de chat du défaut 4096 ── */
  function appliquer(messages, opts) {
    var sys = ((messages && messages[0] && messages[0].content) || '');
    sys = typeof sys === 'string' ? sys : '';
    var chat = /^(?:Tu es|\[AGENT)/.test(sys);
    var o = opts || {};
    /* On ne remplace QUE le défaut de chat (4096) : les appels bornés
       volontairement (700, 800, 1500…) gardent leur valeur. */
    if (chat && (!o.max_tokens || o.max_tokens === 4096)) {
      o = Object.assign({}, o, { max_tokens: lire() });
    }
    return o;
  }
  var origStream = window.callLLMStream;
  if (typeof origStream === 'function' && !origStream.__v708) {
    var ns = function (cfg, messages, opts, onChunk) {
      return origStream.call(this, cfg, messages, appliquer(messages, opts), onChunk);
    };
    ns.__v708 = true; window.callLLMStream = ns;
  }

  /* ── réglage dans PARAMÈTRES > Modèle (jamais dans .header-controls) ── */
  function ui() {
    var panneau = document.getElementById('settings-panneau-model');
    if (!panneau || document.getElementById('v708-longueur-group')) return;
    var g = document.createElement('div');
    g.className = 'field-group';
    g.id = 'v708-longueur-group';
    g.innerHTML = '<label class="field-label">📏 Longueur des réponses <span class="studio-help" title="Nombre maximum de tokens générés par réponse. Le réglage ne concerne que le chat, pas les sondes techniques.">?</span></label>'
      + '<select class="field-input field-select" id="v708-longueur-select">'
      + CHOIX.map(function (c) { return '<option value="' + c.v + '">' + c.l + '</option>'; }).join('')
      + '</select><div class="field-hint" id="v708-longueur-hint">▸ Plus la valeur est haute, plus la réponse peut être longue.</div>';
    panneau.appendChild(g);
    var sel = document.getElementById('v708-longueur-select');
    sel.value = String(lire());
    sel.onchange = function () {
      ecrire(sel.value);
      if (typeof toast === 'function') toast('Longueur des réponses : ' + sel.options[sel.selectedIndex].text, 'success');
    };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ui);
  else ui();
  setTimeout(ui, 900);
  setInterval(ui, 1500);

  window.__v708Longueur = {
    version: 708,
    lire: lire,
    ecrire: ecrire,
    choix: CHOIX.map(function (c) { return c.v; }),
    appliquer: appliquer,
    regleLongue: REGLE_LONGUE
  };
})();
</script>
