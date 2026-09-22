/* v103b — POURQUOI LES MOTS SE COUPENT EN DEUX DANS LES BOITES.

   Capture utilisateur 1091x557 (fenetre etroite), boites du schema avec des
   libelles coupes au milieu d'un mot : « Muham / mad », « Guerri / er »,
   « Al-Mukhta / r », « (Thamu / d) ».

   Hypothese, apres lecture du CSS (l. 1481) :

     .schema-row { display:flex; justify-content:center; align-items:stretch;
                   gap:18px; flex-wrap:wrap; }
     .schema-box { display:inline-block; padding:8px 14px; min-width:90px; }

   `.schema-box` est un ELEMENT FLEX. Il n'a pas `flex-shrink:0`. Dans un
   conteneur flex, `flex-shrink` vaut 1 par defaut : quand la ligne depasse la
   largeur disponible, le navigateur RETRECIT les boites. Une boite plus
   etroite que son mot le plus long coupe ce mot — d'ou « Muham / mad ».
   `min-width:90px` ne protege que jusqu'a 90 px, et il est PLUS PETIT que
   beaucoup de mots (le mot « Muhammad » demande ~90 px, « Al-Mukhtar » plus).

   `flex-wrap:wrap` devrait empecher ca en renvoyant les boites a la ligne.
   Mais une boite qui ne peut pas se replier en dessous de son contenu force
   la ligne a deborder ; sans `flex-shrink:0` ni `min-width:max-content`,
   le repli se paie par une compression du texte.

   Le banc mesure, dans un vrai navigateur, a la largeur de la capture :
     - la largeur peinte de chaque boite
     - la largeur MIN-CONTENT demandee par son texte (le mot le plus long)
     - si la boite est plus etroite que ce minimum  => le mot est coupe
   Puis il refait la mesure avec `flex-shrink:0` pour verifier que la cause
   est bien la — et pas autre chose.
*/
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 8894, CDP = 9434;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(process.env.THEO_WWW || 'C:/Theologicus/mobile/www');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' };
const PAGE = ['index.html', 'THEOLOGICUS.html'].find(n => fs.existsSync(path.join(ROOT, n)));
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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo103b-'));
  // MEME LARGEUR QUE LA CAPTURE : 1091 x 557
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + prof, '--no-first-run', '--disable-gpu', '--window-size=1091,557', 'about:blank'], { stdio: 'ignore' });
  let t = null;
  for (let i = 0; i < 60; i++) { await sleep(500); try { const l = await (await fetch('http://127.0.0.1:' + CDP + '/json/list')).json(); t = l.find(x => x.type === 'page'); if (t && t.webSocketDebuggerUrl) break; } catch (e) {} }
  if (!t) { console.log('ECHEC  Chrome CDP injoignable'); process.exit(1); }
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
  await new Promise(r => ws.on('open', r));
  let id = 0; const pend = new Map();
  ws.on('message', raw => { const m = JSON.parse(raw.toString()); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const send = (me, pa) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.text);
    return r.result && r.result.result ? r.result.result.value : undefined;
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' + PAGE });
  await sleep(5000);
  ok('la page est chargee', /theologicus/i.test(String(await evalJs('document.title'))));
  await evalJs("['setup-wizard-overlay','auth-overlay'].forEach(function(i){var e=document.getElementById(i);if(e)e.remove();});1");

  // Reproduire la topologie de la capture : une carte dans une colonne de
  // message etroite, avec des libelles longs en arabe translitere.
  const build = await evalJs(`(function(){
    var msg = document.createElement('div');
    msg.className = 'message ai-message';
    msg.style.cssText = 'position:fixed;left:0;top:0;width:640px;';
    var body = document.createElement('div');
    body.className = 'message-content';
    body.innerHTML = '<div class="schema-card"><div class="schema-layer">'
      + '<div class="schema-row">'
      + '<div class="schema-box" data-role="source"><b>Al-Mukhtar Ibn al-Ash\\'ath</b><em>(Zoroastrien/chretien)</em></div>'
      + '</div>'
      + '<div class="schema-row">'
      + '<div class="schema-box"><b>Salih</b></div>'
      + '<div class="schema-box"><b>Tulayha</b></div>'
      + '<div class="schema-box"><b>Muhammad</b></div>'
      + '<div class="schema-box"><b>(Thamud)</b></div>'
      + '<div class="schema-box"><b>(Guerrier)</b></div>'
      + '</div>'
      + '</div></div>';
    msg.appendChild(body);
    document.body.appendChild(msg);
    window.__m = msg;
    return true;
  })()`);
  ok('topologie de la capture construite', build === true);
  await sleep(400);

  const mesure = `(function(){
    function minContent(el){
      var cs = getComputedStyle(el);
      var probe = el.cloneNode(true);
      probe.style.cssText = 'position:absolute;visibility:hidden;width:min-content;';
      document.body.appendChild(probe);
      var w = probe.getBoundingClientRect().width;
      probe.remove();
      return w;
    }
    return Array.prototype.map.call(document.querySelectorAll('.schema-card .schema-box'), function(b){
      var r = b.getBoundingClientRect();
      var cs = getComputedStyle(b);
      var motMax = 0, motTxt = '';
      b.querySelectorAll('b,strong,em,i').forEach(function(n){
        var t=(n.textContent||'').trim(); if(!t) return;
        var p = n.cloneNode(false);
        p.style.cssText='position:absolute;visibility:hidden;white-space:nowrap;font:'+cs.font+';';
        document.body.appendChild(p);
        t.split(/\\s+/).forEach(function(m){ p.textContent=m; var w=p.getBoundingClientRect().width; if(w>motMax){motMax=w;motTxt=m;} });
        p.remove();
      });
      var pad = parseFloat(cs.paddingLeft)+parseFloat(cs.paddingRight);
      return { texte:(b.textContent||'').replace(/\\s+/g,' ').trim().slice(0,30),
               boxW:Math.round(r.width), boxH:Math.round(r.height),
               shrink:cs.flexShrink, fondu: Math.round(minContent(b)),
               motMax:Math.round(motMax), mot:motTxt,
               largeurNecessaire: Math.round(motMax+pad),
               coupe: (motMax+pad) > r.width + 0.5 };
    });
  })()`;

  const avant = await evalJs(mesure);
  console.log('');
  console.log('   AVANT (etat actuel) — fenetre 1091x557 :');
  avant.forEach(function (b) {
    console.log('     ' + (b.coupe ? 'COUPE ' : 'ok    ')
      + 'boite ' + b.boxW + ' | necessaire ' + b.largeurNecessaire
      + ' | mot "' + b.mot + '"=' + b.motMax
      + ' | flex-shrink ' + b.shrink + ' | "' + b.texte + '"');
  });
  const coupeesAvant = avant.filter(function (b) { return b.coupe; }).length;
  console.log('     -> ' + coupeesAvant + ' boite(s) coupee(s) sur ' + avant.length);

  // ACTIVER LA CORRECTION CANDIDATE et remesurer
  await evalJs(`(function(){
    var s = document.createElement('style');
    s.id = '__fixTest';
    s.textContent = '.schema-row > .schema-box{flex-shrink:0;}';
    document.head.appendChild(s);
    return true;
  })()`);
  await sleep(300);
  const apres = await evalJs(mesure);
  console.log('');
  console.log('   APRES (flex-shrink:0 sur les boites) :');
  apres.forEach(function (b) {
    console.log('     ' + (b.coupe ? 'COUPE ' : 'ok    ')
      + 'boite ' + b.boxW + ' | necessaire ' + b.largeurNecessaire
      + ' | mot "' + b.mot + '"=' + b.motMax
      + ' | flex-shrink ' + b.shrink + ' | "' + b.texte + '"');
  });
  const coupeesApres = apres.filter(function (b) { return b.coupe; }).length;
  console.log('     -> ' + coupeesApres + ' boite(s) coupee(s) sur ' + apres.length);

  console.log('');
  ok('la cause est bien l\'absence de flex-shrink:0',
     coupeesAvant > 0 && coupeesApres === 0,
     { avant: coupeesAvant, apres: coupeesApres });

  console.log('');
  console.log('ECHECS = ' + ech);
  ws.close(); ch.kill(); srv.close();
  setTimeout(() => process.exit(ech ? 1 : 0), 300);
})().catch(e => { console.log('ECHEC FATAL ' + e.message); process.exit(1); });
