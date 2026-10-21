// v625 — Booster : throttle MutationObserver en requestAnimationFrame
// Remplacement LITTERAL (CRLF préservé) du bloc d'observation à la ligne ~30508.
// Aucune regex de normalisation : on ne touche que la sous-chaine exacte.
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || path.resolve(__dirname, '../../THEOLOGICUS.html');

const OLD = [
  "  let _atcMoT = null;",
  "  if (cc) {",
  "    const mo = new MutationObserver(function(){",
  "      /* v149 — ignorer aussi nos PROPREs mutations (unwrap/re-wrap",
  "         d'applyHighlights) : c'était le flicker du surlignage. */",
  "      if (window.__atcStreaming || window.__atcApplying || window.__atcFigEditing) return;",
  "      clearTimeout(_atcMoT);",
  "      _atcMoT = setTimeout(function(){",
  "        window.__atcApplying = true;",
  "        try { applyHighlights(); applyMarks(); applyShapes(); } catch (e) {}",
  "        setTimeout(function(){ window.__atcApplying = false; }, 0);",
  "      }, 60);",
  "    });",
  "    mo.observe(cc, { childList: true, subtree: true });",
  "  }"
].join("\r\n");

const NEW = [
  "  let _atcMoRaf = null;",
  "  function _atcScheduleApply(){",
  "    if (_atcMoRaf) return;                       // deja planifie cette frame",
  "    if (typeof requestAnimationFrame === 'function') {",
  "      _atcMoRaf = requestAnimationFrame(function(){",
  "        _atcMoRaf = null;",
  "        window.__atcApplying = true;",
  "        try { applyHighlights(); applyMarks(); applyShapes(); } catch (e) {}",
  "        setTimeout(function(){ window.__atcApplying = false; }, 0);",
  "      });",
  "    } else {",
  "      setTimeout(function(){",
  "        window.__atcApplying = true;",
  "        try { applyHighlights(); applyMarks(); applyShapes(); } catch (e) {}",
  "        setTimeout(function(){ window.__atcApplying = false; }, 0);",
  "      }, 60);",
  "    }",
  "  }",
  "  if (cc) {",
  "    const mo = new MutationObserver(function(){",
  "      /* v149 — ignorer nos PROPREs mutations (unwrap/re-wrap d'applyHighlights) :",
  "         c'était le flicker du surlignage. v625 : coalescence par requestAnimationFrame",
  "         (aligne sur le paint, plus fluide au scroll que setTimeout 60ms). */",
  "      if (window.__atcStreaming || window.__atcApplying || window.__atcFigEditing) return;",
  "      _atcScheduleApply();",
  "    });",
  "    mo.observe(cc, { childList: true, subtree: true });",
  "  }"
].join("\r\n");

let buf = fs.readFileSync(ROOT, 'utf8');

const before = buf.split(OLD).length - 1;
if (before !== 1) {
  console.error("ERREUR : occurrence OLD = " + before + " (attendu 1). Patch annulé.");
  process.exit(2);
}

buf = buf.split(OLD).join(NEW);

// Intégrité CRLF : aucun LF nu (non précédé de CR)
const lfNus = (buf.match(/(?<!\r)\n/g) || []).length;
if (lfNus !== 0) {
  console.error("ERREUR : " + lfNus + " LF nus détectés après patch.");
  process.exit(3);
}

fs.writeFileSync(ROOT, buf, 'utf8');
console.log("OK : throttle MutationObserver -> rAF (CRLF intact, 0 LF nu).");
