/* Banc v458 — ASSEMBLAGE CÔTÉ SERVEUR (ffmpeg du PC), de bout en bout.
   Démarre une instance de proxy_server.py (port de test), puis :
     1. POST /montage avec deux vrais segments → vérifie le MP4 produit avec
        le ffmpeg local (durée attendue ≈ 2 s) ;
     2. dans le navigateur, servi PAR ce serveur (comme l'app réelle),
        `assembler()` doit passer par /montage et rendre une vidéo.
   Aucune doublure : le vrai serveur, le vrai ffmpeg, de vrais fichiers. */
const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const { spawn, execFileSync, execSync } = require('child_process');
const ROOT = 'C:/tmp/theoverify';
const PORT = 8899;
const PW = 'C:/Users/toshr/AppData/Local/ms-playwright';
let pass = 0;
const ok = (name, cond, detail) => { console.log(` ${cond ? '[OK] ' : '[ECHEC]'}${name}${cond || detail === undefined ? '' : ' — ' + String(detail).slice(0, 110)}`); if (cond) pass++; };
const attendre = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // ── 1. instance de test du serveur (copie avec un autre port) ──
  const src = fs.readFileSync(path.join(ROOT, 'proxy_server.py'), 'utf8');
  const copie = path.join(ROOT, '_montage_test_serveur.py');   /* à la RACINE : le serveur sert le dossier de son script */
  fs.mkdirSync(path.dirname(copie), { recursive: true });
  fs.writeFileSync(copie, src.replace(/^PORT = \d+/m, 'PORT = ' + PORT));
  const PY = 'C:/Users/toshr/.workbuddy-ai/binaries/python/versions/3.13.12/python.exe';
  const srv = spawn(PY, [copie], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let srvLog = '';
  srv.stdout.on('data', d => { srvLog += d.toString(); });
  srv.stderr.on('data', d => { srvLog += d.toString(); });
  let up = false;
  for (let i = 0; i < 40; i++) {
    await attendre(500);
    try { const r = await fetch(`http://127.0.0.1:${PORT}/__theologicus_ping`); if (r.ok) { up = true; break; } } catch (e) {}
  }
  ok('instance de test du serveur démarrée', up, srvLog.slice(-120));
  if (!up) { try { srv.kill(); } catch (e) {} process.exit(1); }

  // ── 2. POST /montage avec deux vrais segments ──
  const f = 'http://127.0.0.1:' + PORT + '/.workbuddy-ai/artifacts/_v455/fixtures/seg';
  const rep = await fetch(`http://127.0.0.1:${PORT}/montage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls: [f + '0.mp4', f + '1.mp4'] })
  });
  const type = rep.headers.get('content-type') || '';
  if (!/video/.test(type)) {
    let txt = ''; try { txt = await rep.text(); } catch (e) {}
    ok('POST /montage renvoie une vidéo', false, 'type=' + type + ' corps=' + txt.slice(0, 160));
  } else {
    const buf = Buffer.from(await rep.arrayBuffer());
    const out = path.join(ROOT, '.workbuddy-ai/artifacts/_v458/montage_serveur.mp4');
    fs.writeFileSync(out, buf);
    ok('POST /montage renvoie une vidéo', buf.length > 5000, buf.length + ' octets');
    ok('en-tête MP4 valide (ftyp)', buf.slice(4, 8).toString() === 'ftyp', buf.slice(4, 8).toString());
    /* durée lue DANS LE FICHIER (boîte mvhd) : aucune dépendance externe */
    let sec = -1;
    try {
      const i = buf.indexOf(Buffer.from('mvhd'));
      if (i >= 0) {
        const p = i + 4;
        const version = buf[p];
        const timescale = version === 1 ? buf.readUInt32BE(p + 20) : buf.readUInt32BE(p + 12);
        const duree = version === 1 ? Number(buf.readBigUInt64BE(p + 24)) : buf.readUInt32BE(p + 16);
        sec = duree / timescale;
      }
    } catch (e) { sec = -2; }
    ok('durée du montage ≈ 2 s (lue dans le fichier : mvhd)', sec > 1.7 && sec < 2.4, 'durée=' + sec + 's');
  }

  // ── 3. dans le navigateur, servi PAR le serveur : assembler() passe par /montage ──
  const browser = await chromium.launch({ executablePath: path.join(PW, 'chromium-1234', 'chrome-win64', 'chrome.exe'), args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 110)));
  await page.goto(`http://127.0.0.1:${PORT}/ai-video.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const relais = await page.evaluate(() => (typeof _VIA_RELAIS !== 'undefined') ? _VIA_RELAIS : null);
  ok('la page se sait servie par le relais (_VIA_RELAIS)', relais === true, String(relais));
  const nav = await page.evaluate(async () => {
    try {
      const base = location.origin + '/.workbuddy-ai/artifacts/_v455/fixtures/seg';
      const blob = await window.__v455Long.assembler([base + '0.mp4', base + '1.mp4']);
      const buf = new Uint8Array(await blob.arrayBuffer());
      return { ok: true, taille: blob.size, entete: String.fromCharCode(buf[4], buf[5], buf[6], buf[7]) };
    } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
  });
  ok('assembler() réussit dans le navigateur (via le PC, sans wasm)', nav.ok === true, nav.err);
  if (nav.ok) ok('le résultat est un MP4 valide', nav.entete === 'ftyp' && nav.taille > 5000, JSON.stringify(nav));
  const journal = await page.evaluate(() => logState.entries.map(e => e.message).filter(m => /Assemblage|montage|PC/i.test(m)).slice(0, 3));
  ok('le journal indique l’assemblage local', journal.some(m => /ffmpeg local|Assemblage local|PC/i.test(m)), JSON.stringify(journal).slice(0, 120));
  ok('aucune erreur JavaScript', errors.length === 0, errors.join(' | '));

  try { srv.kill(); } catch (e) {}
  console.log(`RESULTAT : ${pass}/9`);
  process.exitCode = pass === 9 ? 0 : 1;
  await browser.close();
})().catch(e => { console.log('EXCEPTION BANC :', e); process.exitCode = 1; process.exit(1); });
