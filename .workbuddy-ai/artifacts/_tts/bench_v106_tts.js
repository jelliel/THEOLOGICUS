/* Verification des trois correctifs v106. */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WebSocket = require('ws');

const PORT = 8905, CDP = 9445;
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
let ech = 0;
const ok = (n, c, d) => { if (!c) ech++; console.log((c ? 'OK    ' : 'ECHEC ') + n + (d !== undefined ? '  -> ' + JSON.stringify(d) : '')); };

(async () => {
  const srv = await serve();
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo-tts5-'));
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
  const errs = [];
  ws.on('message', raw => {
    const m = JSON.parse(raw.toString());
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails.exception||{}).description || 'exc');
  });
  const send = (me, pa) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: me, params: pa || {} })); });
  const ev = async e => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) return { __err: ((r.result.exceptionDetails.exception || {}).description || '').slice(0, 300) };
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' + PAGE });
  await sleep(11000);

  console.log('=== CORRECTIF 1 : getVoiceForLang ne sert plus la voix FR pour une autre langue ===');
  const resolu = await ev(`(()=>{ const o={};
    ['francais','anglais','arabe','hebreu','grec','espagnol','italien','allemand','latin'].forEach(function(l){
      try { const v = getVoiceForLang(l); o[l] = v ? (v.name+' ('+v.lang+')') : null; }
      catch(e){ o[l] = 'err:'+e.message; } });
    return o; })()`);
  console.log('  resolution :', JSON.stringify(resolu, null, 1));
  ok('1a. francais -> une voix francaise', !!(resolu.francais && /fr/.test(resolu.francais)), resolu.francais);
  ok('1b. arabe -> une voix arabe', !!(resolu.arabe && /ar/.test(resolu.arabe)), resolu.arabe);
  ok('1c. hebreu -> NULL (pas de voix FR volee)', resolu.hebreu === null, resolu.hebreu);
  ok('1d. grec -> NULL (pas de voix FR volee)', resolu.grec === null, resolu.grec);

  console.log('\n=== CORRECTIF 2 : le repli phonetique se declenche enfin ===');
  const HE = '\u05d9\u05b0\u05d4\u05d5\u05b9\u05e9\u05bb\u05c1\u05e2\u05b7';           // יְהוֹשֻׁעַ
  const EL = '\u03bb\u03cc\u03b3\u03bf\u03c2';                                          // λόγος
  const uttHe = await ev(`(()=>{ const u = makeUtterance(${JSON.stringify(HE)}, 'hebreu');
    return u ? { text: u.text, lang: u.lang, voice: u.voice?u.voice.name:null } : 'NULL'; })()`);
  const uttEl = await ev(`(()=>{ const u = makeUtterance(${JSON.stringify(EL)}, 'grec');
    return u ? { text: u.text, lang: u.lang, voice: u.voice?u.voice.name:null } : 'NULL'; })()`);
  console.log('  hebreu :', JSON.stringify(uttHe));
  console.log('  grec   :', JSON.stringify(uttEl));
  ok('2a. hebreu : repli phonetique (texte translittere, voix FR)',
     !!(uttHe && typeof uttHe === 'object' && uttHe.text && /[a-z]/i.test(uttHe.text) && !/[\u0590-\u05FF]/.test(uttHe.text) && /fr/.test(uttHe.lang)), uttHe);
  ok('2b. grec : repli phonetique (texte translittere, voix FR)',
     !!(uttEl && typeof uttEl === 'object' && uttEl.text && /[a-z]/i.test(uttEl.text) && !/[\u0370-\u03FF]/.test(uttEl.text) && /fr/.test(uttEl.lang)), uttEl);

  console.log('\n=== CORRECTIF 3 : la reference n est plus coupee ===');
  const seg3 = await ev(`(()=>{
    const cas = ['Exode 24:12 dit ceci.', 'Coran 20:12 et 5:72 sont cites.',
                 'Voir Jean 3:16 (Dieu a tant aime).', 'Fin.', 'Question ?'];
    return cas.map(function(txt){
      const s = splitByLanguage(txt);
      return { src: txt, n: s.length, segs: s.map(function(x){ return x.text; }) };
    });
  })()`);
  for (const c of seg3) console.log('  ' + c.n + ' seg  ' + JSON.stringify(c.segs));
  ok('3a. « Exode 24:12 » reste dans UN segment',
     seg3[0].segs.some(s => /24:12/.test(s)), seg3[0].segs);
  ok('3b. aucun segment orphelin du type "12 "',
     !seg3[0].segs.some(s => /^\s*\d{1,3}\s*$/.test(s)), seg3[0].segs);
  ok('3c. « Coran 20:12 et 5:72 » : les deux refs survivent',
     seg3[1].segs.some(s => /20:12/.test(s)), seg3[1].segs);

  console.log('\n=== NON-REGRESSION : le deux-points reste un separateur ailleurs ===');
  const seg4 = await ev(`(()=>{ const s = splitByLanguage('Attention : voici la suite.');
    return s.map(function(x){ return { lang: x.lang, t: x.text }; }); })()`);
  console.log('  ', JSON.stringify(seg4));

  console.log('\n=== MIXTE ARABE + FR (le cas de la video) ===');
  const AR = '\u0645\u064e\u0627 \u0634\u064e\u064a\u0652\u0621\u064d';
  const mixte = await ev(`(()=>{ const s = splitByLanguage('Un scribe a remplace ${AR} (man shay in) par ${'\u0623\u064e\u062d\u064e\u062f\u064b\u0627'} creant une ambiguite.');
    return s.map(function(x){ return { lang: x.lang, t: x.text }; }); })()`);
  console.log('  ', JSON.stringify(mixte, null, 1));
  ok('4. les deux mots arabes sont isoles en segments arabes',
     mixte.filter(s => s.lang === 'arabe').length === 2, mixte.filter(s => s.lang === 'arabe').length);

  console.log('\n=== ERREURS JS ===');
  ok('5. aucune erreur JS', errs.length === 0, errs.slice(0, 3));

  console.log('\nECHECS = ' + ech + (ech ? '  -> A CORRIGER' : '  -> TOUT OK'));
  ws.close(); ch.kill();
  try { srv.close(); } catch (e) {}
  await sleep(400); process.exit(ech ? 1 : 0);
})().catch(e => { console.error('ERREUR:', e.message); process.exit(1); });
