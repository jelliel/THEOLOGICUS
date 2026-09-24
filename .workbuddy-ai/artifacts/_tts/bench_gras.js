/* ============================================================================
   Banc — les marqueurs **gras** survivent-ils au rendu, selon la construction ?

   Symptome rapporte : dans certaines puces de reponse, l'utilisateur voit
   `**gras**` en clair au lieu du gras. Le convertisseur existe pourtant
   (THEOLOGICUS.html, inlineMd : `\*\*([^*]+)\*\*` -> <strong>).

   Ce banc ne raisonne pas sur le source : il appelle le VRAI `mdToHtml` dans
   un vrai Chrome et regarde ce qui sort. C'est le seul moyen de savoir QUELLE
   construction echoue — le motif de remplacement a plusieurs etages
   (extraction de references, echappement HTML, restauration de jetons) et une
   lecture attentive ne suffit pas a predire le resultat.

   Usage : node .workbuddy-ai/artifacts/_tts/bench_gras.js
   ============================================================================ */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = 8941;
const CDP = 9486;
const CHROME = 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve('C:/Theologicus');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };

const sleep = ms => new Promise(r => setTimeout(r, ms));
let ech = 0;
const ok = (n, c, d) => { if (!c) ech++; console.log((c ? 'OK    ' : 'ECHEC ') + n + (d !== undefined ? '  -> ' + JSON.stringify(d) : '')); };

/* Les constructions rencontrees dans de vraies reponses. Chacune est une puce
   ou une ligne ; on note ce qu'on ATTEND (du <strong>, pas de ** residuel). */
const ECHANTILLONS = [
  ['puce, gras simple',              '- **gras** simple'],
  ['puce etoile, gras simple',       '* **gras** simple'],
  ['puce numerotee, gras',           '1. **gras** simple'],
  ['puce, gras + reference bible',   '- **Jean 3:16** : texte'],
  ['puce, gras + reference longue',  '- **Ésaïe 1:1** et **Ézéchiel**'],
  ['puce, gras + guillemets fr',     '- **«citation»** texte'],
  ['puce, gras + guillemets droits', '- **"Deus"** texte'],
  ['deux gras dans une puce',        '- **a** et **b**'],
  ['gras contenant de l italique',   '- **gras** avec *italique* dedans'],
  ['gras en fin de puce',            '- texte **gras** fin'],
  ['gras hors puce',                 '**gras** en debut de ligne'],
  ['gras + reference theologique',   '- **Somme théologique** I, q. 1'],
  ['gras, deux-points, gras',        '- **gras** : **autre**'],
  ['gras entre guillemets francais', '- « **gras** »'],
  ['gras DANS une citation fr',     '- Il dit « **Je suis** le chemin »'],
  ['gras DANS une citation dr',     '- Il dit "**Je suis**" le chemin'],
  ['deux citations, gras dedans',   '- « **a** » et « **b** »'],
  ['gras dans une citation fr+txt', '- « **la foi** » est une vertu'],
  ['gras et Source :',              '- **Source : Saint Augustin**'],
  ['gras et Selon',                 '- **Selon saint Thomas**'],
  ['gras autour d une reference',   '- **Augustin, Confessions**'],
  ['gras avec parentheses',          '- **gras avec (parenthèses)**'],
  ['gras avec tiret cadratin',       '- **gras** — tiret'],
  ['gras contenant un deux-points',  '- **a: b**'],
  ['gras avec accents',              '- **Ésaïe, Ézéchiel, Éphésiens**'],
  ['gras multiligne (2 puces)',      '- **a**\n- **b**'],
  ['gras dans un titre ###',         '### **titre gras**'],
  ['gras dans une cellule tableau',  '| **a** | b |\n|---|---|\n| c | d |'],
  ['gras + lien @url',               '- **voir** [ici](@url:`https://example.com`)'],
  ['gras avec un astérisque seul',   '- **a * b**'],
  ['gras contenant un souligne',     '- **a_b**'],
  ['puce simple sans gras',          '- texte ordinaire'],
  ['gras et code inline',            '- **gras** et `code`'],
];

const demarrerServeur = () => new Promise((res, rej) => {
  const srv = http.createServer((q, rp) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/THEOLOGICUS.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rp.writeHead(404); rp.end('404'); return; }
    rp.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(rp);
  });
  srv.on('error', e => rej(new Error('serveur de fichiers : ' + e.message)));
  srv.listen(PORT, '127.0.0.1', () => res(srv));
});

const tuerChromeResiduel = () => new Promise(res => {
  const t = spawn('taskkill', ['/F', '/IM', 'chrome.exe'], { stdio: 'ignore' });
  t.on('exit', () => res()); t.on('error', () => res());
});

let chrome = null, ws = null, requeteCDP = null;

const lancerChrome = async () => {
  await tuerChromeResiduel();
  await sleep(1500);
  const profil = path.join(ROOT, '.workbuddy-ai', 'artifacts', '_tts', 'profil-gras');
  try { fs.rmSync(profil, { recursive: true, force: true }); } catch (e) {}
  chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP,
    '--user-data-dir=' + profil, '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-gpu', '--window-size=1500,900', 'about:blank'], { stdio: 'ignore' });
  chrome.on('error', e => console.log('ERREUR spawn Chrome : ' + e.message));
  let t = null;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    try {
      const ctl = new AbortController();
      const min = setTimeout(() => ctl.abort(), 3000);
      const l = await (await fetch('http://127.0.0.1:' + CDP + '/json/list', { signal: ctl.signal })).json();
      clearTimeout(min);
      t = l.find(x => x.type === 'page' && x.webSocketDebuggerUrl);
      if (t) break;
    } catch (e) {}
  }
  if (!t) throw new Error('Chrome/CDP indisponible sur le port ' + CDP);
  ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
  await new Promise((res, rej) => {
    const min = setTimeout(() => rej(new Error('WebSocket CDP : ouverture sans reponse apres 10 s')), 10000);
    ws.on('open', () => { clearTimeout(min); res(); });
    ws.on('error', e => { clearTimeout(min); rej(new Error('WebSocket CDP : ' + e.message)); });
  });
  let n = 0;
  const pend = new Map();
  const attentes = [];
  ws.setMaxListeners(0);
  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch (e) { return; }
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method) attentes.slice().forEach(f => { if (f.m === m.method) { attentes.splice(attentes.indexOf(f), 1); f.r(m.params); } });
  });
  // UN SEUL compteur d'identifiants pour toute la session (piege du banc v109).
  requeteCDP = (me, pa) => new Promise((res, rej) => {
    const i = ++n;
    const min = setTimeout(() => { pend.delete(i); rej(new Error(me + ' sans reponse apres 25 s')); }, 25000);
    pend.set(i, m => { clearTimeout(min); if (m.error) return rej(new Error(me + ' : ' + JSON.stringify(m.error))); res(m.result); });
    ws.send(JSON.stringify({ id: i, method: me, params: pa || {} }));
  });
  const guetter = (me, ms) => new Promise((res, rej) => {
    const f = { m: me, r: res }; attentes.push(f);
    setTimeout(() => { const k = attentes.indexOf(f); if (k >= 0) { attentes.splice(k, 1); rej(new Error('evenement ' + me + ' jamais recu')); } }, ms || 30000);
  });
  await requeteCDP('Page.enable');
  await requeteCDP('Runtime.enable');
  const charge = guetter('Page.loadEventFired', 45000).catch(() => null);
  await requeteCDP('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/THEOLOGICUS.html' });
  await charge;
};

const ev = async expr => {
  const r = await requeteCDP('Runtime.evaluate', { expression: expr, returnByValue: true, userGesture: true });
  const rr = r && r.result;
  if (!rr) return undefined;
  if (rr.subtype === 'error') throw new Error(rr.description);
  try { return rr.value !== undefined ? JSON.parse(rr.value) : undefined; } catch (e) { return rr.value; }
};

setTimeout(() => { console.log('\nGARDE-FOU : banc interrompu apres 180 s'); process.exit(2); }, 180000);

(async () => {
  let srv = null;
  try {
    console.log('--- Rendu reel des marqueurs **gras** ---\n');
    srv = await demarrerServeur();
    await lancerChrome();

    // mdToHtml est defini au chargement ; on attend plutot que d'esperer.
    let pret = false;
    for (let i = 0; i < 60; i++) {
      if (await ev("typeof mdToHtml==='function'")) { pret = true; break; }
      await sleep(500);
    }
    ok('mdToHtml est disponible dans la page', pret);
    if (!pret) throw new Error('mdToHtml jamais defini');

    // Un seul aller-retour : on rend tous les echantillons d'un coup.
    const rendus = await ev(
      'JSON.stringify((' + JSON.stringify(ECHANTILLONS.map(e => e[1])) + ').map(function(s){' +
      '  try { return mdToHtml(s); } catch (e) { return "ERREUR: " + e.message; }' +
      '}))'
    );
    const sorties = Array.isArray(rendus) ? rendus : JSON.parse(rendus);

    let residuels = 0, sansGras = 0;
    ECHANTILLONS.forEach(([nom, src], i) => {
      const html = String(sorties[i] || '');
      const attendGras = /\*\*/.test(src);
      const reste = html.indexOf('**') !== -1;
      const aStrong = /<strong>/.test(html);
      if (reste) {
        residuels++;
        console.log('ECHEC ' + nom);
        console.log('      entree : ' + JSON.stringify(src));
        console.log('      sortie : ' + JSON.stringify(html.slice(0, 220)));
      } else if (attendGras && !aStrong) {
        sansGras++;
        console.log('ECHEC ' + nom + '  (aucun <strong> produit)');
        console.log('      entree : ' + JSON.stringify(src));
        console.log('      sortie : ' + JSON.stringify(html.slice(0, 220)));
      } else {
        console.log('OK    ' + nom);
      }
    });

    console.log('');
    ok('aucun ** residuel dans le rendu', residuels === 0, residuels + ' cas');
    ok('chaque entree en gras produit bien un <strong>', sansGras === 0, sansGras + ' cas');

    console.log('\n--- Detail des sorties (pour lecture) ---');
    ECHANTILLONS.forEach(([nom, src], i) => {
      console.log('  ' + nom);
      console.log('    in  : ' + JSON.stringify(src));
      console.log('    out : ' + JSON.stringify(String(sorties[i] || '').slice(0, 200)));
    });

  } catch (e) {
    ech++; console.log('\nERREUR BANC : ' + e.message);
  } finally {
    try { if (ws) ws.close(); } catch (e) {}
    try { if (chrome) chrome.kill(); } catch (e) {}
    try { if (srv) srv.close(); } catch (e) {}
  }
  console.log('\n==================================================');
  console.log('VERDICT : ' + ech + ' echec(s)');
  console.log('==================================================');
  process.exit(ech ? 1 : 0);
})();
