/* Banc v459 — modèles Agnes avancés (scénario 2.5 + génération d'image).
   Réseau intercepté : on vérifie LE MODÈLE RÉELLEMENT ENVOYÉ, les replis, et
   que l'image produite entre bien dans la liste prête pour la vidéo. */
const { chromium } = require('playwright');
const path = require('path'); const http = require('http'); const fs = require('fs');
const PORT = 8901; const ROOT = process.env.THEO_ROOT || 'C:/tmp/theoverify';
const PW = process.env.PW_DIR || 'C:/Users/toshr/AppData/Local/ms-playwright';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
let pass = 0;
const ok = (name, cond, detail) => { console.log(` ${cond ? '[OK] ' : '[ECHEC]'}${name}${cond || detail === undefined ? '' : ' — ' + String(detail).slice(0, 100)}`); if (cond) pass++; };
(async () => {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'ai-video.html';
    const f = path.join(ROOT, rel);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) {
      res.writeHead(200, { 'Content-Type': rel.endsWith('.js') ? 'application/javascript; charset=utf-8' : 'text/html; charset=utf-8' });
      return fs.createReadStream(f).pipe(res);
    }
    res.writeHead(404); res.end('nf');
  });
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, process.env.PW_DIR ? { executablePath: path.join(PW, 'chromium-1234', 'chrome-win64', 'chrome.exe') } : {}));
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e).slice(0, 110)));
  await page.addInitScript(() => {
    localStorage.setItem('agnes_api_key', 'sk-test-agnes');
    localStorage.setItem('mistral_api_key_v1', 'sk-test-mistral');
  });

  // interception : on note chaque appel et on répond
  const appels = [];
  let imageEchec21 = false;
  await page.route('**/proxy/**', async route => {
    const url = route.request().url();
    let corps = null;
    try { corps = JSON.parse(route.request().postData() || '{}'); } catch (e) {}
    if (/chat\/completions/.test(url)) {
      appels.push({ type: 'chat', modele: corps && corps.model });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: 'A cinematic shot of a silver car, neon reflections, tracking camera.' } }] }) });
    }
    if (/images\/generations/.test(url)) {
      appels.push({ type: 'image', modele: corps && corps.model });
      if (imageEchec21 && corps && corps.model === 'agnes-image-2.1-flash') {
        return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ detail: 'model not found' }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [{ b64_json: PNG }] }) });
    }
    return route.fulfill({ status: 404, body: '{}' });
  });

  await page.goto(`http://127.0.0.1:${PORT}/ai-video.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const api = await page.evaluate(() => window.__v459 ? Object.keys(window.__v459) : null);
  ok('API v459 exposée', api && api.indexOf('genererImage') >= 0, JSON.stringify(api));
  ok('modèles retenus : agnes-2.5-flash + agnes-image-2.1-flash', await page.evaluate(() => window.__v459.texte === 'agnes-2.5-flash' && window.__v459.image === 'agnes-image-2.1-flash'));

  // ── A) enrichissement par Agnes 2.5 ──
  /* les boutons d'enrichissement vivent dans les modes VIDÉO et COMBO
     (liaison ligne 2425 : btn-5 -> main-prompt-video) */
  await page.evaluate(() => { setMode('video'); document.getElementById('main-prompt-video').value = 'une voiture dans une ville'; document.getElementById('main-prompt').value = 'une voiture dans une ville'; });
  await page.evaluate(() => document.getElementById('mistral-enrich-btn-5').click());
  await page.waitForTimeout(900);
  const chat = appels.filter(a => a.type === 'chat');
  ok('scénario enrichi via agnes-2.5-flash', chat.length === 1 && chat[0].modele === 'agnes-2.5-flash', JSON.stringify(chat));
  const texte = await page.evaluate(() => document.getElementById('main-prompt-video').value);
  ok('le prompt du champ a bien été remplacé', /cinematic/i.test(texte), texte.slice(0, 60));

  // ── B) génération d'image ──
  const bouton = await page.$('#v459-img-btn');
  ok('bouton « Générer une image » présent dans le mode image', !!bouton);
  await page.evaluate(() => document.getElementById('v459-img-btn').click());
  await page.waitForTimeout(1000);
  const img = appels.filter(a => a.type === 'image');
  ok('image demandée à agnes-image-2.1-flash', img.length === 1 && img[0].modele === 'agnes-image-2.1-flash', JSON.stringify(img));
  const apres = await page.evaluate(() => ({
    n: state.images.length,
    premier: state.images[0] ? { type: state.images[0].type, dataUri: String(state.images[0].dataUri).slice(0, 22), nom: state.images[0].name } : null,
    grille: (document.getElementById('images-grid') || {}).innerHTML ? document.getElementById('images-grid').innerHTML.indexOf('<img') >= 0 : false,
    boutonActif: !document.getElementById('v459-img-btn').disabled
  }));
  ok('l’image générée entre dans la liste (data URI)', apres.n === 1 && /^data:image\/png;base64/.test(String(apres.premier && apres.premier.dataUri)), JSON.stringify(apres.premier));
  ok('la grille d’images est rendue', apres.grille === true);
  ok('le bouton est réactivé après la génération', apres.boutonActif === true);

  // ── repli : 2.1 indisponible → 2.0 ──
  appels.length = 0;
  await page.evaluate(() => { state.images = []; });
  imageEchec21 = true;
  await page.evaluate(() => document.getElementById('v459-img-btn').click());
  await page.waitForTimeout(1200);
  const img2 = appels.filter(a => a.type === 'image').map(a => a.modele);
  ok('repli automatique sur agnes-image-2.0-flash', JSON.stringify(img2) === '["agnes-image-2.1-flash","agnes-image-2.0-flash"]', JSON.stringify(img2));
  const n2 = await page.evaluate(() => state.images.length);
  ok('malgré le repli, une image est produite', n2 === 1, 'images=' + n2);
  imageEchec21 = false;

  // ── sans clé Agnes : chemin Mistral d'origine (aucun appel Agnes) ──
  appels.length = 0;
  await page.evaluate(() => { localStorage.removeItem('agnes_api_key'); });
  await page.evaluate(() => document.getElementById('v459-img-btn').click());
  await page.waitForTimeout(600);
  ok('sans clé Agnes : aucun appel image tenté', appels.filter(a => a.type === 'image').length === 0, JSON.stringify(appels));

  ok('aucune erreur JavaScript', errors.length === 0, errors.join(' | '));
  console.log(`RESULTAT : ${pass}/13`);
  process.exitCode = pass === 13 ? 0 : 1;
  await browser.close(); server.close();
})().catch(e => { console.log('EXCEPTION BANC :', e); process.exitCode = 1; process.exit(1); });
