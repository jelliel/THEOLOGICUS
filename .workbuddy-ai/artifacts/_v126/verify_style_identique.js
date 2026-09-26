// v126n — Prove-It : le style « 🆔 Fidélité > Image Identique » existe dans le
// sélecteur, et quand il est actif les prompts demandent de garder l'image
// IDENTIQUE (caméra figée) au lieu de la signature « dramatic lighting,
// slow dolly-in » qui contredirait la consigne.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const PORT = 8775;
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
  await page.addInitScript(() => { localStorage.setItem('theologicus_wizard_skipped', '1'); });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  let pass = 0;
  const ok = (name, cond, detail) => { console.log(`  ${cond ? '[OK]  ' : '[ECHEC]'}${name}${cond || detail === undefined ? '' : ' — ' + detail}`); if (cond) pass++; };
  try {
    await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // 1. Le style existe dans les données
    const data = await page.evaluate(() => {
      const cat = STYLE_CATEGORIES.find(c => c.id === 'fidelite');
      const s = ALL_STYLES.find(x => x.n === 'Image Identique');
      return { catFirst: STYLE_CATEGORIES[0].id === 'fidelite', catName: cat ? cat.name : null, style: s ? { id: s.id, category: s.category, p: s.p } : null };
    });
    ok('la catégorie « 🆔 Fidélité » existe et est en tête du sélecteur', data.catFirst && data.catName === '🆔 Fidélité');
    ok('le style « Image Identique » existe dans ALL_STYLES', !!data.style);

    // 2. Le sélecteur l'affiche
    const dom = await page.evaluate(() => {
      openStylePicker();
      const html = document.getElementById('picker-body').innerHTML;
      closeStylePicker();
      return { visible: html.includes('Image Identique'), catVisible: html.includes('Fidélité') };
    });
    ok('le sélecteur de styles affiche la catégorie et le style', dom.visible && dom.catVisible);

    // 3. Prompts AVEC le style : image identique, caméra figée, pas de dolly-in
    const avec = await page.evaluate(() => {
      const s = ALL_STYLES.find(x => x.n === 'Image Identique');
      state.selectedStyles = [s];
      const img = buildImagePrompt();
      const vid = buildVideoPrompt();
      const imgTxt = buildImageTextPrompt();
      state.selectedStyles = [];
      return { img, vid, imgTxt };
    });
    ok('buildImagePrompt contient la consigne « exactly identical »', avec.img.includes('keep the source image exactly identical'), avec.img.slice(0, 120));
    ok('buildImagePrompt : caméra figée, PAS de dolly-in', avec.img.includes('static locked camera') && !avec.img.includes('dolly-in'), avec.img.slice(-120));
    ok('buildVideoPrompt : contenu préservé image par image', avec.vid.includes('content preserved identically frame to frame') && !avec.vid.includes('dramatic lighting'));
    ok('buildImageTextPrompt transporte le style fidèle', avec.imgTxt.includes('STYLE: keep the source image exactly identical'));

    // 4. SANS le style : comportement inchangé (dolly-in conservé)
    const sans = await page.evaluate(() => {
      state.selectedStyles = [];
      const img = buildImagePrompt();
      const vid = buildVideoPrompt();
      state.selectedStyles = [];
      return { img, vid };
    });
    ok('sans le style, « slow dolly-in » est conservé (aucune régression)', sans.img.includes('dramatic lighting, slow dolly-in'));
    ok('sans le style, buildVideoPrompt garde « coherent motion »', sans.vid.includes('dramatic lighting, coherent motion'));

    // 5. Aucune erreur JavaScript
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
