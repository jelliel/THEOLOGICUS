const { chromium } = require('playwright');
const CHROME = 'C:/Users/toshr/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe';

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: CHROME });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.addInitScript(() => {
    localStorage.setItem('theologicus_remember', JSON.stringify({
      v: 1, mode: 'admin', exp: Date.now() + 7*86400000,
      tok: 'ca9cc135dea09c84e670f62659826f1d9d76a633e421cdc54c67ffa20b3a1a96'
    }));
  });
  await page.goto('http://127.0.0.1:8765/THEOLOGICUS.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);

  const st = await page.evaluate(() => {
    const ov = document.getElementById('auth-overlay');
    const cs = getComputedStyle(ov);
    return {
      overlayClass: ov.className,
      overlayInlineStyle: ov.getAttribute('style'),
      overlayDisplayCss: cs.display,
      overlayZ: cs.zIndex,
      rememberRaw: localStorage.getItem('theologicus_remember'),
      bodyLocked: document.body.className
    };
  });
  console.log(JSON.stringify(st, null, 2));
  await browser.close();
})();
