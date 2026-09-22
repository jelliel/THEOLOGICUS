/* Sonde : le clic sur un mot hebreu doit-il garder l'infobulle ouverte ?
 * Reproduction REELLE dans Chrome : on clique avec une vraie souris via CDP
 * (Input.dispatchMouseEvent), pas avec un dispatchEvent synthetique.
 */
'use strict';
const http = require('http'); const fs = require('fs'); const path = require('path');
const os = require('os'); const { spawn } = require('child_process'); const WebSocket = require('ws');
const PORT = 8863, CDP_PORT = 9403;
const CHROME = 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = process.env.THEO_WWW ? path.resolve(process.env.THEO_WWW) : path.resolve(__dirname, 'mobile', 'www');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.png': 'image/png' };
const serve = () => new Promise((res) => {
  const srv = http.createServer((req, rp) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = process.env.THEO_INDEX || '/index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rp.writeHead(404); rp.end('404'); return; }
    rp.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(rp);
  });
  srv.listen(PORT, '127.0.0.1', () => res(srv));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let echecs = 0;
const ok = (n, c, d) => { if (!c) echecs++; console.log((c ? 'OK    ' : 'ECHEC ') + n + (d !== undefined ? '  -> ' + JSON.stringify(d) : '')); };

async function main() {
  const srv = await serve();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'theohb-'));
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + profile,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=430,900',
    '--disable-features=Translate', 'about:blank'], { stdio: 'ignore' });
  let target = null;
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    try { const l = await (await fetch('http://127.0.0.1:' + CDP_PORT + '/json/list')).json();
      target = l.find((t) => t.type === 'page'); if (target && target.webSocketDebuggerUrl) break; } catch (e) {}
  }
  if (!target) { console.log('ECHEC CDP'); chrome.kill(); srv.close(); process.exit(1); }
  const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
  await new Promise((r) => ws.on('open', r));
  let id = 0; const pending = new Map();
  ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  async function evalJs(e) {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return { __err: (r.result.exceptionDetails.text || '') + ' :: ' + ((r.result.exceptionDetails.exception || {}).description || '').slice(0, 300) };
    return r.result && r.result.result ? r.result.result.value : undefined;
  }
  async function clickAt(x, y) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', clickCount: 0 });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + (process.env.THEO_INDEX || '/index.html') });
  await sleep(8000);
  await evalJs(`(() => { var o = document.getElementById('auth-overlay'); if (o) o.remove(); return true; })()`);
  await sleep(600);

  // 0. Charger le corpus biblique pour que initBibleVerseTooltip s'execute
  //    (le hook attend __corpusReady.bible, charge en tache de fond apres
  //    la fermeture de l'ecran d'authentification).
  const boot = await evalJs(`(async () => {
    try { if (window.__loadBibleNow) window.__loadBibleNow(); } catch(e) {}
    for (var i = 0; i < 40; i++) {
      if (window.__corpusReady && window.__corpusReady.bible) break;
      await new Promise(function(r){ setTimeout(r, 250); });
    }
    return { ready: !!(window.__corpusReady && window.__corpusReady.bible),
             tipPresent: !!document.getElementById('bible-verse-tip'),
             hooks: window.__corpusHooks ? window.__corpusHooks.bible.length : -1 };
  })()`);
  console.log('   [amorcage]', JSON.stringify(boot));

  // 1. On simule l'etat reel : une reference biblique + son panneau, avec
  //    l'infobulle telle que showTip la construit.
  const build = await evalJs(`(async () => {
    var a = document.createElement('span');
    a.className = 'bible-ref';
    a.textContent = 'Gn 1:1';
    a.style.cssText = 'position:fixed;left:20px;top:20px;z-index:50000;color:#fff;background:#333;padding:6px;';
    document.body.appendChild(a);
    return { ajoute: !!document.querySelector('span.bible-ref'),
             tipPresent: !!document.getElementById('bible-verse-tip') };
  })()`);
  console.log('   [temoin]', JSON.stringify(build));

  // S'il n'y a pas d'infobulle (mouseover non declenche), on la force par un
  // vrai mouvement de souris sur le lien.
  let etat = await evalJs(`(() => {
    var tip = document.getElementById('bible-verse-tip');
    return { visible: tip && tip.style.display === 'block', mots: tip ? tip.querySelectorAll('.hb').length : -1 };
  })()`);
  {
    const box = await evalJs(`(() => { var r = document.querySelector('span.bible-ref').getBoundingClientRect(); return {x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2)}; })()`);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 300, y: 500, button: 'none' });
    await sleep(150);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y, button: 'none' });
    await sleep(2500);
    etat = await evalJs(`(() => {
      var tip = document.getElementById('bible-verse-tip');
      return { visible: tip && tip.style.display === 'block', mots: tip ? tip.querySelectorAll('.hb').length : -1 };
    })()`);
  }
  console.log('   [infobulle]', JSON.stringify(etat));
  ok('1. infobulle biblique ouverte avec mots hebreux', etat.visible === true && etat.mots === 7, etat);
  if (!etat.visible || etat.mots < 1) {
    console.log('\n[!] Infobulle non ouverte : le reste du test n\'a pas de sens.');
    ws.close(); chrome.kill(); srv.close(); process.exit(1);
  }

  // 2. on survole le 1er mot hebreu -> hb-tip doit s'ouvrir
  const surv = await evalJs(`(async () => {
    var m = document.querySelector('#bible-verse-tip .hb');
    var r = m.getBoundingClientRect();
    return { x: r.left + r.width/2, y: r.top + r.height/2,
             texte: m.textContent, s: m.getAttribute('data-s') };
  })()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: surv.x, y: surv.y, button: 'none' });
  await sleep(900);
  const apresSurvol = await evalJs(`(() => {
    var t = document.getElementById('hb-tip');
    return { hbTip: t && t.style.display === 'block',
             bibleTip: document.getElementById('bible-verse-tip').style.display === 'block',
             lemme: t ? (t.querySelector('.hb-lem')||{}).textContent : null };
  })()`);
  ok('2. survol du mot hebreu -> hb-tip ouverte', apresSurvol.hbTip === true, apresSurvol);
  ok('3. panneau biblique toujours la apres survol', apresSurvol.bibleTip === true, apresSurvol.bibleTip);

  // 3. LE BUG : un clic sur le mot hebreu
  await clickAt(surv.x, surv.y);
  await sleep(700);
  const apresClic = await evalJs(`(() => {
    var t = document.getElementById('hb-tip');
    var b = document.getElementById('bible-verse-tip');
    return { hbTip: t && t.style.display === 'block',
             bibleTip: b.style.display === 'block',
             bibleOpacity: b.style.opacity,
             hbText: t ? t.textContent.slice(0,60) : null };
  })()`);
  ok('4. clic sur le mot : hb-tip reste ouverte', apresClic.hbTip === true, apresClic);
  ok('5. clic sur le mot : panneau biblique reste ouvert', apresClic.bibleTip === true, apresClic);

  // 4. non-regression : un clic AILLEURS ferme bien le panneau
  await clickAt(400, 860);
  await sleep(500);
  const apresExterieur = await evalJs(`(() => {
    var b = document.getElementById('bible-verse-tip');
    var t = document.getElementById('hb-tip');
    return { bibleTip: b.style.display === 'block', hbTip: t && t.style.display === 'block' };
  })()`);
  ok('6. clic a l\'exterieur ferme le panneau (comportement voulu)', apresExterieur.bibleTip === false, apresExterieur);

  // 5. NOUVEAU TESTAMENT : le mot a mot est GREC (v90). Meme defaut a verifier.
  const ntBuild = await evalJs(`(async () => {
    var a = document.querySelector('span.bible-ref');
    a.textContent = 'Jn 1:1';
    var r = a.getBoundingClientRect();
    return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) };
  })()`);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 300, y: 600, button: 'none' });
  await sleep(150);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: ntBuild.x, y: ntBuild.y, button: 'none' });
  await sleep(3000);
  const ntEtat = await evalJs(`(() => {
    var t = document.getElementById('bible-verse-tip');
    return { visible: t.style.display === 'block', gr: t.querySelectorAll('.gr').length };
  })()`);
  ok('7. Jean 1:1 -> ligne grecque presente', ntEtat.visible === true && ntEtat.gr > 0, ntEtat);
  const ntMot = await evalJs(`(() => {
    var m = document.querySelector('#bible-verse-tip .gr');
    if (!m) return null;
    var r = m.getBoundingClientRect();
    return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) };
  })()`);
  if (ntMot) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: ntMot.x, y: ntMot.y, button: 'none' });
    await sleep(900);
    await clickAt(ntMot.x, ntMot.y);
    await sleep(700);
    const ntApres = await evalJs(`(() => {
      var b = document.getElementById('bible-verse-tip');
      var g = document.getElementById('gr-tip');
      return { bibleTip: b.style.display === 'block', grTip: g && g.style.display === 'block' };
    })()`);
    ok('8. survol+clic d\'un mot GREC : panneau et fiche survivent', ntApres.bibleTip === true && ntApres.grTip === true, ntApres);
  } else {
    ok('8. survol+clic d\'un mot GREC : panneau et fiche survivent', false, 'pas de mot grec trouve');
  }

  console.log('\n' + (echecs ? echecs + ' ECHEC(S)' : 'TOUT PASSE'));
  ws.close(); chrome.kill(); srv.close(); process.exit(echecs ? 1 : 0);
}
main().catch(e => { console.log('CRASH', e); process.exit(1); });
