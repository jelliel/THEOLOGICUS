/* Sonde 3 : quels MOTS de la liste anglaise declenchent sur du francais
   NATUREL, et quelle part de la phrase anglaise est-elle vraiment anglaise ?
   On mesure aussi la proportion de mots-outils francais, pour fonder la
   nouvelle regle sur une mesure et non sur une intuition. */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WebSocket = require('ws');

const PORT = 8914, CDP = 9455;
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

// Phrases francaises NATURELLES (aucun mot anglais isole) qui contiennent
// un mot de la liste anglaise. On veut savoir lesquelles declenchent.
const CAS = {
  "on (pronom indefini FR)"      : "On retrouve dans ce passage une mention de l ange Gabriel.",
  "these (FR sans accent)"       : "Cela confirme la these d une modification textuelle ancienne.",
  "the (dans theologie)"         : "La theologie chretienne repose sur le mystere de la Trinite.",
  "the (dans these/accent)"      : "Cette these a ete soutenue devant la faculté.",
  "these (accentue, intact)"     : "Cette thèse a été soutenue devant la faculté de théologie.",
  "theologie (intact)"           : "La théologie chrétienne repose sur le mystère de la Trinité.",
  "son (FR possessif)"           : "Le son de la cloche annonce le debut de la messe.",
  "sont (FR verbe)"              : "Les anges sont des creatures spirituelles au service de Dieu.",
  "mais (FR conjonction)"        : "Mais la version satanique inseree par erreur disait ceci.",
  "pas (FR negation)"            : "Le texte ne dit pas que cela soit arrive ainsi.",
  "plus (FR adverbe)"            : "Il n y a plus aucune mention de ce passage dans le recit.",
  "pour (FR preposition)"        : "Pour comprendre ce verset il faut revenir au contexte.",
  "dans (FR preposition)"        : "Dans ce passage l auteur cite un texte plus ancien.",
  "sur (FR preposition)"         : "Sur ce point les avis des exegetes divergent.",
  "and (dans Andre)"             : "Andre et Paul sont deux apotres du Christ.",
  "in (dans Innocence)"          : "Innocence et purete sont exigees du pretre.",
  "to (dans Torah)"              : "Torah et Evangile sont deux revelations distinctes.",
  "is (dans Isabelle)"           : "Isabelle et Marie sont deux saintes venerees.",
  "as (dans Asie)"               : "Asie Mineure est une region de l Empire romain.",
  "no (dans Noe)"                : "Noe est le constructeur de l arche.",
  "so (dans Socrate)"            : "Socrate et Platon sont deux philosophes grecs.",
  "me (dans Melchisedech)"       : "Melchisedech est un personnage mysterieux de la Genese.",
  "he (dans Helie)"              : "Helie et Elissee sont deux prophetes de l Ancien Testament.",
  "us (dans Augustin)"           : "Saint Augustin revient souvent sur cette question.",
  "may (dans Mayence)"           : "Mayence fut un grand centre theologique.",
  "can (dans Cana)"              : "Cana est le lieu du premier miracle de Jesus.",
  "it (dans Italie)"             : "Italie et Espagne ont garde le rite romain.",
  "she (dans Scheol)"            : "Scheol designe le sejour des morts.",
  "her (dans Hera)"              : "Hera est une divinite grecque.",
  "my (dans Myre)"               : "Myre est une ville d Asie Mineure.",
  "no (dans Noe, phrase longue)" : "Noe est le constructeur de l arche selon le recit de la Genese.",
  "our (dans Ourse)"             : "Ourse est le nom ancien d une constellation boreale.",
  "do (dans Docteur)"            : "Docteur de l Eglise est un titre accorde a certains saints.",
  "did (dans Didyme)"            : "Didyme l Aveugle est un auteur alexandrin.",
  "use (dans Used, anglais)"     : "Used ne fait pas partie du vocabulaire francais courant.",
};

// Ratio de mots-outils francais, pour fonder la regle.
const OUTILS_FR = /\b(le|la|les|un|une|des|du|de|et|est|sont|que|qui|dans|pour|sur|par|avec|ne|pas|plus|ce|cette|ces|son|sa|ses|au|aux|en|il|elle|ils|elles|nous|vous|on|mais|ou|donc|or|ni|car|si|comme|tout|tous|toute|toutes|meme|aussi|bien|peut|doit|fait|ete|avoir|etre)\b/gi;

(async () => {
  const srv = await serve();
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo-ray3-'));
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

  const out = await ev(`(()=>{
    const C = ${JSON.stringify(CAS)};
    const res = [];
    for (const k in C) res.push({ k: k, t: C[k], d: detectScriptLang(C[k]), n: C[k].split(/\\s+/).length });
    return res;
  })()`);
  if (out && out.__err) { console.error('detectScriptLang indisponible'); process.exit(1); }

  console.log('=== QUEL MOT FRANCAIS DECLENCHE LA REGLE ANGLAISE ? ===');
  let faux = 0;
  for (const r of out) {
    const bad = r.d !== 'francais';
    if (bad) faux++;
    console.log('  ' + (bad ? 'ANGLAIS !!' : 'ok        ') + ' ' + (r.k + '                            ').slice(0, 30) + ' -> ' + r.d);
  }
  console.log('');
  console.log('DECLENCHEMENTS = ' + faux + ' / ' + out.length);

  // Ratio d outils francais sur les phrases qui declenchent vs celles qui ne declenchent pas.
  console.log('');
  console.log('=== PROPORTION DE MOTS-OUTILS FRANCAIS (pour fonder la regle) ===');
  for (const r of out) {
    const m = r.t.match(OUTILS_FR);
    const ratio = m ? (m.length / r.n) : 0;
    console.log('  ' + (r.t.slice(0, 44) + '                                                              ').slice(0, 46) +
      ' outils=' + (m ? m.length : 0) + '/' + r.n + ' = ' + ratio.toFixed(2) + '  -> ' + r.d);
  }
  ws.close(); ch.kill();
  try { srv.close(); } catch (e) {}
  await sleep(400); process.exit(0);
})().catch(e => { console.error('ERREUR:', e.message); process.exit(1); });
