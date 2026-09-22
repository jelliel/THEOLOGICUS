/* v103f — QUELLES REGLES S'APPLIQUENT VRAIMENT AU RAIL A 1200 px ?

   Mesure precedente, fenetre 1200 px : le burger bascule bien la classe
   (sidebar-open retiree) mais le rail reste visible avec margin:0px et une
   largeur de 250 px. Or la seule regle de repli est

     @media (min-width:901px){ ... .tpai-shell:not(.sidebar-open) .tpai-sidebar
                                   { margin-left:-268px; } }

   et ce meme bloc impose width:268px !important. La largeur mesuree etant
   250 px, ce bloc NE S'APPLIQUE PAS a 1200 px. Ce banc demande au navigateur
   quelles regles existent et lesquelles gagnent — plutot que de deviner.
*/
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 8898, CDP = 9438;
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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo103f-'));
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + prof, '--no-first-run', '--disable-gpu', '--window-size=1200,800', 'about:blank'], { stdio: 'ignore' });
  let t = null;
  for (let i = 0; i < 60; i++) { await sleep(500); try { const l = await (await fetch('http://127.0.0.1:' + CDP + '/json/list')).json(); t = l.find(x => x.type === 'page'); if (t && t.webSocketDebuggerUrl) break; } catch (e) {} }
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

  const info = await evalJs(`(function(){
    var out = { regles268: [], media: [], calcule: null };
    for (var i = 0; i < document.styleSheets.length; i++) {
      var rules;
      try { rules = document.styleSheets[i].cssRules; } catch (e) { continue; }
      for (var j = 0; j < rules.length; j++) {
        var r = rules[j];
        var t = r.cssText || '';
        if (t.indexOf('268') !== -1) out.regles268.push(t.slice(0, 160));
        if (r.type === 4 /* CSSMediaRule */ && t.indexOf('sidebar') !== -1) {
          out.media.push({ condition: r.conditionText || r.media.mediaText,
                           sApplique: matchMedia(r.conditionText || r.media.mediaText).matches });
        }
      }
    }
    var sb = document.getElementById('tpai-sidebar');
    var cs = getComputedStyle(sb);
    out.calcule = { width: cs.width, flexBasis: cs.flexBasis, marginLeft: cs.marginLeft,
                    transform: cs.transform, position: cs.position,
                    largeurPeinte: Math.round(sb.getBoundingClientRect().width) };
    out.match901 = matchMedia('(min-width:901px)').matches;
    out.match1024 = matchMedia('(min-width:1024px)').matches;
    out.innerWidth = window.innerWidth;
    return out;
  })()`);

  console.log('   largeur fenetre   : ' + info.innerWidth);
  console.log('   matchMedia 901px  : ' + info.match901);
  console.log('   matchMedia 1024px : ' + info.match1024);
  console.log('');
  console.log('   CALCULE sur #tpai-sidebar : ' + JSON.stringify(info.calcule, null, 0));
  console.log('');
  console.log('   regles contenant "268" (' + info.regles268.length + ') :');
  info.regles268.forEach(function (r) { console.log('     ' + r); });
  console.log('');
  console.log('   media queries contenant "sidebar" :');
  info.media.forEach(function (m) {
    console.log('     ' + (m.sApplique ? 'ACTIVE   ' : 'inactive ') + m.condition);
  });

  ws.close(); ch.kill(); srv.close();
  setTimeout(() => process.exit(0), 300);
})().catch(e => { console.log('FATAL ' + e.message); process.exit(1); });
