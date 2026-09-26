// v126o — Prove-It : la catégorie « 🔒 IDENTITY LOCK — Réalisme » (16 styles
// fournis par l'utilisateur) existe dans le sélecteur, et chacun de ses styles
// actifs remplace la signature générique « dramatic lighting, slow dolly-in »
// par une caméra fixe — leurs prompts prescrivent déjà leur propre éclairage.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const PORT = 8776;
const ROOT = path.resolve(__dirname, '..', '..', '..');
const PW = 'C:/Users/toshr/AppData/Local/ms-playwright';

const ATTENDUS = [
  'Identity Lock — Portrait Pur', 'Photo Studio Réaliste', 'Cinéma Réaliste Hollywood',
  'Miroir Vivant', 'Documentaire Authentique', 'Portrait Argentique', 'Hyperréalisme',
  'Cinéma Vérité', 'Fidélité Absolue', 'Golden Hour Réaliste', 'Clair de Lune Réaliste',
  'Peinture Hyperréaliste', 'Cinéma 4D Réaliste', 'Broadcast TV Réaliste', 'Urban Realism',
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

    // 1. La catégorie et ses 16 styles (15 attendus + le comptage)
    const data = await page.evaluate(() => {
      const cat = STYLE_CATEGORIES.find(c => c.id === 'identity_lock');
      return {
        catName: cat ? cat.name : null,
        nb: cat ? cat.styles.length : 0,
        tous: cat ? cat.styles.every(s => ALL_STYLES.find(x => x.n === s.n && x.category === 'identity_lock')) : false,
      };
    });
    ok('la catégorie « 🔒 IDENTITY LOCK — Réalisme » existe', data.catName === '🔒 IDENTITY LOCK — Réalisme');
    ok('elle contient bien les styles fournis (15+)', data.nb >= 15, 'trouvés : ' + data.nb);
    ok('tous ses styles sont enregistrés dans ALL_STYLES', data.tous);

    // 2. Chaque style attendu est présent
    const manquants = await page.evaluate((noms) => {
      const present = ALL_STYLES.filter(x => x.category === 'identity_lock').map(x => x.n);
      return noms.filter(n => !present.includes(n));
    }, ATTENDUS);
    ok('les 15 styles nommés du fichier utilisateur sont là (sans doublon de nom)', manquants.length === 0, 'manquants : ' + manquants.join(', '));

    // 3. Le sélecteur les affiche
    const dom = await page.evaluate(() => {
      openStylePicker();
      const html = document.getElementById('picker-body').innerHTML;
      closeStylePicker();
      return { cat: html.includes('IDENTITY LOCK'), style: html.includes('Identity Lock — Portrait Pur'), miroir: html.includes('Miroir Vivant') };
    });
    ok('le sélecteur affiche la catégorie et ses styles', dom.cat && dom.style && dom.miroir);

    // 4. Prompts avec un style IDENTITY LOCK : caméra fixe, pas de dolly-in générique
    const avec = await page.evaluate(() => {
      const s = ALL_STYLES.find(x => x.n === 'Identity Lock — Portrait Pur');
      state.selectedStyles = [s];
      const img = buildImagePrompt();
      const vid = buildVideoPrompt();
      state.selectedStyles = [];
      return { img, vid, p: s.p };
    });
    ok('le prompt du style transporte sa consigne STRICT IDENTITY PRESERVATION', avec.img.includes('STRICT IDENTITY PRESERVATION'));
    ok('buildImagePrompt : caméra fixe, PAS de dolly-in générique', avec.img.includes('static locked camera') && !avec.img.includes('dolly-in'), avec.img.slice(-130));
    ok('buildVideoPrompt : caméra fixe, contenu préservé', avec.vid.includes('static locked camera') && !avec.vid.includes('dramatic lighting, coherent motion'));

    // 5. Un second style de la famille, même comportement
    const avec2 = await page.evaluate(() => {
      const s = ALL_STYLES.find(x => x.n === 'Documentaire Authentique');
      state.selectedStyles = [s];
      const img = buildImagePrompt();
      state.selectedStyles = [];
      return img;
    });
    ok('« Documentaire Authentique » : caméra fixe elle aussi', avec2.includes('static locked camera') && !avec2.includes('dolly-in'));

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
