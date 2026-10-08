/* Banc v457 — ASSEMBLAGE RÉEL (aucune doublure ffmpeg).
   Reproduit la panne signalée : « Failed to construct 'Worker': Script at
   'https://unpkg.com/…' cannot be accessed from origin 'http://127.0.0.1:8765' ».
   On charge donc le VRAI ffmpeg.wasm (cœur depuis le CDN, script worker servi
   par l'app), on assemble deux vrais MP4, et on contrôle le résultat avec le
   ffmpeg local (durée attendue : ~2 s). */
const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const { execFileSync } = require('child_process');
const PORT = 8765; const ROOT = process.env.THEO_ROOT || 'C:/tmp/theoverify';
const PW = process.env.PW_DIR || 'C:/Users/toshr/AppData/Local/ms-playwright';
let pass = 0;
const ok = (name, cond, detail) => { console.log(` ${cond ? '[OK] ' : '[ECHEC]'}${name}${cond || detail === undefined ? '' : ' — ' + String(detail).slice(0, 100)}`); if (cond) pass++; };
(async () => {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'THEOLOGICUS.html';
    const f = path.join(ROOT, rel);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) {
      const ext = path.extname(f).toLowerCase();
      const types = { '.js': 'application/javascript; charset=utf-8', '.mp4': 'video/mp4', '.html': 'text/html; charset=utf-8', '.json': 'application/json; charset=utf-8', '.wasm': 'application/wasm' };
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
      return fs.createReadStream(f).pipe(res);
    }
    res.writeHead(404); res.end('nf');
  });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, process.env.PW_DIR ? { executablePath: path.join(PW, 'chromium-1234', 'chrome-win64', 'chrome.exe') } : {}));
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 120)));
  page.on('console', m => { if (m.type() === 'error' && /Worker|ffmpeg|CORS/i.test(m.text())) errors.push('CONSOLE:' + m.text().slice(0, 110)); });
  await page.goto(`http://127.0.0.1:${PORT}/ai-video.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  // 1. le script worker est servi PAR L'APP (même origine)
  const wrk = await page.evaluate(async () => {
    const r = await fetch('ffmpeg/814.ffmpeg.js');
    return { statut: r.status, taille: (await r.text()).length };
  });
  ok('script worker servi par l\'app (même origine)', wrk.statut === 200 && wrk.taille > 1000, JSON.stringify(wrk));

  // 2. ASSEMBLAGE RÉEL de deux vrais MP4 (ffmpeg.wasm chargé depuis le CDN)
  const res = await page.evaluate(async () => {
    try {
      const urls = ['.workbuddy-ai/artifacts/_v455/fixtures/seg0.mp4', '.workbuddy-ai/artifacts/_v455/fixtures/seg1.mp4'];
      const blob = await window.__v455Long.assembler(urls);
      const buf = new Uint8Array(await blob.arrayBuffer());
      let b64 = '';
      const CH = 0x8000;
      for (let i = 0; i < buf.length; i += CH) b64 += String.fromCharCode.apply(null, buf.subarray(i, i + CH));
      return { ok: true, taille: blob.size, type: blob.type, entete: String.fromCharCode(buf[4], buf[5], buf[6], buf[7]), b64: btoa(b64) };
    } catch (e) { return { ok: false, err: String(e && e.message || e) }; }
  });
  ok('assemblage RÉEL sans erreur (plus de « Failed to construct Worker »)', res.ok === true, res.err);
  if (res.ok) {
    ok('le résultat est un MP4 valide (en-tête ftyp)', res.entete === 'ftyp' && res.taille > 5000, JSON.stringify({ t: res.taille, e: res.entete, type: res.type }));
    // contrôle indépendant : le ffmpeg local mesure la durée du fichier produit
    const out = path.join(ROOT, '.workbuddy-ai/artifacts/_v455/fixtures/assemble.mp4');
    fs.writeFileSync(out, Buffer.from(res.b64, 'base64'));
    let duree = '?';
    try {
      const FF = require('child_process').execSync('python -c "import shutil;print(shutil.which(\'ffmpeg\'))"').toString().trim();
      const info = execFileSync(FF, ['-hide_banner', '-i', out, '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'] }).toString();
      duree = info;
    } catch (e) {
      const s = String(e.stderr || e.stdout || '');
      const m = s.match(/Duration: (\d+:\d+:\d+\.\d+)/);
      duree = m ? m[1] : s.slice(-120);
    }
    const d = String(duree).match(/Duration: (\d+):(\d+):(\d+\.\d+)/);
    const sec = d ? (+d[1]) * 3600 + (+d[2]) * 60 + parseFloat(d[3]) : -1;
    ok('durée du fichier assemblé ≈ 2 s (1 s + 1 s), mesurée par ffmpeg', sec > 1.7 && sec < 2.4, 'durée=' + sec + 's (' + String(duree).match(/Duration: [\d:.]+/) + ')');
  }

  ok('aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
  console.log(`RESULTAT : ${pass}/5`);
  process.exitCode = pass === 5 ? 0 : 1;
  await browser.close(); server.close();
})().catch(e => { console.log('EXCEPTION BANC :', e); process.exitCode = 1; process.exit(1); });
