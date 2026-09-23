/* Sonde 6 : QUEL mot-outil anglais, exactement, se declenche dans chaque mot
   francais fautif ? On liste le match pour chacun. C est la seule base
   acceptable pour construire une liste noire / un garde-fou francais. */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WebSocket = require('ws');

const PORT = 8917, CDP = 9458;
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

const MOTS = [
  'thèse','théologie','théologien','théorème','théorie','théâtre','thème',
  'très','après','progrès','accès','succès','procès','dès','près',
  'année','journée','matinée','soirée','idée','pensée','armée',
  'vérité','charité','trinité','unité','qualité','autorité','société','piété',
  'études','évêque','être','fenêtre','prêtre','mètre','paramètre',
  'règle','siècle','modèle','fidèle','parallèle','zèle','poème',
  'problème','système','baptême','carême','blême','extrême','suprême',
  'père','mère','frère','espère','révère','prospère','diffère','préfère',
  'trésor','présent','précis','réponse','révélation','récit',
  'nation','objection','option','action','question','fonction','sion',
  'mission','passion','profession','possession','condition','tradition',
  'information','formation','invitation','conversation','civilisation',
  'occasion','élection','sélection','direction','correction','protection',
  'attention','intention','mention','pension','dimension',
  'abstention','ascension','tension','pression','impression','expression',
  'confession','procession','succession','accession','concession',
];

// On reprend la liste anglaise de l app pour trouver le mot fautif.
const ANG = ['the','and','of','in','to','for','with','on','at','by','from','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','shall','can','need','dare','ought','used','this','that','these','those','I','you','he','she','it','we','they','me','him','her','us','them','my','your','his','its','our','their','mine','yours','hers','ours','theirs','what','which','who','whom','whose','where','when','why','how','all','each','every','both','few','more','most','other','some','such','no','not','only','own','same','so','than','too','very','just','because','as','until','while','about','against','between','through','during','before','after','above','below','up','down','out','off','over','under','again','further','then','once','here','there','any','nor','s','t','don','now'];

(async () => {
  const srv = await serve();
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo-ray6-'));
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
    const A = ${JSON.stringify(ANG)};
    // Reconstitue la regex de l app, telle quelle.
    const src = '\\\\b(' + A.join('|') + ')\\\\b';
    const re = new RegExp(src, 'i');
    const reG = new RegExp(src, 'gi');
    const res = [];
    for (const w of M) {
      const ph = 'Le recit de la ' + w + ' est ici expose.';
      const d = detectScriptLang(ph);
      if (d !== 'francais') {
        const nfc = w.normalize('NFC'), nfd = w.normalize('NFD');
        res.push({
          mot: w,
          verdict: d,
          dans_mot_NFC: (nfc.match(reG) || []),
          dans_mot_NFD: (nfd.match(reG) || []),
          nb_mots_phrase: ph.split(/\\s+/).length,
        });
      }
    }
    return res; })()`);
  if (out && out.__err) { console.error(out.__err); process.exit(1); }

  console.log('=== MOT FRANCAIS FAUTIF -> QUEL MOT ANGLAIS LE DECLENCHE ? ===');
  console.log('   (' + out.length + ' mots francais basculent en anglais)');
  console.log('');
  console.log('  ' + 'MOT FRANCAIS'.padEnd(14) + ' A L INTERIEUR DU MOT (NFC)  A L INTERIEUR DU MOT (NFD)');
  console.log('  ' + '-'.repeat(72));
  for (const r of out) {
    const a = (r.dans_mot_NFC.join(',') || '-');
    const b = (r.dans_mot_NFD.join(',') || '-');
    const nfdSeul = (r.dans_mot_NFC.length === 0 && r.dans_mot_NFD.length > 0) ? '  <-- PIEGE NFD' : '';
    console.log('  ' + r.mot.padEnd(14) + ' ' + a.padEnd(26) + ' ' + b.padEnd(26) + nfdSeul);
  }
  console.log('');
  // Quels mots anglais sont responsables ?
  const compteur = {};
  for (const r of out) {
    const tous = [].concat(r.dans_mot_NFC, r.dans_mot_NFD);
    for (const m of new Set(tous.map(x => x.toLowerCase()))) compteur[m] = (compteur[m] || 0) + 1;
  }
  console.log('=== MOTS ANGLAIS RESPONSABLES (par nombre de mots francais touches) ===');
  for (const k of Object.keys(compteur).sort((a, b) => compteur[b] - compteur[a]))
    console.log('  ' + k.padEnd(8) + ' touche ' + compteur[k] + ' mot(s) francais');
  ws.close(); ch.kill();
  try { srv.close(); } catch (e) {}
  await sleep(400); process.exit(0);
})().catch(e => { console.error('ERREUR:', e.message); process.exit(1); });
