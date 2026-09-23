/* Sonde 7 : POURQUOI \bs\b matche-t-il dans "très" ?
   En JS, \w === [A-Za-z0-9_] : il est ASCII seulement. Donc "è" n est PAS un
   caractere de mot : "\bs\b" dans "très" voit une frontiere avant le s
   (entre è et s) et une apres le s. C est le coeur du bug.
   Idem \bme\b dans "poème" (è non-mot -> frontiere).
   On mesure et on verifie la consequence : combien de mots francais courants
   de ce corpus sont touches, et la liste des mots-outils anglais AMBIGUS. */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WebSocket = require('ws');

const PORT = 8918, CDP = 9459;
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

(async () => {
  const srv = await serve();
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo-ray7-'));
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

  console.log('=== POURQUOI \\bs\\b MATCHE DANS UN MOT ACCENTUE ===');
  const r = await ev(`(()=>{
    const out = {};
    out.w_ascii_seulement = /\\w/.test('è') + '  (false => \\w est ASCII : les lettres accentuees ne sont PAS des caracteres de mot)';
    out.frontiere_dans_tres = 'très'.replace(/\\bs\\b/g, '[S]');
    out.frontiere_dans_apres = 'après'.replace(/\\bs\\b/g, '[S]');
    out.frontiere_dans_poeme = 'poème'.replace(/\\bme\\b/g, '[ME]');
    out.frontiere_dans_probleme = 'problème'.replace(/\\bme\\b/g, '[ME]');
    out.frontiere_dans_theologie = 'théologie'.normalize('NFD').replace(/\\bthe\\b/g, '[THE]');
    out.controle_theologie_NFC = 'théologie'.normalize('NFC').replace(/\\bthe\\b/g, '[THE]');
    // Preuve que c est bien \\w ASCII :
    out.avec_u_flag = 'très'.replace(/\\bs\\b/gu, '[S]') + '  (flag u ne change rien, \\w reste ASCII)';
    out.avec_lookaround_unicode = 'très'.replace(/(?<![\\p{L}])(s)(?![\\p{L}])/gu, '[S]') + '  (lookaround Unicode = correct)';
    out.controle_tres_vrai_mot = 'ce sont ses amis'.replace(/(?<![\\p{L}])(s)(?![\\p{L}])/gu, '[S]');
    return out; })()`);
  console.log(JSON.stringify(r, null, 1));

  console.log('');
  console.log('=== COMBIEN DE MOTS DU CORPUS SONT TOUCHES PAR \\bs\\b ET \\bme\\b ? ===');
  const r2 = await ev(`(()=>{
    const RE_S = /\\bs\\b/i, RE_ME = /\\bme\\b/i, RE_T = /\\bt\\b/i, RE_THE = /\\bthe\\b/i;
    const MOTS = ['très','après','progrès','accès','succès','procès','dès','près','sélection','société','piété',
                  'poème','problème','système','baptême','carême','blême','extrême','suprême','thème','théorème',
                  'thèse','théologie','théâtre','théorie','nation','action','question','être','prêtre','père','mère'];
    return MOTS.map(function(w){
      return { mot: w,
        touche_s: RE_S.test(w), touche_me: RE_ME.test(w), touche_t: RE_T.test(w),
        touche_the: RE_THE.test(w), touche_the_nfd: RE_THE.test(w.normalize('NFD')) };
    }); })()`);
  for (const x of r2) {
    const flags = [];
    if (x.touche_s) flags.push('s');
    if (x.touche_me) flags.push('me');
    if (x.touche_t) flags.push('t');
    if (x.touche_the) flags.push('the');
    if (x.touche_the_nfd) flags.push('the(apres NFD)');
    if (flags.length) console.log('  ' + x.mot.padEnd(12) + ' <- ' + flags.join(', '));
  }
  ws.close(); ch.kill();
  try { srv.close(); } catch (e) {}
  await sleep(400); process.exit(0);
})().catch(e => { console.error('ERREUR:', e.message); process.exit(1); });
