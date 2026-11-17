<script id="v700-bascule">
/* ═══ v700 : BASCULE AUTOMATIQUE 403 → modèle disponible ═══
   Le mécanisme historique (v151g/v614) n'agissait qu'APRÈS l'affichage
   de l'erreur, était désactivé par défaut et exigeait une jauge âgée de
   moins de 10 min. Ici la bascule a lieu AU MOMENT de l'erreur HTTP :
   callLLMStream / callLLM réessaient une fois avec un autre modèle
   pourvu d'une clé, puis mettent à jour le modèle actif et le sélecteur.

   Codes basculables : 401/403/404/429/5xx. 402 (crédit épuisé) est
   EXCLU : il est lié au compte, pas au modèle (leçon v614).
   Anti-boucle : jamais deux bascules en chaîne depuis le modèle qu'on
   vient de choisir, et retour au modèle d'origine si le repli échoue.
   Aucun contrôle n'est ajouté à .header-controls (v597/v598). */
(function () {
  'use strict';
  var CODES = [401, 403, 404, 429, 500, 502, 503, 504];
  var CLE_ANTI = 'theologicus_v700_bascule';
  var CLE_DESC  = 'theologicus_gauge_autofb';   // 0 = désactivé (case existante)
  var DELAI_ANTI = 5 * 60 * 1000;

  function estBasculable(e) {
    return !!(e && CODES.indexOf(Number(e.status)) !== -1);
  }
  function actif() {
    try { return localStorage.getItem(CLE_DESC) !== '0'; } catch (e) { return true; }
  }
  function lireAnti() {
    try { return JSON.parse(localStorage.getItem(CLE_ANTI) || 'null') || {}; } catch (e) { return {}; }
  }
  function ecrireAnti(failed, vers) {
    try { localStorage.setItem(CLE_ANTI, JSON.stringify({ failed: failed, vers: vers, ts: Date.now() })); } catch (e) {}
  }

  function providerDe(id) {
    try { if (typeof _providerModelId === 'function') { var pm = _providerModelId(id); if (pm && pm.prov) return pm.prov.id; } } catch (e) {}
    if (typeof id === 'string' && id.indexOf(':') > 0) return id.slice(0, id.indexOf(':'));
    return 'mistral';
  }
  function frais() {
    var c = null;
    try { c = JSON.parse(localStorage.getItem('theologicus_gauge_last') || 'null'); } catch (e) {}
    if (!c || !c.res || !c.ts || !isFinite(Date.now() - Number(c.ts)) || Date.now() - Number(c.ts) > 10 * 60 * 1000) return {};
    var m = {};
    c.res.forEach(function (x) { if (x && x.k === 0) m[x.v] = true; });
    return m;
  }
  function selectionnables() {
    var out = [];
    try { if (typeof _tousModelesSelectionnables === 'function') out = _tousModelesSelectionnables().slice(); } catch (e) {}
    try {
      ((typeof state !== 'undefined' && state.customModels) || []).forEach(function (m) {
        if (m && m.uid) out.push({ value: m.uid, label: m.name || m.uid, groupe: 'Personnalisé' });
      });
    } catch (e) {}
    return out;
  }
  /* Choix déterministe : jauge verte fraîche > autre fournisseur > même
     fournisseur > modèle léger > Ollama local. On exige une clé sauf pour
     Ollama (v441 : clé fictive 'local'). */
  function choisir(failedId) {
    if (!actif()) return null;
    var anti = lireAnti();
    if (anti.vers === failedId && Date.now() - Number(anti.ts || 0) < DELAI_ANTI) return null;
    var verts = frais();
    var provFailed = providerDe(failedId);
    var candidats = [];
    selectionnables().forEach(function (x) {
      if (!x || !x.value || x.value === failedId) return;
      var p = providerDe(x.value);
      var local = /^ollama:/.test(x.value);
      if (!local) { try { if (typeof _clePourModele !== 'function' || !_clePourModele(x.value)) return; } catch (e) { return; } }
      var s = 0;
      if (verts[x.value]) s += 100;
      if (p !== provFailed) s += 40;
      if (/small|flash|nemo|mini|lite|haiku/i.test(x.value)) s += 12;
      if (local) s -= 80;
      candidats.push({ id: x.value, label: x.label || x.value, score: s });
    });
    candidats.sort(function (a, b) { return b.score - a.score || String(a.id).localeCompare(String(b.id)); });
    return candidats.length ? candidats[0].id : null;
  }
  function libelle(id) {
    var t = selectionnables();
    for (var i = 0; i < t.length; i++) if (t[i].value === id) return t[i].label || id;
    return id;
  }
  function poser(id) {
    try {
      if (typeof state === 'undefined') return;
      state.model = id;
      var a = document.getElementById('model-select'); if (a) a.value = id;
      var b = document.getElementById('model-select-mob'); if (b) b.value = id;
      try { if (typeof db !== 'undefined' && db && db.put) db.put('settings', { id: 'model', value: id }).catch(function () {}); } catch (e) {}
      try { if (typeof saveAppConfig === 'function') saveAppConfig(); } catch (e) {}
      var sys = (state.messages || []).find(function (m) { return m.role === 'system'; });
      if (sys && typeof buildSystemPrompt === 'function') sys.content = buildSystemPrompt();
    } catch (e) {}
  }
  function configDe(id) {
    try { if (typeof resolveModelConfig !== 'function') return null; var c = resolveModelConfig(id); return (c && c.endpoint) ? c : null; } catch (e) { return null; }
  }

  /* Même logique pour les DEUX points d'entrée. `fn` est la fonction
     immédiatement inférieure dans la chaîne des wrappers : on ne se
     réappelle donc jamais soi-même. */
  async function tenter(fn, ctx, args, failedId, onChunk) {
    var id = choisir(failedId);
    if (!id) return null;
    var cfg2 = configDe(id);
    if (!cfg2) return null;
    var nouveaux = [cfg2].concat(Array.prototype.slice.call(args, 1));
    poser(id);
    ecrireAnti(failedId, id);
    try {
      var r = await fn.apply(ctx, nouveaux);
      try { if (typeof toast === 'function') toast('🔄 HTTP ' + args[0].__v700Status + ' — bascule automatique vers ' + libelle(id), 'success'); } catch (e) {}
      return { valeur: r, id: id };
    } catch (e2) {
      poser(failedId);     // repli lui aussi en échec : on rend le modèle d'origine
      return null;
    }
  }
  function marquer(cfg, e) {
    try { if (cfg && typeof cfg === 'object') { cfg.__v700Status = e && e.status; } } catch (x) {}
  }
  function copier(src, dst) { for (var k in src) { try { dst[k] = src[k]; } catch (e) {} } }

  var origStream = window.callLLMStream;
  if (typeof origStream === 'function' && !origStream.__v700) {
    var stream = async function (cfg, messages, opts, onChunk) {
      var chunks = 0;
      var cb = (typeof onChunk === 'function') ? function (c, f) { chunks++; return onChunk(c, f); } : onChunk;
      try { return await origStream.call(this, cfg, messages, opts, cb); }
      catch (e) {
        if (!estBasculable(e) || chunks > 0) throw e;
        marquer(cfg, e);
        var failedId = (typeof state !== 'undefined' && state.model) || (cfg && cfg.model) || '';
        var r = await tenter(origStream, this, [cfg, messages, opts, cb], failedId, cb);
        if (!r) throw e;
        return r.valeur;
      }
    };
    copier(origStream, stream);
    stream.__v700 = true;
    window.callLLMStream = stream;
  }

  var origLLM = window.callLLM;
  if (typeof origLLM === 'function' && !origLLM.__v700) {
    var simple = async function (cfg, messages, opts) {
      try { return await origLLM.call(this, cfg, messages, opts); }
      catch (e) {
        if (!estBasculable(e)) throw e;
        marquer(cfg, e);
        var failedId = (typeof state !== 'undefined' && state.model) || (cfg && cfg.model) || '';
        var r = await tenter(origLLM, this, [cfg, messages, opts], failedId, null);
        if (!r) throw e;
        return r.valeur;
      }
    };
    copier(origLLM, simple);
    simple.__v700 = true;
    window.callLLM = simple;
  }

  /* Le fallback Historique (bouton / auto après message d'erreur) reste
     disponible : on l'active par défaut, mais la case existante permet
     toujours de tout désactiver. */
  try { if (localStorage.getItem(CLE_DESC) === null) localStorage.setItem(CLE_DESC, '1'); } catch (e) {}

  window.__v700Bascule = {
    version: 700,
    codes: CODES,
    actif: actif,
    estBasculable: estBasculable,
    choisir: choisir,
    libelle: libelle,
    selectionnables: selectionnables,
    poser: poser,
    anti: lireAnti
  };
})();
</script>
