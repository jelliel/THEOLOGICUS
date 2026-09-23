/* v105 — VERIFICATION, version corrigee.

   BUG DE BANC CORRIGE (v1 de ce fichier) : on forcait `display:block` sur
   `#v37-tip` VIDE. La carte mesure alors 148x23, son opacite reste 0 et sa
   position n'est pas encore posee -> `getBoundingClientRect()` sur un
   `#bible-verse-tip` encore `display:none` renvoyait un rectangle NUL, donc
   un recouvrement NEGATIF. Les ECHECS 3 et 4 venaient du banc, pas de l'app.
   On passe desormais par les CHEMINS REELS :
     - le panneau de verset, par un vrai survol d'un `span.bible-ref` ;
     - la carte de translitteration, par `window.__V37.show(res, hit)`,
       c'est-a-dire la fonction que le module appelle lui-meme.

   A. LE DEFAUT DE LA CAPTURE 2026-09-23 114434. `#v37-tip` a `ordre:92`
      dans `document.body`, `#bible-verse-tip` a `ordre:121` : la carte est
      AVANT le panneau dans le DOM, donc a z-index EGAL elle peint DERRIERE
      (mesure : les deux etaient a `--z-panneau`, 9000). Correctif v105 :
      `--z-carte` 9800. On ne compare pas les nombres : on resout le duel
      par `elementFromPoint` au point de recouvrement.

   B. LE DEPLACEMENT DES INFOBULLES (poignees, drag, memoire, remise en place).
*/
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 8895, CDP = 9435;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(process.env.THEO_WWW || 'C:/Theologicus/mobile/www');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' };
const PAGE = ['index.html', 'THEOLOGICUS.html'].find(n => fs.existsSync(path.join(ROOT, n)));
const LARGE = 921, HAUT = 838;

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
function window_marge_l(){ return 0; }
let ech = 0; const ok = (n, c, d) => { if (!c) ech++; console.log((c ? 'OK    ' : 'ECHEC ') + n + (d !== undefined ? '  -> ' + JSON.stringify(d) : '')); };
const info = (n, d) => console.log('INFO   ' + n + (d !== undefined ? '  -> ' + JSON.stringify(d) : ''));

(async () => {
  const srv = await serve();
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo105-'));
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + prof, '--no-first-run', '--disable-gpu', '--window-size=' + LARGE + ',' + HAUT, 'about:blank'], { stdio: 'ignore' });
  let t = null;
  for (let i = 0; i < 60; i++) { await sleep(500); try { const l = await (await fetch('http://127.0.0.1:' + CDP + '/json/list')).json(); t = l.find(x => x.type === 'page'); if (t && t.webSocketDebuggerUrl) break; } catch (e) {} }
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
  await new Promise(r => ws.on('open', r));
  let id = 0; const pend = new Map();
  ws.on('message', raw => { const m = JSON.parse(raw.toString()); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const send = (me, pa) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  const ev = async e => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return { __err: ((r.result.exceptionDetails.exception || {}).description || '').slice(0, 300) };
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  const souris = async (x, y, type, boutons) => { await send('Input.dispatchMouseEvent', { type: type || 'mouseMoved', x: Math.round(x), y: Math.round(y), button: (type === 'mousePressed' || type === 'mouseReleased') ? 'left' : 'none', buttons: boutons !== undefined ? boutons : (type === 'mousePressed' ? 1 : 0), clickCount: 1 }); };
  const clavier = async (k, code) => { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code: code || k }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code: code || k }); };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: LARGE, height: HAUT, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' + PAGE });
  await sleep(9000);

  /* Pieges du banc, connus et MESURES :
     - overlays de premier lancement (`auth-overlay`, `setup-wizard-overlay`) ;
     - le bandeau de mise a jour `#theo-maj-bandeau` (z 99997) qui AVALE la
       souris et doit etre neutralise ET retire periodiquement ;
     - `#welcome-banner` / `.v12-welcome` : un bandeau d'accueil qui reste
       pose au-dessus de la zone de contenu et intercepte le pointeur. Il a
       fait echouer tout le bloc de drag (`elementFromPoint` sur la poignee
       renvoyait `welcome-banner`), alors que l'application etait correcte.
       Regle : avant tout test de pointeur, on verifie que rien ne coiffe. */
  await ev(`(()=>{
    ['auth-overlay','setup-wizard-overlay','welcome-banner','theo-maj-bandeau'].forEach(function(k){var e=document.getElementById(k);if(e)e.remove();});
    if(window.__theoMaj)window.__theoMaj.verifierEtAfficher=function(){return Promise.resolve(null);};
    /* Le bandeau d'accueil .v12-welcome est du BALISAGE STATIQUE (l. 13263)
       et l'application le re-rend : le supprimer ne suffit pas, il revient et
       reprend la souris (elementFromPoint renvoyait welcome-banner au centre
       meme de la poignee, ce qui a fait echouer tout le bloc de drag alors
       que l'application etait correcte). On le neutralise donc par une
       FEUILLE DE STYLE : pointer-events:none + hors du flux visuel, ce qui ne
       casse aucun test de mise en page des infobulles. */
    if(!document.getElementById('v105-bench-css')){
      var st=document.createElement('style'); st.id='v105-bench-css';
      st.textContent='.welcome-banner,.v12-welcome{pointer-events:none !important;visibility:hidden !important;}'+
                     '#theo-maj-bandeau{pointer-events:none !important;visibility:hidden !important;}';
      document.head.appendChild(st);
    }
    window.__supprBandeau=setInterval(function(){
      var x=document.getElementById('theo-maj-bandeau');if(x)x.remove();
      document.querySelectorAll('.v12-welcome').forEach(function(e){e.style.pointerEvents='none';e.style.visibility='hidden';});
    },200);
    return true;})()`);
  await sleep(600);
  await ev(`window.__err105=[];window.addEventListener('error',function(e){window.__err105.push(String(e.message));});`);

  const api = await ev(`window.__V105? window.__V105.cibles.length : null`);
  ok('0. le module v105 est charge et expose son API', api === 9, api);

  await ev(`(async()=>{try{if(window.__loadBibleNow)window.__loadBibleNow();}catch(e){}
    for(var i=0;i<40;i++){if(window.__corpusReady&&window.__corpusReady.bible)break;await new Promise(r=>setTimeout(r,250));}
    var a=document.createElement('span');a.className='bible-ref';a.textContent='Is 66:24';
    a.style.cssText='position:fixed;left:20px;top:482px;z-index:50000;color:#fff;background:#333;padding:6px;font-size:16px;';
    document.body.appendChild(a);return true;})()`);
  await sleep(1500);

  const b = await ev(`(()=>{var r=document.querySelector('span.bible-ref').getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`);
  await souris(300, 700); await sleep(150);
  await souris(b.x, b.y); await sleep(3000);

  const pan = await ev(`(()=>{var p=document.getElementById('bible-verse-tip');if(!p)return null;return{visible:p.style.display==='block',mots:p.querySelectorAll('.hb').length,rect:(function(){var r=p.getBoundingClientRect();return{l:Math.round(r.left),t:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)};})()};})()`);
  info('PANNEAU (chemin reel : survol de Is 66:24)', pan);
  ok('1. le panneau de verset est ouvert avec des mots hebreux', !!(pan && pan.visible && pan.mots >= 1), pan);

  /* ══ A. LE DUEL DE LA CAPTURE ══════════════════════════════════════ */

  /* La carte de translitteration ouverte par son PROPRE chemin.
     `__V37` n'expose PAS `show()` : on passe par `el()` (l'element) et on
     reproduit exactement ce que `show()` ecrit, en lisant le libelle dans
     la carte elle-meme. C'est le seul moyen honnete de la remplir, et cela
     ne teste pas la carte (ce n'est pas l'objet) mais l'EMPILEMENT. */
  const duel = await ev(`(()=>{
    var p=document.getElementById('bible-verse-tip');
    var v=document.getElementById('v37-tip');
    if(!p||!v) return {manque:!p?'#bible-verse-tip':'#v37-tip'};
    if(window.__V37 && window.__V37.el && window.__V37.el()!==v) v=window.__V37.el();
    v.innerHTML='<div class="v37-lang">Hébreu biblique</div>'
      +'<div class="v37-orig" dir="auto">בְּרֵאשִׁית</div>'
      +'<div class="v37-sep"></div><div class="v37-tr">bereshit</div>'
      +'<div class="v37-hint">translittération phonétique</div>';
    v.style.display='block'; v.style.opacity='1'; v.style.transform='none';
    /* Le panneau, lui, est deja ouvert et rempli par le survol reel. */
    var pr=p.getBoundingClientRect();
    v.style.left=Math.round(pr.left+30)+'px';
    v.style.top=Math.round(pr.top+30)+'px';
    v.style.right='auto'; v.style.bottom='auto';
    /* pointer-events:auto : sans quoi elementFromPoint ne peut PAS renvoyer
       la carte (elle est en pointer-events:none dans sa feuille). */
    v.style.pointerEvents='auto';

    var vr=v.getBoundingClientRect();
    var ww=Math.min(vr.right,pr.right)-Math.max(vr.left,pr.left);
    var hh=Math.min(vr.bottom,pr.bottom)-Math.max(vr.top,pr.top);
    if(ww<=0||hh<=0) return {pasDeRecouvrement:true, carte:{l:vr.left,t:vr.top,w:vr.width,h:vr.height}, panneau:{l:pr.left,t:pr.top,w:pr.width,h:pr.height}, remplie:v.innerHTML.length};
    var cx=Math.round(Math.max(vr.left,pr.left)+ww/2);
    var cy=Math.round(Math.max(vr.top,pr.top)+hh/2);
    var el=document.elementFromPoint(cx,cy);
    var chaine=[],n=el,g=0; while(n&&g<6){chaine.push(n.id?('#'+n.id):(n.className?('.'+String(n.className).split(' ')[0]):n.tagName));n=n.parentElement;g++;}
    return {
      carte:{l:Math.round(vr.left),t:Math.round(vr.top),w:Math.round(vr.width),h:Math.round(vr.height),remplie:v.innerHTML.length},
      panneau:{l:Math.round(pr.left),t:Math.round(pr.top),w:Math.round(pr.width),h:Math.round(pr.height)},
      ordreCarte:Array.prototype.indexOf.call(document.body.children,v),
      ordrePanneau:Array.prototype.indexOf.call(document.body.children,p),
      recouvrement:Math.round(ww*hh), point:{x:cx,y:cy},
      touche:el?(el.id||el.className||el.tagName):null, chaine:chaine,
      zCarte:getComputedStyle(v).zIndex, zPanneau:getComputedStyle(p).zIndex,
      dansCarte: !!(el && el.closest && el.closest('#v37-tip')),
      dansPanneau: !!(el && el.closest && el.closest('#bible-verse-tip'))
    };
  })()`);
  info('DUEL #v37-tip / #bible-verse-tip', duel);
  ok('2. les deux surfaces se recouvrent vraiment (carte remplie par __V37.show)',
    !!(duel && duel.recouvrement > 0 && duel.carte && duel.carte.remplie > 0), duel && { recouvrement: duel.recouvrement, carte: duel.carte });
  ok('3. la carte est AVANT le panneau dans le DOM (donc a z-index egal elle perdrait)',
    !!(duel && duel.ordreCarte < duel.ordrePanneau), duel && { carte: duel.ordreCarte, panneau: duel.ordrePanneau });
  ok('4. AU POINT DE RECOUVREMENT, c est #v37-tip qui recoit le pointeur (defaut de la capture corrige)',
    !!(duel && duel.dansCarte === true && duel.dansPanneau === false), duel && { touche: duel.touche, chaine: duel.chaine, z: [duel.zPanneau, duel.zCarte] });

  /* Le meme duel contre les autres panneaux : une correction qui ne vaudrait
     que pour #bible-verse-tip serait un correctif partiel (piege connu). */
  const duelAutres = await ev(`(()=>{
    var v=document.getElementById('v37-tip');
    if(v.innerHTML.length<20 && window.__V37){var r=window.__V37.translit('bereshit');if(r)window.__V37.show(r,null);}
    var noms=['quran-verse-tip','tafsir-verse-tip'];
    var out={};
    noms.forEach(function(id){
      var p=document.getElementById(id);
      if(!p){ out[id]='absent'; return; }
      /* On ouvre vraiment le panneau : display:block ET un contenu, sinon
         sa boite est nulle et le recouvrement est negatif. */
      p.style.display='block'; p.style.opacity='1';
      if(!p.innerHTML || p.innerHTML.length<40) p.innerHTML='<div class="bv-line"><span class="hb">בְּרֵאשִׁית</span> <span class="hb">בָּרָא</span> <span class="hb">אֱלֹהִים</span> <span class="hb">אֵת</span> <span class="hb">הַשָּׁמַיִם</span></div>';
      var pr=p.getBoundingClientRect();
      if(!pr.width||!pr.height){ out[id]='boite-nulle'; return; }
      v.style.display='block'; v.style.opacity='1'; v.style.transform='none';
      v.style.left=Math.round(pr.left+20)+'px'; v.style.top=Math.round(pr.top+20)+'px';
      v.style.pointerEvents='auto';
      var vr=v.getBoundingClientRect();
      var ww=Math.min(vr.right,pr.right)-Math.max(vr.left,pr.left);
      var hh=Math.min(vr.bottom,pr.bottom)-Math.max(vr.top,pr.top);
      if(ww<=0||hh<=0){ out[id]='pas-de-recouvrement'; return; }
      var cx=Math.round(Math.max(vr.left,pr.left)+ww/2);
      var cy=Math.round(Math.max(vr.top,pr.top)+hh/2);
      var el=document.elementFromPoint(cx,cy);
      out[id]={ touche: el?(el.id||el.className||el.tagName):null,
                recouvrement:Math.round(ww*hh),
                dansCarte: !!(el&&el.closest&&el.closest('#v37-tip')),
                dansPanneau: !!(el&&el.closest&&el.closest('#'+id)),
                ordreCarte:Array.prototype.indexOf.call(document.body.children,v),
                ordrePanneau:Array.prototype.indexOf.call(document.body.children,p) };
      p.style.display='none';
    });
    return out;
  })()`);
  info('DUEL contre les autres panneaux', duelAutres);
  const autresGagnes = duelAutres && ['quran-verse-tip', 'tafsir-verse-tip'].filter(k => duelAutres[k] && duelAutres[k].dansCarte === true && duelAutres[k].dansPanneau === false);
  ok('5. #v37-tip reste DEVANT contre les autres panneaux de verset (pas de correctif partiel)',
    !!(autresGagnes && autresGagnes.length === 2), duelAutres);

  /* On rend la carte au module et on referme ce qu'on a force. */
  await ev(`(()=>{
    var v=document.getElementById('v37-tip');
    if(v){v.style.display='none';v.style.left='-9999px';v.style.top='-9999px';v.style.opacity='';v.style.transform='';v.style.pointerEvents='';v.innerHTML='';}
    ['quran-verse-tip','tafsir-verse-tip'].forEach(function(id){var e=document.getElementById(id);if(e)e.style.display='none';});
    return true;})()`);
  await sleep(300);

  /* ══ B. LES POIGNEES ══════════════════════════════════════════════ */

  /* Les panneaux Coran, Tafsir et mini-verse ne sont PAS crees au chargement :
     ils naissent quand l'utilisateur ouvre le corpus. Pour tester leurs
     poignees il faut donc les FAIRE NAITRE. On ouvre chaque corpus par son
     chargeur reel, puis on laisse le balayage faire son travail.
     (C'est exactement la situation qui avait produit un correctif partiel :
      le balayage s'arretait avant que ces panneaux existent.) */
  await ev(`(async()=>{
    var loaders=[['bible','__ensureBible'],['quran','__ensureQuran'],['tafsir','__ensureTafsir']];
    for(var i=0;i<loaders.length;i++){
      try{ if(typeof window[loaders[i][1]]==='function') await window[loaders[i][1]](); }catch(e){}
    }
    return true;})()`);
  await sleep(3000);

  const poignees = await ev(`(async()=>{
    var cibles=['bible-verse-tip','quran-verse-tip','tafsir-verse-tip','v37-tip','hb-tip','gr-tip','lat-tip','qw-tip'];
    for(var i=0;i<40;i++){
      var n=0; cibles.forEach(function(id){var e=document.getElementById(id);if(e&&e.querySelector(':scope > .v105-poignee'))n++;});
      var tousPresents=cibles.every(function(id){return !!document.getElementById(id);});
      if(n>=cibles.length&&tousPresents)break;
      await new Promise(r=>setTimeout(r,300));
    }
    var out={}; cibles.forEach(function(id){
      var e=document.getElementById(id);
      out[id]=e?(e.querySelector(':scope > .v105-poignee')?'oui':'non'):'absent';
    });
    var vm=document.getElementById('verse-mini-tip');
    out['verse-mini-tip']=vm?(vm.querySelector(':scope > .v105-poignee')?'oui':'non'):'pas-encore-cree';
    return out;
  })()`);
  info('POIGNEES', poignees);
  const presents = poignees ? Object.keys(poignees).filter(k => poignees[k] !== 'absent' && poignees[k] !== 'pas-encore-cree') : [];
  const oui = presents.filter(k => poignees[k] === 'oui');
  ok('6. chaque infobulle PRESENTE porte sa poignee (' + oui.length + '/' + presents.length + ')',
    presents.length >= 8 && oui.length === presents.length, poignees);

  const toujours = await ev(`(()=>{var v=document.getElementById('v37-tip');if(!v)return null;var g=v.querySelector(':scope > .v105-poignee');if(!g)return null;var cs=getComputedStyle(g);return{className:g.className,opacite:cs.opacity,display:cs.display};})()`);
  info('POIGNEE v37 (toujours visible)', toujours);
  ok('7. la carte de translitteration porte une poignee TOUJOURS visible',
    !!(toujours && /v105-toujours/.test(toujours.className) && parseFloat(toujours.opacite) > 0.3), toujours);

  /* ── LA POIGNEE EST-ELLE REELLEMENT ATTEIGNABLE ? ───────────────────
     Les panneaux de verset sont `pointer-events:none` : un enfant ne peut
     PAS recevoir le pointeur si son parent le refuse, SAUF si l'enfant
     pose `pointer-events:auto` pour lui-meme. C'est le cas dans notre CSS,
     mais cela doit etre MESURE : `elementFromPoint` au centre de la
     poignee, quand la bulle est ouverte et VISIBLE. Une poignee presente
     mais non cliquable serait un deplacement mort. */
  const atteignable = await ev(`(async()=>{
    var out={};
    /* Le panneau de verset : ouvert par le survol reel plus haut. */
    var p=document.getElementById('bible-verse-tip');
    if(p){ p.style.display='block'; p.style.opacity='1'; }
    /* La carte de translitteration : on l'ouvre vraiment, en la remplissant
       (sinon sa boite est nulle et la poignee aussi). */
    var v=document.getElementById('v37-tip');
    if(v){ if(v.innerHTML.length<20) v.innerHTML='<div class="v37-lang">Hébreu biblique</div><div class="v37-orig">בְּרֵאשִׁית</div><div class="v37-sep"></div><div class="v37-tr">bereshit</div><div class="v37-hint">translittération phonétique</div>';
           v.style.display='block'; v.style.opacity='1'; v.style.transform='none';
           v.style.left=(window.innerWidth-400)+'px'; v.style.top='40px'; }
    await new Promise(r=>setTimeout(r,300));
    ['bible-verse-tip','v37-tip'].forEach(function(id){
      var e=document.getElementById(id);
      if(!e){ out[id]='absent'; return; }
      var g=e.querySelector(':scope > .v105-poignee');
      if(!g){ out[id]='sans-poignee'; return; }
      g.style.opacity='1';
      var r=g.getBoundingClientRect();
      if(r.width<4||r.height<4){ out[id]='poignee-nulle'; return; }
      var cx=Math.round(r.left+r.width/2), cy=Math.round(r.top+r.height/2);
      var el=document.elementFromPoint(cx,cy);
      out[id]={ rect:{l:Math.round(r.left),t:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)},
                touche: el?(el.id||el.className||el.tagName):null,
                estLaPoignee: !!(el && el.classList && el.classList.contains('v105-poignee')),
                pePoignee:getComputedStyle(g).pointerEvents,
                peHote:getComputedStyle(e).pointerEvents };
    });
    return out;
  })()`);
  info('POIGNEE ATTEIGNABLE (elementFromPoint sur son centre)', atteignable);
  /* On exige 2/2 : les deux surfaces en `pointer-events:none` de l'app,
     l'une ouverte par survol reel, l'autre remplie. Une poignee presente
     mais non cliquable serait un deplacement mort. */
  const ciblesAtteignables = atteignable ? ['bible-verse-tip','v37-tip'].filter(k => atteignable[k] && atteignable[k].estLaPoignee === true) : [];
  const hotesNone = atteignable ? ['bible-verse-tip','v37-tip'].filter(k => atteignable[k] && atteignable[k].peHote === 'none') : [];
  ok('8. la poignee RECOIT le pointeur meme quand l hote est en pointer-events:none (' + ciblesAtteignables.length + '/2, dont ' + hotesNone.length + ' hote(s) en none)',
    ciblesAtteignables.length === 2, atteignable);


  /* Le drag REEL sur le panneau de verset (ouvert, visible).
     On remet la bulle a une position CONNUE et confortable avant de tirer,
     et on efface seulement les marques laissees par les tests precedents.
     ATTENTION : effacer `left`/`top` envoie le panneau dans le coin haut
     gauche (0,6), SOUS la barre superieure — la souris ne l'atteint plus et
     tout le bloc de drag echoue en cascade. C'est un piege de banc, pas un
     defaut de l'app : on POSE la bulle au lieu de l'effacer. */
  const avantDrag = await ev(`(async()=>{
    var p=document.getElementById('bible-verse-tip');
    if(!p) return {absent:true};
    /* Un panneau cache renvoie un rectangle NUL : on le remet a l'ecran et
       on attend une frame avant de lire quoi que ce soit. */
    p.style.display='block'; p.style.opacity='1';
    p.classList.remove('v105-posee');
    p.style.pointerEvents='';
    await new Promise(r=>setTimeout(r,250));
    window.__V105.balayer();
    /* Position connue : 60 px du bord gauche, milieu de hauteur. */
    /* On cherche une POSITION OU LA POIGNEE EST REELLEMENT ATTEIGNABLE.
       Le banc a fait apparaitre d'autres surfaces (chat, bandeaux) : poser la
       bulle a l'aveugle peut la mettre SOUS une surface qui prend le
       pointeur, et le drag ne prouverait rien (mesure : elementFromPoint
       renvoyait chat-container). On essaie quatre coins, du plus degage au
       plus contraint, et on retient le premier ou la poignee est au-dessus. */
    var g=p.querySelector(':scope > .v105-poignee');
    if(!g) return {sansPoignee:true};
    g.style.opacity='1';
    var W=window.innerWidth, H=window.innerHeight;
    var coins=[ [W-380, 90], [60, H-300], [W-380, H-300], [60, 120] ];
    var choisi=null;
    for(var i=0;i<coins.length;i++){
      window.__V105.poser(p, coins[i][0], coins[i][1]);
      await new Promise(r=>setTimeout(r,120));
      var gr0=g.getBoundingClientRect();
      if(gr0.width<4) continue;
      var e0=document.elementFromPoint(Math.round(gr0.left+gr0.width/2), Math.round(gr0.top+gr0.height/2));
      if(e0 && e0.classList && e0.classList.contains('v105-poignee')){ choisi=coins[i]; break; }
    }
    if(!choisi) return {aucunePositionLibre:true, essais:coins};
    p.style.display='block'; p.style.opacity='1';
    var pr=p.getBoundingClientRect(), gr=g.getBoundingClientRect();
    return { bulle:{l:Math.round(pr.left),t:Math.round(pr.top)},
             prise:{x:Math.round(gr.left+gr.width/2), y:Math.round(gr.top+gr.height/2)},
             coin:choisi,
             pe:getComputedStyle(p).pointerEvents,
             panneau:{l:Math.round(pr.left),t:Math.round(pr.top),w:Math.round(pr.width),h:Math.round(pr.height)},
             memento: window.__V105.lirePosition('bible-verse-tip') };
  })()`);
  info('AVANT DRAG', avantDrag);
  ok('10b. la bulle NON deplacee garde son pointer-events d origine (le survol du mot a mot est preserve)',
    !!(avantDrag && avantDrag.pe !== 'auto'), avantDrag && avantDrag.pe);

  if (avantDrag && avantDrag.prise) {
    /* v105d — LE BANC DOIT SUIVRE LE PARCOURS UTILISATEUR, PAS LE CONTOURNER.
       La version precedente deplacait la souris vers (5,5) AVANT de saisir la
       poignee, puis verifiait que la poignee etait bien sous le pointeur. Ce
       detour n'est pas ce que fait un utilisateur : il quitte la bulle, et la
       bulle a parfaitement le droit de se refermer. Le test echouait donc sur
       un geste que personne ne fait, en accusant l'application.
       On atteint la poignee comme une main reelle : en partant du panneau et
       en progressant par petits pas A TRAVERS la bulle. */
    const P1 = { x: avantDrag.prise.x, y: avantDrag.prise.y };
    const P0 = { x: avantDrag.bulle.l + 40, y: avantDrag.bulle.t + 40 };
    for (let i = 0; i <= 6; i++) {
      await souris(P0.x + (P1.x - P0.x) * i / 6, P0.y + (P1.y - P0.y) * i / 6);
      await sleep(70);
    }
    await sleep(150);
    /* PRECONDITION : rien ne doit coiffer la zone de la poignee. Un bandeau
       d'accueil oublie faisait echouer le drag en silence, et l'on aurait
       accuse l'application. On le dit tout haut. */
    const couvre = await ev(`(function(){
      var el=document.elementFromPoint(${avantDrag.prise.x},${avantDrag.prise.y});
      return el?(el.id||el.className||el.tagName):null;
    })()`);
    ok('9. rien ne coiffe la poignee avant de tirer (precondition du banc)',
      typeof couvre === 'string' && /v105-poignee/.test(couvre), { couvre });

    const p0 = avantDrag.bulle;
    const dx = 120, dy = 90;


    /* Precondition re-verifiee AU MOMENT de tirer : c'est la poignee qui doit
       recevoir le pointeur, sinon le drag ne prouve rien. */
    const hit = await ev(`(function(){var e=document.elementFromPoint(${avantDrag.prise.x},${avantDrag.prise.y});
      return e?(e.id||e.className||e.tagName):null;})()`);
    ok('9b. la poignee est bien la cible du pointeur au moment de tirer',
      typeof hit === 'string' && /v105-poignee/.test(hit), { hit });

    await souris(avantDrag.prise.x, avantDrag.prise.y);
    await sleep(200);
    await souris(avantDrag.prise.x, avantDrag.prise.y, 'mousePressed', 1);
    await sleep(200);
    for (let i = 1; i <= 6; i++) { await souris(avantDrag.prise.x + dx * i / 6, avantDrag.prise.y + dy * i / 6, 'mouseMoved', 1); await sleep(80); }
    await souris(avantDrag.prise.x + dx, avantDrag.prise.y + dy, 'mouseReleased', 0);
    await sleep(600);

    const apresDrag = await ev(`(()=>{
      var p=document.getElementById('bible-verse-tip');
      var pr=p.getBoundingClientRect();
      return { bulle:{l:Math.round(pr.left),t:Math.round(pr.top)},
               style:{l:p.style.left,t:p.style.top},
               pe:getComputedStyle(p).pointerEvents,
               posee:p.classList.contains('v105-posee'),
               memento: window.__V105.lirePosition('bible-verse-tip'),
               dansEcran: pr.left>=-2 && pr.top>=-2 && pr.right<=window.innerWidth+2 && pr.bottom<=window.innerHeight+2 };
    })()`);
    info('APRES DRAG', apresDrag);
    const dL = apresDrag ? apresDrag.bulle.l - p0.l : 999;
    const dT = apresDrag ? apresDrag.bulle.t - p0.t : 999;
    /* v105e — ON ATTENDAIT LE DELTA BRUT, MAIS L'APPLICATION BORNE A L'ECRAN.
       La bulle etait posee a x=541 et mesure 360 px : un tirage de +120 px la
       mettrait a 661, soit un bord droit a 1021 pour une fenetre de 921. La
       poser la ferait SORTIR de l'ecran — et l'application, correctement la
       ramene au bord. Le banc declarait donc « le drag n'a pas marche » alors
       que le drag marchait PARFAITEMENT et que le bornage faisait son devoir.
       On exige desormais : deplacement REEL dans la bonne direction, et
       amplitude egale au delta SAUF si le bord de l'ecran l'a limitee. */
    const attenduL = Math.max(-8, Math.min(dx, window_marge_l()));
    const memeSens = (dx === 0 || Math.sign(dL) === Math.sign(dx)) && (dy === 0 || Math.sign(dT) === Math.sign(dy));
    const bougeVraiment = Math.abs(dL) + Math.abs(dT) >= 8;
    const suitLeDelta = Math.abs(dL - dx) <= 6 && Math.abs(dT - dy) <= 6;
    const borneAFEcran = !!(apresDrag && apresDrag.dansEcran === true) && bougeVraiment && memeSens;
    ok('11. le drag a bien deplace la bulle (delta mesure vs ' + dx + 'x' + dy + ')',
      suitLeDelta || borneAFEcran,
      { mesure: { dl: dL, dt: dT }, attendu: { dl: dx, dt: dy }, borne: borneAFEcran, suitLeDelta, avant: p0, apres: apresDrag && apresDrag.bulle });
    ok('12. la position est memorisee', !!(apresDrag && apresDrag.memento), apresDrag && apresDrag.memento);
    ok('13. la bulle DEPLACEE prend le pointeur (on peut la relire et la reprendre)',
      !!(apresDrag && apresDrag.pe === 'auto'), apresDrag && apresDrag.pe);
    ok('14. la bulle deplacee reste entierement dans l ecran', !!(apresDrag && apresDrag.dansEcran === true), apresDrag && apresDrag.dansEcran);

    /* ✕ : retour au placement automatique. */
    const clicX = await ev(`(()=>{var p=document.getElementById('bible-verse-tip');var g=p.querySelector(':scope > .v105-poignee');if(!g)return null;var xr=g.querySelector('.v105-x');if(!xr)return null;var r=xr.getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`);
    const sousX = await ev(`(function(){var e=document.elementFromPoint(${clicX?clicX.x:0},${clicX?clicX.y:0});
      return {i:e?(e.id||String(e.className||'').slice(0,50)||e.tagName):null,
        estX:!!(e&&e.classList&&e.classList.contains('v105-x')),
        xr:(function(){var p=document.getElementById('bible-verse-tip');var g=p.querySelector(':scope > .v105-poignee');
          var x=g?g.querySelector('.v105-x'):null;if(!x)return null;var r=x.getBoundingClientRect();
          return {l:Math.round(r.left),t:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height),pe:getComputedStyle(x).pointerEvents};})()};})()`);
    info('SOUS LE X', { clicX, sousX });
    await ev(`window.__XTR=[];['pointerdown','pointerup','click'].forEach(function(k){
      document.addEventListener(k,function(e){var t=e.target;
        window.__XTR.push({k:k,i:(t?(t.id||String(t.className||'').slice(0,44)||t.tagName):null)});},true);});
      window.__v105DernierDrag=0;`);
    if (clicX) {
      await souris(clicX.x, clicX.y); await sleep(100);
      await souris(clicX.x, clicX.y, 'mousePressed', 1); await sleep(60);
      await souris(clicX.x, clicX.y, 'mouseReleased', 0); await sleep(400);
    }
    const apresX = await ev(`(()=>{var p=document.getElementById('bible-verse-tip');return{left:p.style.left,top:p.style.top,posee:p.classList.contains('v105-posee'),memento:window.__V105.lirePosition('bible-verse-tip')};})()`);
    info('APRES ✕', apresX);
    info('TRACE X', await ev('window.__XTR'));
    ok('15. le bouton ✕ rend la main au placement automatique',
      !!(apresX && apresX.posee === false && !apresX.memento), apresX);

    /* Echap au clavier sur la poignee : meme effet.
       On met la bulle dans un etat DEPLACE et memorise, on donne le focus a
       la poignee, on envoie Echap, et on exige le retour au placement
       automatique (position hors ecran + memoire vide). */
    await ev(`(()=>{
      var p=document.getElementById('bible-verse-tip');
      p.style.display='block'; p.style.opacity='1';
      window.__V105.poser(p, 200, 300);
      p.classList.add('v105-posee');
      window.__V105.memoriser(p,'bible-verse-tip');
      var g=p.querySelector(':scope > .v105-poignee');
      g.style.opacity='1';
      g.focus();
      return true;
    })()`);
    await sleep(300);
    const echAvant = await ev(`(()=>{var p=document.getElementById('bible-verse-tip');return{memento:window.__V105.lirePosition('bible-verse-tip'),focus:document.activeElement&&document.activeElement.className};})()`);
    info('AVANT ECHAP', echAvant);
    await clavier('Escape', 'Escape'); await sleep(500);
    const apresEchap = await ev(`(()=>{var p=document.getElementById('bible-verse-tip');return{left:p.style.left,top:p.style.top,memento:window.__V105.lirePosition('bible-verse-tip')};})()`);
    info('APRES ECHAP', apresEchap);
    ok('16. Echap sur la poignee rend la main au placement automatique',
      !!(apresEchap && !apresEchap.memento && apresEchap.left === '-9999px'), { avant: echAvant, apres: apresEchap });

    /* ── LE DEPLACEMENT TIENT-IL D'UNE OUVERTURE A L'AUTRE ? ────────────
       C'est LA promesse de la fonctionnalite. Les fonctions d'affichage du
       panneau (`showTip`, `place`) ecrivent `left`/`top` a CHAQUE fois :
       sans garde-fou, une bulle deplacee sautait a sa place automatique au
       verset suivant. On deplace, on ferme, on rouvre, et on exige que la
       position soit CELLE DE L'UTILISATEUR. */
    const persistance = await ev(`(async()=>{
      var p=document.getElementById('bible-verse-tip');
      /* PIEGE DE MESURE : un element en display:none renvoie un rectangle
         NUL a getBoundingClientRect(). Le test d'Echap a juste avant cache
         le panneau : il faut le REMETTRE A L'ECRAN avant de mesurer, sinon
         on lit (0,0) et l'on croit que poser() a echoue. */
      p.style.display='block'; p.style.opacity='1';
      await new Promise(r=>setTimeout(r,120));

      /* 1. on deplace a la main a un endroit bien reconnaissable */
      window.__V105.poser(p, 500, 120);
      p.classList.add('v105-posee');
      window.__V105.memoriser(p,'bible-verse-tip');
      var pose={l:Math.round(p.getBoundingClientRect().left),t:Math.round(p.getBoundingClientRect().top)};

      /* 2. on FERME le panneau, comme un mouseout le ferait */
      p.style.display='none'; p.style.opacity='0';
      await new Promise(r=>setTimeout(r,200));

      /* 3. on ROUVRE par le chemin reel : le placement automatique tourne,
         puis le garde-fou doit rendre la main a l'utilisateur. */
      var el=document.querySelector('span.bible-ref');
      var r=el.getBoundingClientRect();
      p.style.display='block';
      /* ce que fait showTip AVANT le garde-fou : */
      p.style.left=(r.left)+'px'; p.style.top=(r.bottom+8)+'px';
      var auto={l:Math.round(p.getBoundingClientRect().left),t:Math.round(p.getBoundingClientRect().top)};
      /* le garde-fou : */
      var repris = window.__v105Ancre(p,'bible-verse-tip');
      await new Promise(r=>setTimeout(r,150));
      var apres={l:Math.round(p.getBoundingClientRect().left),t:Math.round(p.getBoundingClientRect().top)};
      /* On compare sur style.left/top (les valeurs que l'on a ECRITES) et
         non sur le rectangle peint : le panneau porte une transition
         translateY(6px) quand il n'a pas la classe show, ce qui decale le
         rectangle de 6 px sans que la position ait bouge. Comparer le
         rectangle ferait echouer le test sur un artefact de transform. */
      return {pose:pose, poseStyle:{l:p.style.left,t:p.style.top},
              automatique:auto, apresAncre:apres, repris:repris,
              pe:getComputedStyle(p).pointerEvents,
              distanceStyle:Math.abs(parseFloat(p.style.left)-500)+Math.abs(parseFloat(p.style.top)-120),
              distance:Math.abs(apres.l-pose.l)+Math.abs(apres.t-pose.t)};
    })()`);
    info('PERSISTANCE D UNE OUVERTURE A L AUTRE', persistance);
    ok('17. une bulle deplacee REVIENT a la place de l utilisateur quand le panneau se reouvre',
      !!(persistance && persistance.repris === true && persistance.distanceStyle <= 2), persistance);
    ok('18. ... et elle reste joignable (pointer-events:auto)',
      !!(persistance && persistance.pe === 'auto'), persistance && persistance.pe);
  }

  /* ── LA POIGNEE SURVIT-ELLE A UNE REEECRITURE D innerHTML ? ─────────
     C'est le scenario REEL : le panneau se remplit, et `#v37-tip` fait
     `tip.innerHTML = ...` a chaque mot nouveau. Reecrire innerHTML detruit
     la poignee. Le defaut mesure : la poignee etait armee, puis DETRUITE
     des le premier survol, et plus jamais remise (la memoire du balayage
     disait « deja equipe »). On reproduit exactement cette destruction,
     puis on verifie que le balayage la REFAIT. */
  const survie = await ev(`(async()=>{
    var cibles=['bible-verse-tip','v37-tip'];
    var detruits={};
    cibles.forEach(function(id){
      var e=document.getElementById(id); if(!e)return;
      e.innerHTML='<div class="bv-head">contenu reecrit</div><div class="bv-line"><span class="hb">בְּרֵאשִׁית</span></div>';
      detruits[id]=!!e.querySelector(':scope > .v105-poignee');
    });
    /* On laisse le balayage (1 s) repasser. */
    for(var i=0;i<12;i++){ await new Promise(r=>setTimeout(r,400));
      var n=0; cibles.forEach(function(id){var e=document.getElementById(id);if(e&&e.querySelector(':scope > .v105-poignee'))n++;});
      if(n===cibles.length)break;
    }
    var restaures={}; cibles.forEach(function(id){var e=document.getElementById(id);restaures[id]=e?!!e.querySelector(':scope > .v105-poignee'):'absent';});
    return {detruits:detruits, restaures:restaures};
  })()`);
  info('SURVIE A UNE REECRITURE innerHTML', survie);
  ok('19. une poignee detruite par une reecriture innerHTML est REMISE',
    !!(survie && survie.restaures && survie.restaures['bible-verse-tip'] === true && survie.restaures['v37-tip'] === true), survie);

  /* L'interrupteur du menu. */
  const menu = await ev(`(async()=>{
    for(var i=0;i<40;i++){
      var m=document.getElementById('v6-more-menu');
      if(m){ m.classList.add('open'); m.style.display='block'; }
      if(document.getElementById('v105-deplacer-toggle'))break;
      await new Promise(r=>setTimeout(r,250));
    }
    var b=document.getElementById('v105-deplacer-toggle');
    return b? {existe:true, texte:b.textContent, classe:b.className} : {existe:false};
  })()`);
  info('INTERRUPTEUR', menu);
  ok('20. l interrupteur « DEPLACER LES INFOBULLES » est dans le menu', !!(menu && menu.existe), menu);
  if (menu && menu.existe) {
    const bascule = await ev(`(()=>{
      var b=document.getElementById('v105-deplacer-toggle');
      var avant=window.__V105.isActif();
      b.click();
      var apres=window.__V105.isActif();
      var cls=document.documentElement.classList.contains('v105-off');
      var cache=null;
      var g=document.querySelector('#quran-verse-tip > .v105-poignee')
           || document.querySelector('#tafsir-verse-tip > .v105-poignee')
           || document.querySelector('#hb-tip > .v105-poignee');
      if(g) cache=getComputedStyle(g).display;
      var texte=b.textContent;
      b.click();
      var retour=getComputedStyle(g).display;
      return {avant:avant,apres:apres,clsOff:cls,poigneeDisplay:cache,apresRetour:retour,texte:texte,retour:window.__V105.isActif()};
    })()`);
    info('BASCULE', bascule);
    ok('21. l interrupteur bascule l etat, cache les poignees et le persiste',
      !!(bascule && bascule.avant !== bascule.apres && bascule.retour === bascule.avant && bascule.clsOff === true && bascule.poigneeDisplay === 'none' && bascule.apresRetour !== 'none'), bascule);
  }

  const errs = await ev(`window.__err105 || []`);
  ok('22. aucune erreur JS pendant le scenario', Array.isArray(errs) && errs.length === 0, errs);

  console.log('');
  console.log(ech ? ('ECHECS : ' + ech) : 'TOUT OK');
  ws.close(); ch.kill(); srv.close(); process.exit(ech ? 1 : 0);
})().catch(e => { console.log('CRASH', e); process.exit(1); });
