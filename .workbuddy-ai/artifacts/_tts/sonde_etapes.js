/* Ou meurt le mot arabe ? On teste chaque etape isoement. */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WebSocket = require('ws');

const PORT = 8903, CDP = 9443;
const CHROME = 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve('C:/Theologicus');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon' };
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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo-tts3-'));
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP,
    '--user-data-dir=' + prof, '--no-first-run', '--disable-gpu',
    '--window-size=1400,900', 'about:blank'], { stdio: 'ignore' });
  let t = null;
  for (let i = 0; i < 60; i++) {
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
    if (r.result && r.result.exceptionDetails) return { __err: ((r.result.exceptionDetails.exception || {}).description || '').slice(0, 400) };
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' + PAGE });
  await sleep(11000);

  const AR = '\u0645\u064e\u0627 \u0634\u064e\u064a\u0652\u0621\u064d'; // مَا شَيْءٍ
  console.log('mot de test :', AR);

  console.log('\n1) normalizeArabicSpeech :');
  console.log('  ', JSON.stringify(await ev(`normalizeArabicSpeech(${JSON.stringify(AR)})`)));

  console.log('\n2) chunkText(mot, 180) :');
  console.log('  ', JSON.stringify(await ev(`chunkText(${JSON.stringify(AR)}, 180)`)));

  console.log('\n3) cleanMd(mot) :');
  console.log('  ', JSON.stringify(await ev(`cleanMd(${JSON.stringify(AR)})`)));

  console.log('\n4) prosodyPreprocess(mot) :');
  console.log('  ', JSON.stringify(await ev(`prosodyPreprocess(${JSON.stringify(AR)})`)));

  console.log('\n5) detectScriptLang(mot) / getLangTag :');
  console.log('  lang =', JSON.stringify(await ev(`detectScriptLang(${JSON.stringify(AR)})`)));

  console.log('\n6) makeUtterance(mot, "arabe") :');
  console.log('  ', JSON.stringify(await ev(`(()=>{ const u = makeUtterance(${JSON.stringify(AR)}, 'arabe');
      if (!u) return 'NULL';
      return { text: u.text, lang: u.lang, voice: u.voice ? u.voice.name : 'AUCUNE' }; })()`)));

  console.log('\n7) La phrase complete avec arabe incluse :');
  const PHR = 'Solution: Un scribe a remplace ' + AR + ' (man shay\'in, "rien") par \u0623\u064e\u062d\u064e\u062f\u064b\u0627 (ahadan, "personne"), creant une ambiguite.';
  console.log('  ', JSON.stringify(await ev(`(()=>{
      const segs = splitByLanguage(${JSON.stringify(PHR)});
      return segs.map(function(s){
        const u = makeUtterance(s.text, s.lang);
        return { lang: s.lang, src: s.text.slice(0,40),
                 utt: u ? (u.text.slice(0,40) + ' | ' + u.lang + ' | ' + (u.voice?u.voice.name:'AUCUNE')) : 'NULL' };
      });
  })()`), null, 1));

  console.log('\n8) _bestFrVoice / _normVoiceLang :');
  console.log('  ', JSON.stringify(await ev(`(()=>({ best: _bestFrVoice ? _bestFrVoice.name : null }))()`)));

  ws.close(); ch.kill();
  try { srv.close(); } catch (e) {}
  await sleep(400); process.exit(0);
})().catch(e => { console.error('ERREUR:', e.message); process.exit(1); });
