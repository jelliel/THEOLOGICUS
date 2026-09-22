/* v100 — VERIFICATION BIBLIQUE : lien -> mot hebreu/grec -> fiche Strong.

   Deuxieme volet. Le traceur coranique a montre la course `mouseout`.
   Ici on verifie le meme trajet sur le panneau biblique, puis on pousse
   jusqu'a la FICHE (Strong / mot), qui est le besoin exprime par Fatih :
   lire la translitteration.

   On teste les cinq facons de quitter le lien, y compris les plus hostiles
   (descendre, remonter, longer le bord), parce que c'est en descendant que
   l'utilisateur se fait pieger.
*/
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const PORT = 8902, CDP = 9442;
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
const pause = ms => new Promise(r => setTimeout(r, ms));

let ok = 0, ko = 0;
function check(nom, cond, detail) {
  if (cond) { ok++; console.log('OK    ' + nom + (detail !== undefined ? '  -> ' + JSON.stringify(detail) : '')); }
  else { ko++; console.log('ECHEC ' + nom + '  -> ' + JSON.stringify(detail)); }
}

(async () => {
  const srv = await serve();
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo-v100b-'));
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + prof, '--no-first-run', '--disable-gpu', '--window-size=1200,900', 'about:blank'], { stdio: 'ignore' });
  try {
    for (let i = 0; i < 40; i++) { try { await connect(); break; } catch (e) { await pause(400); } }
    await send('Page.enable'); await send('Runtime.enable');
    console.log('=== cible ===\n  ' + ROOT + ' / ' + PAGE);
    await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' + PAGE });

    const attendre = async (cond, ms) => {
      const t0 = Date.now();
      while (Date.now() - t0 < (ms || 30000)) {
        try { if (await evaluate(cond)) return true; } catch (e) {}
        await pause(300);
      }
      return false;
    };
    await attendre("!!window.__parseBibleRef", 60000);
    await evaluate("(function(){['#setup-wizard-overlay','#auth-overlay'].forEach(function(s){var e=document.querySelector(s);if(e)e.remove();});return true})()", true);

    await evaluate(`
      (function(){
        var cible = document.querySelector('#chat-container') || document.body;
        var d = document.createElement('div');
        d.className = 'message message-assistant';
        d.innerHTML = '<div class="message-content"><p>Test : <a class="bible-ref" href="#" title="Ouvrir sur BibleGateway (Louis Segond)">Exode 24:12</a></p></div>';
        cible.appendChild(d);
        return true;
      })()
    `, true);
    await pause(1200);

    const geoLien = await evaluate(`
      (function(){
        var l = document.querySelector('a.bible-ref, span.bible-ref');
        if (!l) return null;
        var r = l.getBoundingClientRect();
        return {x:r.left+r.width/2, y:r.top+r.height/2};
      })()
    `, true);
    console.log('\n=== 1. lien biblique a (' + Math.round(geoLien.x) + ',' + Math.round(geoLien.y) + ') ===');

    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: geoLien.x, y: geoLien.y });
    await pause(1400);

    const etat = await evaluate(`
      (function(){
        var t=document.getElementById('bible-verse-tip');
        if(!t) return {existe:false};
        var r=t.getBoundingClientRect();
        var mots=t.querySelectorAll('.hb,.gr,.lat');
        return {existe:true, visible:t.style.display!=='none', pe:t.style.pointerEvents,
                x:r.left,y:r.top,w:r.width,h:r.height,
                mots:mots.length, premier: mots.length? (mots[0].textContent||'').trim():null};
      })()
    `, true);
    console.log('\n=== 2. panneau biblique ===\n  ' + JSON.stringify(etat));
    check('le panneau biblique s ouvre', etat.existe && etat.visible, etat.visible);

    if (!etat.mots) { console.log('\n  (pas de mot hebreu/grec disponible dans ce panneau)'); }
    else {
      const gm = await evaluate(`
        (function(){
          var t=document.getElementById('bible-verse-tip');
          var m=t.querySelector('.hb,.gr,.lat'); var r=m.getBoundingClientRect();
          return {x:r.left+r.width/2, y:r.top+r.height/2};
        })()
      `, true);
      console.log('  premier mot a (' + Math.round(gm.x) + ',' + Math.round(gm.y) + ')');

      // Trajet en 12 pas, comme dans la video. On s'ARRETE sur le mot et on
      // laisse la fiche s'ouvrir (elle est asynchrone : __ensureStrongsHb).
      for (let i = 1; i <= 12; i++) {
        const x = geoLien.x + (gm.x - geoLien.x) * i / 12;
        const y = geoLien.y + (gm.y - geoLien.y) * i / 12;
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
        await pause(90);
      }
      await pause(1500);   /* le temps que la fiche se remplisse */
      const apres = await evaluate(`
        (function(){
          var t=document.getElementById('bible-verse-tip');
          return {visible: t? t.style.display!=='none' : false};
        })()
      `, true);
      console.log('\n=== 3. apres le trajet lien -> mot (souris SUR le mot) ===');
      check('le panneau biblique NE se referme PAS en descendant vers le mot', apres.visible, apres);

      // La fiche du mot (translittération).
      /* ATTENTION au test de visibilite. `offsetParent !== null` est FAUX
         pour tout element `position:fixed`, et les quatre fiches sont en
         `position:fixed`. Ce test declarait donc « cachee » une fiche
         parfaitement peinte. On juge sur la boite REELLEMENT peinte. */
      const fiche = await evaluate(`
        (function(){
          var f = document.querySelector('#hb-tip,#gr-tip,#lat-tip');
          if (!f) return {existe:false};
          var r = f.getBoundingClientRect();
          var cs = getComputedStyle(f);
          var vis = r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden';
          return {existe:true, visible:vis, w:Math.round(r.width), h:Math.round(r.height),
                  perimetre:{x:Math.round(r.left),y:Math.round(r.top)},
                  ficheZ:cs.zIndex,
                  panneauZ:getComputedStyle(document.getElementById('bible-verse-tip')).zIndex,
                  extrait:(f.textContent||'').replace(/\\s+/g,' ').trim().slice(0,90)};
        })()
      `, true);
      console.log('\n=== 4. la fiche de mot / translitteration ===\n  ' + JSON.stringify(fiche));
      check('la fiche du mot s ouvre', fiche.existe && fiche.visible, fiche.visible);
      if (fiche.existe && fiche.visible) {
        check('la fiche est AU-DESSUS du panneau',
              parseInt(fiche.ficheZ, 10) > parseInt(fiche.panneauZ, 10),
              fiche.ficheZ + ' > ' + fiche.panneauZ);
        check('la translitteration est reellement presente',
              /Translitt|wayo|Strong/.test(fiche.extrait), fiche.extrait);
        /* Qui gagne au point ou la fiche est peinte ? */
        const duel = await evaluate(`
          (function(){
            var f=document.querySelector('#hb-tip,#gr-tip,#lat-tip'); var r=f.getBoundingClientRect();
            var el=document.elementFromPoint(Math.round(r.left+r.width/2), Math.round(r.top+r.height/2));
            return {estLaFiche: !!(el && (el===f || f.contains(el))),
                    gagnant: el? ((el.className&&typeof el.className==='string'&&el.className)||el.tagName||'?') : 'null'};
          })()
        `, true);
        check('la fiche est bien CE QUI EST PEINT a sa place', duel.estLaFiche, duel);
      }
    }

    // --- Les autres facons de quitter le lien : remonter, longer le bord.
    console.log('\n=== 5. sorties hostiles (remonter / longer) ===');
    const sorties = [
      { nom: 'descendre de 40 px', dx: 0, dy: 40 },
      { nom: 'remonter de 40 px', dx: 0, dy: -40 },
      { nom: 'longer a gauche', dx: -60, dy: 4 },
      { nom: 'longer a droite', dx: 60, dy: 4 }
    ];
    for (const s of sorties) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: geoLien.x, y: geoLien.y });
      await pause(700);
      const av = await evaluate("document.getElementById('bible-verse-tip').style.display!=='none'", true);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: geoLien.x + s.dx, y: geoLien.y + s.dy });
      await pause(420);
      const ap = await evaluate("document.getElementById('bible-verse-tip').style.display!=='none'", true);
      check('survol retabli avant « ' + s.nom + ' »', av, av);
      console.log('      apres « ' + s.nom + ' » : panneau ' + (ap ? 'ouvert' : 'ferme'));
    }

    console.log('\n============================================');
    console.log('  OK=' + ok + '  ECHECS=' + ko);
    console.log('  ' + (ko === 0 ? 'TOUT PASSE' : 'DES ECHECS SUBSISTENT'));
    console.log('============================================');
  } finally {
    try { ch.kill(); } catch (e) {}
    try { srv.close(); } catch (e) {}
  }
})().catch(e => { console.error('ERREUR', e); process.exit(1); });
