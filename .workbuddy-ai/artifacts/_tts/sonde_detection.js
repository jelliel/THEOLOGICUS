/* Le francais est-il bien DETECTE comme francais, ou bascule-t-il en anglais ?
   detectScriptLang() a une heuristique anglaise : si le texte contient des mots
   anglais courants ("the", "and", "of", "in", "to", "is", "on", "at"...) ET
   >= 3 mots, il renvoie 'anglais'. Du texte FRANCAIS peut declencher ce piege
   ("in" dans "initial", borne par \b ? "on" dans "ordonne" ?). On mesure. */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WebSocket = require('ws');

const PORT = 8907, CDP = 9448;
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
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo-tts7-'));
  const ch = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP,
    '--user-data-dir=' + prof, '--no-first-run', '--disable-gpu',
    '--window-size=1500,900', 'about:blank'], { stdio: 'ignore' });
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
    if (r.result && r.result.exceptionDetails) return { __err: 'exc' };
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' + PAGE });
  await sleep(11000);

  console.log('=== detectScriptLang() SUR DU FRANCAIS REEL ===');
  const cas = [
    "Voici les citations littérales des exégètes musulmans sur ce verset.",
    "Problème : Ce verset ordonne de ne pas associer quiconque à l'adoration d'Allah.",
    "D'après Ibn Abi Hatim et Al-Wahidi, le verset initial était :",
    "Mais la version satanique insérée par erreur disait ceci.",
    "La lecture est-elle correcte et l'analyse pertinente ?",
    "Ce verset fut révélé, puis retiré parce qu'il incluait les anges dans l'adoration.",
    "Les Compagnons dirent : Comment vénérerions-nous les anges alors qu'ils sont des serviteurs ?",
    "Alors Allah a corrigé en précisant que l'adoration ne doit viser que Lui.",
    "Il est important de noter que cette analyse reste débattue entre les savants.",
    "On retrouve dans ce passage une mention de l'ange Gabriel et de son rôle.",
    "Cela confirme la thèse d'une modification textuelle ancienne.",
    "Question posée : Réponse doctrinale sur ce point précis."
  ];
  const res = await ev(`(()=>{ const out=[];
    ${JSON.stringify(cas)}.forEach(function(t){ out.push({ t: t.slice(0,58), d: detectScriptLang(t) }); });
    return out; })()`);
  let fauxAnglais = 0;
  for (const r of res) {
    const mauvais = r.d === 'anglais';
    if (mauvais) fauxAnglais++;
    console.log((mauvais ? '  ANGLAIS !! ' : '  ok        ') + r.d.padEnd(9) + ' | ' + r.t);
  }
  console.log('');
  ok('1. detection : aucun texte francais pris pour de l anglais', fauxAnglais === 0, fauxAnglais + ' faux');

  console.log('\n=== ET APRES cleanMd() (utilise par speakConversation) ===');
  const apres = await ev(`(()=>{ const out=[];
    ${JSON.stringify(cas)}.forEach(function(t){
      const c = cleanMd(t);
      out.push({ orig: t.slice(0,40), clean: c.slice(0,50), d: detectScriptLang(c) }); });
    return out; })()`);
  let faux2 = 0;
  for (const r of apres) {
    const mauvais = r.d !== 'francais';
    if (mauvais) faux2++;
    console.log((mauvais ? '  ' + r.d.toUpperCase() + ' !! ' : '  ok        ') + JSON.stringify(r.clean));
  }
  console.log('');
  ok('2. apres cleanMd : toujours du francais', faux2 === 0, faux2 + ' fautifs');

  console.log('\n=== LA REGLE ANGLAISE EN DETAIL ===');
  console.log(JSON.stringify(await ev(`(()=>{
    const englishWords = new RegExp('\\\\b(the|and|of|in|to|for|with|on|at|by|from|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|could|should|may|might|shall|can|need|dare|ought|used|this|that|these|those|I|you|he|she|it|we|they|me|him|her|us|them|my|your|his|its|our|their|mine|yours|hers|ours|theirs|what|which|who|whom|whose|where|when|why|how|all|each|every|both|few|more|most|other|some|such|no|not|only|own|same|so|than|too|very|just|because|as|until|while|of|at|by|for|with|about|against|between|through|during|before|after|above|below|to|from|up|down|in|out|on|off|over|under|again|further|then|once|here|there|when|where|why|how|all|any|both|each|few|more|most|other|some|such|no|nor|not|only|own|same|so|than|too|very|s|t|can|will|just|don|should|now)\\\\b','i');
    const tests = ['Il est important de noter que cette analyse reste debattue',
                   'On retrouve dans ce passage une mention de l ange Gabriel',
                   'Cela confirme la these d une modification textuelle ancienne',
                   'Les Compagnons dirent Comment venererions nous les anges',
                   'Alors Allah a corrige en precisant que l adoration ne doit viser que Lui'];
    return tests.map(function(t){
      const m = t.match(englishWords);
      return { t: t.slice(0,44), mots: t.split(/\\s+/).length, trouves: m ? m.slice(0,6) : [], verdict: detectScriptLang(t) };
    }); })()`), null, 1));

  console.log('\nECHECS = ' + ech + (ech ? '  -> A CORRIGER' : '  -> TOUT OK'));
  ws.close(); ch.kill();
  try { srv.close(); } catch (e) {}
  await sleep(400); process.exit(ech ? 1 : 0);
})().catch(e => { console.error('ERREUR:', e.message); process.exit(1); });
