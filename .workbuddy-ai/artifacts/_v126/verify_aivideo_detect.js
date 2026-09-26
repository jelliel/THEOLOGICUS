// v126i — Prove-It : « Détecter » remplit-il la grille quand l'API renvoie
// une liste de modèles VALIDE ? On simule le relais /proxy/ avec une 200 +
// une liste Agnes et Mistral. Si la grille se remplit, le rendu marche et
// « pas de modèles » vient de la réponse RÉELLE (clé ou forme du JSON).
// Sinon, le bug est dans le rendu.
const { chromium } = require('playwright');
const path = require('path');
const http = require('http');
const fs = require('fs');

const PORT = 8767;
const RACINE = path.resolve(__dirname, '..', '..', '..');
const PW = 'C:/Users/toshr/AppData/Local/ms-playwright';
const DIR = path.join(__dirname, '_detect_bench');

const MOCK = {
  agnes: JSON.stringify({ data: [
    { id: 'agnes-video-v2.0', name: 'Agnes Video v2.0', description: 'generation video' },
    { id: 'agnes-image-xl', name: 'Agnes Image XL', description: 'image' },
  ] }),
  mistral: JSON.stringify({ data: [
    { id: 'mistral-large-latest', name: 'Mistral Large', owned_by: 'mistral' },
    { id: 'pixtral-large-latest', name: 'Pixtral Large', owned_by: 'mistral' },
  ] }),
};

const resultats = [];
function ok(nom, cond, detail) { resultats.push([!!cond, nom]); console.log(`  ${cond ? '[OK]  ' : '[ECHEC]'} ${nom}${detail ? '  -- ' + detail : ''}`); return !!cond; }

(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  fs.copyFileSync(path.join(RACINE, 'ai-video.html'), path.join(DIR, 'ai-video.html'));

  const serveur = http.createServer((req, res) => {
    const url = req.url || '';
    // Relais Agnes simulé
    if (url.startsWith('/proxy/https://apihub.agnes-ai.com/v1/models')) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(MOCK.agnes); return;
    }
    // Relais Mistral simulé
    if (url.startsWith('/proxy/https://api.mistral.ai/v1/models')) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(MOCK.mistral); return;
    }
    let p = decodeURIComponent(url.split('?')[0]);
    if (p === '/') p = '/ai-video.html';
    const fp = path.join(DIR, p);
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      fs.createReadStream(fp).pipe(res);
    } else { res.writeHead(404); res.end('nf'); }
  });
  await new Promise(r => serveur.listen(PORT, '127.0.0.1', r));

  const browser = await chromium.launch({ executablePath: path.join(PW, 'chromium-1234', 'chrome-win64', 'chrome.exe'), args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(String(e)));

  try {
    await page.goto(`http://127.0.0.1:${PORT}/ai-video.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('#api-key-input');
    await page.fill('#api-key-input', 'sk-agnes-valid');
    await page.fill('#mistral-key-input', 'sk-mistral-valid');
    await page.waitForTimeout(300);

    // Agnes : cliquer Détecter
    await page.click('#model-refresh-btn');
    await page.waitForTimeout(3000);
    const agnesCards = await page.$$eval('#model-grid .model-card', els => els.map(e => ({ text: e.textContent.trim(), id: e.dataset.agnesId })));
    ok('Agnes « Détecter » remplit la grille (' + agnesCards.length + ' carte(s))', agnesCards.length === 2, JSON.stringify(agnesCards));
    ok('Agnes grille contient le bon id', agnesCards.some(c => c.id === 'agnes-video-v2.0'), JSON.stringify(agnesCards));

    // Mistral : cliquer Détecter
    await page.click('#mistral-refresh-btn');
    await page.waitForTimeout(3000);
    const mistralCards = await page.$$eval('#mistral-model-grid .model-card', els => els.map(e => e.textContent.trim()));
    ok('Mistral « Détecter » remplit la grille (' + mistralCards.length + ' carte(s))', mistralCards.length === 2, JSON.stringify(mistralCards));
    ok('Mistral grille contient Pixtral (vision)', mistralCards.some(c => c.includes('Pixtral')), JSON.stringify(mistralCards));

    ok('aucune erreur JavaScript', erreurs.length === 0, erreurs.slice(0, 3).join(' | '));
  } catch (e) {
    console.log('\n[EXCEPTION] ' + (e && e.stack || e));
  } finally {
    await browser.close();
    serveur.close();
  }

  const bons = resultats.filter(r => r[0]).length;
  console.log('\n' + '='.repeat(72));
  console.log(`RESULTAT : ${bons}/${resultats.length}`);
  process.exit(bons === resultats.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(3); });