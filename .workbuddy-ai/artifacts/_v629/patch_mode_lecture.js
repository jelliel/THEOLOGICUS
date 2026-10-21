// v629 — Interface : MODE LECTURE (bouton 📖 flottant).
// Injection LITTERALE (CRLF préservé) d'un <style> + <script id="v629lecture">
// avant le DERNIER </body> (le HTML embarqué en contient d'autres).
// Bascule body.theo-read : masque .tpai-header, #v584-pet, #atc-nav-bar ;
// ferme la sidebar ; le chat, la saisie et #theo-progress restent.
// Préférence persistée (localStorage.theo_mode_lecture), restaurée au chargement.
const fs = require('fs');
const path = require('path');

const ROOT = process.argv[2] || path.resolve(__dirname, '../../THEOLOGICUS.html');
const ANCHOR = "</body>";

const CSS = [
'<style id="v629lecture-css">',
'#theo-read-toggle{position:fixed;right:14px;bottom:64px;z-index:120000;width:38px;height:38px;border-radius:50%;',
'  background:rgba(13,22,38,.92);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);',
'  border:1px solid rgba(var(--accent-rgb),.35);color:#eaf4ff;font-size:17px;line-height:1;cursor:pointer;',
'  box-shadow:0 8px 28px rgba(0,0,0,.5);transition:all .15s;user-select:none}',
'#theo-read-toggle:hover{transform:scale(1.08);background:rgba(var(--accent-rgb),.28)}',
'#theo-read-toggle.on{background:rgba(var(--accent-rgb),.5);border-color:var(--accent)}',
'/* v629 — MODE LECTURE : masquer le décor. Le style est en FIN de document',
'   (gagne l\'ordre à spécificité égale) et !important face aux règles de shell. */',
'body.theo-read #v6-topbar{display:none !important}',
'body.theo-read #v584-pet{display:none !important}',
'body.theo-read #atc-nav-bar{display:none !important}',
'</style>'
].join("\r\n");

const JS = [
'<script id="v629lecture">',
'(function(){',
'  if (window.__theoLecture) return; window.__theoLecture = true;',
'  var KEY = "theo_mode_lecture";',
'  function build(){',
'    var b = document.getElementById("theo-read-toggle"); if (b) return b;',
'    b = document.createElement("button");',
'    b.id = "theo-read-toggle"; b.textContent = "\\uD83D\\uDCD6"; b.type = "button";',
'    b.title = "Mode lecture (masquer le decor)";',
'    b.setAttribute("aria-label", "Mode lecture");',
'    document.body.appendChild(b);',
'    b.addEventListener("click", function(){ set(!document.body.classList.contains("theo-read")); });',
'    return b;',
'  }',
'  function set(on){',
'    on = !!on;',
'    document.body.classList.toggle("theo-read", on);',
'    try { localStorage.setItem(KEY, on ? "1" : "0"); } catch(e) {}',
'    var b = build();',
'    b.classList.toggle("on", on);',
'    b.title = on ? "Quitter le mode lecture" : "Mode lecture (masquer le decor)";',
'    if (on) { /* v629 : la sidebar ouverte gacherait la lecture */',
'      var sh = document.getElementById("tpai-shell");',
'      if (sh) sh.classList.remove("sidebar-open");',
'    }',
'  }',
'  build();',
'  try { if (localStorage.getItem(KEY) === "1") set(true); } catch(e) {}',
'  window.__theoLectureSet = set;',
'})();',
'</script>'
].join("\r\n");

let buf = fs.readFileSync(ROOT, 'utf8');
const idx = buf.lastIndexOf(ANCHOR);
if (idx === -1) { console.error("ERREUR : ancre </body> introuvable."); process.exit(2); }

buf = buf.slice(0, idx) + CSS + "\r\n" + JS + "\r\n" + buf.slice(idx);

const lfNus = (buf.match(/(?<!\r)\n/g) || []).length;
if (lfNus !== 0) { console.error("ERREUR : " + lfNus + " LF nus détectés."); process.exit(3); }

fs.writeFileSync(ROOT, buf, 'utf8');
console.log("OK : module v629lecture (mode lecture) injecté avant le dernier </body> (CRLF intact).");
