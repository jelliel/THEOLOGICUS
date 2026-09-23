/* Sonde de rayon PROPRE : uniquement des phrases FRANCAISES NATURELLES,
   telles qu'on en lit dans les contenus de l app (tafsir, commentaires,
   reponses doctrinales). Aucun mot anglais isole. On mesure combien de
   phrases reelles basculent en 'anglais' -> donc lues avec la voix anglaise. */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const WebSocket = require('ws');

const PORT = 8913, CDP = 9454;
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

// Phrases 100% francaises, telles qu on en rencontre dans l app.
const CAS = [
  "On retrouve dans ce passage une mention de l ange Gabriel.",
  "Cela confirme la these d une modification textuelle ancienne.",
  "Le son de la cloche annonce le debut de la messe.",
  "Les anges sont des creatures spirituelles au service de Dieu.",
  "Mais la version satanique inseree par erreur disait ceci.",
  "Le texte ne dit pas que cela soit arrive ainsi.",
  "Il n y a plus aucune mention de ce passage dans le recit.",
  "Pour comprendre ce verset il faut revenir au contexte.",
  "Dans ce passage l auteur cite un texte plus ancien.",
  "Sur ce point les avis des exegetes divergent.",
  "La theologie chretienne repose sur le mystere de la Trinite.",
  "Andre et Paul sont deux apotres du Christ.",
  "L office de la nuit commence a minuit.",
  "Innocence et purete sont exigees du pretre.",
  "Torah et Evangile sont deux revelations distinctes.",
  "Fort de cette conviction il poursuit son analyse.",
  "Athenee et Origene sont des auteurs chretiens anciens.",
  "Byzance conserve un heritage liturgique propre.",
  "Fromage et vin sont benis a certaines fetes.",
  "Isabelle et Marie sont deux saintes venerees.",
  "Areopage designe le conseil d Athenes.",
  "Washington n a jamais ete reconnu par l Eglise.",
  "Beatrice et Dante sont lies par une oeuvre poetique.",
  "Havelange cite un texte conciliaire ancien.",
  "Hassan et Ali sont des prenoms courants.",
  "Hadrien et Trajan sont deux empereurs romains.",
  "Docteur de l Eglise est un titre accorde a certains saints.",
  "Didyme l Aveugle est un auteur alexandrin.",
  "Mayence fut un grand centre theologique.",
  "Cana est le lieu du premier miracle de Jesus.",
  "Isaie et Jeremie sont deux grands prophetes.",
  "Italie et Espagne ont garde le rite romain.",
  "Helie et Elissee sont deux prophetes de l Ancien Testament.",
  "Scheol designe le sejour des morts.",
  "Hera est une divinite grecque.",
  "Myre est une ville d Asie Mineure.",
  "Noe est le constructeur de l arche.",
  "Alliance designe le pacte entre Dieu et son peuple.",
  "Socrate et Platon sont deux philosophes grecs.",
  "Asie Mineure est une region de l Empire romain.",
  "Le dialogue interreligieux suppose un respect mutuel.",
  "La doctrine de la justification fut au coeur des debats.",
  "Les peres grecs commentent ce passage avec prudence.",
  "Cette traduction latine date du quatrieme siecle.",
  "La liturgie byzantine conserve des hymnes anciens.",
  "Le concile de Trente a defini ces points de doctrine.",
  "Saint Augustin revient souvent sur cette question.",
  "Les manuscrits grecs divergent sur ce verset.",
  "La tradition syriaque a conserve une lecon differente.",
  "Ce commentaire est attribue a un auteur tardif.",
  "Les exegetes modernes discutent encore ce point.",
  "Le texte massoretique porte une vocalisation differente.",
  "La Septante propose ici une variante notable.",
  "Cette question a ete tranchee par le magistère.",
  "Les theologiens protestants insistent sur la grace seule.",
  "La scolastique medievale distingue plusieurs sens.",
  "Ce passage est cite par plusieurs peres de l Eglise.",
  "La version vulgate fut longtemps normative en Occident.",
  "Les scribes ont parfois corrige le texte recu.",
  "Une glose marginale explique cette difficulte.",
  "Le sens litteral prime sur l interpretation allegorique.",
  "Cette formule est propre a la tradition alexandrine.",
  "Les copistes ont introduit ici une lecon secondaire.",
  "La critique textuelle permet de trancher ce debat.",
  "Ce verset est absent de plusieurs temoins anciens.",
  "L auteur anonyme reprend une source plus ancienne.",
  "La question du canon fut debattue durant des siecles.",
  "Les reformateurs ont modifie certains livres.",
  "Cette priere remonte aux premiers chretiens.",
  "Le symbole de Nicee precise la doctrine trinitaire.",
  "Les orientaux et les latins divergent sur ce point.",
  "Une note de bas de page signale la variante.",
  "Ce terme technique designe une forme de priere.",
  "La metaphore du berger revient souvent dans les psaumes.",
  "Les prophetes denoncent l infidelite du peuple.",
  "Ce psaume est attribue au roi David.",
  "La sagesse biblique depasse la simple morale.",
  "Le livre de Job pose la question de la souffrance.",
  "Les evangiles synoptiques se repondent entre eux.",
  "Cet episode est propre a l evangile de Jean.",
  "Paul defend son apostolat devant les Galates.",
  "La lettre aux Romains expose la justification par la foi.",
  "L Apocalypse decrit une vision symbolique de l histoire.",
  "Les actes rapportent la naissance de l Eglise.",
  "Ce passage est lu durant la liturgie dominicale.",
  "La tradition juive interprete autrement ce verset.",
  "Le targoum aramйen eclaire ce passage difficile.",
  "Les rabbins discutent longuement ce point de loi.",
  "La mishna codifie ces prescriptions anciennes.",
  "Ce rite est atteste dans les sources anciennes.",
  "Les archives vaticanes conservent ces documents.",
  "Cette bulle pontificale precise une regle disciplinaire.",
  "Le droit canon encadre strictement cette matiere.",
  "Un decret conciliaire reprend cette formulation.",
  "La congregation a publie une instruction recente.",
  "Ce texte est traditionnellement attribue a Paul.",
  "La datation de cet ecrit reste discutee.",
  "Les indices internes suggerent une date tardive.",
  "Le vocabulaire trahit une influence grecque.",
  "La structure du passage est concentrique.",
  "Ce chiasme souligne l importance du verset central.",
  "L emploi du pluriel est significatif ici.",
  "Le verbe grec porte une nuance causale.",
  "Cette particule marque une opposition forte.",
  "Le pronom renvoie probablement au verset precedent.",
  "La conjonction introduit une consequence logique.",
  "Le temps verbal indique une action durable.",
  "Cette expression est un semitisme caracteristique.",
];

(async () => {
  const srv = await serve();
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'theo-ray2-'));
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
    return C.map(function(t){ return { t: t, d: detectScriptLang(t) }; });
  })()`);
  if (out && out.__err) { console.error('detectScriptLang indisponible'); process.exit(1); }

  const faux = out.filter(r => r.d !== 'francais');
  console.log('=== PHRASES FRANCAISES NATURELLES ===');
  console.log('   testees                 : ' + out.length);
  console.log('   prises pour de l anglais: ' + faux.length + '  (' + (100 * faux.length / out.length).toFixed(0) + ' %)');
  console.log('');
  for (const r of faux) console.log('  ANGLAIS !! ' + r.t);
  console.log('');
  console.log('ECHECS = ' + faux.length);
  ws.close(); ch.kill();
  try { srv.close(); } catch (e) {}
  await sleep(400); process.exit(0);
})().catch(e => { console.error('ERREUR:', e.message); process.exit(1); });
