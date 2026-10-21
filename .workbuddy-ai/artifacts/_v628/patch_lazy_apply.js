// v628 — Booster : LAZY-APPLY par viewport (IntersectionObserver-like).
// 6 remplacements LITTERAUX (CRLF préservé) :
//  R1 : helper _atcBoxNear avant applyShapes.
//  R2/R3/R4 : skip des messages hors viewport dans applyShapes/applyHighlights/applyMarks.
//  R5 : listener scroll (capture) -> _atcScheduleApply (les messages qui
//       ENTRENT dans le viewport sont traités au scroll).
//  R6 : v626nav adapté — collect() lit window.state (les marques hors
//       viewport n'existent plus dans le DOM), scrollToMark scrolle d'abord
//       au message puis re-essaie (l'apply rAF rend la marque).
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || path.resolve(__dirname, '../../THEOLOGICUS.html');

function R(label, oldLines, newLines){
  const oldS = oldLines.join("\r\n"), newS = newLines.join("\r\n");
  return { label, oldS, newS };
}

const RULES = [
  R('R1_helper',
    [
      '  function applyShapes(){',
    ],
    [
      '  /* v628 — LAZY-APPLY : on ne traite que les messages VISIBLES (viewport +',
      '     marge). Un message hors écran sera traité quand il y ENTRERA (le scroll',
      '     re-déclenche l\'apply via le listener plus bas). Gain : sur une longue',
      '     conversation, applyHighlights/applyMarks/applyShapes ne marchent plus',
      '     sur TOUTE l\'historique à chaque mutation, mais sur les seuls messages',
      '     affichés. Fail-open : en cas d\'erreur de mesure, on traite. */',
      '  var _ATC_VIEW_MARGIN = 300;',
      '  function _atcBoxNear(box){',
      '    try {',
      '      var r = box.getBoundingClientRect();',
      '      var vh = (window.innerHeight || document.documentElement.clientHeight || 800);',
      '      var vw = (window.innerWidth || document.documentElement.clientWidth || 1200);',
      '      return (r.bottom >= -_ATC_VIEW_MARGIN) && (r.top <= vh + _ATC_VIEW_MARGIN) && (r.right >= 0) && (r.left <= vw);',
      '    } catch (e) { return true; }',
      '  }',
      '  function applyShapes(){',
    ]),

  R('R2_shapes_skip',
    [
      '      if (!m.shapes || !Array.isArray(m.shapes)) return;',
      '      const box = document.getElementById(\'mc-\' + m.ts);',
      '      if (!box) return;',
    ],
    [
      '      if (!m.shapes || !Array.isArray(m.shapes)) return;',
      '      const box = document.getElementById(\'mc-\' + m.ts);',
      '      if (!box) return;',
      '      if (!_atcBoxNear(box)) return; /* v628 lazy */',
    ]),

  R('R3_hl_skip',
    [
      '      if (!m.annotations || !Array.isArray(m.annotations)) return;',
      '      const box = document.getElementById(\'mc-\' + m.ts);',
      '      if (!box) { totalNoBox += m.annotations.length; return; }',
    ],
    [
      '      if (!m.annotations || !Array.isArray(m.annotations)) return;',
      '      const box = document.getElementById(\'mc-\' + m.ts);',
      '      if (!box) { totalNoBox += m.annotations.length; return; }',
      '      if (!_atcBoxNear(box)) return; /* v628 lazy */',
    ]),

  R('R4_marks_skip',
    [
      '      if (!m.marks || !Array.isArray(m.marks)) return;',
      '      const box = document.getElementById(\'mc-\' + m.ts);',
      '      if (!box) return;',
    ],
    [
      '      if (!m.marks || !Array.isArray(m.marks)) return;',
      '      const box = document.getElementById(\'mc-\' + m.ts);',
      '      if (!box) return;',
      '      if (!_atcBoxNear(box)) return; /* v628 lazy */',
    ]),

  R('R5_scroll',
    [
      '    mo.observe(cc, { childList: true, subtree: true });',
      '  }',
    ],
    [
      '    mo.observe(cc, { childList: true, subtree: true });',
      '  }',
      '  /* v628 — le scroll fait ENTRER des messages dans le viewport : on',
      '     re-déclenche l\'apply (coalescé par rAF) pour les traiter.',
      '     capture:true attrape le scroll de cc même s\'il ne bubble pas. */',
      '  var _atcScT = null;',
      '  document.addEventListener(\'scroll\', function(){',
      '    if (window.__atcStreaming || window.__atcApplying || window.__atcFigEditing) return;',
      '    if (_atcScT) return;',
      '    _atcScT = setTimeout(function(){ _atcScT = null; _atcScheduleApply(); }, 120);',
      '  }, { passive: true, capture: true });',
    ]),
];

// R6 — v626nav : collect() + scrollToMark remplacés.
const R6a = R('R6a_nav_collect',
  [
    '  function collect(){',
    '    var nodes = document.querySelectorAll("#chat-container [data-mark-id]:not([data-panel-mark])");',
    '    var out = [], seen = {};',
    '    for (var i=0;i<nodes.length;i++){',
    '      var n = nodes[i], id = n.getAttribute("data-mark-id");',
    '      if (!id || seen[id]) continue; seen[id]=1;',
    '      var cls = n.className || "", m = cls.match(/mk-([a-z]+)/);',
    '      var color = (m && m[1]) || n.getAttribute("data-color") || "yellow";',
    '      out.push({ id:id, text:(n.textContent||"").trim().slice(0,90), color:color });',
    '    }',
    '    return out;',
    '  }',
  ],
  [
    '  function collect(){',
    '    /* v628 — lazy-apply : les marques hors viewport ne sont plus dans le DOM.',
    '       On lit les DONNÉES (window.state) : panneau toujours complet. Repli DOM. */',
    '    var out = [], seen = {};',
    '    try {',
    '      var msgs = (window.state && window.state.messages) || [];',
    '      for (var i=0;i<msgs.length;i++){',
    '        var mm = msgs[i];',
    '        if (!mm || !Array.isArray(mm.marks)) continue;',
    '        for (var j=0;j<mm.marks.length;j++){',
    '          var mk = mm.marks[j];',
    '          if (!mk || !mk.id || !mk.text) continue;',
    '          if (seen[mk.id]) continue; seen[mk.id]=1;',
    '          out.push({ id:mk.id, text:String(mk.text).slice(0,90), color:mk.color||"yellow", ts:mm.ts });',
    '        }',
    '      }',
    '    } catch(e) {}',
    '    if (!out.length) {',
    '      var nodes = document.querySelectorAll("#chat-container [data-mark-id]:not([data-panel-mark])");',
    '      for (var k=0;k<nodes.length;k++){',
    '        var n = nodes[k], id = n.getAttribute("data-mark-id");',
    '        if (!id || seen[id]) continue; seen[id]=1;',
    '        var cls = n.className || "", mx = cls.match(/mk-([a-z]+)/);',
    '        var color = (mx && mx[1]) || n.getAttribute("data-color") || "yellow";',
    '        out.push({ id:id, text:(n.textContent||"").trim().slice(0,90), color:color, ts:null });',
    '      }',
    '    }',
    '    out.sort(function(a,b){ return (a.ts||0)-(b.ts||0); });',
    '    return out;',
    '  }',
  ]);

const R6b = R('R6b_nav_scrollTo',
  [
    '  function scrollToMark(id){',
    '    var all = document.querySelectorAll("[data-mark-id]"), node = null;',
    '    for (var i=0;i<all.length;i++){ if (all[i].getAttribute("data-mark-id")===id){ node = all[i]; break; } }',
    '    if (!node) return false;',
    '    node.scrollIntoView({ block:"center", behavior:"smooth" });',
    '    node.classList.add("mk-flash");',
    '    setTimeout(function(){ node.classList.remove("mk-flash"); }, 1200);',
    '    return true;',
    '  }',
  ],
  [
    '  function scrollToMark(id, tries){',
    '    var all = document.querySelectorAll("[data-mark-id]"), node = null;',
    '    for (var i=0;i<all.length;i++){ if (all[i].getAttribute("data-mark-id")===id){ node = all[i]; break; } }',
    '    if (!node){',
    '      /* v628 — lazy-apply : la marque hors viewport n\'est pas encore rendue.',
    '         On scroll d\'abord au MESSAGE (l\'apply rAF la rendra) puis on re-essaie. */',
    '      if (!tries || tries < 3){',
    '        var ts = null;',
    '        for (var j=0;j<navList.length;j++){ if (navList[j].id===id){ ts = navList[j].ts; break; } }',
    '        if (ts != null){',
    '          var mc = document.getElementById("mc-" + ts);',
    '          if (mc){ mc.scrollIntoView({ block:"center", behavior:"smooth" }); }',
    '        }',
    '        setTimeout(function(){ scrollToMark(id, (tries||0)+1); }, 350);',
    '        return true;',
    '      }',
    '      return false;',
    '    }',
    '    node.scrollIntoView({ block:"center", behavior:"smooth" });',
    '    node.classList.add("mk-flash");',
    '    setTimeout(function(){ node.classList.remove("mk-flash"); }, 1200);',
    '    return true;',
    '  }',
  ]);

RULES.push(R6a, R6b);

let buf = fs.readFileSync(ROOT, 'utf8');
for (const { label, oldS, newS } of RULES){
  const n = buf.split(oldS).length - 1;
  if (n !== 1) { console.error("ERREUR [" + label + "] : occurrence = " + n + " (attendu 1)."); process.exit(2); }
  buf = buf.split(oldS).join(newS);
}

const lfNus = (buf.match(/(?<!\r)\n/g) || []).length;
if (lfNus !== 0) { console.error("ERREUR : " + lfNus + " LF nus détectés."); process.exit(3); }

fs.writeFileSync(ROOT, buf, 'utf8');
console.log("OK : v628 lazy-apply appliqué (7 remplacements, CRLF intact).");
