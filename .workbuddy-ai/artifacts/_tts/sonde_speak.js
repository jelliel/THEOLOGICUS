/* Sonde TTS — que prononce REELLEMENT l'app ?
   On instrumente speechSynthesis.speak pour capturer chaque utterance :
   texte, langue, voix resolue. C'est la preuve, pas une supposition. */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WebSocket = require('ws');

const PORT = 8902, CDP = 9442;
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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo-tts2-'));
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP,
    '--user-data-dir=' + prof, '--no-first-run', '--disable-gpu',
    '--window-size=1400,900', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });

  let t = null;
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    try {
      const l = await (await fetch('http://127.0.0.1:' + CDP + '/json/list')).json();
      t = l.find(x => x.type === 'page');
      if (t && t.webSocketDebuggerUrl) break;
    } catch (e) {}
  }
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
  await new Promise(r => ws.on('open', r));
  let id = 0; const pend = new Map();
  ws.on('message', raw => {
    const m = JSON.parse(raw.toString());
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  });
  const send = (me, pa) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  const ev = async e => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return { __err: ((r.result.exceptionDetails.exception || {}).description || '').slice(0, 500) };
    return r.result && r.result.result ? r.result.result.value : undefined;
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' + PAGE });
  await sleep(11000);

  // Pieger speak() AVANT tout appel : on enregistre ce qui part vraiment au moteur.
  await ev(`(()=>{ window.__CAP = [];
    const orig = speechSynthesis.speak.bind(speechSynthesis);
    speechSynthesis.speak = function(u){
      window.__CAP.push({
        text: u.text,
        lang: u.lang,
        voice: u.voice ? (u.voice.name + ' (' + u.voice.lang + ')') : 'AUCUNE',
        rate: u.rate, pitch: u.pitch
      });
      try { orig(u); } catch(e) {}
    };
    return true; })()`);

  // Le texte REELEMENT a l'ecran dans la video (la phrase avec l'arabe).
  const TEXTE = [
    "D'apres Al-Wahidi (Al-Wahfi bi'l-Wafayat, vol. 2, p. 108) et Ibn Abi Hatim:",
    "\u0644\u064e\u0627 \u062a\u064f\u0634\u0652\u0631\u0650\u0643\u064f\u0648\u0627 \u0628\u0650\u0631\u064e\u0628\u0651\u0650 \u0634\u064e\u064a\u0652\u0621\u064b\u0627",
    "\"N'associe rien a l'adoration de ton Seigneur.\"",
    "(Incluant les anges, ce qui est coherent avec 5:72 : \"Ne venerez pas ceux que vous invoquez avec Allah !\")",
    "Solution: Un scribe a remplace \u0645\u064e\u0627 \u0634\u064e\u064a\u0652\u0621\u064d (man shay'in, \"rien\") par \u0623\u064e\u062d\u064e\u062f\u064b\u0627 (ahadan, \"personne\"), creant une ambiguite."
  ];

  console.log('=== CE QUE L APP ENVOIE AU MOTEUR TTS ===\n');
  for (let i = 0; i < TEXTE.length; i++) {
    await ev(`window.__CAP = [];`);
    const r = await ev(`(()=>{ try { speakText(${JSON.stringify(TEXTE[i])}); return 'ok'; } catch(e){ return 'err: '+e.message; } })()`);
    await sleep(1400);
    const cap = await ev(`window.__CAP`);
    console.log('--- entree ' + (i + 1) + ' ---');
    console.log('  SOURCE : ' + TEXTE[i].slice(0, 95));
    if (cap && cap.length) {
      for (const c of cap) {
        console.log('  LANG   : ' + c.lang + '   VOIX : ' + c.voice);
        console.log('  PARLE  : ' + JSON.stringify(c.text.slice(0, 120)));
      }
    } else {
      console.log('  (rien envoye au moteur)  -> ' + JSON.stringify(r));
    }
    console.log('');
  }

  // Et pour comparaison : la segmentation seule.
  console.log('\n=== SEGMENTATION BRUTE ===');
  const seg = await ev(`(()=>{
    const out = [];
    ${JSON.stringify(TEXTE)}.forEach(function(txt){
      splitByLanguage(txt).forEach(function(s){ out.push({ lang: s.lang, txt: s.text.slice(0,70) }); });
      out.push({ sep: true });
    });
    return out;
  })()`);
  console.log(JSON.stringify(seg, null, 1));

  ws.close(); ch.kill();
  try { srv.close(); } catch (e) {}
  await sleep(400);
  process.exit(0);
})().catch(e => { console.error('ERREUR:', e.message); process.exit(1); });
