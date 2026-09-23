/* Mesure DIRECTE sur la DETECTION de l app installee :
   _inst_v102/THEOLOGICUS.html correspond-il a la version corrigee ?
   On regarde le VERDICT REEL, pas les commentaires. */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WS = require('ws');
const PORT = 8940, CDP = 9480;
const CHROME = 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve('C:/Theologicus');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css' };

// On COPIE la cible a la racine sous un nom neutre (l app derive ses corpus
// de location.pathname : servie depuis un sous-dossier elle ne s initialise pas).
const CIBLE = process.argv[2] || 'THEOLOGICUS.html';
const ETIQUETTE = process.argv[3] || CIBLE;
const TEMP = 'ZZ_MESURE.html';
fs.copyFileSync(path.join(ROOT, CIBLE), path.join(ROOT, TEMP));

const srv = http.createServer((q, rp) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/' + TEMP;
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rp.writeHead(404); rp.end('404'); return; }
  rp.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(rp);
});
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  await new Promise(r => srv.listen(PORT, '127.0.0.1', r));
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo-mes-'));
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP, '--user-data-dir=' + prof, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
  let t = null;
  for (let i = 0; i < 60; i++) { await sleep(500); try { const l = await (await fetch('http://127.0.0.1:' + CDP + '/json/list')).json(); t = l.find(x => x.type === 'page'); if (t && t.webSocketDebuggerUrl) break; } catch (e) {} }
  const ws = new WS(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
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
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' + TEMP });
  await sleep(11000);

  console.log('=== MESURE DIRECTE : ' + ETIQUETTE + ' ===');
  const PHRASES = [
    'Très tôt les chrétiens se réunirent pour prier.',
    'Le baptême marque l entrée dans la communauté.',
    'La société médiévale vivait au rythme de la liturgie.',
    'Ce poème liturgique remonte au Moyen Âge.',
    'Le problème du mal a longtemps occupé les théologiens.',
    'Après la résurrection les apôtres annoncèrent l Évangile.',
  ];
  const r = await ev(`(()=>{
    const C = ${JSON.stringify(PHRASES)};
    return C.map(function(t){ return { t: t, lang: detectScriptLang(t),
      voix: (function(){ try { var v = getVoiceForLang(detectScriptLang(t)); return v ? v.name : null; } catch(e){ return 'ERR'; } })() }; });
  })()`);
  let mauvais = 0;
  for (const x of r) {
    const bad = x.lang !== 'francais';
    if (bad) mauvais++;
    console.log('  ' + (bad ? 'ANGLAIS !!' : 'ok        ') + ' ' + (x.lang + '        ').slice(0, 10) + ' voix=' + String(x.voix).padEnd(26) + ' | ' + x.t.slice(0, 40));
  }
  // la reference accentuee (v107b)
  const ref = await ev(`(()=>{ try { return speakBibleRefs('Ainsi Ésaïe 7:14 fut relu.'); } catch(e){ return 'ERR '+e; } })()`);
  console.log('');
  console.log('  reference : ' + ref);
  console.log('');
  console.log('  PHRASES FRANCAISES LUEES EN ANGLAIS : ' + mauvais + ' / ' + r.length + (mauvais ? '   <-- NON CORRIGE' : '   <-- CORRIGE'));
  ws.close(); ch.kill();
  try { srv.close(); } catch (e) {}
  try { fs.unlinkSync(path.join(ROOT, TEMP)); } catch (e) {}
  await sleep(300); process.exit(0);
})().catch(e => { try { fs.unlinkSync(path.join(ROOT, 'ZZ_MESURE.html')); } catch (_) {} console.error('ERR', e.message); process.exit(1); });
