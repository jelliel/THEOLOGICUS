// v126p — Prove-It : la catégorie « 🎞️ MOTION ONLY » (15 styles fournis par
// l'utilisateur) existe dans le sélecteur ; ses prompts figent le sujet et
// REMPLACENT la signature générique « dramatic lighting, slow dolly-in » sans
// imposer de caméra fixe — chaque style dit lui-même ce qui bouge
// (« Caméra Vivante » veut son propre dolly-in très lent).
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const PORT = 8777;
const ROOT = path.resolve(__dirname, '..', '..', '..');
const PW = 'C:/Users/toshr/AppData/Local/ms-playwright';

const ATTENDUS = [
  'MOTION ONLY — Pur', 'Respiration Seule', 'Regard Vivant', 'Lumière Vivante',
  'Ambiance Seule', 'Caméra Vivante', 'Micro-Mouvements', 'Cinéma Documentaire Figé',
  'Gouttes & Particules', 'Feu & Fumée Seuls', 'Golden Hour Figé', 'Nuit Vivante Figée',
  'Brise Marine Figée', 'Ville Vivante Figée', 'Lucioles & Étincelles',
];

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
  await page.addInitScript(() => { localStorage.setItem('theologicus_wizard_skipped', '1'); });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  let pass = 0;
  const ok = (name, cond, detail) => { console.log(`  ${cond ? '[OK]  ' : '[ECHEC]'}${name}${cond || detail === undefined ? '' : ' — ' + detail}`); if (cond) pass++; };
  try {
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // 1. La catégorie et ses styles
    const data = await page.evaluate(() => {
      const cat = STYLE_CATEGORIES.find(c => c.id === 'motion_only');
      return {
        catName: cat ? cat.name : null,
        nb: cat ? cat.styles.length : 0,
        tous: cat ? cat.styles.every(s => ALL_STYLES.find(x => x.n === s.n && x.category === 'motion_only')) : false,
      };
    });
    ok('la catégorie « 🎞️ MOTION ONLY — Animate sans modifier » existe', data.catName === '🎞️ MOTION ONLY — Animate sans modifier');
    ok('elle contient les styles fournis (15)', data.nb === 15, 'trouvés : ' + data.nb);
    ok('tous ses styles sont enregistrés dans ALL_STYLES', data.tous);

    // 2. Chaque style attendu est présent
    const manquants = await page.evaluate((noms) => {
      const present = ALL_STYLES.filter(x => x.category === 'motion_only').map(x => x.n);
      return noms.filter(n => !present.includes(n));
    }, ATTENDUS);
    ok('les 15 styles nommés du fichier utilisateur sont là', manquants.length === 0, 'manquants : ' + manquants.join(', '));

    // 3. Le sélecteur les affiche
    const dom = await page.evaluate(() => {
      openStylePicker();
      const html = document.getElementById('picker-body').innerHTML;
      closeStylePicker();
      return { cat: html.includes('MOTION ONLY'), pur: html.includes('MOTION ONLY — Pur'), cam: html.includes('Caméra Vivante') };
    });
    ok('le sélecteur affiche la catégorie et ses styles', dom.cat && dom.pur && dom.cam);

    // 4. Prompt avec « MOTION ONLY — Pur » : sujet figé, pas de signature générique
    const pur = await page.evaluate(() => {
      state.selectedStyles = [ALL_STYLES.find(x => x.n === 'MOTION ONLY — Pur')];
      const img = buildImagePrompt();
      const vid = buildVideoPrompt();
      state.selectedStyles = [];
      return { img, vid };
    });
    ok('le prompt transporte « ANIMATE ONLY. DO NOT MODIFY »', pur.img.includes('ANIMATE ONLY. DO NOT MODIFY'));
    ok('signature : sujet figé, PAS de dramatic lighting NI de dolly-in générique', pur.img.includes('subject frozen identical') && !pur.img.includes('dramatic lighting') && !pur.img.includes('slow dolly-in'), pur.img.slice(-140));
    ok('buildVideoPrompt : même traitement', pur.vid.includes('subject frozen identical') && !pur.vid.includes('dramatic lighting, coherent motion'));

    // 5. « Caméra Vivante » : son propre dolly-in reste possible (pas de caméra fixe imposée)
    const cam = await page.evaluate(() => {
      state.selectedStyles = [ALL_STYLES.find(x => x.n === 'Caméra Vivante')];
      const img = buildImagePrompt();
      state.selectedStyles = [];
      return img;
    });
    ok('« Caméra Vivante » garde son dolly-in personnel', cam.includes('ONLY CAMERA MOVES') && cam.includes('subject frozen identical') && !cam.includes('static locked camera') && !cam.includes('dramatic lighting'), cam.slice(-140));

    // 6. Sans style : comportement inchangé
    const sans = await page.evaluate(() => { state.selectedStyles = []; return buildImagePrompt(); });
    ok('sans le style, « slow dolly-in » est conservé (aucune régression)', sans.includes('dramatic lighting, slow dolly-in'));

    // 7. Aucune erreur JavaScript
    ok('aucune erreur JavaScript', errors.length === 0);

    console.log(`RESULTAT : ${pass}/11`);
    process.exitCode = pass === 11 ? 0 : 1;
  } catch (e) {
    console.log('EXCEPTION BANC :', e);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
})();
