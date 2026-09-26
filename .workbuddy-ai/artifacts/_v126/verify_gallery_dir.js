// v126m — Prove-It : le bouton « 📁 Dossier » ouvre la popup de sélection de
// répertoire, le choix est réutilisé (pas de re-demande), les vidéos vont
// DANS le dossier choisi, et Auto-DL n'ouvre jamais la popup tout seul.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const PORT = 8774;
const ROOT = path.resolve(__dirname, '..', '..', '..');
const PW = 'C:/Users/toshr/AppData/Local/ms-playwright';

(async () => {
  const server = http.createServer((req, res) => {
    const file = req.url === '/' ? path.join(ROOT, 'ai-video.html') : '';
    if (file && fs.existsSync(file)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      fs.createReadStream(file).pipe(res);
      return;
    }
    res.writeHead(404); res.end('not found');
  });
  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
  const browser = await chromium.launch({
    executablePath: path.join(PW, 'chromium-1234', 'chrome-win64', 'chrome.exe'),
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('theologicus_wizard_skipped', '1');
    // Fake File System Access : la « popup » incrémente un compteur et le
    // « dossier » enregistre les fichiers écrits en mémoire.
    window.__pickerCalls = 0;
    window.__fakeFiles = {};
    const fakeHandle = {
      name: 'Mes-Videos',
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
      async getFileHandle(name) {
        return {
          async createWritable() {
            const parts = [];
            return {
              write: async (d) => parts.push(d),
              close: async () => { window.__fakeFiles[name] = parts.map(String).join(''); },
            };
          },
        };
      },
    };
    window.showDirectoryPicker = async () => { window.__pickerCalls++; return fakeHandle; };
    localStorage.setItem('cinema_noir_gallery_v1', JSON.stringify([
      { id: 'test1', label: 'Scène Test', blob: 'data:video/mp4;base64,QUFBQQ==', timestamp: Date.now() },
      { id: 'test2', label: 'Scène Deux', blob: 'data:video/mp4;base64,QkJCQg==', timestamp: Date.now() },
    ]));
  });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  let pass = 0;
  const ok = (name, cond) => { console.log(`  ${cond ? '[OK]  ' : '[ECHEC]'}${name}`); if (cond) pass++; };
  try {
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // 1. Le bouton existe dans la galerie
    const btn = await page.evaluate(() => {
      const b = document.getElementById('gallery-dir-btn');
      return b ? b.textContent : null;
    });
    ok('le bouton « 📁 Dossier » existe dans la galerie', btn === '📁 Dossier');

    // 2. DL individuel sans dossier choisi : la popup s'ouvre, le fichier est écrit dedans
    const r1 = await page.evaluate(async () => {
      await downloadVideoEntry('test1');
      return { picker: window.__pickerCalls, files: Object.keys(window.__fakeFiles), handle: _dirHandle ? _dirHandle.name : null };
    });
    ok('le premier DL ouvre la popup une fois', r1.picker === 1);
    ok('la vidéo est écrite dans le dossier choisi', r1.files.length === 1 && r1.files[0].startsWith('cinema-noir_Sc_ne_Test_'));
    ok('le handle du dossier est retenu', r1.handle === 'Mes-Videos');

    // 3. DL suivant : PAS de nouvelle popup (le choix est réutilisé)
    const r2 = await page.evaluate(async () => {
      await downloadVideoEntry('test2');
      return { picker: window.__pickerCalls, files: Object.keys(window.__fakeFiles).length };
    });
    ok('le DL suivant ne rouvre pas la popup', r2.picker === 1);
    ok('la deuxième vidéo est écrite dans le même dossier', r2.files === 2);

    // 4. Bouton « Tout » : une seule popup en plus au maximum, écritures groupées
    await page.evaluate(() => {
      window.__fakeFiles = {};
      _dirHandle = null; // simule une session où le dossier n'est pas encore choisi
    });
    const r3 = await page.evaluate(async () => {
      window.confirm = () => true;
      await downloadAllVideos();
      return { picker: window.__pickerCalls, files: Object.keys(window.__fakeFiles).length };
    });
    ok('« Tout » ouvre la popup une seule fois pour le lot', r3.picker === 2);
    ok('« Tout » écrit les 2 vidéos dans le dossier', r3.files === 2);

    // 5. Auto-DL sans dossier choisi : aucune popup (pas un geste utilisateur)
    const r4 = await page.evaluate(async () => {
      window.__fakeFiles = {};
      window.__pickerCalls = 0;
      _dirHandle = null;
      await downloadVideoEntry('test1', false);
      return { picker: window.__pickerCalls };
    });
    ok("Auto-DL sans dossier choisi n'ouvre PAS la popup", r4.picker === 0);

    // 6. Aucune erreur JavaScript
    ok('aucune erreur JavaScript', errors.length === 0);

    console.log(`RESULTAT : ${pass}/10`);
    process.exitCode = pass === 10 ? 0 : 1;
  } catch (e) {
    console.log('EXCEPTION BANC :', e);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
})();
