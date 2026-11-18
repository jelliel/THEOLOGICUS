<script id="v704-cles">
/* ═══ v704 : POOL DE CLÉS PAR FOURNISSEUR (opt-in) ═══
   Sur 429/402/403, essayer la CLÉ SUIVANTE sur le MÊME modèle avant de
   laisser v700/v701 changer de modèle. Le pool est vide par défaut :
   le comportement existant reste identique.
   - stockage : IDB settings 'key_pool_v1' (canonique) + localStorage (filet)
   - cooldown par clé : 60 s après 429, 5 min après 402/403
   - aucune clé n'est écrite dans un toast, un log ou une bulle. */
(function () {
  'use strict';
  var CLE_POOL = 'theologicus_key_pool_v1';
  var CLE_ETAT = 'theologicus_key_etat_v1';
  var CODES = [402, 403, 429];
  var DELAIS = { 429: 60000, 402: 300000, 403: 300000 };

  function lirePool() { try { return JSON.parse(localStorage.getItem(CLE_POOL) || '{}') || {}; } catch (e) { return {}; } }
  function lireEtats() { try { return JSON.parse(localStorage.getItem(CLE_ETAT) || '{}') || {}; } catch (e) { return {}; } }
  function ecrireEtats(o) { try { localStorage.setItem(CLE_ETAT, JSON.stringify(o)); } catch (e) {} }
  function ecrirePool(o) {
    try { localStorage.setItem(CLE_POOL, JSON.stringify(o)); } catch (e) {}
    try { if (typeof db !== 'undefined' && db && db.put) db.put('settings', { id: 'key_pool_v1', value: o }).catch(function () {}); } catch (e) {}
  }
  function hydrater() {
    try {
      if (localStorage.getItem(CLE_POOL)) return;
      if (typeof db === 'undefined' || !db || !db.get) return;
      db.get('settings', 'key_pool_v1').then(function (r) {
        if (r && r.value && typeof r.value === 'object') localStorage.setItem(CLE_POOL, JSON.stringify(r.value));
      }).catch(function () {});
    } catch (e) {}
  }
  setTimeout(hydrater, 900);

  function marquer(prov, cle, statut) {
    var o = lireEtats(), p = o[prov] || (o[prov] = {});
    p[cle] = { ts: Date.now(), fin: Date.now() + (DELAIS[Number(statut)] || DELAIS[403]) };
    ecrireEtats(o);
  }
  function disponible(prov, cle) {
    var e = (lireEtats()[prov] || {})[cle];
    return !e || !isFinite(Number(e.fin)) || Date.now() > Number(e.fin);
  }
  function providerDe(cfg) {
    try { if (cfg && cfg.providerId) return cfg.providerId; } catch (e) {}
    var id = (typeof state !== 'undefined' && state.model) || '';
    if (/^c_/.test(id)) return '';           // modèle personnalisé : clé dans sa propre config
    try { if (typeof _providerModelId === 'function') { var pm = _providerModelId(id); if (pm && pm.prov) return pm.prov.id; } } catch (e) {}
    try {
      var u = String((cfg && cfg.endpoint) || '');
      var ps = (typeof PROVIDERS !== 'undefined' && PROVIDERS) || [];
      for (var i = 0; i < ps.length; i++) {
        if (ps[i].base && u.indexOf(String(ps[i].base).replace(/\/v1\/?$/, '')) !== -1) return ps[i].id;
      }
    } catch (e) {}
    return '';
  }
  function persister(prov, cle) {
    try {
      state.keys[prov] = cle;
      if (typeof setCookie === 'function') setCookie('key_' + prov, cle);
      if (typeof saveAppConfig === 'function') saveAppConfig();
    } catch (e) {}
  }
  function avis(n, total) {
    var m = '🔑 Clé ' + n + '/' + total + ' utilisée — question reprise sur le même modèle';
    try { if (typeof toast === 'function') toast(m, 'info'); } catch (e) {}
    return m;
  }

  async function tourner(fn, ctx, args, cfg, err) {
    if (!err || CODES.indexOf(Number(err.status)) === -1) return null;
    var prov = providerDe(cfg);
    if (!prov || prov === 'ollama' || prov === 'freellmapi') return null;
    var pool = lirePool()[prov] || [];
    if (!Array.isArray(pool) || pool.length < 2) return null;
    var courant = String((cfg && cfg.apiKey) || (state.keys && state.keys[prov]) || '');
    var idx = pool.indexOf(courant);
    if (idx < 0) return null;
    for (var n = 1; n < pool.length; n++) {
      var cle = String(pool[(idx + n) % pool.length] || '');
      if (!cle || !disponible(prov, cle)) continue;
      var cfg2 = {};
      for (var k in cfg) { try { cfg2[k] = cfg[k]; } catch (e) {} }
      cfg2.apiKey = cle;
      persister(prov, cle);
      try {
        var r = await fn.apply(ctx, [cfg2].concat(Array.prototype.slice.call(args, 1)));
        avis(n, pool.length);
        return { valeur: r, prov: prov, rang: n };
      } catch (e2) {
        marquer(prov, cle, e2 && e2.status);
      }
    }
    persister(prov, courant);
    return null;
  }
  function copier(src, dst) { for (var k in src) { try { dst[k] = src[k]; } catch (e) {} } }

  var origStream = window.callLLMStream;
  if (typeof origStream === 'function' && !origStream.__v704) {
    var stream = async function (cfg, messages, opts, onChunk) {
      var chunks = 0;
      var cb = (typeof onChunk === 'function') ? function (c, f) { chunks++; return onChunk(c, f); } : onChunk;
      try { return await origStream.call(this, cfg, messages, opts, cb); }
      catch (e) {
        if (chunks > 0) throw e;
        var r = await tourner(origStream, this, [cfg, messages, opts, cb], cfg, e);
        if (!r) throw e;
        return r.valeur;
      }
    };
    copier(origStream, stream); stream.__v704 = true; window.callLLMStream = stream;
  }
  var origLLM = window.callLLM;
  if (typeof origLLM === 'function' && !origLLM.__v704) {
    var simple = async function (cfg, messages, opts) {
      try { return await origLLM.call(this, cfg, messages, opts); }
      catch (e) {
        var r = await tourner(origLLM, this, [cfg, messages, opts], cfg, e);
        if (!r) throw e;
        return r.valeur;
      }
    };
    copier(origLLM, simple); simple.__v704 = true; window.callLLM = simple;
  }

  /* ── interface : PARAMÈTRES > Modèle, jamais .header-controls ── */
  function css() {
    return '.v704-pool{margin:10px 0 16px;padding:12px;border:1px solid var(--border,#445);border-radius:8px}'
      + '.v704-pool label{display:block;font-size:12px;margin-bottom:6px;color:var(--text-dim,#9ab)}'
      + '.v704-pool textarea{width:100%;min-height:84px;box-sizing:border-box;background:var(--bg,#111);color:var(--text,#ddd);'
      + 'border:1px solid var(--border,#445);border-radius:6px;padding:8px;font:12px/1.5 monospace;resize:vertical}'
      + '.v704-pool .v704-ligne{display:flex;gap:8px;align-items:center;margin-top:8px}'
      + '.v704-pool button{cursor:pointer;font-size:12px;padding:5px 10px;border-radius:6px;border:1px solid var(--border,#445);background:var(--bg,#111);color:var(--text,#ddd)}'
      + '.v704-pool .v704-info{font-size:11px;font-style:italic;color:var(--text-dim,#9ab)}';
  }
  function construireUI() {
    var host = document.getElementById('providers-list');
    if (!host || !host.parentNode || document.getElementById('v704-pool')) return;
    try {
      var st = document.createElement('style'); st.id = 'v704-pool-css';
      st.appendChild(document.createTextNode(css())); document.head.appendChild(st);
    } catch (e) {}
    var box = document.createElement('div');
    box.id = 'v704-pool'; box.className = 'v704-pool';
    var ps = (typeof PROVIDERS !== 'undefined' && PROVIDERS) || [];
    var options = ps.filter(function (p) { return p.id !== 'ollama' && p.id !== 'freellmapi'; })
      .map(function (p) { return '<option value="' + p.id + '">' + p.label + '</option>'; }).join('');
    box.innerHTML = '<label for="v704-prov">🔑 Pool de clés (opt-in — une clé par ligne)</label>'
      + '<select id="v704-prov">' + options + '</select>'
      + '<textarea id="v704-keys" spellcheck="false" autocomplete="off" placeholder="Une clé par ligne. Vide = comportement inchangé."></textarea>'
      + '<div class="v704-ligne"><button type="button" id="v704-save">ENREGISTRER</button>'
      + '<button type="button" id="v704-clear">EFFACER</button><span class="v704-info" id="v704-info"></span></div>';
    host.parentNode.insertBefore(box, host.nextSibling);
    var sel = document.getElementById('v704-prov'), ta = document.getElementById('v704-keys');
    var info = document.getElementById('v704-info');
    function charger() {
      var p = sel.value, pool = lirePool()[p] || [];
      ta.value = pool.join('\n');
      info.textContent = pool.length ? (pool.length + ' clé' + (pool.length > 1 ? 's' : '') + ' — rotation active') : 'aucune clé — rotation inactive';
    }
    sel.addEventListener('change', charger);
    /* Les pools de clés sont surtout utiles sur Gemini (quotas par clé). */
    try { if (Array.prototype.some.call(sel.options, function (o) { return o.value === 'gemini'; })) sel.value = 'gemini'; } catch (e) {}
    charger();
    document.getElementById('v704-save').addEventListener('click', function () {
      var p = sel.value;
      var liste = ta.value.split(/[\r\n]+/).map(function (x) { return x.trim(); }).filter(Boolean);
      var uniques = [], vu = {};
      liste.forEach(function (x) { if (!vu[x]) { vu[x] = 1; uniques.push(x); } });
      var pool = lirePool();
      if (uniques.length) pool[p] = uniques; else delete pool[p];
      ecrirePool(pool); ecrireEtats({});
      if (uniques.length) persister(p, uniques[0]);
      charger();
      try { if (typeof toast === 'function') toast('Pool ' + p + ' : ' + uniques.length + ' clé(s) enregistrée(s)', 'success'); } catch (e) {}
    });
    document.getElementById('v704-clear').addEventListener('click', function () {
      var p = sel.value, pool = lirePool(); delete pool[p];
      ecrirePool(pool); ecrireEtats({}); ta.value = ''; charger();
    });
  }
  function demarrer() {
    construireUI();
    setInterval(construireUI, 1500);   // la modale est recréée par endroits
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
  setTimeout(demarrer, 800);

  window.__v704Keys = {
    version: 704,
    codes: CODES,
    lirePool: lirePool,
    ecrirePool: ecrirePool,
    disponible: disponible,
    marquer: marquer,
    providerDe: providerDe,
    tourner: tourner,
    avis: avis
  };
})();
</script>
