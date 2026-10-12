/* v571bis — correctif suppression groupée (banc v537) : ne supprimer QUE les
   cases réellement cochées à l'écran + newChat après la boucle. CRLF sûr. */
const fs = require('fs');
const F = 'C:/tmp/theoverify/THEOLOGICUS.html';
let src = fs.readFileSync(F, 'utf8');
if ((src.match(/(?<!\r)\n/g) || []).length > 0) { console.error('FATAL : LF seuls avant édition'); process.exit(1); }

function remplacer(titre, oldLines, newLines) {
  const oldStr = oldLines.join('\r\n');
  const newStr = newLines.join('\r\n');
  const n = src.split(oldStr).length - 1;
  if (n !== 1) { console.error('FATAL [' + titre + '] : ancrage trouvé ' + n + ' fois'); process.exit(1); }
  src = src.replace(oldStr, () => newStr);
  console.log('OK  ' + titre);
}

/* ═══ 1. intersection SEL ∩ cases cochées VISIBLES ═══ */
remplacer('supprimerSelection — intersection avec les cases cochées (F1)',
[
'  async function supprimerSelection() {',
'    if (EN_COURS) return 0;',
'    var a = ids();',
"    if (!a.length) { toast('Aucune conversation sélectionnée', 'info'); return 0; }",
'    var n = a.length;'
],
[
'  async function supprimerSelection() {',
'    if (EN_COURS) return 0;',
'    var a = ids();',
'    /* v571bis — ne supprimer QUE ce qui est RÉELLEMENT coché à l\'écran :',
'       la carte SEL peut contenir un identifiant dont la case a été décochée',
'       entre-temps dans une autre liste (rendu concurrent) — on a vu le banc',
'       supprimer AINSI la conversation COURANTE, jamais cochée. On intersecte',
'       donc la sélection avec les cases cochées des listes visibles. */',
'    var coches = {};',
'    var lsV = liste();',
'    for (var iv = 0; iv < lsV.length; iv++) {',
'      if (!estVisible(lsV[iv])) continue;',
'      var cks = lsV[iv].querySelectorAll(".archive-item > .arch-sel-ck");',
'      for (var jv = 0; jv < cks.length; jv++) {',
'        if (cks[jv].checked) coches[cks[jv].getAttribute("data-id")] = true;',
'      }',
'    }',
'    a = a.filter(function (x) { return coches[x]; });',
'    if (!a.length) { vide(); majBarres(); toast(\'Aucune conversation sélectionnée\', \'info\'); return 0; }',
'    var n = a.length;'
]);

/* ═══ 2. newChat APRÈS la boucle (plus de re-rendu en pleine suppression) ═══ */
remplacer('supprimerSelection — compteur courante (F2)',
[
'    var ok = 0, rates = 0;'
],
[
'    var ok = 0, rates = 0, courante = false;'
]);

remplacer('supprimerSelection — newChat après la boucle (F3)',
[
'        /* la conversation supprimée ne doit pas rester ouverte à l\'écran */',
'        try {',
"          if (typeof state !== 'undefined' && state && state.chatId === id && typeof window.newChat === 'function') {",
'            await window.newChat();',
'          }',
'        } catch (e) {}',
'      }',
'      vide();'
],
[
'        /* v571bis — la conversation COURANTE parmi les supprimées : on la',
'           rouvre APRÈS la boucle. newChat supprime/crée et re-rend : le faire',
'           AU MILIEU de la boucle mélangeait rendus et sélection. */',
'        if (typeof state !== "undefined" && state && state.chatId === id) courante = true;',
'      }',
'      if (courante && typeof window.newChat === "function") {',
'        try { await window.newChat(); } catch (e) {}',
'      }',
'      vide();'
]);

/* ═══ contrôles ═══ */
if ((src.match(/(?<!\r)\n/g) || []).length > 0) { console.error('FATAL : LF seuls introduits'); process.exit(1); }
for (const m of ['coches', 'courante && typeof window.newChat']) {
  if (src.indexOf(m) === -1) { console.error('FATAL : marqueur absent : ' + m); process.exit(1); }
}
const a = src.indexOf('<script id="v537-archives-selection-script">');
if (a === -1) { console.error('module v537 introuvable'); process.exit(1); }
const b = src.indexOf('</script>', a);
try { new Function(src.slice(a + '<script id="v537-archives-selection-script">'.length, b)); console.log('SYNTAXE OK v537-selection'); }
catch (e) { console.error('FATAL : syntaxe v537 : ' + e.message); process.exit(1); }
fs.writeFileSync(F, src, 'utf8');
console.log('ÉCRIT. Taille : ' + src.length);
