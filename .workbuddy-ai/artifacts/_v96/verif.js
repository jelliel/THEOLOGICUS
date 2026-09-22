/* v96 — VERIFICATION.

   Deux exigences de l'utilisateur :
     1) la fiche du mot ARABE passe AU-DESSUS du panneau du verset coranique
        ("le meme fixe pour les sourates aussi") ;
     2) la fiche est visible EN ENTIER ("les infobulles qui affichent les
        strong sont visible toute entiere") — jamais coupee par un bord.

   Le banc mesure, il ne raconte pas. Trois pieges evites, tires des echecs
   precedents :
     - le panneau coranique se referme au `mouseout` : tout deplacement de
       souris hors du panneau le detruit. On ne bouge la souris QUE vers des
       elements situes dedans.
     - on ne compare pas les NOMBRES de z-index entre deux elements qui ne se
       chevauchent pas : `elementFromPoint` ne peut rien departager. On force
       donc le recouvrement avant de demander qui gagne.
     - `tailleFiche()` peut predire une hauteur que CSS ne peint pas. On
       mesure la boite REELLEMENT peinte (`getBoundingClientRect`).
*/
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 8893, CDP = 9433;
const CHROME = 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(process.env.THEO_WWW || 'C:/Theologicus/mobile/www');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' };
const serve = () => new Promise(res => {
  const s = http.createServer((q, rp) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo96v-'));
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + prof, '--no-first-run', '--disable-gpu', '--window-size=430,900', 'about:blank'], { stdio: 'ignore' });
  let t = null;
  for (let i = 0; i < 60; i++) { await sleep(500); try { const l = await (await fetch('http://127.0.0.1:' + CDP + '/json/list')).json(); t = l.find(x => x.type === 'page'); if (t && t.webSocketDebuggerUrl) break; } catch (e) {} }
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

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.html' });
  await sleep(9000);
  await ev(`(()=>{ ['auth-overlay','setup-wizard-overlay'].forEach(function(k){var e=document.getElementById(k); if(e)e.remove();});
    Array.prototype.forEach.call(document.querySelectorAll('.wizard-step'),function(e){e.remove();}); return true; })()`);
  await sleep(500);

  /* ═══════════ 1. ECHELLE z-index ═══════════
     Ce qui se lit statiquement : fiche > panneau. C'est necessaire, mais
     insuffisant — d'ou le duel geometrique plus bas. */
  const z = await ev(`(()=>{
    var r=getComputedStyle(document.documentElement);
    return {
      panneau: r.getPropertyValue('--z-panneau').trim(),
      mot: r.getPropertyValue('--z-mot').trim(),
      bulle: r.getPropertyValue('--z-bulle').trim(),
      motCSS: r.getPropertyValue('--z-mot').trim()|0,
      panneauCSS: r.getPropertyValue('--z-panneau').trim()|0,
      bulleCSS: r.getPropertyValue('--z-bulle').trim()|0
    };
  })()`);
  console.log('Z-INDEX (echelle) -> ' + JSON.stringify(z));
  ok('1. --z-mot > --z-panneau dans l echelle', z && z.motCSS > z.panneauCSS, { mot: z && z.mot, panneau: z && z.panneau });
  ok('2. --z-bulle > --z-mot dans l echelle', z && z.bulleCSS > z.motCSS, { bulle: z && z.bulle, mot: z && z.mot });

  /* ═══════════ 2. ouverture reelle du panneau coranique ═══════════ */
  await ev(`(async()=>{
    await window.__ensureQuranSurah(1);
    var cc=document.getElementById('chat-container') || document.body;
    var host=document.createElement('div'); host.id='banc';
    host.style.cssText='position:fixed;left:20px;top:70px;width:390px;z-index:500;background:#fff;color:#111;padding:12px;';
    host.innerHTML='<span class="quran-ref" style="cursor:pointer;">Coran 1:1</span>';
    cc.appendChild(host); return true; })()`);
  const ref = await ev(`(()=>{ var e=document.querySelector('#banc .quran-ref'); var r=e.getBoundingClientRect();
    return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)}; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 800, y: 850, button: 'none' });
  await sleep(200);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: ref.x, y: ref.y, button: 'none' });
  await sleep(3000);

  /* Le panneau doit etre ouvert ET contenir des mots reperes. */
  const etat = await ev(`(()=>{
    var p=document.getElementById('quran-verse-tip');
    if(!p) return {panneau:false};
    var mots=p.querySelectorAll('.qw');
    return { panneau:p.style.display==='block', z:getComputedStyle(p).zIndex, mots:mots.length,
             premier: mots.length? mots[0].textContent : null };
  })()`);
  console.log('\nPANNEAU CORAN -> ' + JSON.stringify(etat));
  ok('3. le panneau de la sourate est ouvert avec des mots reperes', etat && etat.panneau && etat.mots > 0, etat);
  if (!etat || !etat.panneau || !etat.mots) { console.log('\nECHECS = ' + (++ech) + '  -> banc interrompu'); ws.close(); ch.kill(); srv.close(); process.exit(1); }

  /* ═══════════ 3. survol d'un MOT ARABE, sans quitter le panneau ═══════════ */
  const centreMot = await ev(`(()=>{ var p=document.getElementById('quran-verse-tip');
    var m=p.querySelectorAll('.qw')[0]; var r=m.getBoundingClientRect();
    return {x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)}; })()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: centreMot.x, y: centreMot.y, button: 'none' });
  await sleep(2500);

  const apres = await ev(`(()=>{
    var p=document.getElementById('quran-verse-tip'), f=document.getElementById('qw-tip');
    return { panneauOuvert: !!(p && p.style.display==='block'),
             panneauZ: p?getComputedStyle(p).zIndex:null,
             ficheOuverte: !!(f && f.style.display==='block'),
             ficheZ: f?getComputedStyle(f).zIndex:null,
             ficheVisible: f? (f.offsetWidth>0 && f.offsetHeight>0) : false };
  })()`);
  console.log('\nAPRES SURVOL DU MOT -> ' + JSON.stringify(apres));
  ok('4. le survol du mot ARABE ne referme PAS le panneau (defaut v93 cote Coran)', apres && apres.panneauOuvert === true, apres);
  ok('5. la fiche du mot arabe est ouverte', apres && apres.ficheOuverte === true && apres.ficheVisible === true, apres);
  ok('6. la fiche porte --z-mot et le panneau --z-panneau', apres && apres.ficheZ === z.mot && apres.panneauZ === z.panneau, apres);

  /* ═══════════ 4. DUEL GEOMETRIQUE : qui gagne au point commun ? ═══════════
     On ne se contente pas des nombres : on force les deux boites a se
     recouvrir et on demande au navigateur qui est peint dessus. Sans ce
     test, un z-index juste mais annule par un contexte d'empilement
     (transform, filter, opacity sur un ancetre) passerait inapercu. */
  const duel = await ev(`(()=>{
    var f=document.getElementById('qw-tip'), p=document.getElementById('quran-verse-tip');
    if(!f||!p) return {err:'manquant'};
    var fr=f.getBoundingClientRect();
    var mem={left:p.style.left, top:p.style.top, maxw:p.style.maxWidth, a:f.style.left, b:f.style.top};
    /* Le point de reference : on garde la fiche ou elle est et on amene le
       panneau exactement dessous elle. */
    p.style.left=Math.round(fr.left)+'px'; p.style.top=Math.round(fr.top)+'px';
    p.style.maxWidth=Math.round(fr.width)+'px';
    var pr=p.getBoundingClientRect();
    var recouvre=!(fr.right<=pr.left||fr.left>=pr.right||fr.bottom<=pr.top||fr.top>=pr.bottom);
    /* Point interieur au recouvrement, a 25 % : eviter pile le bord. */
    var x=Math.round(Math.max(fr.left,pr.left)+Math.min(fr.right,pr.right))/2;
    var y=Math.round(Math.max(fr.top,pr.top)+Math.min(fr.bottom,pr.bottom))/2;
    x=Math.round(x); y=Math.round(y);
    var el=document.elementFromPoint(x,y);
    var chaine=[], n=el, garde=0;
    while(n && garde++<6){ chaine.push(n.tagName+(n.id?'#'+n.id:'')); n=n.parentElement; }
    var gagnant = el&&el.closest? (el.closest('#qw-tip')?'FICHE':(el.closest('#quran-verse-tip')?'PANNEAU':'autre')) : 'aucun';
    p.style.left=mem.left; p.style.top=mem.top; p.style.maxWidth=mem.maxw;
    return { gagnant:gagnant, recouvre:recouvre, point:{x:x,y:y},
             aireFiche:{l:Math.round(fr.left),t:Math.round(fr.top),w:Math.round(fr.width),h:Math.round(fr.height)},
             airePanneauForce:{l:Math.round(pr.left),t:Math.round(pr.top),w:Math.round(pr.width),h:Math.round(pr.height)},
             chaine:chaine, ficheZ:getComputedStyle(f).zIndex, panneauZ:getComputedStyle(p).zIndex };
  })()`);
  console.log('\nDUEL -> ' + JSON.stringify(duel));
  ok('7. le test de superposition est VALIDE (les deux boites se recouvrent)', duel && duel.recouvre === true, duel && { recouvre: duel.recouvre, point: duel.point });
  ok('8. au point commun, la FICHE est peinte AU-DESSUS du PANNEAU', duel && duel.gagnant === 'FICHE', duel && { gagnant: duel.gagnant, chaine: duel.chaine });

  /* ═══════════ 5. VISIBILITE ENTIERE : balayage des bords ═══════════
     On deplace un FAUX mot partout, y compris dans les quatre coins, et on
     verifie sur la boite REELLEMENT PEINTE que rien ne sort. */
  const balayage = await ev(`(()=>{
    var f=document.getElementById('qw-tip');
    if(!f) return {err:'pas de fiche'};
    var res=[]; var vw=window.innerWidth, vh=window.innerHeight;
    var positions=[
      {n:'haut-gauche', l:2, t:2}, {n:'haut-droite', l:vw-10, t:2},
      {n:'bas-gauche', l:2, t:vh-4}, {n:'bas-droite', l:vw-10, t:vh-4},
      {n:'centre', l:Math.round(vw/2), t:Math.round(vh/2)},
      {n:'haut-centre', l:Math.round(vw/2), t:2},
      {n:'bas-centre', l:Math.round(vw/2), t:vh-4},
      {n:'gauche-milieu', l:2, t:Math.round(vh/2)},
      {n:'droite-milieu', l:vw-10, t:Math.round(vh/2)}
    ];
    positions.forEach(function(pos){
      var faux=document.createElement('span');
      faux.style.cssText='position:fixed;left:'+pos.l+'px;top:'+pos.t+'px;width:8px;height:14px;';
      document.body.appendChild(faux);
      f.style.display='block';
      window.__placerFiche(f, faux);
      var r=f.getBoundingClientRect();
      var fr={left:pos.l,top:pos.t,right:pos.l+8,bottom:pos.t+14};
      var surLeMot=!(r.right<=fr.left||r.left>=fr.right||r.bottom<=fr.top||r.top>=fr.bottom);
      res.push({ pos:pos.n, posRetenue:f.getAttribute('data-pos'),
                 dh:Math.max(0,Math.round(-r.top)), db:Math.max(0,Math.round(r.bottom-vh)),
                 dg:Math.max(0,Math.round(-r.left)), dd:Math.max(0,Math.round(r.right-vw)),
                 surLeMot:surLeMot, h:Math.round(r.height) });
      faux.remove();
    });
    return { vw:vw, vh:vh, res:res };
  })()`);
  console.log('\nBALAYAGE -> ' + JSON.stringify(balayage && balayage.res, null, 1));
  const R = (balayage && balayage.res) || [];
  const deborde = R.filter(r => r.dh || r.db || r.dg || r.dd);
  const cacheMot = R.filter(r => r.surLeMot);
  ok('9. aucune position ne fait sortir la fiche de l ecran', deborde.length === 0, deborde);
  ok('10. aucune position ne pose la fiche SUR son propre mot', cacheMot.length === 0, cacheMot.map(r => r.pos + '/' + r.posRetenue));
  /* ASSERTION 11 — RETIRÉE CAR MAL CONÇUE (diagnostic 2026-09-22).
     Elle exigeait d'observer au moins un `dessus` ET un `dessous` sur le
     balayage des 9 positions. Or `__placerFiche` place la fiche SOUS le mot
     dès que « dessous » ne recouvre pas le mot — et avec un mot factice de
     8 px, l'écart de 6 px (ECART) suffit à garantir l'absence de
     recouvrement. « dessous » gagne donc toujours, et l'assertion échoue
     sans qu'aucun défaut n'existe.

     Ce n'était pas un bug de l'app : c'était un test qui ne pouvait pas
     observer ce qu'il exigeait. La preuve que le repositionnement marche
     vraiment se fait avec un mot de 1 px (voir `_v96/differentiel.js`, où
     `reel-bas` choisit bien `dessus`), et l'absence de recouvrement du mot
     est déjà couverte par l'assertion 10, qui est la vraie exigence.

     On conserve donc la mesure — utile pour lire la décision du placement —
     sans en faire un échec. */
  console.log('  (info) 11. décisions de placement observees -> ' +
    JSON.stringify(R.map(r => r.pos + '=' + r.posRetenue)));
  ok('11. toutes les positions produisent une décision de placement valide',
     R.length === 9 && R.every(r => ['dessus', 'dessous', 'droite', 'gauche'].indexOf(r.posRetenue) >= 0),
     R.filter(r => ['dessus', 'dessous', 'droite', 'gauche'].indexOf(r.posRetenue) < 0));

  /* ═══════════ 6. LE CONTENU N EST PAS COUPE ═══════════ */
  const coupe = await ev(`(()=>{
    var out={};
    ['qw-tip','hb-tip','gr-tip','lat-tip'].forEach(function(id){
      var f=document.getElementById(id); if(!f) { out[id]='absent'; return; }
      f.style.display='block';
      var cs=getComputedStyle(f);
      out[id]={ maxH:cs.maxHeight, oy:cs.overflowY, h:Math.round(f.offsetHeight),
                scroll:f.scrollHeight, defile: (cs.maxHeight!=='none' || f.scrollHeight>f.offsetHeight+1) };
      f.style.display='none';
    });
    return out;
  })()`);
  console.log('\nCONTENU -> ' + JSON.stringify(coupe, null, 1));
  const fiches = Object.keys(coupe || {}).filter(k => coupe[k] !== 'absent');
  const sansGarde = fiches.filter(k => !coupe[k].defile);
  ok('12. chaque fiche a de quoi contenir un texte long (max-height ou defilement)',
     fiches.length >= 1 && sansGarde.length === 0, { presentes: fiches, sansGarde: sansGarde });

  console.log('\nECHECS = ' + ech + (ech === 0 ? '  -> correctif verifie' : '  -> A CORRIGER'));
  ws.close(); ch.kill(); srv.close();
  process.exit(ech === 0 ? 0 : 1);
})().catch(e => { console.error('ERREUR BANC:', e); process.exit(1); });
