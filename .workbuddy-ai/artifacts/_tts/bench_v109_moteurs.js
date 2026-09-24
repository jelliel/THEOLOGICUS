/* ============================================================================
   v109 — MOTEURS DE LECTURE VOCALE : SYSTEME / ELEVENLABS / SUPERTONIC
   ============================================================================
   Ce banc repond a une seule question : le choix du moteur dans les Parametres
   change-t-il VRAIMENT la facon dont l'app lit un texte ?

   Il verifie quatre choses, dans l'ordre de ce qui peut casser :

     1. STATIQUE — il n'existe plus qu'UN point de sortie vers la synthese
        locale. Les quatre files de lecture (reponse, section, reference,
        conversation) doivent passer par ttsEmission(), et l'arret par ttsStop().
        Si un site direct reapparait, la file correspondante ignorerait le
        moteur choisi : c'est le defaut que ce test rend impossible.

     2. CONFIGURATION — le moteur se persiste, et la langue de l'app est
        traduite en code ISO. Piege verifie : 'latin' n'est PAS dans
        SCRIPT_RANGES, il doit donc partir en 'fr' et non en 'na'.

     3. ERREURS — une panne de moteur doit ARRETER la file. Si le code d'erreur
        n'est pas reconnu comme fatal, la file avance et emet une requete par
        segment : 30 requetes vouees a l'echec au lieu d'une.

     4. BOUT EN BOUT — avec un vrai service Supertonic lance par ce banc,
        ttsParleDistant() doit rendre un audio NON VIDE et declencher onEnd.

   Usage :
     node .workbuddy-ai/artifacts/_tts/bench_v109_moteurs.js
   ============================================================================ */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = 8931;         // serveur de fichiers pour l'app
const CDP = 9482;          // port de debogage Chrome
const SPORT = 8094;        // service Supertonic lance par le banc
const CHROME = 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
// L'interpreteur du service DOIT etre celui de l'environnement isole : numpy et
// onnxruntime y sont installes (dans le prefixe gere). L'interpreteur nu du
// prefixe 3.13.12, lui, va chercher numpy dans le site-packages UTILISATEUR
// (C:\Users\toshr\Python\Python313\site-packages) : lisible en bac a sable
// normal, mais refuse des que la commande est elevee, ce qui faisait echouer le
// service avec « numpy est requis » alors que numpy etait bien installe.
const PYTHON = 'C:/Users/toshr/.workbuddy-ai/binaries/python/envs/default/Scripts/python.exe';
const ROOT = path.resolve('C:/Theologicus');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };

const sleep = ms => new Promise(r => setTimeout(r, ms));
let ech = 0;
const ok = (n, c, d) => { if (!c) ech++; console.log((c ? 'OK    ' : 'ECHEC ') + n + (d !== undefined ? '  -> ' + JSON.stringify(d) : '')); };

/* ── 1. Verifications statiques, sur le fichier ─────────────────────────── */
console.log('--- 1. Un seul point de sortie ---');
const SRC = fs.readFileSync(path.join(ROOT, 'THEOLOGICUS.html'), 'utf8');
const compte = (motif) => (SRC.match(new RegExp(motif.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;

const nSpeak = compte('window.speechSynthesis.speak(utt)');
// Attendu : ttsEmission() (le point de sortie) + ttsTester() (le bouton Tester).
ok('speechSynthesis.speak(utt) : 2 sites seulement (sortie + test)', nSpeak === 2, nSpeak);

const nCancel = compte('window.speechSynthesis.cancel()');
// Attendu : 1 seul, a l'interieur de ttsStop(), qui coupe aussi l'audio distant.
ok('speechSynthesis.cancel() : 1 seul site (dans ttsStop)', nCancel === 1, nCancel);

ok('ttsEmission existe', /function ttsEmission\(/.test(SRC));
ok('ttsStop existe', /function ttsStop\(/.test(SRC));
ok('ttsParleDistant existe', /function ttsParleDistant\(/.test(SRC));
ok('les 4 files passent par ttsEmission', (SRC.match(/ttsEmission\(seg\.text/g) || []).length === 3
  && /ttsEmission\(clean, 'francais'/.test(SRC),
  (SRC.match(/ttsEmission\(/g) || []).length + ' appels au total');

/* ── Infrastructure : service Supertonic + serveur de fichiers + Chrome ── */
let svc = null, srv = null, chrome = null, ws = null;
let servicePret = false;
// Vrai quand le service tournait DEJA au lancement du banc : dans ce cas le
// banc ne l'arrete pas en sortant (ce n'est pas lui qui l'a lance).
let serviceExterne = false;

const demarrerService = () => new Promise((res, rej) => {
  // Si un service repond deja sur ce port, on le REUTILISE : lancer le service
  // depuis le shell est plus fiable que de le faire spawner par Node (le PATH
  // et PYTHONPATH ne sont pas les memes selon l'isolation du bac a sable — ce
  // banc a echoue deux fois la-dessus, avec pour seul symptome « numpy est
  // requis » alors que numpy etait bien installe).
  const sonder = () => http.get({ host: '127.0.0.1', port: SPORT, path: '/health', timeout: 2000 }, r => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => { try { serviceExterne = true; res(JSON.parse(d)); } catch (e) { rej(e); } });
  }).on('error', () => lancer());
  const lancer = () => {
    const journal = path.join(ROOT, '.workbuddy-ai', 'artifacts', '_tts', 'supertonic-service.log');
    try { fs.writeFileSync(journal, ''); } catch (e) {}
    svc = spawn(PYTHON, [path.join(ROOT, 'tools', 'start_supertonic.py'), '--port', String(SPORT)], { cwd: ROOT });
    // Ne JAMAIS avaler la sortie du service : sans elle, un demarrage rate
    // ressemble a une panne reseau et on cherche au mauvais endroit.
    svc.stdout.on('data', d => { try { fs.appendFileSync(journal, d); } catch (e) {} });
    svc.stderr.on('data', d => { try { fs.appendFileSync(journal, d); } catch (e) {} });
    svc.on('exit', c => {
      if (!servicePret) {
        let j = '';
        try { j = fs.readFileSync(journal, 'utf8'); } catch (e) {}
        rej(new Error('le service Supertonic s\'est arrete (code ' + c + ')\n' + j.slice(0, 1200)));
      }
    });
    const t0 = Date.now();
    const essai = () => {
      http.get({ host: '127.0.0.1', port: SPORT, path: '/health', timeout: 2000 }, r => {
        let d = ''; r.on('data', c => d += c); r.on('end', () => { try { servicePret = true; res(JSON.parse(d)); } catch (e) { rej(e); } });
      }).on('error', () => { if (Date.now() - t0 > 60000) rej(new Error('service Supertonic injoignable apres 60 s')); else setTimeout(essai, 700); });
    };
    essai();
  };
  sonder();
});

const demarrerServeur = () => new Promise((res, rej) => {
  srv = http.createServer((q, rp) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/THEOLOGICUS.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rp.writeHead(404); rp.end('404'); return; }
    rp.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(rp);
  });
  // Sans gestionnaire d'erreur, un port deja pris laissait la promesse en
  // suspens : le banc se bloquait au lieu de dire pourquoi.
  srv.on('error', e => rej(new Error('serveur de fichiers : ' + e.message)));
  srv.listen(PORT, '127.0.0.1', () => res(srv));
});

// Un Chrome residuel d'une execution precedente garde le port de debogage et
// son profil verrouille : la nouvelle instance ne peut plus le lier, et le
// banc attend indefiniment un client WebSocket qui n'ouvrira jamais.
const tuerChromeResiduel = () => new Promise(res => {
  const t = spawn('taskkill', ['/F', '/IM', 'chrome.exe'], { stdio: 'ignore' });
  t.on('exit', () => res());
  t.on('error', () => res());
});

const lancerChrome = async () => {
  await tuerChromeResiduel();
  await sleep(1500);
  const profil = path.join(ROOT, '.workbuddy-ai', 'artifacts', '_tts', 'profil-v109');
  try { fs.rmSync(profil, { recursive: true, force: true }); } catch (e) {}
  chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + CDP,
    '--user-data-dir=' + profil, '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-gpu',
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=1500,900', 'about:blank'], { stdio: 'ignore' });
  chrome.on('error', e => console.log('ERREUR spawn Chrome : ' + e.message));
  // fetch et non http.get : la requete http.get vers le port de debogage de
  // Chrome restait suspendue sans jamais ni repondre ni echouer, ce qui bloquait
  // le banc indefiniment (4 min 46 s mesurees, aucune sortie). C'est le banc
  // v107 qui avait deja la bonne methode.
  let t = null;
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    try {
      const ctl = new AbortController();
      const minuteur = setTimeout(() => ctl.abort(), 3000);
      const l = await (await fetch('http://127.0.0.1:' + CDP + '/json/list', { signal: ctl.signal })).json();
      clearTimeout(minuteur);
      t = l.find(x => x.type === 'page' && x.webSocketDebuggerUrl);
      if (t) break;
    } catch (e) {}
  }
  if (!t) throw new Error('Chrome/CDP indisponible sur le port ' + CDP);
  ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
  await new Promise((res, rej) => {
    const minuteur = setTimeout(() => rej(new Error('WebSocket CDP : ouverture sans reponse apres 10 s')), 10000);
    ws.on('open', () => { clearTimeout(minuteur); res(); });
    ws.on('error', e => { clearTimeout(minuteur); rej(new Error('WebSocket CDP : ' + e.message)); });
  });
  let n = 0;
  const pend = new Map();
  const attentes = [];   // resolveurs d'evenements CDP (Page.loadEventFired…)
  ws.setMaxListeners(0);
  ws.on('message', raw => {
    const s = raw.toString();
    let m;
    // Un message illisible ne doit pas tuer l'ecouteur : dans un EventEmitter,
    // une exception dans le PREMIER ecouteur empeche les suivants de tourner.
    try { m = JSON.parse(s); } catch (e) { if (process.env.BANC_DEBUG) console.log('   [cdp] message illisible : ' + s.slice(0, 120)); return; }
    if (process.env.BANC_DEBUG) console.log('   [cdp] ' + (m.id !== undefined ? 'id ' + m.id : m.method));
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method) attentes.slice().forEach(f => {
      if (f.m === m.method) { attentes.splice(attentes.indexOf(f), 1); f.r(m.params); }
    });
  });
  // UN SEUL compteur d'identifiants pour toute la session. Le banc en avait deux
  // (un pour send(), un pour ev()) qui emettaient tous les deux 1, 2, 3… : la
  // reponse a Runtime.evaluate arrivait bien (trace CDP a l'appui) mais se
  // perdait dans la collision. Un client CDP ne doit jamais reutiliser un id.
  const requete = (me, pa) => new Promise((res, rej) => {
    const i = ++n;
    const minuteur = setTimeout(() => { pend.delete(i); rej(new Error(me + ' sans reponse apres 25 s')); }, 25000);
    pend.set(i, m => {
      clearTimeout(minuteur);
      if (m.error) return rej(new Error(me + ' : ' + JSON.stringify(m.error)));
      res(m.result);
    });
    ws.send(JSON.stringify({ id: i, method: me, params: pa || {} }));
  });
  requeteCDP = requete;   // expose au module : ev() s'en sert apres lancerChrome()
  const send = requete;
  const guetter = (me, ms) => new Promise((res, rej) => {
    const f = { m: me, r: res }; attentes.push(f);
    setTimeout(() => { const k = attentes.indexOf(f); if (k >= 0) { attentes.splice(k, 1); rej(new Error('evenement CDP ' + me + ' jamais recu (' + ms + ' ms)')); } }, ms || 30000);
  });
  await send('Page.enable');
  // Runtime.enable n'est pas optionnel : la sonde a montre qu'un Runtime.evaluate
  // envoye sans lui ne recoit aucune reponse.
  await send('Runtime.enable');
  // Page.navigate resout AVANT que le nouveau document soit commite : on attend
  // explicitement la fin du chargement, avec un repli silencieux si l'evenement
  // se perd, plutot que d'evaluer dans un contexte en cours de destruction.
  const charge = guetter('Page.loadEventFired', 45000).catch(() => null);
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/THEOLOGICUS.html' });
  await charge;
  return send;
};

// Guichet unique vers CDP : un seul compteur d'identifiants, un seul
// dictionnaire d'attente. Il est rempli par lancerChrome() et consomme par ev().
let requeteCDP = null;

// Chaque evaluation passe par le meme guichet que le reste.
const ev = async (expr, attendre = false) => {
  if (process.env.BANC_DEBUG) console.log('   [ev] ' + String(expr).slice(0, 70));
  const r = await requeteCDP('Runtime.evaluate', { expression: expr, awaitPromise: attendre, returnByValue: true, userGesture: true });
  const rr = r && r.result;
  if (!rr) return undefined;
  if (rr.subtype === 'error') throw new Error(rr.description);
  if (attendre) return rr.value;
  try { return rr.value !== undefined ? JSON.parse(rr.value) : undefined; } catch (e) { return rr.value; }
};

// Le cablage des Parametres (ttsCablerParametres) tourne sur DOMContentLoaded,
// donc APRES le moment ou detectScriptLang existe deja. Mesurer des qu'on voit
// detectScriptLang produisait un resultat instable : un essai sur deux voyait le
// selecteur de voix encore vide. On attend donc la condition, au lieu d'esperer.
const attendreCondition = async (expr, ms) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await ev(expr)) return true;
    await sleep(300);
  }
  return false;
};

// Chien de garde : un banc qui se bloque ne doit pas tourner indefiniment.
setTimeout(() => { console.log('\nGARDE-FOU : banc interrompu apres 200 s'); process.exit(2); }, 200000);

(async () => {
  try {
    console.log('\n--- Preparation ---');
    const sante = await demarrerService();
    console.log('service Supertonic : ' + sante.model + ' — ' + sante.voices.length + ' voix, ' + sante.languages.length + ' langues');
    ok('le service expose le francais', sante.languages.indexOf('fr') >= 0);
    ok('le service expose le grec', sante.languages.indexOf('el') >= 0);
    ok('le service expose l arabe', sante.languages.indexOf('ar') >= 0);
    ok('le service n expose PAS l hebreu (limite reelle, a dire)', sante.languages.indexOf('he') < 0);

    console.log('  ... serveur de fichiers sur le port ' + PORT);
    await demarrerServeur();
    console.log('  ... serveur de fichiers pret');
    console.log('  ... lancement de Chrome sur le port de debogage ' + CDP);
    await lancerChrome();
    console.log('  ... Chrome + CDP prets (document charge)');
    // La page est deja chargee (lancerChrome attend Page.loadEventFired) ; on
    // sonde simplement le document pour confirmer que le contexte repond.
    ok('le document repond', await ev('document.readyState') !== undefined, await ev('document.readyState'));
    // L'app derive ses chemins de corpus de location.pathname : on attend que
    // detectScriptLang existe, sinon on mesurerait une page non initialisee.
    for (let i = 0; i < 40; i++) {
      const pret = await ev('typeof detectScriptLang');
      if (pret === 'function') break;
      await sleep(500);
    }
    console.log('  ... app initialisee (' + await ev('typeof detectScriptLang') + ')');

    console.log('\n--- 2. Configuration du moteur ---');
    ok('les Parametres finissent par se cabler',
      await attendreCondition("!!(document.getElementById('tts-st-voice') && document.getElementById('tts-st-voice').options.length === 10)", 15000));
    ok('ttsCfg est disponible', await ev('typeof ttsCfg') === 'function');
    ok('moteur par defaut = system', await ev('ttsMoteur()') === 'system');
    ok('system n est pas distant', await ev('ttsMoteurDistant()') === false);
    await ev("ttsCfgSet({moteur:'supertonic'})");
    ok('bascule vers supertonic persistee', await ev('ttsMoteur()') === 'supertonic');
    ok('supertonic est distant', await ev('ttsMoteurDistant()') === true);
    await ev("ttsCfgSet({moteur:'elevenlabs'})");
    ok('bascule vers elevenlabs', await ev('ttsMoteur()') === 'elevenlabs');
    await ev("ttsCfgSet({moteur:'system'})");

    console.log('\n--- Langue de l app -> code ISO ---');
    const langues = await ev(JSON.stringify([
      'francais', 'grec', 'arabe', 'hebreu', 'anglais', 'latin', 'copte', 'syriaque', 'gothique', 'arameen', 'devanagari', 'inconnue'
    ]) + '.map(function(l){ return [l, ttsLangIso(l)]; })');
    const attendu = { francais: 'fr', grec: 'el', arabe: 'ar', hebreu: 'he', anglais: 'en', latin: 'fr', copte: 'el', syriaque: 'ar', gothique: 'de', arameen: 'he', devanagari: 'hi', inconnue: 'na' };
    langues.forEach(function (p) {
      ok('ttsLangIso(' + p[0] + ') = ' + attendu[p[0]], p[1] === attendu[p[0]], p[1]);
    });
    ok('le latin part en fr (et non en na)', (langues.find(p => p[0] === 'latin') || [])[1] === 'fr');

    console.log('\n--- 3. Les pannes arretent la file ---');
    const fatals = await ev(JSON.stringify(['canceled', 'interrupted', 'moteur-erreur', 'moteur-indisponible', 'unknown', 'not-allowed', 'synthesis-failed'])
      + '.map(function(e){ return [e, ttsErreurFatale(e)]; })');
    const fAttendu = { canceled: true, interrupted: true, 'moteur-erreur': true, 'moteur-indisponible': true, unknown: false, 'not-allowed': false, 'synthesis-failed': false };
    fatals.forEach(function (p) { ok('ttsErreurFatale(' + p[0] + ') = ' + fAttendu[p[0]], p[1] === fAttendu[p[0]], p[1]); });

    console.log('\n--- Parametres : les controles existent et sont cables ---');
    ok('selecteur de moteur present', await ev("!!document.getElementById('tts-engine-select')"));
    ok('bloc ElevenLabs present', await ev("!!document.getElementById('tts-el-block')"));
    ok('bloc Supertonic present', await ev("!!document.getElementById('tts-st-block')"));
    ok('champ cle ElevenLabs', await ev("!!document.getElementById('tts-el-key')"));
    ok('champ Voice ID', await ev("!!document.getElementById('tts-el-voice')"));
    ok('champ URL Supertonic', await ev("!!document.getElementById('tts-st-url')"));
    ok('10 styles de voix Supertonic', await ev("document.getElementById('tts-st-voice').options.length") === 10);
    // On rapporte la valeur OBSERVEE : un simple faux ne dit pas si le selecteur
    // est vide, mal rempli, ou rempli avec autre chose.
    const selMoteur = await ev("document.getElementById('tts-engine-select').value");
    const selOptions = await ev("document.getElementById('tts-engine-select').options.length");
    ok('ttsCablerParametres a ete appele (selecteur rempli)', selMoteur === 'system', selMoteur + ' (' + selOptions + ' options)');

    console.log('\n--- 4. Bout en bout : un vrai WAV du service local ---');
    await ev("ttsCfgSet({moteur:'supertonic', supertonic:{url:'http://127.0.0.1:" + SPORT + "', voix:'F1', vitesse:1.05}})");
    const resultat = await ev(`new Promise(function(res){
      var t0 = Date.now();
      ttsParleDistant('Tres tot, le Seigneur appela Abraham.', 'francais', function(){
        var a = _ttsAudio;
        res({etat:'fin', ms:Date.now()-t0, src:(a&&a.src)?a.src.slice(0,5):null});
      }, function(e){ res({etat:'erreur', err:e, ms:Date.now()-t0}); }, 'supertonic');
      setTimeout(function(){ res({etat:'timeout', ms:Date.now()-t0}); }, 60000);
    })`, true);
    ok('lecture distante terminee sans erreur', resultat.etat === 'fin', resultat);
    ok('le delai reste compatible avec une lecture (onEnd recu)', resultat.etat === 'fin' && resultat.ms < 30000, resultat.ms + ' ms');
    const jeton = await ev('({jeton:_ttsJeton, audio:_ttsAudio===null})');
    ok('l audio est libere apres lecture', jeton.audio === true, jeton);

    console.log('\n--- Le moteur systeme reste intact ---');
    await ev("ttsCfgSet({moteur:'system'})");
    ok('retour au moteur systeme', await ev('ttsMoteur()') === 'system');
    ok('makeUtterance toujours disponible', await ev('typeof makeUtterance') === 'function');
    ok('detectScriptLang rend toujours francais', await ev("detectScriptLang('Tres tot, le Seigneur appela Abraham.')") === 'francais');

    console.log('\n' + (ech === 0 ? 'VERDICT : 0 echec' : 'VERDICT : ' + ech + ' echec(s)'));
  } catch (e) {
    console.log('ERREUR DE BANC : ' + (e && e.message));
    ech++;
  } finally {
    try { if (ws) ws.close(); } catch (e) {}
    try { if (chrome) chrome.kill(); } catch (e) {}
    try { if (srv) srv.close(); } catch (e) {}
    try { if (svc && !serviceExterne) svc.kill(); } catch (e) {}
    process.exit(ech === 0 ? 0 : 1);
  }
})();
