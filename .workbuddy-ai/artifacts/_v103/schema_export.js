/* v103 — POURQUOI LES SCHEMAS SORTENT TRONQUES A L'EXPORT.

   Capture fournie par l'utilisateur (2026-09-22 183803) : dans le rendu SVG
   exporte, les libelles sont coupes au milieu d'un mot — « Muham / mad »,
   « Guerri / er », « Al-Mukhta / r », « (Thamu / d) ». Ce n'est pas un
   debordement aleatoire : c'est un texte qui se replie dans une boite PLUS
   ETROITE que ce que le texte demande, sans marge.

   Hypothese a tester (ne pas croire sur parole) :
     `exporterSvg(card)` mesure
        W = card.scrollWidth , H = card.scrollHeight
     puis enferme le clone dans un <foreignObject width=W height=H>.
     Si scrollWidth/scrollHeight sous-estiment la boite reellement PEINTE,
     le foreignObject rogne : le texte se replie sur une largeur moindre et
     les mots se coupent.

   Le banc compare, dans un vrai navigateur :
     1. la boite peinte de la carte      (getBoundingClientRect)
     2. ce que exporterSvg utiliserait   (scrollWidth / scrollHeight)
     3. la boite peinte de CHAQUE boite de schema (schema-box)

   et signale toute boite dont le texte est plus large que la boite peinte.
*/
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 8893, CDP = 9433;
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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo103-'));
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + prof, '--no-first-run', '--disable-gpu', '--window-size=1200,900', 'about:blank'], { stdio: 'ignore' });
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

  // La page charge-t-elle vraiment ? (piege connu : 404 de 3 octets)
  const titre = await evalJs('document.title');
  ok('la page est chargee', /theologicus/i.test(String(titre)), { titre });
  const version = await evalJs("(document.documentElement.innerHTML.match(/v(\\d+)/)||[])[0]");
  console.log('      version reperee : ' + version);

  // Retirer les overlays de premier lancement (piege connu)
  await evalJs("['setup-wizard-overlay','auth-overlay'].forEach(function(i){var e=document.getElementById(i);if(e)e.remove();});1");

  // Construire une carte de schema avec des libelles LONGS, comme ceux de la
  // capture (« Al-Mukhtar Ibn al-Ash'ath (Zoroastrien/chretien) »). Le banc ne
  // doit pas dependre d'une reponse LLM : on injecte le HTML du schema.
  const construit = await evalJs(`(function(){
    var hote = document.createElement('div');
    hote.className = 'message-content';
    hote.style.cssText = 'position:fixed;left:0;top:0;width:900px;';
    hote.innerHTML = [
      '<div class="schema-card">',
        '<div class="schema-layer">',
          '<div class="schema-row">',
            '<div class="schema-box" data-role="prophete"><b>Muhammad</b><em>fondateur, 610</em></div>',
            '<div class="schema-box" data-role="source"><b>(Thamūd)</b><em>peuple disparu</em></div>',
            '<div class="schema-box" data-role="source"><b>(Guerrier)</b><em>Islam</em></div>',
            '<div class="schema-box" data-role="source"><b>Al-Mukhtar Ibn al-Ash\\'ath</b><em>(Zoroastrien/chretien)</em></div>',
            '<div class="schema-box" data-role="source"><b>Salih Tulayha Musaylima</b><em>faux prophetes</em></div>',
          '</div>',
        '</div>',
      '</div>'].join('');
    document.body.appendChild(hote);
    window.__hoteTest = hote;
    return !!hote.querySelector('.schema-card');
  })()`);
  ok('carte de schema construite', construit === true);

  await sleep(400);

  // Ce que exporterSvg(card) LIRAIT
  const dim = await evalJs(`(function(){
    var c = document.querySelector('.schema-card');
    var r = c.getBoundingClientRect();
    return { scrollW:c.scrollWidth, scrollH:c.scrollHeight,
             clientW:c.clientWidth, clientH:c.clientHeight,
             peintW:Math.round(r.width), peintH:Math.round(r.height),
             offsetW:c.offsetWidth, offsetH:c.offsetHeight };
  })()`);
  console.log('      dimensions carte : ' + JSON.stringify(dim));

  // Le vrai sujet : le foreignObject prend W = max(240, scrollWidth).
  // Si scrollWidth < largeur peinte, l'export rogne.
  ok('scrollWidth >= largeur peinte (sinon l\'export rogne la largeur)',
     dim.scrollW >= dim.peintW, { scrollW: dim.scrollW, peintW: dim.peintW });
  ok('scrollHeight >= hauteur peinte (sinon l\'export rogne la hauteur)',
     dim.scrollH >= dim.peintH, { scrollH: dim.scrollH, peintH: dim.peintH });

  // Chaque boite : son texte tient-il ?
  const boites = await evalJs(`(function(){
    return Array.prototype.map.call(document.querySelectorAll('.schema-card .schema-box'), function(b){
      var r = b.getBoundingClientRect();
      var cs = getComputedStyle(b);
      // largeur minimale necessaire pour que le mot le plus long tienne
      var plusLong = 0;
      b.querySelectorAll('b,strong,em,i').forEach(function(n){
        var t = (n.textContent||'').trim();
        if (!t) return;
        var mots = t.split(/\\s+/);
        var probe = n.cloneNode(false);
        probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font:'+cs.font+';';
        document.body.appendChild(probe);
        mots.forEach(function(m){
          probe.textContent = m;
          var w = probe.getBoundingClientRect().width;
          if (w > plusLong) plusLong = w;
        });
        probe.parentNode.removeChild(probe);
      });
      var pad = parseFloat(cs.paddingLeft)+parseFloat(cs.paddingRight)
              + parseFloat(cs.borderLeftWidth)+parseFloat(cs.borderRightWidth);
      return { texte: (b.textContent||'').replace(/\\s+/g,' ').trim().slice(0,34),
               boiteW: Math.round(r.width), boiteH: Math.round(r.height),
               largUtile: Math.round(r.width - pad),
               motLePlusLong: Math.round(plusLong),
               coupe: plusLong > (r.width - pad) + 0.5 };
    });
  })()`);
  console.log('');
  console.log('      ' + boites.length + ' boites mesurees :');
  boites.forEach(function (b) {
    console.log('        ' + (b.coupe ? 'COUPE ' : 'ok    ')
      + 'boite ' + b.boiteW + 'x' + b.boiteH
      + ' | utile ' + b.largUtile + ' | mot le plus long ' + b.motLePlusLong
      + ' | "' + b.texte + '"');
  });
  const coupees = boites.filter(function (b) { return b.coupe; });
  ok('aucun mot plus large que sa boite', coupees.length === 0, { coupees: coupees.length });
  console.log('');

  // Et maintenant : produire l'EXPORT et mesurer ce qu'il contient, pour de vrai.
  // On ne peut pas declencher le telechargement en headless de facon fiable,
  // donc on refait exactement ce que fait exporterSvg, puis on rend le SVG et
  // on mesure la boite peinte de ses boites.
  const svg = await evalJs(`(function(){
    var card = document.querySelector('.schema-card');
    var clone = card.cloneNode(true);
    var junk = clone.querySelectorAll('.schema-tools, .schema-toggle, .schema-badge, .schema-minimap');
    for (var i = 0; i < junk.length; i++) junk[i].parentNode.removeChild(junk[i]);
    clone.classList.add('schema-export');
    var W = Math.max(240, Math.ceil(card.scrollWidth));
    var H = Math.max(160, Math.ceil(card.scrollHeight));
    function cssSchema(){
      var out = [];
      for (var i = 0; i < document.styleSheets.length; i++) {
        try {
          var rules = document.styleSheets[i].cssRules;
          for (var j = 0; j < rules.length; j++) {
            var t = rules[j].cssText || '';
            if (t.indexOf('schema-') !== -1) out.push(t);
          }
        } catch (e) {}
      }
      return out.join('\\n');
    }
    var ser = new XMLSerializer().serializeToString(clone);
    var svg = '<?xml version="1.0" encoding="UTF-8"?>\\n'
      + '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">\\n'
      + '<foreignObject x="0" y="0" width="' + W + '" height="' + H + '">\\n'
      + '<style>' + cssSchema() + '</style>\\n'
      + ser + '\\n'
      + '</foreignObject>\\n</svg>';
    window.__svgTest = svg;
    return { W: W, H: H, taille: svg.length, contientRootVars: /--sch-/.test(cssSchema()) };
  })()`);
  console.log('      export simule : ' + JSON.stringify(svg));
  ok('les variables --sch-* sont presentes dans le CSS exporte', svg.contientRootVars === true,
     { note: 'cssSchema() filtre sur "schema-" ; or --sch-* est declare dans :root' });

  // Rendu reel du SVG exporte, dans un iframe, pour mesurer si le texte est coupe
  const rendu = await evalJs(`(function(){
    var old = document.getElementById('__frameTest'); if (old) old.remove();
    var f = document.createElement('iframe');
    f.id = '__frameTest';
    f.style.cssText = 'position:fixed;left:-3000px;top:0;width:1400px;height:900px;border:0;';
    document.body.appendChild(f);
    f.contentDocument.open(); f.contentDocument.write(window.__svgTest); f.contentDocument.close();
    return true;
  })()`);
  ok('le SVG exporte se rend', rendu === true);
  await sleep(800);
  const dansSvg = await evalJs(`(function(){
    var f = document.getElementById('__frameTest');
    var d = f.contentDocument;
    var bs = d.querySelectorAll('.schema-box');
    if (!bs.length) return { note: 'aucune boite rendue dans le SVG', n: 0 };
    return { n: bs.length, boites: Array.prototype.map.call(bs, function(b){
      var r = b.getBoundingClientRect();
      var cs = f.contentWindow.getComputedStyle(b);
      var plusLong = 0;
      b.querySelectorAll('b,strong,em,i').forEach(function(n){
        var t=(n.textContent||'').trim(); if(!t) return;
        var probe = d.createElement('span');
        probe.style.cssText='position:absolute;visibility:hidden;white-space:nowrap;font:'+cs.font+';';
        d.body.appendChild(probe);
        t.split(/\\s+/).forEach(function(m){ probe.textContent=m; var w=probe.getBoundingClientRect().width; if(w>plusLong)plusLong=w; });
        probe.remove();
      });
      var pad = parseFloat(cs.paddingLeft)+parseFloat(cs.paddingRight);
      return { texte:(b.textContent||'').replace(/\\s+/g,' ').trim().slice(0,26),
               boiteW:Math.round(r.width), utile:Math.round(r.width-pad),
               motLePlusLong:Math.round(plusLong),
               coupe: plusLong > (r.width-pad)+0.5 };
    }) };
  })()`);
  console.log('');
  console.log('      DANS LE SVG EXPORTE :');
  if (dansSvg.n === 0) {
    console.log('        ' + JSON.stringify(dansSvg));
  } else {
    dansSvg.boites.forEach(function (b) {
      console.log('        ' + (b.coupe ? 'COUPE ' : 'ok    ')
        + 'boite ' + b.boiteW + ' | utile ' + b.utile
        + ' | mot ' + b.motLePlusLong + ' | "' + b.texte + '"');
    });
  }

  console.log('');
  console.log('ECHECS = ' + ech);
  ws.close(); ch.kill(); srv.close();
  setTimeout(() => process.exit(ech ? 1 : 0), 300);
})().catch(e => { console.log('ECHEC FATAL ' + e.message); process.exit(1); });
