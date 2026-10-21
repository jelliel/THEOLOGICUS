// v626 — Interface : navigation des surlignages de conversation.
// Injection LITTERALE (CRLF préservé) d'un <style> + <script id="v626nav">
// juste avant </body>. Le module énumère les <mark data-mark-id> (hors
// panneaux d'étude) et fournit prev/next + panneau liste + filtre couleur.
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || path.resolve(__dirname, '../../THEOLOGICUS.html');

// Ancre unique : la vraie balise </body> (le base64 ai-video n'a pas de '<' '>').
const ANCHOR = "</body>";

const CSS = [
'<style id="v626nav-css">',
'#atc-nav-bar{position:fixed;right:14px;bottom:14px;z-index:120000;display:none;align-items:center;gap:6px;',
'  background:rgba(13,22,38,.92);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);',
'  border:1px solid rgba(var(--accent-rgb),.35);border-radius:12px;padding:5px 7px;box-shadow:0 8px 28px rgba(0,0,0,.5);',
'  font-family:"Exo 2",sans-serif;font-size:14px;color:#eaf4ff;user-select:none}',
'#atc-nav-bar button{background:rgba(var(--accent-rgb),.12);border:1px solid rgba(var(--accent-rgb),.3);color:#eaf4ff;',
'  border-radius:8px;width:30px;height:30px;font-size:16px;line-height:1;cursor:pointer;transition:all .15s}',
'#atc-nav-bar button:hover{background:rgba(var(--accent-rgb),.3);transform:scale(1.08)}',
'#atc-nav-bar .atc-nav-count{min-width:42px;text-align:center;font-weight:600;font-size:13px}',
'#atc-nav-panel{position:fixed;top:0;right:0;height:100%;width:300px;max-width:82vw;z-index:120001;transform:translateX(100%);',
'  transition:transform .22s ease;background:rgba(13,22,38,.97);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);',
'  border-left:1px solid rgba(var(--accent-rgb),.35);box-shadow:-10px 0 40px rgba(0,0,0,.5);display:flex;flex-direction:column;color:#eaf4ff}',
'#atc-nav-panel.open{transform:translateX(0)}',
'#atc-nav-panel .anp-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;',
'  font-weight:700;font-size:15px;border-bottom:1px solid rgba(255,255,255,.1)}',
'#atc-nav-panel .anp-close{background:none;border:none;color:#eaf4ff;font-size:18px;cursor:pointer}',
'#atc-nav-panel .anp-filter{display:flex;flex-wrap:wrap;gap:6px;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.08)}',
'#atc-nav-panel .anp-fdot{width:18px;height:18px;border-radius:50%;cursor:pointer;border:2px solid transparent}',
'#atc-nav-panel .anp-fdot.anp-fall{width:auto;height:auto;border-radius:8px;padding:2px 8px;font-size:12px;',
'  background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2)}',
'#atc-nav-panel .anp-fdot.sel{border-color:#fff;box-shadow:0 0 0 2px rgba(var(--accent-rgb),.6)}',
'#atc-nav-panel .anp-list{flex:1;overflow:auto;padding:8px 10px}',
'#atc-nav-panel .anp-item{display:flex;align-items:center;gap:8px;padding:8px 8px;border-radius:8px;cursor:pointer;font-size:13px}',
'#atc-nav-panel .anp-item:hover{background:rgba(var(--accent-rgb),.18)}',
'#atc-nav-panel .anp-dot{width:12px;height:12px;border-radius:50%;flex:0 0 auto}',
'#atc-nav-panel .anp-txt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
'#atc-nav-panel .anp-empty{padding:20px;text-align:center;opacity:.6;font-size:13px}',
'.mk-flash{animation:mkflash 1.2s ease}',
'@keyframes mkflash{0%{box-shadow:0 0 0 0 rgba(var(--accent-rgb),.9)}',
'  30%{box-shadow:0 0 0 6px rgba(var(--accent-rgb),.55)}100%{box-shadow:0 0 0 0 rgba(var(--accent-rgb),0)}}',
'</style>'
].join("\r\n");

const JS = [
'<script id="v626nav">',
'(function(){',
'  if (window.__atcNavReady) return; window.__atcNavReady = true;',
'  var MK_HEX = { yellow:"#ffe066", green:"#7CFC00", pink:"#ff8fcf", blue:"#5aa9ff", orange:"#ffa64d", purple:"#c792ea" };',
'  var navIdx = -1, navList = [], filterColor = null, _navTo = null;',
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
'  function buildBar(){',
'    var bar = document.getElementById("atc-nav-bar"); if (bar) return bar;',
'    bar = document.createElement("div"); bar.id = "atc-nav-bar";',
'    bar.innerHTML = \'<button class="atc-nav-prev" title="Surlignage precedent">‹</button>\'',
'      + \'<span class="atc-nav-count">0/0</span>\'',
'      + \'<button class="atc-nav-next" title="Surlignage suivant">›</button>\'',
'      + \'<button class="atc-nav-list" title="Liste des surlignages">☰</button>\';',
'    document.body.appendChild(bar);',
'    bar.querySelector(".atc-nav-prev").addEventListener("click", function(){ go(-1); });',
'    bar.querySelector(".atc-nav-next").addEventListener("click", function(){ go(1); });',
'    bar.querySelector(".atc-nav-list").addEventListener("click", toggleList);',
'    return bar;',
'  }',
'  function buildPanel(){',
'    var p = document.getElementById("atc-nav-panel"); if (p) return p;',
'    p = document.createElement("div"); p.id = "atc-nav-panel";',
'    p.innerHTML = \'<div class="anp-head"><span>📍 Surlignages</span><button class="anp-close">✕</button></div>\'',
'      + \'<div class="anp-filter"></div><div class="anp-list"></div>\';',
'    document.body.appendChild(p);',
'    p.querySelector(".anp-close").addEventListener("click", function(){ p.classList.remove("open"); });',
'    return p;',
'  }',
'  function visibleList(){ return filterColor ? navList.filter(function(x){ return x.color === filterColor; }) : navList; }',
'  function renderPanel(){',
'    var p = buildPanel(), list = p.querySelector(".anp-list"), items = visibleList();',
'    list.innerHTML = "";',
'    if (!items.length){ list.innerHTML = \'<div class="anp-empty">Aucun surlignage.</div>\'; }',
'    items.forEach(function(it){',
'      var d = document.createElement("div"); d.className = "anp-item";',
'      var dot = document.createElement("span"); dot.className = "anp-dot"; dot.style.background = MK_HEX[it.color] || "#ffe066";',
'      var t = document.createElement("span"); t.className = "anp-txt"; t.textContent = it.text;',
'      d.appendChild(dot); d.appendChild(t);',
'      d.addEventListener("click", function(){ jumpTo(it.id); });',
'      list.appendChild(d);',
'    });',
'    var f = p.querySelector(".anp-filter"); f.innerHTML = "";',
'    var all = document.createElement("span"); all.className = "anp-fdot anp-fall" + (filterColor? "":" sel"); all.textContent = "Tous";',
'    all.addEventListener("click", function(){ filterColor = null; renderPanel(); }); f.appendChild(all);',
'    Object.keys(MK_HEX).forEach(function(c){',
'      var s = document.createElement("span"); s.className = "anp-fdot" + (filterColor===c?" sel":""); s.style.background = MK_HEX[c];',
'      s.addEventListener("click", function(){ filterColor = (filterColor===c)?null:c; renderPanel(); }); f.appendChild(s);',
'    });',
'  }',
'  function scrollToMark(id){',
'    var all = document.querySelectorAll("[data-mark-id]"), node = null;',
'    for (var i=0;i<all.length;i++){ if (all[i].getAttribute("data-mark-id")===id){ node = all[i]; break; } }',
'    if (!node) return false;',
'    node.scrollIntoView({ block:"center", behavior:"smooth" });',
'    node.classList.add("mk-flash");',
'    setTimeout(function(){ node.classList.remove("mk-flash"); }, 1200);',
'    return true;',
'  }',
'  function refresh(){',
'    navList = collect();',
'    var bar = buildBar();',
'    bar.style.display = navList.length ? "flex" : "none";',
'    bar.querySelector(".atc-nav-count").textContent = (navList.length ? (navIdx+1) : 0) + "/" + navList.length;',
'    if (document.getElementById("atc-nav-panel").classList.contains("open")) renderPanel();',
'  }',
'  function go(dir){',
'    if (!navList.length) return;',
'    navIdx += dir;',
'    if (navIdx < 0) navIdx = navList.length - 1;',
'    if (navIdx >= navList.length) navIdx = 0;',
'    scrollToMark(navList[navIdx].id); refresh();',
'  }',
'  function jumpTo(id){',
'    for (var i=0;i<navList.length;i++){ if (navList[i].id===id){ navIdx = i; break; } }',
'    scrollToMark(id); refresh();',
'  }',
'  function toggleList(){ var p = buildPanel(); p.classList.toggle("open"); if (p.classList.contains("open")) refresh(); }',
'  buildBar(); buildPanel(); refresh();',
'  var ccNav = document.getElementById("chat-container");',
'  if (ccNav && window.MutationObserver){',
'    var moN = new MutationObserver(function(){ clearTimeout(_navTo); _navTo = setTimeout(refresh, 300); });',
'    moN.observe(ccNav, { childList:true, subtree:true });',
'  }',
'  window.__atcNavCount = function(){ return navList.length; };',
'  window.__atcNavGo = go;',
'  window.__atcNavActiveId = function(){ return navIdx>=0 && navList[navIdx] ? navList[navIdx].id : null; };',
'  window.__atcNavOpen = function(){ toggleList(); };',
'})();',
'</script>'
].join("\r\n");

let buf = fs.readFileSync(ROOT, 'utf8');
const idx = buf.lastIndexOf(ANCHOR);
if (idx === -1) { console.error("ERREUR : ancre </body> introuvable."); process.exit(2); }

const NEW = CSS + "\r\n" + JS + "\r\n";
buf = buf.slice(0, idx) + NEW + buf.slice(idx);

const lfNus = (buf.match(/(?<!\r)\n/g) || []).length;
if (lfNus !== 0) { console.error("ERREUR : " + lfNus + " LF nus détectés."); process.exit(3); }

fs.writeFileSync(ROOT, buf, 'utf8');
console.log("OK : module v626nav injecté avant </body> (CRLF intact).");
