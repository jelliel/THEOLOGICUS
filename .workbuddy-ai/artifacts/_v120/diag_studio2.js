const { chromium } = require('playwright');
const CHROME = 'C:/Users/toshr/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });

  // Seed the unlock token BEFORE any script runs, exactly as the app stores it.
  await page.addInitScript(() => {
    localStorage.setItem('theologicus_remember', JSON.stringify({
      v: 1, mode: 'admin', exp: Date.now() + 7*86400000,
      tok: 'ca9cc135dea09c84e670f62659826f1d9d76a633e421cdc54c67ffa20b3a1a96'
    }));
  });

  await page.goto('http://127.0.0.1:8765/THEOLOGICUS.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  const before = await page.evaluate(() => {
    const b = document.getElementById('open-studio-modal');
    const ov = document.getElementById('auth-overlay');
    const r = b.getBoundingClientRect();
    return {
      overlayDisplay: ov ? getComputedStyle(ov).display : 'absent',
      buttonVisible: !!(b.offsetWidth || b.offsetHeight),
      onclickIsFunction: typeof b.onclick === 'function',
      topElementAtButtonCentre: (document.elementFromPoint(r.left + r.width/2, r.top + r.height/2) || {}).id
    };
  });
  console.log('=== BEFORE CLICK (unlocked) ===');
  console.log(JSON.stringify(before, null, 2));

  await page.click('#open-studio-modal', { timeout: 5000 });
  await page.waitForTimeout(600);

  const after = await page.evaluate(() => {
    const m = document.getElementById('studio-modal');
    return { active: m.classList.contains('active'), display: getComputedStyle(m).display };
  });
  console.log('=== AFTER CLICK (unlocked) ===');
  console.log(JSON.stringify(after, null, 2));
  console.log('=== ERRORS (' + errors.length + ') ===');
  errors.slice(0, 10).forEach(e => console.log(e));
  await browser.close();
})();
