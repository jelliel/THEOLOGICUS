/* ═══════════════════════════════════════════════════════════════════════
   Lot v574 — 4 améliorations Adeodat (demandes utilisateur du jour) :
     1. MÉMOIRE : bouton « 🧹 Nouveau sujet » + contexte 12 messages +
        compteur d'échanges (v564).
     2. QR CODE : lib qrcode-generator (MIT) embarquée + modale ; bouton
        « QR » ajouté à la bannière LAN de l'exe (app.py).
     3. SOURCES : __v574Chercher (Bible/Coran fichiers locaux, Pères via
        v167_fathers_idx, Valtorta) + injection dans v564.penser.
     4. MOT D'ÉVEIL : __v574Wake (toggle 🔔 opt-in, veille panneau fermé,
        SR navigateur sinon capture dictée via v571).
   Méthode : slices + anchors uniques (jamais String.replace avec $),
   CRLF préservé, vérification LF + syntaxe du module généré.
   ═══════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const cp = require('child_process');
const path = require('path');
const DIR = __dirname;
const F = 'C:/tmp/theoverify/THEOLOGICUS.html';
const FAPP = 'C:/tmp/theoverify/app.py';

function lignes(a) { return a.join('\r\n'); }
let src = fs.readFileSync(F, 'utf8');
if (/(?<!\r)\n/.test(src)) { console.error('LF seuls présents AVANT édition — abort'); process.exit(1); }
const tailleAv = src.length;
const LOG = [];

/* ── helpers ── */
function trouvUn(txt, anc, nom) {
  const n = txt.split(anc).length - 1;
  if (n !== 1) { console.error('ANCRAGE [' + nom + '] trouvé ' + n + ' fois (attendu 1)'); process.exit(1); }
}
function remplacer(anc, nouv, nom) {
  trouvUn(src, anc, nom);
  src = src.replace(anc, () => nouv);
  LOG.push(nom);
}
/* remplacement BORNÉ AU MODULE (id) : évite toute collision avec un
   fragment identique dans un autre module (ex. les esc() jumeaux) */
function dansModule(idMod, anc, nouv, nom) {
  const deb = src.indexOf('<script id="' + idMod + '">');
  if (deb === -1) { console.error('module ' + idMod + ' introuvable'); process.exit(1); }
  let fin = src.indexOf('<script id=', deb + 10);
  const finBody = src.indexOf('</body>', deb);
  if (fin === -1 || (finBody !== -1 && finBody < fin)) fin = finBody;
  const avant = src.slice(0, deb), milieu = src.slice(deb, fin), apres = src.slice(fin);
  trouvUn(milieu, anc, nom + ' @' + idMod);
  src = avant + milieu.replace(anc, () => nouv) + apres;
  LOG.push(nom + ' @' + idMod);
}

/* ══════════ 1. V564 — MÉMOIRE + SOURCES + CROCHETS WAKE ══════════ */
const M564 = 'v564-adeodat';

dansModule(M564,
  '  var MAX_CTX = 8;            /* messages envoyés au modèle (V3e : latence) */',
  "  var MAX_CTX = 12;           /* messages envoyés au modèle (v574 : mémoire d'échange plus longue) */",
  'MAX_CTX 12');

dansModule(M564,
  "'<div style=\"font-size:.62rem;color:var(--ui-dim,#8a8896)\">le Compagnon — V3.0</div></div>' +",
  "'<div style=\"font-size:.62rem;color:var(--ui-dim,#8a8896)\" id=\"adeodat-sous\">le Compagnon — V3.0</div></div>' +",
  'sous-titre id');

dansModule(M564,
  "      '<button id=\"adeodat-tts\" type=\"button\" title=\"Lire les réponses à voix haute\" style=\"background:none;border:none;color:inherit;cursor:pointer;font-size:15px\">🔊</button>' +",
  lignes([
    "      '<button id=\"adeodat-neuf\" type=\"button\" title=\"Nouveau sujet — efface la mémoire\" style=\"background:none;border:none;color:inherit;cursor:pointer;font-size:14px\">🧹</button>' +",
    "      '<button id=\"adeodat-tts\" type=\"button\" title=\"Lire les réponses à voix haute\" style=\"background:none;border:none;color:inherit;cursor:pointer;font-size:15px\">🔊</button>' +"]),
  'bouton 🧹');

dansModule(M564,
  "    pan.querySelector('#adeodat-env').addEventListener('click', function () {",
  lignes([
    "    pan.querySelector('#adeodat-neuf').addEventListener('click', function () {",
    "      const nAvant = lireH().length;",
    "      ecrireH([]);",
    "      taire();",
    "      const msgsN = document.getElementById('adeodat-msgs');",
    "      if (msgsN) {",
    "        msgsN.innerHTML = '';",
    "        bulle('assistant', '🕊️ Peace be with you. Nouveau sujet — la mémoire est vide.');",
    "        scrollBas();",
    "      }",
    "      majMem();",
    "      toast('🧹 Nouveau sujet — ' + nAvant + ' message(s) effacé(s)', 'success');",
    "    });",
    "    pan.querySelector('#adeodat-env').addEventListener('click', function () {"]),
  'wire 🧹');

dansModule(M564,
  '  async function envoyer(texte) {',
  lignes([
    "  /* v574 — mémoire : compteur d'échanges dans le sous-titre du panneau */",
    '  function majMem() {',
    "    const sous = document.getElementById('adeodat-sous');",
    "    if (sous) sous.textContent = 'le Compagnon — V3.0 · mémoire : ' + Math.floor(lireH().length / 2) + ' échange(s)';",
    '  }',
    '',
    '  async function envoyer(texte) {']),
  'majMem def');

dansModule(M564,
  "      ajouterH('assistant', txt);\r\n      scrollBas();",
  lignes(["      ajouterH('assistant', txt);", '      scrollBas();', '      majMem();']),
  'majMem après réponse');

dansModule(M564,
  "    const inp = document.getElementById('adeodat-in');\r\n    if (inp) inp.focus();",
  lignes(["    majMem();", "    const inp = document.getElementById('adeodat-in');", '    if (inp) inp.focus();']),
  'majMem à l\u2019ouverture');

dansModule(M564,
  '  async function penser(texteUser, onChunk) {',
  '  async function penser(texteUser, onChunk, onStatus) {',
  'penser signature');

dansModule(M564,
  lignes([
    "    msgs.push({ role: 'user', content: texteUser });",
    "    /* V3c — STREAMING : la bulle se remplit au fil de l'eau ; le calque"]),
  lignes([
    "    /* v574 — SOURCES : avant l'appel, recherche des passages pertinents dans",
    "       les corpus EMBARQUÉS (Bible Segond, Coran — fichiers locaux ; Pères —",
    "       index v167 ; Valtorta — tradition/valtorta.json). Les extraits sont",
    "       injectés comme contexte système et Adeodat est prié de les citer.",
    "       Toute erreur = pas d'injection : la réponse reste normale. */",
    "    try {",
    "      const CH = window.__v574Chercher;",
    "      if (CH && typeof CH.chercher === 'function') {",
    "        if (onStatus) onStatus('🔎 Je fouille les corpus (Bible, Coran, Pères)…');",
    "        const srcOk = await CH.chercher(texteUser, 6);",
    "        if (srcOk && srcOk.bloc) msgs.push({ role: 'system', content: srcOk.bloc });",
    "        if (onStatus) onStatus('…');",
    "      }",
    "    } catch (eSrc) {}",
    "    msgs.push({ role: 'user', content: texteUser });",
    "    /* V3c — STREAMING : la bulle se remplit au fil de l'eau ; le calque"]),
  'injection SOURCES');

dansModule(M564,
  '      const plein = await penser(texte, ttsx);',
  "      const plein = await penser(texte, ttsx, function (s) { if (bulleA) { const tx = bulleA.querySelector('.ad-tx'); if (tx) tx.textContent = s; } });",
  'envoyer → onStatus');

dansModule(M564,
  "    try { if (window.__v566Libre) window.__v566Libre.continuSet(true); } catch (e) {}\r\n  }",
  lignes([
    "    try { if (window.__v566Libre) window.__v566Libre.continuSet(true); } catch (e) {}",
    "    try { if (window.__v574Wake && window.__v574Wake.panOuvre) window.__v574Wake.panOuvre(); } catch (e) {}",
    '  }']),
  'ouvrir → panOuvre');

dansModule(M564,
  "    try { if (window.__v566Libre && window.__v566Libre.fermerSession) window.__v566Libre.fermerSession(); } catch (e) {}\r\n  }",
  lignes([
    "    try { if (window.__v566Libre && window.__v566Libre.fermerSession) window.__v566Libre.fermerSession(); } catch (e) {}",
    "    try { if (window.__v574Wake && window.__v574Wake.panFerme) window.__v574Wake.panFerme(); } catch (e) {}",
    '  }']),
  'fermer → panFerme');

/* ══════════ 2. V571 — VEILLE dans le moteur dictée ══════════ */
const M571 = 'v571-adeodat-v3g';

dansModule(M571,
  '  var dicteeDemandee = false, dicteeSuspendue = false;',
  lignes([
    '  var dicteeDemandee = false, dicteeSuspendue = false;',
    "  var veilleDemandee = false;   /* v574 — capture de VEILLE (mot d'éveil), panneau fermé */"]),
  'flag veille');

dansModule(M571,
  '        if (!dicteeDemandee || dicteeSuspendue || enCoursTranscription) return;',
  '        if ((!dicteeDemandee && !veilleDemandee) || dicteeSuspendue || enCoursTranscription) return;',
  'guard veille');

dansModule(M571,
  lignes([
    '      if (texte && window.__v564Adeodat && typeof window.__v564Adeodat.envoyer === "function") {',
    '        window.__v564Adeodat.envoyer(texte);   /* envoyer suspend la dictée (microPause) */',
    '      } else if (!texte) {']),
  lignes([
    '      if (veilleDemandee && !dicteeDemandee) {',
    "        /* v574 — VEILLE : le texte n'est PAS envoyé à Adeodat ; il est confié",
    "           au détecteur de mot d'éveil (il ouvre le panneau si le mot est entendu). */",
    '        if (window.__v574Wake && window.__v574Wake.entendre) window.__v574Wake.entendre(texte);',
    '      } else if (texte && window.__v564Adeodat && typeof window.__v564Adeodat.envoyer === "function") {',
    '        window.__v564Adeodat.envoyer(texte);   /* envoyer suspend la dictée (microPause) */',
    '      } else if (!texte) {']),
  'clorePhrase → veille');

dansModule(M571,
  '    if (dicteeDemandee && !dicteeSuspendue) capter();',
  '    if ((dicteeDemandee || veilleDemandee) && !dicteeSuspendue) capter();',
  'boucle veille');

dansModule(M571,
  lignes([
    '        dicteeArreter(true);',
    '        return false;',
    '      }',
    '      flux = await navigator.mediaDevices.getUserMedia({ audio: true });']),
  lignes([
    '        dicteeArreter(true);',
    '        veilleDemandee = false;',
    '        try { if (window.__v574Wake && window.__v574Wake.echec) window.__v574Wake.echec(); } catch (eW1) {}',
    '        return false;',
    '      }',
    '      flux = await navigator.mediaDevices.getUserMedia({ audio: true });']),
  'échec insecure → veille off');

dansModule(M571,
  lignes([
    '      dicteeArreter(true);',
    '      return false;',
    '    }',
    '  }']),
  lignes([
    '      dicteeArreter(true);',
    '      veilleDemandee = false;',
    '      try { if (window.__v574Wake && window.__v574Wake.echec) window.__v574Wake.echec(); } catch (eW2) {}',
    '      return false;',
    '    }',
    '  }']),
  'échec catch → veille off');

dansModule(M571,
  lignes([
    '  function dicteeArreter(silencieux) {',
    '    const etait = dicteeDemandee;',
    '    dicteeDemandee = false; dicteeSuspendue = false;',
    '    couperCapture();',
    '    if (etait && !silencieux) toast("🎙️ Dictée arrêtée", "info");',
    '    majV566();',
    '  }']),
  lignes([
    '  function dicteeArreter(silencieux) {',
    '    const etait = dicteeDemandee;',
    '    dicteeDemandee = false; dicteeSuspendue = false;',
    '    couperCapture();',
    '    if (etait && !silencieux) toast("🎙️ Dictée arrêtée", "info");',
    '    majV566();',
    '  }',
    '',
    "  /* v574 — VEILLE (mot d'éveil) : même moteur de capture que la dictée,",
    "     mais les transcriptions vont au détecteur v574 (jamais à envoyer) et",
    "     la veille ne vit que panneau FERMÉ (opt-in, défaut OFF). */",
    '  function veilleSet(on) {',
    '    if (on) {',
    '      if (veilleDemandee) return;',
    '      veilleDemandee = true;',
    '      capter();',
    '    } else {',
    '      if (!veilleDemandee) return;',
    '      veilleDemandee = false;',
    '      if (!dicteeDemandee) couperCapture();',
    '      majV566();',
    '    }',
    '  }']),
  'veilleSet def');

dansModule(M571,
  '    cfgTranscription: cfgTranscription, encoderWav: encoderWav\r\n  };',
  lignes([
    '    cfgTranscription: cfgTranscription, encoderWav: encoderWav,',
    "    /* v574 — VEILLE : capture de fond pilotée par v574 (mot d'éveil) */",
    '    veilleSet: veilleSet, veilleActive: function () { return veilleDemandee; }',
    '  };']),
  'exports veille');

/* ══════════ 3. NOUVEAU MODULE v574 (avant </body>) ══════════ */
const lib = fs.readFileSync(path.join(DIR, 'qrcodegen.js'), 'utf8')
  .replace(/\r?\n/g, '\r\n').replace(/\s+$/, '');
const MOD = lignes([
  '<script id="v574-adeodat-v3i">',
  '/* ═══════════════════════════════════════════════════════════════════════',
  '   v574 — ADEODAT V3i (lot de 4 améliorations demandées) :',
  '     1. MÉMOIRE — bouton « 🧹 Nouveau sujet » + contexte 12 messages +',
  '        compteur d\'échanges (édités dans v564).',
  '     2. QR CODE — window.__v574AdeodatQR : modale avec le code QR de',
  '        l\'URL HTTPS ; la bannière LAN de l\'exe (app.py) ajoute un bouton',
  '        « QR ». Lib qrcode-generator 1.4.4 (c) Kazuhiko Arase, MIT,',
  '        embarquée telle quelle ci-dessous.',
  '     3. SOURCES — window.__v574Chercher.chercher(question, n) : recherche',
  '        par mots-clés dans les corpus EMBARQUÉS (Bible Segond + Coran',
  '        français : fichiers bN/qN lus comme la concordance v530 ; Pères :',
  '        cache IndexedDB v167_fathers_idx des versets trouvés ; Valtorta :',
  '        tradition/valtorta.json citant les livres/chapitres trouvés) →',
  '        bloc « SOURCES LOCALES » injecté dans le contexte (v564.penser)',
  '        pour des réponses qui CITENT les références.',
  '     4. MOT D\'ÉVEIL — window.__v574Wake : toggle 🔔 OPT-IN (défaut OFF) ;',
  '        panneau fermé, une veille (SR navigateur, sinon capture type',
  '        dictée via v571) écoute en continu et n\'agit QUE si elle entend',
  '        « Adeodat » → ouvre le panneau. Défaut OFF : l\'invariant v570',
  '        (aucune session en arrière-plan) reste intact. ═════════════════ */',
  '(function () {',
  '  "use strict";',
  '  if (window.__v574Adeodat) return;',
  '',
  '  function toast(m, k) { try { if (typeof window.toast === "function") window.toast(m, k || "info"); } catch (e) {} }',
  '',
  '  /* ── 2. QR CODE ── */',
  '  /* --- début lib qrcode-generator (c) Kazuhiko Arase, MIT --- */',
  lib,
  '  /* --- fin lib --- */',
  '  function qrSvg(texte, cell) {',
  '    try {',
  '      const q = qrcode(0, "M");',
  '      q.addData(String(texte || ""));',
  '      q.make();',
  '      return q.createSvgTag(cell || 4, 2);',
  '    } catch (e) { return ""; }',
  '  }',
  '  function modal(url) {',
  '    try {',
  '      const ancien = document.getElementById("v574-qr-mod");',
  '      if (ancien) ancien.remove();',
  '      const m = document.createElement("div");',
  '      m.id = "v574-qr-mod";',
  '      m.style.cssText = "position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(2,6,12,.72);backdrop-filter:blur(4px)";',
  '      const box = document.createElement("div");',
  '      box.style.cssText = "width:min(340px,92vw);max-height:88vh;overflow:auto;padding:18px;text-align:center;background:var(--ui-panel,#0d1626);color:var(--ui-ink,#e8e6e0);border:1px solid var(--ui-border,#2a2a3a);border-radius:14px;box-shadow:0 18px 60px rgba(0,0,0,.6)";',
  '      const uSafe = String(url || "").replace(/&/g, "&").replace(/</g, "<");',
  '      box.innerHTML =',
  '        \'<div style="font-weight:800;color:var(--ui-accent,#e5c15a);font-size:.95rem">📱 Scanner cette adresse</div>\'' +
  '        + \'<div style="margin:12px auto;display:flex;justify-content:center;background:#fff;border-radius:10px;padding:10px;width:fit-content">\' + qrSvg(url, 4) + \'</div>\'' +
  '        + \'<div style="font:600 11px Consolas,monospace;word-break:break-all;color:#7fb4ff">\' + uSafe + \'</div>\'' +
  '        + \'<div style="font-size:.68rem;color:var(--ui-dim,#8a8896);margin-top:8px">Sur l\\\'autre appareil : appareil photo → scanner → accepter le certificat une fois (« Avancé » → « Continuer »). Le micro y fonctionnera (HTTPS).</div>\';',
  '      const bcop = document.createElement("button");',
  '      bcop.textContent = "Copier l\\\'adresse";',
  '      bcop.style.cssText = "margin:10px 6px 0;background:rgba(28,58,120,.6);color:#bfd4ff;border:1px solid rgba(79,142,247,.4);border-radius:8px;padding:6px 12px;cursor:pointer;font-weight:700";',
  '      bcop.addEventListener("click", function () {',
  '        try { navigator.clipboard.writeText(String(url || "")); toast("Adresse copiée", "success"); } catch (e2) {}',
  '      });',
  '      const bx = document.createElement("button");',
  '      bx.textContent = "✕";',
  '      bx.style.cssText = "margin:10px 0 0;background:none;color:inherit;border:1px solid var(--ui-border,#2a2a3a);border-radius:8px;padding:6px 10px;cursor:pointer";',
  '      bx.addEventListener("click", function () { m.remove(); });',
  '      const lr = document.createElement("div");',
  '      lr.appendChild(bcop); lr.appendChild(bx);',
  '      box.appendChild(lr);',
  '      m.appendChild(box);',
  '      m.addEventListener("click", function (e) { if (e.target === m) m.remove(); });',
  '      document.body.appendChild(m);',
  '    } catch (e) {}',
  '  }',
  '  window.__v574AdeodatQR = { svg: qrSvg, modal: modal };',
  '',
  '  /* ── 3. SOURCES (recherche dans les corpus embarqués) ── */',
  '  var docsB = null, docsQ = null, vltEps = null, vltProm = null;',
  '  function norm(s) {',
  '    try { return String(s || "").toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, ""); }',
  '    catch (e) { return String(s || "").toLowerCase(); }',
  '  }',
  '  const STOP = {};',
  '  ["dans","pour","avec","cela","cette","quel","quels","quelle","quelles","nous","vous","leur","leurs","etre","avoir","fait","fais","peux","veux","voudrais","pourrais","dire","parle","parler","mais","donc","alors","comme","aussi","tres","rien","tout","tous","plus","moins","bien","vers","ceux","celle","celui","suis","etais"].forEach(function (w) { STOP[w] = 1; });',
  '  function mots(texte) {',
  '    const out = [], vus = {};',
  '    norm(texte).split(/[^a-z0-9]+/).forEach(function (w) {',
  '      if (w.length >= 4 && !STOP[w] && !vus[w]) { vus[w] = 1; out.push(w); }',
  '    });',
  '    return out.slice(0, 5);',
  '  }',
  '  function parseFichier(t) {',
  '    const ancre = t.indexOf("||{})["); let pos = -1;',
  '    if (ancre >= 0) pos = t.indexOf("=", ancre);',
  '    if (pos < 0) pos = t.lastIndexOf("=");',
  '    return JSON.parse(t.slice(pos + 1).replace(/;\\s*$/, ""));',
  '  }',
  '  async function chargerCorpus(meta) {',
  '    const docs = [];',
  '    await new Promise(function (fini) {',
  '      let restant = meta.n;',
  '      for (let i = 1; i <= meta.n; i++) {',
  '        (function (i) {',
  '          fetch(meta.src(i)).then(function (r) { return r.ok ? r.text() : null; }).then(function (t) {',
  '            if (t) {',
  '              try {',
  '                const j = parseFichier(t);',
  '                if (meta.id === "bible") {',
  '                  Object.keys(j).forEach(function (c) {',
  '                    const ch = j[c]; if (!ch || typeof ch !== "object") return;',
  '                    Object.keys(ch).forEach(function (v) { if (typeof ch[v] === "string") docs.push({ b: i, ref: i + ":" + c + ":" + v, texte: ch[v] }); });',
  '                  });',
  '                } else {',
  '                  Object.keys(j.versets || {}).forEach(function (v) {',
  '                    const d = j.versets[v] || {};',
  '                    if (typeof d.text === "string") docs.push({ b: i, ref: (j.nomPhon || ("Sourate " + i)) + " " + v, texte: d.text });',
  '                  });',
  '                }',
  '              } catch (e) {}',
  '            }',
  '          }).catch(function () {}).then(function () { if (--restant === 0) fini(); });',
  '        })(i);',
  '      }',
  '    });',
  '    return docs;',
  '  }',
  '  const BIBLE_META = { id: "bible", n: 66, src: function (i) { return "bible/b" + i + ".js"; } };',
  '  const CORAN_META = { id: "coran", n: 114, src: function (i) { return "quran/q" + i + ".js"; } };',
  '  async function assurerBible() { if (!docsB) docsB = await chargerCorpus(BIBLE_META); return docsB; }',
  '  async function assurerCoran() { if (!docsQ) docsQ = await chargerCorpus(CORAN_META); return docsQ; }',
  '  async function assurerValtorta() {',
  '    if (vltEps) return vltEps;',
  '    if (!vltProm) {',
  '      vltProm = fetch("tradition/valtorta.json", { cache: "no-store" })',
  '        .then(function (r) { return r.ok ? r.json() : null; })',
  '        .then(function (j) { vltEps = (j && j.episodes) || []; return vltEps; })',
  '        .catch(function () { vltEps = []; return vltEps; });',
  '    }',
  '    return vltProm;',
  '  }',
  '  async function peresPour(refs) {',
  '    const out = [], vusW = {};',
  '    try {',
  '      if (typeof db === "undefined" || !db.get) return out;',
  '      const r = await db.get("app_config", "v167_fathers_idx");',
  '      const idx = (r && r.idx) || null;',
  '      if (!idx) return out;',
  '      for (let i = 0; i < refs.length && out.length < 3; i++) {',
  '        const l = idx[refs[i]] || [];',
  '        for (let k = 0; k < l.length && out.length < 3; k++) {',
  '          const e = l[k];',
  '          if (vusW[e.w]) continue;',
  '          vusW[e.w] = 1;',
  '          let titre = e.w;',
  '          try { const meta = (window.__fathersIndex || {})[e.w]; if (meta && meta.t) titre = meta.t; } catch (e2) {}',
  '          out.push({ auteur: titre, texte: String(e.sn || "").slice(0, 220) });',
  '        }',
  '      }',
  '    } catch (e) {}',
  '    return out;',
  '  }',
  '  async function chercher(texte, nMax) {',
  '    nMax = nMax || 6;',
  '    const kws = mots(texte);',
  '    if (!kws.length) return null;',
  '    const extraits = [];',
  '    try {',
  '      const lots = await Promise.all([assurerBible().catch(function () { return []; }), assurerCoran().catch(function () { return []; })]);',
  '      const tous = lots[0].concat(lots[1]);',
  '      const scores = [];',
  '      for (let i = 0; i < tous.length; i++) {',
  '        const d = tous[i], n = norm(d.texte);',
  '        let score = 0, dist = 0;',
  '        for (let k = 0; k < kws.length; k++) {',
  '          let c = 0, p = 0;',
  '          while ((p = n.indexOf(kws[k], p)) >= 0) { c++; p += kws[k].length; }',
  '          if (c) { dist++; score += c * (kws[k].length >= 6 ? 2 : 1); }',
  '        }',
  '        if (dist) scores.push({ d: d, s: score + dist * 10 });',
  '      }',
  '      scores.sort(function (a, b) { return b.s - a.s; });',
  '      const vus = {};',
  '      for (let i = 0; i < scores.length && extraits.length < nMax; i++) {',
  '        if (vus[scores[i].d.ref]) continue;',
  '        vus[scores[i].d.ref] = 1;',
  '        extraits.push(scores[i].d);',
  '      }',
  '    } catch (e) {}',
  '    let peres = [];',
  '    try {',
  '      const refsB = [];',
  '      extraits.forEach(function (x) { if (/^\\d+:\\d+:\\d+$/.test(x.ref)) refsB.push(x.ref); });',
  '      peres = await peresPour(refsB.slice(0, 4));',
  '    } catch (e) {}',
  '    let vlt = [];',
  '    try {',
  '      const eps = await assurerValtorta();',
  '      if (eps && eps.length) {',
  '        const bc = {};',
  '        extraits.forEach(function (x) { const m = /^(\\d+):(\\d+):/.exec(x.ref); if (m) bc[m[1] + ":" + m[2]] = 1; });',
  '        for (let i = 0; i < eps.length && vlt.length < 2; i++) {',
  '          const c = eps[i] && (eps[i].cit || (eps[i].refs && eps[i].refs.cit));',
  '          if (c && c.b && bc[c.b + ":" + c.c]) vlt.push(eps[i]);',
  '        }',
  '      }',
  '    } catch (e) {}',
  '    if (!extraits.length && !peres.length && !vlt.length) return null;',
  '    const lignesR = [];',
  '    extraits.forEach(function (x) {',
  '      if (/^\\d+:\\d+:\\d+$/.test(x.ref)) lignesR.push("- Bible (Segond) " + x.ref + " : « " + String(x.texte).slice(0, 260) + " »");',
  '      else lignesR.push("- Coran — " + x.ref + " : « " + String(x.texte).slice(0, 260) + " »");',
  '    });',
  "    peres.forEach(function (p) { lignesR.push(\"- Pères de l'Église — \" + p.auteur + \" : « \" + p.texte + \" »\"); });",
  "    vlt.forEach(function (ep) {",
  '      const c = ep.cit || (ep.refs && ep.refs.cit);',
  '      const titre = ep.t || ep.titre || ep.title || "";',
  "      lignesR.push(\"- Maria Valtorta — L'Évangile tel qu'il m'a été révélé\" + (titre ? \", « \" + titre + \" »\" : \"\") + (c && c.raw ? \" [\" + c.raw + \"]\" : \"\"));",
  '    });',
  '    return {',
  '      extraits: extraits, peres: peres, vlt: vlt,',
  '      bloc: "SOURCES LOCALES TROUVÉES DANS LES CORPUS EMBARQUÉS DE THEOLOGICUS (utilise-les si elles sont pertinentes et cite leurs références entre parenthèses, par ex. (Jn 3:16)) :\\n" + lignesR.join("\\n")',
  '    };',
  '  }',
  '  window.__v574Chercher = { chercher: chercher, mots: mots };',
  '',
  "  /* ── 4. MOT D'ÉVEIL (opt-in, défaut OFF) ── */",
  '  const CLE_WAKE = "theo_adeodat_wake";',
  '  function wakeActif() { try { return localStorage.getItem(CLE_WAKE) === "1"; } catch (e) { return false; } }',
  '  let veilleRec = null, veilleArme = false, veilleTimer = null;',
  '  function panneauOuvert() {',
  '    const p = document.getElementById("adeodat-pan");',
  '    return !!(p && p.style.display === "flex");',
  '  }',
  '  function orbeVeille(on) {',
  '    try { const o = document.getElementById("adeodat-orbe"); if (o) o.classList[on ? "add" : "remove"]("veille"); } catch (e) {}',
  '  }',
  '  function entend(texte) {',
  '    const t = norm(texte);',
  '    if (!/(^|[^a-z])a\\s?deodat/.test(t)) return false;',
  '    try { if (window.__v564Adeodat && window.__v564Adeodat.taire) window.__v564Adeodat.taire(); } catch (e) {}',
  '    veilleStop();',
  '    toast("🕊️ Mot d\\\'éveil entendu — Adeodat ouvre", "success");',
  '    try { if (window.__v564Adeodat && window.__v564Adeodat.ouvrir) window.__v564Adeodat.ouvrir(); } catch (e2) {}',
  '    return true;',
  '  }',
  '  function veilleStop() {',
  '    veilleArme = false;',
  '    if (veilleTimer) { clearTimeout(veilleTimer); veilleTimer = null; }',
  '    if (veilleRec) { const r = veilleRec; veilleRec = null; try { r.onend = null; r.stop(); } catch (e) {} }',
  '    try { if (window.__v571Adeodat && window.__v571Adeodat.veilleSet) window.__v571Adeodat.veilleSet(false); } catch (e2) {}',
  '    orbeVeille(false);',
  '  }',
  '  function relanceVeille() {',
  '    if (!veilleArme || !wakeActif() || panneauOuvert()) return;',
  '    veilleTimer = setTimeout(function () { veilleTimer = null; if (veilleArme && wakeActif() && !panneauOuvert()) demarrer(); }, 600);',
  '  }',
  '  function veilleSR() {',
  '    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;',
  '    if (!SR) return false;',
  '    try {',
  '      veilleRec = new SR();',
  '      veilleRec.lang = "fr-FR"; veilleRec.interimResults = false; veilleRec.continuous = true;',
  '      veilleRec.onresult = function (ev) {',
  '        let t = "", finalVu = false, rs = ev && ev.results;',
  '        for (let i = 0; rs && i < rs.length; i++) { const r = rs[i]; if (r && r.isFinal) { t += (r[0] || {}).transcript || ""; finalVu = true; } }',
  '        if (finalVu && t) entend(t);',
  '      };',
  '      veilleRec.onerror = function (ev) {',
  '        const c = ev && ev.error;',
  '        if (!c || c === "no-speech" || c === "aborted") return;',
  '        if (c === "network" || c === "service-not-allowed" || c === "audio-capture") {',
  '          veilleRec = null;',
  '          if (!veilleDict()) relanceVeille();',
  '          return;',
  '        }',
  '        relanceVeille();',
  '      };',
  '      veilleRec.onend = function () { veilleRec = null; relanceVeille(); };',
  '      veilleRec.start();',
  '      return true;',
  '    } catch (e) { veilleRec = null; return false; }',
  '  }',
  '  function veilleDict() {',
  '    try {',
  '      if (window.__v571Adeodat && window.__v571Adeodat.veilleSet) {',
  '        window.__v571Adeodat.veilleSet(true);',
  '        return !!window.__v571Adeodat.veilleActive();',
  '      }',
  '    } catch (e) {}',
  '    return false;',
  '  }',
  '  function demarrer() {',
  '    if (!wakeActif() || panneauOuvert() || veilleRec) return;',
  '    veilleArme = true;',
  '    orbeVeille(true);',
  '    if (!veilleSR()) { if (!veilleDict()) orbeVeille(false); }',
  '  }',
  '  function panFerme() {',
  '    if (!wakeActif()) return;',
  '    if (veilleTimer) { clearTimeout(veilleTimer); veilleTimer = null; }',
  '    veilleTimer = setTimeout(function () { veilleTimer = null; demarrer(); }, 700);',
  '  }',
  '  function panOuvre() { veilleStop(); }',
  '  function echec() { veilleArme = false; orbeVeille(false); }',
  '  function basculer(on) {',
  '    try { localStorage.setItem(CLE_WAKE, on ? "1" : "0"); } catch (e) {}',
  '    if (on) { if (!panneauOuvert()) panFerme(); }',
  '    else veilleStop();',
  '  }',
  '  window.__v574Wake = {',
  '    wakeActif: wakeActif, basculer: basculer, entend: entend,',
  '    panFerme: panFerme, panOuvre: panOuvre, echec: echec,',
  '    veilleActive: function () { return !!(veilleRec || veilleArme || (window.__v571Adeodat && window.__v571Adeodat.veilleActive && window.__v571Adeodat.veilleActive())); }',
  '  };',
  '  try {',
  '    const cssW = document.createElement("style");',
  '    cssW.id = "v574-veille-css";',
  '    cssW.textContent = "#adeodat-orbe.veille{animation:ad-veille 2.4s ease-in-out infinite}@keyframes ad-veille{0%,100%{box-shadow:0 8px 24px rgba(0,0,0,.5)}50%{box-shadow:0 0 0 10px rgba(229,193,90,.16)}}";',
  '    document.head.appendChild(cssW);',
  '  } catch (e) {}',
  '  function installerUI() {',
  '    if (document.getElementById("adeodat-wake")) return;',
  '    const tts = document.getElementById("adeodat-tts");',
  '    if (!tts) return;',
  '    const b = document.createElement("button");',
  '    b.type = "button"; b.id = "adeodat-wake";',
  "    b.title = \"Mot d'éveil (opt-in) — dites « Adeodat » quand le panneau est fermé ; le micro écoute alors en arrière-plan\";",
  '    b.style.cssText = "background:none;border:none;color:inherit;cursor:pointer;font-size:14px";',
  '    b.textContent = "🔔";',
  '    b.style.opacity = wakeActif() ? "1" : ".45";',
  '    b.addEventListener("click", function () {',
  '      const on = !wakeActif();',
  '      basculer(on);',
  '      b.style.opacity = on ? "1" : ".45";',
  '      toast(on ? "🔔 Mot d\\\'éveil armé — dites « Adeodat », panneau fermé" : "🔔 Mot d\\\'éveil désactivé — plus rien en arrière-plan", on ? "success" : "info");',
  '    });',
  '    tts.parentNode.insertBefore(b, tts);',
  '  }',
  '  function init() { installerUI(); }',
  '  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);',
  '  else init();',
  '  setTimeout(init, 1700);',
  '  try {',
  '    const obsW = new MutationObserver(function () { installerUI(); });',
  '    obsW.observe(document.body, { childList: true });',
  '  } catch (e) {}',
  '})();',
  '',
  '</script>',
  ''
]);

/* insertion avant le DERNIER </body> */
const idxB = src.lastIndexOf('</body>');
if (idxB === -1) { console.error('</body> introuvable'); process.exit(1); }
src = src.slice(0, idxB) + MOD + src.slice(idxB);
LOG.push('module v574 inséré');

/* ══════════ 4. APP.PY — bouton QR dans la bannière ══════════ */
let app = fs.readFileSync(FAPP, 'utf8');
if (/(?<!\r)\n/.test(app)) { console.error('app.py : LF seuls présents — abort'); process.exit(1); }
if (app.indexOf('window.__v574AdeodatQR') !== -1) {
  LOG.push('app.py : bouton QR DÉJÀ présent (idempotent)');
} else {
  const ancB = lignes(["      bar.appendChild(copy);", "      var close = document.createElement('button');"]);
  const nouvB = lignes([
    "      bar.appendChild(copy);",
    "      var qrb = document.createElement('button');",
    "      qrb.textContent = 'QR';",
    "      qrb.title = 'Code QR de cette adresse (a scanner avec l autre appareil)';",
    "      qrb.style.cssText = 'background:rgba(28,58,120,.6);color:#bfd4ff;border:1px solid rgba(79,142,247,.4);border-radius:8px;padding:4px 9px;font:700 11px Consolas,monospace;cursor:pointer';",
    "      qrb.addEventListener('click', function(){",
    "        if (window.__v574AdeodatQR && window.__v574AdeodatQR.modal) window.__v574AdeodatQR.modal(lan);",
    "      });",
    "      bar.appendChild(qrb);",
    "      var close = document.createElement('button');"]);
  const nApp = app.split(ancB).length - 1;
  if (nApp !== 1) { console.error('app.py : ancre bannière trouvé ' + nApp + ' fois'); process.exit(1); }
  app = app.replace(ancB, () => nouvB);
  fs.writeFileSync(FAPP, app, 'utf8');
  LOG.push('app.py bouton QR');
}

/* ══════════ vérifications finales ══════════ */
if (/(?<!\r)\n/.test(src)) { console.error('LF seuls INTRODUITS — abort (aucune écriture)'); process.exit(1); }
if (src.length <= tailleAv) { console.error('fichier non grossi — abort'); process.exit(1); }
/* vérification syntaxique résiliente : le sandbox refuse parfois tout
   spawn d'exe depuis node (EBUSY) → dans ce cas on DIFFÈRE au Bash
   (l'étape suivante lance node --check sur les extraits avant les bancs) */
const NODE_SYS = 'C:/Program Files/nodejs/node.exe';
const DIFFERES = [];
function checkSyn(fichier) {
  try { cp.execFileSync(process.execPath, ['--check', fichier]); return; }
  catch (e1) {
    try { if (fs.existsSync(NODE_SYS)) { cp.execFileSync(NODE_SYS, ['--check', fichier]); return; } } catch (e2) {}
    if (e1 && e1.code === 'EBUSY' || (e2 && e2.code === 'EBUSY')) { DIFFERES.push(fichier); return; }
    throw e1;
  }
}
/* syntaxe du module généré */
const dM = src.indexOf('<script id="v574-adeodat-v3i">');
const fM = src.indexOf('</script>', dM);
const corps = src.slice(dM + '<script id="v574-adeodat-v3i">'.length, fM);
fs.writeFileSync(path.join(DIR, 'module_extrait_574.js'), corps, 'utf8');
checkSyn(path.join(DIR, 'module_extrait_574.js'));
/* les modules édités restent syntaxiquement valides */
for (const idm of [M564, M571]) {
  const tag = '<script id="' + idm + '">';
  const d1 = src.indexOf(tag) + tag.length;
  const f1 = src.indexOf('</script>', d1);
  const tmp = path.join(DIR, 'mod_check.js');
  fs.writeFileSync(tmp, src.slice(d1, f1), 'utf8');
  checkSyn(tmp);
}
fs.writeFileSync(F, src, 'utf8');
console.log('ÉDITIONS APPLIQUÉES (' + LOG.length + ') :');
LOG.forEach(l => console.log('  ✓ ' + l));
if (DIFFERES.length) console.log('CHECKS DIFFÉRÉS AU BASH (EBUSY) : ' + DIFFERES.join(', '));
console.log('Taille : ' + tailleAv + ' -> ' + src.length + ' (+' + (src.length - tailleAv) + ')');
