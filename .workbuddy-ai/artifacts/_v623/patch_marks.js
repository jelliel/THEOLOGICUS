// Patch v623 — ajoute un gardien d'alignement aux marques (surlignages ✏️)
// dans THEOLOGICUS.html, miroir de _hlAlign pour les annotations.
// Remplacement LITTÉRAL (préserve CRLF).

const fs = require("fs");
const path = require("path");

const F = path.resolve(__dirname, "..", "..", "..", "THEOLOGICUS.html");
let content = fs.readFileSync(F, "utf8");

const ANCRE = "  function applyMarks(){";
const start = content.indexOf(ANCRE);
if (start < 0) { console.error("ANCRE introuvable"); process.exit(2); }

// trouve l'accolade fermante qui cloture applyMarks (profondeur de braces)
let depth = 0, i = start, end = -1;
for (; i < content.length; i++) {
  const c = content[i];
  if (c === "{") depth++;
  else if (c === "}") { depth--; if (depth === 0) { end = i; break; } }
}
if (end < 0) { console.error("accolade fermante introuvable"); process.exit(2); }

const HELPERS = [
  "  /* v623 — GARDIEN D'ALIGNEMENT DES MARQUES (surlignages ✏️).",
  "     Comme _hlAlign pour les annotations, une marque doit suivre le TEXTE",
  "     surligné, pas un offset périmé. Si l'offset mémorisé pointe sur un",
  "     autre mot (rendu changé entre la capture et la réapplication, ou marque",
  "     ancienne sans offset fiable), on défait et on ré-ancre par recherche",
  "     texte à la BONNE occurrence. Vérifié par verify_marks_drift_recovery.js",
  "     (contrôle négatif : sans ce gardien, la marque reste sur le mauvais mot). */",
  "  function _mkConcat(box, id){",
  "    let s = '';",
  "    box.querySelectorAll('[data-mark-id=\"' + id + '\"]').forEach(function (sp) { s += sp.textContent || ''; });",
  "    return s;",
  "  }",
  "  function _mkUnwrap(box, id){",
  "    box.querySelectorAll('[data-mark-id=\"' + id + '\"]').forEach(function (sp) {",
  "      try { if (sp.parentNode) sp.parentNode.replaceChild(document.createTextNode(sp.textContent || ''), sp); } catch (e) {}",
  "    });",
  "  }",
  "  function _mkAlign(box, mk){",
  "    const want = _hlNorm(mk.text);",
  "    if (!want) return true;",
  "    return _hlNorm(_mkConcat(box, mk.id)) === want;",
  "  }",
  "  /* Ré-ancre une marque par recherche texte tolérante, en ESSAYANT chaque",
  "     occurrence jusqu'à ce que le texte enveloppé soit exactement le texte",
  "     surligné (utile si le mot est répété). */",
  "  function _mkWrapByText(box, mk){",
  "    const norm = function (s){ return (s || '').normalize('NFKC').normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/\\s+/g, ''); };",
  "    const wn = norm(mk.text);",
  "    if (!wn) return false;",
  "    const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT, null);",
  "    let full = ''; const nodes = []; let n;",
  "    while ((n = walker.nextNode())) { nodes.push({ node: n, start: full.length }); full += n.nodeValue; }",
  "    const fn = norm(full);",
  "    const occs = []; let k = 0;",
  "    while ((k = fn.indexOf(wn, k)) !== -1) { occs.push(k); k += wn.length; }",
  "    for (let o = 0; o < occs.length; o++) {",
  "      if (wrapNth(box, mk.text, o, mk.id, 'atc-mark')) {",
  "        if (_mkAlign(box, mk)) return true;",
  "        _mkUnwrap(box, mk.id);",
  "      }",
  "    }",
  "    return wrapOnce(box, mk.text, mk.id, 'atc-mark');",
  "  }",
].join("\r\n");

const NEW_APPLY = [
  "  function applyMarks(){",
  "    const msgs = (typeof state !== 'undefined' && state && state.messages) || [];",
  "    let totalFound = 0, totalApplied = 0, totalOffset = 0, totalRealign = 0, totalText = 0;",
  "    msgs.forEach(function(m){",
  "      if (!m.marks || !Array.isArray(m.marks)) return;",
  "      const box = document.getElementById('mc-' + m.ts);",
  "      if (!box) return;",
  "      m.marks.forEach(function(mk){",
  "        if (!mk || !mk.id || !mk.text || mk.text.indexOf('<') !== -1) return;",
  "        totalFound++;",
  "        if (box.querySelector('[data-mark-id=\"' + mk.id + '\"]')) return;",
  "        _mkColor[mk.id] = mk.color || 'yellow';",
  "        let ok = false;",
  "        if (typeof mk.start === 'number' && typeof mk.end === 'number') {",
  "          ok = wrapByOffset(box, mk.start, mk.end, mk.id, 'atc-mark');",
  "          /* v623 — l'offset peut être périmé : on vérifie que le texte",
  "             enveloppé est bien le texte surligné ; sinon on ré-ancre. */",
  "          if (ok && !_mkAlign(box, mk)) { _mkUnwrap(box, mk.id); ok = false; totalRealign++; }",
  "          if (ok) totalOffset++;",
  "        }",
  "        if (!ok) { ok = _mkWrapByText(box, mk); if (ok) totalText++; }",
  "        if (ok) totalApplied++;",
  "      });",
  "    });",
  "    if (totalFound > 0) console.log('[DIAG] applyMarks: found=' + totalFound + ' applied=' + totalApplied + ' byOffset=' + totalOffset + ' realigned=' + totalRealign + ' byText=' + totalText);",
  "  }",
].join("\r\n");

const NEW_BLOCK = HELPERS + "\r\n" + NEW_APPLY;
const updated = content.slice(0, start) + NEW_BLOCK + content.slice(end + 1);

if (updated.length !== content.length + (NEW_BLOCK.length - (end + 1 - start))) {
  console.error("TAILLE INATTENDUE");
}
fs.writeFileSync(F, updated, "utf8");

// vérifications
const has = (s) => updated.indexOf(s) !== -1;
const checks = {
  "_mkAlign present": has("function _mkAlign("),
  "_mkWrapByText present": has("function _mkWrapByText("),
  "gardien _mkAlign dans applyMarks": has("_mkUnwrap(box, mk.id); ok = false; totalRealign++"),
  "applyMarks reelu": has("byText="),
  "ancien applyMarks simple disparu": !has("totalApplied++;\n  }\n  let _atcMoT"),
};
console.log("--- patch applyMarks ---");
Object.entries(checks).forEach(([k, v]) => console.log((v ? "OK  " : "FAIL ") + k));
console.log("taille avant/apres:", content.length, updated.length);
