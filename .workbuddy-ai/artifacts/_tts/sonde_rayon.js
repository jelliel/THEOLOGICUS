/* Sonde de RAYON : quels mots de la liste anglaise se declenchent sur du
   francais ? On teste chaque mot DANS une vraie phrase francaise (le mot est
   bien present, borne par \b), et on regarde si le detecteur bascule.
   But : mesurer le rayon reel du faux positif avant de corriger. */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WebSocket = require('ws');

const PORT = 8912, CDP = 9453;
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

// Chaque phrase est FRANCAISE et contient le mot teste comme mot entier.
const PHRASES = {
  on:    "On retrouve dans ce passage une mention de l ange Gabriel",
  these: "Cela confirme la these d une modification textuelle ancienne",
  son:   "Le son de la cloche annonce le debut de la messe",
  sont:  "Les anges sont des creatures spirituelles au service de Dieu",
  mais:  "Mais la version satanique inseree par erreur disait ceci",
  pas:   "Le texte ne dit pas que cela soit arrive ainsi",
  plus:  "Il n y a plus aucune mention de ce passage dans le recit",
  pour:  "Pour comprendre ce verset il faut revenir au contexte",
  dans:  "Dans ce passage l auteur cite un texte plus ancien",
  sur:   "Sur ce point les avis des exegetes divergent",
  the:   "La theologie chretienne repose sur la Trinite",
  and:   "Andre et Paul sont deux apotres du Christ",
  of:    "L office de la nuit commence a minuit",
  in:    "Innocence et purete sont exigees du pretre",
  to:    "Torah et Evangile sont deux revelations distinctes",
  for:   "Fort de cette conviction il poursuit son analyse",
  with:  "Le wittern de cette question n est pas tranche",
  at:    "Athenee et Origene sont des auteurs chretiens anciens",
  by:    "Byzance conserve un heritage liturgique propre",
  from:  "Fromage et vin sont benis a certaines fetes",
  is:    "Isabelle et Marie sont deux saintes venerees",
  are:   "Areopage designe le conseil d Athenes",
  was:   "Washington n a jamais ete reconnu par l Eglise",
  were:  "Wereld est un mot neerlandais sans rapport",
  be:    "Beatrice et Dante sont lies par une oeuvre poetique",
  been:  "Been est un mot anglais sans equivalent exact",
  being: "Being est aussi un terme de philosophie",
  have:  "Havelange cite un texte conciliaire ancien",
  has:   "Hassan et Ali sont des prenoms courants",
  had:   "Hadrien et Trajan sont deux empereurs romains",
  do:    "Docteur de l Eglise est un titre accorde a certains saints",
  does:  "Doesburg n est pas un lieu theologiquement notable",
  did:   "Didyme l Aveugle est un auteur alexandrin",
  will:  "Willebrand est un nom sans rapport avec ce sujet",
  would: "Would est un auxiliaire anglais sans usage en francais",
  could: "Could est egalement un auxiliaire anglais",
  should:"Should ne se rencontre pas dans un texte francais",
  may:   "Mayence fut un grand centre theologique",
  might: "Might est un mot anglais sans emploi en francais",
  shall: "Shallowater est un toponyme sans interet ici",
  can:   "Cana est le lieu du premier miracle de Jesus",
  need:  "Needham est un auteur anglais du dix-septieme siecle",
  dare:  "Dare est un verbe anglais sans equivalent direct",
  ought: "Ought est un auxiliaire anglais desuet",
  used:  "Used ne fait pas partie du vocabulaire francais",
  this:  "This est un demonstratif anglais",
  that:  "That est aussi un demonstratif anglais",
  those: "Those est un demonstratif anglais pluriel",
  I:     "Isaie et Jeremie sont deux grands prophetes",
  you:   "Youtube n est pas une source theologique",
  he:    "Helie et Elissee sont deux prophetes de l Ancien Testament",
  she:   "Scheol designe le sejour des morts",
  it:    "Italie et Espagne ont garde le rite romain",
  we:    "Wessobrunner est un toponyme germanique",
  they:  "They est un pronom anglais sans usage en francais",
  me:    "Melchisedech est un personnage mysterieux de la Genese",
  him:   "Himere et Thule sont des lieux antiques",
  her:   "Hera est une divinite grecque",
  us:    "Us est un mot anglais sans usage en francais",
  them:  "Themistius est un commentateur grec ancien",
  my:    "Myre est une ville d Asie Mineure",
  your:  "Your est un possessif anglais",
  his:   "Histoire sacree est le titre d une oeuvre",
  its:   "Its est un possessif anglais",
  our:   "Ourse designe une constellation",
  their: "Their est un possessif anglais",
  mine:  "Mineure designe une region d Asie",
  yours: "Yours est un possessif anglais",
  hers:  "Hers est un possessif anglais",
  ours:  "Ourse et Orion sont deux constellations",
  theirs:"Theirs est un possessif anglais",
  what:  "What est un pronom interrogatif anglais",
  which: "Which est un pronom relatif anglais",
  who:   "Who est un pronom interrogatif anglais",
  whom:  "Whom est un pronom anglais",
  whose: "Whose est un pronom anglais",
  where: "Where est un adverbe anglais",
  when:  "When est un adverbe anglais",
  why:   "Why est un adverbe anglais",
  how:   "How est un adverbe anglais",
  all:   "Alliance designe le pacte entre Dieu et son peuple",
  each:  "Each est un determinant anglais",
  every: "Every est un determinant anglais",
  both:  "Both est un determinant anglais",
  few:   "Few est un determinant anglais",
  more:  "More est un comparatif anglais",
  most:  "Most est un superlatif anglais",
  other: "Other est un determinant anglais",
  some:  "Some est un determinant anglais",
  such:  "Such est un determinant anglais",
  no:    "Noe est le constructeur de l arche",
  not:   "Not est un adverbe anglais",
  only:  "Only est un adverbe anglais",
  own:   "Owens est un nom sans rapport",
  same:  "Same est un adjectif anglais",
  so:    "Socrate et Platon sont deux philosophes grecs",
  than:  "Than est une conjonction anglaise",
  too:   "Too est un adverbe anglais",
  very:  "Very est un adverbe anglais",
  just:  "Just est un adjectif anglais",
  because:"Because est une conjonction anglaise",
  as:    "Asie Mineure est une region de l Empire romain",
  until: "Until est une conjonction anglaise",
  while: "While est une conjonction anglaise",
  about: "About est une preposition anglaise",
  against:"Against est une preposition anglaise",
  between:"Between est une preposition anglaise",
  through:"Through est une preposition anglaise",
  during:"During est une preposition anglaise",
  before:"Before est une preposition anglaise",
  after: "After est une preposition anglaise",
  above: "Above est une preposition anglaise",
  below: "Below est une preposition anglaise",
  up:    "Up est une particule anglaise",
  down:  "Down est une particule anglaise",
  out:   "Out est une particule anglaise",
  off:   "Off est une particule anglaise",
  over:  "Over est une particule anglaise",
  under: "Under est une particule anglaise",
  again: "Again est un adverbe anglais",
  further:"Further est un adverbe anglais",
  then:  "Then est un adverbe anglais",
  once:  "Once est un adverbe anglais",
  here:  "Here est un adverbe anglais",
  there: "There est un adverbe anglais",
  any:   "Any est un determinant anglais",
  nor:   "Nor est une conjonction anglaise",
  s:     "S est une lettre de l alphabet",
  t:     "T est une lettre de l alphabet",
  don:   "Donatisme est une heresie nord-africaine",
  now:   "Now est un adverbe anglais",
};

(async () => {
  const srv = await serve();
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo-ray-'));
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
    const P = ${JSON.stringify(PHRASES)};
    const res = [];
    for (const k in P) res.push({ mot: k, phrase: P[k], verdict: detectScriptLang(P[k]) });
    return res;
  })()`);
  if (out && out.__err) { console.error('l app n a pas expose detectScriptLang'); process.exit(1); }

  const fautifs = out.filter(r => r.verdict !== 'francais');
  console.log('=== RAYON DU FAUX POSITIF ===');
  console.log('   phrases francaises testees      : ' + out.length);
  console.log('   prises pour de l anglais        : ' + fautifs.length);
  console.log('');
  for (const r of out) {
    if (r.verdict !== 'francais') console.log('  FAUX  ' + (r.mot + '            ').slice(0, 14) + ' -> ' + r.verdict);
  }
  console.log('');
  console.log('ECHECS = ' + fautifs.length);
  ws.close(); ch.kill();
  try { srv.close(); } catch (e) {}
  await sleep(400); process.exit(0);
})().catch(e => { console.error('ERREUR:', e.message); process.exit(1); });
