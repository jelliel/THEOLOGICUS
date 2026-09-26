// v126h — bench de reproduction « Erreur réseau » sur Vérifier.
// Teste DEUX chemins de l'iframe AI VIDEO :
//   A) normal   : ai-video.html servi (origine http://, comme .bat)
//   B) srcdoc   : ai-video.html 404 -> repli srcdoc (about:srcdoc, comme exe
//                 si ai-video.html n'est pas à côté du exe)
// Le relais /proxy/ est simulé (Playwright route) pour isoler le problème
// d'origine / résolution d'URL du fetch, indépendamment de la vraie API.
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:8765';
const MOCK_AGNES = JSON.stringify({ data: [{ id: 'agnes-model-v1', name: 'Agnes Model v1' }] });
const MOCK_MISTRAL = JSON.stringify({ data: [{ id: 'mistral-large-latest', name: 'Mistral Large' }] });

function attachMockRelay(page, log) {
  // Agnes
  page.route(/proxy\/https:\/\/apihub\.agnes-ai\.com\//, (route) => {
    log.push('RELAY Agnes: ' + route.request().url());
    route.fulfill({ status: 200, contentType: 'application/json', body: MOCK_AGNES });
  });
  // Mistral
  page.route(/proxy\/https:\/\/api\.mistral\.ai\//, (route) => {
    log.push('RELAY Mistral: ' + route.request().url());
    route.fulfill({ status: 200, contentType: 'application/json', body: MOCK_MISTRAL });
  });
}

async function frameInfo(page) {
  // Renvoie le frame de l'iframe AI VIDEO (src ou srcdoc).
  for (const f of page.frames()) {
    const u = f.url();
    if (u.includes('ai-video') || u === 'about:srcdoc') return f;
  }
  return null;
}

async function runOne(browser, label, forceSrcdoc) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  // Saute l'assistant qui recouvre la HUD (sinon le clic est bloqué).
  await page.addInitScript(() => { try { localStorage.setItem('theologicus_wizard_skipped', '1'); } catch (e) {} });
  const log = [];
  const consoleErr = [];
  const pageErr = [];
  const allLog = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErr.push(m.text()); else allLog.push(m.text()); });
  page.on('pageerror', (e) => pageErr.push(String(e)));

  if (forceSrcdoc) {
    // Force le repli srcdoc : la route /ai-video.html répond 404.
    page.route('**/ai-video.html', (route) => {
      log.push('INTERCEPT ai-video.html -> 404 (force srcdoc)');
      route.fulfill({ status: 404, contentType: 'text/plain', body: 'not found' });
    });
  }
  attachMockRelay(page, log);

  const result = { label, path: null, status: null, proxyHit: false, consoleErr, pageErr, log, allLog };

  try {
    await page.goto(BASE + '/THEOLOGICUS.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000); // laisse les 59 scripts s'initialiser
    // Ouvre le modal AI VIDEO (via evaluate : bypass les contrôles d'actionnabilité)
    await page.evaluate(() => { const b = document.getElementById('open-aivideo-modal'); if (b) b.click(); });
    await page.waitForTimeout(2000);
    // Attend que l'iframe soit prête (input présent)
    await page.waitForTimeout(1500);
    const frame = await frameInfo(page);
    if (!frame) { result.status = 'NO FRAME'; return result; }
    result.path = frame.url();
    // Attend l'input
    try {
      await frame.waitForSelector('#api-key-input', { timeout: 8000 });
    } catch (e) {
      result.status = 'NO #api-key-input (path=' + result.path + ')';
      return result;
    }
    const fl = page.frameLocator('#aivideo-frame');
    await fl.locator('#api-key-input').fill('sk-agnes-test-123');
    // Vérifie que la valeur est bien posée
    const valAvant = await fl.locator('#api-key-input').inputValue();
    result.log.push('input value = ' + JSON.stringify(valAvant));
    // Clique Vérifier (evaluate : envoie un vrai clic au bouton, bypass hit-test)
    await fl.locator('#api-verify-btn').evaluate((b) => b.click());
    await page.waitForTimeout(500);
    const btnTxt = await fl.locator('#api-verify-btn').textContent().catch(() => '(n/a)');
    result.log.push('bouton juste après clic = ' + JSON.stringify(btnTxt));
    // Attend le résultat (statut change)
    await page.waitForTimeout(4000);
    try {
      result.status = (await frame.textContent('#api-status-text'))?.trim() || '(vide)';
    } catch (e) { result.status = '(lecture statut échouée)'; }
    result.proxyHit = log.some((l) => l.startsWith('RELAY'));
  } catch (e) {
    result.status = 'EXCEPTION: ' + String(e).split('\n')[0];
  } finally {
    await ctx.close();
  }
  return result;
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Users\\toshr\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe',
  });
  const out = [];
  out.push(await runOne(browser, 'A-normal (ai-video.html servi)', false));
  out.push(await runOne(browser, 'B-srcdoc (ai-video.html 404 -> srcdoc)', true));
  // Test C — ouverture DIRECTE en file:// (sans relais) : _VIA_RELAIS=false
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const consoleErr = [], pageErr = [], allLog = [], log = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErr.push(m.text()); else allLog.push(m.text()); });
    page.on('pageerror', (e) => pageErr.push(String(e)));
    const result = { label: 'C-file:// (ouverture directe, pas de relais)', path: null, status: null, proxyHit: false, consoleErr, pageErr, log, allLog };
    try {
      await page.goto('file:///C:/Theologicus/ai-video.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
      result.path = page.url();
      await page.waitForSelector('#api-key-input', { timeout: 8000 });
      await page.fill('#api-key-input', 'sk-agnes-test-123');
      await page.click('#api-verify-btn', { force: true }).catch(async () => { await page.evaluate(() => document.getElementById('api-verify-btn').click()); });
      await page.waitForTimeout(4000);
      result.status = (await page.textContent('#api-status-text'))?.trim() || '(vide)';
    } catch (e) { result.status = 'EXCEPTION: ' + String(e).split('\n')[0]; }
    finally { await ctx.close(); }
    out.push(result);
  }
  await browser.close();

  let pass = 0, total = out.length;
  for (const r of out) {
    const ok = r.status && r.status.includes('valide');
    if (ok) pass++;
    console.log('\n=== ' + r.label + ' ===');
    console.log('  chemin iframe : ' + r.path);
    console.log('  statut       : ' + r.status);
    console.log('  relay atteint: ' + r.proxyHit);
    if (r.proxyHit === false && r.status && r.status.includes('réseau'))
      console.log('  >> fetch a THROW (relay jamais atteint) — base URL / origine en cause');
    console.log('  console.err  : ' + JSON.stringify(r.consoleErr));
    console.log('  console.all  : ' + JSON.stringify(r.allLog.filter((x) => x.includes('[BENCH]'))));
    console.log('  pageerror    : ' + JSON.stringify(r.pageErr));
    console.log('  log          : ' + JSON.stringify(r.log));
  }
  console.log('\nRESUME: ' + pass + '/' + total + ' chemins OK (statut « valide »)');
  process.exit(pass === total ? 0 : 1);
})();
