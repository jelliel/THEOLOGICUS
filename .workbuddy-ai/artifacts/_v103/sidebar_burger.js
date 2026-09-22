/* v103e — LE BURGER (trois traits en haut a gauche) NE CACHE PAS LE RAIL.

   Signal utilisateur, version Windows : « le sidebar ne se cache pas quand
   j'appuie sur les trois traits en haut a gauche ».

   Lecture du code, deux regles qui ne parlent pas de la meme largeur :

     1. @media (min-width:901px)                        (l. 23603)
          .tpai-sidebar { width:268px !important; flex:0 0 268px !important; }
          .tpai-shell:not(.sidebar-open) .tpai-sidebar { margin-left:-268px; }
        -> le repli se fait par margin-left NEGATIF, et il est actif des 901 px.

     2. l. 24041 :  if (window.innerWidth >= 1024) shell.classList.add('sidebar-open');
        -> le rail n'est OUVERT au demarrage qu'a partir de 1024 px.

     Consequence : entre 901 et 1023 px, le CSS desktop s'applique mais le JS
     n'ouvre pas le rail -> il demarre REPLIE sans que rien ne l'indique.
     Et le burger (l. 23703) se contente de basculer `sidebar-open`.

   Le banc ne conclut pas sur la lecture : il CLIQUE REELLEMENT le burger et
   mesure le rail avant/apres, a plusieurs largeurs de fenetre.
   Un rail est considere VISIBLE si sa boite peinte recouvre la zone de gauche
   du conteneur principal (et non pas si `margin-left` vaut -268px : c'est une
   INTENTION, pas une mesure — piege deja rencontre en v96).
*/
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 8897, CDP = 9437;
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

(async () => {
  const srv = await serve();
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo103e-'));
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + prof, '--no-first-run', '--disable-gpu', '--window-size=1200,800', 'about:blank'], { stdio: 'ignore' });
  let t = null;
  for (let i = 0; i < 60; i++) { await sleep(500); try { const l = await (await fetch('http://127.0.0.1:' + CDP + '/json/list')).json(); t = l.find(x => x.type === 'page'); if (t && t.webSocketDebuggerUrl) break; } catch (e) {} }
  if (!t) { console.log('FATAL Chrome injoignable'); process.exit(1); }
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
  await sleep(6000);
  await evalJs("['setup-wizard-overlay','auth-overlay'].forEach(function(i){var e=document.getElementById(i);if(e)e.remove();});1");

  // Etat du rail : boite PEINTE, pas intention CSS.
  const etat = `(function(){
    var sb = document.getElementById('tpai-sidebar');
    var sh = document.querySelector('.tpai-shell');
    if (!sb) return { absent: true };
    var r = sb.getBoundingClientRect();
    var main = document.querySelector('.tpai-main');
    var mr = main ? main.getBoundingClientRect() : { left: 0 };
    var cs = getComputedStyle(sb);
    return {
      ouvertClasse: sh ? sh.classList.contains('sidebar-open') : null,
      left: Math.round(r.left), right: Math.round(r.right), largeur: Math.round(r.width),
      marginLeft: cs.marginLeft,
      // VISIBLE = la boite est dans la zone de gauche du conteneur, pas au-dela
      visible: (r.right > mr.left + 8) && r.width > 40,
      mainLeft: Math.round(mr.left)
    };
  })()`;

  // Le burger : trois traits, en haut a gauche (cree par v6-ui).
  const burger = `(function(){
    var cands = Array.prototype.slice.call(document.querySelectorAll('button'));
    var b = cands.filter(function(x){
      var s = (x.getAttribute('title')||'').toLowerCase();
      return s.indexOf('conversation') > -1 || x.id === 'tpai-burger';
    })[0];
    if (!b) return null;
    var r = b.getBoundingClientRect();
    return { titre: b.getAttribute('title'), id: b.id || '',
             x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) };
  })()`;

  const bInfo = await evalJs(burger);
  console.log('   burger trouve : ' + JSON.stringify(bInfo));

  const largeurs = [1200, 1000, 950, 860];
  for (const W of largeurs) {
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: 800, deviceScaleFactor: 1, mobile: false });
    await sleep(700);
    const av = await evalJs(etat);
    // CLIC REEL
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: bInfo.x, y: bInfo.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: bInfo.x, y: bInfo.y, button: 'left', clickCount: 1 });
    await sleep(700);
    const ap = await evalJs(etat);
    const bascule = av.visible !== ap.visible;
    console.log('');
    console.log('   fenetre ' + W + 'px');
    console.log('     avant  : visible=' + av.visible + ' gauche=' + av.left + ' largeur=' + av.largeur
      + ' classe=' + av.ouvertClasse + ' margin=' + av.marginLeft);
    console.log('     apres  : visible=' + ap.visible + ' gauche=' + ap.left + ' largeur=' + ap.largeur
      + ' classe=' + ap.ouvertClasse + ' margin=' + ap.marginLeft);
    console.log('     -> ' + (bascule ? 'BASCULE correcte' : '*** NE BASCULE PAS ***'));
  }

  ws.close(); ch.kill(); srv.close();
  setTimeout(() => process.exit(0), 300);
})().catch(e => { console.log('FATAL ' + e.message); process.exit(1); });
