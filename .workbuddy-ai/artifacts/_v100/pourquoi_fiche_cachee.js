/* v100 — POURQUOI LA FICHE NE S'AFFICHE PAS.

   Constat precedent : la fiche #hb-tip est REMPLIE (on y lit « wayoʾmer »,
   « Strong 559 ») mais reste display:none. Le panneau, lui, ne se ferme plus.

   Hypothese a tester : le `mouseover` global de `ecouter()` (l. ~29200)
   referme la fiche des qu'on survole autre chose qu'elle-meme. Or `detail()`
   ouvre la fiche de facon ASYNCHRONE (`__ensureStrongsHb().then(...)`).
   On veut savoir QUI met display:none, et QUAND, par rapport a l'ouverture.

   Ce banc instrumente l'element : il journalise chaque ecriture de
   `style.display` avec une pile d'appel, puis rejoue le survol reel.
*/
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 8903, CDP = 9443;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve(process.env.THEO_WWW || 'C:/Theologicus/mobile/www');
const PAGE = ['index.html', 'THEOLOGICUS.html'].find(n => fs.existsSync(path.join(ROOT, n)));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css' };

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
const pause = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const srv = await serve();
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo-v100c-'));
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + prof, '--no-first-run', '--disable-gpu', '--window-size=1200,900', 'about:blank'], { stdio: 'ignore' });
  try {
    for (let i = 0; i < 40; i++) { try { await connect(); break; } catch (e) { await pause(400); } }
    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' + PAGE });
    const attendre = async (cond, ms) => {
      const t0 = Date.now();
      while (Date.now() - t0 < (ms || 30000)) { try { if (await evaluate(cond)) return true; } catch (e) {} await pause(300); }
      return false;
    };
    await attendre("!!window.__hbRemplir", 60000);
    await evaluate("(function(){['#setup-wizard-overlay','#auth-overlay'].forEach(function(s){var e=document.querySelector(s);if(e)e.remove();});return true})()", true);

    await evaluate(`
      (function(){
        var cible = document.querySelector('#chat-container') || document.body;
        var d = document.createElement('div'); d.className = 'message message-assistant';
        d.innerHTML = '<div class="message-content"><p>Test : <a class="bible-ref" href="#">Exode 24:12</a></p></div>';
        cible.appendChild(d); return true;
      })()
    `, true);
    await pause(1200);

    const geo = await evaluate(`
      (function(){ var l=document.querySelector('a.bible-ref,span.bible-ref'); var r=l.getBoundingClientRect();
        return {x:r.left+r.width/2, y:r.top+r.height/2}; })()
    `, true);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: geo.x, y: geo.y });
    await pause(1500);

    // Instrumente display sur #hb-tip AVANT de survoler un mot.
    await evaluate(`
      (function(){
        var t = document.getElementById('hb-tip');
        if (!t) return false;
        window.__log = [];
        var desc = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, 'display');
        Object.defineProperty(t.style, 'display', {
          get: function(){ return desc.get.call(this); },
          set: function(v){
            var st = (new Error()).stack || '';
            var ligne = (st.split('\\n')[2] || '').trim().slice(0, 150);
            window.__log.push({valeur:v, t:Math.round(performance.now()), ou:ligne});
            desc.set.call(this, v);
          },
          configurable: true
        });
        return true;
      })()
    `, true);

    const gm = await evaluate(`
      (function(){ var t=document.getElementById('bible-verse-tip');
        var m=t.querySelector('.hb'); if(!m) return null; var r=m.getBoundingClientRect();
        return {x:r.left+r.width/2, y:r.top+r.height/2}; })()
    `, true);
    console.log('=== mot hebreu a (' + Math.round(gm.x) + ',' + Math.round(gm.y) + ') ===');

    // On va SUR le mot, puis on ne bouge PLUS (comme un utilisateur qui lit).
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: gm.x, y: gm.y });
    await pause(1800);

    const log = await evaluate('JSON.stringify(window.__log)', true);
    const arr = JSON.parse(log || '[]');
    console.log('\n=== ecritures de #hb-tip.style.display, dans l ordre ===');
    arr.forEach((e, i) => console.log('  [' + i + '] t=' + e.t + 'ms  display="' + e.valeur + '"\n        ' + e.ou));
    /* On desinstalle l'intercepteur : definir `display` sur l'instance casse
       `getComputedStyle` (le proxy renvoie `undefined` sur les autres acces).
       Il faut SUPPRIMER la propriete propre, pas lui reaffecter une valeur. */
    await evaluate(`
      (function(){
        var t = document.getElementById('hb-tip');
        try { delete t.style.display; } catch(e){}
        return t.style.display;
      })()
    `, true);

    const etat = await evaluate(`
      (function(){ var t=document.getElementById('hb-tip');
        var r=t.getBoundingClientRect();
        var cs=getComputedStyle(t);
        return {display:t.style.display, rect:{x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)},
                opacite:cs.opacity, visibilite:cs.visibility, zIndex:cs.zIndex, position:cs.position,
                maxH:cs.maxHeight, overflowY:cs.overflowY,
                dansEcran: r.top < window.innerHeight && r.bottom > 0 && r.left < window.innerWidth && r.right > 0,
                texte:(t.textContent||'').replace(/\\s+/g,' ').trim().slice(0,70)}; })()
    `, true);
    console.log('\n=== etat final de la fiche ===\n  ' + JSON.stringify(etat, null, 2));

    /* Qui gagne au point ou la fiche est censee se trouver ? */
    const duel = await evaluate(`
      (function(){
        var t=document.getElementById('hb-tip'); var r=t.getBoundingClientRect();
        var cx=Math.round(r.left+r.width/2), cy=Math.round(r.top+r.height/2);
        var el=document.elementFromPoint(cx,cy);
        return {point:[cx,cy], gagnant: el? ((el.className&&typeof el.className==='string'&&el.className)||el.tagName||'?')+'#'+(el.id||''):'null',
                estLaFiche: !!(el && (el===t || t.contains(el)))};
      })()
    `, true);
    console.log('\n=== qui est peint a cet endroit ? ===\n  ' + JSON.stringify(duel));

  } finally {
    try { ch.kill(); } catch (e) {}
    try { srv.close(); } catch (e) {}
  }
})().catch(e => { console.error('ERREUR', e); process.exit(1); });
