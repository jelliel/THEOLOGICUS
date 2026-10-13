/* ═══════════════════════════════════════════════════════════════════════
   Lot v576 — SYNCHRONISATION DE LA VOIX : Adeodat suit PARAMÈTRES.
   Constat utilisateur : PARAMÈTRES → Lecture vocale a DÉJÀ Supertonic 3
   opérationnel (v109 : 3 moteurs system/elevenlabs/supertonic, service
   local port 8091 lancé par le serveur de l'app, modèles ~/.cache/
   supertonic3). Le lot v575 (port 7788 + wrapper dédié) était un DOUBLON
   qui se remplaçait lui-même au lieu de suivre le réglage de l'app.
   Correctif :
     1. SUPPRESSION du module v575-adeodat-tts (rangée + wrapper) ;
     2. NOUVEAU module v576-adeodat-voix : badge read-only « 🎙️ Voix : … »
        dans le panneau Adeodat, alimenté par LA MÊME clé
        (theologicus-tts-moteurs), rafraîchi à l'ouverture du panneau et
        sur l'événement storage ; clic → PARAMÈTRES ouvert sur l'onglet
        Lecture vocale. ttsEmission (point de sortie unique v109) route
        déjà Adeodat vers le moteur choisi : aucune duplication.
   ═══════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const F = 'C:/tmp/theoverify/THEOLOGICUS.html';
let src = fs.readFileSync(F, 'utf8');
if (/(?<!\r)\n/.test(src)) { console.error('LF seuls présents AVANT édition — abort'); process.exit(1); }
const tailleAv = src.length;
const LOG = [];

function lignes(a) { return a.join('\r\n'); }

/* ── 1. SUPPRESSION du module v575 (doublon) ── */
const d575 = src.indexOf('<script id="v575-adeodat-tts">');
if (d575 === -1) { console.error('module v575 introuvable (déjà retiré ?)'); process.exit(1); }
const f575 = src.indexOf('</script>', d575);
if (f575 === -1) { console.error('fin du module v575 introuvable'); process.exit(1); }
let fin575 = f575 + '</script>'.length;
if (src.slice(fin575, fin575 + 2) === '\r\n') fin575 += 2;
src = src.slice(0, d575) + src.slice(fin575);
LOG.push('module v575 supprimé (' + (fin575 - d575) + ' octets)');

/* ── 2. NOUVEAU module v576-adeodat-voix ── */
const MOD = lignes([
  '<script id="v576-adeodat-voix">',
  '/* ═══════════════════════════════════════════════════════════════════',
  '   v576 — VOIX UNIFIÉE : Adeodat suit PARAMÈTRES → Lecture vocale.',
  '   Le moteur de lecture (v109) a UN SEUL point de sortie : ttsEmission(),',
  '   que les files d\'Adeodat empruntent déjà — donc quand Supertonic 3',
  '   (port 8091, service lancé par le serveur de l\'app, modèles dans',
  '   ~/.cache/supertonic3) ou ElevenLabs est choisi dans PARAMÈTRES,',
  '   Adeodat le parle DIRECTEMENT. Ce module ajoute seulement :',
  '     • un badge « 🎙️ Voix : … » dans le panneau, lu dans LA MÊME clé de',
  '       configuration (theologicus-tts-moteurs), rafraîchi à l\'ouverture',
  '       du panneau et sur l\'événement storage ;',
  '     • clic sur le badge → PARAMÈTRES ouvert sur l\'onglet Lecture vocale.',
  '   (Remplace le doublon v575 : deux réglages de voix = deux vérités.)',
  '   ═══════════════════════════════════════════════════════════════════ */',
  '(function () {',
  '  "use strict";',
  '  if (window.__v576AdeodatVoix) return;',
  '',
  '  const CLE = "theologicus-tts-moteurs";',
  '  const NOMS = { system: "🔊 Voix système", elevenlabs: "🎙️ ElevenLabs", supertonic: "🎙️ Supertonic 3" };',
  '',
  '  function cfgMoteur() {',
  '    try {',
  '      const b = JSON.parse(localStorage.getItem(CLE) || "null");',
  '      return (b && b.moteur && NOMS[b.moteur]) ? b.moteur : "system";',
  '    } catch (e) { return "system"; }',
  '  }',
  '  function majBadge() {',
  '    const b = document.getElementById("adeodat-voix");',
  '    if (!b) return;',
  '    b.textContent = NOMS[cfgMoteur()] || NOMS.system;',
  '    b.title = "Voix active (PARAMÈTRES → Lecture vocale) — cliquez pour régler";',
  '  }',
  '  function ouvrirParametres() {',
  '    try {',
  '      const btn = document.getElementById("open-settings-modal");',
  '      if (btn) btn.click();',
  '      if (typeof window.__settingsOuvrirOnglet === "function") window.__settingsOuvrirOnglet("tts");',
  '    } catch (e) {}',
  '  }',
  '  function installerUI() {',
  '    const pan = document.getElementById("adeodat-pan");',
  '    const msgs = document.getElementById("adeodat-msgs");',
  '    if (!pan || !msgs || document.getElementById("adeodat-voix")) return;',
  '    const rang = document.createElement("div");',
  '    rang.style.cssText = "display:flex;padding:.3rem .7rem;border-bottom:1px solid var(--ui-border,#2a2a3a)";',
  '    const b = document.createElement("button");',
  '    b.type = "button";',
  '    b.id = "adeodat-voix";',
  '    b.setAttribute("aria-label", "Voix active — ouvrir PARAMÈTRES, onglet Lecture vocale");',
  '    b.style.cssText = "flex:1;text-align:left;background:rgba(255,255,255,.04);color:var(--ui-dim,#8a8896);border:1px solid var(--ui-border,#2a2a3a);border-radius:6px;cursor:pointer;font-size:.62rem;padding:.28rem .45rem";',
  '    b.addEventListener("click", ouvrirParametres);',
  '    rang.appendChild(b);',
  '    pan.insertBefore(rang, msgs);',
  '    majBadge();',
  '  }',
  '  function init() { installerUI(); majBadge(); }',
  '  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);',
  '  else init();',
  '  setTimeout(init, 1900);',
  '  try {',
  '    window.addEventListener("storage", function (e) { if (e && e.key === CLE) majBadge(); });',
  '  } catch (e) {}',
  '  try {',
  '    const obs = new MutationObserver(function () { installerUI(); majBadge(); });',
  '    obs.observe(document.body, { childList: true });',
  '  } catch (e) {}',
  '  try {',
  '    const obs2 = new MutationObserver(function () { majBadge(); });',
  '    const iv = setInterval(function () {',
  '      const p = document.getElementById("adeodat-pan");',
  '      if (p) { obs2.observe(p, { attributes: true, attributeFilter: ["style"] }); clearInterval(iv); }',
  '    }, 400);',
  '  } catch (e) {}',
  '  window.__v576AdeodatVoix = { majBadge: majBadge, moteurActif: cfgMoteur };',
  '})();',
  '',
  '</script>',
  ''
]);
const idxB = src.lastIndexOf('</body>');
if (idxB === -1) { console.error('</body> introuvable'); process.exit(1); }
src = src.slice(0, idxB) + MOD + src.slice(idxB);
LOG.push('module v576 inséré');

/* ── vérifications ── */
if (/(?<!\r)\n/.test(src)) { console.error('LF seuls INTRODUITS — abort (aucune écriture)'); process.exit(1); }
const tag = '<script id="v576-adeodat-voix">';
const dM = src.indexOf(tag) + tag.length;
const fM = src.indexOf('</script>', dM);
fs.writeFileSync(path.join(__dirname, 'module_extrait_576.js'), src.slice(dM, fM), 'utf8');
fs.writeFileSync(F, src, 'utf8');
LOG.forEach(l => console.log('  ✓ ' + l));
console.log('Taille : ' + tailleAv + ' -> ' + src.length + ' (' + (src.length - tailleAv >= 0 ? '+' : '') + (src.length - tailleAv) + ')');
console.log('node --check à faire sur module_extrait_576.js (bash)');
