<script id="v707-tableaux">
/* ═══ v707 : TABLEAUX AU LIEU DE PAVÉS MONOSPACE ═══
   Le modèle sort parfois un tableau comparatif dans un bloc ```text :
   le rendu markdown le garde alors en <pre><code> (texte ambre), alors
   que l'utilisateur attendait un tableau. Deux rattrapages :
   1. vrai tableau markdown (| + ---) enfermé dans un bloc de code ;
   2. structure en sections/puces (« Passage: », « Lecture A », …) →
      tableau à deux colonnes Élément / Analyse.
   Le code réel (JS, JSON, SQL, shell…) n'est JAMAIS converti. */
(function () {
  'use strict';
  var LANGS = /^(?:text|txt|plaintext|plain|md|markdown|output|ascii)$/i;
  var CODE = /(?:function\s*\(|=>|\bconst\s|\blet\s|\bvar\s|\bclass\s|\bdef\s|\bimport\s|<\?php|#!\/|SELECT\s+.*\bFROM\b|\{\s*$|\bpublic\s+\w+\s+\w+\s*\()/i;
  var rng = 0;
  function ech(x) {
    return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function lignes(code) {
    var l = String(code || '').replace(/\r/g, '').split('\n');
    while (l.length && !l[0].trim()) l.shift();
    while (l.length && !l[l.length - 1].trim()) l.pop();
    if (l.length && LANGS.test(l[0].trim())) l.shift();
    return l;
  }
  function tableHtml(header, rows) {
    if (!rows.length) return '';
    return '<table class="md-table v707-table"><thead><tr>'
      + header.map(function (h) { return '<th>' + ech(h) + '</th>'; }).join('')
      + '</tr></thead><tbody>'
      + rows.map(function (r) {
          return '<tr>' + r.map(function (c) { return '<td>' + ech(c).replace(/\n/g, '<br>') + '</td>'; }).join('') + '</tr>';
        }).join('')
      + '</tbody></table>';
  }
  function parseLigne(l) {
    return String(l).replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(function (c) { return c.trim(); });
  }
  /* Cas 1 : un tableau markdown entièrement encapsulé dans ``` */
  function tableauMarkdown(code) {
    var l = lignes(code);
    if (l.length < 3) return '';
    var sep = -1;
    for (var i = 0; i < l.length; i++) {
      if (/^\s*\|?[\s:|-]+\|?\s*$/.test(l[i]) && l[i].indexOf('-') !== -1 && l[i].indexOf('|') !== -1) { sep = i; break; }
    }
    if (sep < 1) return '';
    var header = parseLigne(l[sep - 1]);
    if (header.length < 2) return '';
    var rows = [];
    for (var j = sep + 1; j < l.length; j++) {
      if (!l[j].trim()) continue;
      if (l[j].indexOf('|') === -1) return '';
      rows.push(parseLigne(l[j]));
    }
    if (!rows.length) return '';
    rng++;
    return tableHtml(header, rows);
  }
  /* Cas 2 :Sections « Étiquette: » suivies de puces ou de lignes. */
  function tableauStructure(code) {
    var l = lignes(code);
    if (l.length < 5) return '';
    var paragraphes = [], cur = [];
    for (var i = 0; i < l.length; i++) {
      if (!l[i].trim()) {
        if (cur.length) { paragraphes.push(cur); cur = []; }
      } else cur.push(l[i].replace(/\s+$/, ''));
    }
    if (cur.length) paragraphes.push(cur);
    if (paragraphes.length < 3 || paragraphes.length > 30) return '';

    var codeHits = 0, puces = 0, rows = [];
    for (var p = 0; p < paragraphes.length; p++) {
      var bloc = paragraphes[p];
      var titre = bloc[0].trim();
      if (!titre || titre.length > 90) return '';
      if (/^(?:[-*|#>\[{(]|\d+[.)]\s)/.test(titre)) return '';
      if (CODE.test(titre)) codeHits++;
      var contenu = [];
      for (var k = 1; k < bloc.length; k++) {
        var ln = bloc[k].trim();
        if (!ln) continue;
        if (CODE.test(ln)) codeHits++;
        if (/^(?:[-*•]\s+|\d+[.)]\s+)/.test(ln)) puces++;
        contenu.push(ln.replace(/^(?:[-*•]\s+)/, '• '));
      }
      if (!contenu.length && !/:\s*$/.test(titre)) return '';
      rows.push([titre.replace(/:\s*$/, ''), contenu.join('\n')]);
    }
    if (codeHits >= 2 || puces < 3 || rows.length < 3) return '';
    rng++;
    return tableHtml(['Élément', 'Analyse'], rows);
  }
  function convertir(code) {
    try {
      var t = tableauMarkdown(code);
      if (t) return t;
      return tableauStructure(code);
    } catch (e) { return ''; }
  }

  function css() {
    return '.message-content table.v707-table td:first-child{width:30%;font-weight:700}'
      + '.message-content table.v707-table td{white-space:normal;overflow-wrap:anywhere}'
      + '.message-content table.v707-table br{display:block;content:""}';
  }
  try {
    var st = document.createElement('style'); st.id = 'v707-css';
    st.appendChild(document.createTextNode(css())); document.head.appendChild(st);
  } catch (e) {}

  /* Règle de sortie : on demande au modèle un vrai tableau markdown. */
  var origPrompt = window.buildSystemPrompt;
  if (typeof origPrompt === 'function' && !origPrompt.__v707) {
    var np = function () {
      var p = origPrompt.apply(this, arguments);
      return String(p || '') + '\n\n═══ TABLEAUX ═══\n'
        + '- Pour un tableau comparatif ou une correspondance entre éléments, écris un VRAI tableau Markdown avec des pipes | et une ligne de séparateur ---.\n'
        + '- N’enferme JAMAIS un tableau dans un bloc de code (```) : il s’afficherait en texte monospace.\n'
        + '- Utilise au moins deux colonnes intitulées « Élément » et « Analyse ».\n'
        + '═══ FIN TABLEAUX ═══';
    };
    np.__v707 = true; window.buildSystemPrompt = np;
  }

  window.__v707Tableaux = {
    version: 707,
    convertir: convertir,
    markdown: tableauMarkdown,
    structure: tableauStructure,
    stats: function () { return rng; }
  };
})();
</script>
