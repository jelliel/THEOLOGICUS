/* v103c — LA CAUSE : overflow-wrap:anywhere HERITE + min-width:90px trop bas.

   Deux hypotheses precedent se sont revelees fausses PAR LA MESURE :
     - le foreignObject de l'export rognait la largeur : NON (les mots tenaient)
     - flex-shrink:1 seul : NON (0 boite coupee quand la ligne a de la place)
   Les deux bancs avaient le meme defaut : ils donnaient TROP DE PLACE a la
   ligne. Or le piege est deja connu au projet (v102) : un banc qui ne descend
   pas assez bas ne prouve rien.

   La cause trouvee par lecture du CSS, et demontree ici :
     .message-content { overflow-wrap:anywhere; word-break:break-word; }
   Ces deux proprietes s'HERITENT. `.schema-box` ne les reinitialise jamais.
   `anywhere` autorise la coupure AU MILIEU d'un mot, et surtout il abaisse la
   largeur min-content de la boite a celle d'un seul caractere. Une boite peut
   donc se faire comprimer bien en dessous de son mot le plus long, et
   `min-width:90px` ne protege que jusqu'a 90 px — alors que « Muhammad »
   demande 104 px et « Al-Mukhtar » davantage.

   Le banc reproduit la CONDITION REELLE : colonne de message etroite (comme
   dans la capture 1091x557 ou le chat occupe ~380 px) avec PLUSIEURS boites
   sur une ligne. Il mesure avant/apres et verifie que le correctif supprime
   les coupures sans deborder la carte.
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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo103c-'));
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

  // CONDITION REELLE : colonne de message ETROITE (380 px, comme dans la
  // capture) et une ligne portant 5 boites a libelles longs.
  await evalJs(`(function(){
    var msg = document.createElement('div');
    msg.className = 'message ai-message';
    msg.style.cssText = 'position:fixed;left:0;top:0;width:380px;';
    var body = document.createElement('div');
    body.className = 'message-content';
    body.innerHTML = '<div class="schema-card"><div class="schema-layer">'
      + '<div class="schema-row">'
      + '<div class="schema-box"><b>Muhammad</b></div>'
      + '<div class="schema-box"><b>(Thamud)</b></div>'
      + '<div class="schema-box"><b>(Guerrier)</b></div>'
      + '<div class="schema-box"><b>Tulayha</b></div>'
      + '<div class="schema-box"><b>Musaylima</b></div>'
      + '</div></div></div>';
    msg.appendChild(body);
    document.body.appendChild(msg);
    return true;
  })()`);
  await sleep(400);

  const mesure = `(function(){
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
      return { texte:(b.textContent||'').trim(),
               boxW:Math.round(r.width),
               mot:motTxt, motMax:Math.round(motMax),
               necessaire:Math.round(motMax+pad),
               wrap:cs.overflowWrap, brk:cs.wordBreak,
               coupe: (motMax+pad) > r.width + 0.5 };
    });
  })()`;

  const avant = await evalJs(mesure);
  console.log('');
  console.log('   AVANT — colonne 380 px, 5 boites sur une ligne :');
  avant.forEach(function (b) {
    console.log('     ' + (b.coupe ? 'COUPE ' : 'ok    ')
      + 'boite ' + b.boxW + 'px | necessaire ' + b.necessaire
      + ' | mot "' + b.mot + '"=' + b.motMax
      + ' | wrap=' + b.wrap + ' break=' + b.brk
      + ' | "' + b.texte + '"');
  });
  const nAv = avant.filter(function (b) { return b.coupe; }).length;
  console.log('     -> ' + nAv + ' boite(s) coupee(s) sur ' + avant.length);

  // CORRECTIF CANDIDAT : reinitialiser l'heritage dans les boites et poser un
  // plancher dimensionne au contenu.
  await evalJs(`(function(){
    var s = document.createElement('style');
    s.id = '__fixTest';
    s.textContent = '.schema-card .schema-box,'
      + '.schema-card .schema-box b,'
      + '.schema-card .schema-box em,'
      + '.schema-card .schema-box i,'
      + '.schema-card .schema-box strong'
      + '{ overflow-wrap:normal !important; word-break:normal !important; }'
      + '.schema-row > .schema-box{ flex-shrink:0; }';
    document.head.appendChild(s);
    return true;
  })()`);
  await sleep(300);
  const apres = await evalJs(mesure);
  console.log('');
  console.log('   APRES (reinitialisation du wrapping herite + flex-shrink:0) :');
  apres.forEach(function (b) {
    console.log('     ' + (b.coupe ? 'COUPE ' : 'ok    ')
      + 'boite ' + b.boxW + 'px | necessaire ' + b.necessaire
      + ' | mot "' + b.mot + '"=' + b.motMax
      + ' | wrap=' + b.wrap + ' break=' + b.brk
      + ' | "' + b.texte + '"');
  });
  const nAp = apres.filter(function (b) { return b.coupe; }).length;
  console.log('     -> ' + nAp + ' boite(s) coupee(s) sur ' + apres.length);

  // Le correctif ne doit pas faire deborder la carte hors de la bulle :
  // .schema-card a overflow-x:auto, donc on verifie qu'elle scroll au lieu
  // de pousser la mise en page.
  const deb = await evalJs(`(function(){
    var c = document.querySelector('.schema-card');
    var m = document.querySelector('.message');
    return { carteScrollW:c.scrollWidth, carteClientW:c.clientWidth,
             scroll: c.scrollWidth > c.clientWidth + 1,
             msgW: Math.round(m.getBoundingClientRect().width),
             deborde: c.getBoundingClientRect().right > m.getBoundingClientRect().right + 1 };
  })()`);
  console.log('');
  ok('la cause est bien le wrapping herite', nAv > 0 && nAp === 0, { avant: nAv, apres: nAp });
  ok('le correctif ne fait pas deborder la bulle (la carte scrolle)', deb.deborde === false, deb);

  console.log('');
  console.log('ECHECS = ' + ech);
  ws.close(); ch.kill(); srv.close();
  setTimeout(() => process.exit(ech ? 1 : 0), 300);
})().catch(e => { console.log('ECHEC FATAL ' + e.message); process.exit(1); });
