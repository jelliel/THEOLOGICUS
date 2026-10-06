/* Banc v455 — AI VIDEO : au-delà de 15 s, découpage + assemblage.
   Le réseau et ffmpeg sont DOUBLÉS : on vérifie la logique de découpage,
   la continuité des prompts, l'assemblage, le nettoyage de la galerie et
   le repli quand l'assemblage échoue. Aucun appel réel à l'API Agnes. */
const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const PORT = 8880; const ROOT = 'C:/tmp/theoverify';
const PW = 'C:/Users/toshr/AppData/Local/ms-playwright';
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
  const browser = await chromium.launch({ executablePath: path.join(PW, 'chromium-1234', 'chrome-win64', 'chrome.exe'), args: ['--no-sandbox'] });
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
    court: (function () { state.durationFrames = 361; return window.__v455Long.necessaire(); })(),
    long: (function () { state.durationFrames = 362; return window.__v455Long.necessaire(); })(),
    seg25: window.__v455Long.segmentsPour(601),
    seg90: window.__v455Long.segmentsPour(2161)
  }));
  ok('plafond fournisseur = 361 images (15 s à 24 i/s)', seuil.plafond === 361, 'plafond=' + seuil.plafond);
  ok('≤ 15 s → chemin d’origine (pas de découpage)', seuil.court === false);
  ok('> 15 s → découpage déclenché', seuil.long === true);
  ok('25 s → 2 segments ; 1 min 30 → 6 segments', seuil.seg25 === 2 && seuil.seg90 === 6, JSON.stringify({ s25: seuil.seg25, s90: seuil.seg90 }));

  // 2. exécution complète d'un plan de 25 s (2 segments)
  await page.evaluate(() => {
    window.__rec = { frames: [], prompts: [], ffWrite: [], ffExec: [] };
    state.durationFrames = 601;
    state.stopRequested = false;
    /* le module fixe la durée de chaque segment : on l'observe en lisant
       state.durationFrames au moment de l'appel réseau */
    const _create = window.createVideoTask;
    window.createVideoTask = async function (prompt) {
      window.__rec.frames.push(state.durationFrames);
      window.__rec.prompts.push(prompt);
      return 'task_' + window.__rec.frames.length;
    };
    localStorage.removeItem('cinema_noir_gallery_v1');
    return window.__v455Long.executer('PROMPT DE BASE', null, null, 'agnes-video-v2.0', null, 'Scène 1/1');
  });
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => ({
    frames: window.__rec.frames,
    prompts: window.__rec.prompts,
    ffWrite: window.__rec.ffWrite,
    ffExec: window.__rec.ffExec,
    galerie: loadGallery().map(v => ({ label: v.label, scene: v.scene }))
  }));
  ok('2 segments générés avec les bonnes durées (361 + 240)', JSON.stringify(r.frames) === '[361,240]', JSON.stringify(r.frames));
  ok('chaque segment porte la consigne de CONTINUITÉ', r.prompts.length === 2 && /CONTINUITY/.test(r.prompts[0]) && /segment 1 of 2/.test(r.prompts[0]) && /segment 2 of 2/.test(r.prompts[1]), (r.prompts[0] || '').slice(-60));
  ok('ffmpeg a reçu les 2 segments + la liste', r.ffWrite.filter(n => /^seg/.test(n)).length === 2 && r.ffWrite.indexOf('liste.txt') >= 0, JSON.stringify(r.ffWrite));
  ok('assemblage par concat', r.ffExec.length >= 1 && /-f concat -safe 0 -i liste\.txt/.test(r.ffExec[0]), r.ffExec[0]);
  ok('une SEULE vidéo assemblée dans la galerie (segments retirés)', r.galerie.length === 1 && /assembl/.test(r.galerie[0].label), JSON.stringify(r.galerie));

  // 3. repli : assemblage impossible → les segments restent
  const repli = await page.evaluate(async () => {
    localStorage.removeItem('cinema_noir_gallery_v1');
    window.__rec = { frames: [], prompts: [], ffWrite: [], ffExec: [] };
    /* échec réel d'assemblage : les segments sont illisibles (réseau coupé) */
    window.fetchVideoBlob = async function () { return null; };
    // forcer un rechargement du module ffmpeg (le précédent est en échec)
    state.durationFrames = 601;
    try { await window.__v455Long.executer('P2', null, null, 'm', null, 'Scène 1/1'); } catch (e) {}
    return { galerie: loadGallery().map(v => v.label) };
  });
  ok('assemblage impossible → les 2 SEGMENTS sont conservés (rien perdu)', repli.galerie.length === 2, JSON.stringify(repli.galerie));

  // 4. note d'interface
  const note = await page.evaluate(() => { const d = document.getElementById('v455-note'); return d ? d.textContent : null; });
  ok('note d’interface sous le sélecteur de durée', !!note && /découpée en segments/.test(note), String(note).slice(0, 80));

  ok('aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
  console.log(`RESULTAT : ${pass}/13`);
  process.exitCode = pass === 13 ? 0 : 1;
  await browser.close(); server.close();
})().catch(e => { console.log('EXCEPTION BANC :', e); process.exitCode = 1; process.exit(1); });
