/* v100 — TRACE DE LA FERMETURE : lien -> ligne de mots.

   Reproduit la sequence filmee : on ouvre le panneau d'une reference
   coranique, puis on descend la souris vers la ligne de mots arabes qui se
   trouve DANS le panneau. La video montre que le panneau se referme avant
   meme que la souris atteigne le mot.

   Ce banc n'invente rien : il enregistre TOUT `mouseout` qui sort du lien ou
   du panneau, avec `relatedTarget`, et dit lequel a provoque la fermeture.
   On saura donc si la cause est le garde `dansPanneau` ou autre chose.
*/
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 8901, CDP = 9441;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(process.env.THEO_WWW || 'C:/Theologicus/mobile/www');
const PAGE = ['index.html', 'THEOLOGICUS.html'].find(n => fs.existsSync(path.join(ROOT, n)));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' };

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

let id = 0, ws, pend = new Map();
const send = (method, params) => new Promise((res, rej) => {
  const i = ++id; pend.set(i, { res, rej });
  ws.send(JSON.stringify({ id: i, method, params: params || {} }));
});
async function connect() {
  const r = await fetch('http://127.0.0.1:' + CDP + '/json/list');
  const list = await r.json();
  const t = list.find(x => x.type === 'page');
  ws = new WebSocket(t.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise(r2 => ws.on('open', r2));
  ws.on('message', m => {
    const d = JSON.parse(m);
    if (d.id && pend.has(d.id)) {
      const { res, rej } = pend.get(d.id); pend.delete(d.id);
      d.error ? rej(new Error(JSON.stringify(d.error))) : res(d.result);
    }
  });
}
const evaluate = async (expr, awaitP) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: !!awaitP });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails));
  return r.result.value;
};

(async () => {
  const srv = await serve();
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo-v100-'));
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + prof, '--no-first-run', '--disable-gpu', '--window-size=1200,900', 'about:blank'], { stdio: 'ignore' });
  try {
    for (let i = 0; i < 40; i++) { try { await connect(); break; } catch (e) { await new Promise(r => setTimeout(r, 400)); } }
    await send('Page.enable'); await send('Runtime.enable');
    console.log('=== cible ===\n  ' + ROOT + ' / ' + PAGE);
    await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' + PAGE });

    const attendre = async (cond, ms) => {
      const t0 = Date.now();
      while (Date.now() - t0 < (ms || 30000)) {
        try { if (await evaluate(cond)) return true; } catch (e) {}
        await new Promise(r => setTimeout(r, 300));
      }
      return false;
    };
    await attendre("!!window.__qwMots && !!document.querySelector('a.quran-ref,span.quran-ref')", 60000);
    await evaluate("(function(){['#setup-wizard-overlay','#auth-overlay'].forEach(function(s){var e=document.querySelector(s);if(e)e.remove();});return true})()");

    // Injecte une fiche de mot coranique et le libelle attendu sous la sourate.
    console.log('\n=== 1. preparation : reference coranique cliquable ===');
    /* Les liens .quran-ref sont produits par colorizeSchemaRefs a partir du
       contenu du chat. Au demarrage il n'y en a aucun : on en fabrique un
       exactement comme l'app le fait (l. 9750 / 9769), pour mesurer le MEME
       element que l'utilisateur survole. */
    const prep = await evaluate(`
      (function(){
        var cible = document.querySelector('#chat-container') || document.body;
        var d = document.createElement('div');
        d.className = 'message message-assistant';
        d.innerHTML = '<div class="message-content"><p>Exemple : <a class="quran-ref" href="#" title="Ouvrir le Coran (texte local)">Sourate 19:30</a> et <a class="bible-ref" href="#" title="Ouvrir sur BibleGateway (Louis Segond)">Exode 24:12</a></p></div>';
        cible.appendChild(d);
        var links = document.querySelectorAll('a.quran-ref, span.quran-ref');
        return {ok: links.length>0, n: links.length, injecteDans: cible.id || cible.tagName};
      })()
    `, true);
    console.log('  ' + JSON.stringify(prep));
    await new Promise(r => setTimeout(r, 1200));

    // Installe l'enregistreur AVANT le survol.
    await evaluate(`
      (function(){
        window.__tr = [];
        document.addEventListener('mouseout', function(e){
          var sortDuLien = !!(e.target.closest && e.target.closest('a.quran-ref,span.quran-ref'));
          var dansPanneau = !!(e.target.closest && e.target.closest('#quran-verse-tip'));
          if (!sortDuLien && !dansPanneau) return;
          var rt = e.relatedTarget;
          window.__tr.push({
            de: sortDuLien ? 'LIEN' : 'PANNEAU',
            deClasse: (e.target.className||e.target.tagName||'')+'',
            rt: rt ? ((rt.className && typeof rt.className==='string' && rt.className) || rt.tagName || '?')+'#'+(rt.id||'') : 'NULL',
            rtDansPanneau: !!(rt && rt.closest && rt.closest('#quran-verse-tip')),
            rtDansFiche: !!(rt && rt.closest && rt.closest('#hb-tip,#gr-tip,#lat-tip,#qw-tip')),
            panneauVisible: !!(document.getElementById('quran-verse-tip')||{}).style && document.getElementById('quran-verse-tip').style.display !== 'none'
          });
        }, true);
        return true;
      })()
    `, true);

    // Position du lien, puis survol reel par CDP.
    const geo = await evaluate(`
      (function(){
        var links = document.querySelectorAll('a.quran-ref, span.quran-ref');
        for (var i=0;i<links.length;i++){
          if (/19\\s*:\\s*30/.test(links[i].textContent)){
            var r = links[i].getBoundingClientRect();
            return {x:r.left+r.width/2, y:r.top+r.height/2, w:r.width, h:r.height};
          }
        }
        return null;
      })()
    `, true);
    if (!geo || !isFinite(geo.x)) { console.log('  !! reference 19:30 introuvable'); return; }
    console.log('  lien a (' + Math.round(geo.x) + ',' + Math.round(geo.y) + ')');

    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: geo.x, y: geo.y });
    await new Promise(r => setTimeout(r, 900));
    const ouv = await evaluate(`
      (function(){
        var t=document.getElementById('quran-verse-tip');
        if(!t) return {existe:false};
        var r=t.getBoundingClientRect();
        var mots=t.querySelectorAll('.qw');
        return {existe:true, visible:t.style.display!=='none', x:r.left, y:r.top, w:r.width, h:r.height,
                mots:mots.length, premierMot: mots.length? (mots[0].textContent||'').trim() : null};
      })()
    `, true);
    console.log('\n=== 2. panneau apres survol du lien ===');
    console.log('  ' + JSON.stringify(ouv));

    if (!ouv.existe || !ouv.mots) { console.log('\n  !! pas de mot dans le panneau — rien a tracer'); return; }

    // Position du premier mot arabe.
    const gm = await evaluate(`
      (function(){
        var t=document.getElementById('quran-verse-tip');
        var m=t.querySelector('.qw'); var r=m.getBoundingClientRect();
        return {x:r.left+r.width/2, y:r.top+r.height/2, w:r.width, h:r.height};
      })()
    `, true);
    console.log('  premier mot a (' + Math.round(gm.x) + ',' + Math.round(gm.y) + ')');

    // --- LE TRAJET DE LA VIDEO : on descend du lien vers le mot, en 12 pas.
    console.log('\n=== 3. trajet souris : lien -> mot (12 pas) ===');
    const pas = 12;
    for (let i = 1; i <= pas; i++) {
      const x = geo.x + (gm.x - geo.x) * i / pas;
      const y = geo.y + (gm.y - geo.y) * i / pas;
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await new Promise(r => setTimeout(r, 90));
      if (i === Math.round(pas / 2) || i === pas) {
        const st = await evaluate(`
          (function(){
            var t=document.getElementById('quran-verse-tip');
            if(!t) return {visible:false};
            var el=document.elementFromPoint(${Math.round(x)},${Math.round(y)});
            return {visible:t.style.display!=='none',
                    sousCurseur: el? ((el.className&&typeof el.className==='string'&&el.className)||el.tagName||'?')+'#'+(el.id||'') : 'null'};
          })()
        `, true);
        console.log('  pas ' + i + '/12  ' + JSON.stringify(st));
      }
    }

    console.log('\n=== 4. chaque mouseout enregistre ===');
    const tr = await evaluate('JSON.stringify(window.__tr)', true);
    const arr = JSON.parse(tr || '[]');
    if (!arr.length) console.log('  (aucun)');
    arr.forEach((t, i) => {
      console.log(`  [${i}] de=${t.de} cible=${t.deClasse}  ->  relatedTarget=${t.rt}`);
      console.log(`        rt dans panneau=${t.rtDansPanneau}  rt dans fiche=${t.rtDansFiche}  panneau encore visible=${t.panneauVisible}`);
    });

    const fin = await evaluate(`
      (function(){
        var t=document.getElementById('quran-verse-tip');
        return {panneauVisible: t? t.style.display!=='none' : false};
      })()
    `, true);
    console.log('\n=== 5. etat final ===\n  ' + JSON.stringify(fin));
    console.log('\n' + (fin.panneauVisible ? 'PAN NEAU OUVERT' : '>>> PANNEAU FERME <<<'));

  } finally {
    try { ch.kill(); } catch (e) {}
    try { srv.close(); } catch (e) {}
  }
})().catch(e => { console.error('ERREUR', e); process.exit(1); });
