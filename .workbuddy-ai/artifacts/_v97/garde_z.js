/* v97 — GARDE STRUCTUREL DE L'EMPILEMENT.

   Le défaut que ce garde existe pour empêcher : v96 n'avait migré que trois
   panneaux sur cinq, parce que la liste des panneaux avait été écrite À LA
   MAIN dans le correctif. `#verse-mini-tip` (130000) et `#v37-tip` (129999)
   ont été oubliés. Fatih l'a vu avant nous.

   Principe : ne plus jamais énumérer. On LIT le DOM, on classe chaque élément
   de premier niveau par son z-index calculé, et on échoue si un élément de
   contenu peut passer devant une fiche de mot.

   Classement :
     - un MODAL/OVERLAY bloque l'interaction par définition : être au-dessus de
       tout est normal, on l'accepte explicitement ;
     - un élément de CONTENU au-dessus des fiches est un défaut : la fiche
       doit passer devant, sinon la lecture du mot à mot est impossible.

   Usage :
     node .workbuddy-ai/artifacts/_v97/garde_z.js            (défaut : mobile/www)
     THEO_WWW=. node .../garde_z.js                          (source à la racine)
     node .../garde_z.js --statique THEOLOGICUS.html         (sans navigateur)
*/
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');

/* `ws` n'est pas installé à côté de ce fichier : il vit dans le projet.
   On le résout depuis la racine du projet (THEO_PROJ ou le cwd), pour que ce
   garde tourne depuis n'importe où — y compris depuis son dossier de skill.
   En mode `--statique` on ne le charge pas du tout : pas de dépendance. */
const PROJ = path.resolve(process.env.THEO_PROJ || process.cwd());
function chargerWs() {
  const essais = [
    path.join(PROJ, 'node_modules', 'ws'),
    'ws'
  ];
  for (const p of essais) {
    try { return require(p); } catch (e) { /* on essaie le suivant */ }
  }
  console.error('module `ws` introuvable. Installez-le dans le projet :');
  console.error('  cd ' + PROJ + ' && npm i ws');
  process.exit(2);
}

/* ─────────── les z-index de contenu légitimement > 100000 ───────────
   Liste COURTE et motivée. Toute autre exception doit être justifiée ici,
   sinon le garde échoue — c'est le but. */
const EXCEPTIONS = {
  'atc-bubble': 'bulle d\'annotation « Ajouter au chat » : posée au-dessus des fiches pour rester atteignable pendant la sélection',
  'atc-tip': 'fiche de commentaire annoté, ouverte par la bulle : doit rester au-dessus'
};

const MODAL = /overlay|modal|scrim|warning|watermark|auth|toast|devtools|palette|popover|menu|backdrop|sidebar|notes|pal\b|v28-pal|v8-notes/i;

/* Un contenu visible, non modal, non exception, qui passe devant les fiches. */
function contenuDur2(liste, zMinFiche, PANNEAUX) {
  return (liste || []).filter(e => {
    if (e.z <= zMinFiche) return false;
    if (['hb-tip', 'gr-tip', 'lat-tip', 'qw-tip'].indexOf(e.id) >= 0) return false;
    const nom = e.id || String(e.cls || '');
    if (MODAL.test(nom)) return false;
    if (EXCEPTIONS[e.id]) return false;
    if (e.display === 'none' || e.display === 'contents' || !e.display) return false;
    return true;
  });
}

/* ─────────── mode statique : périmètre des infobulles ───────────
   Le mode navigateur est le juge ; ce mode-ci ne sert qu'en pré-commit rapide.
   Il ne classe PAS les z-index (il n'a pas le contexte du DOM et produisait
   15 faux positifs sur des modales). Il vérifie une seule chose, déterministe :
   tout élément dont l'id ou la classe évoque une infobulle de contenu doit
   tirer son z-index d'une variable de l'échelle, jamais d'un littéral.

   C'est exactement le défaut d'origine : `#verse-mini-tip{...z-index:130000}`
   et `#v37-tip{...z-index:129999}`, deux littéraux, invisibles à toute revue
   qui ne compare pas les niveaux entre eux. */
/* Motifs des éléments qui affichent du CONTENU scripturaire ou une fiche.
   On les nomme par leur rôle, pas par leur numéro de version : un `#v37-tip`
   ne dit rien, `-tip` associé à un panneau/verset/citation dit tout. */
const MOTIF_CONTENU = /-tip\b|panneau|verset|sourate|citation|bulle|fiche|-mini-tip/i;

function statique(fichier) {
  console.log('=== MODE STATIQUE : ' + fichier + ' ===');
  const txt = fs.readFileSync(fichier, 'utf8');
  const lignes = txt.split('\n');
  let fautes = 0, vus = 0;

  /* On suit la règle CSS COURANTE, sélecteur et corps séparés : le sélecteur
     peut être sur une ligne et le `z-index` sur la suivante — c'est le cas de
     `#v37-tip`, et l'ignorer rendait ce garde aveugle au défaut d'origine. */
  let sel = '', corps = [], debut = 0;
  const cloture = () => {
    if (!sel) return;
    const c = corps.join('\n');
    const m = /z-index:\s*([^;]+);/.exec(c);
    if (m && MOTIF_CONTENU.test(sel)) {
      vus++;
      const val = m[1].trim();
      if (val.indexOf('var(--z-') < 0) {
        console.log('  l.' + String(debut).padStart(6) + '  ' + sel.slice(0, 40).padEnd(42) + 'z-index:' + val + '   <<< LITTÉRAL');
        fautes++;
      }
    }
    sel = ''; corps = [];
  };
  lignes.forEach((l, i) => {
    const os = /^\s*(.+?)\s*\{/.exec(l);
    /* Un sélecteur CSS commence par # . : [ * ou une lettre, et ne contient ni
       parenthèse ni mot-clé JS. Sans ce filtre, `function afficher(version){`
       était pris pour une règle et son `z-index: 99997` remontait en faux
       positif. */
    const ressembleASelecteur = os &&
      /^[#.:*\[a-zA-Z][^()={};]*$/.test(os[1].trim()) &&
      !/\b(function|if|else|for|while|return|var|let|const|=>)\b/.test(os[1]);
    if (ressembleASelecteur) {
      cloture();
      sel = os[1].trim();
      debut = i + 1;
      /* la règle peut se terminer sur la même ligne */
      if (/\}/.test(l)) { corps.push(os[2] !== undefined ? os[2] : l); cloture(); }
      else { corps.push(l.slice(os.index + os[0].length - 1)); }
      return;
    }
    if (sel) {
      corps.push(l);
      if (/\}/.test(l)) cloture();
    }
  });

  console.log('  règles de contenu examinées : ' + vus);
  if (fautes === 0) console.log('  -> toutes passent par une variable de l\'échelle');
  else console.log('  -> ' + fautes + ' littéral(aux) : un littéral ne se compare à rien, il se fait oublier');
  return fautes === 0 ? 0 : 1;
}

if (process.argv[2] === '--statique') {
  process.exit(statique(process.argv[3] || 'THEOLOGICUS.html'));
}

const PORT = 8886, CDP = 9426;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(process.env.THEO_WWW || 'C:/Theologicus/mobile/www');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' };
const PAGE = ['index.html', 'THEOLOGICUS.html'].find(n => fs.existsSync(path.join(ROOT, n)));
if (!PAGE) { console.error('aucune page dans ' + ROOT); process.exit(1); }
const serve = () => new Promise(res => {
  const s = http.createServer((q, rp) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/' + PAGE;
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rp.writeHead(404); rp.end('404'); return; }
    rp.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(rp);
  });
  s.listen(PORT, '127.0.0.1', () => res(s));
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ech = 0;
const ok = (n, c, d) => { if (!c) ech++; console.log((c ? 'OK    ' : 'ECHEC ') + n + (d !== undefined ? '  -> ' + JSON.stringify(d) : '')); };

(async () => {
  const srv = await serve();
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'gz-'));
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + prof, '--no-first-run', '--disable-gpu', '--window-size=1200,900', 'about:blank'], { stdio: 'ignore' });
  let t = null;
  for (let i = 0; i < 60; i++) { await sleep(500); try { const l = await (await fetch('http://127.0.0.1:' + CDP + '/json/list')).json(); t = l.find(x => x.type === 'page'); if (t && t.webSocketDebuggerUrl) break; } catch (e) {} }
  const WebSocket = chargerWs();
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
  await new Promise(r => ws.on('open', r));
  let id = 0; const pend = new Map();
  ws.on('message', raw => { const m = JSON.parse(raw.toString()); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const send = (me, pa) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  const ev = async e => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return { __err: ((r.result.exceptionDetails.exception || {}).description || '').slice(0, 400) };
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  const attendre = async (expr, butMs) => { const lim = Date.now() + butMs; while (Date.now() < lim) { const v = await ev(expr); if (v === true) return true; await sleep(400); } return false; };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' + PAGE });
  await attendre(`!!document.getElementById('chat-container')`, 30000);
  await sleep(1500);
  await ev(`(()=>{ ['auth-overlay','setup-wizard-overlay','watermark-overlay','devtools-warning'].forEach(function(k){var e=document.getElementById(k); if(e)e.remove();}); return true; })()`);
  await sleep(400);

  /* on charge les corpus pour que les modules différés créent leurs éléments */
  await ev(`(async()=>{ try{ window.__loadBibleNow && window.__loadBibleNow(); }catch(e){}
    try{ window.__loadQuranNow && window.__loadQuranNow(); }catch(e){}
    try{ window.__loadTafsirNow && window.__loadTafsirNow(); }catch(e){}
    try{ await window.__ensureBibleBook('43'); }catch(e){}
    try{ await window.__ensureQuranSurah(1); }catch(e){}
    return true; })()`);
  await sleep(5000);

  /* ══ 1. INVENTAIRE : tout élément de premier niveau avec un z-index ══ */
  const liste = await ev(`(()=>{ var out=[];
    Array.prototype.forEach.call(document.body.children, function(e){
      var cs=getComputedStyle(e);
      if(cs.position==='static') return;
      var z=cs.zIndex; if(z==='auto') return;
      var zn=parseInt(z,10); if(isNaN(zn)) return;
      out.push({ id: e.id||null, cls: (typeof e.className==='string'? e.className : '')||null,
                 tag: e.tagName.toLowerCase(), z: zn, display: cs.display, pe: cs.pointerEvents });
    });
    out.sort(function(a,b){ return b.z-a.z; });
    return out; })()`);
  console.log('=== 1. empilement des enfants de <body> (z-index explicite) ===');
  (liste || []).forEach(e => console.log('  ' + String(e.z).padStart(8) + '  ' + (e.id ? '#' + e.id : '.' + String(e.cls).split(' ')[0]).padEnd(26) + 'pe=' + e.pe));

  const zFiches = (liste || []).filter(e => ['hb-tip', 'gr-tip', 'lat-tip', 'qw-tip'].indexOf(e.id) >= 0);
  ok('1. les quatre fiches de mot sont montées', zFiches.length === 4, zFiches.map(e => e.id));
  const zMinFiche = Math.min.apply(null, zFiches.map(e => e.z));
  console.log('  z-index minimal des fiches : ' + zMinFiche);

  /* ══ 2. AUCUN CONTENU AU-DESSUS DES FICHES (pendant qu'il est VISIBLE) ══
     Un élément `display:none` n'entre pas dans la peinture : le flaguer serait
     une fausse alerte. La règle qui compte est : ce qui est VISIBLE et de
     premier niveau ne doit pas passer devant une fiche de mot, sauf si c'est
     une modale (qui bloque l'interaction par définition) ou une exception
     nommée et justifiée ci-dessus. */
  const auDessus = (liste || []).filter(e => e.z > zMinFiche);
  console.log('\n=== 2. éléments au-dessus des fiches ===');
  const fautifs = [];
  const estVisible = e => e.display && e.display !== 'none' && e.display !== 'contents';
  auDessus.forEach(e => {
    const nom = e.id || String(e.cls).split(' ')[0];
    if (['hb-tip', 'gr-tip', 'lat-tip', 'qw-tip'].indexOf(e.id) >= 0) return;
    const vis = estVisible(e);
    const exception = EXCEPTIONS[e.id];
    const modal = MODAL.test(nom) || MODAL.test(String(e.cls || ''));
    let verdict;
    if (exception) verdict = 'exception';
    else if (modal) verdict = 'modal';
    else if (!vis) verdict = 'masqué au repos';
    else { verdict = '>>> CONTENU VISIBLE'; fautifs.push({ nom: nom, z: e.z, cls: e.cls }); }
    console.log('  ' + verdict.padEnd(18) + String(e.z).padStart(8) + '  ' + nom +
                (verdict === 'exception' ? '  (' + exception + ')' : ''));
  });
  ok('2. aucun contenu VISIBLE ne passe devant les fiches', fautifs.length === 0, fautifs);

  /* ══ 3. LES PANNEAUX DE VERSET SONT DANS L'ÉCHELLE ══
     Attention : trois des cinq panneaux sont créés en JS et reçoivent leur
     z-index par `style.cssText`, PAS par une feuille de style. Un contrôle
     par sélecteur ne les voit donc pas — première version de ce garde, qui
     les a déclarés « hors échelle » à tort. On lit la VALEUR EFFECTIVE sur
     l'élément vivant. */
  const PANNEAUX = ['bible-verse-tip', 'quran-verse-tip', 'tafsir-verse-tip', 'verse-mini-tip', 'v37-tip'];
  console.log('\n=== 3. panneaux de verset : empilement effectif ===');
  const etatP = await ev(`(()=>{ var out={};
    ${JSON.stringify(PANNEAUX)}.forEach(function(p){
      var e=document.getElementById(p);
      if(!e){ out[p]={ monte:false }; return; }
      var cs=getComputedStyle(e);
      out[p]={ monte:true, z:cs.zIndex, inline:e.style.zIndex||null, position:cs.position };
    });
    return out; })()`);
  const horsEchelle = [], absents = [];
  /* la valeur peut venir d'une feuille (`.v37-tip`) ou d'un `cssText` inline :
     on cherche `var(--z-` dans les DEUX, sinon on déclare « hors échelle » à
     tort quand le style est posé par une règle CSS. */
  const declareViaVar = await ev(`(()=>{ var out={};
    ${JSON.stringify(PANNEAUX)}.forEach(function(p){
      var inline='', feuille='';
      var e=document.getElementById(p);
      if(e) inline = e.style.zIndex||'';
      Array.prototype.forEach.call(document.styleSheets, function(ss){ try{
        Array.prototype.forEach.call(ss.cssRules, function(r){
          if(!r.selectorText || !r.style || !r.style.zIndex) return;
          if(r.selectorText.split(',').some(function(s){ return s.trim()==='#'+p; }))
            feuille = r.style.zIndex;
        }); }catch(err){} });
      out[p] = { inline:inline, feuille:feuille };
    });
    return out; })()`);
  PANNEAUX.forEach(p => {
    const s = (etatP || {})[p] || {};
    const d = (declareViaVar || {})[p] || {};
    if (!s.monte) { console.log('  #' + p.padEnd(18) + '(non monté au repos, créé à la demande)'); absents.push(p); return; }
    const source = d.inline || d.feuille || '';
    const dans = String(source).indexOf('var(--z-') >= 0;
    console.log('  #' + p.padEnd(18) + 'z=' + String(s.z).padStart(7) + '  déclaré=' + source +
                (d.inline ? ' (inline)' : d.feuille ? ' (feuille)' : '') + (dans ? '' : '   <<< HORS ÉCHELLE'));
    if (!dans) horsEchelle.push(p);
  });
  ok('3. chaque panneau de verset monté déclare son z-index via var(--z-*)',
     horsEchelle.length === 0, horsEchelle);
  ok('3b. les cinq panneaux de verset sont connus du DOM',
     absents.length <= 1, absents);   /* verse-mini-tip n'existe qu'à la demande */

  /* ══ 4. INVENTAIRE DES CONTENUS AU-DESSUS DES FICHES ══
     Même règle qu'en section 2 : modales acceptées, masqués ignorés, le reste
     signalé. On liste tout ce qui est au-dessus pour que la revue soit facile,
     mais seuls les contenus VISIBLES non modaux font échouer le garde. */
  console.log('\n=== 4. infobulles, panneaux et rails au-dessus des fiches ===');
  const contenuDur = contenuDur2(liste, zMinFiche, PANNEAUX);
  (liste || []).filter(e => e.z > zMinFiche).forEach(e => {
    const nom = (e.id || String(e.cls || '')).toLowerCase();
    const vis = e.display && e.display !== 'none' && e.display !== 'contents';
    const modal = MODAL.test(nom);
    console.log('  ' + (vis ? 'visible' : 'masqué ').padEnd(9) + String(e.z).padStart(8) + '  ' + (e.id || e.cls) + (modal ? '   (modal)' : ''));
  });
  ok('4. aucun contenu VISIBLE non modal ne passe devant les fiches',
     contenuDur.length === 0, contenuDur.map(e => ({ nom: e.id || e.cls, z: e.z })));

  console.log('\nECHECS = ' + ech + (ech === 0 ? '  -> EMPILEMENT CONFORME' : '  -> A CORRIGER'));
  ws.close(); ch.kill(); srv.close();
  process.exit(ech === 0 ? 0 : 1);
})().catch(e => { console.error('ERREUR GARDE:', e); process.exit(1); });
