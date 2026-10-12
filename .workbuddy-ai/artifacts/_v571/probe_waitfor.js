/* micro-test : Playwright waitForFunction attend-il une promesse async ? */
const { chromium } = require('playwright');
const PW = process.env.PW_DIR || 'C:/Users/toshr/AppData/Local/ms-playwright';
(async () => {
  const browser = await chromium.launch(process.env.PW_DIR ? { executablePath: PW + '/chromium-1234/chrome-win64/chrome.exe' } : {});
  const page = await browser.newPage();
  await page.goto('about:blank');
  const t0 = Date.now();
  let appels = 0;
  try {
    await page.waitForFunction((n) => { appels = n; return window.__vu === true; }, appels, { timeout: 3000 });
  } catch (e) { /* timeout attendu */ }
  // cas 1 : prédicate ASYNC qui retourne false après 500ms
  await page.evaluate(() => { window.__vu = false; });
  const t1 = Date.now();
  try {
    await page.waitForFunction(async () => {
      await new Promise(r => setTimeout(r, 400));
      return window.__vu === true;
    }, { timeout: 3000 });
    console.log('ASYNC false-après-400ms : RÉSOLU en ' + (Date.now() - t1) + 'ms (si <300ms => promesse NON attendue !)');
  } catch (e) {
    console.log('ASYNC false-après-400ms : timeout après ' + (Date.now() - t1) + 'ms (promesse attendue ✅)');
  }
  // cas 2 : prédicate async qui devient true après 600ms
  setTimeout(() => { page.evaluate(() => { window.__vu = true; }); }, 600);
  const t2 = Date.now();
  try {
    await page.waitForFunction(async () => {
      await new Promise(r => setTimeout(r, 400));
      return window.__vu === true;
    }, { timeout: 5000 });
    console.log('ASYNC true-à-600ms : RÉSOLU en ' + (Date.now() - t2) + 'ms (attendu ≥600ms)');
  } catch (e) {
    console.log('ASYNC true-à-600ms : timeout (BUG)');
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(3); });
