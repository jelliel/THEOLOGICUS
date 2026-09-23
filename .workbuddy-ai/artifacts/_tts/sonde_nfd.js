/* Sonde 5 : ETENDUE REELLE DU PIEGE NFD.
   \bthe\b matche "the" a l interieur de "thèse" DES QUE la chaine est en NFD
   (e + U+0300 + ... : l accent combinant n est pas un caractere de mot, donc
   il fait frontiere). On mesure combien de mots francais courants sont
   touches, et si le texte arrive reellement en NFD dans detectScriptLang. */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WebSocket = require('ws');

const PORT = 8916, CDP = 9457;
const CHROME = 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve('C:/Theologicus');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
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

// Mots francais accentues qui, en NFD, exposent un mot anglais.
const MOTS = [
  'thèse','théologie','théologien','théorème','théorie','théâtre','thème',
  'très','après','progrès','accès','succès','procès','dès','près','après',
  'andré','安德','année','journée','matinée','soirée','idée','pensée','armée',
  'vérité','charité','trinité','unité','qualité','autorité','société','piété',
  'études','évêque','être','fenêtre','pêtre','prêtre','mètre','paramètre',
  'règle','siècle','modèle','fidèle','parallèle','zèle','grèle','poème',
  'problème','système','baptême','carême','blême','extrême','suprême',
  'père','mère','frère','espère','révère','prospère','diffère','préfère',
  'trésor','présent','précis','prêtre','réponse','révélation','récit',
  'notation','nation','objection','option','action','question','fonction',
  'sion','mission','passion','profession','possession','condition','tradition',
  'information','formation','invitation','conversation','civilisation',
  'occasion','élection','sélection','direction','correction','protection',
  'attention','intention','intention','mention','pension','dimension',
  'abstention','ascension','tension','pression','impression','expression',
  'confession','procession','succession','accession','concession',
];

// Le declenchement vient-il du NFD (accent combinant) ou du mot plat ?
const THE = /\bthe\b/gi;

(async () => {
  const srv = await serve();
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo-ray5-'));
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
    if (r.result && r.result.exceptionDetails) return { __err: JSON.stringify(r.result.exceptionDetails).slice(0, 300) };
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' + PAGE });
  await sleep(11000);

  const out = await ev(`(()=>{
    const M = ${JSON.stringify(MOTS)};
    const THE = /\\bthe\\b/gi;
    const res = [];
    for (const w of M) {
      const nfc = w.normalize('NFC'), nfd = w.normalize('NFD');
      // phrase reelle courte contenant le mot, en NFC (etat normal du fichier)
      const ph = 'Le recit de la ' + nfc + ' est ici expose.';
      res.push({
        mot: nfc,
        nfd_matche_the: THE.test(nfd),
        nfd_matches: (nfd.match(THE) || []).length,
        phrase_nfc_verdict: detectScriptLang(ph),
        phrase_nfd_verdict: detectScriptLang(ph.normalize('NFD')),
        plat_verdict: detectScriptLang(nfc.replace(/[\\u0300-\\u036f]/g,'')),
      });
    }
    return res; })()`);
  if (out && out.__err) { console.error(out.__err); process.exit(1); }

  const nfdFaux = out.filter(r => r.phrase_nfd_verdict !== 'francais');
  const nfcFaux = out.filter(r => r.phrase_nfc_verdict !== 'francais');
  console.log('=== PIEGE NFD : mots francais accentues, phrase "Le recit de la <mot> est ici expose." ===');
  console.log('   mots testes                              : ' + out.length);
  console.log('   phrase en NFC (etat normal du fichier)   -> faux positifs : ' + nfcFaux.length);
  console.log('   phrase en NFD (apres normalisation)      -> faux positifs : ' + nfdFaux.length);
  console.log('');
  console.log('  --- ceux qui basculent EN NFD seulement (le piege de l accent combinant) ---');
  for (const r of out) {
    if (r.nfd_matche_the && r.phrase_nfd_verdict !== 'francais')
      console.log('    ' + (r.mot + '            ').slice(0, 14) + ' the x' + r.nfd_matches + '  NFC=' + r.phrase_nfc_verdict + '  NFD=' + r.phrase_nfd_verdict);
  }
  console.log('');
  console.log('  --- ceux qui basculent DEJA en NFC (liste anglaise elle-meme) ---');
  for (const r of nfcFaux)
    console.log('    ' + (r.mot + '            ').slice(0, 14) + '  NFC=' + r.phrase_nfc_verdict);
  console.log('');
  console.log('ECHECS = ' + nfdFaux.length + ' (en NFD) / ' + nfcFaux.length + ' (en NFC)');
  ws.close(); ch.kill();
  try { srv.close(); } catch (e) {}
  await sleep(400); process.exit(0);
})().catch(e => { console.error('ERREUR:', e.message); process.exit(1); });
