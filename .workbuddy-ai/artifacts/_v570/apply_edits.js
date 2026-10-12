/* v570 — application des correctifs ADEODAT MICRO (v564 + v566), CRLF sûr.
   Principe : remplacements par ancrage EXACT, échec bruyant si l'ancrage
   n'apparaît pas exactement une fois. Jamais de String.replace avec $. */
const fs = require('fs');
const F = 'C:/tmp/theoverify/THEOLOGICUS.html';
let src = fs.readFileSync(F, 'utf8');

const LF_SEUL = (src.match(/(?<!\r)\n/g) || []).length;
if (LF_SEUL > 0) { console.error('FATAL : le fichier contient déjà des LF seuls : ' + LF_SEUL); process.exit(1); }

function remplacer(titre, oldLines, newLines) {
  const oldStr = oldLines.join('\r\n');
  const newStr = newLines.join('\r\n');
  const n = src.split(oldStr).length - 1;
  if (n !== 1) { console.error('FATAL [' + titre + '] : ancrage trouvé ' + n + ' fois (attendu 1)'); process.exit(1); }
  src = src.replace(oldStr, () => newStr);
  console.log('OK  ' + titre);
}

/* ═══════════════ v564 — parler(t, fin) ═══════════════ */
remplacer('v564.parler — callback de fin',
[
'  function parler(t) {',
'    if (!ttsActif() || !t) return;',
'    try {',
"      if (typeof ttsEmission === 'function') ttsEmission(String(t).slice(0, 1200), 'fr-FR', null, null);",
'      else if (window.speechSynthesis) {',
'        var u = new window.SpeechSynthesisUtterance(String(t).slice(0, 1200));',
"        u.lang = 'fr-FR'; window.speechSynthesis.speak(u);",
'      }',
'    } catch (e) {}',
'  }'
],
[
'  /* V3f (v570) — `fin` : callback de FIN de lecture. La session micro',
'     continue est suspendue tant que Adeodat parle (sinon, sur Android, le',
'     micro entend le TTS → boucle d\\\'écho + bips de reconnaissance). */',
'  function parler(t, fin) {',
'    if (!ttsActif() || !t) return;',
'    try {',
"      if (typeof ttsEmission === 'function') ttsEmission(String(t).slice(0, 1200), 'fr-FR', fin || null, fin || null);",
'      else if (window.speechSynthesis) {',
'        var u = new window.SpeechSynthesisUtterance(String(t).slice(0, 1200));',
"        u.lang = 'fr-FR';",
'        if (fin) { u.onend = fin; u.onerror = fin; }',
'        window.speechSynthesis.speak(u);',
'      }',
'    } catch (e) { if (fin) try { fin(); } catch (e2) {} }',
'  }'
]);

/* ═══════════════ v564 — envoyer : pause/reprise du micro ═══════════════ */
remplacer('v564.envoyer — insertion pause + état de file (B1)',
[
"    const bulleA = bulle('assistant', '…');",
'    try {'
],
[
"    const bulleA = bulle('assistant', '…');",
"    /* V3f (v570) — MICRO SUSPENDU pendant toute la réponse : sur Android le",
"       micro resté actif entendait le TTS d'Adeodat → boucle d'écho (il",
"       s'envoyait ses propres réponses) + bip du recognizer à chaque",
"       redémarrage = « son de notification en permanence ». La session",
"       continue est suspendue ici, puis REPRISE quand la réponse est finie",
"       d'être dite (ou immédiatement si TTS muet / en cas d'erreur). */",
'    try { if (window.__v566Libre && window.__v566Libre.microPause) window.__v566Libre.microPause(); } catch (e) {}',
'    const file = []; let fileEnCours = false; let resteEnParcours = false;',
'    let reponseFinie = false;',
'    function tenterReprise() {',
'      if (!reponseFinie || fileEnCours || resteEnParcours) return;',
'      reponseFinie = false;                 /* la reprise ne survient qu\\\'une fois */',
'      try { if (window.__v566Libre && window.__v566Libre.microReprendre) window.__v566Libre.microReprendre(); } catch (e) {}',
'    }',
'    try {'
]);

remplacer('v564.envoyer — remontée de file au niveau fonction (B2)',
[
"      let tampon = '', parleDeja = 0;",
'      const file = []; let fileEnCours = false;'
],
[
"      let tampon = '', parleDeja = 0;",
'      /* file / fileEnCours : remontés au niveau de la fonction (v570) pour',
'         que la reprise du micro attende la fin RÉELLE de la file TTS. */'
]);

remplacer('v564.envoyer — file muette + reprise à la vidange (B3)',
[
'        if (!file.length) { fileEnCours = false; return; }'
],
[
'        if (!ttsActif()) { file.length = 0; fileEnCours = false; tenterReprise(); return; }',
'        if (!file.length) { fileEnCours = false; tenterReprise(); return; }'
]);

remplacer('v564.envoyer — reprise si TTS indisponible (B4)',
[
"        try { if (typeof ttsEmission === 'function') ttsEmission(phrase, 'fr-FR', function () { parlerSuivant(); }, function () { parlerSuivant(); }); else { fileEnCours = false; } } catch (e) { fileEnCours = false; }"
],
[
"        try { if (typeof ttsEmission === 'function') ttsEmission(phrase, 'fr-FR', function () { parlerSuivant(); }, function () { parlerSuivant(); }); else { fileEnCours = false; tenterReprise(); } } catch (e) { fileEnCours = false; tenterReprise(); }"
]);

remplacer('v564.envoyer — fin de réponse : reprise après le reste dit (B5)',
[
'      /* V3e — la file TTS a déjà lu la quasi-totalité : on ne prononce que',
'         la fin restée en attente (sinon la réponse serait lue deux fois). */',
'      const reste = txt.slice(Math.min(parleDeja, txt.length)).trim();',
'      if (ttsActif() && reste.length > 1) parler(reste);'
],
[
'      /* V3e — la file TTS a déjà lu la quasi-totalité : on ne prononce que',
'         la fin restée en attente (sinon la réponse serait lue deux fois). */',
'      reponseFinie = true;',
'      const reste = txt.slice(Math.min(parleDeja, txt.length)).trim();',
'      if (ttsActif() && reste.length > 1) {',
'        resteEnParcours = true;',
'        parler(reste, function () { resteEnParcours = false; tenterReprise(); });',
'      }',
'      tenterReprise();                      /* reprise du micro (fin de réponse) */'
]);

remplacer('v564.envoyer — erreur : ne jamais laisser le micro suspendu (B6)',
[
'    } catch (e) {',
"      const msg = '⚠️ ' + String(e && e.message || e);"
],
[
'    } catch (e) {',
'      reponseFinie = true; fileEnCours = false; resteEnParcours = false;',
'      tenterReprise();                      /* ne jamais laisser le micro suspendu */',
"      const msg = '⚠️ ' + String(e && e.message || e);"
]);

/* ═══════════════ v564 — ouvrir : réamorcer TOUJOURS la session ═══════════════ */
remplacer('v564.ouvrir — continuSet(true) inconditionnel (C)',
[
'    try { if (window.__v566Libre && !window.__v566Libre.continuGet()) window.__v566Libre.continuSet(true); } catch (e) {}'
],
[
"    /* V3f (v570) — (ré)amorcer TOUJOURS la session à l'ouverture : après une",
'       fermeture (session stoppée avec le panneau) ou un drapeau \'1\' resté',
'       sur une session morte (défaut Windows « le micro ne fait rien »),',
'       l\\\'orbe doit redonner un micro VIVANT. continuSet(true) est idempotent. */',
'    try { if (window.__v566Libre) window.__v566Libre.continuSet(true); } catch (e) {}'
]);

/* ═══════════════ v564 — fermer : arrêt de la session ═══════════════ */
remplacer('v564.fermer — stop de session à la fermeture (D)',
[
"  function fermer() { if (pan) pan.style.display = 'none'; taire(); }"
],
[
'  /* V3f (v570) — fermer le panneau ARRÊTE la session micro : plus de',
'     reconnaissance qui tourne « en permanence en arrière-plan » (bips',
'     système répétés constatés sur Android). L\\\'orbe la relance à la',
'     réouverture. */',
'  function fermer() {',
"    if (pan) pan.style.display = 'none';",
'    taire();',
'    try { if (window.__v566Libre && window.__v566Libre.fermerSession) window.__v566Libre.fermerSession(); } catch (e) {}',
'  }'
]);

/* ═══════════════ v566 — moteur d'écoute continue repris (E) ═══════════════ */
remplacer('v566.moteur — final-only + garde panneau + fantôme + icône (E)',
[
'  /* ── 1. écoute continue ── */',
'  function demarrerContinue() {',
'    if (!contActif() || recC) return;',
'    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;',
'    if (!SR) { toast(\'Reconnaissance vocale indisponible — écoute continue impossible\', \'error\'); return; }',
'    taire();                                   /* barre-in : le TTS se tait */',
'    recC = new SR();',
"    recC.lang = 'fr-FR'; recC.interimResults = false; recC.continuous = true;",
'    recC.onresult = function (ev) {',
"      var t = '';",
"      for (var i = 0; i < ev.results.length; i++) t += (ev.results[i][0] || {}).transcript || '';",
"      t = String(t || '').trim();",
"      if (t && window.__v564Adeodat && typeof window.__v564Adeodat.envoyer === 'function') {",
'        taire();                               /* barre-in à chaque prise */',
'        window.__v564Adeodat.envoyer(t);',
'      }',
'    };',
"    recC.onerror = function () { /* 'no-speech', 'aborted' : onend gère */ };",
'    recC.onend = function () {',
'      recC = null;',
"      if (contActif()) setTimeout(demarrerContinue, 400);   /* relance auto */",
'    };',
"    try { recC.start(); toast('🔁 Écoute continue ACTIVE — parlez naturellement', 'success'); } catch (e) {}",
'  }',
'  function arreterContinue() {',
'    if (recC) { try { recC.stop(); } catch (e) {} recC = null; }',
"    toast('Écoute continue arrêtée', 'info');",
'  }'
],
[
'  /* ── 1. écoute continue (V3f v570 — moteur repris) ──',
'     Défauts corrigés (constats utilisateur) :',
'       • ANDROID : le polyfill v53 pousse des RÉSULTATS PARTIELS — l\\\'ancien',
'         handler les envoyait chacun à Adeodat (demi-phrases en rafale).',
'         Désormais seuls les résultats FINAUX déclenchent l\\\'envoi.',
'       • ANDROID : chaque start() du recognizer joue un bip système ; la',
'         session tournant EN PERMANENCE (même panneau fermé) = bips sans',
'         fin + boucle d\\\'écho micro→TTS→micro. La session ne vit plus que',
'         panneau OUVERT, se SUSPEND quand Adeodat parle (microPause /',
'         microReprendre, pilotés par v564.envoyer) et s\\\'ARRÊTE à la',
'         fermeture du panneau (fermerSession).',
'       • WINDOWS : un start() en échec laissait recC posé — session',
'         fantôme : plus aucun démarrage possible, le clic micro « ne fait',
'         rien ». L\\\'échec est désormais signalé et la session réarmée ; le',
'         bouton micro reflète l\\\'état RÉEL (⏺ = écoute, 🎤 = silence). */',
'  var timerRelance = null;',
'  var pauseTTS = false;         /* session suspendue : Adeodat parle */',
'  var alerteMicroFaite = false; /* une seule alerte d\\\'autorisation */',
'  var RELANCE_MS = 400;         /* timer couvert par le banc v568 */',
'',
'  function panneauOuvert() {',
"    var p = document.getElementById('adeodat-pan');",
"    return !!(p && p.style.display === 'flex');",
'  }',
'  function majMicEtat() {',
"    var b = document.getElementById('adeodat-mic');",
'    if (!b) return;',
"    b.textContent = recC ? '⏺' : '🎤';",
"    b.title = recC ? 'Arrêter l\\\'écoute' : 'Parler à Adeodat';",
'  }',
'  function annulerRelance() {',
'    if (timerRelance) { clearTimeout(timerRelance); timerRelance = null; }',
'  }',
'  function tuerSession() {                    /* stoppe sans relance ni toast */',
'    annulerRelance();',
'    if (recC) { var r = recC; recC = null; try { r.onend = null; r.stop(); } catch (e) {} }',
'    majMicEtat();',
'  }',
'  function demarrerContinue(silencieux) {',
'    annulerRelance();',
'    if (!contActif() || recC || pauseTTS) return;',
'    if (!panneauOuvert()) return;      /* JAMAIS d\\\'écoute en arrière-plan */',
'    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;',
'    if (!SR) { if (!silencieux) toast(\'Reconnaissance vocale indisponible — écoute continue impossible\', \'error\'); return; }',
'    if (!silencieux) alerteMicroFaite = false;',
'    taire();                           /* barre-in : le TTS se tait */',
'    try {',
'      recC = new SR();',
"      recC.lang = 'fr-FR'; recC.interimResults = false; recC.continuous = true;",
'      recC.onresult = function (ev) {',
'        /* v570 — SEULS les résultats FINAUX déclenchent l\\\'envoi : le',
'           polyfill Android (v53) pousse des partiels en continu ; les',
'           envoyer produisait des requêtes en rafale sur des demi-phrases. */',
"        var t = '', finalVu = false, rs = ev && ev.results;",
'        for (var i = 0; rs && i < rs.length; i++) {',
'          var r = rs[i];',
"          if (r && r.isFinal) { t += (r[0] || {}).transcript || ''; finalVu = true; }",
'        }',
"        t = String(t || '').trim();",
"        if (finalVu && t && window.__v564Adeodat && typeof window.__v564Adeodat.envoyer === 'function') {",
'          taire();                     /* barre-in à chaque prise */',
'          window.__v564Adeodat.envoyer(t);   /* envoyer suspend le micro (v570) */',
'        }',
'      };',
'      recC.onerror = function (ev) {',
'        var c = ev && ev.error;',
"        if (!c || c === 'no-speech' || c === 'aborted') return;   /* onend gère */",
'        if (!alerteMicroFaite) {',
'          alerteMicroFaite = true;',
"          toast('🎙️ Micro indisponible (' + c + ') — vérifiez l\\\'autorisation', 'warn');",
'        }',
'      };',
'      recC.onend = function () {',
'        recC = null; majMicEtat();',
'        /* relance auto tant que la session est demandée (anti-stop Windows),',
'           JAMAIS hors du panneau ouvert ni pendant la pause TTS */',
'        if (contActif() && !pauseTTS && panneauOuvert()) {',
'          timerRelance = setTimeout(function () { timerRelance = null; demarrerContinue(true); }, RELANCE_MS);',
'        }',
'      };',
'      recC.start();',
"      if (!silencieux) toast('🔁 Écoute continue ACTIVE — parlez naturellement', 'success');",
'    } catch (e) {',
'      /* v570 — un échec de start laissait recC posé : session fantôme. */',
'      recC = null;',
"      if (!silencieux) toast('Micro indisponible : ' + String(e && e.message || e), 'error');",
'    }',
'    majMicEtat();',
'  }',
'  function arreterContinue(silencieux) {',
'    tuerSession();',
"    if (!silencieux) toast('Écoute continue arrêtée', 'info');",
'  }',
'  /* v570 — pilotage par v564.envoyer : suspendre pendant la réponse TTS */',
'  function microPause() { pauseTTS = true; tuerSession(); }',
'  function microReprendre() {',
'    pauseTTS = false;',
'    if (contActif() && panneauOuvert()) demarrerContinue(true);',
'    else majMicEtat();',
'  }',
'  /* v570 — piloté par v564.fermer : plus de micro en arrière-plan */',
'  function fermerSession() { pauseTTS = false; tuerSession(); }'
]);

/* ═══════════════ v566 — installerUI : opacité du toggle 🔁 à jour ═══════════════ */
remplacer('v566.installerUI — opacité 🔁 synchronisée (F)',
[
'  function installerUI() {',
'    boutonContinu();',
"    const inp = document.getElementById('adeodat-in');"
],
[
'  function installerUI() {',
'    boutonContinu();',
"    const cb = document.getElementById('adeodat-cont');",
"    if (cb) cb.style.opacity = contActif() ? '1' : '.45';   /* état à jour (v570) */",
"    const inp = document.getElementById('adeodat-in');"
]);

/* ═══════════════ v566 — exports : pause/reprise/fermeture ═══════════════ */
remplacer('v566.exports — microPause/microReprendre/fermerSession (G)',
[
'  window.__v566Libre = {',
'    continuGet: contActif,',
"    continuSet: function (on) { try { localStorage.setItem(CLE_CONT, on ? '1' : '0'); } catch (e) {} if (on) demarrerContinue(); else arreterContinue(); },",
'    ollamaGet: ollActif,',
"    ollamaSet: function (on, modele) { try { localStorage.setItem(CLE_OLL, on ? '1' : '0'); if (modele) localStorage.setItem(CLE_OLL_M, modele); } catch (e) {} },",
'    demarrerContinue: demarrerContinue, arreterContinue: arreterContinue',
'  };'
],
[
'  window.__v566Libre = {',
'    continuGet: contActif,',
'    continuSet: function (on) {',
"      try { localStorage.setItem(CLE_CONT, on ? '1' : '0'); } catch (e) {}",
'      if (on) { pauseTTS = false; demarrerContinue(); }   /* action explicite : réarme la pause TTS */',
'      else arreterContinue();',
'    },',
'    ollamaGet: ollActif,',
"    ollamaSet: function (on, modele) { try { localStorage.setItem(CLE_OLL, on ? '1' : '0'); if (modele) localStorage.setItem(CLE_OLL_M, modele); } catch (e) {} },",
'    demarrerContinue: demarrerContinue, arreterContinue: arreterContinue,',
'    /* v570 — cycle de vie du micro piloté par v564 (envoyer / ouvrir / fermer) */',
'    microPause: microPause, microReprendre: microReprendre, fermerSession: fermerSession',
'  };'
]);

/* ═══════════════ contrôles de sortie ═══════════════ */
const fin = src.replace(/\r\n/g, '\n');
const lfSeulsFin = (src.match(/(?<!\r)\n/g) || []).length;
if (lfSeulsFin > 0) { console.error('FATAL : des LF seuls ont été introduits : ' + lfSeulsFin); process.exit(1); }
for (const m of ['microReprendre', 'fermerSession', 'panneauOuvert', 'isFinal', 'alerteMicroFaite', 'RELANCE_MS', 'tuerSession', 'majMicEtat']) {
  if (src.indexOf(m) === -1) { console.error('FATAL : marqueur absent : ' + m); process.exit(1); }
}
/* fermetures des modules intacts */
for (const id of ['v564-adeodat', 'v566-adeodat-v3c', 'v565-adeodat-outils']) {
  const anchor = '<script id="' + id + '">';
  const i = src.indexOf(anchor);
  if (i === -1) { console.error('FATAL : module absent ' + id); process.exit(1); }
  const finModule = src.indexOf('</script>', i);
  const corps = src.slice(i + anchor.length, finModule);
  try { new Function(corps); } catch (e) { console.error('FATAL : syntaxe ' + id + ' : ' + e.message); process.exit(1); }
  console.log('SYNTAXE OK ' + id);
}
fs.writeFileSync(F, src, 'utf8');
console.log('ÉCRIT. Taille : ' + src.length);
