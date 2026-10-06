const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const { spawn } = require('child_process');
const ROOT = 'C:/tmp/theoverify'; const PORT = 8899;
const PW = 'C:/Users/toshr/AppData/Local/ms-playwright';
const PY = 'C:/Users/toshr/.workbuddy-ai/binaries/python/versions/3.13.12/python.exe';
(async () => {
  const src = fs.readFileSync(path.join(ROOT, 'proxy_server.py'), 'utf8');
  const copie = path.join(ROOT, '_montage_test_serveur.py');
  fs.writeFileSync(copie, src.replace(/^PORT = \d+/m, 'PORT = ' + PORT));
  const srv = spawn(PY, [copie], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise(r => setTimeout(r, 4000));
  const browser = await chromium.launch({ executablePath: path.join(PW, 'chromium-1234', 'chrome-win64', 'chrome.exe'), args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 150)));
  await page.goto(`http://127.0.0.1:${PORT}/ai-video.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const r = await page.evaluate(async () => {
    try {
      const rep = await fetch('/montage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: ['.workbuddy-ai/artifacts/_v455/fixtures/seg0.mp4', '.workbuddy-ai/artifacts/_v455/fixtures/seg1.mp4'] })
      });
      const t = rep.headers.get('Content-Type') || '';
      let info = { statut: rep.status, type: t };
      if (/json/i.test(t)) { info.corps = (await rep.text()).slice(0, 200); }
      else { const b = await rep.blob(); info.taille = b.size; }
      return info;
    } catch (e) { return { erreur: String(e && e.message || e) }; }
  });
  console.log('fetch /montage depuis la page :', JSON.stringify(r));
  // et l'assembler complet
  const a = await page.evaluate(async () => {
    try { const b = await window.__v455Long.assembler(['.workbuddy-ai/artifacts/_v455/fixtures/seg0.mp4', '.workbuddy-ai/artifacts/_v455/fixtures/seg1.mp4']); return { ok: true, taille: b.size }; }
    catch (e) { return { ok: false, err: String(e && e.message || e) }; }
  });
  console.log('assembler() :', JSON.stringify(a));
  const j = await page.evaluate(() => logState.entries.map(e => e.level + ': ' + e.message).slice(-6));
  console.log('journal :', JSON.stringify(j).slice(0, 400));
  try { srv.kill(); } catch (e) {}
  await browser.close();
})().catch(e => { console.log('ERR:', String(e).slice(0, 200)); process.exit(1); });
