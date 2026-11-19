<script id="v706-refs">
/* ═══ v706 : RÉFÉRENCES BIBLIQUES EXACTES ═══
   Une question sur « 1 Jean 5:7-8 » ne doit JAMAIS devenir une réponse
   sur « Jean 5:7-8 » (évangile) : le préfixe d'épître change de livre.

   Trois garde-fous, sans dépendre du bon vouloir du modèle :
   1. le texte de l'utilisateur est analysé AVANT l'envoi ;
   2. la(les) référence(s) exacte(s) est injectée(s) dans le prompt ;
   3. la réponse est corrigée de façon déterministe, y compris pendant
      le streaming, pour les références non numérotées du même chapitre.

   Aucun contrôle ajouté à .header-controls (v597/v598). */
(function () {
  'use strict';

  /* Livres pour lesquels le préfixe 1/2/3 change l'identité du livre. */
  var NOMS = 'Jean|Pierre|Corinthiens|Thessaloniciens|Timothée|Samuel|Rois|Chroniques|Maccabées';
  var ABREVS = {
    jn: 'Jean', p: 'Pierre', co: 'Corinthiens', th: 'Thessaloniciens',
    tm: 'Timothée', s: 'Samuel', r: 'Rois', ch: 'Chroniques', m: 'Maccabées'
  };
  var ROMAINS = { I: 1, II: 2, III: 3, IV: 4 };

  function canonLivre(x) {
    var k = String(x || '').replace(/\.$/, '').toLowerCase();
    if (ABREVS[k]) return ABREVS[k];
    var ns = NOMS.split('|');
    for (var i = 0; i < ns.length; i++) if (ns[i].toLowerCase() === k) return ns[i];
    return null;
  }
  function canonVers(v) {
    return String(v || '').replace(/\s*[-–—]\s*/g, '-').replace(/\s+/g, '');
  }
  function normaliser(ch) {
    return String(ch || '').replace(/^0+(\d)/, '$1');
  }
  function cle(r) {
    return (r.livre + '|' + r.chap + '|' + r.vers).toLowerCase();
  }

  /* « 1 Jean 5:7-8 », « 1Jn 5,7 », « I Jean 5.7 » — même référence. */
  function extraire(texte) {
    var s = String(texte || '').slice(0, 3000);
    var out = [], vu = {};
    function ajoute(prefixe, livreBrut, chap, vers, full) {
      var livre = canonLivre(livreBrut);
      if (!livre || !chap || !vers) return;
      var p = String(prefixe || '');
      if (ROMAINS[p.toUpperCase()]) p = String(ROMAINS[p.toUpperCase()]);
      if (!/^[123]$/.test(p)) return; /* 4 Maccabées : hors canon catholique courant */
      var ref = p + ' ' + livre + ' ' + normaliser(chap) + ':' + canonVers(vers);
      if (vu[ref.toLowerCase()]) return;
      vu[ref.toLowerCase()] = true;
      out.push({ ref: ref, livre: livre, prefixe: p, chap: normaliser(chap), vers: canonVers(vers), source: String(full || '') });
    }
    var re = new RegExp('\\b([123]|I{1,3}|IV)[\\s\\u00A0]*(' + NOMS
      + '|Jn|P|Co|Th|Tm|S|R|Ch|M)\\.?[\\s\\u00A0]+(\\d{1,3})\\s*[:.,]\\s*(\\d{1,3}(?:\\s*[-–]\\s*\\d{1,3})?)', 'gi');
    var m;
    while ((m = re.exec(s))) ajoute(m[1], m[2], m[3], m[4], m[0]);
    /* Forme « 1Jn 5:7-8 » (préfixe collé) — la regex ci-dessus l'a déjà
       couverte, mais on garde un filet pour « 1 Jn.5:7 ». */
    return out;
  }

  /* Corrige UNIQUEMENT les occurrences non numérotées dont le livre, le
     chapitre et le verset correspondent exactement à une référence de la
     question. « Jean 3:16 » n'est jamais touché. Une mention explicite de
     l'évangile (« évangile de Jean 5:7-8 ») est respectée. */
  function corriger(texte, refs) {
    if (!texte || !refs || !refs.length) return texte;
    var s = String(texte), map = {};
    refs.forEach(function (r) { map[cle(r)] = r; });
    var re = new RegExp('\\b(' + NOMS + '|Jn|P|Co|Th|Tm|S|R|Ch|M)\\.?[\\s\\u00A0]+(\\d{1,3})\\s*[:.,]\\s*(\\d{1,3}(?:\\s*[-–]\\s*\\d{1,3})?)', 'gi');
    var corrections = 0;
    s = s.replace(re, function (full, livreBrut, chap, vers, offset) {
      var livre = canonLivre(livreBrut);
      if (!livre) return full;
      var r = map[(livre + '|' + normaliser(chap) + '|' + canonVers(vers)).toLowerCase()];
      if (!r) return full;
      /* Déjà précédé d'un numéro (« 1 Jean 5:7-8 », « 1Jn 5:7 ») ? */
      var avant = s.slice(Math.max(0, offset - 24), offset);
      if (/[123]\s*$/.test(avant)) return full;
      /* L'évangile est cité volontairement : on ne réécrit pas. */
      if (/(?:évangile|evangile|selon)\s+(?:de\s+|selon\s+)?$/i.test(avant)) return full;
      corrections++;
      return r.ref;
    });
    if (corrections) window.__v706Corrections = (window.__v706Corrections || 0) + corrections;
    return s;
  }

  function bloc(refs) {
    if (!refs || !refs.length) return '';
    var listes = refs.map(function (r) { return '- ' + r.ref; }).join('\n');
    return '\n═══ RÉFÉRENCE(S) EXACTE(S) DE LA QUESTION ═══\n'
      + 'La question porte sur : ' + refs.map(function (r) { return r.ref; }).join(' ; ') + '.\n'
      + listes + '\n'
      + 'RÈGLES ABSOLUES :\n'
      + '- Recopie CHAQUE référence EXACTEMENT, y compris son numéro d’épître (1 Jean, 2 Pierre, 1 Corinthiens…).\n'
      + '- Ne confonds PAS Jean (évangile) avec 1 Jean, 2 Jean ou 3 Jean (épîtres) : ce sont des livres différents.\n'
      + '- N’écris jamais « Jean 5:7-8 » pour désigner « 1 Jean 5:7-8 ».\n'
      + '- Si tu cite un autre passage, donne son livre et son numéro exacts.\n'
      + '═══ FIN RÉFÉRENCES ═══';
  }

  /* ── prompt : le bloc vient AFTER les consignes générales, donc il les
        surcharge explicitement (règle « Jn → Jean » incluse). ── */
  var origPrompt = window.buildSystemPrompt;
  if (typeof origPrompt === 'function' && !origPrompt.__v706) {
    var np = function () {
      var p = origPrompt.apply(this, arguments);
      var b = bloc(window.__v706RefsAmont || []);
      return b ? (String(p || '') + '\n' + b) : p;
    };
    np.__v706 = true; window.buildSystemPrompt = np;
  }

  /* ── envoi : on capture la référence AVANT que le prompt ne soit construit.
        On ne l'efface pas en fin d'envoi : la commande SUITE doit rester
        ancrée sur la même référence. ── */
  var origSend = window.sendMessage;
  if (typeof origSend === 'function' && !origSend.__v706) {
    var ns = function () {
      var t = arguments[0] || (document.getElementById('user-input') || {}).value || '';
      window.__v706RefsAmont = extraire(t);
      return origSend.apply(this, arguments);
    };
    ns.__v706 = true; window.sendMessage = ns;
  }

  /* ── garde-fou final : même si la chaîne des wrappers de callLLMStream est
        réordonnée par un module plus tardif, la réponse ENREGISTRÉE est
        corrigée ici, puis le rendu est refait depuis state.messages. ── */
  var origEnvoi = window._sendMessageOriginal;
  if (typeof origEnvoi === 'function' && !origEnvoi.__v706) {
    var nEnvoi = async function () {
      var t = arguments[0] || (document.getElementById('user-input') || {}).value || '';
      window.__v706RefsAmont = extraire(t);
      var r = await origEnvoi.apply(this, arguments);
      try {
        var refs = window.__v706RefsAmont || [];
        if (refs.length && state && state.messages) {
          for (var i = state.messages.length - 1; i >= 0; i--) {
            var m = state.messages[i];
            if (!m || m.role !== 'assistant') continue;
            var cor = corriger(m.content, refs);
            if (cor !== m.content) {
              m.content = cor;
              if (typeof markChatDirty === 'function') markChatDirty();
              if (typeof renderMessages === 'function') renderMessages();
            }
            break;
          }
        }
      } catch (e) {}
      return r;
    };
    nEnvoi.__v706 = true; window._sendMessageOriginal = nEnvoi;
  }

  /* ── réponse : correction déterministe, y compris sur chaque chunk
        cumulé (sinon le mauvais verset s'affiche pendant le streaming). ── */
  var origStream = window.callLLMStream;
  if (typeof origStream === 'function' && !origStream.__v706) {
    var nstream = async function (cfg, messages, opts, onChunk) {
      var refs = window.__v706RefsAmont || [];
      var cb = onChunk;
      if (refs.length && typeof onChunk === 'function') {
        cb = function (chunk, full) {
          try { return onChunk(chunk, corriger(full, refs)); }
          catch (e) { return onChunk(chunk, full); }
        };
      }
      var rep = await origStream.call(this, cfg, messages, opts, cb);
      return corriger(rep, refs);
    };
    nstream.__v706 = true; window.callLLMStream = nstream;
  }

  window.__v706Refs = {
    version: 706,
    extraire: extraire,
    corriger: corriger,
    bloc: bloc,
    stats: function () { return window.__v706Corrections || 0; }
  };
})();
</script>
