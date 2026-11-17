<script id="v701-reprise">
/* ═══ v701 : REPRISE SANS INTERRUPTION DE LA MÊME QUESTION ═══
   v700 bascule déjà dès l'erreur HTTP. Ce module couvre les cas où
   v700 ne peut pas (anti-boucle, épuisement des modèles, ou coupure
   APRÈS qu'un début de réponse a été affiché) :
     - retire la bulle de flux interrompue ;
     - ouvre une bulle d'information visible (tooltip) ;
     - relance LE MÊME tableau de messages sur un autre modèle ;
     - recrée un renderer de streaming propre pour que la réponse
       reparaisse depuis le début, sans texte fantôme.
   Au plus 3 modèles essayés par question. Aucun contrôle ajouté à
   .header-controls (v597/v598) : la bulle est un enfant de body. */
(function () {
  'use strict';
  var MAX = 3;
  var CODES = [0, 401, 402, 403, 404, 408, 429, 500, 502, 503, 504];
  var ANT = 'theologicus_v701_reprise';

  function okErreur(e) { return !!(e && CODES.indexOf(Number(e.status)) !== -1 && e.name !== 'AbortError'); }
  function prov(id) {
    try { if (typeof _providerModelId === 'function') { var p = _providerModelId(id); if (p && p.prov) return p.prov.id; } } catch (e) {}
    return (typeof id === 'string' && id.indexOf(':') > 0) ? id.slice(0, id.indexOf(':')) : 'mistral';
  }
  function anti() { try { return JSON.parse(localStorage.getItem(ANT) || 'null') || {}; } catch (e) { return {}; } }
  function poserAnti(failed, vers) {
    try { localStorage.setItem(ANT, JSON.stringify({ failed: failed, vers: vers, ts: Date.now() })); } catch (e) {}
  }
  function bulle(txt) {
    try {
      var b = document.createElement('div');
      b.className = 'v701-bulle';
      b.setAttribute('role', 'status');
      b.textContent = txt;
      document.body.appendChild(b);
      setTimeout(function () { b.classList.add('sortir'); }, 6500);
      setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 7200);
    } catch (e) {}
  }
  function css() {
    return '.v701-bulle{position:fixed;top:72px;right:18px;z-index:99998;max-width:min(420px,92vw);'
      + 'padding:10px 14px;border-radius:9px;border:1px solid rgba(169,99,31,.5);border-left:4px solid #a9631f;'
      + 'background:var(--bg-panel,#fffdf8);color:var(--text,#2b2118);box-shadow:0 10px 30px rgba(0,0,0,.24);'
      + 'font:13px/1.45 Georgia,serif;opacity:1;transition:opacity .6s ease,transform .6s ease}'
      + '.v701-bulle.sortir{opacity:0;transform:translateY(-8px);pointer-events:none}';
  }
  try {
    var s = document.createElement('style');
    s.id = 'v701-reprise-css';
    s.appendChild(document.createTextNode(css()));
    document.head.appendChild(s);
  } catch (e) {}

  function candidats(failedId, deja, est402) {
    var V = window.__v700Bascule;
    var tous = V && typeof V.selectionnables === 'function' ? V.selectionnables() : [];
    var pFailed = prov(failedId), out = [];
    for (var i = 0; i < tous.length; i++) {
      var id = tous[i] && tous[i].value;
      if (!id || id === failedId || deja.indexOf(id) !== -1) continue;
      var local = /^ollama:/.test(id);
      if (!local) { try { if (typeof _clePourModele !== 'function' || !_clePourModele(id)) continue; } catch (e) { continue; } }
      /* 402 = crédit du COMPTE : ne tenter qu'un AUTRE fournisseur. */
      if (est402 && prov(id) === pFailed) continue;
      /* Pas d'anti-boucle ICI : la boucle est déjà bornée par MAX et par
         . Bloquer le modèle choisi précédemment empêcherait la
         reprise quand CE modèle tombe en panne à son tour. */
      out.push({ id: id, label: tous[i].label || id, local: local });
    }
    out.sort(function (a, b) {
      var sa = (a.local ? -80 : 0) + (prov(a.id) !== pFailed ? 40 : 0) + (/small|flash|nemo|mini|lite/i.test(a.id) ? 12 : 0);
      var sb = (b.local ? -80 : 0) + (prov(b.id) !== pFailed ? 40 : 0) + (/small|flash|nemo|mini|lite/i.test(b.id) ? 12 : 0);
      return sb - sa || String(a.id).localeCompare(String(b.id));
    });
    return out;
  }
  function configDe(id) {
    try { var c = resolveModelConfig(id); return (c && c.endpoint) ? c : null; } catch (e) { return null; }
  }
  function poser(id) {
    try {
      state.model = id;
      var a = document.getElementById('model-select'); if (a) a.value = id;
      var b = document.getElementById('model-select-mob'); if (b) b.value = id;
      if (typeof db !== 'undefined' && db && db.put) db.put('settings', { id: 'model', value: id }).catch(function () {});
      if (typeof saveAppConfig === 'function') saveAppConfig();
      var sys = (state.messages || []).find(function (m) { return m.role === 'system'; });
      if (sys && typeof buildSystemPrompt === 'function') sys.content = buildSystemPrompt();
    } catch (e) {}
  }
  function retirerBulleFlux(div) {
    try { if (div && div.parentNode) div.parentNode.removeChild(div); } catch (e) {}
  }
  function nouvellesBulle() {
    try {
      if (typeof _createStreamDiv !== 'function' || typeof _createStreamRenderer !== 'function') return null;
      var o = _createStreamDiv();
      return { div: o.div, rendu: _createStreamRenderer(o.content, o.div, o.slot) };
    } catch (e) { return null; }
  }

  async function reprendre(fn, ctx, args, failedId, err, divStream, streaming) {
    var origine = failedId;
    var deja = [failedId];
    var est402 = Number(err && err.status) === 402;
    var vues = null;
    for (var n = 0; n < MAX; n++) {
      var liste = candidats(failedId, deja, est402);
      if (!liste.length) break;
      var choix = liste[0], cfg = configDe(choix.id);
      if (!cfg) { deja.push(choix.id); continue; }
      if (streaming && !vues) { vues = nouvellesBulle(); if (vues) retirerBulleFlux(divStream); }
      poser(choix.id);
      bulle('⚠️ ' + (err && err.status ? 'HTTP ' + err.status + ' — ' : '') + 'modèle indisponible. Bascule vers ' +
            choix.label + ', reprise de la même question… (' + (n + 1) + '/' + MAX + ')');
      var nouveaux = [cfg].concat(Array.prototype.slice.call(args, 1));
      if (streaming && vues) {
        var rendu = vues.rendu;
        nouveaux[3] = function (chunk, full) { try { rendu.push(chunk, full); } catch (e) {} };
      }
      try {
        var r = await fn.apply(ctx, nouveaux);
        if (streaming && vues) { try { vues.rendu.finish(r); } catch (e) {} }
        poserAnti(origine, choix.id);
        return { valeur: r, id: choix.id, tentative: n + 1 };
      } catch (e2) {
        deja.push(choix.id);
        failedId = choix.id;
        est402 = Number(e2 && e2.status) === 402;
        if (streaming && vues) { try { vues.rendu.finish(''); } catch (e3) {} retirerBulleFlux(vues.div); vues = nouvellesBulle(); }
        err = e2;
      }
    }
    poser(origine);
    return null;
  }

  var origStream = window.callLLMStream;
  if (typeof origStream === 'function' && !origStream.__v701) {
    var stream = async function (cfg, messages, opts, onChunk) {
      /* v566 garde la main sur le chemin hors-ligne Adeodat. */
      var sysTxt = (messages && messages[0] && messages[0].content) ? String(messages[0].content) : '';
      var horsLigne = sysTxt.indexOf('Adeodat') !== -1;
      var div = null;
      try { var ms = document.querySelectorAll('#chat-container .message.assistant'); div = ms[ms.length - 1] || null; } catch (e) {}
      try { return await origStream.call(this, cfg, messages, opts, onChunk); }
      catch (e) {
        if (horsLigne || !okErreur(e)) throw e;
        var failedId = (typeof state !== 'undefined' && state.model) || (cfg && cfg.model) || '';
        var r = await reprendre(origStream, this, [cfg, messages, opts, onChunk], failedId, e, div, true);
        if (!r) throw e;
        return r.valeur;
      }
    };
    for (var k in origStream) { try { stream[k] = origStream[k]; } catch (e) {} }
    stream.__v701 = true;
    window.callLLMStream = stream;
  }

  var origLLM = window.callLLM;
  if (typeof origLLM === 'function' && !origLLM.__v701) {
    var simple = async function (cfg, messages, opts) {
      var sysTxt = (messages && messages[0] && messages[0].content) ? String(messages[0].content) : '';
      var horsLigne = sysTxt.indexOf('Adeodat') !== -1;
      try { return await origLLM.call(this, cfg, messages, opts); }
      catch (e) {
        if (horsLigne || !okErreur(e)) throw e;
        var failedId = (typeof state !== 'undefined' && state.model) || (cfg && cfg.model) || '';
        var r = await reprendre(origLLM, this, [cfg, messages, opts], failedId, e, null, false);
        if (!r) throw e;
        return r.valeur;
      }
    };
    for (var j in origLLM) { try { simple[j] = origLLM[j]; } catch (e) {} }
    simple.__v701 = true;
    window.callLLM = simple;
  }

  window.__v701Reprise = {
    version: 701,
    codes: CODES,
    reprendre: reprendre,
    candidats: candidats,
    bulle: bulle,
    anti: anti
  };
})();
</script>
