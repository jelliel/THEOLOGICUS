// v442 — Prove-It : la sauvegarde complète exporte TOUT (IndexedDB + localStorage)
// et la restauration rend le poste à l'identique — y compris le localStorage
// (galerie AI VIDEO, préférences) qui manquait à l'ancien export.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const PORT = 8785;
const ROOT = process.env.THEO_ROOT || 'C:/tmp/theoverify';
const PW = process.env.PW_DIR || 'C:/Users/toshr/AppData/Local/ms-playwright';

(async () => {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'THEOLOGICUS.html';
    const f = path.join(ROOT, rel);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) {
      res.writeHead(200, { 'Content-Type': rel.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8' });
      return fs.createReadStream(f).pipe(res);
    }
    res.writeHead(404); res.end('nf');
  });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, process.env.PW_DIR ? { executablePath: path.join(PW, 'chromium-1234', 'chrome-win64', 'chrome.exe') } : {}));
  const page = await browser.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('theologicus_wizard_skipped', '1');
    // capture du blob d'export : click() neutralisé, le blob reste lisible
    window.__blobCapture = null;
    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { /* export sans téléchargement réel */ };
    const origCO = URL.createObjectURL;
    URL.createObjectURL = function (blob) { window.__blobCapture = blob; return 'blob:capture'; };
  });
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  let pass = 0;
  const ok = (name, cond, detail) => { console.log(`  ${cond ? '[OK]  ' : '[ECHEC]'}${name}${cond || detail === undefined ? '' : ' — ' + detail}`); if (cond) pass++; };
  try {
    await page.goto(`http://127.0.0.1:${PORT}/THEOLOGICUS.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1500);

    // amorce : données dans IDB + localStorage
    await page.evaluate(async () => {
      localStorage.setItem('v442-preference', 'electric-violet');
      localStorage.setItem('agnes_api_key', 'cle-studio-442');
      await db.put('chats', { id: 'c442', title: 'Conversation à sauvegarder', messages: [{ ts: 1, role: 'user', content: 'bonjour' }] });
      await db.put('settings', { id: 'pref-test', value: 'valeur-442' });
    });

    // 1. export complet
    const json = await page.evaluate(async () => {
      window.__dbg = { chats: (await db.getAll('chats')).length, settings: (await db.getAll('settings')).length };
      exportData();
      await new Promise(r => setTimeout(r, 300));
      return window.__blobCapture ? await window.__blobCapture.text() : null;
    });
    ok('l’export produit un JSON', !!json && json.length > 50);
    const pay = JSON.parse(json || '{}');
    ok('l’export contient le localStorage (préférences + clé studio)', !!(pay.data && pay.data.localStorage && pay.data.localStorage['v442-preference'] === 'electric-violet' && pay.data.localStorage['agnes_api_key'] === 'cle-studio-442'));
    ok('l’export contient chats, settings et version 2.2', pay.version === '2.2' && pay.data.chats.length >= 1 && pay.data.settings.length >= 1);

    // 2. destruction totale (simule un poste neuf)
    await page.evaluate(async () => {
      localStorage.removeItem('v442-preference');
      localStorage.removeItem('agnes_api_key');
      const all = await db.getAll('chats') || [];
      for (const r of all) await db.delete('chats', r.id);
      const alls = await db.getAll('settings') || [];
      for (const r of alls) await db.delete('settings', r.id);
    });
    const detruit = await page.evaluate(() => localStorage.getItem('v442-preference'));
    ok('les données sont bien détruites avant restauration', detruit === null);

    // 3. restauration
    const r3 = await page.evaluate(async (jsonText) => {
      window.confirm = () => false;   // pas de reload dans le banc
      const file = new File([jsonText], 'sauvegarde.json', { type: 'application/json' });
      await importData(file);
      return {
        pref: localStorage.getItem('v442-preference'),
        cle: localStorage.getItem('agnes_api_key'),
        chats: (await db.getAll('chats')).length,
        settings: (await db.getAll('settings')).length,
        dbg: window.__dbg,
      };
    }, json);
    ok('localStorage restauré à l’identique', r3.pref === 'electric-violet' && r3.cle === 'cle-studio-442');
    ok('IndexedDB restaurée à l’identique (chats + settings)', r3.chats === r3.dbg.chats && r3.settings === r3.dbg.settings);

    ok('aucune erreur JavaScript', errors.length === 0);
    console.log(`RESULTAT : ${pass}/7`);
    process.exitCode = pass === 7 ? 0 : 1;
  } catch (e) {
    console.log('EXCEPTION BANC :', e);
    process.exitCode = 1;
  } finally {
    await browser.close(); server.close();
  }
})();
