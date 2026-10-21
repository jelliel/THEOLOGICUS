// v630 — Interface : statut RÉSOLU sur les commentaires d'encadrés.
// 5 remplacements LITTÉRAUX (CRLF préservé), modification IN-PLACE (aucun
// nouveau module <script> -> MODULES_ATTENDUS inchangé) + 1 <style> additif
// (les <style> ne sont pas comptés par la fumée).
//   R1 buildFigEl   : badge ✓ (classe note-resolu, title [Résolu]) au rendu.
//   R2 panneau      : bouton bascule « ✓ Résolu / ↺ Rouvrir » dans fn-row.
//   R3 majBadge     : gère les deux états du badge.
//   R4 handler      : bascule f.noteResolu + persistance + maj badge.
//   R5 export md    : « ✅ » après le titre si résolu.
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || path.resolve(__dirname, '../../THEOLOGICUS.html');
const ANCHOR = "</body>";

function J(lines){ return lines.join("\r\n"); }

const RULES = [
  { label: 'R1_buildFigEl_badge',
    oldS: J([
"    if (f.note) {",
"      const nb = document.createElement('span');",
"      nb.className = 'fb-note'; nb.textContent = '💬';",
"      nb.setAttribute('data-note-fig', f.id);",
"      nb.title = 'Commentaire : ' + String(f.note).slice(0, 300);",
"      el.appendChild(nb);",
"    }"]),
    newS: J([
"    if (f.note) {",
"      const nb = document.createElement('span');",
"      nb.className = 'fb-note' + (f.noteResolu ? ' note-resolu' : '');",
"      nb.textContent = f.noteResolu ? '✓' : '💬';",
"      nb.setAttribute('data-note-fig', f.id);",
"      nb.title = (f.noteResolu ? '[Résolu] ' : '') + 'Commentaire : ' + String(f.note).slice(0, 300);",
"      el.appendChild(nb);",
"    }"]) },

  { label: 'R2_panneau_bouton',
    oldS: J([
"        '<button data-ann>Annuler</button>' +",
"        (f.note ? '<button data-sup>🗑 Supprimer</button>' : '') +",
"        '<button class=\"fn-ok\" data-save>💾 Enregistrer</button>' +"]),
    newS: J([
"        '<button data-ann>Annuler</button>' +",
"        (f.note ? '<button data-sup>🗑 Supprimer</button>' : '') +",
"        (f.note ? '<button data-res>' + (f.noteResolu ? '↺ Rouvrir' : '✓ Résolu') + '</button>' : '') +",
"        '<button class=\"fn-ok\" data-save>💾 Enregistrer</button>' +"]) },

  { label: 'R3_majBadge',
    oldS: J([
"    function majBadge(){",
"      if (!fb) return;",
"      let b = fb.querySelector('.fb-note');",
"      if (f.note) {",
"        if (!b) { b = document.createElement('span'); b.className = 'fb-note'; b.textContent = '💬'; fb.appendChild(b); }",
"        b.setAttribute('data-note-fig', f.id);",
"        b.title = 'Commentaire : ' + String(f.note).slice(0, 300);",
"      } else if (b) { b.remove(); }",
"    }"]),
    newS: J([
"    function majBadge(){",
"      if (!fb) return;",
"      let b = fb.querySelector('.fb-note');",
"      if (f.note) {",
"        if (!b) { b = document.createElement('span'); fb.appendChild(b); }",
"        b.className = 'fb-note' + (f.noteResolu ? ' note-resolu' : '');",
"        b.textContent = f.noteResolu ? '✓' : '💬';",
"        b.setAttribute('data-note-fig', f.id);",
"        b.title = (f.noteResolu ? '[Résolu] ' : '') + 'Commentaire : ' + String(f.note).slice(0, 300);",
"      } else if (b) { b.remove(); }",
"    }"]) },

  { label: 'R4_handler_res',
    oldS: J([
"    const sup = p.querySelector('[data-sup]');",
"    if (sup) sup.onclick = function(){",
"      delete f.note; delete f.noteTs;",
"      if (typeof markChatDirty === 'function') markChatDirty();",
"      atcPersist();",
"      majBadge();",
"      fermerNoteFigure();",
"      toast('✓ Commentaire supprimé', 'success');",
"    };"]),
    newS: J([
"    const sup = p.querySelector('[data-sup]');",
"    if (sup) sup.onclick = function(){",
"      delete f.note; delete f.noteTs;",
"      if (typeof markChatDirty === 'function') markChatDirty();",
"      atcPersist();",
"      majBadge();",
"      fermerNoteFigure();",
"      toast('✓ Commentaire supprimé', 'success');",
"    };",
"    /* v630 — statut RÉSOLU du commentaire : bascule persistée, badge mis à jour. */",
"    const res = p.querySelector('[data-res]');",
"    if (res) res.onclick = function(){",
"      if (f.noteResolu) delete f.noteResolu; else f.noteResolu = true;",
"      if (typeof markChatDirty === 'function') markChatDirty();",
"      atcPersist();",
"      majBadge();",
"      res.textContent = f.noteResolu ? '↺ Rouvrir' : '✓ Résolu';",
"      toast(f.noteResolu ? '✓ Commentaire marqué résolu' : '↺ Commentaire rouvert', 'success');",
"    };"]) },

  { label: 'R5_export_md',
    oldS: "md+='> 💬 **Note de l\\'encadré** : '+String(s.note).replace(/\\n+/g,' ')+'\\n\\n'; });",
    newS: "md+='> 💬 **Note de l\\'encadré**'+(s.noteResolu?' ✅':'')+' : '+String(s.note).replace(/\\n+/g,' ')+'\\n\\n'; });" }
];

const CSS = [
'<style id="v630note-css">',
'/* v630 — badge de commentaire RÉSOLU : pastille verte distincte du 💬 */',
'.atc-figbox .fb-note.note-resolu{ background:#1b5e20; color:#eafbe7; }',
'</style>'
].join("\r\n");

let buf = fs.readFileSync(ROOT, 'utf8');
for (const { label, oldS, newS } of RULES){
  const n = buf.split(oldS).length - 1;
  if (n !== 1) { console.error("ERREUR [" + label + "] : occurrence = " + n + " (attendu 1)."); process.exit(2); }
  buf = buf.split(oldS).join(newS);
}

const idx = buf.lastIndexOf(ANCHOR);
if (idx === -1) { console.error("ERREUR : ancre </body> introuvable."); process.exit(2); }
buf = buf.slice(0, idx) + CSS + "\r\n" + buf.slice(idx);

const lfNus = (buf.match(/(?<!\r)\n/g) || []).length;
if (lfNus !== 0) { console.error("ERREUR : " + lfNus + " LF nus détectés."); process.exit(3); }

fs.writeFileSync(ROOT, buf, 'utf8');
console.log("OK : v630 statut résolu appliqué (5 remplacements + CSS, CRLF intact).");
