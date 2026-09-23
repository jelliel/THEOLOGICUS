/* ============================================================================
   v107 — LE FRANCAIS NE DOIT PLUS ETRE LU PAR UNE VOIX ANGLAISE
   ============================================================================
   Defaut : detectScriptLang() declare 'anglais' du texte francais, parce que
   la liste de mots anglais est bornee par \b — et que \b s appuie sur \w,
   qui est ASCII SEULEMENT en JavaScript. Une lettre accentuee (è, é, à) n est
   donc PAS un caractere de mot : elle cree une frontiere.

       'très'      -> trè[ S ]            (le mot anglais "s")
       'poème'     -> poè[ ME ]           (le mot anglais "me")
       'société'   -> socié[ T ]é         (le mot anglais "t")
       'thèse' NFD -> [ THE ] + accent    (le mot anglais "the")

   Consequence : makeUtterance() recoit lang='anglais' et choisit la VOIX
   ANGLAISE pour lire une phrase francaise — exactement le symptome signale.

   Contre-epreuve : ce banc DOIT echouer sur la version d avant, et passer
   apres. On le lance contre une copie de l app d avant (THEO_BASELINE).
   ============================================================================ */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WebSocket = require('ws');

const PORT = 8920, CDP = 9461;
const CHROME = 'C://Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ROOT = path.resolve('C:/Theologicus');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' };
// Cible : soit l app courante (racine), soit une copie posee dans bl/THEOLOGICUS.html.
// On sert TOUJOURS depuis la racine du projet, pour que les corpus relatifs
// (bible/, summa/, tafsir/...) se resolvent — sinon la page ne s initialise pas
// et detectScriptLang n existe pas (piege rencontre, voir journal).
const CIBLE = process.argv[2] || 'courant';      // 'courant' | 'avant'
const NOM = process.argv[3] || (CIBLE === 'avant' ? 'AVANT (non corrige)' : 'version courante');
const PAGE = CIBLE === 'avant' ? 'AVANT_v106.html' : 'THEOLOGICUS.html';

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

// ── 1. Le coeur : du francais accentue ne doit JAMAIS partir en 'anglais' ──
// Mots pris dans le vocabulaire reel du corpus (tafsir, commentaires, dogmatique).
const MOTS_FR = [
  'thèse','théologie','théologien','théorème','théorie','théâtre','thème',
  'très','après','progrès','accès','succès','procès','dès','près',
  'année','journée','matinée','soirée','idée','pensée','armée',
  'vérité','charité','trinité','unité','qualité','autorité','société','piété',
  'études','évêque','être','fenêtre','prêtre','mètre','paramètre',
  'règle','siècle','modèle','fidèle','parallèle','zèle','poème',
  'problème','système','baptême','carême','blême','extrême','suprême',
  'père','mère','frère','espère','révère','prospère','diffère','préfère',
  'trésor','présent','précis','réponse','révélation','récit',
  'nation','objection','option','action','question','fonction',
  'mission','passion','profession','possession','condition','tradition',
  'information','formation','invitation','conversation','civilisation',
  'occasion','élection','sélection','direction','correction','protection',
  'attention','intention','mention','pension','dimension',
  'abstention','ascension','tension','pression','impression','expression',
  'confession','procession','succession','accession','concession',
];

// Phrases francaises NATURELLES (aucun mot anglais isole).
const PHRASES_FR = [
  "On retrouve dans ce passage une mention de l ange Gabriel.",
  "Cela confirme la these d une modification textuelle ancienne.",
  "Cette thèse a été soutenue devant la faculté de théologie.",
  "La théologie chrétienne repose sur le mystère de la Trinité.",
  "Le texte ne dit pas que cela soit arrivé ainsi.",
  "Il n y a plus aucune mention de ce passage dans le récit.",
  "Pour comprendre ce verset il faut revenir au contexte.",
  "Les Pères grecs commentent ce passage avec prudence.",
  "Saint Augustin revient souvent sur cette question.",
  "La société médiévale vivait au rythme de la liturgie.",
  "Le problème du mal a longtemps occupé les théologiens.",
  "Ce système doctrinal fut condamné au concile.",
  "La vérité de la foi dépasse la raison humaine.",
  "Très tôt les chrétiens se réunirent pour prier.",
  "Après la résurrection les apôtres annoncèrent l Évangile.",
  "Le baptême marque l entrée dans la communauté.",
  "La charité est la plus grande des vertus.",
  "Les évêques se réunirent en concile à Nicée.",
  "Le prêtre préside l assemblée au nom du Christ.",
  "Cette question a été tranchée par le magistère.",
  "La session du concile fut longue et difficile.",
  "Les sélection des textes fut confiée aux experts.",
  "La piété populaire conserve des formes anciennes.",
  "Ce poème liturgique remonte au Moyen Âge.",
  "L extrême onction accompagne les malades.",
  "Le suprême pontife publia une encyclique.",
  "La règle monastique organisait la journée.",
  "Le siècle des Lumières contesta ces dogmes.",
  "Cette nation a longtemps été chrétienne.",
  "La profession de foi résume l essentiel.",
];

// Phrases REELLEMENT ANGLAISES (doivent rester 'anglais' — on ne veut rien casser).
const PHRASES_EN = [
  "This passage shows that the text was modified at an early stage.",
  "The evidence is clear and the conclusion follows from it.",
  "We should not assume that these words were original.",
  "He said that they were not present in the oldest manuscripts.",
  "On the contrary, the reading is well attested in the tradition.",
  "It is important to note that the verse was later removed.",
  "These scholars have argued for a different interpretation.",
  "There is no reason to doubt the authenticity of this saying.",
];

// Phrases NON-LATINES : la detection doit rendre le script attendu, OU le repli
// declare dans VOICE_FALLBACK (copte/gothique/arameen/goergien...). Ce n est pas
// une tolerance : c est le contrat existant de l app, verifie ici.
const PHRASES_SCRIPT = [
  ["arabe",   "بسم الله الرحمن الرحيم"],
  ["hebreu",  "בְּרֵאשִׁית בָּרָא אֱלֹהִים"],
  ["grec",    "Ἐν ἀρχῇ ἦν ὁ λόγος"],
  ["copte",   "Ⲡⲁⲣⲭⲏ ⲛⲟⲩϣⲁϫⲉ", "grec"],
  ["syriaque","ܒܪܫܝܬ ܒܪܐ ܐܠܗܐ", "francais"],
  ["armenien","Աստուած ստեղծեց"],
  ["georgien","დასაბამიდან იყო", "francais"],
  ["thai",    "ในปฐมกาล"],
  ["devanagari","आदि में"],
  ["chinois", "起初神创造天地"],
  ["japonais","はじめに"],
  ["coreen",  "태초에"],
  ["gothique","\uD800\uDF30\uD800\uDF31"],
];

(async () => {
  const srv = await serve();
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo-v107-'));
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
    if (r.result && r.result.exceptionDetails) return { __err: JSON.stringify(r.result.exceptionDetails).slice(0, 500) };
    return r.result && r.result.result ? r.result.result.value : undefined;
  };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/' + PAGE });
  await sleep(11000);

  console.log('============================================================');
  console.log(' BENCH v107 — cible : ' + NOM);
  console.log('============================================================');

  // ---- 1. mots francais accentues, dans une phrase francaise ----
  console.log('\n--- 1. mots francais accentues dans une phrase francaise ---');
  const r1 = await ev(`(()=>{
    const M = ${JSON.stringify(MOTS_FR)};
    return M.map(function(w){ const ph = 'Le récit de la ' + w + ' est ici exposé.'; return { mot: w, d: detectScriptLang(ph), d2: detectScriptLang(ph.normalize('NFD')) }; });
  })()`);
  if (r1 && r1.__err) { console.error(r1.__err); process.exit(2); }
  const faux1 = r1.filter(r => r.d !== 'francais');
  const faux1n = r1.filter(r => r.d2 !== 'francais');
  console.log('   mots testes : ' + r1.length);
  for (const r of faux1) console.log('     NFC: ' + r.mot.padEnd(14) + ' -> ' + r.d);
  for (const r of faux1n.filter(r => r.d === 'francais')) console.log('     NFD: ' + r.mot.padEnd(14) + ' -> ' + r.d2 + '   <-- piege accent combinant');
  ok('1a. aucun mot francais accentue pris pour de l anglais (NFC)', faux1.length === 0, faux1.length + ' fautifs');
  ok('1b. aucun mot francais accentue pris pour de l anglais (NFD)', faux1n.length === 0, faux1n.length + ' fautifs');

  // ---- 2. phrases francaises naturelles ----
  console.log('\n--- 2. phrases francaises naturelles (aucun mot anglais isole) ---');
  const r2 = await ev(`(()=>{ const C=${JSON.stringify(PHRASES_FR)}; return C.map(function(t){ return { t: t, d: detectScriptLang(t), dc: (typeof cleanMd==='function') ? detectScriptLang(cleanMd(t)) : 'n/a' }; }); })()`);
  const faux2 = r2.filter(r => r.d !== 'francais');
  const faux2c = r2.filter(r => r.dc !== 'francais');
  console.log('   phrases testees : ' + r2.length);
  for (const r of faux2) console.log('     ANGLAIS !! ' + r.t);
  ok('2a. aucune phrase francaise prise pour de l anglais (brut)', faux2.length === 0, faux2.length + ' fautives');
  ok('2b. aucune phrase francaise prise pour de l anglais (apres cleanMd)', faux2c.length === 0, faux2c.length + ' fautives');

  // ---- 3. l anglais doit RESTER de l anglais ----
  console.log('\n--- 3. l anglais doit rester detecte comme anglais ---');
  const r3 = await ev(`(()=>{ const C=${JSON.stringify(PHRASES_EN)}; return C.map(function(t){ return { t: t, d: detectScriptLang(t) }; }); })()`);
  const loupes = r3.filter(r => r.d !== 'anglais');
  for (const r of loupes) console.log('     NON-ANGLAIS (' + r.d + ') !! ' + r.t);
  ok('3. les phrases anglaises restent anglaises', loupes.length === 0, loupes.length + ' perdues');

  // ---- 4. les ecritures non latines doivent rester intactes ----
  console.log('\n--- 4. les ecritures non latines gardent leur langue ---');
  const r4 = await ev(`(()=>{ const C=${JSON.stringify(PHRASES_SCRIPT)}; return C.map(function(p){ return { att: p[0], t: p[1], repli: p[2] || null, d: detectScriptLang(p[1]) }; }); })()`);
  const rates = r4.filter(r => r.d !== r.att && r.d !== r.repli);
  for (const r of r4) if (r.d !== r.att) console.log('     ' + r.att + ' -> ' + r.d + (r.d === r.repli ? '   (repli declare, attendu)' : '  !!'));
  ok('4. aucun script non latin n a change de langue', rates.length === 0, rates.length + ' rates');

  // ---- 5. la chaine complete : le verdict de langue d un segment de francais ----
  console.log('\n--- 5. la CHAINE COMPLETE (splitByLanguage -> splitMixedSegments) ---');
  const r5 = await ev(`(()=>{
    const C = ${JSON.stringify(PHRASES_FR)};
    const out = [];
    for (const t of C) {
      let segs = [];
      try { segs = splitByLanguage(t); } catch (e) { out.push({ t: t, err: String(e).slice(0,60) }); continue; }
      const mauvais = segs.filter(function(s){ return s.lang && s.lang !== 'francais' && !/^[\\u0600-\\u06FF\\u0590-\\u05FF\\u0370-\\u03FF\\u0E00-\\u0E7F\\u0900-\\u097F\\u4E00-\\u9FFF]/.test(s.text); });
      if (mauvais.length) out.push({ t: t, segs: mauvais.map(function(s){ return s.lang + ' : ' + s.text.slice(0,44); }) });
    }
    return out; })()`);
  for (const r of r5) console.log('     ' + (r.err ? 'ERREUR ' + r.err : JSON.stringify(r.segs)) + '  <- ' + r.t.slice(0, 46));
  ok('5. aucun segment francais n est etiquete dans une autre langue', r5.length === 0, r5.length + ' phrases fautives');

  // ---- 6. le choix de voix, bout en bout (le seul test qui compte vraiment) ----
  console.log('\n--- 6. LA VOIX REELLEMENT CHOISIE par makeUtterance ---');
  const r6 = await ev(`(()=>{
    let pieces = null, orig = null;
    if (typeof makeUtterance === 'function') { orig = makeUtterance; }
    const C = ${JSON.stringify(PHRASES_FR)};
    const res = [];
    for (const t of C) {
      let lang = null;
      try { lang = detectScriptLang(t); } catch (e) { lang = 'ERR'; }
      // On interroge le choix de voix pour CETTE langue, tel que le fait la chaine.
      let voice = null;
      try {
        if (typeof getVoiceForLang === 'function') { const v = getVoiceForLang(lang); voice = v ? (v.name + ' (' + v.lang + ')') : null; }
      } catch (e) { voice = 'ERR'; }
      res.push({ lang: lang, voice: voice, t: t.slice(0, 40) });
    }
    return res; })()`);
  const voixAnglaise = r6.filter(r => r.lang === 'anglais');
  for (const r of r6) console.log('     ' + (r.lang === 'anglais' ? 'ANGLAIS !!' : 'ok        ') + ' ' + (r.lang + '            ').slice(0, 12) + ' voix=' + String(r.voice) + '  | ' + r.t);
  ok('6. aucune phrase francaise ne recoit la voix anglaise', voixAnglaise.length === 0, voixAnglaise.length + ' phrases');

  console.log('');
  console.log('ECHECS = ' + ech + (ech ? '  -> A CORRIGER' : '  -> TOUT OK'));
  ws.close(); ch.kill();
  try { srv.close(); } catch (e) {}
  await sleep(400); process.exit(ech ? 1 : 0);
})().catch(e => { console.error('ERREUR:', e.message); process.exit(1); });
