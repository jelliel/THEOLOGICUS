<script id="v705-apologetics">
/* ═══ v705 : APOLOGETICS.WIKI DANS THEOLOGICUS ═══
   Client MCP HTTP pour https://apologetics.wiki/mcp.
   - LECTURE : enrichit le prompt avec des articles sourcés (aucune clé).
   - ÉCRITURE : suggest_topic / propose_new_article depuis une modale, avec
     la clé aw_ stockée dans l'app (IDB + filet localStorage), jamais affichée.
   Dégradation silencieuse : aucun bloc si le serveur ne répond pas.
   Aucun contrôle ajouté à .header-controls (v597/v598). */
(function () {
  'use strict';
  var URL_MCP = 'https://apologetics.wiki/mcp';
  var CLE_KEY = 'theologicus_apologetics_key';
  var DELAI = 8000;
  var BLOC_MAX = 4500;
  var _id = 0;

  function keyLire() {
    try {
      var k = localStorage.getItem(CLE_KEY);
      if (k) return k;
    } catch (e) {}
    return '';
  }
  function keyEcrire(k) {
    k = String(k || '').trim();
    try {
      if (k) localStorage.setItem(CLE_KEY, k);
      else localStorage.removeItem(CLE_KEY);
    } catch (e) {}
    try {
      if (typeof db !== 'undefined' && db && db.put) {
        if (k) db.put('settings', { id: 'apologetics_key', value: k }).catch(function () {});
        else db.put('settings', { id: 'apologetics_key', value: '' }).catch(function () {});
      }
    } catch (e) {}
  }
  function keyHydrater() {
    try {
      if (localStorage.getItem(CLE_KEY)) return;
      if (typeof db === 'undefined' || !db || !db.get) return;
      db.get('settings', 'apologetics_key').then(function (r) {
        if (r && r.value) localStorage.setItem(CLE_KEY, String(r.value));
      }).catch(function () {});
    } catch (e) {}
  }
  setTimeout(keyHydrater, 900);

  function call(tool, args, auth) {
    return new Promise(function (res, rej) {
      var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      var t = setTimeout(function () { if (ctrl) { try { ctrl.abort(); } catch (e) {} } rej(new Error('delai depasse')); }, DELAI);
      var corps = JSON.stringify({ jsonrpc: '2.0', id: ++_id, method: 'tools/call', params: { name: tool, arguments: args || {} } });
      var headers = { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' };
      if (auth) { var k = keyLire(); if (k) headers.Authorization = /^Bearer\s/i.test(k) ? k : ('Bearer ' + k); }
      fetch(URL_MCP, { method: 'POST', headers: headers, body: corps, signal: ctrl ? ctrl.signal : undefined })
        .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
        .then(function (txt) {
          clearTimeout(t);
          var d; try { d = JSON.parse(txt); } catch (e) { throw new Error('reponse non JSON'); }
          if (d && d.error) throw new Error(d.error.message || 'erreur MCP');
          var out = '';
          ((d.result && d.result.content) || []).forEach(function (c) { if (c && c.type === 'text' && c.text) out += c.text; });
          res(out || (d.result ? JSON.stringify(d.result.structuredContent || {}) : ''));
        })
        .catch(function (e) { clearTimeout(t); rej(e); });
    });
  }

  var MOTS = /trinit|jésus|jesus|christ|bible|évangile|evangile|apolog|divorce|islam|coran|foi|doctrine|hérésie|heresie|canon|messie|messiah/i;
  function tronque(s, n) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1).replace(/[\s,;:.]*$/, '') + '…' : s;
  }
  async function contexte(texte) {
    try {
      var t = String(texte || '').slice(0, 500);
      if (!MOTS.test(t)) return null;
      var rep = await call('find_articles_for_claim', { text: t, limit: 3 }, false);
      if (!rep || !String(rep).trim()) return null;
      var bloc = '════════ APOLOGETICS.WIKI — SOURCES VÉRIFIÉES ════════\n'
        + 'Source : https://apologetics.wiki/ (articles publiés, relus par des éditeurs).\n'
        + 'RÈGLES : n\'utiliser QUE les éléments ci-dessous ; recopier les URL ; dire si la couverture est partielle.\n\n'
        + tronque(rep, BLOC_MAX)
        + '\n════════ FIN APOLOGETICS.WIKI ════════';
      return { bloc: bloc };
    } catch (e) { return null; }
  }

  /* ── injection dans le prompt ── */
  var origPrompt = window.buildSystemPrompt;
  if (typeof origPrompt === 'function' && !origPrompt.__v705) {
    var np = function () {
      var p = origPrompt.apply(this, arguments);
      var b = window.__v705Bloc || '';
      return b ? (String(p || '') + '\n\n' + b) : p;
    };
    np.__v705 = true; window.buildSystemPrompt = np;
  }
  var origSend = window.sendMessage;
  if (typeof origSend === 'function' && !origSend.__v705) {
    var ns = async function (overrideText) {
      window.__v705Bloc = '';
      var texte = overrideText || (document.getElementById('user-input') || {}).value || '';
      try { var r = await contexte(texte); if (r) window.__v705Bloc = r.bloc; } catch (e) {}
      try { return await origSend.apply(this, arguments); }
      finally { window.__v705Bloc = ''; }
    };
    ns.__v705 = true; window.sendMessage = ns;
  }

  /* ── interface : bouton ARCHIVES + modale ── */
  function css() {
    return '.v705-modal{position:fixed;inset:0;z-index:99990;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.62)}'
      + '.v705-modal.on{display:flex}.v705-box{width:min(760px,94vw);max-height:88vh;overflow:auto;background:var(--bg,#111);'
      + 'color:var(--text,#ddd);border:1px solid var(--border,#445);border-radius:12px;padding:18px}'
      + '.v705-box h3{margin:0 0 12px;font-size:16px}.v705-box label{display:block;font-size:12px;margin:10px 0 4px;color:var(--text-dim,#9ab)}'
      + '.v705-box input,.v705-box textarea,.v705-box select{width:100%;box-sizing:border-box;background:var(--bg-dark,#0b0b0b);'
      + 'color:var(--text,#ddd);border:1px solid var(--border,#445);border-radius:6px;padding:8px;font:13px/1.5 inherit}'
      + '.v705-box textarea{min-height:90px;resize:vertical}.v705-box .v705-btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}'
      + '.v705-box button{cursor:pointer;padding:6px 10px;border-radius:6px;border:1px solid var(--border,#445);'
      + 'background:var(--bg-dark,#0b0b0b);color:var(--text,#ddd);font-size:12px}'
      + '.v705-box pre{white-space:pre-wrap;word-break:break-word;background:var(--bg-dark,#0b0b0b);border:1px solid var(--border,#445);'
      + 'border-radius:6px;padding:10px;max-height:220px;overflow:auto;font-size:12px}';
  }
  function construireUI() {
    var hote = document.getElementById('archives-panel');
    if (!hote || document.getElementById('v705-btn')) return;
    try {
      var st = document.createElement('style'); st.id = 'v705-css';
      st.appendChild(document.createTextNode(css())); document.head.appendChild(st);
    } catch (e) {}
    var btn = document.createElement('button');
    btn.id = 'v705-btn'; btn.className = 'btn-ghost';
    btn.textContent = '📖 APOLOGÉTIQUE';
    btn.title = 'Apologetics Wiki — sources vérifiées et suggestions';
    btn.addEventListener('click', ouvrir);
    hote.appendChild(btn);

    var md = document.createElement('div');
    md.id = 'v705-modal'; md.className = 'v705-modal';
    md.innerHTML = '<div class="v705-box"><h3>📖 Apologetics Wiki</h3>'
      + '<button type="button" id="v705-close" style="float:right">✕</button>'
      + '<label for="v705-key">Clé API (aw_…) — stockée dans l’app, jamais affichée</label>'
      + '<input id="v705-key" type="password" autocomplete="off" placeholder="Laisser vide pour conserver la clé actuelle">'
      + '<div class="v705-btns"><button type="button" id="v705-save">ENREGISTRER LA CLÉ</button>'
      + '<button type="button" id="v705-clear">EFFACER LA CLÉ</button>'
      + '<span id="v705-etat" style="font-size:11px;font-style:italic;opacity:.75"></span></div>'
      + '<label for="v705-title">Sujet / titre</label><input id="v705-title" placeholder="Ex : Pourquoi les Témoins de Jéhovais ne croient pas à la Trinité ?">'
      + '<div class="v705-btns"><button type="button" id="v705-check">VÉRIFIER COUVERTURE</button>'
      + '<button type="button" id="v705-topic">SUGGÉRER LE SUJET</button></div>'
      + '<label for="v705-summary">Résumé</label><input id="v705-summary" placeholder="Une phrase (3–140 caractères pour un article)">'
      + '<label for="v705-text">Explication / brouillon Markdown</label><textarea id="v705-text"></textarea>'
      + '<label for="v705-shelf">Rayon (pour une proposition d’article)</label><input id="v705-shelf" value="christianity">'
      + '<div class="v705-btns"><button type="button" id="v705-propose">PROPOSER UN ARTICLE</button>'
      + '<button type="button" id="v705-guide">GUIDELINES</button></div>'
      + '<pre id="v705-result">—</pre></div>';
    document.body.appendChild(md);
    function etat() {
      var e = document.getElementById('v705-etat');
      e.textContent = keyLire() ? 'clé configurée (' + keyLire().length + ' caractères)' : 'aucune clé — lecture seule';
    }
    etat();
    document.getElementById('v705-close').onclick = function () { md.classList.remove('on'); };
    md.onclick = function (e) { if (e.target === md) md.classList.remove('on'); };
    function resultat(txt) { document.getElementById('v705-result').textContent = String(txt || '—').slice(0, 8000); }
    function v(id) { return (document.getElementById(id) || {}).value || ''; }
    function sources() { return []; }
    document.getElementById('v705-save').onclick = function () {
      var k = v('v705-key').trim();
      if (!k) { if (typeof toast === 'function') toast('Colle une clé aw_…', 'error'); return; }
      keyEcrire(k); document.getElementById('v705-key').value = ''; etat();
      if (typeof toast === 'function') toast('Clé Apologetics Wiki enregistrée', 'success');
    };
    document.getElementById('v705-clear').onclick = function () { keyEcrire(''); etat(); resultat('clé effacée'); };
    async function action(tool, args, auth) {
      resultat('⏳ ' + tool + '…');
      try { resultat(await call(tool, args, auth)); }
      catch (e) { resultat('ERREUR : ' + ((e && e.message) || e)); }
    }
    document.getElementById('v705-check').onclick = function () { action('check_existing_coverage', { title: v('v705-title') }, false); };
    document.getElementById('v705-guide').onclick = function () { action('get_submission_guidelines', { topic: v('v705-title') || undefined }, false); };
    document.getElementById('v705-topic').onclick = function () {
      if (!keyLire()) { resultat('Configure d’abord la clé API.'); return; }
      action('suggest_topic', { title: v('v705-title'), summary: v('v705-summary'), explainer: v('v705-text'), sources: sources() }, true);
    };
    document.getElementById('v705-propose').onclick = function () {
      if (!keyLire()) { resultat('Configure d’abord la clé API.'); return; }
      action('propose_new_article', { title: v('v705-title'), shelf: v('v705-shelf'), summary: v('v705-summary'), markdown: v('v705-text'), sources: sources() }, true);
    };
  }
  function ouvrir() { construireUI(); var m = document.getElementById('v705-modal'); if (m) m.classList.add('on'); }
  function demarrer() { construireUI(); setInterval(construireUI, 1500); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
  setTimeout(demarrer, 800);

  window.__v705Apologetics = {
    version: 705,
    url: URL_MCP,
    call: call,
    contexte: contexte,
    keyLire: keyLire,
    keyEcrire: keyEcrire,
    ouvrir: ouvrir
  };
})();
</script>
