/* Banc v455 — AI VIDEO : au-delà de 15 s, découpage + assemblage.
   Le réseau et ffmpeg sont DOUBLÉS : on vérifie la logique de découpage,
   la continuité des prompts, l'assemblage, le nettoyage de la galerie et
   le repli quand l'assemblage échoue. Aucun appel réel à l'API Agnes. */
const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const PORT = 8880; const ROOT = process.env.THEO_ROOT || 'C:/tmp/theoverify';
const PW = process.env.PW_DIR || 'C:/Users/toshr/AppData/Local/ms-playwright';
let pass = 0;
const ok = (name, cond, detail) => { console.log(` ${cond ? '[OK] ' : '[ECHEC]'}${name}${cond || detail === undefined ? '' : ' — ' + String(detail).slice(0, 95)}`); if (cond) pass++; };
(async () => {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'THEOLOGICUS.html';
    const f = path.join(ROOT, rel);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) {
      res.writeHead(200, {'Content-Type': rel.endsWith('.js') ? 'application/javascript; charset=utf-8' : rel.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8'});
      return fs.createReadStream(f).pipe(res);
    }
    res.writeHead(404); res.end('nf');
  });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, process.env.PW_DIR ? { executablePath: path.join(PW, 'chromium-1234', 'chrome-win64', 'chrome.exe') } : {}));
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 120)));
  await page.goto(`http://127.0.0.1:${PORT}/ai-video.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  const api = await page.evaluate(() => window.__v455Long ? Object.keys(window.__v455Long) : null);
  ok('API v455 exposée (necessaire/executer/assembler/segmentsPour)', api && api.indexOf('executer') >= 0, JSON.stringify(api));

  // doublures : réseau, ffmpeg, téléchargement
  await page.evaluate(() => {
    window.__rec = { frames: [], prompts: [], ffWrite: [], ffExec: [], galerie: [] };
    window.createVideoTask = async function (prompt, img, aud, modelId, vid) {
      const n = state.durationFrames;
      // le vrai code envoie num_frames = state.durationFrames ; ici on note la
      // durée du SEGMENT (que le module fixe avant l'appel)
      window.__rec.frames.push(window.__segmentFrames);
      window.__rec.prompts.push(prompt);
      return 'task_' + window.__rec.frames.length;
    };
    window.pollUntilDone = async function (id, modelId, lab) {
      // comme l'app : le résultat entre dans la galerie
      await addVideoToGallery('data:video/mp4;base64,AAAAIGZ0eXBpc29t', lab, { model: modelId, scene: lab });
    };
    window.fetchVideoBlob = async function () { return new Blob([new Uint8Array([0, 0, 0, 24])], { type: 'video/mp4' }); };
    window.downloadVideoEntry = async function () {};
    window.FFmpegWASM = { FFmpeg: function () {
      this.load = async function () {};
      this.writeFile = async function (n) { window.__rec.ffWrite.push(n); };
      this.exec = async function (a) { window.__rec.ffExec.push(a.join(' ')); };
      this.readFile = async function () { return new Uint8Array([1, 2, 3, 4]); };
      this.deleteFile = function () {};
    } };
    // le module lit state.durationFrames pour découper ; on note la durée
    // demandée par segment en interceptant la construction du corps
    const orig = window.createVideoTask;
    window.createVideoTask = async function (prompt, img, aud, modelId, vid) {
      window.__rec.frames.push(window.__segmentFrames || state.durationFrames);
      window.__rec.prompts.push(prompt);
      return 'task_' + window.__rec.frames.length;
    };
    window.__origCreate = orig;
  });

  // 1. seuil
  const seuil = await page.evaluate(() => ({
    plafond: window.__v455Long.plafond(),
    minimum: window.__v455Long.minimum(),
    court: (function () { state.durationFrames = 441; return window.__v455Long.necessaire(); })(),
    long: (function () { state.durationFrames = 601; return window.__v455Long.necessaire(); })(),
    o25: window.__v455Long.planOptimal(601),
    o50: window.__v455Long.planOptimal(1201),
    p25: window.__v455Long.decouper(601),
    p50: window.__v455Long.decouper(1201),
    p90: window.__v455Long.decouper(2161)
  }));
  ok('plafond fournisseur = 441 images (18,4 s à 24 i/s), minimum 81', seuil.plafond === 441 && seuil.minimum === 81, JSON.stringify({ p: seuil.plafond, m: seuil.minimum }));
  ok('une durée VALIDE (441) → chemin d’origine (pas de découpage)', seuil.court === false);
  ok('une durée invalide (601) → découpage déclenché', seuil.long === true);
  ok('25 s → [441, 161] (25,1 s) ; 50 s → [441,441,321]', JSON.stringify(seuil.p25) === '[441,161]' && JSON.stringify(seuil.p50) === '[441,441,321]', JSON.stringify({ p25: seuil.p25, p50: seuil.p50 }));
  ok('25 s tient en UN SEUL plan en baissant la cadence (16 i/s, 401 images)',
     seuil.o25 && seuil.o25.fps === 16 && seuil.o25.frames === 401 && Math.abs(seuil.o25.sec - 25) < 0.6, JSON.stringify(seuil.o25));
  ok('50 s ne tient plus en un plan (planOptimal = null)', seuil.o50 === null, JSON.stringify(seuil.o50));
  ok('TOUS les segments sont conformes à la règle 8n+1 (min 81, max 441)',
     seuil.p25.concat(seuil.p50, seuil.p90).every(n => n >= 81 && n <= 441 && (n % 8) === 1),
     JSON.stringify(seuil.p90));

  // 2. plan de 25 s : UN SEUL appel, cadence abaissée, aucun assemblage
  await page.evaluate(() => {
    saveGallery([]);
    localStorage.removeItem('theologicus_video_quota');
    window.__rec = { frames: [], cadence: [], ffWrite: [] };
    state.durationFrames = 601;
    state.stopRequested = false;
    window.createVideoTask = async function () {
      window.__rec.frames.push(state.durationFrames);
      window.__rec.cadence.push(window.__v455Cadence);
      return 'task_' + window.__rec.frames.length;
    };
    saveGallery([]);
    return window.__v455Long.executer('PROMPT DE BASE', null, null, 'agnes-video-v2.0', null, 'Scene 1/1');
  });
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => ({
    frames: window.__rec.frames, cadence: window.__rec.cadence, ffWrite: window.__rec.ffWrite,
    galerie: loadGallery().map(v => v.label), cadenceRendue: window.__v455Cadence
  }));
  ok('25 s -> UN seul appel reseau (401 images, jamais 601 ni 441)', JSON.stringify(r.frames) === '[401]', JSON.stringify(r.frames));
  ok('cadence abaissee a 16 i/s pendant l appel, puis rendue intacte',
     JSON.stringify(r.cadence) === '[16]' && r.cadenceRendue === null, JSON.stringify({ p: r.cadence, apres: r.cadenceRendue }));
  ok('aucun assemblage necessaire (pas d appel ffmpeg)', r.ffWrite.length === 0, JSON.stringify(r.ffWrite));
  ok('une seule video dans la galerie', r.galerie.length === 1, JSON.stringify(r.galerie));

  // 2b. plan de 50 s : decoupage + assemblage (repli)
  const r2 = await page.evaluate(async () => {
    window.__rec = { frames: [], ffWrite: [], ffExec: [] };
    state.durationFrames = 1201;
    window.createVideoTask = async function () {
      window.__rec.frames.push(state.durationFrames);
      return 'task_' + window.__rec.frames.length;
    };
    saveGallery([]);
    await window.__v455Long.executer('P50', null, null, 'm', null, 'Scene 1/1');
    return { frames: window.__rec.frames, ffExec: window.__rec.ffExec, galerie: loadGallery().map(v => v.label) };
  });
  ok('50 s -> 2 segments seulement (441@12i/s + 321@24i/s)', JSON.stringify(r2.frames) === '[441,321]', JSON.stringify(r2.frames));
  ok('50 s -> assemblage concat', r2.ffExec.length >= 1 && /-f concat/.test(r2.ffExec[0]), String(r2.ffExec[0]).slice(0, 50));
  ok('50 s -> une seule video assemblee dans la galerie', r2.galerie.length === 1 && /assembl/.test(r2.galerie[0]), JSON.stringify(r2.galerie));

  // 3. repli : assemblage impossible → les segments restent
  const repli = await page.evaluate(async () => {
    saveGallery([]);
    window.__rec = { frames: [], prompts: [], ffWrite: [], ffExec: [] };
    /* échec réel d'assemblage : les segments sont illisibles (réseau coupé) */
    window.fetchVideoBlob = async function () { return null; };
    // forcer un rechargement du module ffmpeg (le précédent est en échec)
    state.durationFrames = 1201;
    try { await window.__v455Long.executer('P2', null, null, 'm', null, 'Scène 1/1'); } catch (e) {}
    return { galerie: loadGallery().map(v => v.label) };
  });
  ok('assemblage impossible → les 2 SEGMENTS sont conservés (rien perdu)', repli.galerie.length === 2, JSON.stringify(repli.galerie));

  // 4. note d'interface
  const note = await page.evaluate(() => { const d = document.getElementById('v455-note'); return d ? d.textContent : null; });
  ok('note d’interface sous le sélecteur de durée (limite 18,4 s expliquée)', !!note && /18,4 s/.test(note) && /découpée en segments/.test(note), String(note).slice(0, 90));

  // ── 4. DIALECTE 2.5 (agnes-video-2.5 / 2.5-flash) ──
  const d25 = await page.evaluate(() => ({
    est25a: window.__v455Long.est25('agnes-video-2.5'),
    est25b: window.__v455Long.est25('agnes-video-2.5-flash'),
    est25c: window.__v455Long.est25('agnes-video-v2.0'),
    sec25: window.__v455Long.secondes25(441),
    p50: window.__v455Long.decouperSecondes(50),
    p90: window.__v455Long.decouperSecondes(90),
    p8: window.__v455Long.decouperSecondes(8),
    modeles: (loadDetectedAgnes() || []).map(m => m.id)
  }));
  ok('détection du dialecte 2.5 (et pas v2.0)', d25.est25a && d25.est25b && !d25.est25c, JSON.stringify(d25).slice(0, 80));
  ok('2.5 : 441 images -> 12 s (plafond du modèle)', d25.sec25 === 12, String(d25.sec25));
  ok('2.5 : 50 s -> [12,12,12,7,7] (segments 4..12 s valides)', JSON.stringify(d25.p50) === '[12,12,12,7,7]', JSON.stringify(d25.p50));
  ok('2.5 : 90 s -> 8 segments dont un de 6 s', d25.p90.length === 8 && d25.p90[7] === 6, JSON.stringify(d25.p90));
  ok('2.5 : 8 s -> un seul segment', JSON.stringify(d25.p8) === '[8]', JSON.stringify(d25.p8));
  ok('les 3 modèles sont proposés dans la grille (v2.0, 2.5, 2.5-flash)',
     d25.modeles.indexOf('agnes-video-v2.0') >= 0 && d25.modeles.indexOf('agnes-video-2.5') >= 0 && d25.modeles.indexOf('agnes-video-2.5-flash') >= 0,
     JSON.stringify(d25.modeles));

  // 2c. DÉCOUPAGE OPTIMAL : chaque segment = le plus long plan légal
  const opt = await page.evaluate(() => {
    const p50 = window.__v455Long.planSegments(1201);   /* 50 s */
    const p90 = window.__v455Long.planSegments(2161);   /* 1 min 30 */
    const p12 = window.__v455Long.planSegments(289);    /* 12 s */
    return {
      n50: p50.length, d50: p50.reduce((a, x) => a + x.sec, 0).toFixed(1), f50: p50.map(x => x.frames + '@' + x.fps),
      n90: p90.length, d90: p90.reduce((a, x) => a + x.sec, 0).toFixed(1),
      n12: p12.length,
      legaux: p50.concat(p90, p12).every(x => x.frames >= 81 && x.frames <= 441 && (x.frames % 8) === 1 && x.fps >= 1 && x.fps <= 60)
    };
  });
  ok('50 s en 2 générations au lieu de 3 (plans maximaux)', opt.n50 === 2 && Math.abs(opt.d50 - 50) < 1.5, JSON.stringify(opt).slice(0, 90));
  ok('1 min 30 en 3 générations au lieu de 5', opt.n90 === 3 && Math.abs(opt.d90 - 90) < 1.5, JSON.stringify({ n: opt.n90, d: opt.d90 }));
  ok('12 s : un seul plan (pas de découpage inutile)', opt.n12 === 1, String(opt.n12));
  ok('tous les plans restent légaux (8n+1, ≤441, cadence 1-60)', opt.legaux === true);

  // 2d. QUOTA : compteur du jour + avertissement
  const q = await page.evaluate(() => {
    localStorage.removeItem('theologicus_video_quota');
    const avant = window.__v455Long.quotaJour().secondes;
    window.__v455Long.quotaAjouter(180);
    const apres = window.__v455Long.quotaJour().secondes;
    window.__v455Long.majQuota();
    const ligne = document.getElementById('v455-quota');
    return { avant: avant, apres: apres, texte: ligne ? ligne.textContent : null };
  });
  ok('compteur de quota : part de 0 et cumule les secondes', q.avant === 0 && q.apres === 180, JSON.stringify(q).slice(0, 80));
  ok('ligne de quota visible sous le sélecteur de durée', /180 s/.test(String(q.texte)) && /500 s/.test(String(q.texte)), String(q.texte).slice(0, 90));

  // 2e. au-delà de 80 % du quota, confirmation demandée (et refus = pas de génération)
  const garde = await page.evaluate(async () => {
    localStorage.setItem('theologicus_video_quota', JSON.stringify({ jour: new Date().toISOString().slice(0, 10), secondes: 480 }));
    let demande = false;
    const vrai = window.confirm;
    window.confirm = function () { demande = true; return false; };   /* l'utilisateur refuse */
    saveGallery([]);
    state.durationFrames = 601; state.stopRequested = false;
    let appels = 0;
    window.createVideoTask = async function () { appels++; return 'x'; };
    await window.__v455Long.executer('P', null, null, 'agnes-video-v2.0', null, 'S');
    window.confirm = vrai;
    return { demande: demande, appels: appels };
  });
  ok('au-delà de 80 % du quota : confirmation demandée', garde.demande === true, JSON.stringify(garde));
  ok('si l’utilisateur refuse : aucune génération lancée', garde.appels === 0, JSON.stringify(garde));

  // 3b. LE CAS SIGNALÉ : modèle 2.5 + image jointe (base64) + 50 s
  //     → bascule automatique sur v2.0, sinon « aucune vidéo ».
  const bascule = await page.evaluate(async () => {
    saveGallery([]);
    localStorage.removeItem('theologicus_video_quota');
    window.fetchVideoBlob = async function () { return new Blob([new Uint8Array([0, 0, 0, 24])], { type: 'video/mp4' }); };
    state.durationFrames = 1201;      /* 50 s */
    state.stopRequested = false;
    const rec = { modeles: [], frames: [] };
    window.createVideoTask = async function (prompt, img, aud, modelId, vid) {
      rec.modeles.push(modelId); rec.frames.push(state.durationFrames);
      return 't' + rec.modeles.length;
    };
    logState.entries = [];
    await window.__v455Long.executer('PROMPT SCENARIO', 'data:image/png;base64,AAAA', null, 'agnes-video-2.5-flash', null, 'Scene 1/1');
    return { rec: rec, avert: logState.entries.filter(e => e.level === 'warn').map(e => e.message), galerie: loadGallery().length };
  });
  ok('2.5 + image jointe + 50 s → bascule sur v2.0, 2 segments (441 + 321)',
     bascule.rec.modeles.length === 2 && bascule.rec.modeles.every(m => m === 'agnes-video-v2.0') && JSON.stringify(bascule.rec.frames) === '[441,321]',
     JSON.stringify(bascule.rec).slice(0, 120));
  ok('la bascule est ANNONCÉE dans le journal (pas silencieuse)', bascule.avert.some(m => /bascule/.test(m)), JSON.stringify(bascule.avert).slice(0, 90));
  ok('résultat : une seule vidéo assemblée (plus de « aucune vidéo »)', bascule.galerie === 1, String(bascule.galerie));

  // 4b/4c/4d. corps réellement envoyé : page NEUVE (les tests précédents ont
  // doublé createVideoTask), l'app passe par le relais local /proxy/…
  const page2 = await browser.newPage();
  page2.on('pageerror', e => errors.push('p2:' + String(e).slice(0, 100)));
  let corps = null;
  await page2.route('**/proxy/**', async route => {
    if (route.request().method() === 'POST' && /videos$/.test(route.request().url())) corps = route.request().postData();
    await route.fulfill({ status: 401, contentType: 'application/json', body: '{"detail":"test"}' });
  });
  await page2.goto(`http://127.0.0.1:${PORT}/ai-video.html`, { waitUntil: 'domcontentloaded' });
  await page2.waitForTimeout(1200);
  await page2.evaluate(() => createVideoTask('PROMPT 25', null, null, 'agnes-video-2.5-flash', null).catch(() => {}));
  await page2.waitForTimeout(500);
  let c = null; try { c = JSON.parse(corps); } catch (e) {}
  ok('requête 2.5 : mode/seconds/size/aspect_ratio, SANS num_frames ni frame_rate',
     !!c && c.mode === 'text' && typeof c.seconds === 'string' && c.size === '720P' && c.aspect_ratio === '16:9' && c.num_frames === undefined && c.frame_rate === undefined,
     JSON.stringify(c).slice(0, 110));

  const refus = await page2.evaluate(async () => {
    try { await createVideoTask('P', 'data:image/png;base64,AAAA', null, 'agnes-video-2.5-flash', null); return 'aucune erreur'; }
    catch (e) { return e.message; }
  });
  ok('2.5 + image base64 → refus explicite (URL publique exigée)', /URL PUBLIQUE/.test(String(refus)), String(refus).slice(0, 90));

  corps = null;
  await page2.evaluate(() => createVideoTask('P', 'data:image/png;base64,AAAA', null, 'agnes-video-v2.0', null).catch(() => {}));
  await page2.waitForTimeout(500);
  let c2 = null; try { c2 = JSON.parse(corps); } catch (e) {}
  ok('v2.0 : corps inchangé (num_frames + frame_rate + image)', !!c2 && c2.num_frames !== undefined && c2.frame_rate !== undefined && !!c2.image, JSON.stringify(c2).slice(0, 100));

  ok('aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
  console.log(`RESULTAT : ${pass}/38`);
  process.exitCode = pass === 38 ? 0 : 1;
  await browser.close(); server.close();
})().catch(e => { console.log('EXCEPTION BANC :', e); process.exitCode = 1; process.exit(1); });
