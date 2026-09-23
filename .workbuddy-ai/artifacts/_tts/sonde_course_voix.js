/* LA COURSE : quand les voix francaises apparaissent-elles, et l app
   interroge-t-elle la liste AVANT ?

   Fait mesure : sur ce poste Windows, les 4 voix LOCALES sont
   (en-GB George [defaut], ar-SA Naayf, en-GB Hazel, en-GB Susan) — AUCUNE
   francaise. Les 13 voix francaises sont toutes « Online (Natural) », donc
   telechargees depuis le cloud d Edge, APRES le chargement.

   Si l app choisit sa voix avant leur arrivee, getVoiceForLang('fr') ne
   trouve rien, l utterance part SANS voix, et le moteur applique sa voix
   PAR DEFAUT = Microsoft George (en-GB) => du francais lu en anglais.

   On instrumente getVoices() des le premier instant (addScriptToEvaluateOnNewDocument)
   pour avoir la chronologie reelle. */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WebSocket = require('ws');

const PORT = 8951, CDP = 9491;
const EDGE = 'C://Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOT = path.resolve('C:/Theologicus');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css' };
const PAGE = 'THEOLOGICUS.html';
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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo-course-'));
  const ch = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + CDP,
    '--user-data-dir=' + prof, '--no-first-run', '--disable-gpu',
    '--window-size=1400,900', 'about:blank'], { stdio: 'ignore' });
  let t = null;
  for (let i = 0; i < 80; i++) {
    await sleep(500);
    try { const l = await (await fetch('http://127.0.0.1:' + CDP + '/json/list')).json(); t = l.find(x => x.type === 'page'); if (t && t.webSocketDebuggerUrl) break; } catch (e) {}
  }
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
  await new Promise(r => ws.on('open', r));
  let id = 0; const pend = new Map();
  ws.on('message', raw => { const m = JSON.parse(raw.toString()); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
  const send = (me, pa) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  const ev = async e => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return '(exc)';
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  await send('Page.enable'); await send('Runtime.enable');

  // Instrumentation AVANT tout script de la page : on enregistre la chronologie.
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      (function () {
        window.__chrono = [];
        var t0 = performance.now();
        function noter(evt) {
          try {
            var v = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
            var fr = v.filter(function (x) { return /^fr/i.test(x.lang); });
            window.__chrono.push({
              ms: Math.round(performance.now() - t0),
              evt: evt,
              total: v.length,
              fr: fr.length,
              locales: v.filter(function (x) { return x.localService; }).length
            });
          } catch (e) {}
        }
        noter('debut');
        var origGet = null;
        if (window.speechSynthesis) {
          origGet = window.speechSynthesis.getVoices.bind(window.speechSynthesis);
          window.speechSynthesis.getVoices = function () { noter('appel-getVoices'); return origGet(); };
          window.speechSynthesis.addEventListener('voiceschanged', function () { noter('voiceschanged'); });
        }
        // on note aussi le temps de chargement
        document.addEventListener('DOMContentLoaded', function () { noter('DOMContentLoaded'); });
        window.addEventListener('load', function () { noter('load'); });
      })();
    `
  });
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' + PAGE });
  await sleep(13000);

  console.log('=== CHRONOLOGIE DES VOIX (Edge / WebView2) ===');
  const chrono = await ev('JSON.stringify(window.__chrono)');
  if (typeof chrono === 'string') {
    const arr = JSON.parse(chrono);
    console.log('   ' + 't(ms)'.padEnd(8) + 'evenement'.padEnd(20) + 'total'.padEnd(7) + 'fr'.padEnd(5) + 'locales');
    for (const c of arr) {
      console.log('   ' + String(c.ms).padEnd(8) + String(c.evt).padEnd(20) + String(c.total).padEnd(7) + String(c.fr).padEnd(5) + c.locales);
    }
    const premierFr = arr.find(c => c.fr > 0);
    console.log('');
    if (premierFr) console.log('   PREMIERE voix francaise disponible a ' + premierFr.ms + ' ms');
    else console.log('   AUCUNE voix francaise detectee');
  }

  console.log('');
  console.log('=== ce que l app avait EN CACHE au premier choix de voix ===');
  const cache = await ev(`(()=>{
    var v = window._allVoices || [];
    var fr = v.filter(function(x){ return /^fr/i.test(x.lang); });
    return { taille: v.length, fr: fr.length, noms: fr.map(function(x){ return x.name + ' [' + x.lang + ']'; }) };
  })()`);
  console.log('   ' + JSON.stringify(cache));

  console.log('');
  console.log('=== et si la liste ne contient QUE les 4 voix locales ? ===');
  const simule = await ev(`(()=>{
    // On simule la liste LOCALE seule (celle disponible avant les voix cloud).
    var locales = (window.speechSynthesis.getVoices() || []).filter(function(x){ return x.localService; });
    var res = { locales: locales.map(function(x){ return x.lang; }) };
    // On remplace temporairement la source des voix, puis on demande le choix.
    var sauve = window._allVoices;
    window._allVoices = locales;
    try { res.choix = getVoiceForLang('francais'); } catch(e) { res.choix = 'ERR'; }
    res.choixNom = res.choix ? (res.choix.name + ' [' + res.choix.lang + ']') : null;
    // Et l utterance qui en resulte :
    try {
      var u = makeUtterance('Très tôt les chrétiens se réunirent pour prier.', 'francais');
      res.uttVoix = u && u.voice ? (u.voice.name + ' [' + u.voice.lang + ']') : null;
      res.uttLang = u ? u.lang : null;
    } catch(e) { res.uttErr = String(e).slice(0,100); }
    window._allVoices = sauve;
    return res;
  })()`);
  console.log('   ' + JSON.stringify(simule, null, 1));
  ws.close(); ch.kill();
  try { srv.close(); } catch (e) {}
  await sleep(300); process.exit(0);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
