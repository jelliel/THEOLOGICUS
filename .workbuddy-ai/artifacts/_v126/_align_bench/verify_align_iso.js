const { chromium } = require('playwright');
const URL = 'http://127.0.0.1:8791/_v126/_align_bench/test_align.html';

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Users/toshr/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  page.on('console', m => console.log(`[${m.type()}] ${m.text().slice(0, 300)}`));
  page.on('pageerror', e => console.log(`[pageerror] ${e.message}`));
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__report !== undefined);
  const report = await page.evaluate(() => window.__report);
  const debug = await page.evaluate(() => window.__debug);
  const htmlAfter = await page.evaluate(() => window.__htmlAfter);
  console.log('---DEBUG---');
  for (const d of debug) console.log(d);
  console.log('---HTML_AFTER (re-wrap)---');
  console.log(htmlAfter);
  let failed = 0;
  for (const r of report) {
    if (r.ok) console.log(`OK   ${r.id}  stored="${r.expected}"  found="${r.found}"  off=${r.storedStart}..${r.storedEnd}`);
    else { failed++; console.log(`FAIL ${r.id}  stored="${r.expected}"  found="${r.found}"  off=${r.storedStart}..${r.storedEnd}`); }
  }
  console.log(`---SUMMARY--- ${report.length - failed}/${report.length} passed`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });